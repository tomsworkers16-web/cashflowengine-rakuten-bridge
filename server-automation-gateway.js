import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 10000);
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';
const AUTOMATION_TOKEN = process.env.CFE_AUTOMATION_TOKEN || '';
const LOCAL_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 96 * 1024;

const ROUTES = new Map([
  ['/threads/automation/me', '/threads/me'],
  ['/threads/automation/replies', '/threads/replies'],
  ['/threads/automation/conversation', '/threads/conversation'],
  ['/threads/automation/insights', '/threads/insights'],
  ['/threads/automation/post', '/threads/post'],
  ['/threads/automation/reply', '/threads/reply']
]);

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(JSON.stringify(body));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function sendHtml(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  });
  res.end(body);
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (!aa.length || aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function automationAuthOk(req, url, bodyToken = '') {
  if (!AUTOMATION_TOKEN || !BRIDGE_TOKEN) return false;
  const headerToken = req.headers['x-cfe-automation-token'];
  const queryToken = url.searchParams.get('automation_token');
  return safeEqual(headerToken || bodyToken || queryToken || '', AUTOMATION_TOKEN);
}

async function readRawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('request_body_too_large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function localPost(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOCAL_TIMEOUT_MS);
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}${path}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BRIDGE_TOKEN}`,
        'X-CFE-Auth-Scope': 'threads-automation-console'
      },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  } catch (error) {
    return {
      status: 599,
      data: {
        ok: false,
        error: 'internal_forward_failed',
        reason: error?.name === 'AbortError' ? 'timeout' : 'internal_error'
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

function postConsolePage(result = null) {
  const resultBlock = result
    ? `<section><h2>Result</h2><pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre></section>`
    : '';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Cash Flow Engine Automation Post Console</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.5}label{display:block;margin-top:16px;font-weight:600}input,textarea,select{width:100%;box-sizing:border-box;padding:10px;margin-top:6px}textarea{min-height:150px}button{margin-top:18px;padding:10px 18px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:12px;border-radius:8px}.note{font-size:13px;color:#555}</style></head><body><h1>Cash Flow Engine Automation Post Console</h1><p class="note">Credential is submitted in the POST body and is never echoed. Use validate mode for a non-posting end-to-end authentication test.</p><form method="post" action="/automation/post-console"><label>Automation credential<input type="password" name="automation_token" autocomplete="off" required></label><label>Mode<select name="mode"><option value="validate">Validate only (no post)</option><option value="publish">Publish</option></select></label><label>Threads text<textarea name="text" maxlength="500" required></textarea></label><label>Prediction JSON<textarea name="prediction" placeholder='{"expected_views":100,"expected_ctr":0.01}'></textarea></label><button type="submit">Execute</button></form>${resultBlock}</body></html>`;
}

const previousCreateServer = http.createServer.bind(http);
http.createServer = function automationGatewayCreateServer(listener) {
  return previousCreateServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);

    if (url.pathname === '/automation/gateway-status' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: Boolean(AUTOMATION_TOKEN && BRIDGE_TOKEN),
        configured: Boolean(AUTOMATION_TOKEN && BRIDGE_TOKEN),
        service: 'threads-automation-gateway',
        browserConsole: '/automation/post-console',
        primary_source: 'meta_official'
      });
    }

    if (url.pathname === '/automation/post-console' && req.method === 'GET') {
      return sendHtml(res, 200, postConsolePage());
    }

    if (url.pathname === '/automation/post-console' && req.method === 'POST') {
      try {
        const raw = await readRawBody(req);
        const form = new URLSearchParams(raw);
        const bodyToken = form.get('automation_token') || '';
        if (!automationAuthOk(req, url, bodyToken)) {
          return sendHtml(res, 401, postConsolePage({ ok:false, error:'unauthorized' }));
        }
        const mode = form.get('mode') === 'publish' ? 'publish' : 'validate';
        const text = String(form.get('text') || '');
        if (!text) return sendHtml(res, 400, postConsolePage({ ok:false, error:'text_required' }));
        if (text.length > 500) return sendHtml(res, 400, postConsolePage({ ok:false, error:'text_too_long' }));
        let prediction = undefined;
        const rawPrediction = String(form.get('prediction') || '').trim();
        if (rawPrediction) {
          try { prediction = JSON.parse(rawPrediction); }
          catch { return sendHtml(res, 400, postConsolePage({ ok:false, error:'invalid_prediction_json' })); }
        }
        if (mode === 'validate') {
          return sendHtml(res, 200, postConsolePage({
            ok: true,
            mode: 'validate',
            authenticated: true,
            textLength: text.length,
            predictionValid: prediction === undefined || (prediction && typeof prediction === 'object'),
            posted: false
          }));
        }
        const forwarded = await localPost('/threads/post', { text, ...(prediction !== undefined ? { prediction } : {}) });
        const safeResult = {
          ok: forwarded.status === 200 && forwarded.data?.ok === true,
          mode: 'publish',
          posted: forwarded.status === 200 && forwarded.data?.ok === true,
          status: forwarded.status,
          id: forwarded.data?.id || null,
          prediction_snapshot_saved: forwarded.data?.prediction_snapshot_saved === true,
          prediction_snapshot_persisted: forwarded.data?.prediction_snapshot_persisted === true,
          ...(forwarded.status === 200 ? {} : { error: forwarded.data?.error || 'publish_failed' })
        };
        return sendHtml(res, safeResult.ok ? 200 : 502, postConsolePage(safeResult));
      } catch (error) {
        return sendHtml(res, Number(error?.status || 500), postConsolePage({ ok:false, error:String(error?.message || 'post_console_error') }));
      }
    }

    if (url.pathname === '/threads/automation/health' && req.method === 'GET') {
      const configured = Boolean(AUTOMATION_TOKEN && BRIDGE_TOKEN);
      if (!configured) {
        return sendJson(res, 503, {
          ok: false,
          configured: false,
          error: 'automation_gateway_not_configured',
          primary_source: 'meta_official'
        });
      }
      if (!automationAuthOk(req, url)) {
        return sendJson(res, 401, { ok: false, error: 'unauthorized' });
      }
      return sendJson(res, 200, {
        ok: true,
        configured: true,
        service: 'threads-automation-gateway',
        primary_source: 'meta_official',
        allowed_routes: [...ROUTES.keys()]
      });
    }

    const mapped = ROUTES.get(url.pathname);
    if (!mapped) return listener(req, res);

    if (!automationAuthOk(req, url)) {
      return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    }

    url.searchParams.delete('automation_token');
    url.pathname = mapped;
    req.url = `${url.pathname}${url.search}`;
    req.headers.authorization = `Bearer ${BRIDGE_TOKEN}`;
    req.headers['x-cfe-auth-scope'] = 'threads-automation';
    return listener(req, res);
  });
};

await import('./server-threads-gateway.js');
