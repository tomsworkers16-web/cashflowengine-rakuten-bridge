$ErrorActionPreference = 'Stop'

Write-Host '=== Cash Flow Engine M8 Local Core Setup ===' -ForegroundColor Cyan

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Require-Command($name, $installHint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name not found. $installHint"
  }
}

Require-Command 'node' 'Install Node.js 22 or newer.'
Require-Command 'npm' 'Install Node.js 22 or newer.'

$nodeVersionText = (node -v).TrimStart('v')
$nodeVersion = [version]$nodeVersionText
if ($nodeVersion.Major -lt 22) {
  throw 'Node.js 22 or newer is required.'
}

$chromeCandidates = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
)
$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  throw 'Google Chrome not found. Install Chrome and run setup again.'
}

Write-Host '[1/6] Running npm install...'
npm install
if ($LASTEXITCODE -ne 0) {
  throw 'npm install failed.'
}

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host '[2/6] Created local .env file.' -ForegroundColor Green
} else {
  Write-Host '[2/6] Existing .env preserved.'
}

New-Item -ItemType Directory -Force -Path '.data\threads-profile' | Out-Null
Write-Host '[3/6] Prepared local data and persistent Chrome profile directories.'

$taskName = 'CashFlowEngine-M8-LocalCore'
$nodeExe = (Get-Command node).Source
$corePath = Join-Path $root 'src\local-core.js'
$launcher = Join-Path $root 'start-local-core.cmd'

$launcherLines = @(
  '@echo off',
  ('cd /d "{0}"' -f $root),
  ('"{0}" --env-file=.env "{1}"' -f $nodeExe, $corePath)
)
$launcherLines | Set-Content -Path $launcher -Encoding ASCII

$action = New-ScheduledTaskAction -Execute $launcher -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)

try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Cash Flow Engine M8 local-only runtime' -Force | Out-Null
  Write-Host '[4/6] Registered Windows logon auto-start and restart policy.' -ForegroundColor Green
} catch {
  Write-Warning 'Scheduled task registration failed. Run PowerShell as Administrator and retry.'
}

try {
  powercfg /change standby-timeout-ac 0 | Out-Null
  powercfg /change hibernate-timeout-ac 0 | Out-Null
  Write-Host '[5/6] Disabled AC sleep and hibernation.' -ForegroundColor Green
} catch {
  Write-Warning 'Power settings update failed. Set Sleep to Never manually in Windows Settings.'
}

Write-Host '[6/6] M8 local runtime setup completed.' -ForegroundColor Green
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Yellow
Write-Host '1) Keep CFE_AUTO_POST_ENABLED=false.'
Write-Host '2) Add Meta Threads and Rakuten credentials to .env locally only.'
Write-Host '3) Start the local core with: npm start'
Write-Host '4) Sign in to Threads once in the Chrome window using rakumitsu_select.'
Write-Host '5) Confirm: http://127.0.0.1:18787/health'
Write-Host '6) After verification, switch CFE_AUTO_POST_ENABLED=true.'
Write-Host ''
Write-Host 'Render, Supabase, TinyFish, and GitHub Actions are not required for local runtime.'
