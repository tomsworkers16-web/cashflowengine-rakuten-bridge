$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$dataDir = Join-Path $root '.data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$log = Join-Path $dataDir 'night-evaluation.log'
$node = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $node)) { $node = (Get-Command node -ErrorAction Stop).Source }

try {
  & $node --env-file=.env src\operations-agent.js night-eval *>> $log
  if ($LASTEXITCODE -ne 0) { throw 'night_evaluation_failed' }
  Add-Content -Path $log -Value ('[{0}] night_evaluation_completed' -f (Get-Date).ToString('o'))
} catch {
  Add-Content -Path $log -Value ('[{0}] error={1}' -f (Get-Date).ToString('o'), $_.Exception.Message)
  exit 1
}
