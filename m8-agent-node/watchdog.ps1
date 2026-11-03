$ErrorActionPreference='SilentlyContinue'
$task='CashFlowEngine-M8-LocalCore'
$healthy=$false
try {
  $r=Invoke-RestMethod -Uri 'http://127.0.0.1:18787/health' -TimeoutSec 8
  if($r.ok -eq $true){$healthy=$true}
} catch {}
if(-not $healthy){
  Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Start-ScheduledTask -TaskName $task
}
