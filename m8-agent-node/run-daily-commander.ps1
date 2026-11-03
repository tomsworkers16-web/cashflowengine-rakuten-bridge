$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$dataDir = Join-Path $root '.data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$log = Join-Path $dataDir 'daily-commander.log'
$restartFlag = Join-Path $dataDir 'restart-required.flag'
$node = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $node)) { $node = (Get-Command node -ErrorAction Stop).Source }

try {
  & $node --env-file=.env src\operations-agent.js daily-commander *>> $log
  if ($LASTEXITCODE -ne 0) { throw 'daily_commander_failed' }

  if (Test-Path $restartFlag) {
    Stop-ScheduledTask -TaskName 'CashFlowEngine-M8-LocalCore' -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
      $_.CommandLine -and $_.CommandLine -like '*local-core*.js*'
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
    Start-ScheduledTask -TaskName 'CashFlowEngine-M8-LocalCore'
    Start-Sleep -Seconds 6
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:18787/health' -TimeoutSec 12
    if ($health.ok -ne $true) { throw 'health_failed_after_daily_strategy_restart' }
    Remove-Item $restartFlag -Force -ErrorAction SilentlyContinue
    Add-Content -Path $log -Value ('[{0}] strategy_applied_and_core_restarted' -f (Get-Date).ToString('o'))
  }
} catch {
  Add-Content -Path $log -Value ('[{0}] error={1}' -f (Get-Date).ToString('o'), $_.Exception.Message)
  exit 1
}
