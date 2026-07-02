# 置顶助手.ps1 — TCP 后台服务，接收网页指令控制窗口置顶
# 自动启动，请勿手动关闭
param([int]$Port = 8765)

$script:isPinned = $false
$script:hwnd = [IntPtr]::Zero
$script:logFile = Join-Path $PSScriptRoot "置顶助手.log"

function Write-Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    $line | Out-File $script:logFile -Append -Encoding utf8
    Write-Host $line
}

Write-Log "===== 置顶助手启动 ====="

# Win32 API
Add-Type -ErrorAction Stop @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class PinAPI {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindowEx(IntPtr hWndParent, IntPtr hWndChildAfter, string lpszClass, string lpszWindow);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);
    public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    public static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOSIZE = 0x0001;
}
"@

Write-Log "Win32 API 已加载"

function Find-TodoWindow {
    if ($script:hwnd -ne [IntPtr]::Zero -and [PinAPI]::IsWindow($script:hwnd)) {
        return $script:hwnd
    }
    # 搜索所有 Edge/Chrome 窗口
    $ptr = [IntPtr]::Zero
    $sb = New-Object System.Text.StringBuilder(256)
    $found = $false
    while (($ptr = [PinAPI]::FindWindowEx([IntPtr]::Zero, $ptr, "Chrome_WidgetWin_1", $null)) -ne [IntPtr]::Zero) {
        [PinAPI]::GetWindowText($ptr, $sb, 256) | Out-Null
        $title = $sb.ToString()
        if ($title -like "*待办*" -or $title -like "*清单*" -or $title -like "*todo*") {
            $script:hwnd = $ptr
            $found = $true
            Write-Log "找到窗口: $title"
            break
        }
    }
    if (-not $found) {
        Write-Log "未找到清单窗口"
    }
    return $script:hwnd
}

function Set-Pin {
    $h = Find-TodoWindow
    if ($h -eq [IntPtr]::Zero) { Write-Log "置顶失败: 未找到窗口"; return $false }
    [PinAPI]::SetWindowPos($h, [PinAPI]::HWND_TOPMOST, 0, 0, 0, 0,
        [PinAPI]::SWP_NOMOVE -bor [PinAPI]::SWP_NOSIZE) | Out-Null
    $script:isPinned = $true
    Write-Log "✅ 窗口已置顶"
    return $true
}

function Set-Unpin {
    $h = Find-TodoWindow
    if ($h -eq [IntPtr]::Zero) { Write-Log "取消置顶失败: 未找到窗口"; return $false }
    [PinAPI]::SetWindowPos($h, [PinAPI]::HWND_NOTOPMOST, 0, 0, 0, 0,
        [PinAPI]::SWP_NOMOVE -bor [PinAPI]::SWP_NOSIZE) | Out-Null
    $script:isPinned = $false
    Write-Log "🔓 窗口已取消置顶"
    return $true
}

# ===== TCP 服务器 (无需管理员权限) =====
$listener = $null
try {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    Write-Log "TCP 服务器已启动 (localhost:$Port)"
} catch {
    Write-Log "❌ 无法启动 TCP 服务器: $_"
    exit 1
}

# 主循环
while ($true) {
    try {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $writer = New-Object System.IO.StreamWriter($stream)
        $writer.AutoFlush = $true

        $line = $reader.ReadLine()
        Write-Log "收到: $line"

        # 解析 HTTP 请求（简单解析，只取第一行）
        $method, $path = "", "/"
        if ($line -match '^(GET|POST|OPTIONS)\s+(\S+)') {
            $method = $Matches[1]
            $path = $Matches[2]
        }

        # 跳过其余 HTTP 头
        while (($l = $reader.ReadLine()) -ne "" -and $l -ne $null) { }

        $body = '{"ok":false}'
        $code = 200

        switch ($path) {
            "/pin" {
                $ok = Set-Pin
                $body = "{`"pinned`":$($ok.ToString().ToLower()),`"ok`":$($ok.ToString().ToLower())}"
            }
            "/unpin" {
                $ok = Set-Unpin
                $body = "{`"pinned`":false,`"ok`":$($ok.ToString().ToLower())}"
            }
            "/toggle" {
                $ok = if ($script:isPinned) { Set-Unpin } else { Set-Pin }
                $body = "{`"pinned`":$($script:isPinned.ToString().ToLower()),`"ok`":$($ok.ToString().ToLower())}"
            }
            "/status" {
                $h = Find-TodoWindow
                $alive = $h -ne [IntPtr]::Zero
                $body = "{`"pinned`":$($script:isPinned.ToString().ToLower()),`"alive`":$($alive.ToString().ToLower())}"
            }
        }

        $response = @"
HTTP/1.1 $code OK
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Content-Type: application/json
Content-Length: $($body.Length)
Connection: close

$body
"@
        $writer.Write($response)
        $client.Close()
    } catch {
        Write-Log "错误: $_"
    }
}
