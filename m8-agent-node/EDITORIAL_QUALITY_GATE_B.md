# 記事品質ゲート B方式（試験実装）
作業ブランチのみ。M8本番・自動投稿エンジンへの接続、公開設定変更はしていない。

## 構成
- `src/editorial-quality-gate.js`: 構造化された記事ドラフトを採点し、差し戻し内容を返す
- `src/audit-editorial-draft.js`: JSONファイルを読み取り、採点結果と修正依頼JSONを標準出力に表示する（オフライン）
- `test/editorial-quality-gate.test.js`: 正常／不合格の7ケース

## 利用方法
M8の複製または試験環境で、`m8-agent-node`フォルダから:
```powershell
node --test test/editorial-quality-gate.test.js
node src/audit-editorial-draft.js .\draft.json
```
入力はJSONのオブジェクト。例:
```json
{
  "reader":{"problem":"水切りかごが蛇口に当たるかもしれない","context":"狭い台所、2人分の食器"},
  "purchaseChecks":[
    {"risk":"蛇口との干渉","howToCheck":"蛇口の可動範囲と外寸を測る"},
    {"risk":"排水がシンクに流れない","howToCheck":"排水方向と設置位置を確認する"},
    {"risk":"洗浄しづらい","howToCheck":"トレーの着脱方法を確認する"}
  ],
  "comparisonMethod":"寸法・排水方向・手入れ方法を表で比較",
  "goodFor":"設置スペースと排水方向が合う人",
  "notGoodFor":"蛇口の動線を確保できない人",
  "verifiedFacts":[{"id":"size","claim":"公式販売ページで確認した外寸","sourceUrl":"https://example.com/item","checkedAt":"2026-11-16"}],
  "productClaims":[{"text":"商品ページ記載の外寸を参照","factId":"size"}],
  "isAffiliate":true,
  "disclosure":"【PR】",
  "affiliateUrl":"https://example.com/affiliate",
  "fabricatedExperience":false,
  "unverifiedPerformance":false,
  "mediaRightsVerified":true
}
```
**注意**: `example.com` は説明用ダミー。商品・リンク・画像の内容を検証したことを意味しない。

出力の `audit.status` が `revision_required` なら差し戻し。 `review_candidate` でも `publishApproved=false` 固定。

## 限界と次の開発
現在のゲートは文章の意味を理解して採点するAIではなく、**構造化された情報の充足状況を厳格に検査する部品**。
入力者が虚偽のチェック結果を与えると検出できない場合がある。URLの存在、ページ本文との一致、画像の利用許諾も自動で確認しない。
次段階では既存の編集生成器／記事管理の入出力仕様を確定し、生成→情報ソース確認→ゲート→修正候補→再検査→オーナー承認の接続を行う。
修正候補はAIに再執筆させられるが、根拠の創作を防ぐためソース未確認のまま不足欄を埋めて合格扱いにしてはならない。

## 2026-11-16: 商品選定機能との接続
- `src/editorial-article-workflow.js`: 既存 `buildEditorialShortlist` を呼び出して候補を選び、商品IDに一致する調査済み記事データを `evaluateEditorialDraft` へ渡す。
- `src/run-editorial-article-workflow.js`: JSONを渡す試験用CLI。
- `test/editorial-article-workflow.test.js`: 調査未実施・合格・商品不一致・不合格から再審査・根拠不足の5例。
- 調査済みデータがない候補は `research_required`、不合格は `revision_required`、通過したものは `review_candidate`。いずれも `publishApproved=false`。
- 合格記事の構造化データからMarkdown記事を組み立てる。未確認の販売実績・感想・性能等をAIが勝手に補完する処理は置かない。
- 既存の `local-core-v2.js` のThreads自動投稿には未接続。短文SNS投稿への適用は別途仕様調整が必要（投稿上限500文字と長文記事品質基準は用途が異なる）。

