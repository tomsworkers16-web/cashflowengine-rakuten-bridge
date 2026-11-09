# 投稿と楽天成果の観測状況（読み取り専用）

M8でmain統合・最新版取得後、リポジトリ内 `m8-agent-node` で実行：

```powershell
npm.cmd run post-product-evidence
```

過去7日間の投稿台帳 `posts.jsonl`、既存夜間Threads指標 `reports/*-night.json`、楽天実績台帳 `affiliate-results.json` を**読み取るだけ**。外部API通信、投稿、ファイル保存、設定変更なし。

- スロット最終状態を採用し、曖昧な送信や重複行を成功投稿として数えない。
- 投稿IDでThreadsの累計表示回数を照合。未観測は `unknown` として扱う。
- 楽天側の記録日や `itemCode` が重複しても投稿別の成果帰属は証明できない。楽天のクリック率、投稿別報酬、確定純利益は既存トラッキングIDに基づく証明がない限り `unknown`。
- 調査の目的：表示回数が取れていない投稿数、楽天レポートの欠落日、商品コードの照合可能性を見える化する。売上の推測はしない。
