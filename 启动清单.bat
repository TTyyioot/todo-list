@echo off
cd /d "%~dp0"
echo 🚀 启动置顶助手 + 清单窗口...

REM 1. 启动置顶助手（后台隐藏窗口）
start "TodoPinHelper" /MIN powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0置顶助手.ps1"

REM 2. 等待助手就绪
timeout /t 1 /nobreak >nul

REM 3. 打开清单（Edge App 模式）
start "" msedge --app="https://ttyyioot.github.io/todo-list/" --new-window

echo ✅ 已启动！网页底部点 📌置顶 即可固定窗口
