import http from 'node:http';
import { URL } from 'node:url';
import { getSupabaseStatus, saveDailyPlanLkg, loadDailyPlanLkg, writeSystemEvent } from './supabase-store.js';

const APPLICATION_ID = process.env.RAKUTEN_APPLICATION_ID || '';
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY || '';
const AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID || '';
const SERVICE = 'cashflowengine-rakuten-bridge';
const VERSION = 'cfe-daily-plan-2026.10.31.1';
const SCORING_VERSION = 'expected-profit-v3';
const SEARCH_API = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const RANKING_API = 'https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601';
const CORE_THEMES = [
  '便利グッズ','時短 家事','キッチン 便利','収納 便利','掃除 便利グッズ',
  'スマホ 便利グッズ','洗濯 便利グッズ','防寒 便利グッズ','料理 時短','新生活 便利グッズ'
];
const CACHE_MS = 6 * 60 * 60 * 1000;
const LKG_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 5500;
const UPSTREAM_ATTEMPTS = 2;
const CONCURRENCY = 6;
const MIN_CANDIDATES = 20;

let planCache = null;
let planGeneratedAt = 0;
let building = null;
const startedAt = new Date().toISOString();
const diagnostics = {
  service: 'ok',
  configured: false,
  rakutenApi: 'unknown',
  candidateGeneration: 'unknown',
  expectedProfitEngine: 'ok',
  scoringVersion: SCORING_VERSION,
  candidateCount: 0,
  lastSuccessfulPlanAt: null,
  lastError: null,
  lastSource: null,
  lkgAvailable: false,
  selfTests: null
};

function nowIso() { return new Date().toISOString(); }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function round(v, d = 2) { const p = 10 ** d; return Math.round(v * p) / p; }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function configured() { return Boolean(APPLICATION_ID && ACCESS_KEY && AFFILIATE_ID); }
function missingConfig() {
  const missing = [];
  if (!APPLICATION_ID) missing.push('RAKUTEN_APPLICATION_ID');
  if (!ACCESS_KEY) missing.push('RAKUTEN_ACCESS_KEY');
  if (!AFFILIATE_ID) missing.push('RAKUTEN_AFFILIATE_ID');
  return missing;
}
function log(name, fields = {}) { console.log(`[${name}]`, JSON.stringify(fields)); }
function logFailure(reason, retryable, extra = {}) {
  console.error('[DAILY_PLAN_FAILED]', JSON.stringify({ reason, retryable, timestamp: nowIso(), ...extra }));
}

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
    itemPrice: Number(item.itemPrice || 0) || 0,
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
    '衣替え','大掃除','新生活','旅行','衛生','節約','整理','消臭','暖房'
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
  const expectedCtr = clamp(0.006 + quality / 10000 + momentum / 12000 + predict / 20000, 0.006, 0.035);
  const expectedCvr = clamp(0.008 + quality / 12000 + momentum / 18000, 0.008, 0.035);
  const reachIndex = clamp(20 + momentum * 0.50 + predict * 0.20 + quality * 0.25, 0, 100);
  const expectedViews = Math.round(80 + reachIndex * 4.2);
  const commissionRate = Number(item.affiliateRate || 0) > 0 ? Number(item.affiliateRate) / 100 : 0.01;
  const expectedCommissionPerOrder = Math.max(1, Number(item.itemPrice || 0) * commissionRate);
  const directCosts = 0;
  const expectedNetProfit = Math.max(0, expectedViews * expectedCtr * expectedCvr * expectedCommissionPerOrder - directCosts);

  const signals = [
    item.rankingRank ? 1 : 0,
    (item.origins || []).includes('core-search') ? 1 : 0,
    (item.origins || []).includes('seasonal-search') ? 1 : 0,
    item.reviewCount >= 100 ? 1 : 0,
    item.affiliateRate > 0 ? 1 : 0,
    item.pointRate >= 5 ? 1 : 0
  ].reduce((a,b) => a+b, 0);
  const confidence = clamp(0.30 + signals * 0.085, 0.30, 0.81);
  const profitComponent = clamp(Math.log10(1 + expectedNetProfit) * 35, 0, 70);
  const supportComponent = quality * 0.12 + momentum * 0.08 + predict * 0.06 + monetization * 0.09;
  const expectedProfitScore = clamp(profitComponent + supportComponent, 0, 100);
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
      expectedViews,
      expectedCtr: round(expectedCtr, 4),
      expectedCvr: round(expectedCvr, 4),
      expectedCommissionPerOrder: round(expectedCommissionPerOrder, 2),
      directCosts,
      expectedNetProfit: round(expectedNetProfit, 4),
      reachIndex: round(reachIndex, 1),
      monetizationScore: round(monetization, 1),
      updateRule: 'posterior = prior + observed_data_when_sample_is_sufficient'
    },
    spearSignals: {
      momentum: round(momentum, 1),
      buzzMatch: 0,
      predict: round(predict, 1),
      quality: round(quality, 1)
    }
  };
}

