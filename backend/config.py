"""
Sakuga4K Cloud Configuration & Pipeline Defaults
"""

import os

# Workspace directories in Colab
BASE_DIR = "/content/sakuga_workspace"
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
FRAMES_DIR = os.path.join(BASE_DIR, "frames")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
MODELS_DIR = "/content/models"

# Google Drive output sync
DRIVE_MOUNT_POINT = "/content/drive/MyDrive"
DRIVE_OUTPUT_DIR = os.path.join(DRIVE_MOUNT_POINT, "Anime_4K_Output")

# FFmpeg Quality Parameters
DEFAULT_CRF = 16  # Visually lossless anime encoding standard
FFMPEG_PRESET = "slow"
PIX_FMT = "yuv420p"

# Allowed model presets matching contracts.json
ALLOWED_PRESETS = {"animevideov3", "animesharp", "anime6b"}

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(FRAMES_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)
