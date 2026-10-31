import http from 'node:http';
import { URL } from 'node:url';
import { getSupabaseStatus, writeSystemEvent, syncThreadsEvaluation } from './supabase-store.js';

const PORT = Number(process.env.PORT || 10000);
const AUTOMATION_TOKEN = process.env.CFE_AUTOMATION_TOKEN || '';
const EXTERNAL_BASE = (process.env.RENDER_EXTERNAL_URL || 'https://cashflowengine-rakuten-bridge.onrender.com').replace(/\/$/, '');
const LOCAL_TIMEOUT_MS = 20000;
let supabaseSyncRunning = false;

const originalCreateServer = http.createServer.bind(http);
http.createServer = function guardedCreateServer(listener) {
  return originalCreateServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);

      const mirrorMap = {
        '/_automation/health': '/health',
        '/_automation/daily-plan': '/daily-plan',
        '/_automation/daily-plan-diagnostics': '/diagnostics/daily-plan',
        '/_automation/threads-health': '/threads/health'
      };
      if (req.method === 'GET' && (mirrorMap[url.pathname] || url.pathname === '/_automation/threads-evaluation')) {
        let target = mirrorMap[url.pathname];
        if (url.pathname === '/_automation/threads-evaluation') {
          const days = Math.min(30, Math.max(1, Number(url.searchParams.get('days') || 7)));
          target = `/threads/evaluation-data?days=${days}`;
        }
        const mirrored = await localGet(target);
        res.writeHead(mirrored.status, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
          'X-CFE-Mirror-Source': target
        });
        res.end(JSON.stringify(mirrored.data));
        return;
      }

      if (
        url.pathname === '/threads/evaluation-data' &&
        url.searchParams.get('simulate_meta_failure') === '1' &&
        process.env.CFE_FALLBACK_TEST_ON_START !== '1'
      ) {
        url.searchParams.delete('simulate_meta_failure');
        req.url = `${url.pathname}${url.search}`;
      }
    } catch (e) {
      if (!res.headersSent && req.url?.startsWith('/_automation/')) {
        res.writeHead(500, { 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store' });
        res.end(JSON.stringify({ ok:false, error:'automation_mirror_error', message:String(e?.message || e) }));
        return;
      }
    }
    return listener(req, res);
  });
};

await import('./server-automation-gateway.js');

async function localGet(path, { timeoutMs = LOCAL_TIMEOUT_MS, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { signal: controller.signal, headers });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (error) {
    return {
      status: 599,
      data: {
        ok: false,
        error: 'local_fetch_failed',
        reason: error?.name === 'AbortError' ? 'timeout' : 'internal_error',
        message: String(error?.message || error)
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

async function externalGet(path, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${EXTERNAL_BASE}${path}`, { signal: controller.signal, headers: { 'User-Agent': 'CashFlowEngine-SelfTest/1.0' } });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
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
    insightFetchFailures: d.insight_fetch_failures ?? null,
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
        console.log('[SUPABASE_WRITE_TEST]', JSON.stringify({ ok: true, id: row?.id ?? null, eventTime: row?.event_time ?? null }));
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
      const automationHealth = await localGet('/threads/automation/health', {
        headers: { 'x-cfe-automation-token': AUTOMATION_TOKEN }
      });
      console.log('[THREADS_AUTOMATION_GATEWAY_TEST]', JSON.stringify({
        status: automationHealth.status,
        ok: automationHealth.data?.ok === true,
        configured: automationHealth.data?.configured === true,
        service: automationHealth.data?.service || null,
        primarySource: automationHealth.data?.primary_source || null,
        allowedRouteCount: Array.isArray(automationHealth.data?.allowed_routes) ? automationHealth.data.allowed_routes.length : 0
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

setTimeout(async () => {
  try {
    const health = await externalGet('/health');
    console.log('[EXTERNAL_HEALTH_CONTRACT_TEST]', JSON.stringify({
      status: health.status,
      ok: health.data?.ok === true,
      configured: health.data?.configured === true,
      scoringVersion: health.data?.scoringVersion || null,
      service: health.data?.service || null,
      passed: health.status === 200 && health.data?.ok === true && health.data?.configured === true && health.data?.scoringVersion === 'expected-profit-v3'
    }));

    let plan = null;
    const waits = [0, 2000, 5000];
    for (let i = 0; i < waits.length; i++) {
      if (waits[i]) await new Promise(resolve => setTimeout(resolve, waits[i]));
      plan = await externalGet('/daily-plan');
      const retryable = plan.status === 503 || plan.data?.retryable === true;
      if (plan.status === 200 && plan.data?.ok === true) break;
      if (!retryable) break;
      await externalGet('/health').catch(() => null);
    }
    const candidates = Array.isArray(plan?.data?.candidates) ? plan.data.candidates : [];
    const required = ['productName','score','expectedProfitScore','confidence','price','reviewCount','reviewAverage','theme','buzzMatchTerms','affiliateUrl','priors'];
    const validContractCount = candidates.filter(c => required.every(k => c?.[k] !== undefined && c?.[k] !== null)).length;
    const affiliateUrlValidCount = candidates.filter(c => typeof c?.affiliateUrl === 'string' && /^https?:\/\//.test(c.affiliateUrl)).length;
    console.log('[EXTERNAL_DAILY_PLAN_CONTRACT_TEST]', JSON.stringify({
      status: plan?.status ?? null,
      ok: plan?.data?.ok === true,
      scoringVersion: plan?.data?.scoringVersion || null,
      source: plan?.data?.source || null,
      stale: plan?.data?.stale === true,
      candidateCount: candidates.length,
      validContractCount,
      affiliateUrlValidCount,
      passed: plan?.status === 200 && plan?.data?.ok === true && plan?.data?.scoringVersion === 'expected-profit-v3' && candidates.length >= 20 && validContractCount >= 20 && affiliateUrlValidCount >= 20
    }));

    const diag = await externalGet('/diagnostics/daily-plan');
    console.log('[EXTERNAL_DAILY_PLAN_DIAGNOSTICS_TEST]', JSON.stringify({
      status: diag.status,
      configured: diag.data?.configured === true,
      rakutenApi: diag.data?.rakutenApi || null,
      candidateGeneration: diag.data?.candidateGeneration || null,
      expectedProfitEngine: diag.data?.expectedProfitEngine || null,
      candidateCount: diag.data?.candidateCount ?? null,
      lastSuccessfulPlanAt: diag.data?.lastSuccessfulPlanAt || null,
      lastError: diag.data?.lastError || null,
      selfTests: diag.data?.selfTests || null
    }));
  } catch (e) {
    console.error('[EXTERNAL_DAILY_PLAN_CONTRACT_TEST]', JSON.stringify({ passed:false, error:String(e?.message || e) }));
  }
}, 9000);

setInterval(async () => {
  if (supabaseSyncRunning) return;
  try {
    const evaluation = await localGet('/threads/evaluation-data?days=7');
    await syncEvaluationResult(evaluation, 'HOURLY_7D');
  } catch (e) {
    console.error('[SUPABASE_THREADS_SYNC_INTERVAL]', JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}, 60 * 60 * 1000);
