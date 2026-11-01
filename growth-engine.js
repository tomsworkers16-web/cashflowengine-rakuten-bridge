import http from 'node:http';
import { URL } from 'node:url';

const THREADS_API_BASE = process.env.THREADS_API_BASE || 'https://graph.threads.net/v1.0';
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN || '';
const THREADS_USER_ID = process.env.THREADS_USER_ID || '';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AUTO_CONVERSATION_REPLY = String(process.env.CFE_AUTO_CONVERSATION_REPLY_ENABLED || 'false').toLowerCase() === 'true';
const DISCOVERY_ENABLED = String(process.env.CFE_GROWTH_DISCOVERY_ENABLED || 'true').toLowerCase() !== 'false';
const PORT = Number(process.env.PORT || 10000);
const MAX_DISCOVERY = 30;
const SEARCH_TERMS = ['時短','便利グッズ','家事','献立','収納'];

const state = {
  version:'growth-v1',
  configured:Boolean(THREADS_ACCESS_TOKEN && THREADS_USER_ID),
  discoveryEnabled:DISCOVERY_ENABLED,
  autoConversationReplyEnabled:AUTO_CONVERSATION_REPLY,
  lastRefreshAt:null,
  lastError:null,
  keywordSearchAvailable:null,
  readRepliesAvailable:null,
  manageRepliesAvailable:null,
  ownReplyCandidates:[],
  discoveryCandidates:[],
  lastAutoReply:null
};

function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function nowIso(){return new Date().toISOString();}

async function fetchJson(url, options={}, timeoutMs=10000){
  const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),timeoutMs);
  try{
    const r=await fetch(url,{...options,signal:ctl.signal});
    const text=await r.text(); let data={};
    try{data=text?JSON.parse(text):{}}catch{data={error:{message:'invalid_json'}}}
    return {status:r.status,data};
  }catch(e){return {status:599,data:{error:{message:e?.name==='AbortError'?'timeout':'fetch_failed'}}};}
  finally{clearTimeout(timer);}
}

async function meta(path,{method='GET',params={},attempts=2}={}){
  if(!THREADS_ACCESS_TOKEN) throw new Error('threads_token_missing');
  let last;
  for(let i=1;i<=attempts;i++){
    const url=new URL(`${THREADS_API_BASE}${path}`);
    for(const [k,v] of Object.entries(params)) if(v!==undefined&&v!==null&&v!=='') url.searchParams.set(k,String(v));
    url.searchParams.set('access_token',THREADS_ACCESS_TOKEN);
    const r=await fetchJson(url,{method},10000);
    if(r.status>=200&&r.status<300) return r.data;
    const err=new Error(r.data?.error?.message||`threads_${r.status}`); err.status=r.status; err.details=r.data;
    last=err;
    if(![429,500,502,503,504,599].includes(r.status)||i===attempts) break;
    await sleep(400*i);
  }
  throw last||new Error('threads_request_failed');
}

async function sb(path,options={}){
  if(!SUPABASE_URL||!SUPABASE_KEY) return null;
  const headers={'Content-Type':'application/json',apikey:SUPABASE_KEY};
  if(options.prefer) headers.Prefer=options.prefer;
  const r=await fetchJson(`${SUPABASE_URL}/rest/v1/${path}`,{method:options.method||'GET',headers,body:options.body===undefined?undefined:JSON.stringify(options.body)},10000);
  if(r.status<200||r.status>=300) throw new Error(`supabase_${r.status}`);
  return r.data;
}

async function event(type,message,metadata={},resolved=true,severity='info'){
  try{return await sb('system_events',{method:'POST',prefer:'return=minimal',body:{component:'growth-engine',event_type:type,severity,message,resolved,resolution:resolved?'handled':null,metadata:{engineVersion:'growth-v1',...metadata}}});}catch{return null;}
}

function idOf(x){
  if(!x) return null;
  if(typeof x==='string'||typeof x==='number') return String(x);
  return x.id?String(x.id):null;
}

