# zcode-theme-studio: create a desktop shortcut that launches ZCode with CDP enabled.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File shortcut-helper.ps1 -Port 9333
param(
  [int]$Port = 9333
)

$ErrorActionPreference = 'Stop'

# Locate ZCode.exe
$zcodeExe = Join-Path $env:ProgramFiles 'ZCode\ZCode.exe'
if (-not (Test-Path $zcodeExe)) {
  $candidates = @(
    'C:\Program Files\ZCode\ZCode.exe',
    'D:\Program Files\ZCode\ZCode.exe'
  ) | Where-Object { Test-Path $_ }
  if (-not $candidates) { throw 'ZCode.exe not found. Install ZCode to the default location first.' }
  $zcodeExe = $candidates[0]
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'ZCode (Themed).lnk'

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnkPath)
$sc.TargetPath = $zcodeExe
$sc.Arguments = "--remote-debugging-port=$Port"
$sc.IconLocation = $zcodeExe
$sc.Description = "ZCode with theme/wallpaper injection enabled (CDP port $Port, localhost only)"
$sc.Save()

Write-Output "created=$lnkPath"
Write-Output "target=$zcodeExe"
Write-Output "port=$Port"
