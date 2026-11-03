$ErrorActionPreference = 'Stop'

Write-Host '=== Cash Flow Engine M8 Local Core Setup ===' -ForegroundColor Cyan

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Require-Command($name, $installHint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name が見つかりません。$installHint"
  }
}

Require-Command 'node' 'Node.js 22 LTS以上をインストールしてください。'
Require-Command 'npm' 'Node.js 22 LTS以上をインストールしてください。'

$nodeVersion = [version]((node -v).TrimStart('v'))
if ($nodeVersion.Major -lt 22) { throw 'Node.js 22以上が必要です。' }

$chrome = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'Google Chrome が見つかりません。Chromeをインストールしてから再実行してください。' }

Write-Host '[1/6] npm install'
npm install

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host '[2/6] ローカル専用 .env を作成しました。' -ForegroundColor Green
} else {
  Write-Host '[2/6] .env は既に存在します。既存値を保持します。'
}

New-Item -ItemType Directory -Force -Path '.data\threads-profile' | Out-Null
Write-Host '[3/6] ローカル状態保存領域とThreads永続プロファイルを準備しました。'

$taskName = 'CashFlowEngine-M8-LocalCore'
$nodeExe = (Get-Command node).Source
$corePath = Join-Path $root 'src\local-core.js'
$launcher = Join-Path $root 'start-local-core.cmd'
@
"@echo off
cd /d \"$root\"
\"$nodeExe\" --env-file=.env \"$corePath\"
"@ | Set-Content -Path $launcher -Encoding ASCII

$action = New-ScheduledTaskAction -Execute $launcher -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Cash Flow Engine M8 local-only runtime' -Force | Out-Null
  Write-Host '[4/6] Windowsログオン時の自動起動と自動再起動を登録しました。'
} catch {
  Write-Warning 'タスクスケジューラ登録に失敗しました。PowerShellを管理者として再実行してください。'
}

# Prevent sleep while plugged in. Monitor may turn off; PC itself must stay awake.
try {
  powercfg /change standby-timeout-ac 0 | Out-Null
  powercfg /change hibernate-timeout-ac 0 | Out-Null
  Write-Host '[5/6] AC電源時のスリープ/休止を無効化しました。'
} catch {
  Write-Warning '電源設定変更に失敗しました。Windows設定からスリープを「なし」にしてください。'
}

Write-Host '[6/6] ローカル基盤の準備完了。' -ForegroundColor Green
Write-Host ''
Write-Host '次に必要な作業:' -ForegroundColor Yellow
Write-Host '1) .env に Meta Threads と楽天APIの既存認証情報をローカルだけで設定'
Write-Host '2) CFE_AUTO_POST_ENABLED=false のまま npm start を実行'
Write-Host '3) 開いたChromeで Threads に rakumitsu_select として1回だけログイン'
Write-Host '4) http://127.0.0.1:18787/health が正常か確認'
Write-Host '5) 認証確認後に CFE_AUTO_POST_ENABLED=true へ変更し、本番投稿をM8へ切替'
Write-Host ''
Write-Host '※ Render / Supabase / TinyFish / GitHub Actions はこのLocal Coreの実行には不要です。'
