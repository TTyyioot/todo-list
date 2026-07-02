@echo off
cd /d "%~dp0"
echo 🚀 启动清单（置顶助手 + 本地服务器）...

REM 1. 启动置顶助手（后台，同时作为 HTTP 服务器）
start "TodoPinHelper" /MIN powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0置顶助手.ps1"

REM 2. 等待服务器就绪
timeout /t 2 /nobreak >nul

REM 3. 用 Edge App 模式打开本地服务器
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=msedge.exe"

start "" "%EDGE%" --app="http://localhost:8765" --new-window
echo ✅ 已启动！底部点 📌置顶 即可固定窗口
