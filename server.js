import http from 'node:http';
import { URL } from 'node:url';

const PORT = process.env.PORT || 10000;

const RAKUTEN_APPLICATION_ID = process.env.RAKUTEN_APPLICATION_ID;
const RAKUTEN_ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;

const THREADS_API_BASE = process.env.THREADS_API_BASE || 'https://graph.threads.net/v1.0';
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const THREADS_SMOKE_THREAD_ID = process.env.THREADS_SMOKE_THREAD_ID;

const API_BASE = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const DAILY_THEMES = [
  '便利グッズ', '時短 家事', 'キッチン 便利', '収納 便利', '掃除 便利グッズ',
  'スマホ 便利グッズ', '洗濯 便利グッズ', '防寒 便利グッズ', '料理 時短', '新生活 便利グッズ'
];
let dailyPlanCache = null;
let dailyPlanGeneratedAt = null;

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(body));
}

function authOk(req) {
  if (!BRIDGE_TOKEN) return false;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${BRIDGE_TOKEN}`;
}

function configured() {
  return Boolean(RAKUTEN_APPLICATION_ID && RAKUTEN_ACCESS_KEY && RAKUTEN_AFFILIATE_ID && BRIDGE_TOKEN);
}

function threadsConfigured() {
  return Boolean(THREADS_ACCESS_TOKEN && THREADS_USER_ID && BRIDGE_TOKEN);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('invalid_json');
    error.status = 400;
    throw error;
  }
}

async function threadsRequest(path, { method = 'GET', params = {} } = {}) {
  if (!THREADS_ACCESS_TOKEN) {
    const error = new Error('threads_access_token_not_configured');
    error.status = 503;
    throw error;
  }

  const url = new URL(`${THREADS_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  url.searchParams.set('access_token', THREADS_ACCESS_TOKEN);

  const upstream = await fetch(url, { method });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const error = new Error(`Threads API error ${upstream.status}`);
    error.status = upstream.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function threadsSelftest() {
  if (!threadsConfigured()) return { ok: false, configured: false };
  try {
    const me = await threadsRequest('/me', {
      params: { fields: 'id,username,name,threads_profile_picture_url,threads_biography' }
    });
    return { ok: true, configured: true, userId: me?.id || THREADS_USER_ID, username: me?.username || null };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      status: error?.status || 500,
      message: String(error?.message || error),
      details: error?.details || null
    };
  }
}

async function threadsReadSmokeTest(threadId) {
  const result = {
    ok: false,
    threadId,
    replies: { ok: false },
    conversation: { ok: false },
    insights: { ok: false }
  };

  try {
    const replies = await threadsRequest(`/${encodeURIComponent(threadId)}/replies`, {
      params: { fields: 'id,text,timestamp,username,permalink', reverse: 'false' }
    });
    result.replies = { ok: true, count: Array.isArray(replies?.data) ? replies.data.length : 0 };
  } catch (error) {
    result.replies = { ok: false, status: error?.status || 500, message: String(error?.message || error), details: error?.details || null };
  }

  try {
    const conversation = await threadsRequest(`/${encodeURIComponent(threadId)}/conversation`, {
      params: { fields: 'id,text,timestamp,username,permalink', reverse: 'false' }
    });
    result.conversation = { ok: true, count: Array.isArray(conversation?.data) ? conversation.data.length : 0 };
  } catch (error) {
    result.conversation = { ok: false, status: error?.status || 500, message: String(error?.message || error), details: error?.details || null };
  }

  try {
    const insights = await threadsRequest(`/${encodeURIComponent(threadId)}/insights`, {
      params: { metric: 'views,likes,replies,reposts,quotes,shares' }
    });
    const rows = Array.isArray(insights?.data) ? insights.data : [];
    result.insights = {
      ok: true,
      count: rows.length,
      metrics: rows.map((x) => x?.name).filter(Boolean)
    };
  } catch (error) {
    result.insights = { ok: false, status: error?.status || 500, message: String(error?.message || error), details: error?.details || null };
  }

  result.ok = Boolean(result.replies.ok && result.conversation.ok && result.insights.ok);
  return result;
}

async function publishThreadsText(text, replyToId = null) {
  if (!text || typeof text !== 'string') {
    const error = new Error('text_required');
    error.status = 400;
    throw error;
  }
  if (text.length > 500) {
    const error = new Error('text_too_long');
    error.status = 400;
    throw error;
  }

  const params = {
    media_type: 'TEXT',
    text,
    auto_publish_text: 'true'
  };
  if (replyToId) params.reply_to_id = replyToId;

  const result = await threadsRequest('/me/threads', { method: 'POST', params });
  return {
    ok: true,
    id: result?.id || null,
    replyToId: replyToId || null
  };
}

function normalizeItem(entry) {
  const item = entry?.Item || entry?.item || entry || {};
  const imageList = item.mediumImageUrls || item.smallImageUrls || [];
  const firstImage = imageList[0];
  const imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.imageUrl || null;
  return {
    itemName: item.itemName || null,
    itemPrice: Number(item.itemPrice || 0) || null,
    itemUrl: item.itemUrl || null,
    affiliateUrl: item.affiliateUrl || null,
    imageUrl,
    reviewCount: Number(item.reviewCount || 0),
    reviewAverage: Number(item.reviewAverage || 0),
    shopName: item.shopName || null,
    shopCode: item.shopCode || null,
    itemCode: item.itemCode || null,
    genreId: item.genreId || null,
    pointRate: Number(item.pointRate || 0),
    postageFlag: item.postageFlag ?? null,
    availability: item.availability ?? null
  };
}

function scoreItem(item) {
  let score = 0;
  const reasons = [];
  if (item.reviewAverage >= 4.5) { score += 28; reasons.push('高評価4.5+'); }
  else if (item.reviewAverage >= 4.2) { score += 22; reasons.push('高評価4.2+'); }
  else if (item.reviewAverage >= 4.0) { score += 16; reasons.push('評価4.0+'); }

  if (item.reviewCount >= 2000) { score += 28; reasons.push('レビュー2000+'); }
  else if (item.reviewCount >= 500) { score += 22; reasons.push('レビュー500+'); }
  else if (item.reviewCount >= 100) { score += 15; reasons.push('レビュー100+'); }
  else if (item.reviewCount >= 20) { score += 8; reasons.push('レビュー20+'); }

  const price = Number(item.itemPrice || 0);
  if (price >= 1000 && price <= 5000) { score += 20; reasons.push('衝動買いしやすい価格帯'); }
  else if (price > 5000 && price <= 10000) { score += 13; reasons.push('中価格帯'); }
  else if (price > 0 && price < 1000) { score += 10; reasons.push('低価格'); }

  if (item.postageFlag === 0 || item.postageFlag === '0') { score += 12; reasons.push('送料無料'); }
  if (item.pointRate >= 5) { score += 7; reasons.push('ポイント倍率高め'); }
  if (item.affiliateUrl) { score += 5; reasons.push('アフィリエイトURL取得済み'); }
  return { score: Math.min(score, 100), reasons };
}

async function searchRakuten({ keyword, hits = 10, sort = '-reviewCount', minPrice, maxPrice, genreId }) {
  const params = new URLSearchParams({
    applicationId: RAKUTEN_APPLICATION_ID,
    accessKey: RAKUTEN_ACCESS_KEY,
    affiliateId: RAKUTEN_AFFILIATE_ID,
    keyword,
    format: 'json',
    hits: String(Math.min(Math.max(Number(hits || 10), 1), 30)),
    sort,
    availability: '1'
  });
  if (minPrice) params.set('minPrice', String(minPrice));
  if (maxPrice) params.set('maxPrice', String(maxPrice));
  if (genreId) params.set('genreId', String(genreId));

  const upstream = await fetch(`${API_BASE}?${params.toString()}`);
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const error = new Error(`Rakuten API error ${upstream.status}`);
    error.status = upstream.status;
    error.details = data;
    throw error;
  }
  const rawItems = data.Items || data.items || [];
  return { meta: { page: data.page, pageCount: data.pageCount, hits: data.hits, count: data.count }, items: rawItems.map(normalizeItem) };
}

