# Cash Flow Engine M8 Agent Node

GMKtec M8 を Cash Flow Engine 専用の常時稼働 Agent Node として使うための実行基盤です。

## 目的

- メインPC非依存で24時間稼働
- TinyFish等の従量課金ブラウザを原則不要にする
- Threadsのログイン済みChromeを永続保持
- External Reply Discoveryの読み取り専用ブラウザ実行
- 将来のA8/楽天/市場調査/競合調査Agentの共通実行基盤

## 安全原則

- Threads外部投稿への返信はM8から自動送信しない
- Like / Follow / Repost / Reply / Postは禁止
- M8は発見・読み取り・候補送信まで
- 最終返信はChatGPT通知後に人間が送信
- Bridgeとの通信は共有Secretで認証

## 構成

M8 Windows 11
→ Google Chrome + Playwright
→ 永続Threads profile
→ m8-agent-node
→ Render Bridge
→ ChatGPT External Reply Discovery
→ ユーザー通知

## 実機が手元に戻ったら

1. Windows Updateを完了
2. Google Chromeをインストール
3. Node.js LTSをインストール
4. このリポジトリを取得
5. `m8-agent-node` フォルダで PowerShell を管理者として開く
6. `./setup.ps1` を実行
7. `.env` にBridge側と同じ `CFE_M8_SHARED_SECRET` を設定
8. `npm start`
9. 開いたChromeでThreadsへ `rakumitsu_select` として1回ログイン
10. Bridgeの `/automation/external-reply-node/status` で heartbeat を確認
11. 候補取得テスト後、External Reply Discovery Automationを再開

## 常時稼働設定

- Windows: スリープなし
- 電源復旧後: BIOSでPower On after AC lossを有効化推奨
- Windows専用ローカルユーザーで自動ログオンを検討
- Agentはタスクスケジューラでログオン時自動起動
- Chrome profileは `m8-agent-node/.data/threads-profile`

## 正常基準

Bridge `/automation/external-reply-context`
- version: `external-reply-v2-m8`
- discoverySource: `m8_agent_node`
- browserRuntime.provider: `gmktec_m8_playwright`
- selfTest.passed: `true`

Bridge `/automation/external-reply-node/status`
- sharedSecretConfigured: `true`
- nodeState.lastStatus: `healthy`
- nodeState.lastHeartbeat: 直近

## 将来拡張

同じM8へ追加可能:
- A8案件探索Agent
- 楽天商品調査Agent
- Market Intelligence Agent
- 競合調査Agent
- SNSトレンド探索Agent
- 定期ブラウザ監視Agent

ブラウザ書き込み操作は各Agentごとに明示許可制とし、デフォルトはread-onlyとします。
