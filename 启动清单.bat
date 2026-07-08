@echo off
title 待办清单 - 置顶启动器
cd /d "%~dp0"

echo ========================================
echo    📋 每日待办清单 - 置顶启动器
echo ========================================
echo.
echo 正在启动本地服务 + 浏览器...

REM 启动 PowerShell 脚本（显示窗口以便看到错误）
powershell.exe -ExecutionPolicy Bypass -File "%~dp0置顶助手.ps1"

REM 如果 PowerShell 异常退出，暂停以便查看错误
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ 启动失败！错误码: %ERRORLEVEL%
    echo 请截图此窗口并反馈。
    pause
)
