"""
Sakuga4K Cloud Engine — FastAPI Backend for Google Colab (v1.1.0 Turbo)
Implements contracts.json v1.1.0 for Auto-Batched FP16 Anime Video Upscaling
"""

import os
import re
import sys
import uuid
import json
import time
import zipfile
import asyncio
import shutil
import threading
from typing import Dict, Any, Optional, List

# Ensure backend directory is in sys.path for direct submodule imports
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse

from config import (
    ENGINE_VERSION,
    UPLOAD_DIR,
    OUTPUT_DIR,
    DRIVE_MOUNT_POINT,
    DRIVE_OUTPUT_DIR,
    ALLOWED_PRESETS,
)
from models import model_manager
from video_processor import VideoProcessor, ClipCancelledError

app = FastAPI(
    title="Sakuga4K Cloud Engine",
    version=ENGINE_VERSION,
    description="High-speed decoupled PyTorch FP16 anime video upscaler for Google Colab",
)

# CORS Middleware allowing direct browser-to-Colab uploads from Vercel
# allow_credentials must be False when allow_origins is ["*"] per W3C CORS specification
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_RESOLUTIONS = {"2k", "4k"}
MAX_JOB_HISTORY = 100

# Single-slot GPU semaphore prevents parallel uploads from colliding in VRAM
_gpu_semaphore: Optional[asyncio.Semaphore] = None
_gpu_semaphore_loop: Optional[asyncio.AbstractEventLoop] = None
jobs: Dict[str, Dict[str, Any]] = {}
cancel_events: Dict[str, threading.Event] = {}


def _get_gpu_semaphore() -> asyncio.Semaphore:
    """Returns a single-slot GPU lock bound safely to the active asyncio event loop."""
    global _gpu_semaphore, _gpu_semaphore_loop
    loop = asyncio.get_running_loop()
    if _gpu_semaphore is None or _gpu_semaphore_loop is not loop:
        _gpu_semaphore = asyncio.Semaphore(1)
        _gpu_semaphore_loop = loop
    return _gpu_semaphore


def _public_job_payload(job: Dict[str, Any]) -> Dict[str, Any]:
    """Strips internal server filesystem paths before returning job telemetry (SEC-006)."""
    return {k: v for k, v in job.items() if k not in ("inputPath", "outputPath")}


def _sanitize_filename(raw_name: str) -> str:
    """Strips cross-platform paths, control chars, quotes, and Zip-Slip tokens (SEC-002)."""
    normalized = raw_name.replace("\\", "/")
    base = os.path.basename(normalized)
    cleaned = re.sub(r'[\x00-\x1f"\\/:*?<>|]', "_", base).strip()
    if not cleaned or cleaned in (".", ".."):
        return ""
    return cleaned[:180]


def _prune_old_jobs() -> None:
    """Caps in-memory job history to MAX_JOB_HISTORY and cleans evicted output files (AP-006)."""
    if len(jobs) < MAX_JOB_HISTORY:
        return
    evict_count = len(jobs) - MAX_JOB_HISTORY + 1
    removable_ids = [
        cid for cid, rec in jobs.items()
        if rec.get("status") in ("completed", "failed", "cancelled")
    ]
    for cid in removable_ids[:evict_count]:
        rec = jobs.pop(cid, None)
        cancel_events.pop(cid, None)
        if rec:
            out_path = rec.get("outputPath")
            if out_path and os.path.exists(out_path):
                try:
                    os.remove(out_path)
                except OSError as exc:
                    print(f"[Sakuga4K Cleanup] Could not remove evicted output ({type(exc).__name__})", file=sys.stderr)


@app.get("/api/health")
async def get_health() -> Dict[str, Any]:
    """Endpoint matching contracts.json getHealth schema."""
    dev_info = model_manager.get_device_info()
    drive_mounted = os.path.exists(DRIVE_MOUNT_POINT)

    return {
        "status": "online",
        "gpuModel": dev_info["gpuModel"],
        "vramTotalMB": dev_info["vramTotalMB"],
        "vramFreeMB": dev_info["vramFreeMB"],
        "activePreset": model_manager.active_preset,
        "driveMounted": drive_mounted,
        "engineVersion": ENGINE_VERSION,
    }


