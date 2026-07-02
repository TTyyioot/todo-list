# 创建桌面快捷方式.ps1 — 在桌面创建置顶清单的快捷方式
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "📋 待办清单.lnk"
$ps1Path = Join-Path (Get-Location).Path "清单置顶.ps1"
$batPath = Join-Path (Get-Location).Path "启动清单.bat"

$WScriptShell = New-Object -ComObject WScript.Shell
$shortcut = $WScriptShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1Path`""
$shortcut.IconLocation = "powershell.exe,0"
$shortcut.WorkingDirectory = (Get-Location).Path
$shortcut.WindowStyle = 7  # Minimized
$shortcut.Description = "📋 每日待办清单 — 置顶窗口"
$shortcut.Save()

Write-Host "✅ 桌面快捷方式已创建：$shortcutPath"
