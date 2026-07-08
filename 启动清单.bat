@echo off
cd /d "%~dp0"
echo 🚀 正在启动清单插件（内置置顶功能）...
echo.

REM 使用 PowerShell 启动置顶助手（HTTP 服务器 + 自动置顶）
REM -ExecutionPolicy Bypass 确保脚本可以运行
REM -WindowStyle Hidden 隐藏 PowerShell 窗口（服务器在后台运行）
start "TodoListServer" /MIN powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0置顶助手.ps1"

REM 等待服务器就绪 + Edge 窗口打开
timeout /t 3 /nobreak >nul

echo ✅ 清单已启动！点击左上角 📌 图标即可切换置顶。
echo.
echo 💡 提示：关闭 PowerShell 进程会停止置顶功能。
echo    如需退出，请在任务栏右键 PowerShell 图标关闭。
