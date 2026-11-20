# Sakuga4K — System Specification (`SPEC.md`)

> **Session ID:** `sakuga` | **Date:** 2026-11-20  
> **Status:** LOCKED & APPROVED | **Target Version:** 1.0.0  
> **Lead Product Architect:** Subagent `moat-guardian`  
> **Lead Contract Modeler:** Subagent `contract-modeler`

---

## 1. The Core Loop (v1 Moat)
- **Trigger:** Solo anime video editor selects one or multiple 1080p anime video clips (`.mp4`, `.mov`, `.mkv`, `.webm`) on mobile or desktop and taps **"Start Batch Upscale"**.
- **Core Action:** Next.js frontend sends direct multipart upload over Cloudflare tunnel to Google Colab. The Colab backend runs PyTorch FP16 neural network inference (`realesr-animevideov3` for temporally consistent action or `4x-AnimeSharp` for crisp line art), extracts & scales frames, and reassembles pristine 4K video using FFmpeg with visually lossless `CRF 16` encoding and original audio stream copying.
- **Reward / Output:** Immediate real-time frame progress updates via SSE, before/after visual inspection slider, one-click 4K MP4 or batch ZIP download, and automatic backup to Google Drive.

---

## 2. Essential User Stories (Max 3)
1. **As an anime video editor on mobile/PC,** I want to connect my dashboard to my free Colab GPU instance via a single URL so that I can monitor GPU health, VRAM, and processing state.
2. **As an anime video editor,** I want to queue multiple 1080p cuts, pick an anime-specific model preset, and watch real-time frame-by-frame progress so that I know exactly when my footage is ready.
3. **As an anime video editor,** I want to download finished 4K clips directly or access them instantly in my Google Drive folder so that I can drop them straight into CapCut, Premiere, or After Effects without token limits.

---

## 3. Mandatory State Transition Matrix

| State | UI Representation / Output | Trigger to Advance |
| :--- | :--- | :--- |
| **Disconnected** | Red connection status pill (`🔴 Backend Offline`), tunnel input highlighted, disabled dropzone with helper guide | User pastes Cloudflare tunnel URL and tests handshake |
| **Idle / Online** | Green connection status pill (`🟢 GPU Online: Tesla T4 (14.2 GB VRAM Free)`), active drag-and-drop dropzone, model preset selector | User drops one or more video files |
| **Queued / Staged** | Clip cards rendered in queue with original resolution badges (`1080p`), duration, file size, and "Start Upscale" CTA | User taps "Start Batch" |
| **In-Flight (Processing)** | Real-time dual progress bars (overall batch + active clip frame counter `Frame 84/120 - 70% | ETA: 8s`), pulsing GPU indicator, cancel button | FFmpeg & PyTorch complete rendering of clip |
| **Completed / Ready** | Green success badges, interactive before/after split slider, "Download 4K MP4" & "Download All (.ZIP)" buttons, Drive sync confirmation | User downloads clips or clears queue |
| **Error / Degraded** | Red alert banner with specific sanitized error envelope (e.g. invalid codec, GPU disconnect) + retry button | User clicks "Retry" or re-pairs tunnel |

---

## 4. Data Entities & API Contracts Reference
- **Contract Schema File:** `contracts.json` (mirrored in `.pipeline/session-sakuga/contracts.json`)
- **Locked Entities:** `HealthStatus`, `VideoClip`, `BatchSummary`
- **Locked Endpoints:** 
  - `GET /api/health`
  - `POST /api/upload`
  - `GET /api/progress/{id}`
  - `GET /api/download/{id}`
  - `GET /api/download-batch/{batchId}`

---

## 5. Feature Triage Ledger

### Bucket 1: The v1 Moat (Approved Core)
- [x] Next.js 15+ App Router studio interface with 3-layer surface depth and zero emoji slop.
- [x] Multi-file drag-and-drop queue supporting `.mp4`, `.mov`, `.mkv`, `.webm`.
- [x] Model preset selection: `realesr-animevideov3` (default action) and `4x-AnimeSharp` (line art).
- [x] Real-time frame progress & ETA visualizer via SSE / polling stream.
- [x] Interactive Before / After split comparison slider.
- [x] Direct single MP4 download and bundled ZIP export.
- [x] Google Drive auto-sync in Colab backend (`/content/drive/MyDrive/Anime_4K_Output`).
- [x] One-click Google Colab notebook with Cloudflare Quick Tunnel and QR code display.

### Bucket 2: Fast-Follows (v1.1 Backlog)
- [ ] Upstash Redis tunnel auto-discovery (eliminates manual URL copy-paste).
- [ ] RIFE v4.x frame interpolation (24 fps -> 60 fps smooth motion).
- [ ] Web Audio / Vibration API chime on batch finish.

### Bucket 3: Out-of-Scope Blacklist (Strictly Banned in v1)
- [ ] User authentication / accounts / login forms.
- [ ] Paid payment gateways / Stripe / credit checkout systems.
- [ ] Real-human face restoration algorithms (e.g. CodeFormer/GFPGAN) that ruin anime art.
- [ ] Multi-tenant server databases.

---

## 6. Official Handoff Gate
- **Verdict:** Locked & Approved
- **Entry Ticket to Stage 3:** Signed by `moat-guardian` and `contract-modeler`.
