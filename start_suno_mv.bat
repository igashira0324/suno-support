@echo off
title Suno Architect - Full Stack Starter
setlocal
cd /d "%~dp0"

echo [1/2] Starting Backend (FastAPI)...
start cmd /k "cd server && python -m uvicorn main:app --reload --port 8100"

echo [2/2] Starting Frontend (Vite)...
start cmd /k "npm run dev"

echo.
echo ========================================
echo Suno Architect Application is starting!
echo Backend: http://localhost:8100
echo Frontend: http://localhost:3300
echo ========================================
pause
