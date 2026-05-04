@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo ACE-Step 1.5 Base Model Downloader
echo ===================================================
echo This script will download the required acestep-v15-base model.
echo Size: ~5GB. This may take several minutes depending on your connection.
echo.

if not exist "server\venv" (
    echo [ERROR] Virtual environment not found. Please run run.bat first.
    pause
    exit /b 1
)

echo Activating virtual environment...
call server\venv\Scripts\activate.bat

echo Installing huggingface_hub if not present...
pip install huggingface_hub

echo.
echo Starting download...
echo.

python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='ACE-Step/acestep-v15-base', local_dir='ace-step/checkpoints/acestep-v15-base')"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ===================================================
    echo [SUCCESS] Base model downloaded successfully!
    echo ===================================================
    echo You can now use the Lego feature. 
    echo Please note that you need to start the server with the Base model configuration.
) else (
    echo.
    echo ===================================================
    echo [ERROR] Download failed. Please check your internet connection.
    echo ===================================================
)

pause
