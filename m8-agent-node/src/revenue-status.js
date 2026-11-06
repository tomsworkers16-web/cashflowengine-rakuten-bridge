// Read-only one-command view of revenue readiness. No network, posting or credentials.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {summarizeRecentAffiliateEvidence} from './rolling-revenue-evidence.js';
import {inspectRejectedRakutenCsv} from './rakuten-rejected-status.js';
import {auditRakutenRejectedExports} from './rakuten-export-audit.js';
import {summarizeLocalAffiliateExposure} from './local-affiliate-exposure.js';
import {firstRevenuePriority} from './first-revenue-priority.js';

const load=(filename)=>{
 try{return JSON.parse(fs.readFileSync(filename,'utf8'));}
 catch{return null;}
};

export function buildLocalRevenueStatus(dataDir,now=Date.now()){
 const root=path.resolve(dataDir);
 const day=new Date(now+9*3600000).toISOString().slice(0,10);
 const ledger=load(path.join(root,'affiliate-results.json'));
 const capture=load(path.join(root,'rakuten-nightly-capture.json'));
 const night=load(path.join(root,'latest-night-evaluation.json'));
 const core=load(path.join(root,'state.json'));
 const evidence=summarizeRecentAffiliateEvidence(ledger,day,7);
 const rejectedCsv=inspectRejectedRakutenCsv(root);
 const exportAudit=auditRakutenRejectedExports(root);
 const exposure=summarizeLocalAffiliateExposure(root,day);
 const captureConsistency=capture?.lastHasDatedRows===true
  && capture?.lastExportDateValidation==='invalid_date_values'
   ?'ui_has_dates_but_export_has_invalid_dates'
   : capture?.lastExportDateValidation==='valid'?'validated'
   :'not_verified';
 let nextAction='夜間自動取得と投稿の状態を継続確認する';
 if((!ledger||evidence.daysReported===0)&&captureConsistency==='ui_has_dates_but_export_has_invalid_dates')
  nextAction='楽天の日別画面に日付行がありますが、CSVの日付は不正です。自動投稿とは独立して楽天CSV出力方式を調査する';
 else if((!ledger||evidence.daysReported===0)&&rejectedCsv.latestStatus==='daily_date_value_invalid')
  nextAction='楽天CSVは取得済みですが、日付値が無効です。CSVを再取得する前に楽天の日別レポート画面とエクスポートを確認する';
 else if((!ledger||evidence.daysReported===0)&&rejectedCsv.latestStatus==='valid_unimported')
  nextAction='有効な楽天CSVが保存されています。オフライン再取り込みを実行する';
 else if(!ledger||evidence.daysReported===0)
  nextAction='楽天成果レポートが台帳にありません。保存済みCSVの取込と夜間取得結果を確認する';
 else if(evidence.rakutenRewardYenReported==='unknown')
  nextAction='成果報酬の列が未取得です。楽天CSVの取得・解析結果を確認する';
 else if(evidence.rakutenRewardYenReported>0)
  nextAction='成果報酬の記録あり。確定状況と費用を確認する（暫定報酬を実利益扱いしない）';
 else if(evidence.rakutenClicksReported==='unknown')
  nextAction='楽天のクリック列が未取得です。成果レポートを確認する';
 else if(evidence.rakutenClicksReported===0)
  nextAction='楽天側でクリック未発生。商品とPR投稿の訴求・リンクを再検討する';
 else nextAction='楽天側のクリック実績あり。売上件数・報酬の反映と商品選定を検証する';
 return {
  dateJst:day,mode:'read_only_no_post',
  core:{stateAvailable:Boolean(core),lastDecision:core?.lastDecision||'unknown',
    lastErrorPresent:Boolean(core?.lastError),lastPostAt:core?.lastPostAt||null},
  csv:{ledgerPresent:Boolean(ledger),lastCaptureAttemptDay:capture?.lastAttemptDay||null,
    lastCaptureResult:capture?.lastResult||'unknown',lastCaptureSuccessDay:capture?.lastSuccessDay||null,
    visibleDayRowCount:capture?.lastVisibleDayRowCount??'unknown',captureConsistency},
  report:{lastEvaluationDay:night?.jstDate||null,status:night?.status||'unknown'},
  rejectedCsv,
  exportAudit,
  exposure,
  sevenDay:{from:evidence.from,to:evidence.to,
    daysReported:evidence.daysReported,daysMissing:evidence.daysMissing,
    rakutenClicks:evidence.rakutenClicksReported,
    rakutenSalesCount:evidence.rakutenSalesCountReported,
    provisionalOrConfirmedRewardYen:evidence.rakutenRewardYenReported,
    rewardEvidenceStatus:evidence.rewardEvidenceStatus,
    firstReportedCommissionDay:evidence.firstReportedCommissionDay,
    confirmedNetProfitYen:evidence.confirmedNetProfitYen},
  firstRevenuePriority:firstRevenuePriority({exposure,
    sevenDay:{...evidence,provisionalOrConfirmedRewardYen:evidence.rakutenRewardYenReported,
      rakutenClicks:evidence.rakutenClicksReported,rakutenSalesCount:evidence.rakutenSalesCountReported},
    captureConsistency}),
  nextAction,attribution:'楽天の日別実績はThreads投稿別の収益を証明しません。'
 };
}
const main=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(main){
 const root=path.resolve(process.env.CFE_DATA_DIR||'.data');
 console.log(JSON.stringify(buildLocalRevenueStatus(root),null,2));
}
