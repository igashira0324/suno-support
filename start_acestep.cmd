@echo off
chcp 65001 > nul
cd /d "%~dp0ace-step"

if not exist ".venv\Scripts\python.exe" (
    echo ACE-Step venv not found.
    pause
    exit /b 1
)

set PYTHONIOENCODING=utf-8
set MAX_CUDA_VRAM=12
set ACESTEP_CONFIG_PATH=acestep-v15-turbo

.venv\Scripts\python.exe -m acestep.api_server --port 8101 --init-llm --lm-model-path acestep-5Hz-lm-1.7B --quantization int8_weight_only
pause
