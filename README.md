# 🌸 Sakuga4K — High-Craft Anime Video Upscaler Platform

> **Native 4K UHD Neural Upscaling for Anime Video Editors (AMVs, TikToks, Reels) operating at $0.00/month.**  
> Decoupled architecture: Next.js 15+ App Router web studio + Ephemeral Google Colab Nvidia T4 GPU (PyTorch FP16).

---

## ✨ Features

- **Specialized 2D Anime Models:** Runs `realesr-animevideov3` for seamless action and `4x-AnimeSharp` for crisp sub-pixel line art without waxy facial distortion.
- **Visually Lossless Output:** FFmpeg x264 CRF 16 with rolling frame cleanup preventing ephemeral disk exhaustion.
- **Decoupled Architecture:** 24/7 web studio hosted on Vercel connecting via encrypted Cloudflare Quick Tunnel directly to a free Google Colab Nvidia T4 GPU.
- **Permanent Google Drive Sync:** Rendered 4K cuts automatically back up into `MyDrive/Anime_4K_Output/`.
- **High-Craft Web Studio:** Built with Next.js 15, React 19, Tailwind CSS, Lucide React, and Framer Motion spring physics.
- **Vmake-Style Inspection:** Interactive split-screen comparison slider with stationary reveal layer.

---

## 🚀 Quickstart

### 1. Launch the Cloud GPU Backend (Google Colab)
1. Open the [Sakuga4K Colab Notebook](notebooks/Sakuga4K_Colab_Engine.ipynb) in Google Colab.
2. Select **Runtime ➔ Run all** (takes ~60 seconds).
3. The notebook mounts Google Drive, initializes PyTorch FP16, and prints your unique Cloudflare URL:
   ```
   https://xyz-random-name.trycloudflare.com
   ```

### 2. Connect the Web Studio
1. Open the Sakuga4K web application.
2. Click **Connect Colab** in the top navigation bar.
3. Paste your Cloudflare URL. The status indicator immediately switches to:
   ```
   🟢 Tesla T4 (FP16 Ready)
   ```

### 3. Upscale Anime Cuts
1. Drag and drop single cuts or batches (`.mp4`, `.mov`, `.mkv`, `.webm`).
2. Select your neural model preset:
   - `Fast Video v3` for dynamic motion and AMVs.
   - `AnimeSharp 4x` for character close-ups and poster stills.
   - `Anime 6B` for detailed backgrounds and shading.
3. Click **Start 4K Upscale**.
4. Inspect line sharpness on the before/after split slider and download single MP4s, batch ZIPs, or open directly from Google Drive.

---

## 🛠️ Project Structure

```
Sakuga4k/
├── backend/
│   ├── main.py              # FastAPI server (CORS, upload, SSE stream)
│   ├── models.py            # PyTorch FP16 tensor engine & CUDA detection
│   ├── video_processor.py   # FFmpeg rolling frame extractor & CRF 16 reassembly
│   ├── drive_sync.py        # Google Drive auto-sync & batch ZIP archiver
│   ├── config.py            # Workspace paths & encoding parameters
│   └── start_tunnel.sh      # Colab startup shell script
├── notebooks/
│   └── Sakuga4K_Colab_Engine.ipynb # 1-Click Master Colab Notebook
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Studio shell layout with Plus Jakarta Sans
│   │   ├── globals.css      # 3-layer surface hierarchy & precision tokens
│   │   └── page.tsx         # Main studio stage & flow state controller
│   ├── components/
│   │   ├── Header.tsx       # Live Cloudflare tunnel handshake status pill
│   │   ├── Dropzone.tsx     # Multi-file drag-and-drop canvas
│   │   ├── QueueList.tsx    # Animated batch queue with status pills
│   │   ├── PresetSelector.tsx # Neural model selector with spring glow
│   │   ├── ProgressVisualizer.tsx # In-place telemetry progress card
│   │   └── ComparisonSlider.tsx   # Stationary Vmake split comparison slider
│   └── types/
│       └── contracts.ts     # Frozen contract matching contracts.json
├── contracts.json           # API schema & mock fixtures
└── package.json             # Next.js 15, React 19, Framer Motion, Lucide
```

---

## 📜 Quality & Anti-Pattern Standards
This project is built under the `deep-agentic-pipeline` governance rules:
- **Zero Vibe Coding:** Strict binary test contracts before all commits.
- **Zero Mock Leakage:** Clean decoupling between production routes and fixtures.
- **Zero AI Slop:** 100% clean Lucide SVGs, no emojis as UI icons, 3-layer surface hierarchy.
- **SEC-001 - SEC-006:** Parameterized FFmpeg processes, zero-trust schema validation, path traversal defense.

---

## 📄 License
MIT © 2026 Sakuga4K Contributors
