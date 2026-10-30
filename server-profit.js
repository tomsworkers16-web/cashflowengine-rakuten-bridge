import http from 'node:http';
import { URL } from 'node:url';

const APPLICATION_ID = process.env.RAKUTEN_APPLICATION_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
const AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID;

const SEARCH_API = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const RANKING_API = 'https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601';
const CORE_THEMES = [
  '便利グッズ','時短 家事','キッチン 便利','収納 便利','掃除 便利グッズ',
  'スマホ 便利グッズ','洗濯 便利グッズ','防寒 便利グッズ','料理 時短','新生活 便利グッズ'
];
const CACHE_MS = 6 * 60 * 60 * 1000;
let planCache = null;
let planGeneratedAt = 0;
let building = null;

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function round(v, d = 2) { const p = 10 ** d; return Math.round(v * p) / p; }

function seasonalThemes(date = new Date()) {
  const m = date.getUTCMonth() + 1;
  const map = {
    1:['正月 便利','冬 防寒','乾燥 加湿','受験 便利','鍋 便利'],
    2:['花粉 対策','乾燥 対策','バレンタイン','新生活 準備','防寒 便利'],
    3:['新生活 便利','引っ越し 便利','花粉 対策','収納 新生活','入園 入学'],
    4:['新生活 収納','紫外線 対策','春 掃除','行楽 便利','キッチン 新生活'],
    5:['梅雨 対策','紫外線 対策','母の日 実用品','衣替え 収納','アウトドア 便利'],
    6:['梅雨 便利','除湿','部屋干し','カビ 対策','暑さ 対策'],
    7:['暑さ 対策','夏 便利グッズ','冷感','虫 対策','夏休み 便利'],
    8:['暑さ 対策','防災 グッズ','夏休み 便利','冷感','台風 対策'],
    9:['防災 グッズ','台風 対策','秋 収納','敬老の日 実用品','衣替え'],
    10:['秋冬 便利','防寒 便利','乾燥 対策','ハロウィン 便利','大掃除 準備'],
    11:['防寒 便利','乾燥 加湿','大掃除 便利','ブラックフライデー 便利','鍋 便利'],
    12:['大掃除 便利','年末 収納','防寒 便利','クリスマス 実用品','正月 準備']
  };
  return map[m] || [];
}

function normalize(entry, extra = {}) {
  const item = entry?.Item || entry?.item || entry || {};
  const image = item.mediumImageUrls?.[0] || item.smallImageUrls?.[0];
  return {
    ...extra,
    itemName: item.itemName || null,
    catchcopy: item.catchcopy || null,
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
    affiliateRate: Number(item.affiliateRate || 0),
    postageFlag: item.postageFlag ?? null,
    availability: item.availability ?? null
  };
}

function extractMatchTerms(item) {
  const text = `${item.itemName || ''} ${item.catchcopy || ''}`;
  const dictionary = [
    '水筒','収納','掃除','洗濯','キッチン','乾燥','加湿','防寒','冷感','除湿','部屋干し','カビ','花粉',
    'スマホ','充電','料理','時短','排水口','水切り','耳かき','防災','台風','虫','紫外線','鍋','引っ越し',
    '衣替え','大掃除','新生活','旅行','衛生','節約','時短','整理','消臭','暖房'
  ];
  return dictionary.filter(term => text.includes(term)).slice(0, 10);
}

function rankingMomentum(rank) {
  const r = Number(rank || 0);
  if (!r) return 0;
  if (r <= 5) return 100;
  if (r <= 10) return 92;
  if (r <= 30) return 82;
  if (r <= 100) return 68;
  if (r <= 300) return 52;
  return 35;
}

function qualityScore(item) {
  let q = 20;
  if (item.reviewAverage >= 4.5) q += 25;
  else if (item.reviewAverage >= 4.2) q += 18;
  else if (item.reviewAverage >= 4.0) q += 10;
  if (item.reviewCount >= 2000) q += 20;
  else if (item.reviewCount >= 500) q += 15;
  else if (item.reviewCount >= 100) q += 9;
  else if (item.reviewCount >= 20) q += 5;
  const p = Number(item.itemPrice || 0);
  if (p >= 1000 && p <= 5000) q += 15;
  else if (p > 5000 && p <= 10000) q += 8;
  else if (p > 0 && p < 1000) q += 6;
  if (item.postageFlag === 0 || item.postageFlag === '0') q += 7;
  if (item.pointRate >= 5) q += 5;
  if (item.affiliateUrl) q += 3;
  return clamp(q, 0, 100);
}

