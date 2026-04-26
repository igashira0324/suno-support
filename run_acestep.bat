@echo off
cd /d "%~dp0\ace-step"
echo Starting ACE-Step API Server with 12GB GPU Optimizations...
echo [設定] 1.7B LM + INT8 量子化 + tier5 GPU 認識
set MAX_CUDA_VRAM=16
call start_api_server.bat --port 8101 --lm-model-path acestep-5Hz-lm-1.7B --quantization int8_weight_only
pause
