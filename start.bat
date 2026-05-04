@echo off
setlocal
cd /d %~dp0

echo ==========================================
echo   Suno Architect - Fast Startup Script
echo ==========================================

:: Check for .env file
if not exist .env (
    echo [WARNING] .env file not found. Creating from .env.example...
    copy .env.example .env
    echo [IMPORTANT] Please edit .env and add your API keys!
)

:: Check for node_modules
if not exist node_modules (
    echo [INFO] Installing frontend dependencies...
    call npm install
)

:: Check for python venv
if not exist venv (
    echo [INFO] Creating Python virtual environment...
    python -m venv venv
    call venv\Scripts\activate
    echo [INFO] Installing backend dependencies...
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate
)

:: Start Backend in a separate window
echo [INFO] Starting Backend Server (Port 8100)...
start "Suno Architect Backend" cmd /c "call venv\Scripts\activate && python server/main.py"

:: Start Frontend
echo [INFO] Starting Frontend (Vite)...
echo [INFO] Application will be available at http://localhost:3300
call npm run dev

pause
