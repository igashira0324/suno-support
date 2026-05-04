@echo off
setlocal
title ACE-Step Music Architect - UI Optimized

echo ===================================================
echo    ACE-Step Music Architect: UI Optimization V2.0
echo ===================================================
echo.
echo [Update Highlights]
echo 1. Result Section -> Top of Left Column (Immediate Visibility)
echo 2. Persistence -> Results are saved during the session
echo 3. Auto-Scroll -> Smooth focus on new tracks
echo 4. Stability -> Gemini 429 quota protection active
echo.
echo Launching Backend and Frontend...
echo.

if exist "docs\ACE-Step_UI_Guide.html" (
    echo Opening UI Guide...
    start "" "docs\ACE-Step_UI_Guide.html"
)

call run.bat

pause
