"""
Sakuga4K PyTorch FP16 Neural Inference Engine (v1.1.0 Turbo)
Real-Time Batched Anime Line-Art Super-Resolution with Live Hardware VRAM Auto-Probing
"""

import gc
import os
import sys
import urllib.request
from typing import Dict, Any, Optional, List, Tuple

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

# Ensure current directory is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from archs import SRVGGNetCompact, RRDBNet
from config import MODELS_DIR, VRAM_TARGET_UTILIZATION, MAX_AUTO_BATCH_SIZE

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
USE_FP16 = torch.cuda.is_available()

if torch.cuda.is_available():
    torch.backends.cudnn.benchmark = True

# Public weights download mirrors
MODEL_CONFIGS: Dict[str, Dict[str, Any]] = {
    "animevideov3": {
        "arch": "srvgg",
        "filename": "realesr-animevideov3.pth",
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth",
        "kwargs": {"num_in_ch": 3, "num_out_ch": 3, "num_feat": 64, "num_conv": 16, "upscale": 4, "act_type": "prelu"},
    },
    "realcugan_pop": {
        "arch": "srvgg",
        "filename": "realesr-animevideov3.pth",
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth",
        "kwargs": {"num_in_ch": 3, "num_out_ch": 3, "num_feat": 64, "num_conv": 16, "upscale": 4, "act_type": "prelu"},
    },
    "animesharp": {
        "arch": "rrdb_6b",
        "filename": "RealESRGAN_x4plus_anime_6B.pth",
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth",
        "kwargs": {"num_in_ch": 3, "num_out_ch": 3, "scale": 4, "num_feat": 64, "num_block": 6, "num_grow_ch": 32},
    },
    "anime6b": {
        "arch": "rrdb_6b",
        "filename": "RealESRGAN_x4plus_anime_6B.pth",
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth",
        "kwargs": {"num_in_ch": 3, "num_out_ch": 3, "scale": 4, "num_feat": 64, "num_block": 6, "num_grow_ch": 32},
    },
}


