/** Deterministic offline idea triage; no network, code execution or publication. */
export const OWNER_ID = 267393119;
const unsafe = /(API\s*key|秘密鍵|パスワード|トークン|secret|password|bearer\s+\S+|gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/i;
const publicActions = /(公開|本番|リリース|デプロイ|投稿|配信|送信|課金|決済|契約|マージ|merge|production|publish|deploy|charge|bill|payment)/i;
const revenue = /(売上|収益|成約|CVR|CV|CTR|クリック|利益|購買|購入|アフィリエイト|販売|課金|申込)/i;
const ops = /(エラー|不具合|停止|壊れ|障害|修復|修正|バグ|失敗|復旧|security|漏洩)/i;
const product = /(記事|投稿|商品|楽天|Threads|ラクミツ|Cash\s*Flow|M8|原価|飲食店|開発|実装)/i;

export function intakeIdea(issue, {ownerId=OWNER_ID}={}) {
  if(!issue || typeof issue !== 'object' || Array.isArray(issue)) throw new TypeError('invalid_issue');
  if(!Number.isSafeInteger(issue.number) || issue.number <= 0) throw new TypeError('invalid_issue_number');
  if(issue.user?.id !== ownerId) return {accepted:false,reason:'unauthorized_author'};
  if(typeof issue.title !== 'string' || !/^\[IDEA(?:-\d+)?\]/i.test(issue.title)) return {accepted:false,reason:'not_idea'};
  if(issue.pull_request) return {accepted:false,reason:'pull_request'};
  if(!Array.isArray(issue.labels)) return {accepted:false,reason:'invalid_labels'};
  if(issue.labels.some(l => (typeof l === 'string' ? l : l?.name) === 'm8-remote')) return {accepted:false,reason:'control_action_label'};
  const title = issue.title.trim().slice(0,160);
  const body = typeof issue.body === 'string' ? issue.body.trim() : '';
  if(!body || body.length > 12000 || title.length > 160) return {accepted:false,reason:'invalid_content_length'};
  if(unsafe.test(title+'\n'+body)) return {accepted:false,reason:'contains_potential_secret'};
  const text = title+'\n'+body;
  const priority = ops.test(text) ? 'P0' : revenue.test(text) ? 'P1' : 'P2';
  const requiresApproval = publicActions.test(text);
  const category = ops.test(text) ? '障害・品質' : revenue.test(text) ? '収益・販売' : product.test(text) ? '製品開発' : '未分類';
  const summary = body.split(/\r?\n/).map(x=>x.trim()).find(x=>x && !x.startsWith('#') && !x.startsWith('- [') && !x.startsWith('>')) || '課題を整理する';
  return {
    accepted:true, issueNumber:issue.number, title, priority, category,
    summary:summary.slice(0,240), approvalRequired:requiresApproval, status:'Scoped',
    boundaries:['開発ブランチのみで作業','本番・main・公開・外部送信・課金は明示承認まで禁止','無制限のシェル実行を禁止'],
    acceptance:['受入条件を具体化する','既存仕様を確認する','作業ブランチで変更する','隔離テストの実測結果を記録する'],
    nextAction:'AI実装担当がIssueの仕様・既存コードを確認して開発ブランチの作業に着手する',
    note:'自動分類の結果であり、コードの自律実装や本番反映が完了したことを意味しない'
  };
}
export function renderPlanMarkdown(plan) {
  if(plan?.accepted !== true) throw new TypeError('unaccepted_plan');
  return [
    '<!-- AstonishFactory:idea-intake:v1 -->','### AI開発受付（自動分類）',
    `- 案件: #${plan.issueNumber}`,
    `- 分類: ${plan.category}`,
    `- 優先度（暫定）: ${plan.priority}`,
    `- 状態: ${plan.status}`,
    `- 承認境界: ${plan.approvalRequired?'公開・本番等の可能性あり／該当操作は承認待ち':'通常の安全境界を適用'}`,
    '', '#### 要望の概要',
    '> '+plan.summary.replace(/[\r\n]/g,' ').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    '', '#### 受入条件', ...plan.acceptance.map(x=>'- [ ] '+x),
    '', '#### 次のアクション',plan.nextAction,
    '', '> '+plan.note,
    '<!-- /AstonishFactory:idea-intake:v1 -->'
  ].join('\n');
}