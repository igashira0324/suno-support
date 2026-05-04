@echo off
chcp 65001 > nul
cd /d "%~dp0"
npm run dev -- --port 3300
pause
