# 置顶助手.ps1 — 本地 HTTP 服务器 + 窗口置顶控制
# 自动启动，请勿手动关闭
param([int]$Port = 8765)

$script:isPinned = $false
$script:hwnd = [IntPtr]::Zero
$script:rootDir = $PSScriptRoot
$script:logFile = Join-Path $PSScriptRoot "置顶助手.log"

function Write-Log($msg) {
    $line = "$(Get-Date -Format 'HH:mm:ss') $msg"
    try { $line | Out-File $script:logFile -Append -Encoding utf8 } catch {}
    Write-Host $line
}

Write-Log "===== 置顶助手启动 (端口 $Port) ====="

# ===== 查找浏览器路径（Edge / Chrome / 夸克） =====
function Find-Browser {
    # 支持的所有浏览器路径
    $browsers = @(
        @{Name="Edge"; Paths=@(
            "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
            "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
            "${env:LocalAppData}\Microsoft\Edge\Application\msedge.exe"
        )},
        @{Name="夸克"; Paths=@(
            "${env:ProgramFiles}\Quark\quark.exe",
            "${env:ProgramFiles(x86)}\Quark\quark.exe",
            "${env:LocalAppData}\Quark\quark.exe",
            "G:\夸克浏览器\Quark程序\quark.exe"
        )},
        @{Name="Chrome"; Paths=@(
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
            "${env:LocalAppData}\Google\Chrome\Application\chrome.exe"
        )}
    )
    foreach ($b in $browsers) {
        foreach ($p in $b.Paths) {
            if (Test-Path $p) {
                Write-Log "找到浏览器: $($b.Name) ($p)"
                return @{ Name=$b.Name; Path=$p }
            }
        }
    }
    Write-Log "未找到任何支持的浏览器"
    return $null
}

# ===== Win32 API =====
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
    # 尝试多个窗口类名（夸克 / Edge / Chrome 可能用不同类名）
    $windowClasses = @("Chrome_WidgetWin_1", "MozillaWindowClass", "QuarkWindow")
    $sb = New-Object System.Text.StringBuilder(256)

    foreach ($cls in $windowClasses) {
        $ptr = [IntPtr]::Zero
        while (($ptr = [PinAPI]::FindWindowEx([IntPtr]::Zero, $ptr, $cls, $null)) -ne [IntPtr]::Zero) {
            [PinAPI]::GetWindowText($ptr, $sb, 256) | Out-Null
            $title = $sb.ToString()
            if ($title -like "*待办*" -or $title -like "*清单*" -or $title -like "*todo*" -or $title -like "*Todo*" -or $title -like "*localhost:8765*") {
                $script:hwnd = $ptr
                Write-Log "找到窗口(类=$cls): $title"
                return $ptr
            }
        }
    }
    Write-Log "未找到待办窗口（已搜索 $($windowClasses -join ', ')）"
    return [IntPtr]::Zero
}

function Set-Pin {
    $h = Find-TodoWindow
    if ($h -eq [IntPtr]::Zero) { return $false }
    [PinAPI]::SetWindowPos($h, [PinAPI]::HWND_TOPMOST, 0, 0, 0, 0,
        [PinAPI]::SWP_NOMOVE -bor [PinAPI]::SWP_NOSIZE) | Out-Null
    $script:isPinned = $true
    Write-Log "✅ 已置顶"
    return $true
}

function Set-Unpin {
    $h = Find-TodoWindow
    if ($h -eq [IntPtr]::Zero) { return $false }
    [PinAPI]::SetWindowPos($h, [PinAPI]::HWND_NOTOPMOST, 0, 0, 0, 0,
        [PinAPI]::SWP_NOMOVE -bor [PinAPI]::SWP_NOSIZE) | Out-Null
    $script:isPinned = $false
    Write-Log "🔓 已取消置顶"
    return $true
}

# ===== MIME types =====
$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css" = "text/css"
    ".js" = "application/javascript"
    ".json" = "application/json"
    ".png" = "image/png"
    ".jpg" = "image/jpeg"
    ".svg" = "image/svg+xml"
    ".ico" = "image/x-icon"
}

# ===== TCP HTTP 服务器 =====
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
try {
    $listener.Start()
    Write-Log "🚀 本地服务器已启动: http://localhost:$Port"
} catch {
    Write-Log "❌ 无法启动服务器(端口 $Port 被占用): $_"
    Read-Host "按 Enter 退出"
    exit 1
}

