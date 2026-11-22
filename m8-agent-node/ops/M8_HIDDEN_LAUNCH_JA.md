# M8 遠隔受付ウィンドウの非表示 — 導入前チェックと復旧

## 現状確認
- GitHub Issue #18 により、開発ブランチ取得→M8隔離テスト76/76→exitCode=0→GitHub返信が成功。
- M8のタスク `AstonishFactory-M8Remote` は既存動作確認済み。本番のThreads投稿とは独立。
- **黒いPowerShellウィンドウが、タスクによるものか、手動で開いた操作用PowerShellなのかは未確定。** まず右上の×を押すのではなく、タスクをバックグラウンドで再起動してウィンドウ出現を確認する。
- タスク操作変更はオーナー承認後に実施。下記は**実行前手順書**。

## オプションA：現在のタスク構成を維持（推奨、黒画面が再現しなければ）
既存の操作には `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\AI-Factory\M8Remote\bridge.ps1"` を指定済みのはず。ウィンドウが手動起動したPowerShellの場合は、変更不要。タスクが正しく動作しているかはGitHubのhealth指示で確認する。

## オプションB：確実な非表示起動（黒画面再現時のみ）
追加した `m8-remote-hidden-launcher.vbs` は起動先のファイルパスを固定し、`WScript.Shell.Run(..., 0, True)` によりPowerShellのウィンドウを非表示にする。外部から任意のコマンドを受け付けない。黒画面非表示の動作はM8実機では未検証。

1. 既存タスクの「操作」タブのスクリーンショットまたは設定を記録してから変更する。
2. GitHubの開発ブランチ `m8-agent-node/ops/m8-remote-hidden-launcher.vbs` を `C:\AI-Factory\M8Remote\launch-hidden.vbs` に保存。**ソースを確認してから実行**。
3. タスクスケジューラ > タスクスケジューラライブラリ > `AstonishFactory-M8Remote` > プロパティ > **操作**タブ > 編集:
   - プログラム: `wscript.exe`
   - 引数: `"C:\AI-Factory\M8Remote\launch-hidden.vbs"`
   - 開始: 空欄
4. 「全般」では、トークンを登録した**同じWindowsユーザー**を使い、最上位の特権は付与しない。タスク設定の「既に実行中の場合、新しいインスタンスを開始しない」は維持。
5. タスクを停止・開始する。状態が実行中になることを確認し、GitHubにhealth Issueを作成し、実際に閉じられてコメントが届くことを確認する。
6. 確認失敗時はタスクの操作欄を元の `powershell.exe` と以前の引数に戻し、タスクを再実行する。**本番のCash Flow Engineタスクは触らない**。

## 注意事項
- `wscript.exe` が無効化されているPCでは使えない。その場合は変更せず現状のタスク構成を維持。
- 非表示で常駐するためエラー画面も見えない。通信の可否はGitHubの非公開Issueで実測する。
- タスク再起動時に他のPowerShellプロセスを無差別終了させない。
- Windowsログオン時起動のため、ログオフ状態からの自動復旧や再起動後の動作はまだ未確認。
- 追加プログラムの導入・タスク変更は**未実施**。オーナー承認前に本番M8設定を変更しない。
