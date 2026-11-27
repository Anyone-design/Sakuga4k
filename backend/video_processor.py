"""
Sakuga4K Rolling Frame FFmpeg Engine (v1.1.0 Turbo)
Extracts frames, executes auto-batched FP16 neural upscale + CUDA resizing,
applies universal Medium Pop sharpness, purges raw frames, and reassembles faststart MP4.
"""

import os
import sys
import time
import shutil
import subprocess
from typing import Callable, Optional, Dict, Any, Tuple

import cv2

# Ensure backend directory is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from config import (
    FRAMES_DIR,
    OUTPUT_DIR,
    DEFAULT_CRF,
    FFMPEG_PRESET,
    PIX_FMT,
    POP_UNSHARP_FILTER,
    ALWAYS_APPLY_POP_FILTER,
)
from models import model_manager


class ClipCancelledError(Exception):
    """Raised when an active upscale job is cancelled by the studio operator."""


class VideoProcessor:
    """Processes video clips with micro-batched GPU telemetry and strict cleanup."""

    @staticmethod
    def probe_video_metadata(input_path: str) -> Dict[str, Any]:
        """Reads true clip dimensions, FPS, total frames, and duration via OpenCV/ffprobe."""
        width = 0
        height = 0
        fps = 0.0
        total_frames = 0
        duration = 0.0

        cap = cv2.VideoCapture(input_path)
        try:
            if cap.isOpened():
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
                raw_fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
                if raw_fps > 0.0:
                    fps = raw_fps
                total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        finally:
            cap.release()

        if fps <= 0.0:
            fps = VideoProcessor.get_video_fps(input_path)
        if fps <= 0.0:
            fps = 24.0
        if total_frames > 0:
            duration = round(total_frames / fps, 2)

        return {
            "width": width,
            "height": height,
            "fps": fps,
            "total_frames": total_frames,
            "duration_seconds": duration,
        }

    @staticmethod
    def get_video_fps(input_path: str) -> float:
        """Probes video framerate via ffprobe using parameterized args (SEC-003)."""
        cmd = [
            "ffprobe",
            "-v", "0",
            "-of", "csv=p=0",
            "-select_streams", "v:0",
            "-show_entries", "stream=r_frame_rate",
            input_path,
        ]
        try:
            output = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, shell=False).decode().strip()
            if "/" in output:
                num, den = output.split("/")
                den_val = float(den)
                fps_val = float(num) / den_val if den_val > 0 else 0.0
            else:
                fps_val = float(output)
            return fps_val if fps_val > 0.0 else 24.0
        except Exception as exc:
            print(f"[Sakuga4K FFprobe] Defaulting FPS to 24.0 ({type(exc).__name__})", file=sys.stderr, flush=True)
            return 24.0

    @staticmethod
    def compute_target_dimensions(orig_w: int, orig_h: int, target_res: str) -> Tuple[int, int]:
        """Computes Vmake-standard mobile/desktop bounding box dimensions with modulo-2 parity."""
        short_dim = 1440 if target_res == "2k" else 2160
        long_cap = 2560 if target_res == "2k" else 3840

        if orig_w <= 0 or orig_h <= 0:
            return (long_cap, short_dim)

        if orig_w == orig_h:
            target_w, target_h = short_dim, short_dim
        elif orig_w > orig_h:
            target_h = short_dim
            target_w = int(round(orig_w * short_dim / orig_h))
            if target_w > long_cap:
                target_w = long_cap
                target_h = int(round(orig_h * long_cap / orig_w))
        else:
            target_w = short_dim
            target_h = int(round(orig_h * short_dim / orig_w))
            if target_h > long_cap:
                target_h = long_cap
                target_w = int(round(orig_w * long_cap / orig_h))

        target_w -= target_w % 2
        target_h -= target_h % 2
        return (target_w, target_h)

    @classmethod
    def extract_frames(cls, input_path: str, clip_frames_dir: str) -> int:
        """Extracts rolling PNG frames from input video."""
        os.makedirs(clip_frames_dir, exist_ok=True)
        out_pattern = os.path.join(clip_frames_dir, "frame_%06d.png")

        cmd = [
            "ffmpeg",
            "-y",
            "-i", input_path,
            "-qscale:v", "1",
            "-qmin", "1",
            out_pattern,
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=False, check=True)

        frames = [f for f in os.listdir(clip_frames_dir) if f.startswith("frame_") and f.endswith(".png")]
        return len(frames)

    @classmethod
    def reassemble_video(
        cls,
        frames_dir: str,
        audio_source_path: str,
        output_path: str,
        fps: float = 24.0,
        apply_pop_filter: bool = ALWAYS_APPLY_POP_FILTER,
    ) -> bool:
        """Reassembles upscaled frames into visually lossless faststart MP4 with universal Medium Pop."""
        frame_pattern = os.path.join(frames_dir, "frame_%06d.png")

        cmd = [
            "ffmpeg",
            "-y",
            "-framerate", str(fps),
            "-i", frame_pattern,
            "-i", audio_source_path,
            "-map", "0:v:0",
            "-map", "1:a:0?",
        ]

        if apply_pop_filter:
            cmd.extend(["-vf", POP_UNSHARP_FILTER])

        cmd.extend([
            "-c:v", "libx264",
            "-crf", str(DEFAULT_CRF),
            "-preset", FFMPEG_PRESET,
            "-pix_fmt", PIX_FMT,
            "-profile:v", "high",
            "-movflags", "+faststart",
            "-c:a", "aac",
            "-b:a", "192k",
            "-ar", "48000",
            "-ac", "2",
            "-shortest",
            output_path,
        ])
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=False)
        return res.returncode == 0

    @classmethod
    def _emit_telemetry(
        cls,
        progress_callback: Optional[Callable[[int, int], None]],
        telemetry_callback: Optional[Callable[[Dict[str, Any]], None]],
        payload: Dict[str, Any],
    ) -> None:
        """Dispatches progress telemetry safely without mutating processing execution."""
        if telemetry_callback:
            telemetry_callback(payload)
        if progress_callback and payload.get("totalFrames", 0) > 0:
            progress_callback(payload.get("currentFrame", 0), payload["totalFrames"])

    @classmethod
    def process_clip_rolling(
        cls,
        clip_id: str,
        input_path: str,
        preset: str = "animevideov3",
        progress_callback: Optional[Callable[[int, int], None]] = None,
        target_res: str = "2k",
        telemetry_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
        cancel_check: Optional[Callable[[], bool]] = None,
    ) -> str:
        """
        Executes v1.1 Turbo rolling frame upscale:
        1. Extract raw frames
        2. Auto-probe GPU VRAM for safe micro-batch sizing
        3. Run batched FP16 inference + CUDA tensor resize + mid-clip OOM step-down guard
        4. Fast reassembly with universal Medium Pop sharpness and mobile playback parity
        5. Rolling cleanup invariant: ALWAYS purge extracted PNGs
        """
        clip_frames_dir = os.path.join(FRAMES_DIR, clip_id)
        fps = cls.get_video_fps(input_path)
        apply_pop = ALWAYS_APPLY_POP_FILTER

        try:
            if cancel_check and cancel_check():
                raise ClipCancelledError("Clip processing cancelled before extraction")

            cls._emit_telemetry(
                progress_callback,
                telemetry_callback,
                {"stage": "extracting", "currentFrame": 0, "totalFrames": 0, "progressPercent": 1},
            )

            total_frames = cls.extract_frames(input_path, clip_frames_dir)
            if total_frames == 0:
                raise RuntimeError("No frames extracted from input video")

            if cancel_check and cancel_check():
                raise ClipCancelledError("Clip processing cancelled after extraction")

            frame_files = sorted([f for f in os.listdir(clip_frames_dir) if f.startswith("frame_") and f.endswith(".png")])
            if not frame_files:
                raise RuntimeError("No extracted frame files found")
            total_frames = len(frame_files)

            first_frame_path = os.path.join(clip_frames_dir, frame_files[0])
            sample_img = cv2.imread(first_frame_path, cv2.IMREAD_COLOR)
            if sample_img is None:
                raise RuntimeError("Failed to decode extracted video frame")

            orig_h, orig_w = sample_img.shape[:2]
            target_w, target_h = cls.compute_target_dimensions(orig_w, orig_h, target_res)
            actual_res_label = f"{target_w}x{target_h}"

            cls._emit_telemetry(
                progress_callback,
                telemetry_callback,
                {
                    "stage": "probing",
                    "originalResolution": f"{orig_w}x{orig_h}",
                    "actualOutputResolution": actual_res_label,
                    "currentFrame": 0,
                    "totalFrames": total_frames,
                    "progressPercent": 2,
                },
            )

            # Reset lingering VRAM before probing this clip's exact dimensions
            model_manager.reset_vram_cache()
            batch_size = model_manager.determine_optimal_batch_size(orig_w, orig_h, target_w, target_h, preset)

            t_infer_start = time.time()
            idx = 0

            while idx < total_frames:
                if cancel_check and cancel_check():
                    raise ClipCancelledError("Clip processing cancelled mid-upscale")

                batch_fnames = frame_files[idx : idx + batch_size]
                batch_paths = [os.path.join(clip_frames_dir, fn) for fn in batch_fnames]

                imgs_bgr = []
                valid_paths = []
                for fpath in batch_paths:
                    frame_bgr = cv2.imread(fpath, cv2.IMREAD_COLOR)
                    if frame_bgr is not None:
                        imgs_bgr.append(frame_bgr)
                        valid_paths.append(fpath)

                if imgs_bgr:
                    upscaled_imgs, effective_batch = model_manager.upscale_frames_batch(
                        imgs_bgr, preset, target_w, target_h
                    )

                    for out_path, out_bgr in zip(valid_paths, upscaled_imgs):
                        cv2.imwrite(out_path, out_bgr)

                    if effective_batch < len(imgs_bgr):
                        batch_size = effective_batch
                        model_manager.update_cached_batch_size(orig_w, orig_h, preset, batch_size)

                idx += len(batch_fnames)
                elapsed = max(0.001, time.time() - t_infer_start)
                throughput_fps = round(idx / elapsed, 2)
                remaining_frames = max(0, total_frames - idx)
                eta_seconds = round(remaining_frames / max(0.25, throughput_fps), 1)
                vram_used_mb, _ = model_manager.get_driver_vram_mb()

                # Scale upscale progress cleanly across 3%..96% so extraction/reassembly show movement
                pct = round(3.0 + (idx / total_frames) * 93.0, 1) if idx < total_frames else 96.0

                cls._emit_telemetry(
                    progress_callback,
                    telemetry_callback,
                    {
                        "stage": "upscaling",
                        "currentFrame": idx,
                        "totalFrames": total_frames,
                        "progressPercent": pct,
                        "etaSeconds": eta_seconds,
                        "activeBatchSize": batch_size,
                        "throughputFps": throughput_fps,
                        "vramUsedMB": vram_used_mb,
                        "actualOutputResolution": actual_res_label,
                    },
                )

                if idx == len(batch_fnames) or idx == total_frames or (idx % max(batch_size * 4, 10) == 0):
                    print(
                        f"[Sakuga4K v1.1 GPU] Frames {idx}/{total_frames} | {preset} | Batch {batch_size} | {throughput_fps} FPS | {actual_res_label} | VRAM: {vram_used_mb} MB",
                        flush=True,
                    )

            if cancel_check and cancel_check():
                raise ClipCancelledError("Clip processing cancelled before reassembly")

            cls._emit_telemetry(
                progress_callback,
                telemetry_callback,
                {
                    "stage": "reassembling",
                    "currentFrame": total_frames,
                    "totalFrames": total_frames,
                    "progressPercent": 97.0,
                    "etaSeconds": 1.5,
                    "activeBatchSize": batch_size,
                    "actualOutputResolution": actual_res_label,
                },
            )

            output_suffix = "2K" if target_res == "2k" else "4K"
            output_path = os.path.join(OUTPUT_DIR, f"{clip_id}_{output_suffix}.mp4")

            success = cls.reassemble_video(
                clip_frames_dir,
                input_path,
                output_path,
                fps,
                apply_pop_filter=apply_pop,
            )
            if not success:
                raise RuntimeError("FFmpeg reassembly failed")

            return output_path

        finally:
            model_manager.reset_vram_cache()
            if os.path.exists(clip_frames_dir):
                shutil.rmtree(clip_frames_dir, ignore_errors=True)


video_processor = VideoProcessor()
