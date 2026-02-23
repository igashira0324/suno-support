@echo off
echo Starting Local LLM Setup...
cd /d "%~dp0\local_llm"
powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1
pause
