$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# Force headless browser for normal server operation while preserving the existing persistent profile.
$envPath=Join-Path $root '.env'
if(-not (Test-Path $envPath)){ throw '.env not found' }
$envText=Get-Content $envPath -Raw
if($envText -match '(?m)^THREADS_HEADLESS='){
  $envText=[regex]::Replace($envText,'(?m)^THREADS_HEADLESS=.*$','THREADS_HEADLESS=true')
}else{
  $envText += "`r`nTHREADS_HEADLESS=true`r`n"
}
Set-Content -Path $envPath -Value $envText -Encoding UTF8

$taskName='CashFlowEngine-M8-LocalCore'
$watchdogTask='CashFlowEngine-M8-Watchdog'
$runner=Join-Path $root 'run-local-core-hidden.ps1'
$watchdog=Join-Path $root 'watchdog.ps1'

# Replace visible CMD launcher with hidden PowerShell launcher.
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $runner) -WorkingDirectory $root
$trigger=New-ScheduledTaskTrigger -AtLogOn
$settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Cash Flow Engine M8 local core hidden server runtime' -Force | Out-Null

# Health watchdog every 5 minutes.
$wdAction=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $watchdog)
$wdTrigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::MaxValue)
$wdSettings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName $watchdogTask -Action $wdAction -Trigger $wdTrigger -Settings $wdSettings -Description 'Watchdog for Cash Flow Engine M8 local core' -Force | Out-Null

# Restart into new hidden/headless mode now.
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName $taskName

Write-Host 'M8 server mode configured.' -ForegroundColor Green
Write-Host 'Local Core: hidden background task'
Write-Host 'Threads browser: headless'
Write-Host 'Watchdog: every 5 minutes'
Write-Host 'Health: http://127.0.0.1:18787/health'
