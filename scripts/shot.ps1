# 抓取 DeepSeek Harness 窗口截图（用于自检 UI）
# 用法: pwsh -File shot.ps1 [-OutPath E:\Allen\.tmp\shots\shot.png]
param(
  [string]$OutPath = "E:\Allen\.tmp\shots\shot.png",
  [string]$ProcessName = "DSH Desktop"
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Shot {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@

$proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Output "NO_WINDOW"; exit 1 }

$h = $proc.MainWindowHandle
if ([Win32Shot]::IsIconic($h)) { [Win32Shot]::ShowWindow($h, 9) | Out-Null; Start-Sleep -Milliseconds 400 }
[Win32Shot]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 500

$rect = New-Object Win32Shot+RECT
[Win32Shot]::GetWindowRect($h, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$hgt = $rect.Bottom - $rect.Top
if ($w -le 0 -or $hgt -le 0) { Write-Output "BAD_RECT"; exit 1 }

New-Item -ItemType Directory -Force -Path (Split-Path $OutPath) | Out-Null
$bmp = New-Object System.Drawing.Bitmap $w, $hgt
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
$bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

Write-Output ("OK {0} {1}x{2}" -f $OutPath, $w, $hgt)