# ===== 自动打开浏览器 =====
$browser = Find-Browser
if ($browser) {
    $appUrl = "http://localhost:$Port"
    Write-Log "使用 $($browser.Name) 启动 App 模式: $appUrl"

    # 夸克和 Chrome 可能需要不同的 app 模式参数
    $appArgs = @()
    if ($browser.Name -eq "夸克") {
        # 夸克浏览器：尝试 --app 模式，如果不支持则用新窗口
        $appArgs = @("--app=$appUrl", "--new-window")
    } elseif ($browser.Name -eq "Edge") {
        $appArgs = @("--app=$appUrl", "--new-window", "--allow-insecure-localhost")
    } else {
        # Chrome
        $appArgs = @("--app=$appUrl", "--new-window")
    }

    try {
        Start-Process -FilePath $browser.Path -ArgumentList $appArgs
        Write-Log "浏览器已启动，等待窗口..."
    } catch {
        Write-Log "启动浏览器失败: $_"
    }

    Start-Sleep -Seconds 3
    # 初始置顶
    $h = Find-TodoWindow
    if ($h -ne [IntPtr]::Zero) {
        [PinAPI]::SetWindowPos($h, [PinAPI]::HWND_TOPMOST, 0, 0, 0, 0,
            [PinAPI]::SWP_NOMOVE -bor [PinAPI]::SWP_NOSIZE) | Out-Null
        $script:isPinned = $true
        Write-Log "✅ 窗口已自动置顶"
    } else {
        Write-Log "⚠️ 未能找到窗口自动置顶，请点击 App 内 📌 按钮手动置顶"
    }
} else {
    Write-Log "❌ 未找到任何浏览器，请安装 Edge / Chrome / 夸克"
    Write-Log "手动打开: http://localhost:$Port"
    # 弹出提示
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "未找到支持的浏览器（Edge / Chrome / 夸克）。`n`n请手动打开浏览器访问：http://localhost:$Port`n`n然后点击 App 内的 📌 按钮置顶。",
        "待办清单 - 启动提示", "OK", "Information"
    )
}

# 主循环
while ($true) {
    try {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $writer = New-Object System.IO.StreamWriter($stream)
        $writer.AutoFlush = $true

        # 解析 HTTP 请求
        $firstLine = $reader.ReadLine()
        $method, $path = "GET", "/"
        if ($firstLine -match '^(GET|POST)\s+(\S+)') {
            $method = $Matches[1]
            $path = $Matches[2]
        }
        # 跳过其余头部
        while (($l = $reader.ReadLine()) -ne "" -and $l -ne $null) { }

        Write-Log "$method $path"

        # ===== API 路由 =====
        $isApi = $true
        $body = ""
        $code = 200
        $contentType = "application/json"

        switch -Wildcard ($path) {
            "/pin" {
                $ok = Set-Pin
                $body = "{`"pinned`":$($ok.ToString().ToLower())}"
            }
            "/unpin" {
                $ok = Set-Unpin
                $body = "{`"pinned`":false}"
            }
            "/toggle" {
                $ok = if ($script:isPinned) { Set-Unpin } else { Set-Pin }
                $body = "{`"pinned`":$($script:isPinned.ToString().ToLower())}"
            }
            "/status" {
                $h = Find-TodoWindow
                $alive = $h -ne [IntPtr]::Zero
                $body = "{`"pinned`":$($script:isPinned.ToString().ToLower()),`"alive`":$($alive.ToString().ToLower())}"
            }
            default {
                # 静态文件
                $isApi = $false
                $filePath = if ($path -eq "/") { "index.html" } else { $path.TrimStart("/") }
                $fullPath = Join-Path $script:rootDir $filePath
                # 安全检查：防止目录遍历
                if (-not $fullPath.StartsWith($script:rootDir)) {
                    $code = 403; $body = "Forbidden"
                } elseif (Test-Path $fullPath -PathType Leaf) {
                    $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
                    $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
                    $body = [System.IO.File]::ReadAllBytes($fullPath)
                } else {
                    $code = 404; $body = "Not Found: $path"; $contentType = "text/plain"
                }
            }
        }

        # 构建响应
        if ($isApi -or $code -ne 200) {
            $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
        } else {
            $bodyBytes = $body  # 已经是字节数组
        }
        $response = "HTTP/1.1 $code $([System.Net.HttpStatusCode]::$code)`r`nContent-Type: $contentType`r`nContent-Length: $($bodyBytes.Length)`r`nConnection: close`r`n`r`n"
        $writer.Write($response)
        $writer.Flush()
        $stream.Write($bodyBytes, 0, $bodyBytes.Length)
        $client.Close()
    } catch {
        Write-Log "错误: $_"
    }
}
