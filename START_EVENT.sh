#!/bin/bash
# ==============================================================================
# NEXUSFORGE — ONE-CLICK EVENT LAUNCHER (MILANO HACKATHON)
# ==============================================================================

cd "$(dirname "$0")" || exit 1

echo "===================================================================="
echo "  NEXUSFORGE // Industrial Decision Twin — Live Event Launcher"
echo "===================================================================="
echo ""

# 1. Kill any stale node or cloudflared instances
pkill -f "server/index.mjs" 2>/dev/null
pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1

# 2. Start local server
echo "[1/3] Starting NexusForge backend on http://localhost:8000..."
npm start &
SERVER_PID=$!

# Wait for server health
until curl -s http://127.0.0.1:8000/api/health > /dev/null 2>&1; do
  sleep 0.5
done
echo "      ✔ Backend active and verified!"
echo ""

# 3. Start Cloudflare Tunnel
echo "[2/3] Establishing Cloudflare Public Tunnel for judges..."
echo "--------------------------------------------------------------------"
echo "  COPIA IL LINK 'https://....trycloudflare.com' E INCOLLALO SU LABLAB"
echo "  NON CHIUDERE QUESTO TERMINALE DURANTE LA GIORNATA DI DOMENICA!"
echo "--------------------------------------------------------------------"
echo ""

npx cloudflared tunnel --url http://localhost:8000
