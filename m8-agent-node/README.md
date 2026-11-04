# Cash Flow Engine M8 Agent Node

GMKtec M8 (`AI-FACTORY-NODE01`) を Cash Flow Engine #001 の常時稼働ローカルAgent Nodeとして使う実行基盤です。

## 正本アーキテクチャ

- ChatGPT: 戦略判断・コード修正・例外対応
- M8 Local Core v2: Threads通常投稿、楽天商品選定、外部投稿探索、自動返信、ローカル状態管理
- Watchdog: Local Core / Browser異常の自己修復
- Auto Update Agent: GitHub更新の安全な自動反映、構文検証、Health確認、失敗時ロールバック
- Night Evaluation Agent: 毎日22:30 JSTに当日実績・エラー・返信状況を評価
- Daily Commander Agent: 毎日06:30 JSTに翌日の運用パラメータを安全範囲内で調整

通常運用はRender、TinyFish、Supabase、GitHub Actionsを必要としません。Meta Threads公式APIと楽天APIはM8から直接使用します。

## 自動運用

### Local Core v2

- 投稿枠: 07:30 / 12:30 / 19:30 JST
- 投稿上限: 3本/日
- Product-first投稿（朝は商品発見、昼はRevenue、夜は商品発見または比較を日替わり）
- 全投稿枠で楽天APIの商品候補を取得。直近7日の商品重複を回避
- Image Card v1: 商品発見・比較の画像カードをM8内に自動生成
- Threadsブラウザ探索はPlaywright + 永続Chrome profile

### External Reply Engine v1

- ホーム + 複数検索語から外部投稿候補を探索
- 関連性・質問・悩み・テーマ一致をスコアリング
- 広告/アフィリエイト、センシティブ、自投稿、URL付き投稿等を除外
- 初期上限3返信/日
- URLなし・直接販売誘導なしの自然な返信
- 同一投稿への重複返信禁止
- 同一相手への当日複数返信禁止
- 実績は `.data/external-replies.jsonl` に保存

### Night Evaluation Agent

22:30 JSTに以下をローカル集計します。

- 投稿数 / role別投稿数
- 外部返信成功 / 失敗
- 候補数 / eligible数
- Browser / Threads scan状態
- POST_ERROR等の障害
- Profile Views / Click / CV / Profitなど未取得指標は `unknown` とし、0扱いしない

出力: `.data/reports/YYYY-MM-DD-night.json`

### Daily Commander Agent

06:30 JSTに直近評価を読み、次の範囲だけ自動調整します。

- 外部返信上限
- 最低スコア
- Threads探索キーワード
- 投稿上限 / 投稿時刻は原則3本・3枠を維持

Browser/返信失敗時は件数を減らし閾値を上げます。候補不足時は探索を広げます。Profile→Click→CV→Profitが測定できない段階では返信量を自動増加させません。

### Watchdog

5分ごとにHealthとBrowser状態を確認し、異常時にLocal Coreを再起動します。

### Auto Update Agent

5分ごとにGitHub `main` を確認します。

- clean tracked worktree必須
- fast-forward only
- 更新前に全JSを `node --check`
- 更新後Local Core再起動 + `/health`確認
- Health失敗時は旧commitへ自動ロールバック
- `.env` / `.data` はGit管理対象外
- 新しいOperations Agentタスクも自動登録

## セットアップ / 復旧

管理者PowerShell:

```powershell
cd C:\AI-Factory\cashflowengine-rakuten-bridge\m8-agent-node
npm install
Set-ExecutionPolicy -Scope Process Bypass
.\configure-server-mode.ps1
```

Auto Update Agentだけ未登録の場合:

```powershell
.\install-auto-update-agent.ps1
```

これによりNight Evaluation / Daily Commanderも同時登録されます。

## 正常基準

`http://127.0.0.1:18787/health`

- `ok: true`
- `state.version: m8-local-core-v2-image-card-v3`
- `threads.ok: true`
- `autoPostEnabled: true`
- `externalReply.enabled: true`
- `externalReply.browserOk: true`

Scheduled Tasks:

- `CashFlowEngine-M8-LocalCore` = Running
- `CashFlowEngine-M8-Watchdog` = Ready（5分周期）
- `CashFlowEngine-M8-AutoUpdate` = Ready（5分周期）
- `CashFlowEngine-M8-NightEvaluation` = Ready（22:30）
- `CashFlowEngine-M8-DailyCommander` = Ready（06:30）

## 重要な安全原則

- Secretは `.env` のみに保存し、ChatGPTやGitHubへ貼らない
- Auto Update Agentは非fast-forwardやローカル変更がある場合は自動更新しない
- 日次司令塔は事業戦略全体を勝手に変更せず、定めた安全範囲だけ調整する
- クリック/CV/利益の未計測値を0として評価しない
- 外部返信数は、下流成果が測定できるまで保守的に維持する

