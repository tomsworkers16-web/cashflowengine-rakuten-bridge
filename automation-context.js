import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 10000);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

async function localJson(path, timeoutMs = 15000) {
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
      if (url.pathname === '/automation/daily-context' && req.method === 'GET') {
        const [health, plan, threadsHealth, threadsEvaluation, diagnostics] = await Promise.all([
          localJson('/health'),
          localJson('/daily-plan'),
          localJson('/threads/health'),
          localJson('/threads/evaluation-data?days=7'),
          localJson('/diagnostics/daily-plan')
        ]);

        const candidates = Array.isArray(plan?.data?.candidates) ? plan.data.candidates : [];
        const affiliateUrlValidCount = candidates.filter(x => typeof x?.affiliateUrl === 'string' && /^https?:\/\//.test(x.affiliateUrl)).length;
        const summary = {
          ok: health.status === 200 && health.data?.ok === true && health.data?.configured === true &&
              plan.status === 200 && plan.data?.ok === true && plan.data?.scoringVersion === 'expected-profit-v3' && candidates.length >= 20,
          generatedAt: new Date().toISOString(),
          healthStatus: health.status,
          configured: health.data?.configured === true,
          scoringVersion: plan.data?.scoringVersion || health.data?.scoringVersion || null,
          dailyPlanStatus: plan.status,
          dailyPlanSource: plan.data?.source || null,
          stale: plan.data?.stale === true,
          ageMinutes: plan.data?.ageMinutes ?? null,
          candidateCount: candidates.length,
          affiliateUrlValidCount,
          threadsHealthStatus: threadsHealth.status,
          threadsConfigured: threadsHealth.data?.configured === true,
          threadsDataSource: threadsEvaluation.data?.threads_data_source || threadsEvaluation.data?.source || null,
          threadsPostCount: threadsEvaluation.data?.post_count ?? null,
          diagnosticsStatus: diagnostics.status
        };

        const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cash Flow Engine Daily Context</title></head><body><main><h1>Cash Flow Engine Daily Context</h1><p>This page is an Automation-compatible read-only mirror of the canonical Cash Flow Engine bridge data. It contains no API keys or secrets.</p><section id="summary"><h2>Summary</h2><pre>${escapeHtml(JSON.stringify(summary, null, 2))}</pre></section>${section('Rakuten / Expected Profit Health','health',health)}${section('Expected Profit Daily Plan','daily-plan',plan)}${section('Daily Plan Diagnostics','diagnostics',diagnostics)}${section('Threads Health','threads-health',threadsHealth)}${section('Threads Evaluation 7 Days','threads-evaluation',threadsEvaluation)}</main></body></html>`;

        res.writeHead(summary.ok ? 200 : 503, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
          'X-Robots-Tag': 'noindex, nofollow'
        });
        res.end(html);
        return;
      }
    } catch (error) {
      if (req.url?.startsWith('/automation/daily-context')) {
        res.writeHead(500, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' });
        res.end(`<!doctype html><html><body><h1>Cash Flow Engine Daily Context Error</h1><pre>${escapeHtml(JSON.stringify({ ok:false, error:'daily_context_failed', message:String(error?.message || error) }, null, 2))}</pre></body></html>`);
        return;
      }
    }
    return listener(req, res);
  });
};

await import('./server-runtime.js');
