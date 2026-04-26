@echo off
setlocal

echo Cleaning up existing conflicting processes...
taskkill /F /IM "python.exe" >nul 2>&1
taskkill /F /IM "node.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

cd /d "%~dp0"

echo [1/4] checking npm dependencies...
if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install
)

echo [2/4] Installing concurrently for single-window execution...
call npm install concurrently --save-dev

echo [3/4] Checking Backend Environment...
if not exist "server\venv" (
    echo Creating Python virtual environment...
    python -m venv server\venv
)

echo Activate venv and installing requirements including soundfile...
call server\venv\Scripts\activate.bat
pip install -r server\requirements.txt

echo Starting Local LLM Service (Port 8080)...
start "Local LLM Service" "local_llm\start_lfm.bat"

echo [4/4] Starting Suno Architect Suite (Unified Window)...
echo Backend: http://localhost:8100
echo ACESTEP: http://localhost:8101
echo Frontend: http://localhost:3300
echo.

call npm run dev:all

pause