function classifyFailure(error) {
  const code = String(error?.code || '');
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || '').toLowerCase();
  if (code === 'NOT_CONFIGURED' || message.includes('not_configured')) return { reason:'not_configured', retryable:false };
  if (code === 'CANDIDATE_GENERATION_FAILED') return { reason:'candidate_generation_failed', retryable:true };
  if (code === 'SCORING_FAILED') return { reason:'expected_profit_scoring_failed', retryable:false };
  if (code === 'CACHE_UNAVAILABLE') return { reason:'cache_unavailable', retryable:true };
  if (message.includes('timeout') || message.includes('abort')) return { reason:'rakuten_api_timeout', retryable:true };
  if (status === 429) return { reason:'rakuten_rate_limit', retryable:true };
  if (status >= 400) return { reason:'rakuten_api_error', retryable:status >= 500 };
  return { reason:'internal_error', retryable:false };
}

async function fetchJson(url, { attempts = UPSTREAM_ATTEMPTS, timeoutMs = UPSTREAM_TIMEOUT_MS } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error(`rakuten_api_${res.status}`);
        e.status = res.status;
        e.details = data;
        throw e;
      }
      return data;
    } catch (e) {
      lastError = e;
      if (e?.name === 'AbortError') lastError = Object.assign(new Error('rakuten_api_timeout'), { status: 504 });
      const classified = classifyFailure(lastError);
      if (!classified.retryable || attempt >= attempts) break;
      await delay(attempt === 1 ? 450 : 900);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('rakuten_api_error');
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
  const data = await fetchJson(`${SEARCH_API}?${qs}`);
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
  const data = await fetchJson(`${RANKING_API}?${qs}`);
  return (data.Items || data.items || []).map((x, i) => {
    const item = x?.Item || x?.item || x || {};
    return normalize(item, {
      theme: '楽天リアルタイムランキング',
      origins: ['ranking'],
      rankingRank: Number(item.rank || item.rankNumber || i + 1)
    });
  });
}

