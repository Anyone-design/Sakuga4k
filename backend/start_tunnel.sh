#!/usr/bin/env bash
# Sakuga4K Cloudflare Tunnel & Server Orchestrator for Google Colab
set -e

echo "[Sakuga4K] Preparing Cloudflare Tunnel for Google Colab..."

# Download cloudflared if not present
if ! command -v cloudflared &> /dev/null; then
    echo "[Sakuga4K] Installing Cloudflare Quick Tunnel binary..."
    wget -q -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    dpkg -i cloudflared-linux-amd64.deb > /dev/null 2>&1 || true
    rm -f cloudflared-linux-amd64.deb
fi

# Ensure Python dependencies
pip install -q -r backend/requirements.txt

# Start FastAPI server in background
echo "[Sakuga4K] Starting FastAPI Engine on port 8000..."
nohup uvicorn backend.main:app --host 0.0.0.0 --port 8000 > /content/uvicorn.log 2>&1 &
sleep 2

# Launch Cloudflare Tunnel
echo "[Sakuga4K] Launching Quick Tunnel..."
cloudflared tunnel --url http://127.0.0.1:8000