@app.post("/api/upload")
async def upload_clip(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    preset: str = Form("animevideov3"),
    resolution: str = Form("2k"),
) -> Dict[str, Any]:
    """Endpoint matching contracts.json uploadClip schema with strict upload sanitization."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename missing")

    safe_filename = _sanitize_filename(file.filename)
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    if preset not in ALLOWED_PRESETS:
        raise HTTPException(status_code=400, detail="Invalid model preset")

    norm_res = resolution.strip().lower()
    if norm_res not in ALLOWED_RESOLUTIONS:
        raise HTTPException(status_code=400, detail="Invalid target resolution")

    clip_id = str(uuid.uuid4())
    input_path = os.path.join(UPLOAD_DIR, f"{clip_id}_{safe_filename}")
    upload_succeeded = False

    try:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = os.path.getsize(input_path)
        if file_size <= 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        meta = VideoProcessor.probe_video_metadata(input_path)
        upload_succeeded = True
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[Sakuga4K Upload] Storage or probe failure ({type(exc).__name__})", file=sys.stderr, flush=True)
        raise HTTPException(status_code=500, detail="Failed to ingest uploaded video")
    finally:
        await file.close()
        if not upload_succeeded and os.path.exists(input_path):
            try:
                os.remove(input_path)
            except OSError as rm_err:
                print(f"[Sakuga4K Upload] Partial file cleanup skipped ({type(rm_err).__name__})", file=sys.stderr)

    orig_w, orig_h = meta.get("width", 0), meta.get("height", 0)
    orig_res_label = f"{orig_w}x{orig_h}" if (orig_w > 0 and orig_h > 0) else "Auto"
    target_w, target_h = VideoProcessor.compute_target_dimensions(orig_w, orig_h, norm_res)
    target_res_label = f"{target_w}x{target_h}"
    total_frames = meta.get("total_frames", 0) or 120
    duration_sec = meta.get("duration_seconds", 0.0) or round(total_frames / 24.0, 2)

    _prune_old_jobs()

    job_record = {
        "id": clip_id,
        "name": safe_filename,
        "sizeBytes": file_size,
        "durationSeconds": duration_sec,
        "originalResolution": orig_res_label,
        "targetResolution": target_res_label,
        "actualOutputResolution": target_res_label,
        "modelPreset": preset,
        "resolution": norm_res,
        "status": "queued",
        "stage": "queued",
        "progressPercent": 0,
        "currentFrame": 0,
        "totalFrames": total_frames,
        "etaSeconds": round(total_frames * 0.16, 1),
        "activeBatchSize": 0,
        "throughputFps": 0.0,
        "vramUsedMB": 0,
        "downloadUrl": f"/api/download/{clip_id}",
        "drivePath": None,
        "driveError": None,
        "error": None,
        "inputPath": input_path,
    }

    jobs[clip_id] = job_record
    cancel_events[clip_id] = threading.Event()
    background_tasks.add_task(process_video_job, clip_id)

    return _public_job_payload(job_record)


@app.post("/api/cancel/{clip_id}")
async def cancel_clip(clip_id: str) -> Dict[str, str]:
    """Signals cancellation for queued or actively processing clips."""
    if clip_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    event = cancel_events.get(clip_id)
    if event:
        event.set()

    job = jobs[clip_id]
    if job["status"] == "queued":
        job["status"] = "cancelled"
        job["stage"] = "cancelled"

    return {"id": clip_id, "status": str(job["status"])}


async def process_video_job(clip_id: str) -> None:
    """Runs serialized GPU inference, live SSE telemetry updates, and Drive sync."""
    if clip_id not in jobs:
        return

    job = jobs[clip_id]
    cancel_event = cancel_events.get(clip_id)

    try:
        async with _get_gpu_semaphore():
            if cancel_event and cancel_event.is_set():
                job["status"] = "cancelled"
                job["stage"] = "cancelled"
                return

            if not shutil.which("ffmpeg"):
                raise RuntimeError("FFmpeg binary is required for video processing")

            job["status"] = "processing"
            job["stage"] = "extracting"
            res_suffix = "2K" if job.get("resolution") == "2k" else "4K"
            output_filename = f"{os.path.splitext(job['name'])[0]}_{res_suffix}.mp4"
            os.makedirs(OUTPUT_DIR, exist_ok=True)
            output_path = os.path.join(OUTPUT_DIR, f"{clip_id}_{output_filename}")

            def on_telemetry(payload: Dict[str, Any]) -> None:
                for key in (
                    "stage",
                    "originalResolution",
                    "actualOutputResolution",
                    "currentFrame",
                    "progressPercent",
                    "etaSeconds",
                    "activeBatchSize",
                    "throughputFps",
                    "vramUsedMB",
                ):
                    if key in payload and payload[key] is not None:
                        job[key] = payload[key]
                if payload.get("totalFrames", 0) > 0:
                    job["totalFrames"] = payload["totalFrames"]

            processed_path = await asyncio.to_thread(
                VideoProcessor.process_clip_rolling,
                clip_id,
                job["inputPath"],
                job["modelPreset"],
                None,
                job.get("resolution", "2k"),
                on_telemetry,
                cancel_event.is_set if cancel_event else None,
            )
            if os.path.exists(processed_path) and processed_path != output_path:
                shutil.move(processed_path, output_path)

            # Auto-sync to unified Google Drive folder only upon verified copy success
            drive_public_path = None
            if os.path.exists(DRIVE_MOUNT_POINT):
                job["stage"] = "syncing"
                local_drive_dest = os.path.join(DRIVE_OUTPUT_DIR, output_filename)
                try:
                    os.makedirs(DRIVE_OUTPUT_DIR, exist_ok=True)
                    shutil.copyfile(output_path, local_drive_dest)
                    drive_public_path = f"MyDrive/Sakuga4K_Upscaled/{output_filename}"
                    print(f"[Sakuga4K Drive] Synced {drive_public_path}", flush=True)
                except Exception as drive_err:
                    print(f"[Sakuga4K Drive] Sync failed ({type(drive_err).__name__})", file=sys.stderr, flush=True)
                    job["driveError"] = "Drive sync failed"

            job["status"] = "completed"
            job["stage"] = "completed"
            job["progressPercent"] = 100
            job["etaSeconds"] = 0.0
            job["outputPath"] = output_path
            job["drivePath"] = drive_public_path

    except ClipCancelledError:
        job["status"] = "cancelled"
        job["stage"] = "cancelled"
        job["error"] = None
    except Exception as exc:
        print(f"[Sakuga4K Error] Clip {clip_id} failed ({type(exc).__name__})", file=sys.stderr, flush=True)
        job["status"] = "failed"
        job["stage"] = "failed"
        # Sanitized error envelope (SEC-006: never expose local paths or tracebacks)
        job["error"] = f"Processing failed ({type(exc).__name__})"
    finally:
        # Release raw upload from workspace disk immediately after processing finishes
        input_path = job.get("inputPath")
        if input_path and os.path.exists(input_path):
            try:
                os.remove(input_path)
            except OSError as rm_err:
                print(f"[Sakuga4K Cleanup] Could not remove input upload ({type(rm_err).__name__})", file=sys.stderr)
        cancel_events.pop(clip_id, None)


@app.get("/api/status/{clip_id}")
async def get_clip_status(clip_id: str) -> Dict[str, Any]:
    """Returns sanitized JSON snapshot of a clip's live processing telemetry."""
    if clip_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return _public_job_payload(jobs[clip_id])


