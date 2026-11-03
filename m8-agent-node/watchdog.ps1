$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$task = 'CashFlowEngine-M8-LocalCore'
$pidFile = Join-Path $root '.data\local-core.pid'
$healthy = $false

try {
  $r = Invoke-RestMethod -Uri 'http://127.0.0.1:18787/health' -TimeoutSec 8
  if ($r.ok -eq $true) {
    $healthy = $true

    # When External Reply is enabled, browser worker health is part of service health.
    if ($r.externalReply -and $r.externalReply.enabled -eq $true) {
      if ($r.externalReply.browserOk -ne $true) { $healthy = $false }

      $lastScan = $r.state.lastThreadsScanAt
      if ($lastScan) {
        try {
          $ageMinutes = ((Get-Date) - ([DateTimeOffset]::Parse($lastScan)).LocalDateTime).TotalMinutes
          if ($ageMinutes -gt 75) { $healthy = $false }
        } catch { $healthy = $false }
      } else {
        $started = $r.state.startedAt
        if ($started) {
          try {
            $uptimeMinutes = ((Get-Date) - ([DateTimeOffset]::Parse($started)).LocalDateTime).TotalMinutes
            if ($uptimeMinutes -gt 10) { $healthy = $false }
          } catch {}
        }
      }
    }
  }
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
    $_.CommandLine -and $_.CommandLine -like '*local-core*.js*'
  } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

  Start-Sleep -Seconds 1
  Start-ScheduledTask -TaskName $task
}