function predictScore(item) {
  const origins = new Set(item.origins || []);
  let p = 10;
  if (origins.has('seasonal-search')) p += 45;
  if (item.reviewCount >= 20 && item.reviewCount < 500 && item.reviewAverage >= 4.3) p += 22;
  if (item.pointRate >= 5) p += 10;
  if (item.affiliateRate >= 4) p += 5;
  return clamp(p, 0, 100);
}

function monetizationScore(item) {
  const price = Number(item.itemPrice || 0);
  const rate = Number(item.affiliateRate || 0);
  let m = 20;
  if (price >= 1500 && price <= 5000) m += 28;
  else if (price > 5000 && price <= 10000) m += 20;
  else if (price >= 500 && price < 1500) m += 13;
  if (rate >= 5) m += 30;
  else if (rate >= 3) m += 22;
  else if (rate > 0) m += 12;
  if (item.affiliateUrl) m += 8;
  if (item.pointRate >= 5) m += 5;
  return clamp(m, 0, 100);
}

function estimatePriors(item) {
  const quality = qualityScore(item);
  const momentum = clamp(rankingMomentum(item.rankingRank) + ((item.origins || []).includes('core-search') && item.rankingRank ? 8 : 0), 0, 100);
  const predict = predictScore(item);
  const monetization = monetizationScore(item);

  // These are conservative priors only. Live automation replaces them with observed post/account data.
  const expectedCtr = clamp(0.006 + quality / 10000 + momentum / 12000 + predict / 20000, 0.006, 0.035);
  const expectedCvr = clamp(0.008 + quality / 12000 + momentum / 18000, 0.008, 0.035);
  const reachIndex = clamp(20 + momentum * 0.50 + predict * 0.20 + quality * 0.25, 0, 100);

  const signals = [
    item.rankingRank ? 1 : 0,
    (item.origins || []).includes('core-search') ? 1 : 0,
    (item.origins || []).includes('seasonal-search') ? 1 : 0,
    item.reviewCount >= 100 ? 1 : 0,
    item.affiliateRate > 0 ? 1 : 0,
    item.pointRate >= 5 ? 1 : 0
  ].reduce((a,b) => a+b, 0);
  const confidence = clamp(0.30 + signals * 0.085, 0.30, 0.81);

  // Comparable profit potential index, not a yen forecast.
  const conversionValue = monetization * 0.42 + quality * 0.18;
  const trafficValue = reachIndex * 0.22 + momentum * 0.10 + predict * 0.08;
  const expectedProfitScore = clamp(conversionValue + trafficValue, 0, 100);
  const uncertainty = 1 - confidence;
  const upside = clamp(Math.max(momentum, predict, monetization) * 0.7 + quality * 0.3, 0, 100);
  const explorationBonus = clamp(uncertainty * upside * 0.24, 0, 18);
  const riskPenalty = item.reviewAverage && item.reviewAverage < 4.0 ? 10 : 0;
  const selectionScore = clamp(expectedProfitScore + explorationBonus - riskPenalty, 0, 118);

  return {
    expectedProfitScore: round(expectedProfitScore, 1),
    selectionScore: round(selectionScore, 1),
    confidence: round(confidence, 2),
    uncertainty: round(uncertainty, 2),
    explorationBonus: round(explorationBonus, 1),
    riskPenalty,
    priors: {
      expectedCtr: round(expectedCtr, 4),
      expectedCvr: round(expectedCvr, 4),
      reachIndex: round(reachIndex, 1),
      monetizationScore: round(monetization, 1)
    },
    spearSignals: {
      momentum: round(momentum, 1),
      buzzMatch: 0,
      predict: round(predict, 1),
      quality: round(quality, 1)
    }
  };
}

async function searchTheme(theme, origin) {
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
  return (data.Items || data.items || []).map(x => normalize(x, { theme, origins: [origin] }));
}

async function fetchRanking() {
  const qs = new URLSearchParams({
    applicationId: APPLICATION_ID,
    accessKey: ACCESS_KEY,
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
      origins: ['ranking'],
      rankingRank: Number(item.rank || item.rankNumber || i + 1)
    });
  });
}

function mergeRows(rows) {
  const merged = new Map();
  for (const row of rows) {
    const key = row.itemCode || row.itemUrl;
    if (!key) continue;
    const prev = merged.get(key);
    if (!prev) { merged.set(key, row); continue; }
    const origins = [...new Set([...(prev.origins || []), ...(row.origins || [])])];
    const themes = [...new Set([
      ...String(prev.theme || '').split(' / ').filter(Boolean),
      ...String(row.theme || '').split(' / ').filter(Boolean)
    ])];
    merged.set(key, {
      ...prev,
      ...row,
      origins,
      theme: themes.join(' / '),
      rankingRank: row.rankingRank || prev.rankingRank || null
    });
  }
  return [...merged.values()];
}

