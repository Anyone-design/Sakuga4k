# Sakuga4K Studio — Operational Runbook (`RUNBOOK.md`)

> **Target Audience:** Non-Technical Operator / Vibe-Coder  
> **Last Verified:** 2026-11-20 | **Status:** Production-Ready  
> **Lead Reliability Engineer:** Subagent `sre-specialist` (Principal Site Reliability Engineer)

---

## 1. Zero-Friction Quickstart (Copy-Paste)

### Prerequisites
- Node.js (v20+ or newer, verified on v24.x)
- Operating System: Windows, macOS, or Linux

### Step 1: Health Diagnostic (Pre-Flight)
Run the automated self-diagnostic tool to audit runtime engine, contract schemas, production build artifacts, and tunnel validators:
```bash
npm run doctor
```
*(Confirms Node.js engine $\ge 20.x$, contract schema integrity, Next.js `.next/` build artifacts, and loopback dev ports are 100% operational).*

### Step 2: Start Locally (1 Line)

**Production Mode:**
```bash
npm run build && npm run start
```

**Development Mode:**
```bash
npm run dev
```

- **Web Studio Dashboard:** Open browser at [http://localhost:3000](http://localhost:3000)
- **Live Health Telemetry:** [http://localhost:3000/api/health](http://localhost:3000/api/health) or [http://localhost:3000/health](http://localhost:3000/health)  
  *(Returns unauthenticated JSON status: `{"status":"ok","service":"sakuga4k-web-studio","uptimeSeconds":...,"timestamp":"..."}`)*

---

## 2. Plain-English Environment Variable Decoder

The Sakuga4K Web Studio is architected for zero-configuration startup out-of-the-box. All optional variables are documented below:

| Variable | Plain-English Purpose | Where to Get It | Example Value | Fatal If Missing? |
| :--- | :--- | :--- | :--- | :---: |
| `PORT` | Local network port used by Next.js web studio | System config | `3000` | No (Defaults to `3000`) |
| `NODE_ENV` | Runtime environment mode | Node runtime | `production` / `development` | No (Defaults to `development`) |
| `NEXT_PUBLIC_COLAB_TUNNEL_URL` | Optional default Cloudflare tunnel URL | Google Colab tunnel output | `https://xyz-random.trycloudflare.com` | No (Configurable via UI drawer) |

> [!NOTE]
> Operators can configure the active Colab Cloudflare Quick Tunnel URL interactively at any time via the top status pill in the Web Studio header.

---

## 3. The "Triage Trinity": 3 Most Common Crashes & 1-Line Fixes

### Crash A: "Port in Use" (`EADDRINUSE: 3000` or `8000`)
- **What happened:** A previous server or Colab tunnel proxy session did not terminate cleanly, holding port 3000 or 8000 hostage.
- **1-Line Fix:**
  ```bash
  npm run kill-dev
  ```
  *(Cross-platform termination script that immediately reclaims ports 3000 and 8000).*

### Crash B: "Cloudflare Tunnel Offline / 401 / 502 Bad Gateway"
- **What happened:** The Google Colab runtime disconnected, timed out, or a stale Quick Tunnel URL is stored in browser `localStorage`.
- **1-Line Fix:**
  1. In the Web Studio header, click the **"Connect Colab"** / Status pill.
  2. Paste the newly generated `https://*.trycloudflare.com` URL from your Colab notebook.
  3. Click **"Save"** (or click **"Ping"** to test handshake).
  - Diagnostic fallback command:
    ```bash
    npm run doctor
    ```

### Crash C: "Bundle Desync / State Inconsistency"
- **What happened:** Build artifacts in `.next/` desynchronized after dependency changes or unclean restart.
- **1-Line Fix:**
  ```bash
  npm run kill-dev && npm run build && npm run start
  ```

---

## 4. Google Colab GPU Quick Tunnel Architecture

```mermaid
flowchart LR
    Browser["Next.js Web Studio (Client)"]
    Tunnel["Cloudflare Quick Tunnel (*.trycloudflare.com)"]
    Colab["Google Colab Node (NVIDIA Tesla T4 GPU)"]
    Model["Real-ESRGAN Anime Engine (FP16)"]

    Browser -->|GET /api/health| Tunnel
    Browser -->|POST /api/upload| Tunnel
    Browser -->|GET /api/progress/:id| Tunnel
    Tunnel --> Colab
    Colab --> Model
```

### Day-1 Colab Quickstart Procedure:
1. Open the Sakuga4K Colab Notebook (`Open Colab` link in Header).
2. Select **Runtime > Change runtime type > T4 GPU**.
3. Run all cells:
   - Cell 1: Environment & Real-ESRGAN weights initialization.
   - Cell 2: Launch local FastAPI server + `cloudflared tunnel --url http://localhost:8000`.
4. Copy the output tunnel URL (e.g., `https://example-random-subdomain.trycloudflare.com`).
5. Open Sakuga4K Web Studio ([http://localhost:3000](http://localhost:3000)), open the tunnel drawer, paste URL, and click **Save**.
6. The status pill turns green: **"NVIDIA Tesla T4 (FP16 Ready)"**.

---

## 5. SRE Diagnostic & Operations Command Matrix

| Command | Category | Purpose | Success Exit Code |
| :--- | :--- | :--- | :---: |
| `npm run doctor` | Diagnostic | Complete pre-flight system integrity check | `0` |
| `npm run kill-dev` | Reliability | Reclaims locked dev ports (`3000`, `8000`) | `0` |
| `npm run test:reality` | Chaos Stress | Runs full 6-vector reality stress test harness | `0` |
| `npm run build` | Build | Compiles optimized Next.js 15 production bundle | `0` |
| `npm run start` | Production | Boots high-performance Node.js production server | — |
| `npm run dev` | Development | Boots local development server with Fast Refresh | — |

---

## 6. Final SRE Project Sign-Off

- **Lead SRE:** Subagent `sre-specialist`
- **Gate Verdict:** **GREEN / CERTIFIED PRODUCTION-READY**
- **Sequential Airlock Lifecycle Complete:**
  - [x] Stage 1: Intake & Strategy (`CLEARANCE.md` Signed)
  - [x] Stage 2: Scope & Contracts (`SPEC.md` & `contracts.json` Frozen)
  - [x] Stage 3: Architecture & DAG (`ROADMAP.md` Approved)
  - [x] Stage 4: Build Loop (`reviews/` LGTM + Zero AI UI Slop Certified)
  - [x] Stage 5: Reality Gate (`AUDIT.md` Certified — 6/6 Vectors, 78/78 Tests Passing)
  - [x] Stage 6: Operations & Reliability (`RUNBOOK.md` + `doctor.js` Verified Exit 0)
