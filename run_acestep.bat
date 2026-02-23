@echo off
cd /d "%~dp0\ace-step"
echo Starting ACE-Step API Server on Port 8101...
call start_api_server.bat --port 8101
pause
