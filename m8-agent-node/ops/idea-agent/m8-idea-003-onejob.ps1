# One-time bounded IDEA-003 implementation proof on M8. Never touches production.
# GitHub Issue #30 -> isolated Git checkout -> validated job -> Codex -> targeted test.
$ErrorActionPreference='Stop'
$root='C:\CFE-Coding-Agent-PoC-30'
$workspace=Join-Path $root 'workspace'
$branchName='docs/editorial-quality-gate-b-20261116'
$workBranch='agent/idea-30-implementation'
$repository='https://github.com/tomsworkers16-web/cashflowengine-rakuten-bridge.git'
$issueUrl='https://api.github.com/repos/tomsworkers16-web/cfe-m8-control/issues/30'
$tokenPath=Join-Path $env:LOCALAPPDATA 'AstonishFactory\M8Remote\github-token.dpapi'
if(Test-Path -LiteralPath $root){Write-Host 'RESULT: WORKSPACE_EXISTS';exit 2}
if(-not(Test-Path -LiteralPath $tokenPath)){Write-Host 'RESULT: CONTROL_TOKEN_MISSING';exit 2}
foreach($binary in @('git.exe','node.exe','codex.cmd')){
 if(-not(Get-Command $binary -ErrorAction SilentlyContinue)){
  Write-Host ('RESULT: MISSING_'+$binary);exit 2
 }
}
New-Item -ItemType Directory -Path $root -Force | Out-Null
try {
 $secure=(Get-Content -LiteralPath $tokenPath -Raw).Trim() | ConvertTo-SecureString
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try{$token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}
 finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
 $headers=@{
  Authorization="Bearer $token";
  Accept='application/vnd.github+json';
  'User-Agent'='AstonishFactoryOneJobProof/1.0'
 }
 try{$issue=Invoke-RestMethod -Uri $issueUrl -Headers $headers -TimeoutSec 20}
 finally{$headers.Authorization='';$token=$null}
 if([int64]$issue.user.id -ne 267393119){throw 'issue_author_mismatch'}
 if([string]$issue.title -notmatch '^\[IDEA-003\]'){throw 'issue_title_mismatch'}
 $localIssue=@{
   number=[int]$issue.number;title=[string]$issue.title;
   body=[string]$issue.body;user=@{id=[int64]$issue.user.id};
   labels=@($issue.labels | ForEach-Object {@{name=[string]$_.name}})
 }
 $utf8=New-Object System.Text.UTF8Encoding($false)
 $issueFile=Join-Path $root 'idea-30.json'
 [IO.File]::WriteAllText($issueFile,(ConvertTo-Json -InputObject $localIssue -Depth 5),$utf8)
 & git.exe -c credential.helper= clone --quiet --single-branch --branch $branchName $repository $workspace
 if($LASTEXITCODE -ne 0){throw 'git_clone_failed'}
 $base=(& git.exe -C $workspace rev-parse HEAD).Trim()
 if($LASTEXITCODE -ne 0 -or $base -notmatch '^[0-9a-f]{40}$'){throw 'invalid_checkout'}
 & git.exe -C $workspace switch -q -c $workBranch
 if($LASTEXITCODE -ne 0){throw 'branch_creation_failed'}
 $agentDir=Join-Path $workspace 'm8-agent-node\ops\idea-agent'
 $jobMaker=Join-Path $agentDir 'idea-to-job-cli.mjs'
 $runner=Join-Path $agentDir 'coding-agent-runner.mjs'
 $jobText=(& node.exe $jobMaker $issueFile $base)
 if($LASTEXITCODE -ne 0){throw 'job_compile_failed'}
 $jobFile=Join-Path $root 'job.json'
 [IO.File]::WriteAllText($jobFile,([string]$jobText),$utf8)
 $env:CFE_ISOLATION_ROOT=$root
 $env:CFE_CODEX_RUN_ALLOWED='1'
 try{
  $resultText=(& node.exe $runner $jobFile $workspace --execute)
  $rc=$LASTEXITCODE
 }finally{
  Remove-Item Env:CFE_ISOLATION_ROOT -ErrorAction SilentlyContinue
  Remove-Item Env:CFE_CODEX_RUN_ALLOWED -ErrorAction SilentlyContinue
 }
 if($rc -ne 0){Write-Host 'RESULT: CODING_AGENT_BLOCKED';exit 3}
 $result=([string]$resultText | ConvertFrom-Json)
 if($result.status -ne 'review_required'){Write-Host 'RESULT: REVIEW_STATUS_UNEXPECTED';exit 4}
 $expected=@(
  'm8-agent-node/ops/idea-agent/job-metrics.mjs',
  'm8-agent-node/ops/idea-agent/job-metrics.test.mjs'
 )
 $actual=@(& git.exe -C $workspace ls-files --others --modified --exclude-standard)
 if($LASTEXITCODE -ne 0){throw 'git_diff_inspection_failed'}
 if($actual.Count -ne 2 -or @($actual | Where-Object {$expected -notcontains $_}).Count -gt 0){
  Write-Host 'RESULT: UNEXPECTED_FILES_CHANGED';exit 5
 }
 $testFile=Join-Path $agentDir 'job-metrics.test.mjs'
 if(-not(Test-Path -LiteralPath $testFile)){Write-Host 'RESULT: TEST_MISSING';exit 6}
 & node.exe --test $testFile | Out-Null
 if($LASTEXITCODE -ne 0){Write-Host 'RESULT: GENERATED_TEST_FAILED';exit 7}
 Write-Host 'RESULT: IDEA_003_IMPLEMENTATION_PASSED'
 Write-Host 'Changed files: 2 (isolated worktree only)'
 Write-Host 'No push, merge, production change or publication.'
} catch {
 Write-Host ('RESULT: BLOCKED_'+$_.Exception.GetType().Name)
 exit 8
}
