param(
    [Parameter(Mandatory=$true)][string]$Url
)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
if($Url -notmatch '^https://www\.threads\.com/@[A-Za-z0-9_.]+/post/[A-Za-z0-9_-]+$'){
    throw 'Invalid Threads target URL. No browser action.'
}
$taskName='CashFlowEngine-M8-LocalCore'
$task=Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if($task.State -eq 'Disabled'){throw 'Core task disabled, refusing diagnostic.'}
$h=Invoke-RestMethod 'http://127.0.0.1:18787/health' -TimeoutSec 10
if($h.externalReply.enabled -ne $false){throw 'Automatic replies must remain OFF.'}
$now=[TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow,'Tokyo Standard Time')
$minute=$now.Hour*60+$now.Minute
foreach($slot in @(450,750,1170)){
    if($minute -ge ($slot-20) -and $minute -le ($slot+30)){
        throw 'Scheduled Threads posting window: no diagnostic.'
    }
}
$node=(Get-Command node.exe -ErrorAction Stop).Source
$stopped=$false
try{
    Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
    $stopped=$true
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine -like '*local-core-v2.js*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop }
    Start-Sleep -Seconds 4
    $remaining=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine -like '*local-core-v2.js*' })
    if($remaining.Count -gt 0){throw 'Core still running, no diagnostic.'}
    & $node '--env-file=.env' '.\src\diagnose-external-reply.js' ('--url='+$Url)
    $exit=$LASTEXITCODE
}finally{
    if($stopped){
        Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
        Start-Sleep -Seconds 8
        try{
            $h=Invoke-RestMethod 'http://127.0.0.1:18787/health' -TimeoutSec 10
            Write-Host ('M8 restored; CoreHealthy='+$h.ok+'; AutoReplyEnabled='+$h.externalReply.enabled)
        }catch{Write-Warning 'Verify M8 health; post-diagnostic health check failed.'}
    }
}
if($exit -ne 0){throw ('Diagnostic unsuccessful: '+$exit)}
