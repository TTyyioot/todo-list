# 在桌面创建「待办清单」快捷方式，双击即可置顶打开
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "📋 待办清单.lnk"
$batPath = Join-Path (Get-Location).Path "启动清单.bat"

$WScriptShell = New-Object -ComObject WScript.Shell
$shortcut = $WScriptShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $batPath
$shortcut.WorkingDirectory = (Get-Location).Path
$shortcut.WindowStyle = 7  # Minimized
$shortcut.Description = "📋 每日待办清单 — 置顶窗口"
$shortcut.Save()

Write-Host "✅ 桌面快捷方式已创建: $shortcutPath"
Write-Host "双击即可打开置顶清单！"
Read-Host "按 Enter 关闭"
