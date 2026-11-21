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
function SyncEditorialSnapshot {
 $repoName='tomsworkers16-web/cashflowengine-rakuten-bridge'
 $branchName='docs/editorial-quality-gate-b-20261116'
 $baseDir='C:\CFE-Editorial-Remote-Staging'
 $headers=@{'User-Agent'='AstonishFactoryM8Remote/1.1';'Accept'='application/vnd.github+json'}
 $branchUri="https://api.github.com/repos/$repoName/branches/$([uri]::EscapeDataString($branchName))"
 $branchInfo=Invoke-RestMethod -Method Get -Uri $branchUri -Headers $headers -TimeoutSec 25
 $commit=[string]$branchInfo.commit.sha
 if($commit -cnotmatch '^[0-9a-f]{40}$'){throw 'invalid_commit_sha'}
 $revisions=Join-Path $baseDir 'revisions'
 New-Item -ItemType Directory -Path $revisions -Force | Out-Null
 $destination=Join-Path $revisions $commit
 $package=Join-Path $destination 'm8-agent-node\package.json'
 if(Test-Path -LiteralPath $package){
  return @{action='editorial-sync';status='snapshot_ready';commit=$commit;staged=$false;testRoot=$destination;published=0}
 }
 if(Test-Path -LiteralPath $destination){throw 'incomplete_snapshot_requires_review'}
 $temporary=Join-Path $baseDir ('tmp-'+$commit)
 $archive=Join-Path $temporary 'code.zip'
 $unpacked=Join-Path $temporary 'unpacked'
 if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Recurse -Force}
 New-Item -ItemType Directory -Path $unpacked -Force | Out-Null
 try{
  $zipUri="https://api.github.com/repos/$repoName/zipball/$commit"
  Invoke-WebRequest -Uri $zipUri -Headers $headers -TimeoutSec 90 -OutFile $archive -UseBasicParsing
  if((Get-Item -LiteralPath $archive).Length -gt 26214400){throw 'zip_too_large'}
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zipObj=[IO.Compression.ZipFile]::OpenRead($archive)
  try{
   if($zipObj.Entries.Count -gt 5000){throw 'too_many_files'}
   $total=0L
   foreach($e in $zipObj.Entries){
    $total += [int64]$e.Length
    if($total -gt 104857600){throw 'zip_expanded_too_large'}
    $name=$e.FullName.Replace('\','/')
    if($name.StartsWith('/') -or $name -match '(^|/)\.\.(/|$)' -or $name -match '^[a-zA-Z]:'){throw 'unsafe_zip_path'}
   }
  }finally{$zipObj.Dispose()}
  Expand-Archive -LiteralPath $archive -DestinationPath $unpacked -Force
  $roots=@(Get-ChildItem -LiteralPath $unpacked -Directory)
  if($roots.Count -ne 1){throw 'unexpected_zip_layout'}
  $candidate=Join-Path $roots[0].FullName 'm8-agent-node\package.json'
  if(-not(Test-Path -LiteralPath $candidate)){throw 'package_missing'}
  $pkg=Get-Content -LiteralPath $candidate -Raw | ConvertFrom-Json
  if([string]$pkg.name -cne 'cashflowengine-m8-agent-node'){throw 'unexpected_package'}
  Move-Item -LiteralPath $roots[0].FullName -Destination $destination
 }finally{
  Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
 }
 return @{action='editorial-sync';status='snapshot_ready';commit=$commit;staged=$true;testRoot=$destination;published=0}
}
# Run only the fixed editorial test script in a prepared isolated directory.
# Redirect both streams asynchronously to avoid deadlocks. Do not show consoles.
function Invoke-EditorialTestProcess([string]$workingDir) {
 $psi=New-Object System.Diagnostics.ProcessStartInfo
 $psi.FileName=Join-Path $env:SystemRoot 'System32\cmd.exe'
 $psi.Arguments='/d /s /c "npm.cmd run editorial-tests"'
 $psi.WorkingDirectory=$workingDir
 $psi.UseShellExecute=$false
 $psi.CreateNoWindow=$true
 $psi.WindowStyle=[System.Diagnostics.ProcessWindowStyle]::Hidden
 $psi.RedirectStandardOutput=$true
 $psi.RedirectStandardError=$true
 $process=New-Object System.Diagnostics.Process
 $process.StartInfo=$psi
 try {
  if(-not $process.Start()){throw 'test_process_start_failed'}
  $outputTask=$process.StandardOutput.ReadToEndAsync()
  $errorTask=$process.StandardError.ReadToEndAsync()
  if(-not $process.WaitForExit(120000)){
   # Kill the cmd.exe child; npm/node descendants may require separate cleanup.
   try{$process.Kill()}catch{}
   return @{status='timed_out';exitCode=$null;summary=@{};published=0}
  }
  $process.WaitForExit()
  $exitCode=[int]$process.ExitCode
  $output=$outputTask.GetAwaiter().GetResult()
  $errorTask.GetAwaiter().GetResult()
  $counts=@{}
  foreach($label in @('tests','pass','fail')){
   $found=[regex]::Match($output,"(?m)^\s*(?:#|ℹ)\s*$label\s+(\d+)\s*$")
   if($found.Success){$counts[$label]=[int]$found.Groups[1].Value}
  }
  $allPassed=($counts.ContainsKey('tests') -and $counts.ContainsKey('pass') -and $counts.ContainsKey('fail') -and $counts['tests'] -gt 0 -and $counts['tests'] -eq $counts['pass'] -and $counts['fail'] -eq 0)
  $status='failed_or_unparsed'
  if($exitCode -eq 0 -and $allPassed){$status='passed'}
  # Deliberately do not publish the raw streams: they may contain credentials.
  return @{status=$status;exitCode=$exitCode;summary=$counts;published=0}
 } finally {$process.Dispose()}
}

function RunEditorialSnapshotTests([string]$root){
 $package=Join-Path $root 'm8-agent-node\package.json'
 if(-not(Test-Path -LiteralPath $package)){throw 'snapshot_package_missing'}
 $result=Invoke-EditorialTestProcess -workingDir (Split-Path -Parent $package)
 if($null -eq $result){throw 'runner_returned_no_result'}
 return $result
}

function Act([string]$name){
 if($name -eq 'editorial-sync'){$snapshot=SyncEditorialSnapshot;return $snapshot}
 if($name -eq 'editorial-sync-test'){
  $info=SyncEditorialSnapshot
  $tests=RunEditorialSnapshotTests -root $info.testRoot
  if($null -eq $tests){throw 'snapshot_runner_returned_no_result'}
  $tests['action']='editorial-sync-test'
  $tests['commit']=$info.commit
  $tests['staged']=$info.staged
  return $tests
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
  $result=Invoke-EditorialTestProcess -workingDir $packages[0].Directory.FullName
  if($null -eq $result){throw 'runner_returned_no_result'}
  $result['action']='editorial-tests'
  $result['testRoot']=$selectedRoot
  return $result
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
  try {$r=Act $action} catch {
   $errorLine=0
   try {$errorLine=[int]$_.InvocationInfo.ScriptLineNumber} catch {}
   $errorCode='unspecified'
   if($_.Exception.Message -eq 'runner_returned_no_result'){$errorCode='runner_returned_no_result'}
   if($_.Exception.Message -eq 'snapshot_runner_returned_no_result'){$errorCode='snapshot_runner_returned_no_result'}
   $r=@{action=$action;status='execution_failed';errorType=$_.Exception.GetType().Name;errorLine=$errorLine;errorCode=$errorCode;published=0}
  }
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
