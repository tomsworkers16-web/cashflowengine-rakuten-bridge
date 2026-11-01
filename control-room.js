import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 10000);
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AUTOMATION_TOKEN = process.env.CFE_AUTOMATION_TOKEN || '';
const MAX_BODY_BYTES = 96 * 1024;
const SYSTEM_MODES = ['NORMAL','CAUTION','REVENUE_HOLD','FULL_HOLD'];

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

function normalizePolicy(policy = {}, source = 'unknown', eventTime = null) {
  const legacyHold = policy.systemMode === 'HOLD';
  const systemMode = legacyHold ? 'CAUTION' : (SYSTEM_MODES.includes(policy.systemMode) ? policy.systemMode : 'NORMAL');
  const fullHold = systemMode === 'FULL_HOLD';
  const revenueHold = systemMode === 'REVENUE_HOLD';
  const postingEnabled = fullHold ? false : (legacyHold ? true : policy.postingEnabled !== false);
  const revenuePostingEnabled = (fullHold || revenueHold) ? false : (legacyHold ? true : policy.revenuePostingEnabled !== false);
  const organicPostingEnabled = fullHold ? false : true;
  const rawMax = legacyHold ? Math.max(1, Number(policy.maxPostsPerDay || 0)) : Number(policy.maxPostsPerDay ?? 5);
  const maxPostsPerDay = Math.max(0, Math.min(20, rawMax));
  const minExperimentsPerDay = fullHold ? 0 : Math.max(1, Math.min(20, Number(policy.minExperimentsPerDay ?? 1)));
  return {
    source, eventTime, systemMode, postingEnabled, revenuePostingEnabled, organicPostingEnabled,
    priority: String(policy.priority || 'expected_profit_plus_learning_value').slice(0,120),
    exploitRatio: Math.max(0, Math.min(1, Number(policy.exploitRatio ?? 0.8))),
    exploreRatio: Math.max(0, Math.min(1, Number(policy.exploreRatio ?? 0.2))),
    maxPostsPerDay,
    minExperimentsPerDay,
    priorityThemes: Array.isArray(policy.priorityThemes) ? policy.priorityThemes.map(String).slice(0,10) : [],
    holdReasons: legacyHold ? ['legacy_hold_migrated_to_caution', ...(Array.isArray(policy.holdReasons) ? policy.holdReasons.map(String).slice(0,9) : [])] : (Array.isArray(policy.holdReasons) ? policy.holdReasons.map(String).slice(0,10) : []),
    notes: String(policy.notes || '').slice(0,1000),
    issuedAt: policy.issuedAt || null
  };
}

async function latestPolicy() {
  try {
    const rows = await sb('system_events?select=id,event_time,metadata,message&component=eq.cfe-ai-coo&event_type=eq.operating_policy&order=event_time.desc&limit=1');
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (row?.metadata?.policy) return normalizePolicy(row.metadata.policy, 'supabase-baseline', row.event_time);
  } catch {}
  return normalizePolicy({
    systemMode:'NORMAL', postingEnabled:true, revenuePostingEnabled:true, organicPostingEnabled:true,
    priority:'expected_profit_plus_learning_value', exploitRatio:0.75, exploreRatio:0.25,
    maxPostsPerDay:3, minExperimentsPerDay:1,
    notes:'Default profit-first baseline; runtime safety mode is resolved by Control Room.'
  }, 'default-baseline', null);
}

async function savePolicy(policy) {
  const clean = normalizePolicy({ ...policy, issuedAt:new Date().toISOString() }, 'manual-baseline', null);
  delete clean.source;
  delete clean.eventTime;
  const data = await sb('system_events', { method:'POST', prefer:'return=representation', body:{
    component:'cfe-ai-coo', event_type:'operating_policy',
    severity: clean.systemMode === 'NORMAL' ? 'info' : clean.systemMode === 'FULL_HOLD' ? 'error' : 'warning',
    message:'Cash Flow Engine #001 baseline operating policy updated.', resolved:true, resolution:'policy_active', metadata:{ policy:clean }
  }});
  return { row:Array.isArray(data)?data[0]:data, policy:clean };
}

