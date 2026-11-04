# zcode-theme-studio: restore app.asar from the most recent .zt-backup-*
# Invoked by the asar_patch tool with {"restore":true}. Elevates if needed.
param(
  [Parameter(Mandatory=$true)][string]$Asar
)

$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $args2 = @('-NoProfile','-ExecutionPolicy','Bypass','-File', $PSCommandPath, '-Asar', $Asar)
  $proc = Start-Process powershell.exe -Verb RunAs -PassThru -Wait -ArgumentList $args2
  if ($proc.ExitCode -eq 0) { Write-Output '{"restored":true,"elevated":true}'; exit 0 }
  Write-Output "administrator approval declined or failed (exit $($proc.ExitCode))"; exit 1
}

$procs = Get-Process ZCode -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ((Split-Path $_.Path) -eq (Split-Path (Split-Path $Asar))) }
if ($procs) { Write-Output 'ZCode is running from the install directory - close it and retry.'; exit 1 }

$dir = Split-Path $Asar
$base = Split-Path $Asar -Leaf
$backup = Get-ChildItem $dir -Filter "$base.zt-backup-*" | Sort-Object Name -Descending | Select-Object -First 1
if (-not $backup) { Write-Output 'no backup found'; exit 1 }

Copy-Item $backup.FullName $Asar -Force
Write-Output ('{"restored":true,"backup":"' + $backup.Name + '"}')
exit 0
