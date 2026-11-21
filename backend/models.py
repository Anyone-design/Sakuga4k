"""
Sakuga4K PyTorch FP16 Neural Inference Engine
Real-Time Anime Line-Art & Action Video Super-Resolution on Google Colab Nvidia GPU
"""

import os
import sys
import urllib.request
import torch
import torch.nn as nn
from typing import Dict, Any, Optional

# Ensure current directory is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from archs import SRVGGNetCompact, RRDBNet

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
USE_FP16 = torch.cuda.is_available()

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
    """Manages neural weights and FP16 half-precision tensor execution on GPU."""

    def __init__(self, models_dir: str = "/content/models"):
        self.models_dir = models_dir
        self.loaded_models: Dict[str, nn.Module] = {}
        self.active_preset: str = "animevideov3"

    def get_device_info(self) -> Dict[str, Any]:
        """Returns hardware telemetry for health check contract."""
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            vram_total = props.total_memory // (1024 * 1024)
            vram_free = (props.total_memory - torch.cuda.memory_allocated(0)) // (1024 * 1024)
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
                print(f"[Sakuga4K] Downloading weights for {preset}...")
                urllib.request.urlretrieve(cfg["url"], target_path)
                print(f"[Sakuga4K] Successfully cached {target_path}")
            except Exception as e:
                print(f"[Sakuga4K] Warning: Could not download {cfg['filename']}: {e}")
                return None

        return target_path

    def load_model(self, preset: str = "animevideov3") -> nn.Module:
        """Instantiates and caches the requested PyTorch neural network in FP16 on GPU."""
        if preset in self.loaded_models:
            self.active_preset = preset
            return self.loaded_models[preset]

        cfg = MODEL_CONFIGS.get(preset, MODEL_CONFIGS["animevideov3"])

        # Instantiate Architecture
        if cfg["arch"] == "srvgg":
            model = SRVGGNetCompact(**cfg["kwargs"])
        elif cfg["arch"] == "rrdb_6b":
            model = RRDBNet(**cfg["kwargs"])
        else:
            model = SRVGGNetCompact(**MODEL_CONFIGS["animevideov3"]["kwargs"])

        # Load Weights
        weight_path = self._ensure_weights(preset)
        if weight_path and os.path.exists(weight_path):
            try:
                ckpt = torch.load(weight_path, map_location=DEVICE, weights_only=True)
                state_dict = ckpt.get("params_ema", ckpt.get("params", ckpt))
                model.load_state_dict(state_dict, strict=False)
                print(f"[Sakuga4K] Loaded neural weights into {preset} on {DEVICE}")
            except Exception as e:
                print(f"[Sakuga4K] Weight load exception for {preset}: {e}")

        # Half-precision FP16 Tensor Core execution
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

                output[:, :, y1*scale:y2*scale, x1*scale:x2*scale] = tile_out[:, :, out_y1:out_y2, out_x1:out_x2]

        return output

    def upscale_tensor(self, img_tensor: torch.Tensor, preset: str = "animevideov3") -> torch.Tensor:
        """
        Runs neural inference on an RGB image tensor [1, 3, H, W] in range [0, 1].
        Executes in FP16 on Nvidia T4 GPU for maximum throughput.
        """
        model = self.load_model(preset)
        with torch.no_grad():
            if USE_FP16:
                img_tensor = img_tensor.half()
            img_tensor = img_tensor.to(DEVICE)

            try:
                output = model(img_tensor)
            except torch.cuda.OutOfMemoryError:
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                print("[Sakuga4K GPU] Direct inference VRAM limit reached - switching to tiled tensor processing...")
                output = self._tile_upscale(model, img_tensor, tile_size=512, tile_pad=16)

            output = output.float().clamp(0.0, 1.0)
            return output.cpu()

model_manager = AnimeUpscaleModelManager()
