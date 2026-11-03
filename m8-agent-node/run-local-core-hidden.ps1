$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$logDir=Join-Path $root '.data'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile=Join-Path $logDir 'local-core-task.log'

$nodeCandidates=@(
  'C:\Program Files\nodejs\node.exe',
  'C:\Program Files (x86)\nodejs\node.exe'
)
$node=$nodeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if(-not $node){
  try { $node=(Get-Command node -ErrorAction Stop).Source } catch {}
}
if(-not $node){
  "[$(Get-Date -Format o)] node_not_found" | Out-File -FilePath $logFile -Append -Encoding utf8
  throw 'Node.js executable not found.'
}

"[$(Get-Date -Format o)] starting node=$node" | Out-File -FilePath $logFile -Append -Encoding utf8
try {
  & $node --env-file=.env src\local-core.js *>> $logFile
  $code=$LASTEXITCODE
  "[$(Get-Date -Format o)] local_core_exited code=$code" | Out-File -FilePath $logFile -Append -Encoding utf8
  exit $code
} catch {
  "[$(Get-Date -Format o)] runner_error=$($_.Exception.Message)" | Out-File -FilePath $logFile -Append -Encoding utf8
  throw
}
