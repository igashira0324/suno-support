@echo off
setlocal
chcp 65001 > nul

echo ===================================================
echo   SunoArchitect: Vocal Studio 起動スクリプト
echo ===================================================
echo.

:: バックエンドの起動
echo [1/2] バックエンドサーバー (FastAPI) を起動しています...
start "VocalStudio-Backend" cmd /k "cd server && venv\Scripts\activate && python main.py"

:: フロントエンドの起動
echo [2/2] フロントエンド (Vite/React) を起動しています...
echo ブラウザで http://localhost:5173 を開いて、「Vocal Studio」タブを選択してください。
npm run dev

pause
