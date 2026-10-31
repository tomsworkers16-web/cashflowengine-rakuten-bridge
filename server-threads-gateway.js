import http from 'node:http';
import fs from 'node:fs';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 10000);
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';
const THREADS_API_BASE = process.env.THREADS_API_BASE || 'https://graph.threads.net/v1.0';
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN || '';
const THREADS_USER_ID = process.env.THREADS_USER_ID || '';
const STATE_FILE = process.env.CFE_THREADS_STATE_FILE || '/tmp/cfe-threads-state.json';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const runtimeState = {
  lastSuccessfulFetch: null,
  lastError: null,
  predictionSnapshots: {},
  fallbackAudit: []
};

try {
  if (fs.existsSync(STATE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (saved && typeof saved === 'object') {
      runtimeState.lastSuccessfulFetch = saved.lastSuccessfulFetch || null;
      runtimeState.lastError = saved.lastError || null;
      runtimeState.predictionSnapshots = saved.predictionSnapshots || {};
      runtimeState.fallbackAudit = Array.isArray(saved.fallbackAudit) ? saved.fallbackAudit.slice(-100) : [];
    }
  }
} catch (e) {
  console.error('[THREADS_STATE_LOAD_ERROR]', String(e?.message || e));
}

function persistState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(runtimeState), 'utf8');
  } catch (e) {
    console.error('[THREADS_STATE_SAVE_ERROR]', String(e?.message || e));
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(body));
}

function authOk(req) {
  return Boolean(BRIDGE_TOKEN) && (req.headers.authorization || '') === `Bearer ${BRIDGE_TOKEN}`;
}

function toJstIso(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().replace('Z', '+09:00');
}

function jstWindowStart(days) {
  const now = new Date();
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const d = jst.getUTCDate();
  const utcMs = Date.UTC(y, m, d - (days - 1), 0, 0, 0) - JST_OFFSET_MS;
  return new Date(utcMs);
}

function classifyMetaFailure(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || 'meta_api_error').toLowerCase();
  if (message.includes('timeout') || message.includes('abort')) return 'meta_api_timeout';
  if (status === 401 || status === 403) return 'meta_api_authentication_error';
  if (status === 429) return 'meta_api_rate_limit';
  if (status >= 500) return 'meta_api_temporary_outage';
  if (status === 0) return 'bridge_meta_fetch_failure';
  return 'meta_api_error';
}

