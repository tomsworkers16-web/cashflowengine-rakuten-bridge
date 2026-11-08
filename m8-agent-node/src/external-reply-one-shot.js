import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {makeExternalReplyEngine, scoreCandidate, looksCorruptedJapanese, buildReply} from './external-reply-engine.js';

const DATA_DIR=path.resolve(process.env.CFE_DATA_DIR||'.data');
const PROFILE_DIR=path.resolve(process.env.THREADS_PROFILE_DIR||'.data/threads-profile');
const CANDIDATES=path.join(DATA_DIR,'external-reply-candidates.json');
const LOG=path.join(DATA_DIR,'external-replies.jsonl');
const SEND=process.argv.includes('--send-one');
const requested=process.argv.find(x=>x.startsWith('--url='))?.slice(6);
const replyFile=process.argv.find(x=>x.startsWith('--reply-file='))?.slice(13);
const dayKey=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const output=x=>console.log(JSON.stringify(x,null,2));

function readRows(){
  if(!fs.existsSync(LOG))return [];
  return fs.readFileSync(LOG,'utf8').split(/\r?\n/).filter(Boolean).flatMap(line=>{
    try{return [JSON.parse(line)]}catch{return []}
  });
}

export function chooseTestCandidates(snapshot,history=[],now=Date.now()){
  const stamp=Date.parse(snapshot?.scannedAt);
  if(!Number.isFinite(stamp)||stamp>now+60000||now-stamp>24*3600000)
    throw Error('candidate_snapshot_stale_or_missing');
  if(!Array.isArray(snapshot.candidates))throw Error('candidate_list_missing');
  const used=new Set(history.map(x=>x.url));
  const own='rakumitsu_select';
  return snapshot.candidates
    .filter(c=>typeof c.url==='string' && /^https:\/\/www\.threads\.com\/@[A-Za-z0-9_.]+\/post\/[A-Za-z0-9_-]+$/.test(c.url))
    .filter(c=>!used.has(c.url)&&!looksCorruptedJapanese(c.text||''))
    .filter(c=>!c.url.toLowerCase().startsWith('https://www.threads.com/@rakumitsu_select/'))
    .map(c=>({...c,evaluation:scoreCandidate(c,{ownUsername:own})}))
    .filter(c=>c.evaluation.eligible && c.evaluation.score>=45)
    .sort((a,b)=>b.evaluation.score-a.evaluation.score);
}

async function localCoreRunning(){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),1200);
  try{
    const r=await fetch('http://127.0.0.1:'+(process.env.CFE_LOCAL_PORT||18787)+'/health',
      {signal:controller.signal});
    return r.ok;
  }catch{return false}
  finally{clearTimeout(timeout)}
}

export function validateCustomReply(value){
  if(typeof value!=='string') throw Error('reply_text_not_string');
  const text=value.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim();
  if(text.length<15||text.length>450) throw Error('reply_text_length_invalid');
  if(looksCorruptedJapanese(text)) throw Error('reply_text_mojibake_detected');
  if(/https?:\/\/|www\.|【PR|アフィリエイト|#PR/i.test(text)) throw Error('reply_text_promotional_link_forbidden');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw Error('reply_text_control_characters');
  return text;
}
function readCustomReply(){
  if(!replyFile)return null;
  const file=path.resolve(replyFile);
  // The operator-created local file is read once before any browser action.
  return validateCustomReply(fs.readFileSync(file,'utf8'));
}

async function main(){
  const customReply=readCustomReply();
  const rows=readRows();
  const snapshot=JSON.parse(fs.readFileSync(CANDIDATES,'utf8'));
  const choices=chooseTestCandidates(snapshot,rows);
  if(!SEND){
    if(requested && !choices.some(c=>c.url===requested)) throw Error('url_must_match_an_eligible_preview_candidate');
    const previewChoices=requested?choices.filter(c=>c.url===requested):choices.slice(0,5);
    output({status:'preview_only',noPosting:true,candidateCount:choices.length,
      candidates:previewChoices.map(c=>({url:c.url,author:c.author,
        score:c.evaluation.score,replyText:customReply??buildReply(c),
        sourceText:String(c.text).slice(0,240)}))});
    return;
  }
  if(String(process.env.CFE_EXTERNAL_REPLY_ENABLED||'false').toLowerCase()==='true')
    throw Error('automatic_external_replies_must_be_disabled');
  if(!requested || !choices.some(c=>c.url===requested))
    throw Error('url_must_match_an_eligible_preview_candidate');
  // Only one external reply attempt per JST day using this test launcher.
  const testMarker=path.join(DATA_DIR,'external-reply-one-shot-'+dayKey()+'.json');
  if(fs.existsSync(testMarker))throw Error('test_already_attempted_today');
  if(rows.some(x=>x.jstDate===dayKey() && ['pending','posted','unverified'].includes(x.status)))
    throw Error('another_external_reply_attempt_already_recorded_today');
  // The main service's Playwright profile must never have two owners.
  if(await localCoreRunning())throw Error('local_core_running_stop_before_test');
  const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
  if(!chrome)throw Error('chrome_not_found');
  const candidate=choices.find(x=>x.url===requested);
  // Reserve before browser startup; any crash must fail closed.
  fs.writeFileSync(testMarker,JSON.stringify({at:new Date().toISOString(),url:requested,
    state:'reserved_no_automatic_retry'})+'\n','utf8');
  let context;
  try{
    context=await chromium.launchPersistentContext(PROFILE_DIR,{
      executablePath:chrome,headless:true,viewport:{width:1440,height:1000}
    });
    const page=context.pages()[0] || await context.newPage();
    if((await localCoreRunning()))throw Error('local_core_restarted_during_test');
    const engine=makeExternalReplyEngine({dataDir:DATA_DIR,ownUsername:'rakumitsu_select',
      maxPerDay:1,minScore:45,enabled:true,replyOverride:customReply});
    const result=await engine.run(page,[candidate]);
    const updated=readRows().filter(x=>x.url===requested).at(-1);
    const verified=result.posted===1 && updated?.status==='posted' &&
      updated?.verification==='own_permalink_visible_after_reload';
    output({status:verified?'verified_posted':'not_verified',
      attempted:1,verified,replyUrl:requested,
      journalStatus:updated?.status||'unknown',noAutomaticRetry:true});
    if(!verified)process.exitCode=2;
  }finally{
    if(context)await context.close();
  }
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{
    console.error(JSON.stringify({status:'failed_safe',reason:String(e.message).slice(0,180),
      noAutomaticRetry:true}));
    process.exitCode=1;
  });
}