async function buildDailyPlan() {
  const all = [];
  const errors = [];
  for (const theme of DAILY_THEMES) {
    try {
      const result = await searchRakuten({ keyword: theme, hits: 20, sort: '-reviewCount' });
      for (const item of result.items) all.push({ theme, ...item, ...scoreItem(item) });
    } catch (error) {
      errors.push({ theme, status: error?.status || null, message: String(error?.message || error) });
    }
  }

  const seen = new Set();
  const candidates = all
    .sort((a, b) => b.score - a.score || b.reviewCount - a.reviewCount)
    .filter((item) => {
      const key = item.itemCode || item.itemUrl;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20)
    .map((item, i) => ({ rank: i + 1, ...item }));

  dailyPlanGeneratedAt = new Date().toISOString();
  dailyPlanCache = {
    ok: candidates.length > 0,
    generatedAt: dailyPlanGeneratedAt,
    scoringVersion: 'rakumitsu-v2',
    themes: DAILY_THEMES,
    candidateCount: candidates.length,
    candidates,
    errors
  };
  console.log('[DAILY_PLAN]', JSON.stringify({ generatedAt: dailyPlanGeneratedAt, candidateCount: candidates.length, top5: candidates.slice(0, 5).map(x => ({ rank: x.rank, theme: x.theme, score: x.score, itemName: x.itemName, reviewCount: x.reviewCount, reviewAverage: x.reviewAverage, itemPrice: x.itemPrice })) }));
  return dailyPlanCache;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'cashflowengine-rakuten-bridge',
        configured: configured(),
        apiVersion: '20260701',
        dailyPlanGeneratedAt,
        threads: { configured: threadsConfigured(), apiBase: THREADS_API_BASE }
      });
    }

    if (url.pathname === '/daily-plan') {
      if (!dailyPlanCache) return json(res, 503, { ok: false, error: 'daily_plan_not_ready' });
      return json(res, 200, dailyPlanCache);
    }

    if (url.pathname === '/threads/health') {
      const result = await threadsSelftest();
      return json(res, result.ok ? 200 : (result.configured ? 502 : 503), result);
    }

    if (url.pathname.startsWith('/threads/')) {
      if (!authOk(req)) return json(res, 401, { error: 'unauthorized' });
      if (!threadsConfigured()) return json(res, 503, { error: 'threads_credentials_not_configured' });

      if (url.pathname === '/threads/me' && req.method === 'GET') {
        const result = await threadsRequest('/me', {
          params: { fields: url.searchParams.get('fields') || 'id,username,name,threads_profile_picture_url,threads_biography' }
        });
        return json(res, 200, result);
      }

      if (url.pathname === '/threads/replies' && req.method === 'GET') {
        const threadId = url.searchParams.get('thread_id');
        if (!threadId) return json(res, 400, { error: 'thread_id_required' });
        const result = await threadsRequest(`/${encodeURIComponent(threadId)}/replies`, {
          params: {
            fields: url.searchParams.get('fields') || 'id,text,timestamp,username,permalink',
            reverse: url.searchParams.get('reverse') || 'false'
          }
        });
        return json(res, 200, result);
      }

      if (url.pathname === '/threads/conversation' && req.method === 'GET') {
        const threadId = url.searchParams.get('thread_id');
        if (!threadId) return json(res, 400, { error: 'thread_id_required' });
        const result = await threadsRequest(`/${encodeURIComponent(threadId)}/conversation`, {
          params: {
            fields: url.searchParams.get('fields') || 'id,text,timestamp,username,permalink',
            reverse: url.searchParams.get('reverse') || 'false'
          }
        });
        return json(res, 200, result);
      }

      if (url.pathname === '/threads/insights' && req.method === 'GET') {
        const threadId = url.searchParams.get('thread_id');
        if (!threadId) return json(res, 400, { error: 'thread_id_required' });
        const result = await threadsRequest(`/${encodeURIComponent(threadId)}/insights`, {
          params: { metric: url.searchParams.get('metric') || 'views,likes,replies,reposts,quotes,shares' }
        });
        return json(res, 200, result);
      }

      if (url.pathname === '/threads/post' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = await publishThreadsText(body.text);
        return json(res, 200, result);
      }

      if (url.pathname === '/threads/reply' && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (!body.replyToId) return json(res, 400, { error: 'replyToId_required' });
        const result = await publishThreadsText(body.text, body.replyToId);
        return json(res, 200, result);
      }

      return json(res, 404, { error: 'threads_route_not_found' });
    }

    if (!['/search', '/recommend'].includes(url.pathname)) return json(res, 404, { error: 'not_found' });
    if (!authOk(req)) return json(res, 401, { error: 'unauthorized' });
    if (!configured()) return json(res, 503, { error: 'rakuten_credentials_not_configured' });

    const keyword = (url.searchParams.get('keyword') || '').trim();
    if (!keyword) return json(res, 400, { error: 'keyword_required' });

    const result = await searchRakuten({
      keyword,
      hits: url.searchParams.get('hits') || (url.pathname === '/recommend' ? 30 : 10),
      sort: url.searchParams.get('sort') || '-reviewCount',
      minPrice: url.searchParams.get('minPrice'),
      maxPrice: url.searchParams.get('maxPrice'),
      genreId: url.searchParams.get('genreId')
    });

    if (url.pathname === '/recommend') {
      const ranked = result.items.map((item) => ({ ...item, ...scoreItem(item) })).sort((a, b) => b.score - a.score);
      return json(res, 200, { keyword, count: ranked.length, scoringVersion: 'rakumitsu-v1', items: ranked });
    }

    return json(res, 200, { keyword, count: result.items.length, ...result.meta, items: result.items });
  } catch (error) {
    const status = Number(error?.status || 500);
    return json(res, status, {
      error: status === 500 ? 'internal_error' : (String(error?.message || '').startsWith('Threads API') ? 'threads_api_error' : 'upstream_error'),
      status,
      message: String(error?.message || error),
      ...(error?.details ? { details: error.details } : {})
    });
  }
});

