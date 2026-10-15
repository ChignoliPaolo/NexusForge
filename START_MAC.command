#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf 'Install Node.js 24 or later, then try again.\nOffline fallback: open NexusForge-demo.html\n'
  read -r answer
  exit 1
fi
printf 'NexusForge starts at http://localhost:8000\n'
npm start
