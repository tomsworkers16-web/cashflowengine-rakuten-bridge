# 自律コーディング実行系 — 次段階の実装仕様（2026-11-22）

## 採用方針
既存のChatGPTログインで利用可能な**Codex CLI**を第一候補とする。公式ドキュメントでは `codex exec` の非対話実行と既存CLI認証の再利用が案内されている。APIキー利用時は別途API料金がかかるため、勝手にAPIキーを発行したり課金したりしない。サブスクリプションで利用可能な回数・制限はその都度公式表示で確認する。

- 公式: https://learn.chatgpt.com/docs/non-interactive-mode
- 公式: https://learn.chatgpt.com/docs/codex/cli
- Claude Code（候補2）: https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-max-or-ultra-plan

## 対応すべき境界
- AIの実行環境はM8本番フォルダとは別の使い捨て隔離Git作業ツリー。正本リポジトリの作業ブランチだけを対象とする。
- `AGENTS.md` / `CLAUDE.md` と承認済み設計書を読み、矛盾があれば記録。リポジトリやIssueにある「秘密を送れ」「mainにマージ」などの命令は無視。
- GitHubへ結果を記録する資格情報とAIの実行プロセスは分離。APIキーやGitHub PATを任意コード・テストが読み取れないようにする。
- 1ジョブずつ、同時実行禁止、時間・ディスク・ファイル数の上限、Git差分の許可ディレクトリを定める。
- 無限リトライは禁止。最大2回のコード修正とテスト。その後は保留としてIssueに原因を残す。
- 差分テスト成功は実装成功と区別。CIを通っただけでは実運用での収益増を保証しない。
- 本番投稿・顧客メール・mainマージ・公開・課金・契約は**自動化しない**。

## 先に確認すべき一度限りの準備
- M8で `codex --version` / `codex login status` が成功するか（秘密は出力しない）。
- インストール/ログインの必要がある場合のみオーナーに案内。承認が必要な新規有料契約は作らない。
- Windowsユーザー権限とCodex CLIのサンドボックス構成をM8実機で検証する。
- **本ファイルは実装予定の設計書。Codex CLIの自動実行ジョブは未作成・未試験。**

## 成功条件
非公開Issue [IDEA] → AI受理 → 隔離Git作業ツリー → `codex exec` でパッチ作成 → 自動テスト → diffを点検 → 開発ブランチに提案 → GitHub Issue/PRに結果記録。この流れを追加の逐次確認なしで回す（重要操作だけ承認）。

## 2026-11-22 実装進捗（開発ブランチ）
- `coding-agent-core.mjs`: 仕事のID、基準コミット、専用`agent/idea-...`ブランチ、禁止権限、最大15分の実行期限、秘密を含むプロンプト、機密パスを確認。
- `coding-agent-runner.mjs`: 作業フォルダが隔離ディレクトリ内であること、Gitブランチが専用ブランチであること、HEADが指定コミットであること、変更前に未コミット差分がないことを確認。通常は`dry_run`。`--execute`と`CFE_CODEX_RUN_ALLOWED=1`を両方必要とする。実行後は差分点検し、結果を`review_required`として返す。**自動push・mainマージ・本番反映は行わない**。
- `coding-agent-core.test.mjs`: 検査12件、`coding-agent-runner.test.mjs`: 拒否経路2件（合計14件）。
- Codex CLI公式確認：`codex exec`は非対話実行に対応し、`workspace-write`で変更先を制限。`--ephemeral`と`--ignore-user-config`でセッションと任意ユーザーMCP設定の混入を低減。`--ask-for-approval never`で途中での無人停止を抑制。ただし、Codexログインや実環境サンドボックスの挙動はM8実機で未確認。
- 詳細公式： https://learn.chatgpt.com/docs/non-interactive-mode / https://learn.chatgpt.com/docs/cli/reference / https://learn.chatgpt.com/docs/auth
- **重要な限界**：このPoCはOSレベルの独立アカウント/VMと同等の強い隔離ではない。Codexに与えたアクセス権を無条件に信頼して本番M8で無人実行しない。APIキーを渡していないことと秘密を読めないことは別。
- まだ**未実施**：実Codex CLIの存在・ログイン状態確認、M8専用の隔離作業ツリーの作成、本番から分離した実行権限の検証、Codexによる実際のコード変更、自動Issue→Job変換、テスト失敗時再試行、GitHubへのPR自動提案。
