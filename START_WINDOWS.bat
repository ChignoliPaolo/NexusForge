@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or later. Offline fallback: open NexusForge-demo.html
  pause
  exit /b 1
)
echo NexusForge starts at http://localhost:8000
call npm start
pause
