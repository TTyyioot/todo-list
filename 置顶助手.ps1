# 置顶助手.ps1 — 后台常驻，接收网页指令控制窗口置顶
# 由启动清单.bat 自动启动，请勿手动关闭此窗口
param([int]$Port = 8765)

$script:isPinned = $false
$script:hwnd = [IntPtr]::Zero

# Win32 API
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Pin {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindowEx(IntPtr hWndParent, IntPtr hWndChildAfter, string lpszClass, string lpszWindow);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);
    public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    public static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOSIZE = 0x0001;
}
"@

function Find-TodoWindow {
    if ($script:hwnd -ne [IntPtr]::Zero -and [Win32Pin]::IsWindow($script:hwnd)) {
        return $script:hwnd
    }
    $ptr = [IntPtr]::Zero
    $sb = New-Object System.Text.StringBuilder(256)
    while (($ptr = [Win32Pin]::FindWindowEx([IntPtr]::Zero, $ptr, "Chrome_WidgetWin_1", $null)) -ne [IntPtr]::Zero) {
        [Win32Pin]::GetWindowText($ptr, $sb, 256) | Out-Null
        $title = $sb.ToString()
        if ($title -like "*待办*" -or $title -like "*清单*" -or $title -like "*todo*") {
            $script:hwnd = $ptr
            return $ptr
        }
    }
    return [IntPtr]::Zero
}

function Set-Pin {
    $h = Find-TodoWindow
    if ($h -eq [IntPtr]::Zero) { return $false }
    [Win32Pin]::SetWindowPos($h, [Win32Pin]::HWND_TOPMOST, 0, 0, 0, 0,
        [Win32Pin]::SWP_NOMOVE -bor [Win32Pin]::SWP_NOSIZE)
    $script:isPinned = $true
    return $true
}

function Set-Unpin {
    $h = Find-TodoWindow
    if ($h -eq [IntPtr]::Zero) { return $false }
    [Win32Pin]::SetWindowPos($h, [Win32Pin]::HWND_NOTOPMOST, 0, 0, 0, 0,
        [Win32Pin]::SWP_NOMOVE -bor [Win32Pin]::SWP_NOSIZE)
    $script:isPinned = $false
    return $true
}

# HTTP 监听
try {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Start()
} catch {
    # 端口被占用或权限不足，尝试加 urlacl
    try {
        netsh http add urlacl url="http://localhost:$Port/" user="$env:USERNAME" 2>$null
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://localhost:$Port/")
        $listener.Start()
    } catch {
        Write-Host "❌ 无法启动置顶助手 (端口 $Port 不可用)"
        Write-Host "请以管理员身份运行一次，或关闭占用端口 $Port 的程序"
        Read-Host "按 Enter 退出"
        exit 1
    }
}

Write-Host "🔌 置顶助手已就绪 (端口 $Port)"

# CORS 响应
function Send-Response($context, $body, $code = 200) {
    $response = $context.Response
    $response.StatusCode = $code
    $response.AddHeader("Access-Control-Allow-Origin", "*")
    $response.AddHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
    $response.AddHeader("Content-Type", "application/json")
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.Close()
}

# 主循环
while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $path = $context.Request.Url.LocalPath

        # CORS preflight
        if ($context.Request.HttpMethod -eq "OPTIONS") {
            Send-Response $context '{"ok":true}'
            continue
        }

        switch ($path) {
            "/pin" {
                $ok = Set-Pin
                Send-Response $context "{`"pinned`":$($ok.ToString().ToLower()),`"ok`":$($ok.ToString().ToLower())}"
            }
            "/unpin" {
                $ok = Set-Unpin
                Send-Response $context "{`"pinned`":false,`"ok`":$($ok.ToString().ToLower())}"
            }
            "/toggle" {
                $ok = if ($script:isPinned) { Set-Unpin } else { Set-Pin }
                Send-Response $context "{`"pinned`":$($script:isPinned.ToString().ToLower()),`"ok`":$($ok.ToString().ToLower())}"
            }
            "/status" {
                $h = Find-TodoWindow
                $alive = $h -ne [IntPtr]::Zero
                Send-Response $context "{`"pinned`":$($script:isPinned.ToString().ToLower()),`"alive`":$($alive.ToString().ToLower())}"
            }
            default {
                Send-Response $context '{"error":"unknown command","usage":"/toggle, /pin, /unpin, /status"}'
            }
        }
    } catch {
        # 客户端断开等，继续监听
    }
}
