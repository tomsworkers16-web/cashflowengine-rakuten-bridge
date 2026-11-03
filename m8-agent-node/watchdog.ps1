$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$task = 'CashFlowEngine-M8-LocalCore'
$pidFile = Join-Path $root '.data\local-core.pid'
$healthy = $false

try {
  $r = Invoke-RestMethod -Uri 'http://127.0.0.1:18787/health' -TimeoutSec 8
  if ($r.ok -eq $true) { $healthy = $true }
} catch {}

if (-not $healthy) {
  Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1

  if (Test-Path $pidFile) {
    $pidText = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($pidText -match '^\d+$') {
      Stop-Process -Id ([int]$pidText) -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
  }

  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine -like '*m8-agent-node*local-core.js*'
  } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

  Start-Sleep -Seconds 1
  Start-ScheduledTask -TaskName $task
}
