# 作業引継ぎ — M8遠隔開発環境（2026-11-21 日本時間）

## 完了・実測
- 非公開GitHub指示リポジトリ `tomsworkers16-web/cfe-m8-control` を作成。PATはこのリポジトリのIssues Read/Writeのみ。秘密はGitHubや会話に保存しない。
- M8側：`C:\AI-Factory\M8Remote\bridge.ps1`。Windowsタスク：`AstonishFactory-M8Remote`、実行状態Runningをユーザーが確認。約60秒ポーリング。ポート開放なし。
- GitHub Issue #6：M8を操作せず health受信→応答→Closed。Nodeあり、localhost:18787 TCP接続可。
- GitHub Issue #7：`editorial-sync-test` 実行→隔離スナップショット取得成功。対象commit `13d1eb303fe7bd98763c1a1e4165c863b3e458b9`。テスト出力 **76 tests, 76 pass, 0 fail**、ただしExitCode=null、status=passed_output_only_exit_unknown。結果のIssue返送、Closedを確認。
- GitHub Issue #8：health応答、Closedを確認。
- 実運用のThreads自動投稿・本番ディレクトリは変更していない。
- GitHub作業ブランチ `docs/editorial-quality-gate-b-20261116` の `m8-agent-node/ops/m8-remote-bridge.ps1` は、構文破損したコードを動作していた版から再構築済み。M8側のPowerShell Parserで構文チェック合格後に配備、タスク再起動済み。

## 未完了・課題
1. テスト実行で黒い `npm run editorial-tests` コンソールが表示され、残る問題。ユーザーが手動で閉じた。
2. 子プロセスの終了コードがnullになり、全件成功出力を取得しても厳密な合格判定ができない。終了コードとプロセス完了の取得修正が必要。
3. 再起動後の自動復旧と長時間連続稼働は未検証。タスクはログオン時起動の設定。
4. 新機能がどのような権限で動作しているか再点検。任意コマンドは無効・指示はallowlistのみ、本番環境を変更しない。
5. 修正時は **GitHub作業ブランチにのみ書く**。mainはユーザー承認なしで変更しない。M8側では必ず候補ファイルのPowerShell構文チェック後に入れ替え。更新はGitHub APIのcommit SHA指定取得（raw URLで旧版キャッシュ問題が過去に発生）。

## 次にやること
- 最優先：終了コード/nullと黒いウィンドウを修正し、隔離環境で遠隔動作テストを再実施。ユーザーの手動操作を最小限にする。
- 次：再起動・常駐安定性の確認。
- その後は遠隔環境への過剰な機能追加ではなく、記事品質改善とアフィリエイト収益化の開発へ戻す。
- ユーザーは本日作業終了を明示。今夜はこれ以上M8操作依頼をしない。

## 2026-11-22 追記：無人テスト改善（作業ブランチ）
- `m8-agent-node/ops/m8-remote-bridge.ps1` の `editorial-tests` と `editorial-sync-test` を共通の `Invoke-EditorialTestProcess` に統一。
- PowerShell `Start-Process -NoNewWindow` から、.NET `ProcessStartInfo` の `CreateNoWindow=true`, `UseShellExecute=false`, `RedirectStandardOutput=true`, `RedirectStandardError=true` に切替。標準出力・標準エラーは非同期で収集し、終了コードは `Process.ExitCode` を取得する。GitHubには件数・結果だけを送る。
- 120秒の上限を維持。旧版の空の黒いテストコンソールと exitCode=null の改善が目的。
- **GitHub実装は済み、M8への反映・構文チェック・実機テストは未実施**。次にPS1をSHA固定のGitHub APIで取得し、Windows PowerShellのParserで構文チェック後、常駐タスクを再起動する。検証までは「修正完了」としない。
