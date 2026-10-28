import http from 'node:http';
import { URL } from 'node:url';

const PORT = process.env.PORT || 10000;
const RAKUTEN_APPLICATION_ID = process.env.RAKUTEN_APPLICATION_ID;
const RAKUTEN_ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;

const API_BASE = 'https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601';

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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'cashflowengine-rakuten-bridge',
        configured: Boolean(RAKUTEN_APPLICATION_ID && RAKUTEN_ACCESS_KEY && RAKUTEN_AFFILIATE_ID && BRIDGE_TOKEN)
      });
    }

    if (url.pathname !== '/search') {
      return json(res, 404, { error: 'not_found' });
    }

    if (!authOk(req)) {
      return json(res, 401, { error: 'unauthorized' });
    }

    if (!RAKUTEN_APPLICATION_ID || !RAKUTEN_ACCESS_KEY || !RAKUTEN_AFFILIATE_ID) {
      return json(res, 503, { error: 'rakuten_credentials_not_configured' });
    }

    const keyword = (url.searchParams.get('keyword') || '').trim();
    if (!keyword) {
      return json(res, 400, { error: 'keyword_required' });
    }

    const params = new URLSearchParams({
      applicationId: RAKUTEN_APPLICATION_ID,
      accessKey: RAKUTEN_ACCESS_KEY,
      affiliateId: RAKUTEN_AFFILIATE_ID,
      keyword,
      format: 'json',
      hits: String(Math.min(Math.max(Number(url.searchParams.get('hits') || 10), 1), 30)),
      sort: url.searchParams.get('sort') || '-reviewCount',
      availability: '1'
    });

    const minPrice = url.searchParams.get('minPrice');
    const maxPrice = url.searchParams.get('maxPrice');
    const genreId = url.searchParams.get('genreId');
    if (minPrice) params.set('minPrice', minPrice);
    if (maxPrice) params.set('maxPrice', maxPrice);
    if (genreId) params.set('genreId', genreId);

    const upstream = await fetch(`${API_BASE}?${params.toString()}`);
    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return json(res, upstream.status, {
        error: 'rakuten_api_error',
        status: upstream.status,
        details: data
      });
    }

    const items = (data.Items || []).map((entry) => {
      const item = entry.Item || entry;
      return {
        itemName: item.itemName,
        itemPrice: item.itemPrice,
        itemUrl: item.itemUrl,
        affiliateUrl: item.affiliateUrl,
        imageUrl: item.mediumImageUrls?.[0]?.imageUrl || item.smallImageUrls?.[0]?.imageUrl || null,
        reviewCount: item.reviewCount,
        reviewAverage: item.reviewAverage,
        shopName: item.shopName,
        shopCode: item.shopCode,
        itemCode: item.itemCode,
        genreId: item.genreId,
        pointRate: item.pointRate,
        postageFlag: item.postageFlag,
        availability: item.availability
      };
    });

    return json(res, 200, {
      keyword,
      count: items.length,
      page: data.page,
      pageCount: data.pageCount,
      hits: data.hits,
      items
    });
  } catch (error) {
    return json(res, 500, { error: 'internal_error', message: String(error?.message || error) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Rakuten bridge listening on ${PORT}`);
});