### 入力JSON
```json
{
  "ranking": [
    {
      "itemCode":"shop:001",
      "itemName":"水切りかご 収納",
      "price":3500,
      "rank":2,
      "hasAffiliateUrl":true
    }
  ],
  "draftsByItemCode": {
    "shop:001": {
      "itemCode": "shop:001",
      "title": "水切りかごを選ぶ前に確認したいこと",
      "reader": {"problem":"置き場所の幅が狭い","context":"二人暮らしの台所"},
      "purchaseChecks": [
        {"risk":"蛇口とぶつかる","howToCheck":"寸法と蛇口の可動域を測る"},
        {"risk":"排水方向が逆","howToCheck":"シンクの位置と商品排水口の向きを確認"},
        {"risk":"手入れが負担","howToCheck":"トレー着脱方法を比較"}
      ],
      "comparisonMethod":"寸法・排水方向・手入れ方法を一覧で比較する",
      "goodFor":"設置条件に合う人",
      "notGoodFor":"蛇口に干渉する人",
      "verifiedFacts":[{"id":"spec","claim":"出品ページに外寸情報がある","sourceUrl":"https://example.com/spec","checkedAt":"2026-11-16"}],
      "productClaims":[{"text":"外寸は商品ページで確認できる","factId":"spec"}],
      "isAffiliate":true,
      "disclosure":"【PR】",
      "affiliateUrl":"https://example.com/affiliate",
      "fabricatedExperience":false,
      "unverifiedPerformance":false,
      "mediaRightsVerified":true
    }
  }
}
```
例のドメインはダミーであり実在商品の調査は未実施。利用時は実際の根拠が必要。
```powershell
node src/run-editorial-article-workflow.js .\article-workflow-input.json
node --test test/editorial-quality-gate.test.js test/editorial-article-workflow.test.js
```
ローカルNode本体でのテストやM8実機での起動は未実施。現時点ではGitHub保存と関数単体の論理確認まで。


## 2026-11-16: 調査済みデータからの自動起稿と安全な再生成
- `src/editorial-research-drafter.js` を追加。既存の `classifyTheme` を再利用し、収納・台所布製品・掃除・食品保存・デジタル等のテーマ別に、**商品に関する性能を断定しない**購入前のチェック観点を生成する。
- `researchByItemCode` に調査済みの事実を渡すと、`draftsByItemCode` に下書きがなくても、下書き→品質ゲート→記事組立までオフラインで処理。
- 不合格ドラフトは、同じ調査情報がある場合に限り最大1回、事実を補完せずテンプレート再生成→再採点。架空体験、未検証性能、商品主張の根拠欠如、PR表記漏れは**自動修正しない**。
- `autoRevise:false` で再生成を無効化できる。
- `npm run editorial-tests` は品質ゲート・候補接続・自動起稿の個別テスト。`npm run editorial-articles -- .\\article-workflow-input.json` はローカル審査用。
- `ranking` に入るのは `[{itemCode,itemName,rank,price,hasAffiliateUrl:true}]` 。新規 `researchByItemCode` には商品ごとの以下の形式を使用する。

```json
{
  "researchByItemCode": {
    "shop:001": {
      "itemCode": "shop:001",
      "affiliateUrl": "https://example.com/affiliate",
      "rights": {"noMedia": true},
      "subjectContext": "賃貸住宅の狭い台所",
      "facts": [
        {
          "id": "size",
          "claim": "販売元が公表した外寸",
          "sourceUrl": "https://example.com/item",
          "checkedAt": "2026-11-16"
        }
      ]
    }
  }
}
```
これは `ranking` と同一オブジェクトに含める。サンプルURLは架空の商品検証情報であり実運用には使わない。

### 現時点の厳密な限界
- これは**証拠付き入力に基づくルール型の自動起稿／再生成**であり、ChatGPT/Claude等のLLMをAPI経由で呼ぶ実装ではない。商品情報のWeb取得や商品ページとの照合もまだ行わない。
- URLや確認日は入力値の形式のみチェックし、実際のページ内容の存在・信頼性・正確性は確認しない。自動合格を事実検証完了と誤認しないこと。
- 既存 `enrichShortlist` は価格・レビューなどを楽天公式APIから取得できるが、これだけでは製品寸法・適合条件等の深い記事を書く根拠として不足する。商品詳細の裏取りを追加するまでは保留する。
- 実際のM8へのデプロイ・本番接続・公開・mainマージ・実機Nodeテストはいずれも**未実施**。公開はオーナーの事前承認が必要。


