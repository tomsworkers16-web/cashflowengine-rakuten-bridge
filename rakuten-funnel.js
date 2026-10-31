import fs from 'node:fs';

function readJson(path) { return JSON.parse(fs.readFileSync(path, 'utf8')); }
function norm(s) { return String(s || '').trim().toLowerCase(); }
function sameDay(a, b) { return a && b && String(a).slice(0, 10) === String(b).slice(0, 10); }

function scoreMatch(post, row) {
  let score = 0;
  const reasons = [];
  if (post.linkId && row.linkId && norm(post.linkId) === norm(row.linkId)) { score += 100; reasons.push('linkId'); }
  if (post.itemName && row.itemName && norm(post.itemName) === norm(row.itemName)) { score += 45; reasons.push('itemName-exact'); }
  else if (post.itemName && row.itemName && (norm(post.itemName).includes(norm(row.itemName)) || norm(row.itemName).includes(norm(post.itemName)))) { score += 25; reasons.push('itemName-partial'); }
  if (post.shopName && row.shopName && norm(post.shopName) === norm(row.shopName)) { score += 15; reasons.push('shopName'); }
  if (sameDay(post.postedAt, row.date)) { score += 15; reasons.push('same-day'); }
  return { score, reasons };
}

function confidence(score, row, post) {
  if (post.linkId && row.linkId && norm(post.linkId) === norm(row.linkId)) return 'exact';
  if (score >= 60) return 'high-estimate';
  if (score >= 35) return 'medium-estimate';
  if (score > 0) return 'low-estimate';
  return 'unattributed';
}

function n(v) { return Number(v || 0) || 0; }
function nullableNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function join(posts, reportRows, costs = {}) {
  const output = posts.map(post => {
    const ranked = reportRows.map(row => ({ row, ...scoreMatch(post, row) })).sort((a, b) => b.score - a.score);
    const best = ranked[0] || { row: {}, score: 0, reasons: [] };
    const row = best.row || {};
    const attributed = best.score > 0;
    const clicks = attributed ? nullableNumber(row.clicks) : null;
    const orders = attributed ? nullableNumber(row.orders) : null;
    const sales = attributed ? nullableNumber(row.sales) : null;
    const commission = attributed ? nullableNumber(row.commission) : null;
    const tinyfishCost = n(costs.tinyfishDailyCost) / Math.max(posts.length, 1);
    const aiApiCost = n(post.aiApiCost || costs.aiApiCostPerPost);
    const directCosts = tinyfishCost + aiApiCost;
    const estimatedProfit = commission === null ? null : commission - directCosts;
    return {
      post_id: post.post_id || post.postId || null,
      postedAt: post.postedAt || null,
      theme: post.theme || null,
      itemName: post.itemName || null,
      affiliateUrl: post.affiliateUrl || null,
      views: n(post.views), likes: n(post.likes), replies: n(post.replies), reposts: n(post.reposts), quotes: n(post.quotes), shares: n(post.shares),
      affiliateClicks: clicks,
      orders,
      sales,
      commission,
      directCosts,
      estimatedProfit,
      outcomeKnown: commission !== null,
      attribution: {
        confidence: confidence(best.score, row, post),
        score: best.score,
        reasons: best.reasons,
        warning: best.score >= 100 ? null : 'Rakuten public docs do not guarantee post/link-level attribution; this match is estimated unless a stable link identifier is present.'
      }
    };
  });

  const known = output.filter(x => x.outcomeKnown);
  const totals = output.reduce((a, x) => {
    a.views += n(x.views);
    if (x.affiliateClicks !== null) a.clicks += n(x.affiliateClicks);
    if (x.orders !== null) a.orders += n(x.orders);
    if (x.sales !== null) a.sales += n(x.sales);
    if (x.commission !== null) a.commission += n(x.commission);
    if (x.estimatedProfit !== null) a.estimatedProfit += n(x.estimatedProfit);
    return a;
  }, { views: 0, clicks: 0, orders: 0, sales: 0, commission: 0, estimatedProfit: 0 });
  totals.knownOutcomePosts = known.length;
  totals.unknownOutcomePosts = output.length - known.length;
  totals.ctr = totals.views > 0 && known.length > 0 ? totals.clicks / totals.views : null;
  totals.cvr = totals.clicks > 0 ? totals.orders / totals.clicks : null;
  if (known.length === 0) {
    totals.commission = null;
    totals.estimatedProfit = null;
  }
  return { generatedAt: new Date().toISOString(), totals, posts: output };
}

const [postsPath, reportPath, costsPath, outputPath] = process.argv.slice(2);
if (!postsPath || !reportPath) {
  console.error('Usage: node rakuten-funnel.js <posts.json> <normalized-report.json> [costs.json] [output.json]');
  process.exit(1);
}
const postsRaw = readJson(postsPath);
const reportRaw = readJson(reportPath);
const posts = Array.isArray(postsRaw) ? postsRaw : (postsRaw.posts || postsRaw.items || []);
const reportRows = Array.isArray(reportRaw) ? reportRaw : (reportRaw.rows || []);
const costs = costsPath ? readJson(costsPath) : {};
const result = join(posts, reportRows, costs);
const json = JSON.stringify(result, null, 2) + '\n';
if (outputPath) fs.writeFileSync(outputPath, json); else process.stdout.write(json);