async function localJson(path, timeoutMs=22000) {
  const ctl = new AbortController(); const timer=setTimeout(()=>ctl.abort(),timeoutMs);
  try {
    const r=await fetch(`http://127.0.0.1:${PORT}${path}`,{signal:ctl.signal});
    const text=await r.text(); let data=null;
    try{data=text?JSON.parse(text):null}catch{data={ok:false,error:'invalid_json',preview:text.slice(0,300)}}
    return {status:r.status,data};
  } catch(e) { return {status:599,data:{ok:false,error:'local_fetch_failed',reason:e?.name==='AbortError'?'timeout':'internal_error'}}; }
  finally{clearTimeout(timer)}
}

async function buildSystemContext() {
  const [health, plan, threadsHealth, threadsEvaluation, diagnostics, gateway] = await Promise.all([
    localJson('/health'),
    localJson('/daily-plan'),
    localJson('/threads/health'),
    localJson('/threads/evaluation-data?days=7'),
    localJson('/diagnostics/daily-plan'),
    localJson('/automation/gateway-status')
  ]);
  const candidates = Array.isArray(plan.data?.candidates) ? plan.data.candidates : [];
  const affiliateUrlValidCount = candidates.filter(x => typeof x?.affiliateUrl === 'string' && /^https?:\/\//.test(x.affiliateUrl)).length;
  const threadsDataSource = threadsEvaluation.data?.threads_data_source || threadsEvaluation.data?.source || null;
  const insightFetchFailures = Number(threadsEvaluation.data?.insight_fetch_failures || 0);
  const planOk = health.status === 200 && health.data?.ok === true && health.data?.configured === true && plan.status === 200 && plan.data?.ok === true && plan.data?.scoringVersion === 'expected-profit-v3' && candidates.length >= 20 && affiliateUrlValidCount >= 20;
  const threadsOk = threadsHealth.status === 200 && threadsHealth.data?.configured === true && threadsEvaluation.status === 200 && threadsEvaluation.data?.ok === true && threadsDataSource === 'meta_official' && insightFetchFailures === 0;
  const diagnosticsOk = diagnostics.status === 200 && diagnostics.data?.candidateGeneration === 'ok' && diagnostics.data?.expectedProfitEngine === 'ok';
  const gatewayOk = gateway.status === 200 && gateway.data?.configured === true;
  return {
    status: planOk && threadsOk && diagnosticsOk && gatewayOk ? 200 : 503,
    data: {
      ok: planOk && threadsOk && diagnosticsOk && gatewayOk,
      generatedAt: new Date().toISOString(),
      scoringVersion: plan.data?.scoringVersion || health.data?.scoringVersion || null,
      candidateCount: candidates.length,
      affiliateUrlValidCount,
      dailyPlanSource: plan.data?.source || null,
      stale: plan.data?.stale === true,
      ageMinutes: plan.data?.ageMinutes ?? null,
      threadsDataSource,
      insightFetchFailures,
      threadsPostCount: threadsEvaluation.data?.post_count ?? null,
      gatewayConfigured: gateway.data?.configured === true,
      candidateGeneration: diagnostics.data?.candidateGeneration || null,
      expectedProfitEngine: diagnostics.data?.expectedProfitEngine || null,
      rakutenApi: diagnostics.data?.rakutenApi || null,
      lkgAvailable: diagnostics.data?.lkgAvailable ?? health.data?.dailyPlan?.lkgAvailable ?? null,
      lastError: diagnostics.data?.lastError || null,
      components: {
        healthStatus: health.status, dailyPlanStatus: plan.status, threadsHealthStatus: threadsHealth.status,
        threadsEvaluationStatus: threadsEvaluation.status, diagnosticsStatus: diagnostics.status, gatewayStatus: gateway.status
      },
      checks: { planOk, threadsOk, diagnosticsOk, gatewayOk }
    }
  };
}

function resolveEffectivePolicy(baseline, context = {}) {
  const checks = context.checks || {};
  const reasons = [];
  let mode = 'NORMAL';
  if (checks.threadsOk === false || checks.gatewayOk === false) {
    mode = 'FULL_HOLD';
    if (checks.threadsOk === false) reasons.push('threads_execution_path_unhealthy');
    if (checks.gatewayOk === false) reasons.push('posting_gateway_unhealthy');
  } else if (checks.planOk === false || checks.diagnosticsOk === false) {
    mode = 'REVENUE_HOLD';
    if (checks.planOk === false) reasons.push('revenue_plan_unavailable');
    if (checks.diagnosticsOk === false) reasons.push('expected_profit_diagnostics_unhealthy');
  } else if (context.stale === true || context.rakutenApi === 'degraded') {
    mode = 'CAUTION';
    if (context.stale === true) reasons.push('using_stale_or_lkg_plan');
    if (context.rakutenApi === 'degraded') reasons.push('rakuten_api_partial_degradation');
  }
  const fullHold = mode === 'FULL_HOLD';
  const revenueHold = mode === 'REVENUE_HOLD';
  return {
    ...baseline,
    source:`effective-resolver:${baseline.source || 'baseline'}`,
    systemMode:mode,
    postingEnabled: fullHold ? false : baseline.postingEnabled !== false,
    revenuePostingEnabled: (fullHold || revenueHold) ? false : baseline.revenuePostingEnabled !== false,
    organicPostingEnabled: fullHold ? false : baseline.organicPostingEnabled !== false,
    minExperimentsPerDay: fullHold ? 0 : Math.max(1, Number(baseline.minExperimentsPerDay || 1)),
    holdReasons:reasons,
    runtimeResolvedAt:new Date().toISOString()
  };
}

function page(policy, context) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cash Flow Engine Control Room</title></head><body><main><h1>Cash Flow Engine #001 Control Room</h1><p>戦略baselineと実システム状態から、専門Agentが共通参照するEffective Operating Policyをサーバー側で自動解決します。</p><h2>Effective Operating Policy</h2><pre>${esc(JSON.stringify(policy,null,2))}</pre><h2>System Context</h2><pre>${esc(JSON.stringify(context?.data || {},null,2))}</pre><h2>Decision Contract</h2><pre>${esc(JSON.stringify({strategicAuthority:'cfe-ai-coo',runtimeAuthority:'control-room-policy-resolver',executionModel:'central_governance_distributed_execution',objective:'maximize_final_profit_through_persistent_safe_experimentation',guardianRole:'sre_only',specialists:['auto-post-supervisor','night-evaluation-agent','a8-agent','guardian-agent'],modes:SYSTEM_MODES,rules:['AI COO evaluates commercial strategy and recommends baseline changes.','Control Room resolves runtime safety mode from live system facts; browser policy writes are not required for daily operation.','Guardian may report unsafe execution but does not change commercial strategy.','FULL_HOLD is reserved for execution-path danger.','REVENUE_HOLD blocks revenue posts but keeps safe organic learning experiments alive.','CAUTION keeps revenue experiments running when the system is usable but partially degraded.','Unless FULL_HOLD, keep at least minExperimentsPerDay safe experiments whenever feasible.','Repeated zero-experiment days are treated as a strategy defect, not a success state.']},null,2))}</pre></main></body></html>`;
}

