$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# Existing scheduled tasks were created elevated, so this script must also run elevated.
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

# Enable Chromium sandbox in the local Playwright runtime to remove --no-sandbox mode.
$corePath = Join-Path $root 'src\local-core.js'
$coreText = Get-Content $corePath -Raw
if ($coreText -notmatch 'chromiumSandbox:\s*true') {
  $coreText = $coreText -replace 'headless:\s*HEADLESS,', "headless: HEADLESS,`r`n      chromiumSandbox: true,"
  Set-Content -Path $corePath -Value $coreText -Encoding UTF8
}

$taskName = 'CashFlowEngine-M8-LocalCore'
$watchdogTask = 'CashFlowEngine-M8-Watchdog'
$runner = Join-Path $root 'run-local-core-hidden.ps1'
$watchdog = Join-Path $root 'watchdog.ps1'

# Replace visible CMD launcher with hidden PowerShell launcher.
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $runner) -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Cash Flow Engine M8 local core hidden server runtime' -Force | Out-Null

# Health watchdog every 5 minutes. Use schtasks to avoid invalid repetition-duration XML on some Windows builds.
$wdCommand = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $watchdog
& schtasks.exe /Create /TN $watchdogTask /TR $wdCommand /SC MINUTE /MO 5 /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to register watchdog scheduled task.' }

# Restart into new hidden/headless mode now.
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3

$mainTask = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
$wdTask = Get-ScheduledTask -TaskName $watchdogTask -ErrorAction Stop

Write-Host 'M8 server mode configured.' -ForegroundColor Green
Write-Host ('Local Core task: ' + $mainTask.State)
Write-Host ('Watchdog task: ' + $wdTask.State)
Write-Host 'Threads browser: headless with Chromium sandbox enabled'
Write-Host 'Watchdog: every 5 minutes'
Write-Host 'Health: http://127.0.0.1:18787/health'