async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function metaRequest(path, { method = 'GET', params = {}, attempts = 3 } = {}) {
  if (!THREADS_ACCESS_TOKEN || !THREADS_USER_ID) {
    const e = new Error('threads_credentials_not_configured');
    e.status = 503;
    throw e;
  }
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const url = new URL(`${THREADS_API_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    url.searchParams.set('access_token', THREADS_ACCESS_TOKEN);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const upstream = await fetch(url, { method, signal: controller.signal });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        const e = new Error(`Threads API error ${upstream.status}`);
        e.status = upstream.status;
        e.details = data;
        throw e;
      }
      return data;
    } catch (e) {
      lastError = e;
      const status = Number(e?.status || 0);
      const transient = status === 429 || status >= 500 || status === 0 || e?.name === 'AbortError';
      if (!transient || attempt >= attempts) break;
      await sleep(350 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('meta_api_unknown_error');
}

function insightValue(rows, name) {
  const row = (Array.isArray(rows) ? rows : []).find(x => x?.name === name);
  if (!row) return 0;
  if (typeof row.value === 'number') return row.value;
  if (Array.isArray(row.values) && row.values.length) {
    const v = row.values[row.values.length - 1]?.value;
    if (typeof v === 'number') return v;
  }
  const n = Number(row.value ?? row.values?.[0]?.value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function accountInsights() {
  try {
    const data = await metaRequest('/me/threads_insights', {
      attempts: 1,
      params: { metric: 'views,likes,replies,reposts,quotes,followers_count' }
    });
    const rows = data?.data || [];
    return {
      profile_views: null,
      follower_count: insightValue(rows, 'followers_count') || null,
      raw_metrics: rows.map(x => x?.name).filter(Boolean)
    };
  } catch (e) {
    return { profile_views: null, follower_count: null, raw_metrics: [], warning: String(e?.message || e) };
  }
}

async function getEvaluationData(days = 7, simulateFailure = false) {
  const fetchedAt = toJstIso(new Date());
  if (simulateFailure) {
    const mock = new Error('simulated_meta_api_timeout');
    mock.status = 504;
    throw mock;
  }
  const profile = await metaRequest('/me', {
    params: { fields: 'id,username,name,threads_profile_picture_url,threads_biography' }
  });
  const postsRaw = await metaRequest('/me/threads', {
    params: { fields: 'id,text,timestamp,username,permalink', limit: '100' }
  });
  const start = jstWindowStart(days);
  const posts = (postsRaw?.data || []).filter(p => {
    const t = new Date(p?.timestamp || 0);
    return !Number.isNaN(t.getTime()) && t >= start;
  });
  const acct = await accountInsights();

  const normalized = [];
  for (const p of posts) {
    let rows = [];
    try {
      const insight = await metaRequest(`/${encodeURIComponent(p.id)}/insights`, {
        attempts: 2,
        params: { metric: 'views,likes,replies,reposts,quotes,shares' }
      });
      rows = insight?.data || [];
    } catch (e) {
      rows = [];
    }
    const prediction = runtimeState.predictionSnapshots[p.id] || null;
    normalized.push({
      account: profile?.username || 'rakumitsu_select',
      post_id: p.id,
      post_timestamp: toJstIso(p.timestamp),
      post_timestamp_utc: p.timestamp || null,
      text: p.text || '',
      permalink: p.permalink || null,
      views: insightValue(rows, 'views'),
      likes: insightValue(rows, 'likes'),
      replies: insightValue(rows, 'replies'),
      reposts: insightValue(rows, 'reposts'),
      quotes: insightValue(rows, 'quotes'),
      shares: insightValue(rows, 'shares'),
      profile_views: acct.profile_views,
      follower_count: acct.follower_count,
      source: 'meta_official',
      threads_data_source: 'meta_official',
      fetched_at: fetchedAt,
      prediction_snapshot: prediction
    });
  }

  runtimeState.lastSuccessfulFetch = fetchedAt;
  runtimeState.lastError = null;
  persistState();
  return {
    ok: true,
    account: profile?.username || 'rakumitsu_select',
    target_account: 'rakumitsu_select',
    days,
    timezone: 'Asia/Tokyo',
    window_start: toJstIso(start),
    post_count: normalized.length,
    threads_data_source: 'meta_official',
    source: 'meta_official',
    primary_source: 'meta_official',
    fallback_source: 'windsor',
    fetched_at: fetchedAt,
    account_metrics: acct,
    posts: normalized
  };
}

function recordFallbackFailure(error) {
  const event = {
    fallback_timestamp: toJstIso(new Date()),
    fallback_reason: classifyMetaFailure(error),
    meta_api_error: {
      status: Number(error?.status || 0) || null,
      message: String(error?.message || error),
      details: error?.details || null
    }
  };
  runtimeState.lastError = event;
  runtimeState.fallbackAudit.push(event);
  runtimeState.fallbackAudit = runtimeState.fallbackAudit.slice(-100);
  persistState();
  return event;
}

function sanitizePrediction(input = {}) {
  const fields = [
    'expected_views','expected_ctr','expected_cvr','expected_commission_per_order','expected_net_profit',
    'signal_type','momentum','buzz_match','predict','theme','product_category','category','price_band','hook','scheduled_post_time',
    'item_code','affiliate_url','expected_profit_score','confidence','uncertainty','portfolio_role'
  ];
  const out = {};
  for (const key of fields) if (input[key] !== undefined) out[key] = input[key];
  out.snapshot_created_at = toJstIso(new Date());
  out.timezone = 'Asia/Tokyo';
  return out;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function publishWithSnapshot(req, res) {
  if (!authOk(req)) return sendJson(res, 401, { error: 'unauthorized' });
  const body = await readBody(req);
  const text = String(body?.text || '');
  if (!text) return sendJson(res, 400, { error: 'text_required' });
  if (text.length > 500) return sendJson(res, 400, { error: 'text_too_long' });
  const params = { media_type: 'TEXT', text, auto_publish_text: 'true' };
  const posted = await metaRequest('/me/threads', { method: 'POST', params, attempts: 2 });
  const id = posted?.id || null;
  if (id && body?.prediction && !runtimeState.predictionSnapshots[id]) {
    runtimeState.predictionSnapshots[id] = sanitizePrediction(body.prediction);
    persistState();
  }
  return sendJson(res, 200, {
    ok: true,
    id,
    threads_data_source: 'meta_official',
    prediction_snapshot_saved: Boolean(id && runtimeState.predictionSnapshots[id])
  });
}

const previousCreateServer = http.createServer.bind(http);
http.createServer = function threadsGatewayCreateServer(listener) {
  return previousCreateServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);
    try {
      if (url.pathname === '/threads/health' && req.method === 'GET') {
        const configured = Boolean(THREADS_ACCESS_TOKEN && THREADS_USER_ID);
        if (!configured) {
          return sendJson(res, 503, {
            ok: false,
            configured: false,
            meta_api_reachable: false,
            token_validity: 'missing',
            target_account: 'rakumitsu_select',
            last_successful_fetch: runtimeState.lastSuccessfulFetch,
            last_error: runtimeState.lastError,
            primary_source: 'meta_official',
            fallback_source: 'windsor',
            current_primary_source: 'meta_official'
          });
        }
        try {
          const me = await metaRequest('/me', { attempts: 2, params: { fields: 'id,username,name' } });
          runtimeState.lastSuccessfulFetch = toJstIso(new Date());
          runtimeState.lastError = null;
          persistState();
          return sendJson(res, 200, {
            ok: true,
            configured: true,
            meta_api_reachable: true,
            token_validity: 'valid',
            target_account: me?.username || 'rakumitsu_select',
            user_id: me?.id || THREADS_USER_ID,
            last_successful_fetch: runtimeState.lastSuccessfulFetch,
            last_error: null,
            primary_source: 'meta_official',
            fallback_source: 'windsor',
            current_primary_source: 'meta_official'
          });
        } catch (e) {
          const audit = recordFallbackFailure(e);
          return sendJson(res, 502, {
            ok: false,
            configured: true,
            meta_api_reachable: false,
            token_validity: [401,403].includes(Number(e?.status || 0)) ? 'invalid' : 'unknown',
            target_account: 'rakumitsu_select',
            last_successful_fetch: runtimeState.lastSuccessfulFetch,
            last_error: audit,
            primary_source: 'meta_official',
            fallback_source: 'windsor',
            current_primary_source: 'meta_official',
            fallback_required: true
          });
        }
      }

      if (url.pathname === '/threads/evaluation-data' && req.method === 'GET') {
        const days = Math.min(30, Math.max(1, Number(url.searchParams.get('days') || 7)));
        const simulateFailure = url.searchParams.get('simulate_meta_failure') === '1';
        try {
          const data = await getEvaluationData(days, simulateFailure);
          return sendJson(res, 200, data);
        } catch (e) {
          const audit = recordFallbackFailure(e);
          return sendJson(res, 502, {
            ok: false,
            target_account: 'rakumitsu_select',
            days,
            timezone: 'Asia/Tokyo',
            threads_data_source: 'meta_official_failed',
            primary_source: 'meta_official',
            fallback_source: 'windsor',
            fallback_required: true,
            ...audit,
            fetched_at: toJstIso(new Date())
          });
        }
      }

      if (url.pathname === '/threads/fallback-audit' && req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          primary_source: 'meta_official',
          fallback_source: 'windsor',
          events: runtimeState.fallbackAudit.slice(-20)
        });
      }

      if (url.pathname === '/threads/prediction-snapshot' && req.method === 'GET') {
        const id = url.searchParams.get('post_id');
        if (!id) return sendJson(res, 400, { error: 'post_id_required' });
        return sendJson(res, 200, {
          ok: true,
          post_id: id,
          prediction_snapshot: runtimeState.predictionSnapshots[id] || null
        });
      }

      if (url.pathname === '/threads/post' && req.method === 'POST') {
        return await publishWithSnapshot(req, res);
      }
    } catch (e) {
      return sendJson(res, Number(e?.status || 500), {
        ok: false,
        error: 'threads_gateway_error',
        message: String(e?.message || e),
        status: Number(e?.status || 500)
      });
    }
    return listener(req, res);
  });
};

await import('./server-profit.js');