async function runStartupJobs() {
  if (!configured()) {
    console.log('[SELFTEST] skipped: Rakuten credentials not fully configured');
  } else {
    try {
      const result = await searchRakuten({ keyword: 'キッチン 便利グッズ', hits: 1, sort: '-reviewCount' });
      const first = result.items[0];
      console.log('[SELFTEST]', JSON.stringify({ ok: Boolean(first), itemReturned: Boolean(first), hasAffiliateUrl: Boolean(first?.affiliateUrl), itemName: first?.itemName || null, reviewCount: first?.reviewCount || 0, reviewAverage: first?.reviewAverage || 0 }));
    } catch (error) {
      console.error('[SELFTEST]', JSON.stringify({ ok: false, status: error?.status || null, message: String(error?.message || error), details: error?.details || null }));
    }

    try {
      await buildDailyPlan();
    } catch (error) {
      console.error('[DAILY_PLAN_ERROR]', String(error?.message || error));
    }
  }

  const threadsTest = await threadsSelftest();
  console.log('[THREADS_SELFTEST]', JSON.stringify(threadsTest));

  if (threadsTest.ok && THREADS_SMOKE_THREAD_ID) {
    const readSmoke = await threadsReadSmokeTest(THREADS_SMOKE_THREAD_ID);
    console.log('[THREADS_READ_SMOKE]', JSON.stringify(readSmoke));
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Cash Flow Engine bridge listening on ${PORT}`);
  setTimeout(runStartupJobs, 1500);
  setInterval(() => buildDailyPlan().catch(e => console.error('[DAILY_PLAN_ERROR]', String(e?.message || e))), 6 * 60 * 60 * 1000);
});