class AnimeUpscaleModelManager:
    """Manages neural weights, batched FP16 tensor execution, and live VRAM auto-probing."""

    def __init__(self, models_dir: str = MODELS_DIR):
        self.models_dir = models_dir
        self.loaded_models: Dict[str, nn.Module] = {}
        self.active_preset: str = "animevideov3"
        # Cache safe batch sizes per (width, height, preset) so mixed clips never collide
        self._batch_size_cache: Dict[Tuple[int, int, str], int] = {}

    def get_driver_vram_mb(self) -> Tuple[int, int]:
        """Returns (used_vram_mb, total_vram_mb) using physical driver memory counters."""
        if not torch.cuda.is_available():
            return (0, 0)

        try:
            free_bytes, total_bytes = torch.cuda.mem_get_info(0)
            used_mb = max(0, (total_bytes - free_bytes) // (1024 * 1024))
            total_mb = total_bytes // (1024 * 1024)
            return (used_mb, total_mb)
        except Exception as exc:
            print(f"[Sakuga4K VRAM] mem_get_info fallback ({type(exc).__name__})", file=sys.stderr, flush=True)
            props = torch.cuda.get_device_properties(0)
            total_mb = props.total_memory // (1024 * 1024)
            reserved_mb = torch.cuda.memory_reserved(0) // (1024 * 1024)
            return (reserved_mb, total_mb)

    def reset_vram_cache(self) -> None:
        """Releases temporary allocations between clips to eliminate fragmentation cliffs."""
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()

    def get_device_info(self) -> Dict[str, Any]:
        """Returns hardware telemetry matching HealthStatus schema."""
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            used_mb, vram_total = self.get_driver_vram_mb()
            vram_free = max(0, vram_total - used_mb)
        else:
            gpu_name = "CPU Emulation (No CUDA)"
            vram_total = 0
            vram_free = 0

        return {
            "gpuModel": gpu_name,
            "vramTotalMB": vram_total,
            "vramFreeMB": vram_free,
            "fp16Active": USE_FP16,
        }

    def _ensure_weights(self, preset: str) -> Optional[str]:
        """Downloads weights to models_dir if missing."""
        cfg = MODEL_CONFIGS.get(preset)
        if not cfg:
            return None

        os.makedirs(self.models_dir, exist_ok=True)
        target_path = os.path.join(self.models_dir, cfg["filename"])
        if not os.path.exists(target_path) or os.path.getsize(target_path) == 0:
            try:
                print(f"[Sakuga4K] Downloading weights for {preset}...", flush=True)
                urllib.request.urlretrieve(cfg["url"], target_path)
                print(f"[Sakuga4K] Cached weights for {preset}", flush=True)
            except Exception as exc:
                print(f"[Sakuga4K] Warning: Could not download {cfg['filename']}: {type(exc).__name__}", file=sys.stderr, flush=True)
                return None

        return target_path

    def load_model(self, preset: str = "animevideov3") -> nn.Module:
        """Instantiates and caches the requested PyTorch neural network in FP16 on GPU."""
        if preset in self.loaded_models:
            self.active_preset = preset
            return self.loaded_models[preset]

        cfg = MODEL_CONFIGS.get(preset, MODEL_CONFIGS["animevideov3"])

        if cfg["arch"] == "srvgg":
            model = SRVGGNetCompact(**cfg["kwargs"])
        elif cfg["arch"] == "rrdb_6b":
            model = RRDBNet(**cfg["kwargs"])
        else:
            model = SRVGGNetCompact(**MODEL_CONFIGS["animevideov3"]["kwargs"])

        weight_path = self._ensure_weights(preset)
        if weight_path and os.path.exists(weight_path):
            try:
                ckpt = torch.load(weight_path, map_location=DEVICE, weights_only=True)
                state_dict = ckpt.get("params_ema", ckpt.get("params", ckpt))
                model.load_state_dict(state_dict, strict=False)
                print(f"[Sakuga4K] Loaded neural weights into {preset} on {DEVICE}", flush=True)
            except Exception as exc:
                print(f"[Sakuga4K] Weight load exception for {preset}: {type(exc).__name__}", file=sys.stderr, flush=True)

        if USE_FP16:
            model = model.half()
        model = model.to(DEVICE)
        model.eval()

        self.loaded_models[preset] = model
        self.active_preset = preset
        return model

    def _tile_upscale(self, model: nn.Module, img: torch.Tensor, tile_size: int = 512, tile_pad: int = 16) -> torch.Tensor:
        """Tiled tensor inference to eliminate CUDA Out of Memory on large frames."""
        batch, channel, height, width = img.shape
        scale = getattr(model, "scale", getattr(model, "upscale", 4))
        output_height = height * scale
        output_width = width * scale
        output = torch.zeros((batch, channel, output_height, output_width), dtype=img.dtype, device=img.device)

        tiles_x = (width + tile_size - 1) // tile_size
        tiles_y = (height + tile_size - 1) // tile_size

        for yi in range(tiles_y):
            for xi in range(tiles_x):
                x1 = xi * tile_size
                x2 = min(x1 + tile_size, width)
                y1 = yi * tile_size
                y2 = min(y1 + tile_size, height)

                pad_x1 = max(0, x1 - tile_pad)
                pad_x2 = min(width, x2 + tile_pad)
                pad_y1 = max(0, y1 - tile_pad)
                pad_y2 = min(height, y2 + tile_pad)

                tile_in = img[:, :, pad_y1:pad_y2, pad_x1:pad_x2]
                tile_out = model(tile_in)

                out_x1 = (x1 - pad_x1) * scale
                out_x2 = out_x1 + (x2 - x1) * scale
                out_y1 = (y1 - pad_y1) * scale
                out_y2 = out_y1 + (y2 - y1) * scale

                output[:, :, y1 * scale : y2 * scale, x1 * scale : x2 * scale] = tile_out[:, :, out_y1:out_y2, out_x1:out_x2]

        return output

    def _estimate_initial_batch(self, width: int, height: int, preset: str, total_vram_mb: int) -> int:
        """Returns a calibrated initial batch probe target to minimize cuDNN re-benchmarking."""
        arch = MODEL_CONFIGS.get(preset, MODEL_CONFIGS["animevideov3"])["arch"]
        megapixels = (max(1, width) * max(1, height)) / 1_000_000.0
        vram_scale = max(0.5, total_vram_mb / 15360.0) if total_vram_mb > 0 else 1.0

        if arch == "rrdb_6b":
            if megapixels <= 0.65:
                base = 4
            elif megapixels <= 1.1:
                base = 2
            else:
                base = 1
        else:
            if megapixels <= 0.65:
                base = 6
            elif megapixels <= 1.1:
                base = 4
            elif megapixels <= 2.3:
                base = 3
            else:
                base = 1

        return max(1, min(MAX_AUTO_BATCH_SIZE, int(round(base * vram_scale))))

    def _probe_batch_fits(
        self,
        model: nn.Module,
        batch_size: int,
        width: int,
        height: int,
        target_w: int,
        target_h: int,
        budget_mb: int,
    ) -> Tuple[bool, int]:
        """Runs a single dry forward + GPU resize pass and measures physical VRAM utilization."""
        dummy_in: Optional[torch.Tensor] = None
        dummy_out: Optional[torch.Tensor] = None
        try:
            self.reset_vram_cache()
            dtype = torch.float16 if USE_FP16 else torch.float32
            dummy_in = torch.zeros((batch_size, 3, height, width), dtype=dtype, device=DEVICE)
            with torch.inference_mode():
                dummy_out = model(dummy_in)
                if dummy_out.shape[-2] != target_h or dummy_out.shape[-1] != target_w:
                    dummy_out = F.interpolate(dummy_out, size=(target_h, target_w), mode="bilinear", align_corners=False)
                if torch.cuda.is_available():
                    torch.cuda.synchronize()
            used_mb, _ = self.get_driver_vram_mb()
            return (used_mb <= budget_mb, used_mb)
        except torch.cuda.OutOfMemoryError:
            return (False, budget_mb + 1)
        finally:
            del dummy_in, dummy_out
            self.reset_vram_cache()

    def determine_optimal_batch_size(
        self,
        width: int,
        height: int,
        target_w: int,
        target_h: int,
        preset: str,
    ) -> int:
        """
        Determines the safest high-throughput batch size for (width, height, preset).
        Enforces strict per-signature caching and a 75% physical VRAM utilization cap.
        """
        if not torch.cuda.is_available():
            return 1

        self.load_model(preset)
        cache_key = (width, height, preset)
        _, total_vram_mb = self.get_driver_vram_mb()
        budget_mb = int(total_vram_mb * VRAM_TARGET_UTILIZATION) if total_vram_mb > 0 else 11520

        if cache_key in self._batch_size_cache:
            cached_batch = self._batch_size_cache[cache_key]
            used_now, _ = self.get_driver_vram_mb()
            if used_now <= int(total_vram_mb * 0.5):
                return cached_batch

        model = self.loaded_models[preset]
        candidate = self._estimate_initial_batch(width, height, preset, total_vram_mb)

        # Verify starting guess; step down if over 75% VRAM budget
        fits, used_mb = self._probe_batch_fits(model, candidate, width, height, target_w, target_h, budget_mb)
        while not fits and candidate > 1:
            candidate -= 1
            fits, used_mb = self._probe_batch_fits(model, candidate, width, height, target_w, target_h, budget_mb)

        # If substantial headroom remains (<48% VRAM used), probe upward safely up to MAX_AUTO_BATCH_SIZE
        while fits and candidate < MAX_AUTO_BATCH_SIZE and used_mb < int(total_vram_mb * 0.48):
            next_candidate = candidate + 1
            next_fits, next_used_mb = self._probe_batch_fits(model, next_candidate, width, height, target_w, target_h, budget_mb)
            if not next_fits:
                break
            candidate = next_candidate
            used_mb = next_used_mb

        self._batch_size_cache[cache_key] = candidate
        print(
            f"[Sakuga4K Auto-Prober] {width}x{height} ({preset}) -> Locked Batch={candidate} (Peak probe: {used_mb}/{total_vram_mb} MB)",
            flush=True,
        )
        return candidate

    def update_cached_batch_size(self, width: int, height: int, preset: str, batch_size: int) -> None:
        """Downgrades cached batch limit after a live mid-clip self-healing OOM fallback."""
        self._batch_size_cache[(width, height, preset)] = max(1, batch_size)

    def _run_forward_and_resize(
        self,
        model: nn.Module,
        imgs_bgr: List[np.ndarray],
        target_w: int,
        target_h: int,
        use_tiling: bool = False,
    ) -> List[np.ndarray]:
        """Executes batched PyTorch inference and CUDA-native tensor resizing inside VRAM."""
        batch_tensor: Optional[torch.Tensor] = None
        out_batch: Optional[torch.Tensor] = None
        try:
            tensors = [
                torch.from_numpy(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).permute(2, 0, 1).float() / 255.0
                for img in imgs_bgr
            ]
            batch_tensor = torch.stack(tensors, dim=0)
            if USE_FP16:
                batch_tensor = batch_tensor.half()
            batch_tensor = batch_tensor.to(DEVICE)

            with torch.inference_mode():
                out_batch = (
                    self._tile_upscale(model, batch_tensor, tile_size=512, tile_pad=16)
                    if use_tiling
                    else model(batch_tensor)
                )
                if out_batch.shape[-2] != target_h or out_batch.shape[-1] != target_w:
                    out_batch = F.interpolate(out_batch, size=(target_h, target_w), mode="bilinear", align_corners=False)

                out_np_batch = (out_batch.clamp(0.0, 1.0) * 255.0).byte().cpu().permute(0, 2, 3, 1).numpy()

            return [cv2.cvtColor(arr, cv2.COLOR_RGB2BGR) for arr in out_np_batch]
        finally:
            del batch_tensor, out_batch

    def upscale_frames_batch(
        self,
        imgs_bgr: List[np.ndarray],
        preset: str,
        target_w: int,
        target_h: int,
    ) -> Tuple[List[np.ndarray], int]:
        """
        Upscales a micro-batch directly on GPU with self-healing recursive step-down on OOM.
        Returns (upscaled_bgr_frames, safe_effective_batch_size).
        """
        if not imgs_bgr:
            return ([], 1)

        model = self.load_model(preset)
        try:
            results = self._run_forward_and_resize(model, imgs_bgr, target_w, target_h, use_tiling=False)
            return (results, len(imgs_bgr))
        except torch.cuda.OutOfMemoryError:
            self.reset_vram_cache()
            if len(imgs_bgr) > 1:
                mid = max(1, len(imgs_bgr) // 2)
                print(f"[Sakuga4K GPU] VRAM spike caught — stepping batch down to {mid} and retrying...", flush=True)
                left_imgs, left_eff = self.upscale_frames_batch(imgs_bgr[:mid], preset, target_w, target_h)
                right_imgs, right_eff = self.upscale_frames_batch(imgs_bgr[mid:], preset, target_w, target_h)
                return (left_imgs + right_imgs, min(left_eff, right_eff))

            print("[Sakuga4K GPU] Single-frame VRAM ceiling reached — switching to 512px tiled mode...", flush=True)
            tiled_results = self._run_forward_and_resize(model, imgs_bgr, target_w, target_h, use_tiling=True)
            return (tiled_results, 1)

    def upscale_tensor(self, img_tensor: torch.Tensor, preset: str = "animevideov3") -> torch.Tensor:
        """
        Runs neural inference on a single RGB image tensor [1, 3, H, W] in range [0, 1].
        Preserved for diagnostic cell compatibility.
        """
        model = self.load_model(preset)
        output: Optional[torch.Tensor] = None
        try:
            with torch.inference_mode():
                if USE_FP16:
                    img_tensor = img_tensor.half()
                img_tensor = img_tensor.to(DEVICE)

                try:
                    output = model(img_tensor)
                except torch.cuda.OutOfMemoryError:
                    self.reset_vram_cache()
                    print("[Sakuga4K GPU] Direct inference VRAM limit reached - switching to tiled tensor processing...", flush=True)
                    output = self._tile_upscale(model, img_tensor, tile_size=512, tile_pad=16)

                return output.float().clamp(0.0, 1.0).cpu()
        finally:
            del img_tensor, output


model_manager = AnimeUpscaleModelManager()
