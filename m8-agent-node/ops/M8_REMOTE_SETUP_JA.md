# M8遠隔実行ブリッジ v1（導入手順）

## 目的と接続構成
スマホ/外部PCのChatGPT → **非公開**GitHubリポジトリ `tomsworkers16-web/cfe-m8-control` のIssue → M8常駐の読み取り専用ブリッジ → Issueコメントへ結果返却。
M8の外部公開ポート、SSH、リモートデスクトップを必要としない。既存の公開 `cashflowengine-rakuten-bridge` を指示箱にしない。

**現段階で許可する指示は2つだけ。**
- `health`：Nodeの存在、localhost 18787のTCP応答（プロセス稼働の簡易検査）
- `editorial-tests`：`C:\CFE-Editorial-Test-v13` 内の `m8-agent-node` に限定し `npm.cmd run editorial-tests` を実行する。結果はテスト件数・成功件数・失敗件数・終了コードのみ。実行時間上限120秒。
IssueにはPowerShell、任意スクリプト、URL、実行パスを渡せない。自動的なgit pull、ソース更新、Threads投稿、本番変更、公開、決済は一切行わない。

## セットアップ（オーナーがGitHub/M8で一度だけ実施）
1. GitHub → 右上 **+** → **New repository** で所有者 `tomsworkers16-web`、名前 `cfe-m8-control`、**Private** として作成。Issuesを有効にする。公開リポジトリでは絶対に運用しない。
2. `cfe-m8-control` → **Issues** → **Labels** → **New label** で `m8-remote` を作成。
3. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token。リポジトリアクセスは **Only select repositories** で `cfe-m8-control` だけ選択。Repository permissions の **Issues: Read and write** のみ追加（Metadata readは標準）。有効期限を設定。トークンをチャット・GitHub Issue・スクリーンショットに貼らない。
4. M8でPowerShellを通常ユーザーとして開き、以下を1行ずつ実行（作業フォルダは既存稼働アプリとは別）：

```powershell
New-Item -ItemType Directory -Path "C:\AI-Factory\M8Remote" -Force | Out-Null
Invoke-WebRequest "https://raw.githubusercontent.com/tomsworkers16-web/cashflowengine-rakuten-bridge/docs/editorial-quality-gate-b-20261116/m8-agent-node/ops/m8-remote-bridge.ps1" -OutFile "C:\AI-Factory\M8Remote\bridge.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\AI-Factory\M8Remote\bridge.ps1" -Setup
```

5. `PAT (hidden)` と表示されたら生成したトークンを入力。表示されないのが正常。暗号化して `%LOCALAPPDATA%\AstonishFactory\M8Remote\github-token.dpapi` に保存。これはWindowsの同一ユーザーだけで復号できる形式。
6. まず単発の安全な接続確認（別のPowerShellを開いてもよい）：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\AI-Factory\M8Remote\bridge.ps1" -Once
```

7. Issueを作成し、タイトルを `[M8-REMOTE] health check`、本文を **`health` の1行だけ**、ラベルを `m8-remote` にする。ブリッジが実行するとJSONの結果をコメントしIssueをCloseする。GitHub連携済みのChatGPTからもIssue作成と結果読取が可能な場合があるが、**非公開リポジトリをChatGPTのGitHub連携に追加する権限が必要**。

8. 正常確認後、M8の **タスクスケジューラ** → **タスクの作成** → 名前 `AstonishFactory-M8Remote`、実行ユーザーはセットアップと同じWindowsユーザー → トリガー **ログオン時** → 操作 **プログラムの開始**：
   - プログラム：`powershell.exe`
   - 引数：`-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\AI-Factory\M8Remote\bridge.ps1"`
   - 設定で「既に実行中の場合は新しいインスタンスを起動しない」。ポーリング間隔は約60秒。
   - ログオン前も常時稼働させたい場合は、タスクのユーザー権限とDPAPIの整合性を別途検証し、安易にSYSTEMへ変更しない。

## 日常的な遠隔指示
ChatGPTに「M8の稼働状況を確認して」「M8で記事テストを実行して」と依頼。ChatGPTは非公開の `cfe-m8-control` に正しいIssueを作り、のちにコメントの結果を読み取る。実際に橋が動作した証拠がない場合、実行済みとは報告しない。

## 安全と制限
- Issueは正しいラベル・題名・**特定GitHubユーザーID** に一致したものだけ処理。コマンド本文は厳密に `health` または `editorial-tests` のみ。
- テストスクリプトには任意コード実行能力があるため、信頼済みの**隔離コピー** `C:\CFE-Editorial-Test-v13` だけを使う。自動で取得した未知のブランチを実行しない。
- テスト結果は数値の要約だけを返し、APIキーや生ログをIssueに送らない。
- トークン漏洩時は即時失効。トークン期限切れ時は設定更新が必要。
- GitHubの接続不良時は次のポーリング周期に再試行。大量ジョブを捌く設計ではない。
- GitHub連携アプリに非公開リポジトリへの権限がない場合は、**管理画面でそのリポジトリの接続権限を追加**する。ユーザーの確認なく権限を広げない。
- 2026-11-21時点、GitHub開発ブランチにコード保存済み。**M8でのセットアップ、Issue疎通試験は未実施**。
