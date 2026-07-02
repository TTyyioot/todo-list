@echo off
cd /d "%~dp0"
echo 🚀 启动置顶助手 + 清单窗口...

REM 1. 启动置顶助手（后台隐藏窗口）
start "TodoPinHelper" /MIN powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0置顶助手.ps1"

REM 2. 等待助手就绪
timeout /t 2 /nobreak >nul

REM 3. 打开本地清单文件（Edge App 模式）
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=msedge.exe"

start "" "%EDGE%" --app="%~dp0index.html" --new-window
echo ✅ 已启动！网页底部点 📌置顶 即可固定窗口
