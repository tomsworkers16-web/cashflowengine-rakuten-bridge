# Read-only security preflight for dedicated Codex worker identity.
# Does not read any secret contents, modify ACLs, create users or start Codex.
$ErrorActionPreference='Stop'
function Test-Readable($path) {
 try {
  if(-not(Test-Path -LiteralPath $path)) { return 'not_present' }
  Get-Item -LiteralPath $path -ErrorAction Stop | Out-Null
  return 'accessible'
 }catch [System.UnauthorizedAccessException] { return 'denied' }
 catch { return 'unknown' }
}
try {
 $principal=[Security.Principal.WindowsIdentity]::GetCurrent()
 $admin=[Security.Principal.WindowsPrincipal]::new($principal).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
 $root='C:\AI-Factory\cashflowengine-rakuten-bridge\m8-agent-node'
 $control='C:\AI-Factory\M8Remote'
 $mainSecret=Join-Path $env:LOCALAPPDATA 'AstonishFactory\M8Remote\github-token.dpapi'
 $codex=(Get-Command codex.cmd -ErrorAction SilentlyContinue)
 $git=(Get-Command git.exe -ErrorAction SilentlyContinue)
 $node=(Get-Command node.exe -ErrorAction SilentlyContinue)
 $isolatedRoots=@('C:\CFE-Codex-PoC-v2','C:\CFE-Coding-Agent-PoC-30')
 $checks=[ordered]@{
  version='m8-worker-boundary-audit-v1';
  identity=$principal.Name;
  administrative=$admin;
  productionTree=Test-Readable $root;
  remoteControlTree=Test-Readable $control;
  githubCredentialPath=Test-Readable $mainSecret;
  codexAvailable=($null -ne $codex);
  gitAvailable=($null -ne $git);
  nodeAvailable=($null -ne $node);
  sandboxRoots=@($isolatedRoots | ForEach-Object { @{path=$_;status=(Test-Readable $_)} });
 }
 # Access is assessed in the CURRENT identity, never guessed for another user.
 $checks.preliminaryChecksPass=($admin -eq $false -and $checks.productionTree -eq 'denied' -and $checks.remoteControlTree -eq 'denied' -and $checks.githubCredentialPath -ne 'accessible' -and $checks.codexAvailable -and $checks.gitAvailable -and $checks.nodeAvailable)
 $checks.workerIsolationPassed=$false
 $checks.interpretation='Read-only observation under current Windows identity. This is NOT an OS permission attestation. A dedicated low-privilege identity requires independent negative access and sandbox tests before activation.'
 $checks | ConvertTo-Json -Depth 6
}catch{
 '{"version":"m8-worker-boundary-audit-v1","workerIsolationPassed":false,"error":"audit_failed"}'
 exit 2
}
