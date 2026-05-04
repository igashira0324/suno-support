@echo off
chcp 65001 > nul
title Suno Architect - Full Stack Starter
setlocal
cd /d "%~dp0"

echo ========================================
echo Suno Architect - 起動シーケンス開始
echo ========================================

echo [1/3] Backend (FastAPI: Port 8100) を起動中...
if exist "server\venv\Scripts\python.exe" (
    start "Backend (Port 8100)" cmd /k "cd server && venv\Scripts\python.exe -m uvicorn main:app --reload --port 8100"
) else (
    echo [WARNING] Backend venv not found. Using system python.
    start "Backend (Port 8100)" cmd /k "cd server && python -m uvicorn main:app --reload --port 8100"
)

echo [2/3] ACE-Step (API Server: Port 8101) を起動中...
if exist "ace-step\.venv\Scripts\python.exe" (
    start "ACE-Step (Port 8101)" cmd /k "cd ace-step && set PYTHONIOENCODING=utf-8 && .venv\Scripts\activate && set MAX_CUDA_VRAM=12 && set ACESTEP_CONFIG_PATH=acestep-v15-turbo && python -m acestep.api_server --port 8101 --init-llm --lm-model-path acestep-5Hz-lm-1.7B --quantization int8_weight_only"
) else (
    echo [SKIP] ACE-Step venv not found. skipping ACE-Step...
)

echo [3/3] Frontend (Vite: Port 3300) を起動中...
start "Frontend (Port 3300)" cmd /k "npm run dev -- --port 3300"

echo.
echo ========================================
echo 全てのサービスを別ウィンドウで起動しました。
echo.
echo  - Frontend: http://localhost:3300
echo  - Backend:  http://localhost:8100
echo  - ACESTEP:  http://localhost:8101
echo ========================================
echo.
echo このウィンドウは閉じても問題ありません。
pause
