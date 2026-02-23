@echo off
cd /d "%~dp0"
echo Stopping existing backend on port 8100...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8100') do taskkill /F /PID %%a 2>nul
timeout /t 2 /nobreak
echo Starting backend server...
cd server
call venv\Scripts\activate.bat
python main.py
