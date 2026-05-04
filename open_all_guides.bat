@echo off
chcp 65001 > nul
setlocal

echo ===================================================
echo Suno Architect Suite - ガイドドキュメント起動バッチ
echo ===================================================
echo.
echo 以下のドキュメントをブラウザで開きます：
echo 1. ACE-Step 1.5 Fidelity Pro Guide (高度なパラメータ設定)
echo 2. ACE-Step 1.5 Vocal Addition Guide (インストへのボーカル追加・Legoモード)
echo.

set DOCS_DIR=%~dp0docs

if not exist "%DOCS_DIR%\fidelity_pro_guide.html" (
    echo [エラー] fidelity_pro_guide.html が見つかりません。
) else (
    echo [開く] fidelity_pro_guide.html
    start "" "%DOCS_DIR%\fidelity_pro_guide.html"
)

if not exist "%DOCS_DIR%\vocal_addition_guide.html" (
    echo [エラー] vocal_addition_guide.html が見つかりません。
) else (
    echo [開く] vocal_addition_guide.html
    start "" "%DOCS_DIR%\vocal_addition_guide.html"
)

echo.
echo 全ての操作が完了しました。ブラウザをご確認ください。
pause
