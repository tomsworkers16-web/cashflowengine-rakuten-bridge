# IDEA-003 review handoff: send only two generated files to PRIVATE Issue #30.
# No source modifications, Git commits, production changes or publishing.
$ErrorActionPreference='Stop'
$root='C:\CFE-Coding-Agent-PoC-30'
$workspace=Join-Path $root 'workspace'
$base='https://api.github.com/repos/tomsworkers16-web/cfe-m8-control'
$expected=@('m8-agent-node/ops/idea-agent/job-metrics.mjs','m8-agent-node/ops/idea-agent/job-metrics.test.mjs')
$tokenPath=Join-Path $env:LOCALAPPDATA 'AstonishFactory\M8Remote\github-token.dpapi'
try {
 if(-not(Test-Path $workspace)){throw 'workspace_missing'}
 if(-not(Test-Path $tokenPath)){throw 'token_missing'}
 $actual=@(git.exe -C $workspace ls-files --others --modified --exclude-standard)
 if($LASTEXITCODE -ne 0){throw 'git_status_failed'}
 if($actual.Count -ne 2 -or @($actual | Where-Object {$expected -cnotcontains $_}).Count -gt 0){throw 'unexpected_files'}
 $branch=(& git.exe -C $workspace branch --show-current).Trim()
 if($branch -cne 'agent/idea-30-implementation'){throw 'unexpected_branch'}
 $files=@()
 foreach($relative in $expected){
  $path=Join-Path $workspace ($relative.Replace('/','\'))
  if(-not(Test-Path $path -PathType Leaf)){throw 'missing_file'}
  $bytes=[IO.File]::ReadAllBytes($path)
  if($bytes.Length -lt 20 -or $bytes.Length -gt 12000){throw 'unexpected_size'}
  $source=[Text.Encoding]::UTF8.GetString($bytes)
  if($source -match '(?i)(github_pat_|gh[pousr]_[a-z0-9_]{10,}|password\s*[:=]|api[_-]?key\s*[:=]|authorization\s*[:=]|process\.env|child_process|spawn\s*\(|exec\s*\(|fetch\s*\(|https?://|require\s*\()'){throw 'potentially_unsafe_content'}
  $sha=[Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
  $files+=@{path=$relative;sha256=[Convert]::ToBase64String($sha);base64=[Convert]::ToBase64String($bytes)}
 }
 $test=Join-Path $workspace 'm8-agent-node\ops\idea-agent\job-metrics.test.mjs'
 & node.exe --test $test | Out-Null
 if($LASTEXITCODE -ne 0){throw 'test_failed'}
 $secure=(Get-Content -LiteralPath $tokenPath -Raw).Trim() | ConvertTo-SecureString
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try{$token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
 finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
 $headers=@{Authorization="Bearer $token";Accept='application/vnd.github+json';'User-Agent'='AstonishFactoryIdeaReview/1.0'}
 try{
  $metadata=Invoke-RestMethod -Uri $base -Headers $headers -TimeoutSec 20
  if($metadata.private -ne $true){throw 'not_private'}
  $issue=Invoke-RestMethod -Uri "$base/issues/30" -Headers $headers -TimeoutSec 20
  if([int64]$issue.user.id -ne 267393119 -or [string]$issue.title -notmatch '^\[IDEA-003\]'){throw 'unexpected_issue'}
  $marker='<!-- AstonishFactory:idea-003-generated-review:v1 -->'
  $comments=@(Invoke-RestMethod -Uri "$base/issues/30/comments?per_page=100" -Headers $headers -TimeoutSec 20)
  if(@($comments | Where-Object {$null -ne $_ -and $_.body -like "*$marker*"}).Count -gt 0){
   Write-Host 'RESULT: ALREADY_EXPORTED'
   exit 0
  }
  $data=@{format='idea-003-generated-review-v1';issue=30;branch=$branch;test='passed';files=$files}
  $json=ConvertTo-Json -InputObject $data -Depth 6 -Compress
  $body=$marker+[Environment]::NewLine+$json
  $answer=Invoke-RestMethod -Method Post -Uri "$base/issues/30/comments" -Headers $headers -ContentType 'application/json; charset=utf-8' -Body (ConvertTo-Json -InputObject @{body=$body} -Compress) -TimeoutSec 30
  if(-not $answer.id){throw 'post_not_confirmed'}
  Write-Host 'RESULT: IDEA_003_REVIEW_EXPORTED'
  Write-Host 'Private Issue #30: two generated files transferred for review.'
 }finally{$headers.Authorization='';$token=$null}
}catch{
 Write-Host ('RESULT: REVIEW_EXPORT_BLOCKED_'+$_.Exception.GetType().Name)
 exit 2
}
