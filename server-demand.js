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
let demandCache = null;
let demandGeneratedAt = 0;
let building = null;

function seasonalThemes(date = new Date()) {
  const m = date.getUTCMonth() + 1;
  const map = {
    1: ['正月 便利','冬 防寒','乾燥 加湿','受験 便利','鍋 便利'],
    2: ['花粉 対策','乾燥 対策','バレンタイン','新生活 準備','防寒 便利'],
    3: ['新生活 便利','引っ越し 便利','花粉 対策','収納 新生活','入園 入学'],
    4: ['新生活 収納','紫外線 対策','春 掃除','行楽 便利','キッチン 新生活'],
    5: ['梅雨 対策','紫外線 対策','母の日 実用品','衣替え 収納','アウトドア 便利'],
    6: ['梅雨 便利','除湿','部屋干し','カビ 対策','暑さ 対策'],
    7: ['暑さ 対策','夏 便利グッズ','冷感','虫 対策','夏休み 便利'],
    8: ['暑さ 対策','防災 グッズ','夏休み 便利','冷感','台風 対策'],
    9: ['防災 グッズ','台風 対策','秋 収納','敬老の日 実用品','衣替え'],
    10: ['秋冬 便利','防寒 便利','乾燥 対策','ハロウィン 便利','大掃除 準備'],
    11: ['防寒 便利','乾燥 加湿','大掃除 便利','ブラックフライデー 便利','鍋 便利'],
    12: ['大掃除 便利','年末 収納','防寒 便利','クリスマス 実用品','正月 準備']
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

function qualityScore(item) {
  let score = 0;
  const reasons = [];
  if (item.reviewAverage >= 4.5) { score += 18; reasons.push('高評価4.5+'); }
  else if (item.reviewAverage >= 4.2) { score += 14; reasons.push('高評価4.2+'); }
  else if (item.reviewAverage >= 4.0) { score += 10; reasons.push('評価4.0+'); }

  if (item.reviewCount >= 2000) { score += 18; reasons.push('レビュー2000+'); }
  else if (item.reviewCount >= 500) { score += 14; reasons.push('レビュー500+'); }
  else if (item.reviewCount >= 100) { score += 10; reasons.push('レビュー100+'); }
  else if (item.reviewCount >= 20) { score += 6; reasons.push('レビュー20+'); }

  const price = Number(item.itemPrice || 0);
  if (price >= 1000 && price <= 5000) { score += 12; reasons.push('衝動買いしやすい価格帯'); }
  else if (price > 5000 && price <= 10000) { score += 8; reasons.push('中価格帯'); }
  else if (price > 0 && price < 1000) { score += 6; reasons.push('低価格'); }

  if (item.postageFlag === 0 || item.postageFlag === '0') { score += 6; reasons.push('送料無料'); }
  if (item.pointRate >= 5) { score += 4; reasons.push('ポイント倍率高め'); }
  if (item.affiliateUrl) { score += 4; reasons.push('アフィリエイトURL取得済み'); }
  if (item.affiliateRate >= 4) { score += 3; reasons.push('報酬率高め'); }
  return { score: Math.min(65, score), reasons };
}

function rankingMomentum(rank) {
  const r = Number(rank || 0);
  if (!r) return 0;
  if (r <= 5) return 30;
  if (r <= 10) return 27;
  if (r <= 30) return 23;
  if (r <= 100) return 17;
  if (r <= 300) return 10;
  return 5;
}

function predictionScore(item) {
  let score = 0;
  const signals = [];
  const origins = new Set(item.origins || []);
  if (origins.has('seasonal-search')) { score += 15; signals.push('seasonal-fit'); }
  if (item.reviewCount >= 20 && item.reviewCount < 500 && item.reviewAverage >= 4.3) {
    score += 7;
    signals.push('emerging-quality');
  }
  if (item.pointRate >= 5) { score += 4; signals.push('promotion-pressure'); }
  if (item.affiliateRate >= 4) { score += 2; signals.push('commercial-attractiveness'); }
  return { score: Math.min(25, score), signals };
}

function extractMatchTerms(item) {
  const text = `${item.itemName || ''} ${item.catchcopy || ''}`;
  const dictionary = [
    '水筒','収納','掃除','洗濯','キッチン','乾燥','加湿','防寒','冷感','除湿','部屋干し','カビ','花粉',
    'スマホ','充電','料理','時短','排水口','水切り','耳かき','防災','台風','虫','紫外線','鍋','引っ越し'
  ];
  return dictionary.filter(term => text.includes(term)).slice(0, 8);
}

function scoreThreeSpears(item) {
  const quality = qualityScore(item);
  const momentum = rankingMomentum(item.rankingRank) + ((item.origins || []).includes('core-search') && item.rankingRank ? 5 : 0);
  const predict = predictionScore(item);
  const cappedMomentum = Math.min(35, momentum);
  const total = Math.min(100, Math.round((quality.score + cappedMomentum + predict.score) * 10) / 10);
  const spear = cappedMomentum >= 20 ? 'momentum' : (predict.score >= 12 ? 'predict' : 'core');
  const reasons = [...quality.reasons];
  if (item.rankingRank) reasons.unshift(`楽天リアルタイムランキング${item.rankingRank}位`);
  if ((item.origins || []).includes('core-search') && item.rankingRank) reasons.unshift('検索需要×ランキング重複');
  if (predict.signals.includes('seasonal-fit')) reasons.push('季節先回り候補');

  return {
    score: total,
    spear,
    spearScores: {
      quality: quality.score,
      momentum: cappedMomentum,
      buzzMatch: 0,
      predict: predict.score
    },
    reasons,
    demandSignals: [
      ...(item.rankingRank ? [`ranking:${item.rankingRank}`] : []),
      ...((item.origins || []).includes('core-search') && item.rankingRank ? ['search-ranking-overlap'] : []),
      ...(item.reviewCount >= 500 ? ['review-volume'] : []),
      ...(item.pointRate >= 5 ? ['point-boost'] : []),
      ...predict.signals
    ],
    buzzMatchTerms: extractMatchTerms(item)
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
    const themes = [...new Set([...(String(prev.theme || '').split(' / ').filter(Boolean)), ...(String(row.theme || '').split(' / ').filter(Boolean))])];
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

function diversifiedTop(rows, limit = 20) {
  const sorted = rows
    .map(item => ({ ...item, ...scoreThreeSpears(item) }))
    .sort((a, b) => b.score - a.score || (a.rankingRank || 9999) - (b.rankingRank || 9999) || b.reviewCount - a.reviewCount);

  const picked = [];
  const used = new Set();
  const quotas = { momentum: 8, predict: 5, core: 4 };
  for (const [spear, quota] of Object.entries(quotas)) {
    for (const item of sorted) {
      if (picked.filter(x => x.spear === spear).length >= quota) break;
      const key = item.itemCode || item.itemUrl;
      if (item.spear !== spear || used.has(key)) continue;
      picked.push(item); used.add(key);
    }
  }
  for (const item of sorted) {
    if (picked.length >= limit) break;
    const key = item.itemCode || item.itemUrl;
    if (used.has(key)) continue;
    picked.push(item); used.add(key);
  }
  return picked.slice(0, limit).map((item, i) => ({ rank: i + 1, ...item }));
}

async function buildDemandPlan() {
  if (!APPLICATION_ID || !ACCESS_KEY || !AFFILIATE_ID) throw new Error('rakuten_credentials_not_configured');
  const all = [];
  const errors = [];
  const seasonal = seasonalThemes(new Date());

  for (const theme of CORE_THEMES) {
    try { all.push(...await searchTheme(theme, 'core-search')); }
    catch (e) { errors.push({ source: 'search', theme, message: e.message }); }
  }
  for (const theme of seasonal) {
    try { all.push(...await searchTheme(theme, 'seasonal-search')); }
    catch (e) { errors.push({ source: 'seasonal-search', theme, message: e.message }); }
  }
  try { all.push(...await fetchRanking()); }
  catch (e) { errors.push({ source: 'ranking', message: e.message }); }

  const candidates = diversifiedTop(mergeRows(all), 20);
  demandGeneratedAt = Date.now();
  demandCache = {
    ok: candidates.length > 0,
    generatedAt: new Date(demandGeneratedAt).toISOString(),
    scoringVersion: 'three-spear-v2',
    strategy: {
      momentum: '楽天リアルタイムランキング＋検索需要の重複で売れ始めを捕捉',
      buzzMatch: '日次司令塔が公開SNS/Webの急伸話題・悩みを検知し、buzzMatchTermsと商品候補を照合',
      predict: '季節先回り検索＋新興高評価商品＋販促圧力で次の需要を探索',
      allocation: { momentum: 0.5, buzzMatch: 0.3, predict: 0.2 },
      learning: '夜間評価でCTR/CVR/利益に寄与したシグナルを翌日加減点'
    },
    sources: ['IchibaItemSearch-20260701', 'IchibaItemRanking-20220601'],
    themes: { core: CORE_THEMES, seasonal },
    candidateCount: candidates.length,
    candidates,
    errors
  };
  console.log('[THREE_SPEAR_PLAN]', JSON.stringify({ generatedAt: demandCache.generatedAt, candidateCount: candidates.length, seasonalThemes: seasonal, errors: errors.length }));
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
      if ((url.pathname === '/daily-plan' || url.pathname === '/three-spear-plan') && req.method === 'GET') {
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
      if (req.url?.startsWith('/daily-plan') || req.url?.startsWith('/three-spear-plan')) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: false, error: 'three_spear_plan_unavailable', message: String(e?.message || e) }));
        return;
      }
    }
    return listener(req, res);
  });
};

await import('./server.js');
