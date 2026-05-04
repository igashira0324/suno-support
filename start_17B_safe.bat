@echo off
setlocal enabledelayedexpansion
title ACE-Step 1.7B Safe Starter

echo ==========================================
echo [ACE-Step 1.7B] Safe Start Engine
echo ==========================================

:: 1. Port Check & Kill
echo [1/3] Checking Port 8101...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8101 ^| findstr LISTENING') do (
    echo Existing process found (PID: %%a). Terminating...
    taskkill /F /PID %%a >nul 2>&1
)

:: 2. Environment Settings
echo [2/3] Setting UTF-8 and GPU constraints...
set PYTHONIOENCODING=utf-8
set MAX_CUDA_VRAM=12
set ACESTEP_CONFIG_PATH=acestep-v15-turbo

:: 3. Launch ACE-Step with 1.7B
echo [3/3] Launching ACE-Step 1.7B Model...
echo Loading takes about 3-5 minutes. Please wait...
cd ace-step
call .venv\Scripts\activate
python -m acestep.api_server --port 8101 --init-llm --lm-model-path acestep-5Hz-lm-1.7B --quantization int8_weight_only

pause
