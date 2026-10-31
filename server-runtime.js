import http from 'node:http';
import { URL } from 'node:url';
import { getSupabaseStatus, writeSystemEvent, syncThreadsEvaluation } from './supabase-store.js';

const PORT = Number(process.env.PORT || 10000);
const AUTOMATION_TOKEN = process.env.CFE_AUTOMATION_TOKEN || '';
let supabaseSyncRunning = false;

const originalCreateServer = http.createServer.bind(http);
http.createServer = function guardedCreateServer(listener) {
  return originalCreateServer((req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);
      if (
        url.pathname === '/threads/evaluation-data' &&
        url.searchParams.get('simulate_meta_failure') === '1' &&
        process.env.CFE_FALLBACK_TEST_ON_START !== '1'
      ) {
        url.searchParams.delete('simulate_meta_failure');
        req.url = `${url.pathname}${url.search}`;
      }
    } catch {}
    return listener(req, res);
  });
};

await import('./server-automation-gateway.js');

async function localGet(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function localPost(path, body = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function summarizeEvaluation(label, result) {
  const d = result.data || {};
  const first = Array.isArray(d.posts) && d.posts.length ? d.posts[0] : null;
  console.log(`[${label}]`, JSON.stringify({
    status: result.status,
    ok: d.ok === true,
    account: d.account || d.target_account || null,
    timezone: d.timezone || null,
    postCount: d.post_count ?? null,
    source: d.threads_data_source || d.source || null,
    firstPost: first ? {
      post_id: first.post_id,
      post_timestamp: first.post_timestamp,
      views: first.views,
      likes: first.likes,
      replies: first.replies,
      reposts: first.reposts,
      quotes: first.quotes,
      shares: first.shares,
      source: first.threads_data_source || first.source,
      hasPredictionSnapshot: Boolean(first.prediction_snapshot)
    } : null,
    fallbackRequired: d.fallback_required || false,
    fallbackReason: d.fallback_reason || null
  }));
}

async function syncEvaluationResult(result, label) {
  if (supabaseSyncRunning) return;
  if (!getSupabaseStatus().configured || result?.status !== 200 || result?.data?.ok !== true) return;
  supabaseSyncRunning = true;
  try {
    const sync = await syncThreadsEvaluation(result.data);
    console.log(`[SUPABASE_THREADS_SYNC_${label}]`, JSON.stringify(sync));
    if (!sync.ok) {
      await writeSystemEvent({
        component: 'threads-supabase-sync',
        eventType: 'partial_sync_error',
        severity: 'warning',
        message: `Threads to Supabase sync completed with ${sync.errorCount} errors.`,
        resolved: false,
        metadata: sync
      }).catch(() => {});
    }
  } catch (e) {
    console.error(`[SUPABASE_THREADS_SYNC_${label}]`, JSON.stringify({ ok: false, error: String(e?.message || e) }));
    await writeSystemEvent({
      component: 'threads-supabase-sync',
      eventType: 'sync_error',
      severity: 'error',
      message: String(e?.message || e),
      resolved: false,
      metadata: { label }
    }).catch(() => {});
  } finally {
    supabaseSyncRunning = false;
  }
}

setTimeout(async () => {
  try {
    const supabaseStatus = getSupabaseStatus();
    console.log('[SUPABASE_CONFIG]', JSON.stringify(supabaseStatus));

    if (supabaseStatus.configured) {
      try {
        const row = await writeSystemEvent({
          component: 'cashflowengine-rakuten-bridge',
          eventType: 'startup_test',
          severity: 'info',
          message: 'Render bridge successfully wrote a startup test event to Supabase.',
          resolved: true,
          resolution: 'supabase_connection_verified',
          metadata: { source: 'server-runtime', test: true }
        });
        console.log('[SUPABASE_WRITE_TEST]', JSON.stringify({
          ok: true,
          id: row?.id ?? null,
          eventTime: row?.event_time ?? null
        }));
      } catch (e) {
        console.error('[SUPABASE_WRITE_TEST]', JSON.stringify({ ok: false, error: String(e?.message || e) }));
      }
    } else {
      console.log('[SUPABASE_WRITE_TEST]', JSON.stringify({ ok: false, skipped: 'supabase_environment_missing' }));
    }

    const health = await localGet('/threads/health');
    console.log('[THREADS_GATEWAY_HEALTH_TEST]', JSON.stringify({
      status: health.status,
      ok: health.data?.ok === true,
      configured: health.data?.configured,
      metaApiReachable: health.data?.meta_api_reachable,
      tokenValidity: health.data?.token_validity,
      targetAccount: health.data?.target_account,
      primarySource: health.data?.primary_source,
      fallbackSource: health.data?.fallback_source,
      lastSuccessfulFetch: health.data?.last_successful_fetch,
      lastError: health.data?.last_error || null
    }));

    if (AUTOMATION_TOKEN) {
      const token = encodeURIComponent(AUTOMATION_TOKEN);
      const automationHealth = await localGet(`/threads/automation/health?automation_token=${token}`);
      console.log('[THREADS_AUTOMATION_GATEWAY_TEST]', JSON.stringify({
        status: automationHealth.status,
        ok: automationHealth.data?.ok === true,
        configured: automationHealth.data?.configured === true,
        service: automationHealth.data?.service || null,
        primarySource: automationHealth.data?.primary_source || null,
        allowedRouteCount: Array.isArray(automationHealth.data?.allowed_routes) ? automationHealth.data.allowed_routes.length : 0
      }));

      const postAuth = await localPost(`/threads/automation/post?automation_token=${token}`, {});
      console.log('[THREADS_AUTOMATION_POST_AUTH_TEST]', JSON.stringify({
        status: postAuth.status,
        passedAuth: postAuth.status === 400 && postAuth.data?.error === 'text_required',
        error: postAuth.data?.error || null
      }));
    } else {
      console.log('[THREADS_AUTOMATION_GATEWAY_TEST]', JSON.stringify({ ok:false, configured:false, skipped:'CFE_AUTOMATION_TOKEN_missing' }));
    }

    const seven = await localGet('/threads/evaluation-data?days=7');
    summarizeEvaluation('THREADS_EVALUATION_7D_TEST', seven);
    await syncEvaluationResult(seven, 'STARTUP_7D');

    const today = await localGet('/threads/evaluation-data?days=1');
    summarizeEvaluation('THREADS_EVALUATION_TODAY_TEST', today);

    if (process.env.CFE_FALLBACK_TEST_ON_START === '1') {
      const fallback = await localGet('/threads/evaluation-data?days=7&simulate_meta_failure=1');
      summarizeEvaluation('THREADS_FALLBACK_MOCK_TEST', fallback);
      const recovery = await localGet('/threads/evaluation-data?days=7');
      summarizeEvaluation('THREADS_FALLBACK_RECOVERY_TEST', recovery);
    }
  } catch (e) {
    console.error('[THREADS_GATEWAY_STARTUP_TEST_ERROR]', String(e?.message || e));
  }
}, 2500);

setInterval(async () => {
  try {
    const evaluation = await localGet('/threads/evaluation-data?days=7');
    await syncEvaluationResult(evaluation, 'HOURLY_7D');
  } catch (e) {
    console.error('[SUPABASE_THREADS_SYNC_INTERVAL]', JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}, 60 * 60 * 1000);
