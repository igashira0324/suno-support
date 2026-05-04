@echo off
setlocal
chcp 65001 > nul

echo ==================================================
echo   ACE-Step Theme Naming System - Startup & Manual
echo ==================================================

echo [1/3] Closing existing processes...
:: node.exe (Vite) and python.exe (Backend)
taskkill /F /IM node.exe /T 2>nul
taskkill /F /IM python.exe /T 2>nul

echo [2/3] Opening Naming Guide...
start "" "theme_naming_guide.html"

echo [3/3] Starting suno.ai services...
echo Please wait while the services start in the background.
echo You can check the output in the new terminal windows.
start /B .\run.bat

echo.
echo ==================================================
echo   Restarting initiated. 
echo   Services will be available at:
echo   Frontend: http://localhost:3300
echo   Backend:  http://localhost:8100
echo   ACESTEP:  http://localhost:8101
echo ==================================================
pause
