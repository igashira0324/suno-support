@echo off
echo ==========================================
echo Fixing GPU Support for Audio Separator
echo ==========================================
echo.
echo Stopping running processes if any...
taskkill /F /IM python.exe /T 2>nul
echo.

cd /d "%~dp0"
if not exist "server\venv" (
    echo Virtual environment not found in server/venv!
    pause
    exit /b
)

echo Activating virtual environment...
call server\venv\Scripts\activate

echo.
echo Uninstalling conflicting packages...
pip uninstall -y onnxruntime onnxruntime-gpu audio-separator torch torchaudio torchvision

echo.
echo Installing PyTorch with CUDA 12.1 support (Forcing Reinstall)...
pip install torch torchaudio torchvision --index-url https://download.pytorch.org/whl/cu121 --force-reinstall --no-cache-dir

echo.
echo Installing GPU-enabled packages...
REM Installing specific version known to work well with common CUDA setups
pip install "audio-separator[gpu]"
pip install "onnxruntime-gpu"

echo.
echo ==========================================
echo Fix complete!
echo Please run 'run.bat' again to start the application.
echo ==========================================
pause
