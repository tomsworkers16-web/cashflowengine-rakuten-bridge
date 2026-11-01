$ErrorActionPreference = 'Stop'

Write-Host '=== Cash Flow Engine M8 Agent Node Setup ===' -ForegroundColor Cyan

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Require-Command($name, $installHint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name が見つかりません。$installHint"
  }
}

Require-Command 'node' 'Node.js LTSをインストールしてください。'
Require-Command 'npm' 'Node.js LTSをインストールしてください。'

$chrome = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  throw 'Google Chrome が見つかりません。Chromeをインストールしてから再実行してください。'
}

Write-Host '[1/5] npm install'
npm install

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host '[2/5] .env を作成しました。CFE_M8_SHARED_SECRET は後で設定します。'
} else {
  Write-Host '[2/5] .env は既に存在します。'
}

New-Item -ItemType Directory -Force -Path '.data\threads-profile' | Out-Null
Write-Host '[3/5] Threads永続プロファイル領域を準備しました。'

$taskName = 'CashFlowEngine-M8-AgentNode'
$nodeExe = (Get-Command node).Source
$agentPath = Join-Path $root 'src\agent.js'
$workDir = $root
$launcher = Join-Path $root 'start-agent.cmd'
@
"@echo off
cd /d \"$workDir\"
for /f \"usebackq tokens=1,* delims==\" %%A in (\".env\") do if not \"%%A\"==\"\" if not \"%%A:~0,1\"==\"#\" set \"%%A=%%B\"
\"$nodeExe\" \"$agentPath\"
"@ | Set-Content -Path $launcher -Encoding ASCII

$action = New-ScheduledTaskAction -Execute $launcher -WorkingDirectory $workDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1)
try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Cash Flow Engine M8 Agent Node' -Force | Out-Null
  Write-Host '[4/5] Windowsログオン時の自動起動を登録しました。'
} catch {
  Write-Warning 'タスクスケジューラ登録に失敗しました。PowerShellを管理者として再実行してください。'
}

Write-Host '[5/5] セットアップ準備完了。'
Write-Host ''
Write-Host '次回の実機作業:' -ForegroundColor Yellow
Write-Host '1) .env の CFE_M8_SHARED_SECRET を設定'
Write-Host '2) npm start を実行'
Write-Host '3) 開いたChromeで Threads に rakumitsu_select として1回だけログイン'
Write-Host '4) ログイン後はChromeを閉じずにAgentを再起動し、常駐確認'
