#!/bin/sh
cd "$(dirname "$0")" || exit 1
printf 'NexusForge starts at http://localhost:8000. Requires Node.js 24+.\n'
npm start
