# One-time sandboxed Codex smoke test on M8. Does not access or modify production.
# Test workspace is C:\CFE-Codex-PoC, independent of existing Git repos.
$ErrorActionPreference = 'Stop'
$root = 'C:\CFE-Codex-PoC'
$git = Get-Command git.exe -ErrorAction SilentlyContinue
$codex = Get-Command codex.cmd -ErrorAction SilentlyContinue
if (-not $git) { Write-Host 'RESULT: GIT_MISSING'; exit 2 }
if (-not $codex) { Write-Host 'RESULT: CODEX_MISSING'; exit 2 }
if (Test-Path -LiteralPath $root) {
  Write-Host 'RESULT: WORKSPACE_EXISTS - no modifications made; inspect the existing folder'
  exit 2
}
New-Item -ItemType Directory -Path $root | Out-Null
Set-Content -LiteralPath (Join-Path $root 'README.md') -Encoding UTF8 -Value '# M8 Codex PoC - disposable isolated smoke test'
Push-Location $root
try {
  & $git.Source init -q
  if ($LASTEXITCODE -ne 0) { throw 'git_init_failed' }
  & $git.Source add README.md
  if ($LASTEXITCODE -ne 0) { throw 'git_add_failed' }
  & $git.Source -c user.name=Local-Smoke-Test -c user.email=smoke@example.invalid commit -qm 'Initialize disposable test repo'
  if ($LASTEXITCODE -ne 0) { throw 'git_commit_failed' }
  $prompt = 'In this test repository ONLY, create hello.js exporting an add(a,b) function and hello.test.js using node:test with two passing assertions. Run node --test hello.test.js. Do not access other directories, networks, credentials, or modify any other files.'
  $stdout = Join-Path $root 'codex.stdout.txt'
  $stderr = Join-Path $root 'codex.stderr.txt'
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = (Join-Path $env:SystemRoot 'System32\cmd.exe')
  $psi.Arguments = '/d /s /c "codex.cmd exec --ephemeral --ignore-user-config --sandbox workspace-write --ask-for-approval never -"'
  $psi.WorkingDirectory = $root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  try {
    if (-not $p.Start()) { throw 'codex_start_failed' }
    $p.StandardInput.WriteLine($prompt)
    $p.StandardInput.Close()
    $outTask = $p.StandardOutput.ReadToEndAsync()
    $errTask = $p.StandardError.ReadToEndAsync()
    if (-not $p.WaitForExit(180000)) {
      try { $p.Kill() } catch {}
      Write-Host 'RESULT: CODEX_TIMEOUT'
      exit 3
    }
    $p.WaitForExit()
    $exitCode = $p.ExitCode
    $out = $outTask.GetAwaiter().GetResult()
    $err = $errTask.GetAwaiter().GetResult()
    # Outputs remain on M8: DO NOT paste them without checking for secrets.
    [IO.File]::WriteAllText($stdout, $out)
    [IO.File]::WriteAllText($stderr, $err)
  } finally { $p.Dispose() }
  if ($exitCode -ne 0) { Write-Host "RESULT: CODEX_EXIT_$exitCode"; exit 4 }
  if (-not (Test-Path -LiteralPath 'hello.js')) { Write-Host 'RESULT: FILE_MISSING'; exit 5 }
  if (-not (Test-Path -LiteralPath 'hello.test.js')) { Write-Host 'RESULT: TEST_MISSING'; exit 5 }
  & node.exe --test hello.test.js | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host 'RESULT: TEST_FAILED'; exit 6 }
  $names = @(& $git.Source status --porcelain=v1)
  if (@($names).Count -lt 2) { Write-Host 'RESULT: CHANGES_NOT_DETECTED'; exit 7 }
  Write-Host 'RESULT: CODEX_SMOKE_PASSED'
  Write-Host 'Created only the independent PoC workspace and generated JavaScript files.'
} finally { Pop-Location }
