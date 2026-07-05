@echo off
title SunoArchitect Suite (ACE-Step Lego & Base Model)
echo ==========================================================
echo  SunoArchitect Suite - ACE-Step 1.5 Base Model Startup
echo ==========================================================
echo.
echo  Legoモード（歌付与機能）に必要なBaseモデルを利用可能な状態で、
echo  以下のすべてのサービスを同時に起動します：
echo   1. FastAPI バックエンドサーバー
echo   2. ACE-Step 1.5 API サーバー (Baseモデル構成)
echo   3. Vite フロントエンドサーバー (React Web App)
echo.
echo  ※ 初回起動時は ACE-Step 1.5 のモデルダウンロードに
echo     少し時間がかかる場合があります。
echo  ==========================================================
echo.

npm run dev:all-base

if %errorlevel% neq 0 (
    echo.
    echo ⚠️ 起動中にエラーが発生しました。Node.jsやPython仮想環境、GPUドライバの設定等を確認してください。
    pause
)
