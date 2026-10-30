const APPLICATION_ID = process.env.RAKUTEN_APPLICATION_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
const AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID;
const SEARCH_API_BASE = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const RANKING_API_BASE = 'https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601';

const themes = [
  '便利グッズ',
  '時短 家事',
  'キッチン 便利',
  '収納 便利',
  '掃除 便利グッズ',
  'スマホ 便利グッズ',
  '洗濯 便利グッズ',
  '防寒 便利グッズ',
  '料理 時短',
  '新生活 便利グッズ'
];

function baseScore(item) {
  const reviews = Number(item.reviewCount || 0);
  const rating = Number(item.reviewAverage || 0);
  const price = Number(item.itemPrice || 0);
  const pointRate = Number(item.pointRate || 1);
  const postage = Number(item.postageFlag || 0);
  const trust = Math.min(30, Math.log10(reviews + 1) * 8);
  const quality = Math.max(0, Math.min(25, (rating - 3.5) * 20));
  const affordability = price > 0 ? Math.max(0, 20 - Math.abs(Math.log10(price) - 3.4) * 11) : 0;
  const incentive = Math.min(10, Math.max(0, pointRate - 1) * 2);
  const shipping = postage === 0 ? 8 : 3;
  const affiliate = item.affiliateUrl ? 7 : 0;
  return trust + quality + affordability + incentive + shipping + affiliate;
}

function rankingBoost(rank) {
  const n = Number(rank || 0);
  if (!n) return 0;
  if (n <= 10) return 25;
  if (n <= 30) return 20;
  if (n <= 100) return 14;
  if (n <= 300) return 8;
  return 4;
}

function score(item) {
  const base = baseScore(item);
  const demand = rankingBoost(item.rankingRank);
  return {
    score: Math.round(Math.min(100, base + demand) * 10) / 10,
    baseScore: Math.round(base * 10) / 10,
    demandScore: demand,
    demandSignals: [
      ...(item.rankingRank ? [`楽天リアルタイムランキング${item.rankingRank}位`] : []),
      ...(Number(item.reviewCount || 0) >= 500 ? ['レビュー母数大'] : []),
      ...(Number(item.pointRate || 0) >= 5 ? ['ポイント倍率高'] : [])
    ]
  };
}

function normalize(item, extra = {}) {
  const image = item.mediumImageUrls?.[0];
  return {
    ...extra,
    itemName: item.itemName,
    itemPrice: item.itemPrice,
    affiliateUrl: item.affiliateUrl,
    itemUrl: item.itemUrl,
    reviewCount: item.reviewCount,
    reviewAverage: item.reviewAverage,
    shopName: item.shopName,
    itemCode: item.itemCode,
    genreId: item.genreId,
    pointRate: item.pointRate,
    postageFlag: item.postageFlag,
    imageUrl: typeof image === 'string' ? image : image?.imageUrl || null
  };
}

async function search(keyword) {
  const qs = new URLSearchParams({
    applicationId: APPLICATION_ID,
    accessKey: ACCESS_KEY,
    affiliateId: AFFILIATE_ID,
    keyword,
    format: 'json',
    hits: '20',
    sort: '-reviewCount',
    availability: '1'
  });
  const res = await fetch(`${SEARCH_API_BASE}?${qs}`);
  const data = await res.json();
  if (!res.ok) throw new Error(`${keyword}: ${res.status} ${JSON.stringify(data)}`);
  return (data.Items || data.items || [])
    .map(x => x.Item || x.item || x)
    .map(item => normalize(item, { source: 'search', keyword }));
}

async function ranking() {
  const qs = new URLSearchParams({
    applicationId: APPLICATION_ID,
    affiliateId: AFFILIATE_ID,
    format: 'json',
    formatVersion: '2',
    period: 'realtime',
    page: '1'
  });
  const res = await fetch(`${RANKING_API_BASE}?${qs}`);
  const data = await res.json();
  if (!res.ok) throw new Error(`ranking: ${res.status} ${JSON.stringify(data)}`);
  return (data.Items || data.items || [])
    .map(x => x.Item || x.item || x)
    .map((item, index) => normalize(item, {
      source: 'ranking',
      keyword: '楽天リアルタイムランキング',
      rankingRank: Number(item.rank || item.rankNumber || index + 1)
    }));
}

if (!APPLICATION_ID || !ACCESS_KEY || !AFFILIATE_ID) {
  console.error('[DAILY_SCAN_ERROR] missing Rakuten credentials');
  process.exit(1);
}

const all = [];
const errors = [];

for (const theme of themes) {
  try {
    all.push(...await search(theme));
  } catch (e) {
    errors.push({ source: 'search', theme, message: e.message });
    console.error('[DAILY_SCAN_THEME_ERROR]', theme, e.message);
  }
}

try {
  all.push(...await ranking());
} catch (e) {
  errors.push({ source: 'ranking', message: e.message });
  console.error('[DAILY_SCAN_RANKING_ERROR]', e.message);
}

const merged = new Map();
for (const row of all) {
  const key = row.itemCode || row.itemUrl;
  if (!key) continue;
  const prev = merged.get(key);
  if (!prev) {
    merged.set(key, row);
    continue;
  }
  merged.set(key, {
    ...prev,
    ...row,
    source: prev.source === row.source ? prev.source : 'search+ranking',
    keyword: prev.keyword === row.keyword ? prev.keyword : `${prev.keyword} / ${row.keyword}`,
    rankingRank: row.rankingRank || prev.rankingRank || null
  });
}

const ranked = [...merged.values()]
  .map(item => ({ ...item, ...score(item) }))
  .sort((a, b) => b.score - a.score || (a.rankingRank || 9999) - (b.rankingRank || 9999) || Number(b.reviewCount || 0) - Number(a.reviewCount || 0))
  .slice(0, 20)
  .map((item, index) => ({ rank: index + 1, ...item }));

console.log('[DAILY_SCAN]', JSON.stringify({
  generatedAt: new Date().toISOString(),
  scoringVersion: 'rakumitsu-demand-v1',
  sources: ['IchibaItemSearch-20260701', 'IchibaItemRanking-20220601'],
  themes,
  count: ranked.length,
  candidates: ranked,
  errors
}));
