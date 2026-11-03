$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$dataDir = Join-Path $root '.data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$log = Join-Path $dataDir 'local-core-task.log'
$pidFile = Join-Path $dataDir 'local-core.pid'
$core = Join-Path $root 'src\local-core-v2.js'

function Log($message) {
  Add-Content -Path $log -Value ('[{0}] {1}' -f (Get-Date).ToString('o'), $message)
}

$node = $null
$known = @(
  'C:\Program Files\nodejs\node.exe',
  'C:\Program Files (x86)\nodejs\node.exe'
)
foreach ($candidate in $known) {
  if (Test-Path $candidate) { $node = $candidate; break }
}
if (-not $node) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { $node = $cmd.Source }
}
if (-not $node) {
  Log 'runner_error=node_not_found'
  exit 1
}
if (-not (Test-Path $core)) {
  Log 'runner_error=local_core_v2_not_found'
  exit 1
}

try {
  & $node --check $core 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Log 'runner_error=local_core_v2_syntax_check_failed'
    exit 1
  }

  Log ('starting node=' + $node + ' core=local-core-v2.js')
  $stdout = Join-Path $dataDir 'local-core.stdout.log'
  $stderr = Join-Path $dataDir 'local-core.stderr.log'
  $proc = Start-Process -FilePath $node -ArgumentList @('--env-file=.env','src\local-core-v2.js') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  Set-Content -Path $pidFile -Value $proc.Id -Encoding ASCII
  Log ('node_pid=' + $proc.Id)
  $proc.WaitForExit()
  $code = $proc.ExitCode
  Log ('node_exit=' + $code)
  Remove-Item $pidFile -ErrorAction SilentlyContinue
  exit 1
} catch {
  Log ('runner_error=' + $_.Exception.Message)
  Remove-Item $pidFile -ErrorAction SilentlyContinue
  exit 1
}
