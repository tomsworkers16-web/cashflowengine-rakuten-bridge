import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 10000);
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENABLED = String(process.env.CFE_AUTO_POST_ENABLED || 'false').toLowerCase() === 'true';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SLOT_WINDOW_MINUTES = 45;
const LOOP_MS = 60 * 1000;
const START_DELAY_MS = 18 * 1000;
const MAX_TEXT = 500;

const ALL_SLOTS = [
  { hour:7, minute:30 },
  { hour:10, minute:30 },
  { hour:12, minute:30 },
  { hour:17, minute:30 },
  { hour:19, minute:30 }
];

const state = {
  enabled: ENABLED,
  lastTickAt: null,
  lastDecision: 'not_started',
  lastSlotKey: null,
  lastPostId: null,
  lastError: null,
  selfTest: null
};

function nowJst() {
  return new Date(Date.now() + JST_OFFSET_MS);
}
function jstDateKey(d = nowJst()) {
  return d.toISOString().slice(0, 10);
}
function jstIso(d = new Date()) {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().replace('Z', '+09:00');
}
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
function esc(v) {
  return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function hashInt(value) {
  const h = crypto.createHash('sha256').update(String(value)).digest();
  return h.readUInt32BE(0);
}

async function fetchJson(url, options = {}, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal:controller.signal });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; }
    catch { data = { ok:false, error:'invalid_json', preview:text.slice(0,300) }; }
    return { status:response.status, data };
  } catch (error) {
    return { status:599, data:{ ok:false, error:error?.name === 'AbortError' ? 'timeout' : 'fetch_failed' } };
  } finally { clearTimeout(timer); }
}

async function localJson(path, options = {}, timeoutMs = 18000) {
  return fetchJson(`http://127.0.0.1:${PORT}${path}`, options, timeoutMs);
}

async function supabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('supabase_not_configured');
  const headers = { 'Content-Type':'application/json', apikey:SUPABASE_KEY };
  if (options.prefer) headers.Prefer = options.prefer;
  const result = await fetchJson(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET', headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  }, 10000);
  if (result.status < 200 || result.status >= 300) throw new Error(`supabase_${result.status}`);
  return result.data;
}

