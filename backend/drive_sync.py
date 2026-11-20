"""
Sakuga4K Google Drive Auto-Sync & Batch Archive Engine
"""

import os
import shutil
import zipfile
from typing import Optional, List
from config import DRIVE_MOUNT_POINT, DRIVE_OUTPUT_DIR

class DriveSyncManager:
    """Manages persistent exports and batch archive streaming."""

    @staticmethod
    def is_drive_mounted() -> bool:
        """Verifies if Google Drive is mounted in the Colab runtime."""
        return os.path.exists(DRIVE_MOUNT_POINT) and os.path.isdir(DRIVE_MOUNT_POINT)

    @classmethod
    def sync_to_drive(cls, source_file_path: str, filename: str) -> Optional[str]:
        """Copies completed 4K clip into Google Drive MyDrive/Anime_4K_Output."""
        if not cls.is_drive_mounted():
            return None

        try:
            os.makedirs(DRIVE_OUTPUT_DIR, exist_ok=True)
            safe_name = os.path.basename(filename)
            destination = os.path.join(DRIVE_OUTPUT_DIR, safe_name)

            shutil.copy2(source_file_path, destination)
            return destination
        except Exception:
            return None

    @staticmethod
    def create_batch_zip(source_files: List[str], zip_dest_path: str) -> bool:
        """Bundles a batch of completed 4K clips into a single .zip archive."""
        try:
            os.makedirs(os.path.dirname(zip_dest_path), exist_ok=True)
            with zipfile.ZipFile(zip_dest_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for file_path in source_files:
                    if os.path.exists(file_path):
                        arcname = os.path.basename(file_path)
                        zf.write(file_path, arcname=arcname)
            return True
        except Exception:
            return False

drive_sync = DriveSyncManager()
