const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

const SUPABASE_TIMEOUT_MS = 7000;
const SUPABASE_ATTEMPTS = 2;

export function getSupabaseStatus() {
  return {
    configured: Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY),
    urlConfigured: Boolean(SUPABASE_URL),
    secretConfigured: Boolean(SUPABASE_SECRET_KEY)
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function supabaseRequest(path, { method = 'GET', body = undefined, prefer = undefined, attempts = SUPABASE_ATTEMPTS } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error('supabase_not_configured');
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
    try {
      const headers = {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SECRET_KEY
      };
      if (prefer) headers.Prefer = prefer;
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers,
        signal: controller.signal,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text || null; }
      if (!response.ok) {
        const detail = typeof data === 'string' ? data.slice(0, 1000) : JSON.stringify(data).slice(0, 1000);
        const error = new Error(`supabase_request_failed:${response.status}:${detail}`);
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const retryable = error?.name === 'AbortError' || status === 429 || status >= 500 || status === 0;
      if (!retryable || attempt >= attempts) break;
      await sleep(attempt * 400);
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError?.name === 'AbortError') throw new Error('supabase_request_timeout');
  throw lastError || new Error('supabase_request_failed');
}

export async function writeSystemEvent({
  component,
  eventType,
  severity = 'info',
  message = null,
  resolved = false,
  resolution = null,
  metadata = {}
}) {
  if (!component || !eventType) throw new Error('system_event_component_and_event_type_required');
  const data = await supabaseRequest('system_events', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      component,
      event_type: eventType,
      severity,
      message,
      resolved,
      resolution,
      metadata
    }
  });
  return Array.isArray(data) ? data[0] : data;
}

export async function saveDailyPlanLkg(plan) {
  if (!plan?.ok || plan?.scoringVersion !== 'expected-profit-v3' || !Array.isArray(plan?.candidates) || plan.candidates.length < 20) {
    throw new Error('daily_plan_lkg_invalid');
  }
  return writeSystemEvent({
    component: 'expected-profit-engine',
    eventType: 'daily_plan_lkg',
    severity: 'info',
    message: 'Last known good Expected Profit v3 daily plan.',
    resolved: true,
    resolution: 'plan_generated',
    metadata: {
      scoringVersion: plan.scoringVersion,
      generatedAt: plan.generatedAt,
      candidateCount: plan.candidates.length,
      plan
    }
  });
}

export async function loadDailyPlanLkg() {
  const rows = await supabaseRequest(
    'system_events?select=id,event_time,metadata&component=eq.expected-profit-engine&event_type=eq.daily_plan_lkg&order=event_time.desc&limit=1'
  );
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  const plan = row?.metadata?.plan || null;
  if (!plan || plan?.scoringVersion !== 'expected-profit-v3' || !Array.isArray(plan?.candidates)) return null;
  return {
    id: row.id,
    eventTime: row.event_time,
    plan
  };
}

export async function saveThreadsPredictionSnapshot(postId, snapshot) {
  if (!postId || !snapshot || typeof snapshot !== 'object') return null;
  return writeSystemEvent({
    component: 'threads-prediction',
    eventType: 'prediction_snapshot',
    severity: 'info',
    message: 'Threads prediction snapshot persisted.',
    resolved: true,
    resolution: 'snapshot_saved',
    metadata: { postId: String(postId), snapshot }
  });
}

export async function loadThreadsPredictionSnapshots(limit = 200) {
  if (!getSupabaseStatus().configured) return {};
  const safeLimit = Math.min(500, Math.max(1, Number(limit || 200)));
  const rows = await supabaseRequest(
    `system_events?select=event_time,metadata&component=eq.threads-prediction&event_type=eq.prediction_snapshot&order=event_time.desc&limit=${safeLimit}`
  );
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const postId = row?.metadata?.postId;
    const snapshot = row?.metadata?.snapshot;
    if (postId && snapshot && out[postId] === undefined) out[postId] = snapshot;
  }
  return out;
}

function encodeEq(value) {
  return encodeURIComponent(String(value ?? ''));
}

