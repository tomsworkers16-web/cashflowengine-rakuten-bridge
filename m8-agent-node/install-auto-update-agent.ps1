$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Administrator privileges are required. Open Terminal (Admin) and run this script again.'
}

$agent = Join-Path $root 'auto-update-agent.ps1'
if (-not (Test-Path $agent)) { throw 'auto-update-agent.ps1 not found' }

$task = 'CashFlowEngine-M8-AutoUpdate'
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$cmd = '"' + $ps + '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $agent + '"'

schtasks.exe /Create /TN $task /SC MINUTE /MO 5 /TR $cmd /RL HIGHEST /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to register Auto Update scheduled task.' }

$opsInstaller = Join-Path $root 'install-operations-agents.ps1'
if (Test-Path $opsInstaller) {
  & $opsInstaller
  if ($LASTEXITCODE -ne 0) { throw 'Failed to install M8 operations agents.' }
}

Start-ScheduledTask -TaskName $task
Start-Sleep -Seconds 3

$info = Get-ScheduledTask -TaskName $task | Select-Object TaskName,State
Write-Host 'M8 Auto Update Agent installed.' -ForegroundColor Green
$info | Format-Table -AutoSize
Write-Host 'Check interval: every 5 minutes'
Write-Host 'Safety: fast-forward only, clean tracked worktree required, JS syntax preflight, health verification, automatic rollback'
Write-Host 'Log: .data\auto-update-agent.log'
if (Test-Path $opsInstaller) { Write-Host 'Night Evaluation and Daily Commander are also installed.' }