function commandPage(result=null) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>CFE Baseline Policy Console</title></head><body><h1>CFE Baseline Policy Console</h1><p>手動のbaseline変更専用です。日常運転では使用しません。資格情報はPOST本文でのみ送信され、結果には表示されません。</p><form method="post"><label>Automation credential <input type="password" name="automation_token" required></label><label>Policy JSON<textarea name="policy" rows="18" cols="80" required>{"systemMode":"NORMAL","postingEnabled":true,"revenuePostingEnabled":true,"organicPostingEnabled":true,"priority":"expected_profit_plus_learning_value","exploitRatio":0.75,"exploreRatio":0.25,"maxPostsPerDay":3,"minExperimentsPerDay":1,"priorityThemes":[],"holdReasons":[],"notes":"Baseline strategy only; runtime safety mode is resolved automatically."}</textarea></label><button>Update baseline</button></form>${result?`<h2>Result</h2><pre>${esc(JSON.stringify(result,null,2))}</pre>`:''}</body></html>`;
}

const nativeCreateServer = http.createServer.bind(http);
http.createServer = function controlRoomCreateServer(listener) {
  return nativeCreateServer(async (req,res)=>{
    const url=new URL(req.url,`http://${req.headers.host||`127.0.0.1:${PORT}`}`);
    try {
      if(url.pathname==='/automation/control-room' && req.method==='GET'){
        const [baseline,context]=await Promise.all([latestPolicy(),buildSystemContext()]);
        const policy=resolveEffectivePolicy(baseline,context.data);
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
