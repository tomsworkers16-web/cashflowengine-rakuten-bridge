// Read-only rehearsal: no publication, no task changes, no approval, no data writes.
import fs from 'node:fs';
import path from 'node:path';
import { prepareDailyThreadsCycle } from './threads-daily-preparation.js';
import { selectDailyStage } from './threads-daily-cycle.js';
import { rakutenCooldownRemaining } from './rakuten-rate-policy.js';

const dir=path.resolve(process.env.CFE_DATA_DIR||'.data');
const read=(name,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));}catch{return fallback;}};
const journal=name=>{try{return fs.readFileSync(path.join(dir,name),'utf8').split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));}catch{return [];}};
const date=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const state=read('state.json',{});
const config={dailyCycleEnabled:process.env.CFE_THREADS_DAILY_CYCLE_ENABLED==='true',autoPostEnabled:process.env.CFE_AUTO_POST_ENABLED==='true',externalReplyEnabled:process.env.CFE_EXTERNAL_REPLY_ENABLED==='true',rakutenCredentialsPresent:['RAKUTEN_APPLICATION_ID','RAKUTEN_ACCESS_KEY','RAKUTEN_AFFILIATE_ID'].every(k=>Boolean(process.env[k])),threadsCredentialPresent:Boolean(process.env.THREADS_ACCESS_TOKEN),slots:process.env.CFE_POST_SLOTS||'07:30,12:30,19:30'};
try{
 if(process.argv.length!==3||process.argv[2]!=='--read-only-research')throw Error('Use --read-only-research to explicitly request bounded read-only Rakuten research');
 if(rakutenCooldownRemaining(state.lastRakutenRateLimitAt)>0)throw Error('rakuten_rate_limit_cooldown');
 const ledger=read('affiliate-results.json',null);
 const plan=await prepareDailyThreadsCycle({jstDate:date,applicationId:process.env.RAKUTEN_APPLICATION_ID,accessKey:process.env.RAKUTEN_ACCESS_KEY,affiliateId:process.env.RAKUTEN_AFFILIATE_ID,performanceRecords:Array.isArray(ledger?.records)?ledger.records:undefined,history:journal('posts.jsonl'),replyHistory:journal('external-replies.jsonl'),replyCandidates:[],ownUsername:state.threadsUsername||''});
 const gate=selectDailyStage({plan,approval:null,jstDate:date,slot:'07:30',journal:journal('posts.jsonl'),officialPostCount:0});
 const redact=t=>typeof t==='string'?t.replace(/https:\/\/hb\.afl\.rakuten\.co\.jp\/\S+/gu,'[公式アフィリエイトリンク：非表示]'):t;
 console.log(JSON.stringify({mode:'read_only_rehearsal',config,result:plan.status,reason:plan.reason??null,researchAttemptCount:plan.researchAttemptCount??0,researchHeld:(plan.researchHeld||[]).map(x=>({reason:x.reason,quoteCount:x.quoteCount??null,captionQuoteCount:x.captionQuoteCount??null})),slots:(plan.slots||[]).map(s=>({slot:s.slot,role:s.role,text:redact(s.text),length:s.text.length})),publicationGate:gate.reason??gate.status,published:0,approvalWritten:false},null,2));
 if(plan.status!=='batch_review_required')process.exitCode=2;
}catch(e){console.error(JSON.stringify({mode:'read_only_rehearsal',config,result:'held',reason:String(e.message).includes('rakuten_rate_limit_cooldown')?'rakuten_rate_limit_cooldown':'rehearsal_failed',published:0,approvalWritten:false}));process.exitCode=1;}
