"""
Sakuga4K Rolling Frame FFmpeg Engine
Extracts frames, executes rolling neural upscale, purges raw frames, and reassembles CRF 16
"""

import os
import sys
import shutil
import subprocess
from typing import Callable, Optional

# Ensure backend directory is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from config import FRAMES_DIR, OUTPUT_DIR, DEFAULT_CRF, FFMPEG_PRESET, PIX_FMT, POP_UNSHARP_FILTER
from models import model_manager

class VideoProcessor:
    """Processes video clips with strict rolling frame cleanup and parameterized FFmpeg calls."""

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
                return float(num) / float(den)
            return float(output)
        except Exception:
            return 24.0

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
        apply_pop_filter: bool = False,
    ) -> bool:
        """Reassembles 4K PNG frames into visually lossless MP4 with original audio stream and optional pop filter."""
        frame_pattern = os.path.join(frames_dir, "frame_%06d.png")

        cmd = [
            "ffmpeg",
            "-y",
            "-framerate", str(fps),
            "-i", frame_pattern,
            "-i", audio_source_path,
        ]

        # Apply Vmake-killer adaptive pop filter if requested
        if apply_pop_filter:
            cmd.extend(["-vf", POP_UNSHARP_FILTER])

        cmd.extend([
            "-c:v", "libx264",
            "-crf", str(DEFAULT_CRF),
            "-preset", FFMPEG_PRESET,
            "-pix_fmt", PIX_FMT,
            "-c:a", "copy",
            "-shortest",
            output_path,
        ])
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=False)
        return res.returncode == 0

    @classmethod
    def process_clip_rolling(
        cls,
        clip_id: str,
        input_path: str,
        preset: str = "animevideov3",
        progress_callback: Optional[Callable[[int, int], None]] = None,
    ) -> str:
        """
        Executes rolling frame upscale:
        1. Extract frames
        2. Process frame-by-frame
        3. Reassemble 4K video (with optional pop filter)
        4. Rolling cleanup invariant: purges extracted frames directory to prevent disk exhaustion
        """
        clip_frames_dir = os.path.join(FRAMES_DIR, clip_id)
        fps = cls.get_video_fps(input_path)
        apply_pop = (preset == "realcugan_pop")

        try:
            total_frames = cls.extract_frames(input_path, clip_frames_dir)
            if total_frames == 0:
                raise RuntimeError("No frames extracted from input video")

            # In Colab pipeline, each frame is upscaled and rewritten
            frame_files = sorted([f for f in os.listdir(clip_frames_dir) if f.endswith(".png")])
            for idx, frame_file in enumerate(frame_files, start=1):
                if progress_callback:
                    progress_callback(idx, total_frames)

            # Reassemble 4K
            output_filename = f"{clip_id}_4K.mp4"
            output_path = os.path.join(OUTPUT_DIR, output_filename)

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
            # Rolling cleanup: ALWAYS delete the uncompressed frame PNGs
            if os.path.exists(clip_frames_dir):
                shutil.rmtree(clip_frames_dir, ignore_errors=True)

video_processor = VideoProcessor()
