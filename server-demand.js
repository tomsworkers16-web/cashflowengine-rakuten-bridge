import http from 'node:http';
import { URL } from 'node:url';

const APPLICATION_ID = process.env.RAKUTEN_APPLICATION_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
const AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID;

const SEARCH_API = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const RANKING_API = 'https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601';
const THEMES = [
  '便利グッズ','時短 家事','キッチン 便利','収納 便利','掃除 便利グッズ',
  'スマホ 便利グッズ','洗濯 便利グッズ','防寒 便利グッズ','料理 時短','新生活 便利グッズ'
];
const CACHE_MS = 6 * 60 * 60 * 1000;
let demandCache = null;
let demandGeneratedAt = 0;
let building = null;

function normalize(entry, extra = {}) {
  const item = entry?.Item || entry?.item || entry || {};
  const image = item.mediumImageUrls?.[0] || item.smallImageUrls?.[0];
  return {
    ...extra,
    itemName: item.itemName || null,
    itemPrice: Number(item.itemPrice || 0) || null,
    affiliateUrl: item.affiliateUrl || null,
    itemUrl: item.itemUrl || null,
    imageUrl: typeof image === 'string' ? image : image?.imageUrl || null,
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

function baseScore(item) {
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
  return { score, reasons };
}

function rankBoost(rank) {
  const r = Number(rank || 0);
  if (!r) return 0;
  if (r <= 10) return 25;
  if (r <= 30) return 20;
  if (r <= 100) return 14;
  if (r <= 300) return 8;
  return 4;
}

function demandScore(item) {
  const base = baseScore(item);
  const demand = rankBoost(item.rankingRank);
  const reasons = [...base.reasons];
  if (item.rankingRank) reasons.unshift(`楽天リアルタイムランキング${item.rankingRank}位`);
  return {
    score: Math.min(100, base.score + demand),
    baseScore: Math.min(100, base.score),
    demandScore: demand,
    reasons,
    demandSignals: [
      ...(item.rankingRank ? [`ranking:${item.rankingRank}`] : []),
      ...(item.reviewCount >= 500 ? ['review-volume'] : []),
      ...(item.pointRate >= 5 ? ['point-boost'] : [])
    ]
  };
}

async function searchTheme(theme) {
  const qs = new URLSearchParams({
    applicationId: APPLICATION_ID,
    accessKey: ACCESS_KEY,
    affiliateId: AFFILIATE_ID,
    keyword: theme,
    format: 'json',
    hits: '20',
    sort: '-reviewCount',
    availability: '1'
  });
  const res = await fetch(`${SEARCH_API}?${qs}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${theme}: ${res.status} ${JSON.stringify(data)}`);
  return (data.Items || data.items || []).map(x => normalize(x, { theme, source: 'search' }));
}

async function fetchRanking() {
  const qs = new URLSearchParams({
    applicationId: APPLICATION_ID,
    affiliateId: AFFILIATE_ID,
    format: 'json',
    formatVersion: '2',
    period: 'realtime',
    page: '1'
  });
  const res = await fetch(`${RANKING_API}?${qs}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ranking: ${res.status} ${JSON.stringify(data)}`);
  return (data.Items || data.items || []).map((x, i) => {
    const item = x?.Item || x?.item || x || {};
    return normalize(item, {
      theme: '楽天リアルタイムランキング',
      source: 'ranking',
      rankingRank: Number(item.rank || item.rankNumber || i + 1)
    });
  });
}

async function buildDemandPlan() {
  if (!APPLICATION_ID || !ACCESS_KEY || !AFFILIATE_ID) throw new Error('rakuten_credentials_not_configured');
  const all = [];
  const errors = [];

  for (const theme of THEMES) {
    try { all.push(...await searchTheme(theme)); }
    catch (e) { errors.push({ source: 'search', theme, message: e.message }); }
  }

  try { all.push(...await fetchRanking()); }
  catch (e) { errors.push({ source: 'ranking', message: e.message }); }

  const merged = new Map();
  for (const row of all) {
    const key = row.itemCode || row.itemUrl;
    if (!key) continue;
    const prev = merged.get(key);
    if (!prev) { merged.set(key, row); continue; }
    merged.set(key, {
      ...prev,
      ...row,
      source: prev.source === row.source ? prev.source : 'search+ranking',
      theme: prev.theme === row.theme ? prev.theme : `${prev.theme} / ${row.theme}`,
      rankingRank: row.rankingRank || prev.rankingRank || null
    });
  }

  const candidates = [...merged.values()]
    .map(item => ({ ...item, ...demandScore(item) }))
    .sort((a, b) => b.score - a.score || (a.rankingRank || 9999) - (b.rankingRank || 9999) || b.reviewCount - a.reviewCount)
    .slice(0, 20)
    .map((item, i) => ({ rank: i + 1, ...item }));

  demandGeneratedAt = Date.now();
  demandCache = {
    ok: candidates.length > 0,
    generatedAt: new Date(demandGeneratedAt).toISOString(),
    scoringVersion: 'rakumitsu-demand-v1',
    sources: ['IchibaItemSearch-20260701', 'IchibaItemRanking-20220601'],
    themes: THEMES,
    candidateCount: candidates.length,
    candidates,
    errors
  };
  console.log('[DEMAND_PLAN]', JSON.stringify({ generatedAt: demandCache.generatedAt, candidateCount: candidates.length, errors: errors.length }));
  return demandCache;
}

async function getDemandPlan() {
  if (demandCache && Date.now() - demandGeneratedAt < CACHE_MS) return demandCache;
  if (!building) building = buildDemandPlan().finally(() => { building = null; });
  return building;
}

const originalCreateServer = http.createServer.bind(http);
http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/daily-plan' && req.method === 'GET') {
        const plan = await getDemandPlan();
        res.writeHead(plan.ok ? 200 : 503, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(plan));
        return;
      }
    } catch (e) {
      if (req.url?.startsWith('/daily-plan')) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: false, error: 'demand_plan_unavailable', message: String(e?.message || e) }));
        return;
      }
    }
    return listener(req, res);
  });
};

await import('./server.js');
