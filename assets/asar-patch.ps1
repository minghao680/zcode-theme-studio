# zcode-theme-studio: patch app.asar so themes work on normal launches.
# Invoked by the asar_patch MCP tool. If not elevated, relaunches itself via UAC;
# the elevated instance runs the full patch (asar write needs admin).
# Writes: index.html loader (inside asar) + bridge engine (user-writable location).
param(
  [Parameter(Mandatory=$true)][string]$Asar,
  [Parameter(Mandatory=$true)][string]$PluginRoot,
  [Parameter(Mandatory=$true)][string]$BridgeUrl,
  [Parameter(Mandatory=$true)][string]$BridgePath,
  [switch]$NoElevate
)

$ErrorActionPreference = 'Stop'

# Elevate once if not running as admin; the elevated instance does the whole job.
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $NoElevate -and -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $args2 = @('-NoProfile','-ExecutionPolicy','Bypass','-File', $PSCommandPath,
    '-Asar', $Asar, '-PluginRoot', $PluginRoot, '-BridgeUrl', $BridgeUrl, '-BridgePath', $BridgePath)
  $proc = Start-Process powershell.exe -Verb RunAs -PassThru -Wait -ArgumentList $args2
  if ($proc.ExitCode -eq 0) { Write-Output '{"patched":true,"elevated":true}'; exit 0 }
  Write-Output "administrator approval declined or failed (exit $($proc.ExitCode))"; exit 1
}

# ZCode must not be running from the install we are patching
$installDir = Split-Path (Split-Path $Asar)
$procs = Get-Process ZCode -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ((Split-Path $_.Path) -eq $installDir) }
if ($procs) { Write-Output 'ZCode is running from the install directory - close it and retry.'; exit 1 }

# Locate node: PATH first (dev machines), else bundled electron-as-node
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = Join-Path $env:ProgramFiles 'nodejs\node.exe' }
if (-not (Test-Path $node) -and -not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Output 'node.exe not found (need it to run the patcher).'; exit 1
}

$root = $PluginRoot.replace('\', '/')
$rootUrl = "file:///$root"
$tmpJs2 = Join-Path $env:TEMP 'zt-asar-patch-run.mjs'
@"
import { readAsarFile, patchAsarWithBackup } from '$rootUrl/lib/asar.mjs';
import { isPatched, injectLoaderTag, writeBridge } from '$rootUrl/lib/bridge.mjs';
const [asar, entry, bridgeUrl, bridgePath, configPath] = process.argv.slice(2);
const { readFileSync } = await import('node:fs');
const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
const html = readAsarFile(asar, entry).toString('utf8');
// Already patched AND the loader URL is valid -> just refresh the bridge.
// A stale loader (e.g. the old file%3A encoding bug) must be rewritten in place.
const cur = html.match(/<script src="([^"]+bridge\.js)"/);
const urlOk = cur && cur[1] === bridgeUrl;
if (isPatched(html) && urlOk) { writeBridge(bridgePath, cfg); console.log(JSON.stringify({ alreadyPatched: true, bridge: bridgePath })); process.exit(0); }
const patched = injectLoaderTag(html, bridgeUrl);
const r = patchAsarWithBackup(asar, entry, Buffer.from(patched, 'utf8'));
const back = readAsarFile(asar, entry).toString('utf8');
if (!isPatched(back)) { console.log(JSON.stringify({ error: 'roundtrip verification failed' })); process.exit(1); }
const fixed = back.match(/<script src="([^"]+bridge\.js)"/);
if (!fixed || fixed[1] !== bridgeUrl) { console.log(JSON.stringify({ error: 'loader url mismatch after patch', got: fixed && fixed[1], want: bridgeUrl })); process.exit(1); }
writeBridge(bridgePath, cfg);
console.log(JSON.stringify({ backup: r.backupPath, htmlSize: patched.length, bridge: bridgePath, loaderUrl: bridgeUrl, repaired: !!cur }));
"@ | Set-Content -Path $tmpJs2 -Encoding ASCII

$configPath = Join-Path $env:USERPROFILE '.zcode\zcode-theme-studio.config.json'
$out = & $node $tmpJs2 $Asar 'out/renderer/index.html' $BridgeUrl $BridgePath $configPath 2>&1
$nodeExit = $LASTEXITCODE
Remove-Item $tmpJs2 -ErrorAction SilentlyContinue
if ($nodeExit -ne 0) { Write-Output $out; exit 1 }
Write-Output $out
exit 0