@app.get("/api/progress/{clip_id}")
async def get_progress_stream(clip_id: str):
    """Server-Sent Events (SSE) streaming live telemetry to studio frontend."""
    if clip_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator():
        while True:
            job = jobs.get(clip_id)
            if not job:
                break
            yield {"event": "progress", "data": json.dumps(_public_job_payload(job))}

            if job["status"] in ("completed", "failed", "cancelled"):
                break
            await asyncio.sleep(0.15)

    return EventSourceResponse(event_generator())


@app.get("/api/download/{clip_id}")
async def download_clip(clip_id: str):
    """Streams the completed MP4 file with strict attachment headers."""
    if clip_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[clip_id]
    output_path = job.get("outputPath")
    if not output_path or not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="Output file not ready")

    res_suffix = "2K" if job.get("resolution") == "2k" else "4K"
    safe_base = _sanitize_filename(os.path.splitext(job["name"])[0]) or clip_id
    download_name = f"{safe_base}_{res_suffix}.mp4"
    return FileResponse(
        output_path,
        media_type="video/mp4",
        filename=download_name,
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


def _build_batch_archive(completed_jobs: List[Dict[str, Any]], zip_path: str) -> None:
    """Writes unique ZIP entries off the asyncio event loop after removing stale archives."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for fname in os.listdir(OUTPUT_DIR):
        if fname.startswith("Sakuga4K_Batch_") and fname.endswith(".zip"):
            try:
                os.remove(os.path.join(OUTPUT_DIR, fname))
            except OSError as rm_err:
                print(f"[Sakuga4K ZIP] Cleanup skipped ({type(rm_err).__name__})", file=sys.stderr)

    used_names = set()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for idx, job_item in enumerate(completed_jobs, start=1):
            res_suffix = "2K" if job_item.get("resolution") == "2k" else "4K"
            safe_base = _sanitize_filename(os.path.splitext(job_item["name"])[0]) or f"clip_{idx}"
            arcname = f"{safe_base}_{res_suffix}.mp4"
            if arcname in used_names:
                arcname = f"{safe_base}_{idx}_{res_suffix}.mp4"
            used_names.add(arcname)
            zipf.write(job_item["outputPath"], arcname=arcname)


@app.get("/api/download-zip")
async def download_batch_zip():
    """Bundles completed clips into one archive off the event loop."""
    completed_jobs = [
        j for j in jobs.values()
        if j.get("status") == "completed" and j.get("outputPath") and os.path.exists(j["outputPath"])
    ]
    if not completed_jobs:
        raise HTTPException(status_code=404, detail="No completed clips available to bundle")

    zip_filename = f"Sakuga4K_Batch_{int(time.time())}_{uuid.uuid4().hex[:6]}.zip"
    zip_path = os.path.join(OUTPUT_DIR, zip_filename)

    try:
        await asyncio.to_thread(_build_batch_archive, completed_jobs, zip_path)
    except Exception as exc:
        print(f"[Sakuga4K ZIP] Archive build error ({type(exc).__name__})", file=sys.stderr, flush=True)
        raise HTTPException(status_code=500, detail="Failed to build batch ZIP archive")

    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=zip_filename,
        headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'},
    )
