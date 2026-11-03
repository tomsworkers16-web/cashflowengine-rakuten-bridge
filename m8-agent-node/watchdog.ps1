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
    if ($pidText -match '^\d+$') { Stop-Process -Id ([int]$pidText) -Force -ErrorAction SilentlyContinue }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
  }
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine -like '*local-core*.js*'
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
  Start-ScheduledTask -TaskName $task
}

# Recover a missed Night Evaluation after 23:00 JST.
try {
  $now = Get-Date
  if ($now.Hour -ge 23) {
    $report = Join-Path $root '.data\latest-night-evaluation.json'
    $today = $now.ToString('yyyy-MM-dd')
    $reportDay = $null
    if (Test-Path $report) { $reportDay = (Get-Content $report -Raw | ConvertFrom-Json).jstDate }
    if ($reportDay -ne $today) {
      $nightTask = Get-ScheduledTask -TaskName 'CashFlowEngine-M8-NightEvaluation' -ErrorAction SilentlyContinue
      if ($nightTask -and $nightTask.State -ne 'Running') { Start-ScheduledTask -TaskName 'CashFlowEngine-M8-NightEvaluation' }
    }
  }
} catch {}

# Recover a missed Daily Commander after 06:45 JST.
try {
  $now = Get-Date
  if ($now.Hour -gt 6 -or ($now.Hour -eq 6 -and $now.Minute -ge 45)) {
    $plan = Join-Path $root '.data\latest-daily-plan.json'
    $today = $now.ToString('yyyy-MM-dd')
    $planDay = $null
    if (Test-Path $plan) { $planDay = (Get-Content $plan -Raw | ConvertFrom-Json).jstDate }
    if ($planDay -ne $today) {
      $dailyTask = Get-ScheduledTask -TaskName 'CashFlowEngine-M8-DailyCommander' -ErrorAction SilentlyContinue
      if ($dailyTask -and $dailyTask.State -ne 'Running') { Start-ScheduledTask -TaskName 'CashFlowEngine-M8-DailyCommander' }
    }
  }
} catch {}
