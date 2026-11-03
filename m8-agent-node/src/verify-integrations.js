import { URL } from 'node:url';

const env = process.env;
const THREADS_API_BASE = env.THREADS_API_BASE || 'https://graph.threads.net/v1.0';
const THREADS_ACCESS_TOKEN = env.THREADS_ACCESS_TOKEN || '';
const RAKUTEN_APPLICATION_ID = env.RAKUTEN_APPLICATION_ID || '';
const RAKUTEN_ACCESS_KEY = env.RAKUTEN_ACCESS_KEY || '';
const RAKUTEN_AFFILIATE_ID = env.RAKUTEN_AFFILIATE_ID || '';
const RAKUTEN_API_BASE = env.RAKUTEN_API_BASE || 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const KEYWORD = 'キッチン 便利グッズ';

class HttpError extends Error {
  constructor(status, body) {
    const detail = body?.error_description || body?.error?.message || body?.error || body?.message || `HTTP ${status}`;
    super(String(detail));
    this.status = status;
    this.body = body;
  }
}

async function readJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 300) }; }
    if (!res.ok) throw new HttpError(res.status, body);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyThreads() {
  if (!THREADS_ACCESS_TOKEN) throw new Error('THREADS_ACCESS_TOKEN is missing');
  const url = new URL(`${THREADS_API_BASE}/me`);
  url.searchParams.set('fields', 'id,username,name');
  url.searchParams.set('access_token', THREADS_ACCESS_TOKEN);
  const data = await readJson(url);
  return { ok: true, username: data?.username || null, idPresent: Boolean(data?.id) };
}

async function verifyRakuten() {
  if (!RAKUTEN_APPLICATION_ID || !RAKUTEN_ACCESS_KEY || !RAKUTEN_AFFILIATE_ID) {
    throw new Error('Rakuten credentials are missing');
  }
  const url = new URL(RAKUTEN_API_BASE);
  url.searchParams.set('applicationId', RAKUTEN_APPLICATION_ID);
  url.searchParams.set('accessKey', RAKUTEN_ACCESS_KEY);
  url.searchParams.set('affiliateId', RAKUTEN_AFFILIATE_ID);
  url.searchParams.set('keyword', KEYWORD);
  url.searchParams.set('format', 'json');
  url.searchParams.set('hits', '3');
  url.searchParams.set('availability', '1');
  const data = await readJson(url);
  const items = data?.Items || data?.items || [];
  return { ok: true, keyword: KEYWORD, resultCount: items.length };
}

function safeError(error) {
  const out = { ok: false, error: error.message };
  if (error?.status) out.status = error.status;
  if (error?.body?.error) out.rakutenError = String(error.body.error).slice(0, 200);
  if (error?.body?.error_description) out.rakutenDescription = String(error.body.error_description).slice(0, 300);
  if (error?.body?.raw) out.raw = String(error.body.raw).slice(0, 300);
  return out;
}

const result = { mode: 'dry-run', postingPerformed: false, threads: null, rakuten: null };
try {
  result.threads = await verifyThreads();
} catch (error) {
  result.threads = safeError(error);
}
try {
  result.rakuten = await verifyRakuten();
} catch (error) {
  result.rakuten = safeError(error);
}
console.log(JSON.stringify(result, null, 2));
process.exit(result.threads?.ok && result.rakuten?.ok ? 0 : 1);
