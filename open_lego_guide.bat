@echo off
chcp 65001 >nul
echo =========================================
echo Suno ACE-Step LEGO Mode Guide
echo =========================================
echo.
echo LEGOモードの図解解説書（HTML）をブラウザで開きます...
echo.

set "GUIDE_PATH=%~dp0ace-step\proposals\lego_guide.html"

if exist "%GUIDE_PATH%" (
    start "" "%GUIDE_PATH%"
    echo [OK] ブラウザで開きました。
) else (
    echo [ERROR] 解説書が見つかりません: %GUIDE_PATH%
    pause
    exit /b 1
)

timeout /t 3 >nul
exit /b 0
