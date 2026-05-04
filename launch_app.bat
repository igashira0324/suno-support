@echo off
title Suno Architect - Full Stack Launcher
color 0b

echo ==========================================
echo    Suno Architect - Refactored Edition
echo ==========================================
echo.

:: Check for .env file
if not exist .env (
    echo [!] WARNING: .env file not found.
    echo Creating .env from .env.example...
    copy .env.example .env
    echo [!] Please update your API keys in the .env file.
    pause
)

:: Start Backend
echo [*] Starting FastAPI Backend on port 8100...
start "Suno Backend" cmd /k "python -m uvicorn server.main:app --host 127.0.0.1 --port 8100 --reload"

:: Start Frontend
echo [*] Starting Vite Frontend on port 3300...
start "Suno Frontend" cmd /k "npm run dev"

echo.
echo ==========================================
echo    All services are starting up!
echo    Backend: http://127.0.0.1:8100
echo    Frontend: http://localhost:3300
echo ==========================================
echo.
pause
