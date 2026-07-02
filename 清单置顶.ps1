# 清单置顶.ps1 — 以置顶窗口打开待办清单
# 双击运行，或创建快捷方式到桌面
# 需要 PowerShell 5.1+（Windows 10/11 自带）

$url = "https://ttyyioot.github.io/todo-list/"

# 1. 启动 Edge App 模式（无边框窗口）
Write-Host "🚀 正在启动清单插件..."
$edgePath = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edgePath)) {
    $edgePath = "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
}
if (-not (Test-Path $edgePath)) {
    Write-Host "❌ 未找到 Microsoft Edge，请先安装 Edge 浏览器"
    Read-Host "按 Enter 退出"
    exit 1
}

Start-Process -FilePath $edgePath -ArgumentList "--app=$url", "--new-window"

# 2. 等待窗口出现
Write-Host "⏳ 等待窗口..."
$hwnd = [IntPtr]::Zero
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    # Edge App 窗口类名是 Chrome_WidgetWin_1
    Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Top {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindowEx(IntPtr hWndParent, IntPtr hWndChildAfter, string lpszClass, string lpszWindow);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
    public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOSIZE = 0x0001;
    public const uint GW_HWNDNEXT = 2;
}
"@ -ErrorAction SilentlyContinue

    # 查找标题包含"待办"的 Edge 窗口
    $ptr = [IntPtr]::Zero
    $sb = New-Object System.Text.StringBuilder(256)
    while (($ptr = [Win32Top]::FindWindowEx([IntPtr]::Zero, $ptr, "Chrome_WidgetWin_1", $null)) -ne [IntPtr]::Zero) {
        [Win32Top]::GetWindowText($ptr, $sb, 256) | Out-Null
        $title = $sb.ToString()
        if ($title -like "*待办*" -or $title -like "*清单*") {
            $hwnd = $ptr
            break
        }
    }
    if ($hwnd -ne [IntPtr]::Zero) { break }
}

if ($hwnd -eq [IntPtr]::Zero) {
    Write-Host "⚠️ 未能自动置顶，请手动将窗口置顶"
} else {
    # 3. 设为置顶
    [Win32Top]::SetWindowPos($hwnd, [Win32Top]::HWND_TOPMOST, 0, 0, 0, 0,
        [Win32Top]::SWP_NOMOVE -bor [Win32Top]::SWP_NOSIZE)
    Write-Host "✅ 清单已置顶！"
}

# 等待 2 秒后退出，窗口保持打开
Start-Sleep -Seconds 2
