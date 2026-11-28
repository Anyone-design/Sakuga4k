# 🌸 Sakuga4K — High-Craft Anime Video Upscaler Platform (v1.1.0 Turbo)

> **Native 2K/4K Neural Upscaling for Anime Video Editors (AMVs, TikToks, Reels) operating at $0.00/month.**  
> Decoupled architecture: Next.js 15+ App Router web studio + Ephemeral Google Colab Nvidia T4 GPU (Batched PyTorch FP16).

---

## ✨ What's New in v1.1 Turbo

- **Live Hardware VRAM Auto-Batch Prober:** Automatically benchmarks your clip resolution `(width, height, model)` against driver VRAM with a 75% utilization cap, per-signature caching for mixed queues, and recursive self-healing OOM fallback.
- **CUDA-Native Tensor Resizing:** Resizes super-resolved frames directly inside GPU VRAM via `torch.nn.functional.interpolate` (`torch.inference_mode()` + `cuDNN benchmark`), bypassing slow CPU resizing round-trips.
- **Universal Medium Pop + Veryfast CRF 16 Reassembly:** Crisp black line-art edge clarity baked cleanly across all 4 models with mobile-safe H.264/AAC `-movflags +faststart`.
- **Vmake-Standard Mobile & Desktop Bounds:** `2K • Mobile (1440p)` (`1440x1440`, `2560x1440`, `1440x2560`) plays reliably on phone galleries and messaging apps; `4K • Desktop (2160p)` scales up to `3840x2160`.
- **Responsive Studio & Live Telemetry:** Serialized GPU upload queue, active stage readouts, live Auto-Batch / FPS / VRAM pills, and backend cancellation support (`POST /api/cancel/{clip_id}`).
- **Permanent Google Drive Sync:** Completed cuts sync cleanly to `MyDrive/Sakuga4K_Upscaled/`.

---

## 🚀 Quickstart

### 1. Launch the Cloud GPU Backend (Google Colab)
1. Open [Sakuga4K_Colab_Engine.ipynb](notebooks/Sakuga4K_Colab_Engine.ipynb) in Google Colab.
2. Select **Runtime ➔ Run all** (~60 seconds).
3. The notebook mounts Google Drive (`MyDrive/Sakuga4K_Upscaled/`), primes neural weights, starts FastAPI v1.1, and prints your Cloudflare Quick Tunnel URL:
   ```
   https://xyz-random-name.trycloudflare.com
   ```

### 2. Connect the Web Studio
1. Open the Sakuga4K web application.
2. Click **Connect Colab** in the top navigation bar.
3. Paste your Cloudflare URL. The status indicator displays your live Nvidia GPU model and available VRAM.

### 3. Upscale Anime Cuts
1. Drag and drop single cuts or mixed-resolution batches (`.mp4`, `.mov`, `.mkv`, `.webm`).
2. Choose **2K • Mobile (1440p)** or **4K • Desktop (2160p)** and pick your neural model preset:
   - `Real-CUGAN Pro`: Punchy vibrant contours & OLED color depth (AMVs & Reels).
   - `AnimeVideo-v3`: Fastest temporally coherent motion smoothing (Sakuga action).
   - `AnimeSharp 4x`: Deep 6-block residual precision for close-ups, eyes, and line art.
   - `Anime 6B`: Retro 90s/2000s anime de-noiser & compression artifact eraser.
3. Click **Start Upscale**, monitor real-time Auto-Batch & FPS telemetry, and download individual MP4s, batch ZIPs, or open directly from Google Drive.

---

## 🛠️ Project Structure

```
Sakuga4k/
├── backend/
│   ├── main.py              # FastAPI server (GPU queue lock, SSE telemetry, cancel API)
│   ├── models.py            # Batched FP16 tensor engine & Live VRAM Auto-Prober
│   ├── video_processor.py   # FFmpeg rolling extractor, CUDA resize, CRF 16 reassembly
│   ├── archs.py             # Standalone SRVGGNetCompact & RRDBNet architectures
│   ├── drive_sync.py        # Google Drive auto-sync & batch ZIP archiver
│   ├── config.py            # Workspace paths, veryfast preset & VRAM guardrails
│   └── start_tunnel.sh      # Colab startup shell script
├── notebooks/
│   ├── Sakuga4K_Colab_Engine.ipynb         # 1-Click Master Colab Cloud Engine
│   ├── Sakuga4K_Standalone_Tester.ipynb    # Standalone v1.0 Testing Lab
│   └── Sakuga4K_v1.1_Standalone_Tester.ipynb # Standalone v1.1 Turbo Lab
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Responsive studio shell with Plus Jakarta Sans
│   │   ├── globals.css      # 3-layer surface hierarchy & mobile overflow guards
│   │   └── page.tsx         # Main studio stage, SSE telemetry & cancellation flow
│   ├── components/
│   │   ├── Header.tsx             # Live Cloudflare tunnel handshake & GPU VRAM pill
│   │   ├── Dropzone.tsx           # Multi-file drag-and-drop canvas
│   │   ├── QueueList.tsx          # Animated batch queue with status pills
│   │   ├── PresetSelector.tsx     # 4-engine neural preset selector
│   │   ├── ModelGuideModal.tsx    # Detailed neural model guide drawer
│   │   ├── ProgressVisualizer.tsx # Live stage, Auto-Batch, FPS & VRAM visualizer
│   │   └── ComparisonSlider.tsx   # Stationary Vmake split comparison slider
│   └── types/
│       └── contracts.ts     # Typed system contracts matching contracts.json
├── contracts.json           # API schema (v1.1.0) & mock fixtures
└── package.json             # Next.js 15, React 19, Framer Motion, Lucide
```

---

## 📜 Quality & Anti-Pattern Standards
Built under strict engineering governance:
- **Zero Mock Leakage (`AP-001`):** Real PyTorch FP16 inference and FFmpeg processing; explicit errors on missing tools.
- **Zero Compiler Appeasement (`AP-002`):** Strict TypeScript (`tsc --noEmit`) and clean exception handling.
- **Zero AI Slop (`AP-009`):** Lucide SVG icons only, 3-layer surface hierarchy, mobile-first layout safety.
- **Security Shield (`SEC-001` – `SEC-006`):** Parameterized `shell=False` FFmpeg/FFprobe calls, Zip-Slip & filename sanitization, sanitized error envelopes.

---

## 📄 License
MIT © 2026 Sakuga4K Contributors
