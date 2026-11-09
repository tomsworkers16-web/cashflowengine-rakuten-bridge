# 楽天公式API再調査：Cash Flow Engine #001導入計画（2026-11-10）

## 前提
- 公式一覧 https://webservice.rakuten.co.jp/documentation
- 公式規約 https://webservice.rakuten.co.jp/guide/rule
- 公開ページには一律の従量課金表は見当たらないが、**全APIが恒久的に無制限・無料とは断定しない**。利用には楽天会員・アプリ登録・App ID / Access Key、各APIの許可・制限が適用される。追加有料契約は作成しない。
- 商品ページを大量スクレイピングせず公式APIを使う。資格情報は出力・ログ・GitHubに保存しない。
- 公式APIから得た商品情報のコピー・改変・保存・第三者公開・SNS再配信については用途別規約を再確認する。現行画像の許可制を維持。
- 「長期販売」「売上急増」「収益が高い」は、発売日・レビュー件数・ランキングから直ちには証明できない。スコアは候補の優先付けに限る。

## 優先A（直ちに価値を生むもの）
1. **楽天市場商品検索API 2026-07-01**（既存接続）: itemCode, price, reviewCount, reviewAverage, affiliateRate, availability, shipping, image URL, shopCode, affiliateUrl, genreId。キーワード/ジャンル/価格/評価/報酬率などでフィルタ。用途：報酬額と読者価値を別スコア化。\n   https://webservice.rakuten.co.jp/documentation/ichiba-item-search
2. **楽天市場ランキングAPI 2022-06-01**（未接続）: ジャンル別・属性別ランキング、realtime/daily/weeklyなど公式パラメータ確認のうえ利用。用途：需要があるが競争の激しい集客枠の候補探索、1枚目の信頼性比較。\n   https://webservice.rakuten.co.jp/documentation/ichiba-item-ranking
3. **商品価格ナビ製品検索API 2025-08-01**（PR #83で読み取り専用プローブ実装）: releaseDate, productCode, productId, salesItemCount, reviewCount, rank, 価格分布。用途：製品の発売年月日と現在販売中店舗数、ニッチ定番候補の絞り込み。発売日≠楽天市場の初回掲載日・継続販売実績。\n   https://webservice.rakuten.co.jp/documentation/ichiba-product-search
4. **楽天市場ジャンル検索API 2026-07-01**（未接続）: ジャンル構造を取得。用途：マイクロニッチの発見、ジャンル比較、検索を狭めて露出・競争を分析。\n   https://webservice.rakuten.co.jp/documentation/ichiba-genre-search
5. **楽天市場商品属性検索API 2026-07-01**（未接続）: ジャンルに属する属性を取得。用途：サイズ・材質・対応機種といった比較記事の観点を標準化。商品の属性値が実際に取れるかは商品検索側の出力と合わせ検証。\n   https://webservice.rakuten.co.jp/documentation/ichiba-attribute-search

## 優先B（編集メディアの横展開）
6. **楽天ブックス総合・書籍・雑誌・ゲーム・ソフト・CD/DVD各検索＋ジャンル**：趣味/暮らし/仕事効率化・資格学習・書籍・ゲーム周辺を追加する場合。楽天アフィリエイト対応の検索APIを優先。\n   https://webservice.rakuten.co.jp/documentation
7. **楽天Kobo電子書籍検索＋ジャンル**：読書・学習系のサービス記事、デジタル読書のメリット比較。\n   https://webservice.rakuten.co.jp/documentation
8. **楽天レシピ カテゴリ一覧/カテゴリランキング**：献立・料理の悩み抽出、便利道具の自然な使用シーンを編集（非アフィリエイトAPI）。転載・画像利用の条件は別途確認。\n   https://webservice.rakuten.co.jp/documentation

## 優先C（別メディア/サービス案件向け。現行Threadsには急がない）
9. **楽天トラベル**：施設検索、キーワード検索、空室検索、ホテル詳細、地域区分、ホテルランキング、ホテルチェーン。旅行QOLメディアに拡張するときに活用。\n   https://webservice.rakuten.co.jp/documentation
10. **楽天GORA**：ゴルフ場検索、詳細、プラン検索。ゴルフ特化アカウント向けで現行アカウントに混ぜない。\n   https://webservice.rakuten.co.jp/documentation

## 基本方針と最短順序
- **第1段階：** PR #82の投稿改善をM8に反映し、投稿比率・リンクCTRを測る。PR #83の商品価格ナビAPIをM8から読み取り専用試験し、releaseDateの登録率・認証互換性を確認する。
- **第2段階：** 楽天ランキングとジャンルAPIを最小回数で試し、ジャンルごとに「集客向け人気」「収益期待ニッチ」「新興仮説」の候補を抽出する。利益算定は販売価格×APIの報酬率を単純比較するだけでなく、上限・キャンセル・確定値を考慮する。
- **第3段階：** 属性APIを利用して商品比較の根拠を強化。Books/Kobo/Recipeはアカウントの読者層データが支持する場合のみ追加。
- **未導入：** A8は楽天APIではないため別アダプター。実際のサービス案件・料率確認後に統合。APIの有無やアクセス権はA8側で個別調査。
- **記録：** 取得数、取得時点、製品IDや品目コード、データ欠損率、投稿タイプ、CTR、CV、確定報酬、経費を計測。規約上許可される最小限の保存に限定。

## セキュリティ・規約
- 楽天規約 Article 7 は利用制限や別途利用料金設定の可能性がある。Article 10 は利用目的・複製加工・公衆への共有可能な場所への保管などを制限する。
- 商品画像API URL取得＝SNSへの画像再配布許可ではない。現行rights-holder permission/opt-in要件を緩和しない。
- APIの429や認証不備時は停止/バックオフ。大量アクセスやURL一括走査をしない。
- main、本番環境、自動投稿設定、課金、顧客発信はオーナー承認まで実施しない。
