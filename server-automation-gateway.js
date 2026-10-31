import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 10000);
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';
const AUTOMATION_TOKEN = process.env.CFE_AUTOMATION_TOKEN || '';

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
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(body));
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (!aa.length || aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function automationAuthOk(req, url) {
  if (!AUTOMATION_TOKEN || !BRIDGE_TOKEN) return false;
  const headerToken = req.headers['x-cfe-automation-token'];
  const queryToken = url.searchParams.get('automation_token');
  return safeEqual(headerToken || queryToken || '', AUTOMATION_TOKEN);
}

const previousCreateServer = http.createServer.bind(http);
http.createServer = function automationGatewayCreateServer(listener) {
  return previousCreateServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);

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

    // Remove the automation token before forwarding so downstream application
    // logic and application logs never receive it. The Automation credential is
    // converted server-side into the existing admin bridge credential and can
    // reach only the explicit allow-list above.
    url.searchParams.delete('automation_token');
    url.pathname = mapped;
    req.url = `${url.pathname}${url.search}`;
    req.headers.authorization = `Bearer ${BRIDGE_TOKEN}`;
    req.headers['x-cfe-auth-scope'] = 'threads-automation';
    return listener(req, res);
  });
};

await import('./server-threads-gateway.js');
