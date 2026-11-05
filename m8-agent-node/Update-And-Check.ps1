# Safe M8 update and verification. No posting, no service stop/restart.
# Run from PowerShell: powershell -ExecutionPolicy Bypass -File .\Update-And-Check.ps1
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
function Invoke-Checked([string]$File, [string[]]$Arguments) {
    Write-Host ("Running: " + $File + " " + ($Arguments -join " ")) -ForegroundColor Cyan
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw ("Failed: " + $File + " (exit " + $LASTEXITCODE + ")")
    }
}
if (-not (Test-Path -LiteralPath ".env")) {
    throw ".env not found in the M8 directory. No changes made."
}
$localChanges = @(git status --porcelain --untracked-files=no)
if ($LASTEXITCODE -ne 0) { throw "Unable to inspect git status." }
if ($localChanges.Count -gt 0) {
    throw "Tracked local changes detected. Aborting to avoid overwriting M8 edits."
}
$branch = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') {
    throw "Expected main branch; found '$branch'. Aborting."
}
# Avoid ambiguous local branch.merge configuration. Fetch only the production branch,
# then fast-forward main to that verified remote-tracking ref.
Invoke-Checked 'git' @('fetch','origin','main')
Invoke-Checked 'git' @('merge','--ff-only','refs/remotes/origin/main')
Invoke-Checked 'npm.cmd' @('run','check')
Invoke-Checked 'npm.cmd' @('test')
Invoke-Checked 'npm.cmd' @('run','check-secrets')
Invoke-Checked 'npm.cmd' @('run','preflight')
Invoke-Checked 'npm.cmd' @('run','verify')
Write-Host "Checks completed. No Threads posts were submitted." -ForegroundColor Green
Write-Host "Running Node services still use their previous loaded code until restarted." -ForegroundColor Yellow