## 2026-11-16: 公式楽天APIと任意AI生成の接続追加（作業ブランチのみ）
- `src/editorial-rakuten-evidence.js`: 楽天公式商品検索APIのレスポンスから、掲載商品名・価格・レビュー件数を**API回答の属性としてのみ**抽出。APIキー等を研究出力には含めない。寸法・材質・清掃条件はこれでは検証できず `needs_product_detail_research` とする。
- `assembleEditorialResearch`: 商品ページのURL/商品ID一致、2件以上の仕様確認記録、引用文字列の存在、日付、PRリンクを検査。未確認なら `research_required`。**引用文が実際にページに存在するかは機械検証していない。**
- `src/editorial-rakuten-research.js` と `src/run-editorial-rakuten-research.js`: 既存 `runDiscoveryProbe` → 最大2件（内部上限3件）の楽天商品詳細取得 → 調査パケットを標準出力。投稿もファイル保存もしない。楽天APIのレート制約に配慮し、商品ごとの間隔を確保。
- `src/editorial-llm-adapter.js`: 外部から渡された `generateFn` を最大2回呼ぶための、プロバイダー非依存インターフェース。モデルが商品ID、価格の根拠、PRリンク、権利確認等を書き換えても受け付けず、指定された文章項目のみ取り込む。
- `src/editorial-ai-workflow.js`: 検証済みとして提供された調査パケット→AI用入力→生成→品質判定→既存のMarkdown記事組み立て。AI未接続/根拠不足/品質不足の場合は記事非生成。
- テスト追加: `editorial-rakuten-evidence.test.js` / `editorial-llm-adapter.test.js` / `editorial-ai-workflow.test.js` / `editorial-rakuten-research.test.js`。

### 実機での読み取り専用確認（開発ブランチを検証環境に入れた後のみ）
```powershell
cd m8-agent-node
npm run editorial-tests
npm run editorial-rakuten-research
```
2つ目のコマンドは開発環境に既存の `.env` があり、楽天公式APIキーが設定済みのときだけ動作する。楽天APIへの読み取りアクセスは発生するが、投稿・課金契約・データ保存はしない。

### 重要な未完了工程
1. M8環境で `npm run editorial-tests` を実行し、全テスト結果を確認する。GitHub保存だけで「実機テスト済み」と言わない。
2. 楽天APIの実レスポンスで候補の取得を検証。アクセス制限・戻り形式差分に対応する。
3. 商品ページの本文と引用根拠を検証する実リサーチアダプターの実装。現在は調査済みと申告されたデータ形式の整合性のみ検査する。
4. ChatGPT / Claude 等の実モデルを呼び出す実装は未接続。 `generateFn` は呼出し口のみで、課金・ログイン・API契約は勝手に作らない。
5. B案型の内容を人間が実際に読んで評価し、表示回数・クリック・成約・確定報酬・実利益で検証する。
6. main統合、M8配布、既存投稿エンジン変更、公開は全てオーナー事前承認後。


## 2026-11-20: 商品ページの引用照合と自動調査入口
- `src/editorial-page-verifier.js` を追加。楽天の**正規商品ページURL**のみを許可し、リダイレクト禁止で読み取り可能。HTMLを最大100万文字に制限し、スクリプトやCSSを除いて表示テキストを抽出する。
- 記事の事実に付随する引用断片がページHTMLの表示テキストに存在するかを照合（NFKC正規化・空白差異吸収）。2件以上の引用が一致した場合のみ `page_quotes_matched` を返す。見つからなければ `research_required`。
- `src/editorial-page-verified-workflow.js` は商品候補→楽天API証拠→ページ本文取得または事前保存HTML→引用照合→従来のAI記事品質ゲートへ接続。
- `test/editorial-page-verifier.test.js` に、照合成功、引用の捏造、別URL、短い引用、外部URL拒否、記事作成、無証拠ブロックの試験を追加。`npm.cmd run editorial-tests` の対象に含めた。
- 既存のThreads自動投稿には接続せず、記事公開は常に無効。
- 現時点では**引用断片の候補抽出と、引用の意味が商品仕様を裏付けるかの判断が未自動化**。表示テキストに文言があるだけでは、選択した型番や商品バリエーションに適合するとは限らない。引用・宣伝表記・販売条件は公開前に再確認する。
- ライブHTML取得は対象ページが403、要JavaScript、アクセス制限、想定外の形式のとき保留する。回避措置・制限突破は行わない。
- 旧来の `assembleEditorialResearch` に直接投入する手動レビューの扱いは引き続き「記録された確認」であり、HTML照合による独立検証ではない。新方式と混同しない。
- 追加コードのGitHub保存は完了。ただし最新コードはM8未配布、最新追加テストは実機未実行。既存のM8で確認済み34件と区別する。

