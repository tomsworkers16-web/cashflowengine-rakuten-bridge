import http from 'node:http';
import { URL } from 'node:url';

const PORT = process.env.PORT || 10000;
const RAKUTEN_APPLICATION_ID = process.env.RAKUTEN_APPLICATION_ID;
const RAKUTEN_ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;

const API_BASE = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
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
  return {
    meta: {
      page: data.page,
      pageCount: data.pageCount,
      hits: data.hits,
      count: data.count
    },
    items: rawItems.map(normalizeItem)
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'cashflowengine-rakuten-bridge',
        configured: configured(),
        apiVersion: '20260701'
      });
    }

    if (!['/search', '/recommend'].includes(url.pathname)) {
      return json(res, 404, { error: 'not_found' });
    }

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
      const ranked = result.items
        .map((item) => ({ ...item, ...scoreItem(item) }))
        .sort((a, b) => b.score - a.score);

      return json(res, 200, {
        keyword,
        count: ranked.length,
        scoringVersion: 'rakumitsu-v1',
        items: ranked
      });
    }

    return json(res, 200, {
      keyword,
      count: result.items.length,
      ...result.meta,
      items: result.items
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    return json(res, status, {
      error: status === 500 ? 'internal_error' : 'rakuten_api_error',
      status,
      message: String(error?.message || error),
      ...(error?.details ? { details: error.details } : {})
    });
  }
});

async function runSelfTest() {
  if (!configured()) {
    console.log('[SELFTEST] skipped: credentials not fully configured');
    return;
  }
  try {
    const result = await searchRakuten({ keyword: 'キッチン 便利グッズ', hits: 1, sort: '-reviewCount' });
    const first = result.items[0];
    console.log('[SELFTEST]', JSON.stringify({
      ok: Boolean(first),
      itemReturned: Boolean(first),
      hasAffiliateUrl: Boolean(first?.affiliateUrl),
      itemName: first?.itemName || null,
      reviewCount: first?.reviewCount || 0,
      reviewAverage: first?.reviewAverage || 0
    }));
  } catch (error) {
    console.error('[SELFTEST]', JSON.stringify({
      ok: false,
      status: error?.status || null,
      message: String(error?.message || error),
      details: error?.details || null
    }));
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Rakuten bridge listening on ${PORT}`);
  setTimeout(runSelfTest, 1500);
});
