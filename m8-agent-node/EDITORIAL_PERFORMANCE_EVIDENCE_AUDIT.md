# ラクミツ: 商品別成果データの適格性監査（2026-11-23）

Issue #38 の次工程。既存の日別CSV/UI取り込みは、口座の日別集計であり、商品別クリック・確定利益を生成する仕様ではない。日別データに商品コードを付けても商品別実績にはならない。

この監査は既存台帳を読み取り、商品コード・安定したレコードID・クリック・注文・報酬・費用・確定状態の充足状況を件数だけで返す。日別集計は除外し、矛盾する重複IDを適格としない。実際の数値や識別子は出力しない。監査合格はデータの出所や帰属の独立検証ではない。

## オフライン実行

```powershell
node --test test/editorial-performance-evidence-audit.test.js
node src/run-editorial-performance-evidence-audit.js
```

引数なしは `.data/affiliate-results.json`（または既存の `CFE_DATA_DIR`）を読み取り、任意のレビュー済み台帳ファイルを引数として指定することもできる。投稿・APIアクセス・ファイル書き込み・設定変更は実施しない。

## 判定

- `ledger_unavailable_or_invalid`: 台帳未取得または不正。実績ゼロとはみなさない。
- `item_evidence_insufficient`: 商品別確定利益を評価するための入力不足。集計値から配分・推定しない。
- `item_evidence_schema_present`: 必須項目が揃ったレコードあり。出所、対象期間、重複・帰属・費用範囲を別途確認してから研究用優先度へ接続する。

本番データでの監査は未実施。実際の報告形式を確認するまでは、商品別利益を根拠とした推薦・公開を有効化しない。main統合・M8への配布はオーナー承認後。

## 商品選定への接続（開発ブランチ・オフライン）

既存 `prioritizeEditorialResearch` が同じ監査ロジックを使用する。確定済み・項目完備の重複しない行のみ集計し、同一商品の不完全行・暫定報酬・矛盾IDがあれば確定利益判定を保留する。日別集計は除外する。

- `validated_candidate`: 必要なクリック母数を満たし、報告上の確定純利益が正の研究候補。
- `experiment`: データ不足、利益ゼロ、少数サンプル、暫定報酬など。既存の候補優先度を参考に検証する。
- `loss_review`: 報告上の確定純利益が負のため再検討する候補。

`validated_candidate` は出所を独立に検証した意味ではない。すべて公開不可、投稿別帰属なし。商品選定の研究用プレビューであり、本番投稿エンジンには接続していない。

```powershell
node --test test/editorial-performance-evidence-audit.test.js test/editorial-performance-priority.test.js
node src/run-editorial-performance-priority.js input.json
```

## B案記事候補への接続

`buildEditorialShortlist`、`buildEditorialArticleWorkflow`、`runEditorialAiWorkflow` は任意の `performanceRecords`（監査対象のレコード配列）を受け取る。省略時は従来通り。入力を指定した場合のみ、最大候補数の切り捨て前に報告上の確定純利益を評価する。赤字候補は `performance.lossReview` に分離し、記事生成しない。2枠以上で最後の枠が利益実績候補のみになる場合、ショップ・テーマ上限に適合する未検証候補があれば1枠を確保する。

実績情報は調査順を決めるだけで、仕様の事実確認・品質ゲート・公開承認を代替しない。AI生成と記事整形は同じ候補集合を使う。

既存のレビュー用候補入力JSONを使い、M8の台帳を別途コピーせずオフラインで読み込める（実行場所は開発用複製。実環境の台帳は読み取り専用で明示指定する）。

```powershell
node src/run-editorial-article-workflow.js input.json --ledger .data/affiliate-results.json
node --test test/editorial-performance-article-integration.test.js
```

入力JSON内に `performanceRecords` が既に存在する場合は、`--ledger` を併用しない。不正または未取得の台帳はエラーとし、実績ゼロ扱いにしない。本番台帳を用いた実測は未実施。

## 楽天注文明細CSVの実ファイル検証（2026-11-23）

オーナーから取得した2026年11月の注文明細CSVはUTF-8 BOM付き、先頭にタイトルとステータス等の凡例、次に日本語・英語の11列のヘッダーがある。実測では注文行0件。これは当該ファイルの状態で、アカウント全体の利益ゼロや初収益記録との一致を証明しない。

列は発生日、成果報酬、料率、売上金額、ジャンル名、ショップ名、商品名、ステータス、リンクタイプ、デバイスタイプ、計測ID。商品コード・一意な注文ID・商品別クリック・費用はない。凡例を注文行と誤認しない。注文情報・計測IDの値は外部出力せず、元CSVもコミットしない。

計測IDは楽天公式リンク作成機能で設定できるが、既存リンクとの対応・商品クリックの取得方法は未確認。リンク改変や投稿変更をせず、購入商品と紹介商品の同一性を推定しない。

```powershell
node src/run-rakuten-order-report-audit.js order.csv
node --test test/rakuten-order-report-audit.test.js
```

監査は実ファイルで `empty_order_report` と判定。非空の注文行は模擬入力で形状のみ検査済み。実データによる金額・ステータス・計測IDの意味検証を完了するまで、既存の利益台帳と混ぜない。公式参照: https://affiliate.rakuten.co.jp/guides/report/ および https://affiliate.rakuten.co.jp/guides/link/ 。

## 計測IDと記事・投稿の照合（2026-11-24）

楽天の公式リンク作成画面で付与した計測IDを、投稿・記事の内部IDと一対一で記録する。実際の発行と公開の確認は別工程であり、IDの文字列から公式リンクの発行を推定しない。次は公式発行済みリンクを1件だけ登録し、レポートに反映された計測IDを確認する。

入力の例（架空値、発行・公開は未確認）:

```json
[
  {"measurementId":"example-id","channel":"threads","contentId":"draft-001","officialLinkConfirmed":false,"publicationConfirmed":false}
]
```

`officialLinkConfirmed` と `publicationConfirmed` は確認記録がある場合に限り真とする。同一IDが重複登録されている場合は照合しない。照合結果はレポート行数と内部記事IDのみ。計測IDそのもの、購入商品名、金額、秘密情報は出力しない。商品・投稿の因果関係、購入商品の同一性、注文件数、クリック、実利益は判定しない。安定した注文IDもないため複数の月次スナップショットを合算しない。

```powershell
node src/run-rakuten-measurement-attribution.js order.csv registry.json
node --test test/rakuten-measurement-attribution.test.js
```

現段階はオフライン照合の試作。公式リンク発行・本番投稿・既存リンク変更・M8配布は未実施。本物の非空注文行による検証も未実施。
