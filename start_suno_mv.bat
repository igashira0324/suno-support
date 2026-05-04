@echo off
title Suno MV - Full Stack Starter
setlocal

echo [1/2] Starting Backend (FastAPI)...
start cmd /k "cd server && python -m uvicorn main:app --reload --port 8000"

echo [2/2] Starting Frontend (Vite)...
start cmd /k "npm run dev"

echo.
echo ========================================
echo Suno MV Application is starting!
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo ========================================
pause