async function mapWithConcurrency(items, worker, limit = CONCURRENCY) {
  const results = new Array(items.length);
  let index = 0;
  async function runner() {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      try { results[i] = { ok:true, value:await worker(items[i], i) }; }
      catch (error) { results[i] = { ok:false, error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runner()));
  return results;
}

function mergeRows(rows) {
  const merged = new Map();
  for (const row of rows) {
    const key = row.itemCode || row.itemUrl;
    if (!key) continue;
    const prev = merged.get(key);
    if (!prev) { merged.set(key, row); continue; }
    merged.set(key, {
      ...prev,
      ...row,
      origins: [...new Set([...(prev.origins || []), ...(row.origins || [])])],
      theme: [...new Set([...String(prev.theme || '').split(' / ').filter(Boolean), ...String(row.theme || '').split(' / ').filter(Boolean)])].join(' / '),
      rankingRank: row.rankingRank || prev.rankingRank || null
    });
  }
  return [...merged.values()];
}

function rankByProfit(rows, limit = 20) {
  let ranked;
  try {
    ranked = rows
      .filter(item => Boolean(item.affiliateUrl))
      .map(item => ({ ...item, ...estimatePriors(item), buzzMatchTerms: extractMatchTerms(item) }))
      .sort((a,b) => b.selectionScore - a.selectionScore || b.expectedProfitScore - a.expectedProfitScore || (a.rankingRank || 9999) - (b.rankingRank || 9999));
  } catch (error) {
    error.code = 'SCORING_FAILED';
    throw error;
  }
  const topExploit = ranked.slice(0, 4);
  const used = new Set(topExploit.map(x => x.itemCode || x.itemUrl));
  const exploration = ranked.filter(x => !used.has(x.itemCode || x.itemUrl)).sort((a,b) => b.explorationBonus - a.explorationBonus || b.expectedProfitScore - a.expectedProfitScore)[0];
  const ordered = exploration ? [...topExploit, { ...exploration, portfolioRole:'explore' }] : [...topExploit];
  const orderedKeys = new Set(ordered.map(x => x.itemCode || x.itemUrl));
  for (const row of ranked) {
    if (ordered.length >= limit) break;
    const key = row.itemCode || row.itemUrl;
    if (orderedKeys.has(key)) continue;
    ordered.push(row); orderedKeys.add(key);
  }
  return ordered.slice(0, limit).map((item, i) => ({
    rank: i + 1,
    productName: item.itemName || '',
    itemName: item.itemName || '',
    score: round(item.selectionScore, 1),
    expectedProfitScore: item.expectedProfitScore,
    confidence: item.confidence,
    price: Number(item.itemPrice || 0),
    itemPrice: Number(item.itemPrice || 0),
    reviewCount: Number(item.reviewCount || 0),
    reviewAverage: Number(item.reviewAverage || 0),
    theme: item.theme || '',
    buzzMatchTerms: item.buzzMatchTerms || [],
    affiliateUrl: item.affiliateUrl,
    priors: item.priors || {},
    portfolioRole: item.portfolioRole || (i < 4 ? 'exploit' : 'ranked'),
    selectionScore: item.selectionScore,
    uncertainty: item.uncertainty,
    explorationBonus: item.explorationBonus,
    riskPenalty: item.riskPenalty,
    spearSignals: item.spearSignals,
    itemUrl: item.itemUrl || null,
    itemCode: item.itemCode || null,
    shopName: item.shopName || null,
    affiliateRate: item.affiliateRate || 0,
    pointRate: item.pointRate || 0,
    rankingRank: item.rankingRank || null,
    origins: item.origins || []
  }));
}

async function buildProfitPlan() {
  log('DAILY_PLAN_REQUEST_STARTED', { timestamp:nowIso() });
  if (!configured()) {
    const e = new Error('rakuten_credentials_not_configured');
    e.code = 'NOT_CONFIGURED';
    throw e;
  }
  const all = [];
  const errors = [];
  const seasonal = seasonalThemes(new Date());
  const tasks = [
    ...CORE_THEMES.map(theme => ({ type:'search', theme, origin:'core-search' })),
    ...seasonal.map(theme => ({ type:'search', theme, origin:'seasonal-search' })),
    { type:'ranking' }
  ];

  log('RAKUTEN_FETCH_STARTED', { taskCount:tasks.length, concurrency:CONCURRENCY, timeoutMs:UPSTREAM_TIMEOUT_MS, attempts:UPSTREAM_ATTEMPTS });
  const results = await mapWithConcurrency(tasks, async task => task.type === 'ranking' ? fetchRanking() : searchTheme(task.theme, task.origin));
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const task = tasks[i];
    if (result.ok) all.push(...result.value);
    else {
      const classified = classifyFailure(result.error);
      errors.push({ source:task.type, theme:task.theme || null, reason:classified.reason, retryable:classified.retryable, status:Number(result.error?.status || 0) || null });
    }
  }
  diagnostics.rakutenApi = errors.length === tasks.length ? 'failed' : errors.length ? 'degraded' : 'ok';
  log('RAKUTEN_FETCH_OK', { successfulTasks:tasks.length - errors.length, failedTasks:errors.length, rawCandidateCount:all.length });

  log('CANDIDATES_GENERATED', { count:mergeRows(all).length });
  diagnostics.candidateGeneration = all.length ? 'ok' : 'failed';
  log('EXPECTED_PROFIT_SCORING_STARTED', { scoringVersion:SCORING_VERSION });
  const candidates = rankByProfit(mergeRows(all), 20);
  log('EXPECTED_PROFIT_SCORING_OK', { scoringVersion:SCORING_VERSION, candidateCount:candidates.length });
  if (candidates.length < MIN_CANDIDATES) {
    const e = new Error(`insufficient_candidates:${candidates.length}`);
    e.code = 'CANDIDATE_GENERATION_FAILED';
    e.partialErrors = errors;
    throw e;
  }

  planGeneratedAt = Date.now();
  planCache = {
    ok: true,
    source: 'live',
    stale: false,
    generatedAt: new Date(planGeneratedAt).toISOString(),
    scoringVersion: SCORING_VERSION,
    candidateCount: candidates.length,
    objective: 'maximize_expected_net_profit',
    formula: 'Expected Views × Expected CTR × Expected CVR × Expected Commission per Order − Direct Costs',
    calibration: 'Conservative priors are used until observed account/post attribution has sufficient sample size; posterior updates must not overfit one-click/one-conversion events.',
    candidates,
    warnings: errors,
    sources: ['IchibaItemSearch-20260701','IchibaItemRanking-20220601']
  };
  diagnostics.candidateCount = candidates.length;
  diagnostics.lastSuccessfulPlanAt = planCache.generatedAt;
  diagnostics.lastError = null;
  diagnostics.lastSource = 'live';
  diagnostics.expectedProfitEngine = 'ok';
  log('DAILY_PLAN_GENERATED', { generatedAt:planCache.generatedAt, candidateCount:candidates.length, scoringVersion:SCORING_VERSION, warningCount:errors.length });

  if (getSupabaseStatus().configured) {
    saveDailyPlanLkg(planCache)
      .then(() => { diagnostics.lkgAvailable = true; })
      .catch(error => console.error('[DAILY_PLAN_LKG_SAVE_FAILED]', JSON.stringify({ error:String(error?.message || error) })));
  }
  return planCache;
}

