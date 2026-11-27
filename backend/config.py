"""
Sakuga4K Cloud Configuration & Pipeline Defaults (v1.1.0 Turbo)
"""

import os
import sys

ENGINE_VERSION = "1.1.0"

# Workspace directories in Colab (env-overridable for local verification)
BASE_DIR = os.environ.get("SAKUGA4K_WORKSPACE", "/content/sakuga_workspace")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
FRAMES_DIR = os.path.join(BASE_DIR, "frames")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
MODELS_DIR = os.environ.get("SAKUGA4K_MODELS_DIR", "/content/models")

# Unified Google Drive output sync
DRIVE_MOUNT_POINT = "/content/drive/MyDrive"
DRIVE_OUTPUT_DIR = os.path.join(DRIVE_MOUNT_POINT, "Sakuga4K_Upscaled")

# FFmpeg Quality Parameters
DEFAULT_CRF = 16  # Visually lossless anime encoding standard
FFMPEG_PRESET = "veryfast"  # High-speed reassembly at identical CRF 16 visual fidelity
PIX_FMT = "yuv420p"
POP_UNSHARP_FILTER = "unsharp=5:5:0.8:3:3:0.4"  # Universal Medium Pop line-art sharpness
ALWAYS_APPLY_POP_FILTER = True

# v1.1 Auto-Batch Prober Guardrails (caps peak driver VRAM at 75% to prevent OOM spikes)
VRAM_TARGET_UTILIZATION = 0.75
MAX_AUTO_BATCH_SIZE = 6

# Allowed model presets matching contracts.json
ALLOWED_PRESETS = {"animevideov3", "animesharp", "realcugan_pop", "anime6b"}

for _workspace_dir in (UPLOAD_DIR, FRAMES_DIR, OUTPUT_DIR, MODELS_DIR):
    try:
        os.makedirs(_workspace_dir, exist_ok=True)
    except OSError as exc:
        # Defer hard failure to runtime job execution outside writable Colab roots
        print(
            f"[Sakuga4K Config] Warning: skipped directory init ({type(exc).__name__})",
            file=sys.stderr,
            flush=True,
        )
