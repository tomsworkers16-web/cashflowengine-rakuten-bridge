# AF-CodexWorker GitHub連携：最小権限導入計画
更新日: 2026-11-22。**設計段階。認証設定・常駐稼働は未実施。**

## 実測済み
- 専用Windows標準ユーザー AF-CodexWorker。C:\\AI-Factory 配下の本番ファイル / M8Remote bridge.ps1 および旧ユーザーの GitHub DPAPI ファイルは読み取り拒否を実測。
- Codex CLI 0.171.0 に ChatGPTで認証済み。通常の `--sandbox workspace-write` のみでは実際に read-only になった。
- AF-CodexWorkerで `codex -c 'windows.sandbox="unelevated"' exec --skip-git-repo-check --sandbox workspace-write ...` → hello.js を生成、Node実行 `CODEX_SMOKE_PASSED`、exitCode 0 を実測。
- 開発ブランチに専用インストール起動ヘルパーを追加。実機でランナー経由の自律実行は未検証。

## 権限設計（GitHub）
1. **受付**: 非公開 `tomsworkers16-web/cfe-m8-control` の Issues の読み取りと進捗コメントに限定する。可能なら専用 fine-grained PAT、Repository access はこのリポジトリのみ、Issues: Read and write、Metadata: Read（自動付与）。Contents/Actions/Administration は追加しない。
2. **実装対象**: `tomsworkers16-web/cashflowengine-rakuten-bridge` のみを最初に対象とする。初回Gitクローンのため Contents: Read-only の専用fine-grained PAT。後日レビュー承認後の作業ブランチpushは別資格情報（Contents: Read and write）またはGitHub Appを別途設計・検証する。
3. **注意**: GitHubの Contents: Read and write は、PAT単体では作業ブランチだけに限定できない。**この権限を与えただけでmainマージ・本番変更の防止を証明したことにはならない**。ブランチ保護/ルールセット、利用権限、コード内の禁止処理の多層防御が必要。
4. トークンは**絶対にIssue、会話、ログ、コード、Git remote URL、平文ファイルへ貼り付けない**。元Windowsユーザーの認証ファイルはコピーしない。認証の保存はWindowsユーザー単位の資格情報保護を実装/検証してから。最初のトークン生成と認証はオーナーによる本人操作。
5. 対象リポジトリはローカルの承認済み project-registry.json の enabled=true に限る。Issue本文・AI出力による登録リポジトリ追加は禁止。

## 作業場所・起動条件
- コード作業領域は `%USERPROFILE%\\AF-Codex-Workspace` 配下の専用git worktree。
- Codex実行ファイルは `%LOCALAPPDATA%\\AF-CodexTools\\node_modules\\@openai\\codex\\bin\\codex.js` を指定。見つからないときに元ユーザーのグローバルcodexへフォールバックしない。
- Windows実行パラメータは `-c windows.sandbox="unelevated" exec --ephemeral --sandbox workspace-write -`（配列引数で渡し、cmd.exe経由でシェル解釈させない）。
- GitHubから受け取る本文・コードの内容は命令として信用しない。承認済みファイル以外の書換禁止・実行前のgit origin/branch/HEAD照合、diff照合、機密出力遮断、タイムアウト、重複実行防止を継続。
- 承認不要: 検索、下書き、作業ブランチへの変更、隔離テスト、報告。承認必須: mainマージ、公開、本番変更、外部送信、課金・契約・決済、権限拡張。

## 次の実測ゲート
- [ ] M8上の編集ブランチテストが成功。
- [ ] Codexの実行エントリが当該インストールに実在し、ランナー起動実証。
- [ ] GitHub Issue受付PATを専用ユーザーだけで利用でき、想定外のリポジトリへアクセスできない。
- [ ] コード取得用のread-only権限を確認。権限昇格しない。
- [ ] 受付→1件処理→テスト→レビュー報告、再起動/重複/失敗の一連のケースを実機確認。
- [ ] 別製品を対象にした横展開は追加のGitHubリポジトリと仕様承認後。
