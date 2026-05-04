@echo off
setlocal
cd /d "%~dp0\.."

echo ========================================================
echo   Qwen2.5-VL Vision Chat 一括起動システム
echo ========================================================

:: 1. サーバーの起動 (チェックして起動していなければ開始)
echo サーバーの起動状態を確認中...
curl -s http://127.0.0.1:8080/v1/models >nul
if %errorlevel% neq 0 (
    echo [INFO] サーバーを起動します (新しいウィンドウで実行)...
    start "Llama-server (Qwen2.5-VL)" /d "local_llm" cmd /c start_lfm.bat
    
    echo 起動待ち (10秒)...
    timeout /t 10 /nobreak >nul
) else (
    echo [OK] サーバーは既に起動しています。
)

:: 2. ブラウザでUIを開く
echo [INFO] チャットUIを開きます...
set UI_PATH=file:///%CD:\=/%/local_llm/chat_ui/index.html
start "" "%UI_PATH%"

echo ========================================================
echo   起動完了！ブラウザを確認してください。
echo ========================================================
timeout /t 3 >nul
endlocal
