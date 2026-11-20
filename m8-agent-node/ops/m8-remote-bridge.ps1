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
# Strictly fixed source repository and branch; an Issue may request only the exact
# action name and cannot select a repository, branch, path or command.
function SyncEditorialSnapshot {
 $source='tomsworkers16-web/cashflowengine-rakuten-bridge'
 $branch='docs/editorial-quality-gate-b-20261116'
 $workspace='C:\CFE-Editorial-Remote-Staging'
 $revisions=Join-Path $workspace 'revisions'
 New-Item -ItemType Directory -Path $revisions -Force | Out-Null
 $headers=@{'User-Agent'='AstonishFactoryM8Remote/1.1';Accept='application/vnd.github+json'}
 $branchUrl="https://api.github.com/repos/$source/branches/$([uri]::EscapeDataString($branch))"
 $branchResult=Invoke-RestMethod -Method Get -Uri $branchUrl -Headers $headers -TimeoutSec 25
 $sha=[string]$branchResult.commit.sha
 if($sha -cnotmatch '^[0-9a-f]{40}
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
 $script:pollStage='repo-metadata'
 $metadata=Api 'GET' ''
 if($null -eq $metadata -or $metadata.private -ne $true){throw 'control_repo_not_private'}
 $script:pollStage='issue-list'
 $response=Api 'GET' '/issues?state=open&per_page=20&labels=m8-remote'
 # A zero-item API response must be treated as an empty collection, not
 # a single placeholder item under Windows PowerShell 5.1 StrictMode.
 if($null -eq $response){return}
 $issues=@($response)
 if($issues.Count -eq 0){return}
 foreach($i in $issues){
  if($null -eq $i){continue}
  if(-not ($i -is [psobject])){continue}
  if($i.PSObject.Properties.Name -contains 'pull_request'){continue}
  if(-not ($i.PSObject.Properties.Name -contains 'user')){continue}
  if($null -eq $i.user){continue}
  if(-not ($i.user.PSObject.Properties.Name -contains 'id')){continue}
  if([int64]$i.user.id -ne $ownerId){continue}
  if(-not ($i.PSObject.Properties.Name -contains 'title')){continue}
  if([string]$i.title -notmatch '^\[M8-REMOTE\]'){continue}
  if(-not ($i.PSObject.Properties.Name -contains 'body')){continue}
  $action=([string]$i.body).Trim()
  if(@('health','editorial-tests','editorial-sync','editorial-sync-test') -cnotcontains $action){continue}
  if(-not ($i.PSObject.Properties.Name -contains 'number')){continue}
  $script:pollStage='action'
  try {$r=Act $action} catch {$r=@{action=$action;status='execution_failed';published=0}}
  $body='M8 bridge result (summary only)'+[Environment]::NewLine+(ConvertTo-Json -InputObject $r -Depth 5)
  $script:pollStage='result-comment'
  Api 'POST' ("/issues/"+[int]$i.number+"/comments") @{body=$body} | Out-Null
  $script:pollStage='issue-close'
  Api 'PATCH' ("/issues/"+[int]$i.number) @{state='closed'} | Out-Null
 }
 $script:pollStage='idle'
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
   else{
    $line='unknown'
    try{$line=[string]$_.InvocationInfo.ScriptLineNumber}catch{}
    $step=if($script:pollStage){$script:pollStage}else{'unknown'}
    Write-Host ('Poll failed: '+$_.Exception.GetType().Name+'; stage='+$step+'; line='+$line+'.')
   }
  }
  if(-not $Once){Start-Sleep -Seconds 60}
 }while(-not $Once)
}finally{
 if($locked){$mutex.ReleaseMutex()}
 $mutex.Dispose()
}
){throw 'invalid_commit_sha'}
 $dest=Join-Path $revisions $sha
 $marker=Join-Path $dest 'm8-agent-node\package.json'
 $staged=$false
 if(-not(Test-Path -LiteralPath $marker)){
  $temp=Join-Path $workspace ('tmp-'+$sha)
  $zip=Join-Path $temp 'source.zip'
  $extract=Join-Path $temp 'extracted'
  if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Recurse -Force}
  if(Test-Path -LiteralPath $dest){throw 'incomplete_snapshot_exists_manual_review_required'}
  New-Item -ItemType Directory -Path $extract -Force | Out-Null
  try{
   $archiveUrl="https://api.github.com/repos/$source/zipball/$sha"
   Invoke-WebRequest -Uri $archiveUrl -Headers $headers -TimeoutSec 90 -OutFile $zip -UseBasicParsing
   if((Get-Item -LiteralPath $zip).Length -gt 25MB){throw 'archive_too_large'}
   Add-Type -AssemblyName System.IO.Compression
   Add-Type -AssemblyName System.IO.Compression.FileSystem
   $archive=[IO.Compression.ZipFile]::OpenRead($zip)
   try{
    $entries=@($archive.Entries)
    if($entries.Count -gt 5000){throw 'archive_too_many_entries'}
    $uncompressed=0L
    foreach($entry in $entries){
     $uncompressed += [int64]$entry.Length
     if($uncompressed -gt 100MB){throw 'archive_uncompressed_too_large'}
     $entryName=$entry.FullName.Replace('\','/')
     if($entryName.StartsWith('/') -or $entryName -match '(^|/)\.\.(/|$)' -or $entryName -match '^[A-Za-z]:'){throw 'archive_unsafe_path'}
    }
   }finally{$archive.Dispose()}
   Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
   $top=@(Get-ChildItem -LiteralPath $extract -Directory)
   if($top.Count -ne 1){throw 'archive_layout_unexpected'}
   $pkg=Join-Path $top[0].FullName 'm8-agent-node\package.json'
   if(-not(Test-Path -LiteralPath $pkg)){throw 'package_missing_in_snapshot'}
   $data=Get-Content -LiteralPath $pkg -Raw | ConvertFrom-Json
   if([string]$data.name -cne 'cashflowengine-m8-agent-node'){throw 'unexpected_package_name'}
   # Move the extracted repository to a unique immutable revision directory.
   Move-Item -LiteralPath $top[0].FullName -Destination $dest
   $staged=$true
  }finally{
   Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
  }
 }
 return @{action='editorial-sync';status='snapshot_ready';commit=$sha;staged=$staged;testRoot=$dest;published=0}
}
function RunEditorialTests([string]$testDir) {
 $package=Join-Path $testDir 'm8-agent-node\package.json'
 if(-not(Test-Path -LiteralPath $package)){return @{status='package_missing';published=0}}
 $outFile=Join-Path $local 'test-stdout.tmp'
 $errFile=Join-Path $local 'test-stderr.tmp'
 $exitCode=$null
 $log=''
 try{
  # Work exclusively in the isolated snapshot. Do not supply a production .env.
  $process=Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','editorial-tests') -WorkingDirectory (Split-Path -Parent $package) -NoNewWindow -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
  if(-not $process.WaitForExit(120000)){
   try{$process.Kill()}catch{}
   return @{status='timed_out';published=0}
  }
  $process.Refresh()
  $exitCode=$process.ExitCode
  $log=Get-Content -LiteralPath $outFile -Raw -ErrorAction SilentlyContinue
 }finally{
  Remove-Item -LiteralPath $outFile,$errFile -Force -ErrorAction SilentlyContinue
 }
 $count=@{}
 foreach($name in @('tests','pass','fail')){
  $match=[regex]::Match($log,"(?m)^[^\r\n]*?(?:#|ℹ)\s*$name\s+(\d+)\s*$")
  if($match.Success){$count[$name]=[int]$match.Groups[1].Value}
 }
 $summaryValid=($count.ContainsKey('tests') -and $count.ContainsKey('pass') -and $count.ContainsKey('fail') -and $count['tests'] -eq $count['pass'] -and $count['fail'] -eq 0)
 $state='failed_or_unparsed'
 if($summaryValid -and $null -eq $exitCode){$state='passed_output_only_exit_unknown'}
 if($summaryValid -and $null -ne $exitCode -and $exitCode -eq 0){$state='passed'}
 return @{status=$state;summary=$count;exitCode=$exitCode;published=0}
}

