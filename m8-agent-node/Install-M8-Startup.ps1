# Registers the M8 watchdog in the *current user's* Windows Startup folder.
# Requires one intentional run on that Windows account. Does NOT start publishing.
$ErrorActionPreference = 'Stop'
$startup = [Environment]::GetFolderPath('Startup')
if (-not $startup) { throw 'Current Windows Startup folder is unavailable.' }
$script = Join-Path $PSScriptRoot 'Run-M8-Core.ps1'
if (-not (Test-Path -LiteralPath $script)) { throw 'Run-M8-Core.ps1 not found.' }
$shortcutPath = Join-Path $startup 'Cash Flow Engine M8.lnk'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcutPath)
$link.TargetPath = (Get-Command powershell.exe).Source
$link.Arguments = ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File "{0}"' -f $script)
$link.WorkingDirectory = $PSScriptRoot
$link.Description = 'Cash Flow Engine M8 local watchdog (uses existing .env settings)'
$link.Save()
Write-Host 'Startup shortcut installed for the current Windows user.' -ForegroundColor Green
Write-Host ('Path: ' + $shortcutPath)
Write-Host 'No services were restarted. No posting settings were changed.'
