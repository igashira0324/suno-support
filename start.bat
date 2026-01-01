@echo off
chcp 65001 > nul
title SunoArchitect v4.5

echo ========================================
echo   SunoArchitect v4.5 を起動しています...
echo ========================================
echo.

cd /d "%~dp0"

:: node_modulesが存在しない場合は npm install を実行
if not exist "node_modules" (
    echo [INFO] 依存パッケージをインストール中...
    call npm install
    echo.
)

echo [INFO] 開発サーバーを起動しています...
echo [INFO] ブラウザで http://localhost:5173 が自動的に開きます
echo [INFO] 終了するには Ctrl+C を押してください
echo.

:: Vite開発サーバーを起動（ブラウザ自動オープン）
call npm run dev -- --open

pause
