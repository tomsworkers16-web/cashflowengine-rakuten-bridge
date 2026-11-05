# 楽天アフィリエイト成果レポート：ブラウザ自動取得の段階導入

公式案内：https://affiliate.rakuten.co.jp/guides/report/

公式の「期間別成果」レポートはPCでCSVダウンロード可能です。ただしログインが必要な実画面は自動テストから直接確認できないため、**画面特定と取得を分離**します。

## 第1段階：画面検査（投稿もダウンロードも行わない）
M8の別PowerShellから：

```powershell
cd C:\AI-Factory\cashflowengine-rakuten-bridge\m8-agent-node
npm.cmd run rakuten-report-inspect
```

専用Chromeウィンドウが開きます。ログインが必要な場合は本人が楽天へログインします。プログラムは認証情報の入力や二段階認証の回避を行いません。認証情報をChatGPTやGitHubへ送らないでください。

結果の `status` と `controls` だけを確認し、適切なCSVダウンロードボタンを特定します。セッションはThreadsのChrome profileとは**別**の `.data/rakuten-report-chrome-profile` に保存されます。

## 第2段階：CSVダウンロード（初回GUI検証後のみ）

```powershell
npm.cmd run rakuten-report-download
```

「CSV」を明示したダウンロードボタンが1つだけ見つかった場合に限ってクリックします。曖昧なボタンでは止まります。CSVのヘッダー・日付・数値が既存の期間別成果レポートに一致しなければ成果台帳へ反映しません。画像投稿やThreads投稿は実行しません。

`RAKUTEN_REPORT_DOWNLOAD_DIR` が未設定のとき、検査済みCSVは `.data/rakuten-browser-exports` に保存し、成果台帳への反映は自動では行いません。有効化済みであれば既存の取り込み機構が同じフォルダーから成果台帳に反映します。

## 制約

- 公式画面の実際のボタン名や期間の設定が未検証のため、**完全無人の定期CSVダウンロードはまだ有効化していません**。
- 楽天側にログインや再認証を求められた場合、本人操作が必要です。
- 楽天の画面設計や利用条件に反する非公開API呼び出し、認証回避、CAPTCHA回避は実装しません。
- 画面のCSVボタンが曖昧なら安全側で停止します。
- 既存のThreads定期投稿・自動返信設定は変更しません。