function safeInboundReply(r,ownUsername){
  if(!r?.id||r?.is_reply_owned_by_me===true) return false;
  if(ownUsername&&String(r?.username||'').toLowerCase()===String(ownUsername).toLowerCase()) return false;
  const text=String(r?.text||'').trim();
  if(text.length<2||text.length>220) return false;
  if(/https?:\/\//i.test(text)) return false;
  return true;
}

function simpleReplyText(text){
  const t=String(text||'');
  if(/[?？]/.test(t)) return null;
  if(/ありがとう|参考|助か|便利|いいね|良い|よさそう|良さそう/.test(t)) return 'ありがとうございます😊 実際に使いやすいか、コスパまで見ながら良さそうなものをまた共有します。';
  if(/わかる|分かる|同感|あるある|ほんと|本当/.test(t)) return 'わかります😊 こういう小さな不便ほど、毎日の積み重ねで差が出ますよね。';
  return null;
}

async function alreadyClaimed(replyId){
  if(!SUPABASE_URL||!SUPABASE_KEY) return false;
  const rows=await sb('system_events?select=id,metadata&component=eq.growth-engine&event_type=in.(conversation_reply_claimed,conversation_reply_posted)&order=event_time.desc&limit=200');
  return (Array.isArray(rows)?rows:[]).some(r=>String(r?.metadata?.replyId||'')===String(replyId));
}

async function refreshOwnReplies(){
  const me=await meta('/me',{params:{fields:'id,username,name'},attempts:1});
  const posts=await meta('/me/threads',{params:{fields:'id,text,timestamp,permalink',limit:20},attempts:1});
  const candidates=[];
  let readable=false;
  for(const p of (posts?.data||[]).slice(0,10)){
    try{
      const conv=await meta(`/${encodeURIComponent(p.id)}/conversation`,{params:{fields:'id,text,timestamp,username,is_reply,is_reply_owned_by_me,replied_to,root_post,permalink',reverse:'false'},attempts:1});
      readable=true;
      const rows=Array.isArray(conv?.data)?conv.data:[];
      const answered=new Set(rows.filter(x=>x?.is_reply_owned_by_me===true).map(x=>idOf(x?.replied_to)).filter(Boolean));
      for(const r of rows){
        if(!safeInboundReply(r,me?.username)) continue;
        if(answered.has(String(r.id))) continue;
        candidates.push({replyId:String(r.id),rootPostId:String(p.id),username:r.username||null,text:String(r.text||'').slice(0,300),timestamp:r.timestamp||null,permalink:r.permalink||null,suggestedReply:simpleReplyText(r.text)});
      }
    }catch(e){
      if([401,403].includes(Number(e?.status||0))) state.readRepliesAvailable=false;
    }
  }
  state.readRepliesAvailable=readable;
  state.ownReplyCandidates=candidates.slice(0,20);
  if(AUTO_CONVERSATION_REPLY){
    for(const c of state.ownReplyCandidates){
      if(!c.suggestedReply) continue;
      if(await alreadyClaimed(c.replyId)) continue;
      await event('conversation_reply_claimed','Inbound reply claimed before automated response.',{replyId:c.replyId,rootPostId:c.rootPostId},false,'info');
      try{
        const posted=await meta('/me/threads',{method:'POST',params:{media_type:'TEXT',text:c.suggestedReply,reply_to_id:c.replyId,auto_publish_text:'true'},attempts:1});
        state.manageRepliesAvailable=true;
        state.lastAutoReply={at:nowIso(),replyToId:c.replyId,replyId:posted?.id||null};
        await event('conversation_reply_posted','Safe conversational reply published.',{replyId:c.replyId,rootPostId:c.rootPostId,publishedReplyId:posted?.id||null},true,'info');
      }catch(e){
        if([401,403].includes(Number(e?.status||0))) state.manageRepliesAvailable=false;
        await event('conversation_reply_failed','Automated conversational reply failed.',{replyId:c.replyId,status:e?.status||null,error:String(e?.message||e)},false,'warning');
      }
      break;
    }
  }
}

function discoveryScore(p,term){
  const text=String(p?.text||'');
  let s=0;
  if(text.includes(term)) s+=30;
  if(/[?？]/.test(text)) s+=15;
  if(text.length>=30&&text.length<=300) s+=10;
  if(p?.has_replies) s+=10;
  if(p?.is_reply) s-=20;
  const age=(Date.now()-new Date(p?.timestamp||0).getTime())/60000;
  if(Number.isFinite(age)&&age>=0){if(age<=30)s+=25;else if(age<=120)s+=15;else if(age<=360)s+=5;}
  return s;
}

async function refreshDiscovery(){
  if(!DISCOVERY_ENABLED) return;
  const all=[];
  let anySuccess=false;
  for(const term of SEARCH_TERMS){
    try{
      const data=await meta('/keyword_search',{params:{q:term,search_type:'RECENT',search_mode:'KEYWORD',limit:20,fields:'id,text,media_type,permalink,timestamp,username,has_replies,is_quote_post,is_reply'},attempts:1});
      anySuccess=true;
      for(const p of (data?.data||[])) all.push({...p,searchTerm:term,growthScore:discoveryScore(p,term)});
    }catch(e){
      if([401,403].includes(Number(e?.status||0))) state.keywordSearchAvailable=false;
      else if(state.keywordSearchAvailable===null) state.keywordSearchAvailable=false;
    }
  }
  if(anySuccess) state.keywordSearchAvailable=true;
  const seen=new Set();
  state.discoveryCandidates=all.sort((a,b)=>Number(b.growthScore||0)-Number(a.growthScore||0)).filter(x=>{const k=String(x.id||x.permalink||'');if(!k||seen.has(k))return false;seen.add(k);return true;}).slice(0,MAX_DISCOVERY).map(x=>({id:x.id||null,username:x.username||null,text:String(x.text||'').slice(0,360),timestamp:x.timestamp||null,permalink:x.permalink||null,searchTerm:x.searchTerm,growthScore:x.growthScore}));
}

async function refresh(){
  if(!state.configured){state.lastError='threads_not_configured';return;}
  try{
    await refreshOwnReplies();
    await refreshDiscovery();
    state.lastRefreshAt=nowIso(); state.lastError=null;
  }catch(e){state.lastError=String(e?.message||e);}
}

function page(){
  const safe={...state,ownReplyCandidates:state.ownReplyCandidates.map(x=>({...x,suggestedReply:x.suggestedReply||null})),discoveryCandidates:state.discoveryCandidates};
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>CFE Growth Engine</title></head><body><h1>Cash Flow Engine Growth Engine</h1><pre>${esc(JSON.stringify(safe,null,2))}</pre></body></html>`;
}

const previous=http.createServer.bind(http);
http.createServer=function growthCreateServer(listener){
  return previous(async(req,res)=>{
    try{
      const url=new URL(req.url,`http://${req.headers.host||`127.0.0.1:${PORT}`}`);
      if(url.pathname==='/automation/growth-context'&&req.method==='GET'){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'no-referrer'});res.end(page());return;
      }
    }catch{}
    return listener(req,res);
  });
};

setTimeout(()=>refresh().catch(()=>{}),25000).unref?.();
setInterval(()=>refresh().catch(()=>{}),10*60*1000).unref?.();