function rankByProfit(rows, limit = 20) {
  const ranked = rows.map(item => ({
    ...item,
    ...estimatePriors(item),
    buzzMatchTerms: extractMatchTerms(item)
  })).sort((a,b) =>
    b.selectionScore - a.selectionScore ||
    b.expectedProfitScore - a.expectedProfitScore ||
    (a.rankingRank || 9999) - (b.rankingRank || 9999)
  );

  // Exploit top expected-profit candidates, but reserve one high-upside uncertain candidate in top 5.
  const topExploit = ranked.slice(0, 4);
  const used = new Set(topExploit.map(x => x.itemCode || x.itemUrl));
  const exploration = ranked
    .filter(x => !used.has(x.itemCode || x.itemUrl))
    .sort((a,b) => b.explorationBonus - a.explorationBonus || b.expectedProfitScore - a.expectedProfitScore)[0];
  const ordered = exploration ? [...topExploit, { ...exploration, portfolioRole: 'explore' }] : [...topExploit];
  const orderedKeys = new Set(ordered.map(x => x.itemCode || x.itemUrl));
  for (const row of ranked) {
    if (ordered.length >= limit) break;
    const key = row.itemCode || row.itemUrl;
    if (orderedKeys.has(key)) continue;
    ordered.push(row); orderedKeys.add(key);
  }
  return ordered.slice(0, limit).map((item, i) => ({
    rank: i + 1,
    portfolioRole: item.portfolioRole || (i < 4 ? 'exploit' : 'ranked'),
    ...item
  }));
}

async function buildProfitPlan() {
  if (!APPLICATION_ID || !ACCESS_KEY || !AFFILIATE_ID) throw new Error('rakuten_credentials_not_configured');
  const all = [];
  const errors = [];
  const seasonal = seasonalThemes(new Date());

  for (const theme of CORE_THEMES) {
    try { all.push(...await searchTheme(theme, 'core-search')); }
    catch (e) { errors.push({ source:'search', theme, message:e.message }); }
  }
  for (const theme of seasonal) {
    try { all.push(...await searchTheme(theme, 'seasonal-search')); }
    catch (e) { errors.push({ source:'seasonal-search', theme, message:e.message }); }
  }
  try { all.push(...await fetchRanking()); }
  catch (e) { errors.push({ source:'ranking', message:e.message }); }

  const candidates = rankByProfit(mergeRows(all), 20);
  planGeneratedAt = Date.now();
  planCache = {
    ok: candidates.length > 0,
    generatedAt: new Date(planGeneratedAt).toISOString(),
    scoringVersion: 'expected-profit-v3',
    objective: 'maximize_net_profit_as_fast_as_possible',
    strategy: {
      signalLayer: ['momentum','buzz-match','predict'],
      ranking: 'expected-profit-first',
      fixedSpearAllocation: false,
      exploitShareTarget: 0.8,
      exploreShareTarget: 0.2,
      calibration: 'daily automation replaces conservative priors with observed 7-day account/post CTR, CVR, commission and cost data',
      warning: 'expectedProfitScore is a comparable index, not a yen forecast, until observed attribution data is sufficient'
    },
    sources: ['IchibaItemSearch-20260701','IchibaItemRanking-20220601'],
    themes: { core: CORE_THEMES, seasonal },
    candidateCount: candidates.length,
    candidates,
    errors
  };
  console.log('[EXPECTED_PROFIT_PLAN]', JSON.stringify({
    generatedAt: planCache.generatedAt,
    candidateCount: candidates.length,
    top5: candidates.slice(0,5).map(x => ({ rank:x.rank, role:x.portfolioRole, expectedProfitScore:x.expectedProfitScore, selectionScore:x.selectionScore, confidence:x.confidence, itemName:x.itemName })),
    errors: errors.length
  }));
  return planCache;
}

async function getProfitPlan() {
  if (planCache && Date.now() - planGeneratedAt < CACHE_MS) return planCache;
  if (!building) building = buildProfitPlan().finally(() => { building = null; });
  return building;
}

const originalCreateServer = http.createServer.bind(http);
http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if ((url.pathname === '/daily-plan' || url.pathname === '/profit-plan' || url.pathname === '/three-spear-plan') && req.method === 'GET') {
        const plan = await getProfitPlan();
        res.writeHead(plan.ok ? 200 : 503, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(plan));
        return;
      }
    } catch (e) {
      if (req.url?.startsWith('/daily-plan') || req.url?.startsWith('/profit-plan') || req.url?.startsWith('/three-spear-plan')) {
        res.writeHead(503, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
        res.end(JSON.stringify({ ok:false, error:'expected_profit_plan_unavailable', message:String(e?.message || e) }));
        return;
      }
    }
    return listener(req, res);
  });
};

await import('./server.js');