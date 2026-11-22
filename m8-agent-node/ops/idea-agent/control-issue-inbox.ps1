# Read-only GitHub intake probe, intended for NUCBOX_M8\AF-CodexWorker.
# No code execution, git writes, issue comments, local file writes, or token output.
$ErrorActionPreference = "Stop"
$expectedIdentity = "NUCBOX_M8\AF-CodexWorker"
$ownerId = 267393119
$tokenFile = Join-Path $env:LOCALAPPDATA "AstonishFactory\CodexWorker\github-control-token.dpapi"
$ptr = [IntPtr]::Zero
$secure = $null
$token = $null
$headers = $null
try {
    if ([Security.Principal.WindowsIdentity]::GetCurrent().Name -ne $expectedIdentity) { throw "wrong_windows_identity" }
    if (-not (Test-Path -LiteralPath $tokenFile -PathType Leaf)) { throw "credential_missing" }
    $secure = Get-Content -LiteralPath $tokenFile -Raw | ConvertTo-SecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    $headers = @{
        Authorization = "Bearer $token"
        Accept = "application/vnd.github+json"
        "User-Agent" = "AF-CodexWorker-IssueInbox-v1"
        "X-GitHub-Api-Version" = "2022-11-28"
    }
    $uri = "https://api.github.com/repos/tomsworkers16-web/cfe-m8-control/issues?state=open&per_page=100"
    $issues = @(Invoke-RestMethod -Uri $uri -Headers $headers -Method Get -TimeoutSec 20 -ErrorAction Stop)
    $ownerIssues = @($issues | Where-Object {
        $_.user.id -eq $ownerId -and
        -not $_.pull_request -and
        $_.title -is [string] -and
        $_.title -match '^\[IDEA-[0-9]{1,6}\]\s*\[AUTO-IDEA\]' -and
        $_.body -is [string] -and
        $_.body.Length -ge 10 -and
        $_.body.Length -le 12000 -and
        (@($_.labels | Where-Object { $_.name -eq "project:cashflow" }).Count -eq 1) -and
        (@($_.labels | Where-Object { $_.name -eq "m8-remote" }).Count -eq 0)
    })
    $output = [ordered]@{
        status = "INBOX_READ_OK"
        identityVerified = $true
        scanned = $issues.Count
        preliminarilyEligible = $ownerIssues.Count
        issueNumbers = @($ownerIssues | ForEach-Object { $_.number })
        readOnly = $true
        issueBodyExecuted = $false
        credentialsPrinted = $false
        note = "Preliminary candidate count only. Full triage/claims/comments/branch execution not enabled."
    }
    $output | ConvertTo-Json -Depth 4
} catch {
    # Never put the HTTP response, exception message, or URL-auth headers into console output.
    Write-Output '{"status":"INBOX_READ_FAILED","readOnly":true,"reason":"credential_or_http_or_identity_check_failed"}'
    exit 2
} finally {
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    $token = $null; $headers = $null
    if ($null -ne $secure) { $secure.Dispose() }
}