### 次の検証
M8の稼働中フォルダは触らず、開発ブランチのZIPをテスト用フォルダへ再展開した後、`npm.cmd run editorial-tests` を実行する。失敗箇所を修正し、その後に実商品ページを自動取得できるか確認する。


## 2026-11-20 実ページ検証結果と文字コード修正
- M8実データ調査：HTML 248,515文字／抽出本文5,083文字、`コロ脚`・`チェスト`・`幅34`・`ポリプロピレン` のいずれも初期取得文字列には出現しなかった。
- 取得タイトルが文字化けしており、`response.text()` のUTF-8固定デコードが原因である可能性が高い。商品ページがEUC-JP等の日本語旧文字コードで返されることを想定して修正した。
- `editorial-page-verifier.js` は `response.arrayBuffer()` で取得し、HTTP Content-TypeのcharsetまたはHTML meta charsetを優先し、TextDecoderの厳密モードで日本語HTMLを復元する。宣言なしのときは UTF-8 / EUC-JP / Shift_JIS の順で厳密デコードを試す。曖昧な文字化けを証拠として使用しない。
- EUC-JP固定バイト列の回帰テストを追加した。今回の変更はGitHub開発ブランチに保存済みで、M8実機での再実行はまだ。実ページ本文に商品詳細が存在するかも未確定である。

## 2026-11-20: 実商品ページからの保守的な仕様抽出
- M8実機の楽天商品ページから「材質 ポリプロピレン」「組立時間：約20-30分」「【スリムサイズ】引出し内寸 幅26 奥行き36 深さ16cm・耐荷重約2kg」「【ワイドサイズ】引出し内寸 幅46 奥行き36 深さ16cm・耐荷重約3kg」を確認。
- `src/editorial-spec-extractor.js` を追加。固定パターンで仕様文の原文断片を切り出し、スリム／ワイドを別々に管理する。取得した引用文字列を既存のHTML照合へ渡し、ページに実在しない文章は採用しない。
- `src/editorial-page-verified-workflow.js` は利用者の引用指定がない場合のみ保守的な自動仕様抽出を利用する。公開は行わない。実商品ごとのHTMLレイアウト差分・別バリエーションの誤読に備え、公開前の意味的な確認を継続する。
- `test/editorial-spec-extractor.test.js` をテストスクリプトへ登録。新機能のテストはM8未実施。従来の48件合格とは分けて報告する。


## 2026-11-20: 実商品API→原文照合→B案型記事の一括実行入口
- M8実ページの抽出・照合が `spec_quotes_extracted`、スリム2件・ワイド2件・共通2件、`page_quotes_matched`、`verifiedCount=6` で成功した（オーナー実測）。
- `src/run-editorial-pinned-draft.js` を追加。特定の収納チェスト `e-kurashi:10048736` に限定した安全な試験入口：楽天公式商品API→楽天の商品ページ→仕様抽出→引用照合→既存のB品質ゲート→公開不可のMarkdown記事を出力。これは**LLM生成ではなく既存のテンプレート記事**。無人公開・SNS送信は含まない。
- `npm run editorial-pinned-draft` を追加（`.env` を読み込む）。本番稼働ディレクトリでなく独立のテスト環境から実行すること。代わりに `node --env-file="既存の読み取り元.env" src/run-editorial-pinned-draft.js` が使える。
- `test/editorial-pinned-draft.test.js` を記事テスト群に追加。API情報と商品HTMLを模擬した end-to-end テスト、秘密保護、根拠不足の保留を確認する設計。**追加分のM8テスト結果は未取得**。前回の52件全合格とは分けて評価する。
- 今後の汎用化では固定商品から自動選出候補に切り替え、対象ジャンルごとの抽出辞書、モデル接続、変種・利用条件の検証を段階的に進める。


## 2026-11-20: 実API→記事下書き検証と本文品質の是正
- M8実測：`npm run editorial-tests` は55件全合格、`node --env-file=... src/run-editorial-pinned-draft.js` は `status=review_candidate`、`evidenceCount=6`、`gateScore=12`、`published=0`。
- 編集レビューでは初回出力に課題があった：楽天の商品名を先頭55字で切り落とすため見出しが不自然、本文のチェック項目が一般論中心で確認済み6仕様との関連が薄い。また確認日がUTC基準で日本時間の実測日から1日ずれ得る。
- `editorial-research-drafter.js` を改善：収納商品のスリム/ワイド内寸と耐荷重が**ともに根拠付きで揃った場合のみ**、具体値と比較手順を本文の購入前チェックに入れる。数字が揃わない場合は一般的な注意点に戻す。見出しは途中切れを回避。
- `run-editorial-pinned-draft.js` の確認日をAsia/Tokyoに変更し、回帰テストを追加。
- 構造スコア12点は記事品質の完成保証ではない。公開・自動投稿は未承認、今回の編集改修後はM8未実行。従来の55件合格をそのまま最新版の検証済みとは扱わない。