async function findPostByExternalId(externalPostId) {
  const rows = await supabaseRequest(`posts?select=id,external_post_id&external_post_id=eq.${encodeEq(externalPostId)}&limit=1`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function saveThreadsPost(post) {
  const externalPostId = String(post?.post_id || '');
  if (!externalPostId) return null;
  const existing = await findPostByExternalId(externalPostId);
  const payload = {
    platform: 'threads',
    account_name: post?.account || 'rakumitsu_select',
    external_post_id: externalPostId,
    post_type: 'text',
    content: post?.text || '',
    status: 'published',
    published_at: post?.post_timestamp_utc || post?.post_timestamp || null,
    post_url: post?.permalink || null,
    metadata: {
      threads_data_source: post?.threads_data_source || post?.source || 'meta_official',
      prediction_snapshot: post?.prediction_snapshot || null,
      fetched_at: post?.fetched_at || null
    },
    updated_at: new Date().toISOString()
  };
  if (existing?.id) {
    const rows = await supabaseRequest(`posts?id=eq.${encodeEq(existing.id)}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: payload
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }
  const rows = await supabaseRequest('posts', {
    method: 'POST',
    prefer: 'return=representation',
    body: payload
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function saveThreadsPerformance(post, postRow) {
  if (!postRow?.id) return null;
  const metricDate = String(post?.post_timestamp || post?.post_timestamp_utc || '').slice(0, 10);
  if (!metricDate) return null;
  const existingRows = await supabaseRequest(
    `performance_daily?select=id&post_id=eq.${encodeEq(postRow.id)}&metric_date=eq.${encodeEq(metricDate)}&limit=1`
  );
  const existing = Array.isArray(existingRows) && existingRows.length ? existingRows[0] : null;

  // IMPORTANT: Threads synchronization owns only social/platform metrics.
  // Never overwrite attribution/monetization fields (clicks, conversions, revenue,
  // reward, costs, fees, net profit) on an existing row; those are populated by
  // affiliate/report pipelines and are the ground truth for Expected Profit learning.
  const socialPayload = {
    metric_date: metricDate,
    account_name: post?.account || 'rakumitsu_select',
    post_id: postRow.id,
    impressions: Number(post?.views || 0),
    profile_visits: Number(post?.profile_views || 0),
    metadata: {
      likes: Number(post?.likes || 0),
      replies: Number(post?.replies || 0),
      reposts: Number(post?.reposts || 0),
      quotes: Number(post?.quotes || 0),
      shares: Number(post?.shares || 0),
      follower_count: post?.follower_count ?? null,
      source: post?.threads_data_source || post?.source || 'meta_official',
      fetched_at: post?.fetched_at || null
    },
    updated_at: new Date().toISOString()
  };

  if (existing?.id) {
    const rows = await supabaseRequest(`performance_daily?id=eq.${encodeEq(existing.id)}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: socialPayload
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  const insertPayload = {
    ...socialPayload,
    link_clicks: 0,
    product_page_visits: 0,
    conversions: 0,
    revenue: 0,
    affiliate_reward: 0,
    ad_cost: 0,
    fees: 0,
    net_profit: 0
  };
  const rows = await supabaseRequest('performance_daily', {
    method: 'POST',
    prefer: 'return=representation',
    body: insertPayload
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function syncThreadsEvaluation(evaluation) {
  if (!evaluation?.ok || !Array.isArray(evaluation?.posts)) {
    throw new Error('threads_evaluation_invalid');
  }
  let postsSynced = 0;
  let performanceSynced = 0;
  const errors = [];
  for (const post of evaluation.posts) {
    try {
      const postRow = await saveThreadsPost(post);
      if (postRow?.id) postsSynced += 1;
      const performanceRow = await saveThreadsPerformance(post, postRow);
      if (performanceRow?.id) performanceSynced += 1;
    } catch (e) {
      errors.push({ post_id: post?.post_id || null, error: String(e?.message || e) });
    }
  }
  return {
    ok: errors.length === 0,
    requested: evaluation.posts.length,
    postsSynced,
    performanceSynced,
    errorCount: errors.length,
    errors: errors.slice(0, 5)
  };
}
