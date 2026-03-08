@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo ACE-Step 1.5 - Base Model Mode (for Lego/Repaint)
echo ===================================================

if not exist "server\venv" (
    echo [ERROR] Virtual environment not found. Please run run.bat first.
    pause
    exit /b 1
)

if not exist "ace-step\checkpoints\acestep-v15-base" (
    echo [ERROR] Base model not found!
    echo Please run 'download_base_model.bat' first.
    pause
    exit /b 1
)

echo [1/2] npm dependencies check...
if not exist "node_modules" (
    call npm install
)
call npm install concurrently --save-dev

echo [2/2] Starting all services with Base Model...
echo Backend: http://localhost:8100
echo ACESTEP: http://localhost:8101 (Base Model - may take 1-2 min to load)
echo Frontend: http://localhost:3300
echo.

call server\venv\Scripts\activate.bat

call npm run dev:all-base

pause
