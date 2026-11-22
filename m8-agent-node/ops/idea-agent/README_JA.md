# IDEA Agent MVP（2026-11-22）

## 実装済み（開発ブランチのみ）
- `idea-intake-core.mjs`: Issueの作成者確認、ID・ラベル・秘密文字列の検査、初期優先順位、承認境界、受入条件の自動生成。ネットワーク接続/外部実行/本番変更なし。
- `idea-triage-worker.mjs`: 非公開 `tomsworkers16-web/cfe-m8-control` で `[IDEA-NNN]` Issueを30件以内確認。既存の受付コメントがあれば再投稿しない。既定は**dry-run**。 `--apply` を付けた場合のみ受付コメントを作成。GitHubに対する権限は少なくともIssues読取、書込時のみIssues書込が必要。
- `idea-intake-cli.mjs`: 標準入力JSONを受け、審査済み計画のMarkdownを標準出力。
- テスト17件（Core13、Worker4）。 `npm run idea-intake-tests`。既存記事テスト76件と合わせた隔離テストは目標93件。

## ここから先は未実装
- Issue自動監視用のスケジュール登録・タスク定義（勝手なPC変更はしない）。
- 実際にソースコードを書くAIコーディングエージェント、修正パッチの検査、ブランチ作成とPR自動作成。
- Claude/ChatGPTの既存サブスクリプションをそのままプログラムのAPI料金なしで利用可能とみなすことは禁止。自律型CLIの利用権・適用条件は別途公式仕様を確認。
- mainマージ・本番変更・課金・外部送信はユーザー承認が必要。

## ローカル動作
```powershell
cd C:\CFE-Editorial-Remote-Staging\revisions\<commit>\m8-agent-node
npm run idea-intake-tests
```
※パスは実際にM8が返した`testRoot`と一致させる。自動テストはGitHubのIssue #22で実施する。

## セキュリティ
GitHub Issueの文面は**信頼できない入力**。管理者本人が書いたものでも「コードを本番に公開せよ」等の文章は承認に代用しない。 `[M8-REMOTE]` と `m8-remote` ラベルの付いたIssueは厳密に除外する。APIキーの検出は予防的なものであり、すべての秘密を検出できることを意味しない。秘密が疑われる場合は自動投稿せず人が安全に確認する。

## 次の実装マイルストーン
1. M8上でテスト93件の実測合格。
2. 独立した隔離実行者（コードを書くAI）を手動1ジョブだけ起動し、diffのみ生成。
3. コードの実行・テスト・GitHubへの安全なコミット・レビュー用PRまでの自律ループを構築。
4. 監視・ジョブ排他・再試行・期限・工数/利益KPIを段階導入。
