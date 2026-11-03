$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Administrator privileges are required. Open Terminal (Admin) and run this script again.'
}

$night = Join-Path $root 'run-night-evaluation.ps1'
$daily = Join-Path $root 'run-daily-commander.ps1'
if (-not (Test-Path $night)) { throw 'run-night-evaluation.ps1 not found' }
if (-not (Test-Path $daily)) { throw 'run-daily-commander.ps1 not found' }

$node = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $node)) { $node = (Get-Command node -ErrorAction Stop).Source }
& $node --check (Join-Path $root 'src\operations-agent.js')
if ($LASTEXITCODE -ne 0) { throw 'operations-agent.js syntax check failed' }

$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$nightCmd = '"' + $ps + '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $night + '"'
$dailyCmd = '"' + $ps + '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $daily + '"'

schtasks.exe /Create /TN 'CashFlowEngine-M8-NightEvaluation' /TR $nightCmd /SC DAILY /ST 22:30 /RL HIGHEST /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to register Night Evaluation task.' }
schtasks.exe /Create /TN 'CashFlowEngine-M8-DailyCommander' /TR $dailyCmd /SC DAILY /ST 06:30 /RL HIGHEST /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to register Daily Commander task.' }

Write-Host 'M8 Operations Agents installed.' -ForegroundColor Green
Get-ScheduledTask -TaskName 'CashFlowEngine-M8-NightEvaluation','CashFlowEngine-M8-DailyCommander' | Select-Object TaskName,State | Format-Table -AutoSize
Write-Host 'Night Evaluation: 22:30 JST daily'
Write-Host 'Daily Commander: 06:30 JST daily'
Write-Host 'Reports: .data\reports\'
Write-Host 'Daily plan: .data\latest-daily-plan.json'
