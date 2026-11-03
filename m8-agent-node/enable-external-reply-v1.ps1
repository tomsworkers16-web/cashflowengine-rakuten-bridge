$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Administrator privileges are required. Open Terminal (Admin) and run this script again.'
}

$envPath = Join-Path $root '.env'
if (-not (Test-Path $envPath)) { throw '.env not found' }
Copy-Item $envPath ($envPath + '.bak-external-reply-v1') -Force

function Set-EnvValue([string]$key, [string]$value) {
  $text = Get-Content $envPath -Raw
  $pattern = '(?m)^' + [regex]::Escape($key) + '=.*$'
  if ($text -match $pattern) {
    $text = [regex]::Replace($text, $pattern, ($key + '=' + $value))
  } else {
    if (-not $text.EndsWith("`n")) { $text += "`r`n" }
    $text += ($key + '=' + $value + "`r`n")
  }
  Set-Content -Path $envPath -Value $text -Encoding UTF8
}

Set-EnvValue 'CFE_EXTERNAL_REPLY_ENABLED' 'true'
Set-EnvValue 'CFE_EXTERNAL_REPLY_MAX_PER_DAY' '3'
Set-EnvValue 'CFE_EXTERNAL_REPLY_MIN_SCORE' '45'
Set-EnvValue 'THREADS_SCAN_INTERVAL_MINUTES' '30'
Set-EnvValue 'THREADS_HEADLESS' 'true'
Set-EnvValue 'THREADS_DISCOVERY_QUERIES' '家事 時短,収納 困る,掃除 面倒,献立 悩み,便利グッズ'

$node = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $node)) {
  $cmd = Get-Command node -ErrorAction Stop
  $node = $cmd.Source
}

& $node --check (Join-Path $root 'src\external-reply-engine.js')
if ($LASTEXITCODE -ne 0) { throw 'external-reply-engine.js syntax check failed' }
& $node --check (Join-Path $root 'src\local-core-v2.js')
if ($LASTEXITCODE -ne 0) { throw 'local-core-v2.js syntax check failed' }

$task = 'CashFlowEngine-M8-LocalCore'
Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -and $_.CommandLine -like '*local-core*.js*'
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1
Start-ScheduledTask -TaskName $task
Start-Sleep -Seconds 8

$health = Invoke-RestMethod -Uri 'http://127.0.0.1:18787/health' -TimeoutSec 15
if ($health.ok -ne $true) { throw 'Local Core health check failed' }
if ($health.state.version -ne 'm8-local-core-v2') { throw ('Unexpected Local Core version: ' + $health.state.version) }

Write-Host 'External Reply Engine v1 enabled.' -ForegroundColor Green
Write-Host ('Local Core version: ' + $health.state.version)
Write-Host ('Auto Post: ' + $health.autoPostEnabled)
Write-Host ('External Reply: ' + $health.externalReply.enabled)
Write-Host ('External Reply max/day: ' + $health.externalReply.maxPerDay)
Write-Host ('External Reply min score: ' + $health.externalReply.minScore)
Write-Host ('Browser OK: ' + $health.externalReply.browserOk)
Write-Host ('Discovery queries: ' + (($health.externalReply.discoveryQueries -join ', ')))
Write-Host 'Health: http://127.0.0.1:18787/health'
