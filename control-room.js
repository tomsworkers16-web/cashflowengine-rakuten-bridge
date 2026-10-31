import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 10000);
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AUTOMATION_TOKEN = process.env.CFE_AUTOMATION_TOKEN || '';
const MAX_BODY_BYTES = 96 * 1024;

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (!aa.length || aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function esc(v) {
  return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

async function readRaw(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request_body_too_large'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function sb(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('supabase_not_configured');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const headers = { 'Content-Type':'application/json', apikey: SUPABASE_KEY };
    if (options.prefer) headers.Prefer = options.prefer;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: options.method || 'GET', headers, signal: ctl.signal,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const text = await r.text();
    const data = text ? (()=>{ try { return JSON.parse(text); } catch { return text; } })() : null;
    if (!r.ok) throw Object.assign(new Error(`supabase_${r.status}`), { status:r.status });
    return data;
  } finally { clearTimeout(timer); }
}

async function latestPolicy() {
  try {
    const rows = await sb('system_events?select=id,event_time,metadata,message&component=eq.cfe-ai-coo&event_type=eq.operating_policy&order=event_time.desc&limit=1');
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (row?.metadata?.policy) return { source:'supabase', eventTime:row.event_time, ...row.metadata.policy };
  } catch {}
  return {
    source:'default', eventTime:null, systemMode:'NORMAL', postingEnabled:true,
    revenuePostingEnabled:true, priority:'expected_net_profit', exploitRatio:0.8, exploreRatio:0.2,
    maxPostsPerDay:5, notes:'Default safe operating policy; no commander override stored.'
  };
}

async function savePolicy(policy) {
  const clean = {
    systemMode: ['NORMAL','CAUTION','HOLD'].includes(policy.systemMode) ? policy.systemMode : 'NORMAL',
    postingEnabled: policy.postingEnabled !== false,
    revenuePostingEnabled: policy.revenuePostingEnabled !== false,
    priority: String(policy.priority || 'expected_net_profit').slice(0,120),
    exploitRatio: Math.max(0, Math.min(1, Number(policy.exploitRatio ?? 0.8))),
    exploreRatio: Math.max(0, Math.min(1, Number(policy.exploreRatio ?? 0.2))),
    maxPostsPerDay: Math.max(0, Math.min(20, Number(policy.maxPostsPerDay ?? 5))),
    priorityThemes: Array.isArray(policy.priorityThemes) ? policy.priorityThemes.map(String).slice(0,10) : [],
    holdReasons: Array.isArray(policy.holdReasons) ? policy.holdReasons.map(String).slice(0,10) : [],
    notes: String(policy.notes || '').slice(0,1000),
    issuedAt: new Date().toISOString()
  };
  const data = await sb('system_events', { method:'POST', prefer:'return=representation', body:{
    component:'cfe-ai-coo', event_type:'operating_policy', severity: clean.systemMode === 'NORMAL' ? 'info' : 'warning',
    message:'Cash Flow Engine #001 operating policy issued by AI COO.', resolved:true, resolution:'policy_active', metadata:{ policy:clean }
  }});
  return { row:Array.isArray(data)?data[0]:data, policy:clean };
}

async function localJson(path, timeoutMs=22000) {
  const ctl = new AbortController(); const timer=setTimeout(()=>ctl.abort(),timeoutMs);
  try {
    const r=await fetch(`http://127.0.0.1:${PORT}${path}`,{signal:ctl.signal});
    const text=await r.text(); let data=null; try{data=text?JSON.parse(text):null}catch{data={ok:false,error:'invalid_json'}}
    return {status:r.status,data};
  } catch(e) { return {status:599,data:{ok:false,error:'local_fetch_failed',reason:e?.name==='AbortError'?'timeout':'internal_error'}}; }
  finally{clearTimeout(timer)}
}

function page(policy, context) {
  const summary = context?.data?.summary || null;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cash Flow Engine Control Room</title></head><body><main><h1>Cash Flow Engine #001 Control Room</h1><p>AI COOが発行する運営方針と、Bridgeの現在状態を専門Agentが共通参照する読み取り専用Control Planeです。</p><h2>Operating Policy</h2><pre>${esc(JSON.stringify(policy,null,2))}</pre><h2>System Context</h2><pre>${esc(JSON.stringify(context?.data || {},null,2))}</pre><h2>Decision Contract</h2><pre>${esc(JSON.stringify({authority:'cfe-ai-coo',executionModel:'central_governance_distributed_execution',guardianRole:'sre_only',specialists:['threads-post-agent','night-evaluation-agent','a8-agent','guardian-agent'],rules:['Specialist agents obey the latest operating policy.','Guardian may stop unsafe execution but does not change commercial strategy.','AI COO optimizes final profit and may change policy after evaluating system-wide results.','HOLD overrides posting schedules.']},null,2))}</pre></main></body></html>`;
}

function commandPage(result=null) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>CFE AI COO Policy Console</title></head><body><h1>CFE AI COO Policy Console</h1><p>AI COO専用。資格情報はPOST本文でのみ送信され、結果には表示されません。</p><form method="post"><label>Automation credential <input type="password" name="automation_token" required></label><label>Policy JSON<textarea name="policy" rows="16" cols="80" required>{"systemMode":"NORMAL","postingEnabled":true,"revenuePostingEnabled":true,"priority":"expected_net_profit","exploitRatio":0.8,"exploreRatio":0.2,"maxPostsPerDay":5,"priorityThemes":[],"holdReasons":[],"notes":""}</textarea></label><button>Issue policy</button></form>${result?`<h2>Result</h2><pre>${esc(JSON.stringify(result,null,2))}</pre>`:''}</body></html>`;
}

const nativeCreateServer = http.createServer.bind(http);
http.createServer = function controlRoomCreateServer(listener) {
  return nativeCreateServer(async (req,res)=>{
    const url=new URL(req.url,`http://${req.headers.host||`127.0.0.1:${PORT}`}`);
    try {
      if(url.pathname==='/automation/control-room' && req.method==='GET'){
        const [policy,context]=await Promise.all([latestPolicy(),localJson('/automation/daily-context')]);
        const html=page(policy,context);
        res.writeHead(context.status===200?200:503,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(html);return;
      }
      if(url.pathname==='/automation/policy-console' && req.method==='GET'){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'no-referrer'});res.end(commandPage());return;
      }
      if(url.pathname==='/automation/policy-console' && req.method==='POST'){
        const form=new URLSearchParams(await readRaw(req));
        if(!safeEqual(form.get('automation_token')||'',AUTOMATION_TOKEN)){
          res.writeHead(401,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(commandPage({ok:false,error:'unauthorized'}));return;
        }
        let policy; try{policy=JSON.parse(form.get('policy')||'{}')}catch{throw Object.assign(new Error('invalid_policy_json'),{status:400})}
        const saved=await savePolicy(policy);
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(commandPage({ok:true,saved:true,policy:saved.policy}));return;
      }
    } catch(e) {
      if(url.pathname.startsWith('/automation/')){res.writeHead(Number(e?.status||500),{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({ok:false,error:String(e?.message||e)}));return;}
    }
    return listener(req,res);
  });
};

await import('./automation-context.js');
