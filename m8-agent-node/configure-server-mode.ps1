$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw 'Administrator privileges are required. Open Terminal (Admin) and run this script again.'
}

# Force headless browser for normal server operation while preserving the existing persistent profile.
$envPath = Join-Path $root '.env'
if (-not (Test-Path $envPath)) { throw '.env not found' }
$envText = Get-Content $envPath -Raw
if ($envText -match '(?m)^THREADS_HEADLESS=') {
  $envText = [regex]::Replace($envText, '(?m)^THREADS_HEADLESS=.*$', 'THREADS_HEADLESS=true')
} else {
  $envText += "`r`nTHREADS_HEADLESS=true`r`n"
}
Set-Content -Path $envPath -Value $envText -Encoding UTF8

# Important: never rewrite tracked runtime source from this setup script.
# Runtime source changes must come from Git and be validated before deployment.

$taskName = 'CashFlowEngine-M8-LocalCore'
$watchdogTask = 'CashFlowEngine-M8-Watchdog'
$autoUpdateTask = 'CashFlowEngine-M8-AutoUpdate'
$runner = Join-Path $root 'run-local-core-hidden.ps1'
$watchdog = Join-Path $root 'watchdog.ps1'
$autoUpdate = Join-Path $root 'auto-update-agent.ps1'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $runner) -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Cash Flow Engine M8 local core hidden server runtime' -Force | Out-Null

$wdCommand = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $watchdog
& schtasks.exe /Create /TN $watchdogTask /TR $wdCommand /SC MINUTE /MO 5 /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to register watchdog scheduled task.' }

if (Test-Path $autoUpdate) {
  $auCommand = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $autoUpdate
  & schtasks.exe /Create /TN $autoUpdateTask /TR $auCommand /SC MINUTE /MO 5 /RL HIGHEST /F | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to register auto update scheduled task.' }
}

Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 5

$healthOk = $false
try {
  $r = Invoke-RestMethod -Uri 'http://127.0.0.1:18787/health' -TimeoutSec 8
  if ($r.ok -eq $true) { $healthOk = $true }
} catch {}

$mainTask = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
$wdTask = Get-ScheduledTask -TaskName $watchdogTask -ErrorAction Stop
$auTask = Get-ScheduledTask -TaskName $autoUpdateTask -ErrorAction SilentlyContinue

if (-not $healthOk) {
  Write-Host ('Local Core task: ' + $mainTask.State) -ForegroundColor Yellow
  Write-Host 'Health check: FAILED' -ForegroundColor Red
  Write-Host 'Check .data\local-core-task.log for the startup error.' -ForegroundColor Yellow
  exit 1
}

Write-Host 'M8 server mode configured.' -ForegroundColor Green
Write-Host ('Local Core task: ' + $mainTask.State)
Write-Host ('Watchdog task: ' + $wdTask.State)
if ($auTask) { Write-Host ('Auto Update task: ' + $auTask.State) }
Write-Host 'Threads browser: headless'
Write-Host 'Watchdog: every 5 minutes'
if ($auTask) { Write-Host 'Auto Update: every 5 minutes with preflight validation and rollback' }
Write-Host 'Health check: OK'
Write-Host 'Health: http://127.0.0.1:18787/health'
