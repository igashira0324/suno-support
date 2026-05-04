@echo off
setlocal
title SunoArchitect - Instrumental Fix Runner

echo [1/3] Starting Backend Server (Port 8100)...
start "Suno Backend" cmd /c "cd server && python main.py"

echo [2/3] Opening Technical Guide...
start separation_fix_guide.html

echo [3/3] Starting Frontend (Port 3300)...
echo Please wait for the browser to open...
npm run dev

pause
