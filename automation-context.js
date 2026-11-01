import http from 'node:http';
import { URL } from 'node:url';
import { loadDailyPlanLkg } from './supabase-store.js';

const PORT = Number(process.env.PORT || 10000);
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const PREDICTION_EVALUATION_WINDOW_HOURS = 24;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function jstDateKey(input = new Date()) {
  return new Date(input.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function normalizePredictionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot || null;
  const objectiveRole = snapshot.objective_role || snapshot.content_type || null;
  const allocationMode = snapshot.allocation_mode || snapshot.portfolio_role || snapshot.signal_type || null;
  const expectedViews24h = snapshot.expected_views_24h ?? snapshot.expected_views ?? null;
  return {
    ...snapshot,
    objective_role: objectiveRole,
    allocation_mode: allocationMode,
    expected_views_24h: expectedViews24h,
    evaluation_window_hours: Number(snapshot.evaluation_window_hours || PREDICTION_EVALUATION_WINDOW_HOURS),
    prediction_schema_version: snapshot.prediction_schema_version || 'prediction-v2-market-plus-calibration'
  };
}

function normalizeThreadsEvaluation(result) {
  if (!result || typeof result !== 'object') return result;
  const data = result.data || {};
  const posts = (Array.isArray(data.posts) ? data.posts : []).map(post => ({
    ...post,
    prediction_snapshot: normalizePredictionSnapshot(post?.prediction_snapshot)
  }));
  return { ...result, data: { ...data, posts } };
}

function deriveThreadsToday(threadsEvaluation) {
  const source = threadsEvaluation?.data || {};
  const key = jstDateKey();
  const posts = (Array.isArray(source.posts) ? source.posts : []).filter(p => String(p?.post_timestamp || '').slice(0, 10) === key);
  const failed = posts.filter(p => p?.insight_fetch_ok === false).length;
  return {
    status: threadsEvaluation?.status || 0,
    data: {
      ok: source.ok === true,
      account: source.account || null,
      target_account: source.target_account || null,
      days: 1,
      date: key,
      timezone: 'Asia/Tokyo',
      post_count: posts.length,
      threads_data_source: source.threads_data_source || source.source || null,
      source: source.source || source.threads_data_source || null,
      fetched_at: source.fetched_at || null,
      insight_fetch_failures: failed,
      derived_from: 'threads_evaluation_7d_jst_filter',
      posts
    }
  };
}

async function localJson(path, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}${path}`, { signal: controller.signal });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; }
    catch { data = { ok:false, error:'invalid_json_response', raw:text.slice(0, 1000) }; }
    return { status: response.status, data };
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

function section(title, id, result) {
  return `<section id="${id}"><h2>${escapeHtml(title)}</h2><p>HTTP status: ${Number(result?.status || 0)}</p><pre>${escapeHtml(JSON.stringify(result?.data || {}, null, 2))}</pre></section>`;
}

const nativeCreateServer = http.createServer.bind(http);
http.createServer = function automationContextCreateServer(listener) {
  return nativeCreateServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);

      if (url.pathname === '/automation/lkg-self-test' && req.method === 'GET') {
        const cached = await loadDailyPlanLkg();
        const generatedMs = Date.parse(cached?.plan?.generatedAt || cached?.eventTime || 0);
        const ageMs = Number.isFinite(generatedMs) ? Date.now() - generatedMs : Infinity;
        const ageMinutes = Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 60000)) : null;
        const candidates = Array.isArray(cached?.plan?.candidates) ? cached.plan.candidates : [];
        const validAffiliateCount = candidates.filter(x => typeof x?.affiliateUrl === 'string' && /^https?:\/\//.test(x.affiliateUrl)).length;
        const fresh = ageMinutes !== null && ageMinutes <= 1440;
        const result = {
          ok: Boolean(cached?.plan && fresh && candidates.length >= 20 && validAffiliateCount >= 20),
          test: 'simulated_rakuten_timeout_to_persisted_lkg',
          simulatedFailure: { error:'expected_profit_plan_unavailable', reason:'rakuten_api_timeout', retryable:true },
          persistedLkg: {
            found: Boolean(cached?.plan), scoringVersion: cached?.plan?.scoringVersion || null,
            generatedAt: cached?.plan?.generatedAt || cached?.eventTime || null,
            ageMinutes, freshWithin24h:fresh, candidateCount:candidates.length, affiliateUrlValidCount:validAffiliateCount
          },
          recoveryDecision: cached?.plan && fresh && candidates.length >= 20 && validAffiliateCount >= 20
            ? 'serve_last_known_good_as_stale_degraded_candidate'
            : 'return_structured_error_and_hold_revenue_post'
        };
        res.writeHead(result.ok ? 200 : 503, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'});
        res.end(JSON.stringify(result));
        return;
      }

      if (url.pathname === '/automation/daily-context' && req.method === 'GET') {
        const [health, plan, threadsHealth, rawThreadsEvaluation, diagnostics, gatewayStatus] = await Promise.all([
          localJson('/health'), localJson('/daily-plan'), localJson('/threads/health'),
          localJson('/threads/evaluation-data?days=7'), localJson('/diagnostics/daily-plan'), localJson('/automation/gateway-status')
        ]);
        const threadsEvaluation = normalizeThreadsEvaluation(rawThreadsEvaluation);
        const threadsToday = deriveThreadsToday(threadsEvaluation);
        const candidates = Array.isArray(plan?.data?.candidates) ? plan.data.candidates : [];
        const affiliateUrlValidCount = candidates.filter(x => typeof x?.affiliateUrl === 'string' && /^https?:\/\//.test(x.affiliateUrl)).length;
        const threadsDataSource = threadsEvaluation.data?.threads_data_source || threadsEvaluation.data?.source || null;
        const insightFetchFailures = Number(threadsEvaluation.data?.insight_fetch_failures || 0);
        const planOk = health.status === 200 && health.data?.ok === true && health.data?.configured === true &&
          plan.status === 200 && plan.data?.ok === true && plan.data?.scoringVersion === 'expected-profit-v3' &&
          candidates.length >= 20 && affiliateUrlValidCount >= 20;
        const threadsOk = threadsHealth.status === 200 && threadsHealth.data?.configured === true &&
          threadsEvaluation.status === 200 && threadsEvaluation.data?.ok === true &&
          threadsDataSource === 'meta_official' && insightFetchFailures === 0;
        const diagnosticsOk = diagnostics.status === 200 && diagnostics.data?.candidateGeneration === 'ok' && diagnostics.data?.expectedProfitEngine === 'ok';
        const gatewayOk = gatewayStatus.status === 200 && gatewayStatus.data?.configured === true;

        const summary = {
          ok: planOk && threadsOk && diagnosticsOk && gatewayOk,
          generatedAt: new Date().toISOString(),
          healthStatus: health.status,
          configured: health.data?.configured === true,
          scoringVersion: plan.data?.scoringVersion || health.data?.scoringVersion || null,
          predictionSchemaVersion: 'prediction-v2-market-plus-calibration',
          predictionEvaluationWindowHours: PREDICTION_EVALUATION_WINDOW_HOURS,
          objectiveRoleField: 'objective_role',
          allocationModeField: 'allocation_mode',
          dailyPlanStatus: plan.status,
          dailyPlanSource: plan.data?.source || null,
          stale: plan.data?.stale === true,
          ageMinutes: plan.data?.ageMinutes ?? null,
          candidateCount: candidates.length,
          affiliateUrlValidCount,
          threadsHealthStatus: threadsHealth.status,
          threadsConfigured: threadsHealth.data?.configured === true,
          threadsDataSource,
          threadsPostCount7d: threadsEvaluation.data?.post_count ?? null,
          threadsTodayPostCount: threadsToday.data?.post_count ?? null,
          threadsTodayDate: threadsToday.data?.date || null,
          insightFetchFailures,
          threadsTodayInsightFetchFailures: threadsToday.data?.insight_fetch_failures ?? null,
          diagnosticsStatus: diagnostics.status,
          candidateGeneration: diagnostics.data?.candidateGeneration || null,
          expectedProfitEngine: diagnostics.data?.expectedProfitEngine || null,
          rakutenApi: diagnostics.data?.rakutenApi || null,
          lastError: diagnostics.data?.lastError || null,
          automationGatewayConfigured: gatewayStatus.data?.configured === true,
          planOk, threadsOk, diagnosticsOk, gatewayOk
        };

        const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cash Flow Engine Daily Context</title></head><body><main><h1>Cash Flow Engine Daily Context</h1><p>This page is an Automation-compatible read-only mirror of the canonical Cash Flow Engine bridge data. It contains no API keys or secrets.</p><section id="summary"><h2>Summary</h2><pre>${escapeHtml(JSON.stringify(summary, null, 2))}</pre></section>${section('Rakuten / Expected Profit Health','health',health)}${section('Expected Profit Daily Plan','daily-plan',plan)}${section('Daily Plan Diagnostics','diagnostics',diagnostics)}${section('Automation Gateway Status','automation-gateway',gatewayStatus)}${section('Threads Health','threads-health',threadsHealth)}${section('Threads Today (JST derived from canonical 7-day data)','threads-today',threadsToday)}${section('Threads Evaluation 7 Days','threads-evaluation',threadsEvaluation)}</main></body></html>`;

        res.writeHead(summary.ok ? 200 : 503, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','Access-Control-Allow-Origin':'*','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
        res.end(html);
        return;
      }
    } catch (error) {
      if (req.url?.startsWith('/automation/')) {
        res.writeHead(500, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' });
        res.end(`<!doctype html><html><body><h1>Cash Flow Engine Automation Context Error</h1><pre>${escapeHtml(JSON.stringify({ ok:false, error:'automation_context_failed', message:String(error?.message || error) }, null, 2))}</pre></body></html>`);
        return;
      }
    }
    return listener(req, res);
  });
};

await import('./server-runtime.js');