## 画像カード v1（実装・段階適用）

- 生成モジュール: `src/image-card.js`
- 旧v1/v2では楽天APIのサムネイル画像を拡大していましたが、v3では使用を中止しました。
- 出力: `.data/image-cards/*.png`（1080×1350、オリジナル雑誌風レイアウト）
- `CFE_IMAGE_CARD_ENABLED=true` はカード生成（非PR商品発見・比較枠）をONにします。
- `CFE_IMAGE_POST_ENABLED=false` は**画像投稿をまだ行わない安全な既定値**。カードだけ生成し、通常のテキスト投稿は継続します。
- ブラウザ投稿機能は実装していますが、Threads画面の投稿ダイアログ・画像input・投稿完了確認をM8上で検証するまではONにしないでください。
- ブラウザ投稿ボタンを押したあとの成功確認ができない場合は `unverified` と記録し、同一枠のテキスト再投稿を禁止します。
- 商品画像の利用・加工が楽天/店舗/画像提供元の条件で許されるか確認してください。第三者の雑誌紙面は複製しません。
- Healthの `imagePosting` に生成・ブラウザ公開フラグと直近エラーを表示します。

### 投稿せずに画像を1枚テストする

M8上のPowerShellから、リポジトリを開き次を実行してください。

```powershell
cd C:\\AI-Factory\\cashflowengine-rakuten-bridge\\m8-agent-node
npm run preview-image
```

成功時は `ok: true` と `imagePath` を表示し、PNGを `.data/image-cards` に保存します。Threadsには一切投稿しません。楽天APIのアクセス許可IPが変更された場合はHTTP 403になり得ます。

### 実機での段階チェック

1. 自動更新が反映されたか `http://127.0.0.1:18787/health` の `state.version` を確認。
2. 商品発見・比較枠の実行後に `.data/image-cards` 内のPNGを確認。
3. 画像の欠損・誤表記・低画質がないことと、画像の加工・投稿に必要な利用条件を確認。
4. Threads画面操作は別途テストした後にだけ `CFE_IMAGE_POST_ENABLED=true` へ変更して再起動。

画像付き公開の本番成功は、実際にThreads上で確認できるまで未検証として扱います。

## Image Card v3：画質と権利の両方を確認する（2026-11-04）

楽天の商品検索APIの `mediumImageUrls` は128×128pxが標準で、1080pxのカードへ引き伸ばすと粗くなります。**v3はAPIの画像を合成素材に使わず**、許諾を確認して登録した600×600px以上の画像のみ使います。楽天商品ページの無断スクレイピング・画像URL書き換えによる高解像度取得は行いません。

商品画像について、楽天アフィリエイトのガイドラインでは**リンク作成ページからのダウンロード画像**に限り条件付きでサイズ変更・画像外側の装飾が可能ですが、画像への直接文字追加、トリミング、特定の創作性がある画像の無許諾使用などに制限があります。商品によっては画像使用権者からの個別許可が必要です。

M8のローカルに以下を用意します。

```text
m8-agent-node/.data/approved-product-images/
  manifest.json
  approved-product-photo.jpg
```

`manifest.json` の雛形はリポジトリの `approved-image-manifest.example.json` にあります。商品コード・ファイル名・許諾元・許諾参照を確認してから `approved:true` に変更します。

- `source: rights_holder_permission`：権利者から個別許諾を受けた画像（許諾範囲内で非PR投稿にも利用可能）。
- `source: rakuten_affiliate_link_creator`：楽天アフィリエイトのリンク作成ページから許される条件で取得した画像。**同じ投稿に該当商品のアフィリエイトリンクを記載するPR枠でのみ利用可能**。
- 元画像の縦横どちらかが600px未満なら拒否。拡大補間による見かけのピクセル数増加は品質保証になりません。
- 画像の切り抜きや上書き文字はしません（`object-fit: contain`）。商品名・価格・見出しは別領域。
- 画像がない/許可不明/低解像度：カードを作らずテキスト投稿を続行。
- 画像付きブラウザ公開はUI動作未検証のため、`CFE_IMAGE_POST_ENABLED=false` を維持。

テストコマンド（**Threads投稿なし**）：

```powershell
cd C:\AI-Factory\cashflowengine-rakuten-bridge\m8-agent-node
git pull
npm.cmd run preview-image
```

許諾済み画像が未登録の場合 `ok:false`, `status:no_approved_high_resolution_image` と表示されるのが**正常**です。旧サムネイルの粗いカードは生成しません。
