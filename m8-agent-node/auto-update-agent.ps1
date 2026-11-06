$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $root
Set-Location $repo

$dataDir = Join-Path $root '.data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$logFile = Join-Path $dataDir 'auto-update-agent.log'
$lockFile = Join-Path $dataDir 'auto-update-agent.lock'
$taskName = 'CashFlowEngine-M8-LocalCore'
$healthUrl = 'http://127.0.0.1:18787/health'

function Log([string]$message) { Add-Content -Path $logFile -Value ('[{0}] {1}' -f (Get-Date).ToString('o'), $message) }
function Health-Ok {
  param([int]$Attempts = 8, [int]$DelaySeconds = 2)
  for ($i = 1; $i -le $Attempts; $i++) {
    try { $r = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 8; if ($r.ok -eq $true) { return $true } } catch {}
    Start-Sleep -Seconds $DelaySeconds
  }
  return $false
}
# Avoid restarting the core near scheduled Threads posting slots.
function Test-PostingWindow {
  $slots = @('07:30','12:30','19:30')
  $envFile = Join-Path $root '.env'
  if (Test-Path $envFile) {
    $line = Get-Content -LiteralPath $envFile -Encoding UTF8 | Where-Object { $_.StartsWith('CFE_POST_SLOTS=') } | Select-Object -Last 1
    if ($line) {
      $raw = [string]$line
      $slots = $raw.Substring('CFE_POST_SLOTS='.Length).Trim().Trim('"').Trim("'").Split(',')
    }
  }
  try {
    $jst = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, [TimeZoneInfo]::FindSystemTimeZoneById('Tokyo Standard Time'))
  } catch { return $true }
  $minuteNow = $jst.Hour * 60 + $jst.Minute
  foreach ($slot in $slots) {
    $parts = $slot.Trim().Split(':')
    if ($parts.Count -ne 2) { continue }
    $hour = 0; $minute = 0
    if (-not [int]::TryParse($parts[0], [ref]$hour)) { continue }
    if (-not [int]::TryParse($parts[1], [ref]$minute)) { continue }
    if ($hour -lt 0 -or $hour -gt 23 -or $minute -lt 0 -or $minute -gt 59) { continue }
    $target = $hour * 60 + $minute
    if ($minuteNow -ge ($target - 20) -and $minuteNow -le ($target + 30)) { return $true }
  }
  return $false
}
function Stop-LocalCore {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine -like '*local-core*.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
function Start-LocalCore { Start-ScheduledTask -TaskName $taskName }
function Install-OperationsAgents {
  $installer = Join-Path $root 'install-operations-agents.ps1'
  if (Test-Path $installer) {
    try {
      & $installer *>> $logFile
      if ($LASTEXITCODE -eq 0) { Log 'operations_agents_install_ok' } else { Log ('operations_agents_install_exit=' + $LASTEXITCODE) }
    } catch { Log ('operations_agents_install_error=' + $_.Exception.Message) }
  }
}

if (Test-Path $lockFile) {
  try { $age = (Get-Date) - (Get-Item $lockFile).LastWriteTime; if ($age.TotalMinutes -lt 30) { Log 'skip=lock_active'; exit 0 } } catch {}
  Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
}
Set-Content -Path $lockFile -Value $PID -Encoding ASCII

try {
  $git = (Get-Command git -ErrorAction Stop).Source
  $nodeCandidates = @('C:\Program Files\nodejs\node.exe','C:\Program Files (x86)\nodejs\node.exe')
  $node = $nodeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $node) { $node = (Get-Command node -ErrorAction Stop).Source }
  $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
  if (-not $npm) { $npm = (Get-Command npm -ErrorAction Stop).Source }

  $dirty = & $git status --porcelain --untracked-files=no
  if ($dirty) { Log 'skip=tracked_worktree_dirty'; exit 0 }

  & $git fetch origin main --quiet
  if ($LASTEXITCODE -ne 0) { throw 'git_fetch_failed' }
  $current = (& $git rev-parse HEAD).Trim()
  $remote = (& $git rev-parse origin/main).Trim()
  if ($current -eq $remote) { Log ('no_update head=' + $current); exit 0 }

  & $git merge-base --is-ancestor $current $remote
  if ($LASTEXITCODE -ne 0) { Log ('skip=non_fast_forward current=' + $current + ' remote=' + $remote); exit 0 }

  $changed = @(& $git diff --name-only $current $remote)
  $m8Changed = @($changed | Where-Object { $_ -like 'm8-agent-node/*' })
  if ($m8Changed.Count -eq 0) {
    & $git merge --ff-only origin/main --quiet
    if ($LASTEXITCODE -ne 0) { throw 'git_fast_forward_failed' }
    Log ('updated_repo_only from=' + $current + ' to=' + $remote)
    exit 0
  }

  if (Test-PostingWindow) { Log 'skip=posting_window_defer_core_restart'; exit 0 }
  $stage = Join-Path $env:TEMP ('cfe-m8-update-stage-' + $PID)
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
  & $git worktree add --detach $stage origin/main --quiet
  if ($LASTEXITCODE -ne 0) { throw 'git_worktree_stage_failed' }
  try {
    $srcDir = Join-Path $stage 'm8-agent-node\src'
    $jsFiles = Get-ChildItem -Path $srcDir -Filter '*.js' -File -ErrorAction Stop
    foreach ($f in $jsFiles) { & $node --check $f.FullName; if ($LASTEXITCODE -ne 0) { throw ('syntax_check_failed:' + $f.Name) } }
  } finally { & $git worktree remove $stage --force 2>$null }

  Log ('deploy_start from=' + $current + ' to=' + $remote + ' files=' + ($m8Changed -join ','))
  Stop-LocalCore
  & $git merge --ff-only origin/main --quiet
  if ($LASTEXITCODE -ne 0) { throw 'git_fast_forward_failed_after_stop' }

  Push-Location $root
  try { & $npm install --no-audit --no-fund --silent; if ($LASTEXITCODE -ne 0) { throw 'npm_install_failed' } } finally { Pop-Location }

  Start-LocalCore
  if (Health-Ok) {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 8
    Log ('deploy_ok from=' + $current + ' to=' + $remote + ' version=' + $health.state.version)
    Install-OperationsAgents
    exit 0
  }

  Log ('deploy_health_failed rollback_to=' + $current)
  Stop-LocalCore
  & $git reset --hard $current --quiet
  if ($LASTEXITCODE -ne 0) { throw 'rollback_git_reset_failed' }
  Push-Location $root
  try { & $npm install --no-audit --no-fund --silent } finally { Pop-Location }
  Start-LocalCore
  if (Health-Ok) { Log ('rollback_ok restored=' + $current) } else { Log ('rollback_failed restored=' + $current); exit 2 }
} catch {
  Log ('agent_error=' + $_.Exception.Message)
  try { $state = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue; if ($state -and $state.State -ne 'Running') { Start-LocalCore } } catch {}
  exit 1
} finally { Remove-Item $lockFile -Force -ErrorAction SilentlyContinue }