async function loadFreshLkg() {
  try {
    if (!getSupabaseStatus().configured) return null;
    const cached = await loadDailyPlanLkg();
    if (!cached?.plan) return null;
    const generatedMs = Date.parse(cached.plan.generatedAt || cached.eventTime || 0);
    const ageMs = Number.isFinite(generatedMs) ? Date.now() - generatedMs : Infinity;
    const ageMinutes = Math.max(0, Math.round(ageMs / 60000));
    diagnostics.lkgAvailable = true;
    if (ageMs > LKG_MAX_AGE_MS) return { expired:true, ageMinutes, plan:cached.plan };
    return {
      expired:false,
      ageMinutes,
      plan: {
        ...cached.plan,
        ok: true,
        source: 'last_known_good',
        stale: true,
        ageMinutes,
        lkgLoadedAt: nowIso()
      }
    };
  } catch (error) {
    console.error('[DAILY_PLAN_LKG_LOAD_FAILED]', JSON.stringify({ error:String(error?.message || error) }));
    return null;
  }
}

async function getProfitPlan() {
  if (planCache && Date.now() - planGeneratedAt < CACHE_MS) return planCache;
  if (!building) building = buildProfitPlan().finally(() => { building = null; });
  try {
    return await building;
  } catch (error) {
    const classified = classifyFailure(error);
    diagnostics.lastError = { reason:classified.reason, retryable:classified.retryable, timestamp:nowIso() };
    diagnostics.lastSource = null;
    logFailure(classified.reason, classified.retryable);
    const lkg = await loadFreshLkg();
    if (lkg && !lkg.expired) {
      diagnostics.lastSource = 'last_known_good';
      return lkg.plan;
    }
    const e = new Error(String(error?.message || error));
    e.reason = lkg?.expired ? 'cache_unavailable' : classified.reason;
    e.retryable = lkg?.expired ? true : classified.retryable;
    e.originalReason = classified.reason;
    e.lkgAgeMinutes = lkg?.ageMinutes ?? null;
    throw e;
  }
}

function structuredError(error) {
  const reason = error?.reason || classifyFailure(error).reason;
  const retryable = typeof error?.retryable === 'boolean' ? error.retryable : classifyFailure(error).retryable;
  return {
    ok: false,
    error: 'expected_profit_plan_unavailable',
    reason,
    retryable,
    scoringVersion: SCORING_VERSION,
    timestamp: nowIso(),
    ...(error?.lkgAgeMinutes !== null && error?.lkgAgeMinutes !== undefined ? { lkgAgeMinutes:error.lkgAgeMinutes } : {})
  };
}

