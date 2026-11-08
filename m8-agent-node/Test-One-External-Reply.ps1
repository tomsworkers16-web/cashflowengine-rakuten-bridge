param(
    [switch]$SendOne,
    [string]$Url
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskName = 'CashFlowEngine-M8-LocalCore'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$script = Join-Path $PSScriptRoot 'src\external-reply-one-shot.js'

if (-not $SendOne) {
    # Read-only, never stops services or publishes a reply.
    & $node '--env-file=.env' $script
    exit $LASTEXITCODE
}

if (-not $Url -or $Url -notmatch '^https://www\.threads\.com/@[A-Za-z0-9_.]+/post/[A-Za-z0-9_-]+$') {
    throw 'Specify the exact URL shown by preview using -Url. No reply was submitted.'
}
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($task.State -eq 'Disabled') { throw 'Local Core task disabled; aborting to avoid an unsafe restore.' }

# Reserve only one attempt per JST calendar day. Confirmation was granted for one test only.
$today = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Tokyo Standard Time').ToString('yyyy-MM-dd')
$marker = Join-Path $PSScriptRoot ('.data\external-reply-one-shot-' + $today + '.json')
if (Test-Path -LiteralPath $marker) { throw 'A one-shot test was already reserved today.' }

# Do not interrupt scheduled posts, or a watchdog restart during the test.
$now = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Tokyo Standard Time')
$minute = $now.Hour*60+$now.Minute
foreach ($slot in @(450,750,1170)) {
    if ($minute -ge ($slot-20) -and $minute -le ($slot+30)) {
        throw 'Posting window: test deferred, no service changes.'
    }
}

$h = Invoke-RestMethod 'http://127.0.0.1:18787/health' -TimeoutSec 10
if ($h.externalReply.enabled -ne $false) { throw 'Automatic replies must remain OFF.' }

$stopped = $false
try {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
    $stopped = $true

    # Stop only the M8 Core Node process. This releases the persistent Chrome profile.
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine -like '*local-core-v2.js*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop }

    Start-Sleep -Seconds 4
    $remain = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine -like '*local-core-v2.js*' })
    if ($remain.Count -gt 0) { throw 'Local Core still running. Aborting test.' }

    & $node '--env-file=.env' $script '--send-one' ("--url=" + $Url)
    $testExit = $LASTEXITCODE
}
finally {
    if ($stopped) {
        Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
        Start-Sleep -Seconds 8
        try {
            $h = Invoke-RestMethod 'http://127.0.0.1:18787/health' -TimeoutSec 10
            Write-Host ('M8 restored; CoreHealthy=' + $h.ok + '; AutoReplyEnabled=' + $h.externalReply.enabled)
        }
        catch { Write-Warning 'M8 health check failed after restoration. Verify the scheduled task.' }
    }
}
if ($testExit -ne 0) { throw ('Test was not verified. Exit code: '+$testExit+'. Do not blindly retry.') }
