# M8 remote bridge v1. GitHub private-issue transport. No arbitrary commands.
param([switch]$Setup,[switch]$Once)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo='tomsworkers16-web/cfe-m8-control'
$ownerId=267393119
$base="https://api.github.com/repos/$repo"
$local=Join-Path $env:LOCALAPPDATA 'AstonishFactory\M8Remote'
$secretFile=Join-Path $local 'github-token.dpapi'
$testRoots=@('C:\CFE-Editorial-Test-v13','C:\CFE-Editorial-Test-v12','C:\CFE-Editorial-Test-v11','C:\CFE-Editorial-Test-v10')
function Token {
 if(-not(Test-Path -LiteralPath $secretFile)){throw 'token_not_configured'}
 $s=(Get-Content -LiteralPath $secretFile -Raw).Trim() | ConvertTo-SecureString
 $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
 try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)}
 finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}
}
function Api([string]$method,[string]$path,[object]$payload=$null){
 $t=Token
 $headers=@{Authorization="Bearer $t";Accept='application/vnd.github+json';'User-Agent'='AstonishFactoryM8Remote/1.0';'X-GitHub-Api-Version'='2022-11-28'}
 $opts=@{Uri=($base+$path);Method=$method;Headers=$headers;TimeoutSec=20}
 if($null -ne $payload){
  $opts.ContentType='application/json; charset=utf-8'
  $opts.Body=ConvertTo-Json -InputObject $payload -Depth 6
 }
 try {Invoke-RestMethod @opts} finally {$headers.Authorization='';$t=$null}
}
function Act([string]$name){
 if($name -eq 'health'){
  $tcp=New-Object Net.Sockets.TcpClient
  $reachable=$false
  try{
   $result=$tcp.BeginConnect('127.0.0.1',18787,$null,$null)
   if($result.AsyncWaitHandle.WaitOne(1500,$false)){
    try{$tcp.EndConnect($result);$reachable=$tcp.Connected}catch{}
   }
   $result.AsyncWaitHandle.Close()
  }finally{$tcp.Close()}
  return @{action='health';nodeAvailable=([bool](Get-Command node.exe -ErrorAction SilentlyContinue));port18787Reachable=$reachable;published=0}
 }
 if($name -eq 'editorial-tests'){
  $packages=@()
  $selectedRoot=$null
  foreach($root in $testRoots) {
   if(-not(Test-Path -LiteralPath $root)){continue}
   $found=@(Get-ChildItem -LiteralPath $root -Recurse -Filter package.json -File -ErrorAction Stop | Where-Object {$_.Directory.Name -eq 'm8-agent-node'})
   if($found.Count -eq 1) {$packages=$found;$selectedRoot=$root;break}
  }
  if($packages.Count -ne 1){return @{action='editorial-tests';status='isolated_test_folder_missing_or_ambiguous';published=0}}
  # Bound run time. Never upload raw logs or credentials to GitHub.
  $outFile=Join-Path $local 'test-stdout.tmp'
  $errFile=Join-Path $local 'test-stderr.tmp'
  try {
   $process=Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','editorial-tests') -WorkingDirectory $packages[0].Directory.FullName -NoNewWindow -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
   if(-not $process.WaitForExit(120000)){
    try{$process.Kill()}catch{}
    return @{action='editorial-tests';status='timed_out';published=0}
   }
   $process.Refresh()
   $exit=$process.ExitCode
   $log=Get-Content -LiteralPath $outFile -Raw -ErrorAction SilentlyContinue
  } finally {
   Remove-Item -LiteralPath $outFile,$errFile -Force -ErrorAction SilentlyContinue
  }
  $data=@{}
  foreach($key in @('tests','pass','fail')){
   $m=[regex]::Match($log,"(?m)^[^\r\n]*?(?:#|ℹ)\s*$key\s+(\d+)\s*$")
   if($m.Success){$data[$key]=[int]$m.Groups[1].Value}
  }
  $ok=($exit -eq 0 -and $data.ContainsKey('tests') -and $data.ContainsKey('pass') -and $data.ContainsKey('fail') -and $data['fail'] -eq 0 -and $data['tests'] -eq $data['pass'])
  return @{action='editorial-tests';testRoot=$selectedRoot;status=$(if($ok){'passed'}else{'failed_or_unparsed'});summary=$data;exitCode=$exit;published=0}
 }
 return @{status='action_denied';published=0}
}
function Poll{
 $metadata=Api 'GET' ''
 if($metadata.private -ne $true){throw 'control_repo_not_private'}
 $issues=@(Api 'GET' '/issues?state=open&per_page=20&labels=m8-remote')
 foreach($i in $issues){
  # An empty GitHub issue list can become @($null) in Windows PowerShell.
  # Under StrictMode accessing properties of $null crashes the whole poll.
  if($null -eq $i){continue}
  if($i.PSObject.Properties.Name -contains 'pull_request'){continue}
  if([int64]$i.user.id -ne $ownerId){continue}
  if($i.title -notmatch '^\[M8-REMOTE\]'){continue}
  $action=([string]$i.body).Trim()
  if(@('health','editorial-tests') -cnotcontains $action){continue}
  try {$r=Act $action} catch {$r=@{action=$action;status='execution_failed';published=0}}
  $body='M8 bridge result (summary only)'+[Environment]::NewLine+(ConvertTo-Json -InputObject $r -Depth 5)
  Api 'POST' ("/issues/"+[int]$i.number+"/comments") @{body=$body} | Out-Null
  Api 'PATCH' ("/issues/"+[int]$i.number) @{state='closed'} | Out-Null
 }
}
New-Item -ItemType Directory -Path $local -Force | Out-Null
if($Setup){
 Write-Host "Create PRIVATE GitHub repo $repo (Issues enabled)."
 Write-Host 'Use fine-grained PAT: only that repo; Issues read/write.'
 $s=Read-Host 'PAT (hidden)' -AsSecureString
 $s | ConvertFrom-SecureString | Set-Content -LiteralPath $secretFile -Encoding UTF8
 try{
  $m=Api 'GET' ''
  if($m.private -ne $true){throw 'control_repo_not_private'}
  Api 'GET' '/issues?per_page=1' | Out-Null
  Write-Host 'Setup OK: verified private control repo.'
 }catch{Remove-Item -LiteralPath $secretFile -Force -ErrorAction SilentlyContinue;Write-Host 'Setup failed: verify repository/privacy/token.';exit 1}
 exit 0
}
$mutex=New-Object Threading.Mutex($false,'Local\AstonishFactoryM8RemoteBridge')
$locked=$false
try{
 $locked=$mutex.WaitOne(0)
 if(-not $locked){Write-Host 'Bridge already running';exit 0}
 do{
  try{Poll; if($Once){Write-Host 'Poll OK: private GitHub control repo reachable.'}}catch{
   $status=$null
   try{$status=[int]$_.Exception.Response.StatusCode}catch{}
   if($null -ne $status){Write-Host ('Poll failed: GitHub HTTP '+$status+'. Check token access and repository permissions.')}
   else{Write-Host ('Poll failed: '+$_.Exception.GetType().Name+'. Check setup and issue format.')}
  }
  if(-not $Once){Start-Sleep -Seconds 60}
 }while(-not $Once)
}finally{
 if($locked){$mutex.ReleaseMutex()}
 $mutex.Dispose()
}
