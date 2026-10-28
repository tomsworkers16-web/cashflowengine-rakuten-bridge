const APPLICATION_ID = process.env.RAKUTEN_APPLICATION_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
const AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID;
const API_BASE = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';

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

function score(item) {
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
  return Math.round((trust + quality + affordability + incentive + shipping + affiliate) * 10) / 10;
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
  const res = await fetch(`${API_BASE}?${qs}`);
  const data = await res.json();
  if (!res.ok) throw new Error(`${keyword}: ${res.status} ${JSON.stringify(data)}`);
  return (data.Items || []).map(x => x.Item || x).map(item => ({
    keyword,
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
    imageUrl: item.mediumImageUrls?.[0]?.imageUrl || null,
    score: score(item)
  }));
}

if (!APPLICATION_ID || !ACCESS_KEY || !AFFILIATE_ID) {
  console.error('[DAILY_SCAN_ERROR] missing Rakuten credentials');
  process.exit(1);
}

const all = [];
for (const theme of themes) {
  try {
    const rows = await search(theme);
    all.push(...rows);
  } catch (e) {
    console.error('[DAILY_SCAN_THEME_ERROR]', theme, e.message);
  }
}

const seen = new Set();
const ranked = all
  .sort((a, b) => b.score - a.score)
  .filter(x => {
    const key = x.itemCode || x.itemUrl;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .slice(0, 20);

console.log('[DAILY_SCAN]', JSON.stringify({
  generatedAt: new Date().toISOString(),
  themes,
  count: ranked.length,
  candidates: ranked
}));