async function writeEvent(eventType, message, metadata = {}, resolved = true, severity = 'info') {
  const rows = await supabase('system_events', {
    method:'POST', prefer:'return=representation',
    body:{ component:'auto-post-engine', event_type:eventType, severity, message, resolved, resolution:resolved?'handled':null, metadata }
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

function normalizePolicy(policy = {}) {
  const modes = ['NORMAL','CAUTION','REVENUE_HOLD','FULL_HOLD'];
  const mode = modes.includes(policy.systemMode) ? policy.systemMode : 'CAUTION';
  const full = mode === 'FULL_HOLD';
  const revenueHold = mode === 'REVENUE_HOLD';
  return {
    systemMode:mode,
    postingEnabled: full ? false : policy.postingEnabled !== false,
    revenuePostingEnabled: (full || revenueHold) ? false : policy.revenuePostingEnabled !== false,
    organicPostingEnabled: full ? false : policy.organicPostingEnabled !== false,
    maxPostsPerDay: clamp(Number(policy.maxPostsPerDay ?? 3), 0, 5),
    minExperimentsPerDay: full ? 0 : clamp(Number(policy.minExperimentsPerDay ?? 1), 1, 5),
    exploitRatio: clamp(Number(policy.exploitRatio ?? 0.75), 0, 1),
    exploreRatio: clamp(Number(policy.exploreRatio ?? 0.25), 0, 1),
    priorityThemes: Array.isArray(policy.priorityThemes) ? policy.priorityThemes.map(String).slice(0,10) : []
  };
}

async function latestPolicy() {
  const rows = await supabase('system_events?select=event_time,metadata&component=eq.cfe-ai-coo&event_type=eq.operating_policy&order=event_time.desc&limit=1');
  const raw = Array.isArray(rows) && rows[0]?.metadata?.policy ? rows[0].metadata.policy : {};
  return normalizePolicy(raw);
}

function slotsForMax(maxPosts) {
  if (maxPosts <= 0) return [];
  if (maxPosts === 1) return [ALL_SLOTS[2]];
  if (maxPosts === 2) return [ALL_SLOTS[1], ALL_SLOTS[4]];
  if (maxPosts === 3) return [ALL_SLOTS[0], ALL_SLOTS[2], ALL_SLOTS[4]];
  if (maxPosts === 4) return [ALL_SLOTS[0], ALL_SLOTS[1], ALL_SLOTS[3], ALL_SLOTS[4]];
  return ALL_SLOTS;
}

function currentEligibleSlot(maxPosts) {
  const d = nowJst();
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  const slots = slotsForMax(maxPosts);
  let chosen = null;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const slotMin = s.hour * 60 + s.minute;
    const age = minutes - slotMin;
    if (age >= 0 && age <= SLOT_WINDOW_MINUTES) chosen = { ...s, index:i, total:slots.length, ageMinutes:age };
  }
  if (!chosen) return null;
  const hh = String(chosen.hour).padStart(2,'0');
  const mm = String(chosen.minute).padStart(2,'0');
  return { ...chosen, key:`${jstDateKey(d)}T${hh}:${mm}+09:00`, scheduledAt:`${jstDateKey(d)}T${hh}:${mm}:00+09:00` };
}

async function slotAlreadyClaimed(slotKey) {
  const q = `system_events?select=id,event_type,metadata&component=eq.auto-post-engine&event_type=in.(slot_claimed,slot_posted)&order=event_time.desc&limit=100`;
  const rows = await supabase(q);
  return (Array.isArray(rows) ? rows : []).some(r => r?.metadata?.slotKey === slotKey);
}

function priceBand(price) {
  const p = Number(price || 0);
  if (!p) return 'unknown';
  if (p < 1500) return 'under_1500';
  if (p <= 5000) return '1500_5000';
  if (p <= 10000) return '5000_10000';
  return 'over_10000';
}

function shortText(s, n) {
  const value = String(s || '').replace(/\s+/g,' ').trim();
  return value.length <= n ? value : `${value.slice(0, Math.max(0,n-1))}…`;
}

function revenueCopy(candidate) {
  const name = shortText(candidate.productName || candidate.itemName || '楽天の便利アイテム', 92);
  const theme = shortText(String(candidate.theme || '').split(' / ')[0], 35);
  const price = Number(candidate.price || candidate.itemPrice || 0);
  const reviews = Number(candidate.reviewCount || 0);
  const rating = Number(candidate.reviewAverage || 0);
  const facts = [];
  if (price > 0) facts.push(`${price.toLocaleString('ja-JP')}円`);
  if (reviews > 0 && rating > 0) facts.push(`レビュー${reviews.toLocaleString('ja-JP')}件・★${rating}`);
  const line2 = theme ? `${theme}でチェックした候補。` : '今日チェックした便利アイテム候補。';
  const line3 = facts.length ? `${facts.join(' / ')}。` : '';
  const url = String(candidate.affiliateUrl || '');
  return shortText(`【PR】${name}\n${line2}${line3}\n気になる人は詳細を確認👇\n${url}`, MAX_TEXT);
}

function organicCopy(policy, slotKey) {
  const theme = policy.priorityThemes[hashInt(slotKey) % Math.max(1, policy.priorityThemes.length)] || '暮らしの時短';
  const options = [
    `${theme}で「これだけは面倒」と感じる作業、何ですか？\n便利グッズを選ぶ基準を絞りたいので、リアルな困りごとを知りたいです。`,
    `${theme}の便利アイテム、選ぶなら何を一番重視しますか？\n①価格 ②時短 ③収納性 ④手入れの楽さ`,
    `${theme}は、安さより「毎日ラクになるか」で選ぶ方が結局得だと思っています。\nみなさんは価格優先？使いやすさ優先？`
  ];
  return shortText(options[hashInt(slotKey) % options.length], MAX_TEXT);
}

function predictionFor(candidate, slot, role) {
  const p = candidate?.priors || {};
  const s = candidate?.spearSignals || {};
  return {
    expected_views:Number(p.expectedViews || 0),
    expected_ctr:Number(p.expectedCtr || 0),
    expected_cvr:Number(p.expectedCvr || 0),
    expected_commission_per_order:Number(p.expectedCommissionPerOrder || 0),
    expected_net_profit:Number(p.expectedNetProfit || 0),
    expected_profit_score:Number(candidate?.expectedProfitScore || 0),
    confidence:Number(candidate?.confidence || 0),
    uncertainty:Number(candidate?.uncertainty || 0),
    signal_type:role,
    momentum:Number(s.momentum || 0),
    buzz_match:Number(s.buzzMatch || 0),
    predict:Number(s.predict || 0),
    theme:String(candidate?.theme || ''),
    product_category:String(candidate?.theme || ''),
    price_band:priceBand(candidate?.price || candidate?.itemPrice),
    hook:role === 'explore' ? 'learning_value_test' : 'expected_profit_ranked',
    scheduled_post_time:slot.scheduledAt,
    item_code:candidate?.itemCode || null,
    affiliate_url:candidate?.affiliateUrl || null,
    portfolio_role:role
  };
}

async function chooseCandidate(policy, slot, plan, recentPosts) {
  const candidates = (Array.isArray(plan?.candidates) ? plan.candidates : []).filter(c => typeof c?.affiliateUrl === 'string' && /^https?:\/\//.test(c.affiliateUrl));
  if (!candidates.length) return null;
  const recentText = recentPosts.map(p => String(p?.text || '')).join('\n');
  const available = candidates.filter(c => !recentText.includes(c.affiliateUrl) && !recentText.includes(shortText(c.productName || c.itemName || '', 28)));
  const pool = available.length ? available : candidates;
  const exploreSlots = Math.max(1, Math.round(slot.total * policy.exploreRatio));
  const explore = slot.index >= slot.total - exploreSlots;
  if (explore) {
    const sorted = [...pool].sort((a,b) => Number(b.explorationBonus || 0) - Number(a.explorationBonus || 0) || Number(b.expectedProfitScore || 0) - Number(a.expectedProfitScore || 0));
    return { candidate:sorted[0], role:'explore' };
  }
  const sorted = [...pool].sort((a,b) => Number(b.expectedProfitScore || 0) - Number(a.expectedProfitScore || 0) || Number(b.score || 0) - Number(a.score || 0));
  return { candidate:sorted[0], role:'exploit' };
}

async function publish(text, prediction) {
  return localJson('/threads/post', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${BRIDGE_TOKEN}` },
    body:JSON.stringify({ text, prediction })
  }, 18000);
}

async function tick() {
  state.lastTickAt = jstIso(new Date());
  if (!ENABLED) { state.lastDecision = 'disabled'; return; }
  if (!BRIDGE_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) { state.lastDecision='not_configured'; state.lastError='missing_internal_configuration'; return; }
  try {
    const policy = await latestPolicy();
    if (policy.systemMode === 'FULL_HOLD' || !policy.postingEnabled) { state.lastDecision='full_hold_or_posting_disabled'; return; }
    const slot = currentEligibleSlot(policy.maxPostsPerDay);
    if (!slot) { state.lastDecision='outside_post_window'; return; }
    state.lastSlotKey = slot.key;
    if (await slotAlreadyClaimed(slot.key)) { state.lastDecision='slot_already_claimed'; return; }

    const today = await localJson('/threads/evaluation-data?days=1', {}, 18000);
    if (today.status !== 200 || today.data?.ok !== true) { state.lastDecision='threads_state_unavailable'; state.lastError='threads_evaluation_failed'; return; }
    const todayPosts = Array.isArray(today.data?.posts) ? today.data.posts : [];
    if (todayPosts.length >= policy.maxPostsPerDay) { state.lastDecision='daily_cap_reached'; return; }

    let text, prediction, metadata;
    if (policy.revenuePostingEnabled) {
      const planResult = await localJson('/daily-plan', {}, 22000);
      if (planResult.status !== 200 || planResult.data?.ok !== true) { state.lastDecision='daily_plan_unavailable'; state.lastError=planResult.data?.reason || 'daily_plan_unavailable'; return; }
      const chosen = await chooseCandidate(policy, slot, planResult.data, todayPosts);
      if (!chosen) { state.lastDecision='no_safe_candidate'; return; }
      text = revenueCopy(chosen.candidate);
      prediction = predictionFor(chosen.candidate, slot, chosen.role);
      metadata = { slotKey:slot.key, scheduledAt:slot.scheduledAt, mode:'revenue', role:chosen.role, itemCode:chosen.candidate.itemCode || null, affiliateUrl:chosen.candidate.affiliateUrl };
    } else if (policy.organicPostingEnabled) {
      text = organicCopy(policy, slot.key);
      prediction = { expected_views:0, expected_ctr:0, expected_cvr:0, expected_commission_per_order:0, expected_net_profit:0, expected_profit_score:0, confidence:0.3, signal_type:'organic_learning', theme:policy.priorityThemes[0] || '暮らしの時短', hook:'organic_learning_prompt', scheduled_post_time:slot.scheduledAt, portfolio_role:'explore' };
      metadata = { slotKey:slot.key, scheduledAt:slot.scheduledAt, mode:'organic' };
    } else { state.lastDecision='no_allowed_post_type'; return; }

    await writeEvent('slot_claimed', 'Auto-post slot claimed before publication.', metadata, false, 'info');
    const posted = await publish(text, prediction);
    if (posted.status === 200 && posted.data?.ok === true && posted.data?.id) {
      state.lastDecision='posted'; state.lastPostId=posted.data.id; state.lastError=null;
      await writeEvent('slot_posted', 'Auto-post published successfully.', { ...metadata, postId:posted.data.id, predictionSnapshotSaved:posted.data?.prediction_snapshot_saved === true, predictionSnapshotPersisted:posted.data?.prediction_snapshot_persisted === true }, true, 'info');
      console.log('[AUTO_POST_SUCCESS]', JSON.stringify({ slotKey:slot.key, postId:posted.data.id, mode:metadata.mode }));
    } else {
      state.lastDecision='publish_failed'; state.lastError=posted.data?.error || `status_${posted.status}`;
      await writeEvent('slot_failed', 'Auto-post publication failed after slot claim.', { ...metadata, error:state.lastError, status:posted.status }, false, 'warning').catch(()=>{});
      console.error('[AUTO_POST_FAILED]', JSON.stringify({ slotKey:slot.key, status:posted.status, error:state.lastError }));
    }
  } catch (error) {
    state.lastDecision='engine_error'; state.lastError=String(error?.message || error);
    console.error('[AUTO_POST_ENGINE_ERROR]', JSON.stringify({ error:state.lastError }));
  }
}

function runSelfTest() {
  const fake = { productName:'テスト商品', theme:'時短 家事', price:1980, reviewCount:120, reviewAverage:4.5, affiliateUrl:'https://example.invalid/item', expectedProfitScore:55, confidence:0.6, priors:{ expectedViews:100, expectedCtr:0.01, expectedCvr:0.02, expectedCommissionPerOrder:50, expectedNetProfit:1 }, spearSignals:{ momentum:50, buzzMatch:0, predict:40 } };
  const slot = { scheduledAt:'2026-11-01T12:30:00+09:00' };
  const text = revenueCopy(fake);
  const prediction = predictionFor(fake, slot, 'exploit');
  state.selfTest = { passed:text.includes('【PR】') && text.includes(fake.affiliateUrl) && text.length <= MAX_TEXT && prediction.expected_net_profit === 1, textLength:text.length };
  console.log('[AUTO_POST_SELF_TEST]', JSON.stringify(state.selfTest));
}

const previousCreateServer = http.createServer.bind(http);
http.createServer = function autoPostCreateServer(listener) {
  return previousCreateServer(async (req,res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);
      if (url.pathname === '/automation/auto-post-status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Robots-Tag':'noindex,nofollow', 'Referrer-Policy':'no-referrer' });
        res.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>CFE Auto Post Status</title></head><body><h1>Cash Flow Engine Auto Post Engine</h1><pre>${esc(JSON.stringify({ ...state, slotWindowMinutes:SLOT_WINDOW_MINUTES, slots:ALL_SLOTS }, null, 2))}</pre></body></html>`);
        return;
      }
    } catch {}
    return listener(req,res);
  });
};

runSelfTest();
const startTimer = setTimeout(() => tick().catch(()=>{}), START_DELAY_MS);
startTimer.unref?.();
const loop = setInterval(() => tick().catch(()=>{}), LOOP_MS);
loop.unref?.();
