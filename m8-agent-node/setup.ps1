$ErrorActionPreference = 'Stop'

Write-Host '=== Cash Flow Engine M8 Agent Node Setup v2 ===' -ForegroundColor Cyan
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Require-Command($name, $hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "$name not found. $hint" }
}

Require-Command 'node' 'Install Node.js 22 or newer.'
Require-Command 'npm' 'Install Node.js 22 or newer.'
Require-Command 'git' 'Install Git for Windows.'

$nodeVersion = [version]((node -v).TrimStart('v'))
if ($nodeVersion.Major -lt 22) { throw 'Node.js 22 or newer is required.' }

$chromeCandidates = @('C:\Program Files\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Google\Chrome\Application\chrome.exe')
$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'Google Chrome not found.' }

Write-Host '[1/7] npm install'
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }

Write-Host '[2/7] validating JavaScript'
npm run check
if ($LASTEXITCODE -ne 0) { throw 'JavaScript validation failed.' }

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host '[3/7] Created .env. Add credentials locally before production enable.' -ForegroundColor Yellow
} else {
  Write-Host '[3/7] Existing .env preserved.' -ForegroundColor Green
}

New-Item -ItemType Directory -Force -Path '.data\threads-profile' | Out-Null
New-Item -ItemType Directory -Force -Path '.data\reports' | Out-Null
Write-Host '[4/7] Prepared local persistent data.'

try {
  powercfg /change standby-timeout-ac 0 | Out-Null
  powercfg /change hibernate-timeout-ac 0 | Out-Null
  Write-Host '[5/7] AC sleep/hibernate disabled.'
} catch { Write-Warning 'Power settings update failed; verify Windows sleep is disabled manually.' }

Write-Host '[6/7] Configuring Local Core, Watchdog, Auto Update, Night Evaluation, Daily Commander'
& (Join-Path $root 'configure-server-mode.ps1')
if ($LASTEXITCODE -ne 0) { throw 'configure-server-mode.ps1 failed.' }

Write-Host '[7/7] Setup complete.' -ForegroundColor Green
Write-Host 'Health: http://127.0.0.1:18787/health'
Write-Host 'Secrets remain local in .env and .data is not committed.'
Write-Host 'Normal runtime does not require Render, TinyFish, Supabase, or GitHub Actions.'
