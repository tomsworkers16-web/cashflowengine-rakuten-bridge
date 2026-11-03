$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$node=(Get-Command node).Source
& $node --env-file=.env src\local-core.js
