# ランキング候補にレビュー・報酬率を照合する調査機能

前提：PR #87 のランキング候補から、最大5件だけ楽天市場商品検索APIに itemCode を指定して照合する。初回は任意実行であり、自動投稿エンジンに接続しない。

## M8での読み取り専用試験（main統合・最新化後のみ）
```powershell
Set-Location "C:\AI-Factory\cashflowengine-rakuten-bridge\m8-agent-node"
npm.cmd run probe-discovery -- --genre-id=558944 --enrich
```

- ジャンル検索1回、ランキング検索1回、商品検索は候補最大5回。レート制限を考慮して間隔を空ける。HTTPエラー時はコードのみを表示し、キーや商品情報を永続化しない。
- 追加結果 `itemEvidence.products` には `price`、`affiliateRatePct`、`reviewCount`、`reviewAverage`、`indicativeGrossYen`（1件成約したと仮定した概算の報酬目安、最大1,000円で仮置き）などを表示。
- **実売上、クリック率、CV率、確定報酬、利益、ロングセラー実績を表す数字ではない。** APIの報酬率・上限・成果対象・キャンセル・広告掲載条件等により実際の報酬は変わる。
- 実際に投稿する前に商品仕様、レビュー内容、商品画像の権利、紹介による読者利益、広告表示を確認する。
- 本番投稿・自動返信・画像自動公開・設定変更はない。 
