@echo off
setlocal
cd /d "%~dp0"

echo [MV Support] Testing URL Import Functionality...
echo Target: http://localhost:8100/separate-url
echo.

if not exist "server\venv\Scripts\python.exe" (
    echo [ERROR] Python virtual environment not found. Please run run.bat first.
    pause
    exit /b 1
)

server\venv\Scripts\python.exe server\test_separate_url.py

echo.
echo Test completed. Check the console output for task status.
pause
