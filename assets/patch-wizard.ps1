# zcode-theme-studio: interactive patch wizard (all logic in PowerShell, no cmd escaping).
# Double-click launcher: 一键打补丁-主题工作台.cmd -> runs this file.
$ErrorActionPreference = 'Continue'

# Plugin root = the folder that contains this script's assets\ directory.
$Plugin = Split-Path -Parent $PSScriptRoot
$Asar   = 'C:\Program Files\ZCode\resources\app.asar'
$BridgePath = Join-Path $env:USERPROFILE '.zcode\zcode-theme-studio\bridge.js'
# file:/// URL: protocol + drive colon stay literal; only path segments are escaped
$bp = $BridgePath -replace '\\', '/'
if ($bp -match '^([A-Za-z]):(.*)$') {
  $driveLetter = $Matches[1]
  $segs = $Matches[2].Split('/') | Where-Object { $_ -ne '' } | ForEach-Object { [uri]::EscapeDataString($_) }
  $BridgeUrl = 'file:///' + $driveLetter + ':/' + ($segs -join '/')
} else {
  $BridgeUrl = 'file:///' + (($bp.Split('/') | Where-Object { $_ -ne '' } | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/')
}
$LogDir = Join-Path $env:USERPROFILE '.zcode\zcode-theme-studio'
$Log = Join-Path $LogDir 'patch.log'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $Log -Value $line -Encoding UTF8
  Write-Host $line
}
function Pause-Exit($code) {
  Write-Host ''
  Write-Host '按任意键关闭窗口...'
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
  exit $code
}

try {
  Clear-Host
  Write-Host '=================================================='
  Write-Host '  ZCode Theme Studio - asar 补丁向导'
  Write-Host '=================================================='
  Write-Host ''
  Log '=== wizard started ==='
  Log "plugin root : $Plugin"
  Log "asar target : $Asar"
  Log "bridge      : $BridgePath"

  # ---- sanity checks ----
  $patchPs1 = Join-Path $Plugin 'assets\asar-patch.ps1'
  if (-not (Test-Path $patchPs1)) { Write-Host "[错误] 缺少补丁脚本: $patchPs1"; Log "missing: $patchPs1"; Pause-Exit 1 }
  if (-not (Test-Path $Asar))      { Write-Host "[错误] 找不到 app.asar: $Asar"; Log 'asar missing'; Pause-Exit 1 }
  Write-Host '[检查] 插件脚本与 app.asar 均存在。'
  Log 'sanity ok'

  # ---- wait for ZCode to exit ----
  Write-Host ''
  Write-Host '  [提示] 需要 ZCode 完全退出（主窗口 + 托盘）。'
  Write-Host '         本窗口会自动等待，退出后立即继续。'
  Write-Host ''
  $waited = 0
  while (Get-Process -Name ZCode -ErrorAction SilentlyContinue) {
    Write-Host ("  等待 ZCode 退出... {0}s" -f $waited)
    Start-Sleep -Seconds 3
    $waited += 3
  }
  Write-Host '[OK] ZCode 已完全退出。'
  Log "zcode exited after ${waited}s"

  # ---- patch (this ps1 self-elevates; UAC silent on this machine) ----
  Write-Host ''
  Write-Host '[补丁] 正在执行（自动备份 + 回读校验）...'
  Log 'invoking asar-patch.ps1'
  $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $patchPs1 `
      -Asar $Asar -PluginRoot $Plugin -BridgeUrl $BridgeUrl -BridgePath $BridgePath 2>&1
  $code = $LASTEXITCODE
  $outText = ($out | Out-String).Trim()
  Log "patch exit=$code output=$outText"
  Write-Host $outText
  if ($code -ne 0) {
    Write-Host ''
    Write-Host '[失败] 补丁未完成（见上方输出 / patch.log）。'
    Write-Host '       常见原因：ZCode 未完全退出、UAC 被拒绝、或权限不足。'
    Pause-Exit 1
  }

  # ---- verify ----
  Write-Host ''
  Write-Host '[校验] 检查补丁标记...'
  $verify = & node -e "import(($Plugin.replace(/\/g,'/') + '/lib/asar.mjs')).then(m=>{const h=m.readAsarFile(process.argv[1],'out/renderer/index.html').toString('utf8');console.log(h.includes('zcode-theme-studio patched')?'PATCH-FOUND':'PATCH-MISSING')})" $Asar 2>&1
  Log "verify: $verify"
  Write-Host "      $verify"
  $backups = Get-ChildItem (Split-Path $Asar) -Filter 'app.asar.zt-backup-*' -ErrorAction SilentlyContinue
  if ($backups) { Write-Host ('      备份: ' + ($backups | Sort-Object Name -Descending | Select-Object -First 1).Name) }
  else { Write-Host '      备份: (未找到，补丁可能未写入)' }

  Write-Host ''
  if ("$verify" -match 'PATCH-FOUND') {
    Write-Host '=================================================='
    Write-Host '  成功！现在可以正常双击启动 ZCode，主题即刻生效。'
    Write-Host '=================================================='
    Log 'wizard success'
    Pause-Exit 0
  } else {
    Write-Host '=================================================='
    Write-Host '  补丁标记未找到，请把 patch.log 发给开发者排查。'
    Write-Host '=================================================='
    Pause-Exit 1
  }
} catch {
  Write-Host ''
  Write-Host ("[异常] " + $_.Exception.Message)
  Log ("exception: " + $_.Exception.Message)
  Pause-Exit 1
}
