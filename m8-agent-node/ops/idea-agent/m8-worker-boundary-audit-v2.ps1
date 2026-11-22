# Run this under the NEW dedicated standard Windows account, not the existing M8 owner session.
# Read-only checks; NEVER echoes credential data or reads credential file contents.
$ErrorActionPreference='Stop'
function Test-FileOpen($path) {
 if(-not [IO.File]::Exists($path)) { return 'not_present' }
 try {
  $stream=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
  try {return 'read_permitted'} finally {$stream.Dispose()}
 } catch [UnauthorizedAccessException] {return 'read_denied'}
 catch [IO.IOException] {return 'inconclusive_io'}
 catch {return 'inconclusive'}
}
function Test-ListDirectory($path) {
 if(-not [IO.Directory]::Exists($path)) {return 'not_present'}
 try {
  $enum=[IO.Directory]::EnumerateFileSystemEntries($path).GetEnumerator()
  try {$null=$enum.MoveNext();return 'list_permitted'}
  finally {$enum.Dispose()}
 } catch [UnauthorizedAccessException] {return 'list_denied'}
 catch {return 'inconclusive'}
}
try {
 $who=[Security.Principal.WindowsIdentity]::GetCurrent()
 $admin=[Security.Principal.WindowsPrincipal]::new($who).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
 $production='C:\AI-Factory\cashflowengine-rakuten-bridge\m8-agent-node'
 $bridge='C:\AI-Factory\M8Remote'
 # Test the actual known bridge file, not merely whether its directory metadata is visible.
 $bridgeScript=Join-Path $bridge 'bridge.ps1'
 $productionManifest=Join-Path $production 'package.json'
 $credential=Join-Path $env:LOCALAPPDATA 'AstonishFactory\M8Remote\github-token.dpapi'
 $report=[ordered]@{
   version='m8-worker-boundary-audit-v2';
   identity=$who.Name;
   administrative=$admin;
   productionDirectory=Test-ListDirectory $production;
   productionManifest=Test-FileOpen $productionManifest;
   bridgeDirectory=Test-ListDirectory $bridge;
   bridgeScript=Test-FileOpen $bridgeScript;
   credentialAtCurrentProfile=Test-FileOpen $credential;
   gitAvailable=([bool](Get-Command git.exe -ErrorAction SilentlyContinue));
   nodeAvailable=([bool](Get-Command node.exe -ErrorAction SilentlyContinue));
   codexAvailable=([bool](Get-Command codex.cmd -ErrorAction SilentlyContinue))
 }
 # A different Windows profile not containing the token is not enough to prove the other profile is unreadable.
 # No tool-only observation attests OS isolation.
 $report.isolationVerified=$false
 $report.note='Read-only triage: token absence is NOT proof of denial to the original profile. Inspect ACLs and test dedicated identity separately.'
 $report | ConvertTo-Json -Depth 4
} catch {
 '{"version":"m8-worker-boundary-audit-v2","isolationVerified":false,"error":"audit_failed"}'
 exit 2
}
