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
- Growth / Revenue / Trustを分けて投稿
- Revenue投稿では楽天APIから候補商品を選定
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
- `state.version: m8-local-core-v2`
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
