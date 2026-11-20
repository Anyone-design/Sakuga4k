# Sakuga4K — Concept Clearance Sheet (`CLEARANCE.md`)

> **Session ID:** `sakuga` | **Date:** 2026-11-20  
> **Status:** APPROVED | **Target Version:** 1.0.0  
> **Lead Strategist:** Subagent `strategy-inquisitor`

---

## 1. Executive Summary & Core JTBD
- **Target User:** Solo Anime Video Editor (creating AMVs, TikToks, YouTube shorts, and timeline edits in Premiere Pro, After Effects, CapCut, and Alight Motion).
- **Core Pain Solved:** 
  1. Commercial tools (Topaz, Vmake, HitPaw) charge aggressive subscription/credit fees and apply waxy real-human face smoothing that blurs 2D anime linework.
  2. Local hardware is constrained (legacy 20-year-old laptop without modern discrete GPU), making local hardware-accelerated upscaling impossible.
- **Jobs-to-be-Done (JTBD):** When I have 1080p anime source cuts, I want to upscale them to native 4K using dedicated anime neural networks (`realesr-animevideov3`, `4x-AnimeSharp`) on a free cloud GPU, so I can seamlessly download crisp, flicker-free 4K footage or sync it directly to Google Drive at \$0 total cost.

---

## 2. Verdict & Risk Classification
- **Clearance Verdict:** 🟢 GREEN (Proceed with Verified Safeguards)
- **Decision Type:** Type 2 (Reversible / Decoupled Modular Architecture)
- **Primary Moat:** Free high-performance anime-specialized upscaling powered by ephemeral Nvidia T4 GPU instances on Google Colab, bridged via zero-config Cloudflare Quick Tunnel to a Next.js web dashboard.

---

## 3. Locked Baseline Constraints & Fidelity Dials
- **Tech Stack Boundary:**
  - **Frontend:** Next.js 15+ (App Router), React 19, TypeScript, Tailwind CSS, Lucide React icons. Hosted on Vercel Hobby ($0/mo).
  - **Backend:** FastAPI (Python 3.10+), PyTorch (CUDA FP16), FFmpeg (`libx264`, CRF 16, `yuv420p`), Cloudflare Quick Tunnel (`cloudflared`). Hosted on Google Colab ($0/mo).
  - **Storage:** Direct browser streaming (MP4/ZIP) + Google Drive mounting (`/content/drive/MyDrive/Anime_4K_Output`).
- **Visual Craft Dial:** **Tier 3 (Flagship Consumer Delight)** — High-craft dark anime studio, 3-layer surface depth, Lucide SVG icons, zero emoji slop, responsive on mobile & desktop.
- **Backend Complexity Dial:** **Tier 2 (Decoupled Modular Service)** — Browser-to-Colab direct multipart upload via CORS, bypassing Vercel serverless limits.
- **Budget & Resource Limit:** \$0.00/month.

---

## 4. Assumption Vulnerability Index (AVI) & Countermeasures

| Core Assumption | Likelihood (1-5) | Blast Radius (1-5) | AVI Score | Primary Safeguard / Countermeasure |
| :--- | :---: | :---: | :---: | :--- |
| **Vercel 4.5MB Payload Limit blocks video upload** | 5 | 5 | **25 (Mitigated: 2)** | Architecture routes video uploads directly from browser to the Colab Cloudflare tunnel endpoint; zero video bytes pass through Vercel. |
| **Colab Ephemeral Disk fills up during large batch** | 3 | 4 | **12 (Mitigated: 3)** | Rolling Frame Invariant: extracted raw PNG frames for Clip $N$ are purged immediately once Clip $N$ MP4 is assembled, before starting $N+1$. Disk usage capped at $<300\text{ MB}$. |
| **Cloudflare Quick Tunnel 100MB body limit** | 2 | 4 | **8 (Mitigated: 2)** | 90% of clips are $\le 5\text{s}$ (5–25 MB). Batch queue uploads files sequentially. Any clip $>100\text{ MB}$ warns user or uses Drive direct-import. |
| **Colab daily GPU quota depletion** | 3 | 3 | **9 (Mitigated: 2)** | 5-second clip renders in $\sim 20$ seconds. 3–4 hours of daily T4 compute enables upscaling hundreds of clips. Dashboard prompts session disconnect on batch completion. |
| **Model inter-frame line jitter / shimmering** | 2 | 4 | **8 (Mitigated: 2)** | Default preset locked to `realesr-animevideov3` (trained with temporal consistency loss for anime video). |

---

## 5. Viable Pivot Blueprint

- **Identified Failure Mode:** If Cloudflare Quick Tunnel (`trycloudflare.com`) experiences rate-limiting or temporary downtime.
- **Pivot Blueprint A (Low-Friction Alternative):** Fallback to `localtunnel` or `ngrok` free tier via single config parameter in Colab setup.
- **Pivot Blueprint B (Direct Google Drive Queue):** User drops clips into Google Drive `Input` folder, Colab processes directly from Drive, and saves to `Output` folder, with dashboard operating as a pure status viewer.
- **Pivot Migration Threshold:** Trigger Pivot A if Cloudflare handshake fails 3 consecutive attempts.

---

## 6. Official Handoff Gate
- **Verdict:** Approved & Certified
- **Entry Ticket to Stage 2:** Signed by `strategy-inquisitor`.
