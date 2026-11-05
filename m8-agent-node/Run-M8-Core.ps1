# M8 local watchdog. No changes to .env or posting switches.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$logDir = Join-Path $PSScriptRoot '.data\logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir 'm8-core.log'
function Log([string]$message) {
    $line = ('{0} {1}' -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $message)
    Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}
if (-not (Test-Path -LiteralPath '.env')) { Log 'No local .env; stopping.'; exit 1 }
$port = 18787
foreach ($line in (Get-Content -LiteralPath '.env' -Encoding UTF8)) {
    if ($line -match '^\s*CFE_LOCAL_PORT\s*=\s*(\d+)\s*$') { $port = [int]$Matches[1] }
}
function PortIsListening([int]$target) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $attempt = $client.BeginConnect('127.0.0.1', $target, $null, $null)
        if (-not $attempt.AsyncWaitHandle.WaitOne(700)) { return $false }
        $client.EndConnect($attempt)
        return $true
    } catch { return $false } finally { $client.Dispose() }
}
if (PortIsListening $port) {
    Log "Port $port is already listening. Avoiding duplicate core."
    exit 0
}
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { Log 'node.exe missing; stopping.'; exit 1 }
while ($true) {
    if (PortIsListening $port) {
        Log "Port $port occupied. Watchdog stopping to avoid conflict."
        exit 0
    }
    if ((Test-Path $log) -and (Get-Item $log).Length -gt 5MB) {
        Move-Item -LiteralPath $log -Destination ($log + '.previous') -Force
    }
    Log 'Starting M8 core. Publishing behavior follows .env (unchanged).'
    & $node '--env-file=.env' 'src/local-core-v2.js' *>> $log
    $exitCode = $LASTEXITCODE
    Log "M8 core stopped with exit code $exitCode. Restarting after 30s."
    Start-Sleep -Seconds 30
}