function Act([string]$name){
 if($name -eq 'editorial-sync') {return SyncEditorialSnapshot}
 if($name -eq 'editorial-sync-test') {
  $snapshot=SyncEditorialSnapshot
  $result=RunEditorialTests -testDir $snapshot.testRoot
  $result.action='editorial-sync-test'
  $result.commit=$snapshot.commit
  $result.staged=$snapshot.staged
  return $result
 }
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
 $script:pollStage='repo-metadata'
 $metadata=Api 'GET' ''
 if($null -eq $metadata -or $metadata.private -ne $true){throw 'control_repo_not_private'}
 $script:pollStage='issue-list'
 $response=Api 'GET' '/issues?state=open&per_page=20&labels=m8-remote'
 # A zero-item API response must be treated as an empty collection, not
 # a single placeholder item under Windows PowerShell 5.1 StrictMode.
 if($null -eq $response){return}
 $issues=@($response)
 if($issues.Count -eq 0){return}
 foreach($i in $issues){
  if($null -eq $i){continue}
  if(-not ($i -is [psobject])){continue}
  if($i.PSObject.Properties.Name -contains 'pull_request'){continue}
  if(-not ($i.PSObject.Properties.Name -contains 'user')){continue}
  if($null -eq $i.user){continue}
  if(-not ($i.user.PSObject.Properties.Name -contains 'id')){continue}
  if([int64]$i.user.id -ne $ownerId){continue}
  if(-not ($i.PSObject.Properties.Name -contains 'title')){continue}
  if([string]$i.title -notmatch '^\[M8-REMOTE\]'){continue}
  if(-not ($i.PSObject.Properties.Name -contains 'body')){continue}
  $action=([string]$i.body).Trim()
  if(@('health','editorial-tests') -cnotcontains $action){continue}
  if(-not ($i.PSObject.Properties.Name -contains 'number')){continue}
  $script:pollStage='action'
  try {$r=Act $action} catch {$r=@{action=$action;status='execution_failed';published=0}}
  $body='M8 bridge result (summary only)'+[Environment]::NewLine+(ConvertTo-Json -InputObject $r -Depth 5)
  $script:pollStage='result-comment'
  Api 'POST' ("/issues/"+[int]$i.number+"/comments") @{body=$body} | Out-Null
  $script:pollStage='issue-close'
  Api 'PATCH' ("/issues/"+[int]$i.number) @{state='closed'} | Out-Null
 }
 $script:pollStage='idle'
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
   else{
    $line='unknown'
    try{$line=[string]$_.InvocationInfo.ScriptLineNumber}catch{}
    $step=if($script:pollStage){$script:pollStage}else{'unknown'}
    Write-Host ('Poll failed: '+$_.Exception.GetType().Name+'; stage='+$step+'; line='+$line+'.')
   }
  }
  if(-not $Once){Start-Sleep -Seconds 60}
 }while(-not $Once)
}finally{
 if($locked){$mutex.ReleaseMutex()}
 $mutex.Dispose()
}
