@echo off
setlocal
chcp 65001 > nul
cd /d "%~dp0"

echo ==========================================
echo   Suno Architect Suite 終了スクリプト
echo ==========================================
echo.

echo [1/3] アプリケーションプロセスの停止中...
rem Vite, Concurrently, Node.js関連
taskkill /f /im node.exe /t 2>nul
rem FastAPI, ACE-Step関連
taskkill /f /im python.exe /t 2>nul

echo [2/3] ローカルLLMサービスの停止中...
rem LFMサービス関連 (lfm.exe または python)
taskkill /f /fi "WINDOWTITLE eq Local LLM Service*" /t 2>nul

echo [3/3] 残留プロセスのクリーニング...
rem ポート 8100, 8101, 8080 を使用しているプロセスを特定して終了
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8100 ^| findstr LISTENING') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8101 ^| findstr LISTENING') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do taskkill /f /pid %%a 2>nul

echo.
echo ------------------------------------------
echo ☕ すべてのプロセスが正常に終了しました。
echo ------------------------------------------
timeout /t 3
exit
