# Cash Flow Engine Channel Factory

目的: 収益チャネルの立ち上げを再利用可能な手順へ標準化し、本人操作が必要な箇所だけを人間へ戻す。

## 共通ライフサイクル
1. Discover: 候補チャネルの需要・規約・収益導線を評価
2. Qualify: 初収益速度、自動化率、API有無、審査、規約リスク、横展開性で採否判断
3. Provision: GitHub/Render/公開説明ページ/OAuth callback/環境変数雛形を生成
4. Human Gate: アカウント作成、本人確認、規約同意、OAuth承認、秘密情報登録
5. Connect: APIまたはブラウザ連携の疎通確認
6. Publish: 最小テスト投稿
7. Measure: 表示、クリック、CV、報酬、実利益を収集
8. Decide: 継続・改善・拡大・撤退
9. Replicate: 勝ちパターンを別テーマ/別媒体/別ASPへ複製

## Channel Adapter 共通仕様
各チャネルは可能な限り以下を実装する。
- healthCheck()
- connect()
- publish(content)
- fetchMetrics(contentId)
- fetchReplies(contentId) // 対応媒体のみ
- refreshAuth()
- disconnect()

## 人間作業として残すもの
- メール認証
- SNS/ASPアカウント作成
- 本人確認/KYC
- 規約・審査申請
- OAuth同意
- App Secret/Access Token等の秘密情報を管理画面へ直接登録

## 現在のチャネル
### Threads
- ASP: 楽天/A8
- 状態: 稼働中
- 公式API: 接続済み
- 役割: 短文の即時反応・クリック獲得

### Pinterest
- ASP: 楽天/A8
- 状態: Trial審査待ち
- 公式API: ブリッジ実装済み、承認待ち
- 役割: 検索/保存型の資産流入

### note
- ASP: A8のみを初期採用（楽天は認定SNS対象外）
- 状態: 次の立ち上げ対象
- 役割: 検索性のある長文比較・悩み解決記事
- 初期案件: YOSHIKEI
- 初期KPI: 記事公開数、PV、リンククリック、CTR、CV、報酬、記事1本あたり利益

## note × A8 初回テンプレート
- PR表記を本文冒頭に明示
- A8の「SNS・note用」リンクを使用
- 公開後にA8へ広告掲載URLを提出
- 未使用商品の体験談を捏造しない
- 構成: 悩み → 選び方 → 選択肢比較 → 対象サービス紹介 → 向く人/向かない人 → CTA

## 採否基準
優先順位は以下。
1. 初収益までの速度
2. 最終利益
3. 自動化可能性
4. 審査/初期準備の軽さ
5. 投稿継続性
6. 規約/停止リスク
7. 横展開可能性
