@echo off
chcp 65001 > nul
cd /d "%~dp0"

start "Backend 8100" cmd /k call "%~dp0start_backend.cmd"
start "ACE-Step 8101" cmd /k call "%~dp0start_acestep.cmd"
start "Frontend 3300" cmd /k call "%~dp0start_frontend.cmd"

echo Started:
echo Frontend: http://localhost:3300
echo Backend:  http://localhost:8100
echo ACE-Step: http://localhost:8101
pause