function healthBody() {
  const isConfigured = configured();
  diagnostics.configured = isConfigured;
  const dependencyRakuten = !isConfigured ? 'not_configured' : diagnostics.rakutenApi === 'failed' ? 'degraded' : 'ok';
  return {
    ok: true,
    configured: isConfigured,
    service: SERVICE,
    version: VERSION,
    scoringVersion: SCORING_VERSION,
    timestamp: nowIso(),
    startedAt,
    dependencies: {
      rakuten: dependencyRakuten,
      expectedProfitEngine: diagnostics.expectedProfitEngine === 'failed' ? 'degraded' : 'ok'
    },
    dailyPlan: {
      ready: Boolean(planCache),
      candidateCount: planCache?.candidateCount || diagnostics.candidateCount || 0,
      lastSuccessfulPlanAt: diagnostics.lastSuccessfulPlanAt,
      source: diagnostics.lastSource,
      lkgAvailable: diagnostics.lkgAvailable
    },
    ...(isConfigured ? {} : { missingConfiguration:missingConfig() })
  };
}

function diagnosticsBody() {
  return {
    ...diagnostics,
    service: 'ok',
    configured: configured(),
    scoringVersion: SCORING_VERSION,
    version: VERSION,
    timestamp: nowIso(),
    missingConfiguration: configured() ? [] : missingConfig()
  };
}

async function runFailureSelfTests() {
  const tests = {
    rakutenTimeout: { passed:false },
    scoringException: { passed:false },
    missingConfig: { passed:!configured() ? true : 'not_applicable_runtime_configured' }
  };
  try {
    const fakeTimeout = Object.assign(new Error('rakuten_api_timeout'), { status:504 });
    const x = classifyFailure(fakeTimeout);
    tests.rakutenTimeout = { passed:x.reason === 'rakuten_api_timeout' && x.retryable === true, reason:x.reason, retryable:x.retryable };
  } catch (error) { tests.rakutenTimeout = { passed:false, error:String(error?.message || error) }; }
  try {
    const fakeScoring = Object.assign(new Error('simulated_scoring_failure'), { code:'SCORING_FAILED' });
    const x = classifyFailure(fakeScoring);
    tests.scoringException = { passed:x.reason === 'expected_profit_scoring_failed' && x.retryable === false, reason:x.reason, retryable:x.retryable };
  } catch (error) { tests.scoringException = { passed:false, error:String(error?.message || error) }; }
  diagnostics.selfTests = tests;
  log('DAILY_PLAN_SELF_TESTS', tests);
  return tests;
}

const originalCreateServer = http.createServer.bind(http);
http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer(async (req, res) => {
    const writeJson = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
      if (url.pathname === '/health' && req.method === 'GET') {
        log('HEALTH_OK', { configured:configured(), scoringVersion:SCORING_VERSION });
        return writeJson(200, healthBody());
      }
      if (url.pathname === '/diagnostics/daily-plan' && req.method === 'GET') {
        return writeJson(200, diagnosticsBody());
      }
      if ((url.pathname === '/daily-plan' || url.pathname === '/profit-plan' || url.pathname === '/three-spear-plan') && req.method === 'GET') {
        try {
          const plan = await getProfitPlan();
          return writeJson(200, plan);
        } catch (error) {
          const body = structuredError(error);
          return writeJson(body.reason === 'not_configured' ? 503 : 503, body);
        }
      }
    } catch (error) {
      if (req.url?.startsWith('/daily-plan') || req.url?.startsWith('/profit-plan') || req.url?.startsWith('/three-spear-plan')) {
        const body = structuredError(error);
        return writeJson(503, body);
      }
    }
    return listener(req, res);
  });
};

setTimeout(() => runFailureSelfTests().catch(() => {}), 1200);
setTimeout(() => {
  if (!configured()) return;
  getProfitPlan().catch(async error => {
    const classified = classifyFailure(error);
    diagnostics.lastError = { reason:classified.reason, retryable:classified.retryable, timestamp:nowIso() };
    try {
      await writeSystemEvent({
        component: 'expected-profit-engine',
        eventType: 'startup_plan_failed',
        severity: 'warning',
        message: 'Expected Profit v3 startup plan generation failed.',
        resolved: false,
        metadata: { reason:classified.reason, retryable:classified.retryable }
      });
    } catch {}
  });
}, 1800);

await import('./server.js');