## 2026-11-20: M8 v7実測結果と自然な文章への改善
- オーナーの実機結果：57 tests / 57 pass / 0 fail、実商品 `e-kurashi:10048736` は `status=review_candidate` / `gateScore=12` / `evidenceCount=6` / `published=0`。確認日は2026-11-20として記録できた。
- 編集上の残課題：商品固有の説明は改善したが、本文に「〜と記載」を繰り返し、文章が硬い。品質ゲート12点は読者満足度やCVの保証ではない。
- `editorial-research-drafter.js` で裏付け済み両バリエーションの内寸・耐荷重から数値部分を抽出し、スリムとワイドの自然な比較文へ変換する。文言が予期した書式に一致しない場合、数値の推測はせず一般的な安全チェックへ戻す。
- `editorial-research-drafter.test.js` に自然な比較文と「と記載」重複抑制の検査を追加。
- JSレベルで新しい比較文を評価したが、M8の最新版テストは**未実施**。公開・自動投稿・mainマージは行っていない。


## 2026-11-20: 収納以外の候補ゼロの原因とジャンル別探索
- M8実測 `status:ok,candidates:[],count:0` はAPI障害ではなく、`results.ranking.items` が先頭10件に制限されている状態で収納・未分類を除いた結果だった。`editorialShortlist.selected` は上位30件から生成されるため差がある。
- 実測した30件の shortlist で、`kouragumi:10001520` の冷凍サバが `food_preservation`、`renfrojapan:10000250` のインナーが `tableware` と誤分類されていた。どちらも製品用途と異なる記事を生成する危険がある。
- `editorial-shortlist.js` の分類順と語彙を修正。冷凍食品・チョコ等を `food`、インナー等を `apparel` と識別する。単独の「冷凍」を保存用品と認識しない。これらはB案の具体仕様抽出が未実装なので、専用ジャンルの候補抽出から除く。
- `src/run-editorial-genre-discovery.js` を追加。楽天のジャンル別ランキング `558944`（キッチン用品）と `215783`（日用品雑貨）で2回の読み取り専用探索をし、既存のスコアによるショートリストから非収納カテゴリだけ最大3件ずつ報告する。失敗・ゼロ件は明示し、投稿や公開はしない。
- `test/editorial-genre-discovery.test.js` および商品名誤分類回帰テストを追加。今回の変更は開発ブランチのみ。**M8実機の結果は未確認**。今後は検証済みカテゴリから実商品ページの記述を調べ、ジャンルごとの根拠抽出パターンがない場合は公開せず保留する。


## 2026-11-20: 換気扇フィルター実商品ページ・構成混同の安全審査
- M8 `editorial-genre-discovery` 実測：60 tests全合格、別ジャンル5候補。対象 `starfilter:10000112` の楽天商品ページは `https://item.rakuten.co.jp/starfilter/sfsetm03/`、抽出本文3083文字。
- 商品名で「強力マグネット+交換フィルター3枚」を確認する一方、同じページ本文にはレンジフードの機種型番・寸法照合・「既存の金属フィルターと同数の専用枠をご注文ください」が記載される。専用枠の説明がマグネットセットそのものに該当するかは文言の存在だけでは判断できない。
- `src/editorial-rangehood-evidence.js` を追加し、型番照合、サイズ照合、専用枠記載、マグネットセット記載の短い原文証拠を抽出する。構成の混在を検出すると `configuration_review_required`、`articleEligible=false`、`published=0`。一般の仕様抽出・編集ゲートにそのまま流さない。
- `src/run-editorial-rangehood-evidence.js` を追加。M8では `node --env-file=既存env src/run-editorial-rangehood-evidence.js` で読み取り専用実ページ診断を実行できる。
- `test/editorial-rangehood-evidence.test.js` に3件追加。GitHubの作業ブランチのみ更新し、**今回の追加コードのM8実機テストは未実施**。
