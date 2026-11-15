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
