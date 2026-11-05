import fs from 'node:fs';
import path from 'node:path';
import { summarizePostJournal } from './report-posts.js';
import { summarizeAffiliateDay } from './revenue-metrics.js';
import { scanRakutenInbox } from './rakuten-report-importer.js';
import { intakeRakutenDownloads } from './rakuten-download-intake.js';
import { operationalAdvice } from './ops-policy.js';
import { decideRevenueActions } from './nightly-schedule.js';

const root = path.resolve(process.cwd());
const dataDir = path.resolve(process.env.CFE_DATA_DIR || path.join(root, '.data'));
const reportsDir = path.join(dataDir, 'reports');
const stateFile = path.join(dataDir, 'state.json');
const postsFile = path.join(dataDir, 'posts.jsonl');
const repliesFile = path.join(dataDir, 'external-replies.jsonl');
const eventsFile = path.join(dataDir, 'events.jsonl');
const candidatesFile = path.join(dataDir, 'external-reply-candidates.json');
const strategyFile = path.join(dataDir, 'daily-strategy.json');
const envFile = path.join(root, '.env');
const restartFlag = path.join(dataDir, 'restart-required.flag');
const THREADS_API_BASE = process.env.THREADS_API_BASE || 'https://graph.threads.net/v1.0';
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN || '';
const JST = 9 * 60 * 60 * 1000;

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

function nowJst() { return new Date(Date.now() + JST); }
function dayKey(d = nowJst()) { return d.toISOString().slice(0, 10); }
function rowDay(row) {
  if (row?.jstDate) return String(row.jstDate);
  const t = Date.parse(row?.at || '');
  if (!Number.isFinite(t)) return '';
  return new Date(t + JST).toISOString().slice(0, 10);
}
function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
}
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
function withinDay(row, day) { return rowDay(row) === day; }
function eventCount(rows, type) { return rows.filter(x => x.type === type).length; }
function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function jstDayBounds(day) {
  const start = Math.floor(new Date(`${day}T00:00:00+09:00`).getTime() / 1000);
  return { since: start, until: start + 86400 - 1 };
}

async function fetchThreads(pathname, params = {}) {
  if (!THREADS_ACCESS_TOKEN) throw new Error('threads_access_token_missing');
  const u = new URL(`${THREADS_API_BASE}${pathname}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  u.searchParams.set('access_token', THREADS_ACCESS_TOKEN);
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 12000);
  try {
    const r = await fetch(u, { signal: c.signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.error?.message || `HTTP_${r.status}`;
      const e = new Error(msg);
      e.status = r.status;
      throw e;
    }
    return data;
  } finally { clearTimeout(timer); }
}

function metricValue(item) {
  if (Number.isFinite(item?.total_value?.value)) return item.total_value.value;
  if (Array.isArray(item?.link_total_values)) return item.link_total_values.reduce((n, x) => n + (Number.isFinite(x?.value) ? x.value : 0), 0);
  if (Array.isArray(item?.values)) {
    const vals = item.values.map(x => x?.value).filter(Number.isFinite);
    if (vals.length) return vals[vals.length - 1];
  }
  return 'unknown';
}

async function getAccountInsights(day) {
  try {
    const { since, until } = jstDayBounds(day);
    const data = await fetchThreads('/me/threads_insights', {
      metric: 'views,likes,replies,reposts,quotes,clicks,followers_count',
      since,
      until
    });
    const out = {};
    for (const item of data?.data || []) out[item.name] = metricValue(item);
    return { available: true, error: null, metrics: out, rawMetricNames: (data?.data || []).map(x => x.name) };
  } catch (e) {
    return { available: false, error: e.message, metrics: {} };
  }
}

async function getPostInsights(posts) {
  const out = [];
  for (const p of posts.slice(-5)) {
    if (!p?.id) continue;
    try {
      const data = await fetchThreads(`/${p.id}/insights`, { metric: 'views,likes,replies,reposts,quotes,shares' });
      const metrics = {};
      for (const item of data?.data || []) metrics[item.name] = metricValue(item);
      out.push({ id: p.id, role: p?.meta?.role || 'unknown', slot: p.slot || null, metrics });
    } catch (e) {
      out.push({ id: p.id, role: p?.meta?.role || 'unknown', slot: p.slot || null, error: e.message, metrics: {} });
    }
  }
  return out;
}

async function buildNightReport(day = dayKey()) {
  const state = readJson(stateFile, {});
  const postJournal = readJsonl(postsFile).filter(x => withinDay(x, day));
  const postSummary = summarizePostJournal(postJournal);
  const affiliateCapture = intakeRakutenDownloads(dataDir,process.env.RAKUTEN_REPORT_DOWNLOAD_DIR);
  const affiliateImport = scanRakutenInbox(dataDir);
  const affiliate = summarizeAffiliateDay(readJson(path.join(dataDir, 'affiliate-results.json'), null), day);
  const posts = postSummary.published;
  const replies = readJsonl(repliesFile).filter(x => withinDay(x, day));
  const events = readJsonl(eventsFile).filter(x => withinDay(x, day));
  const candidates = readJson(candidatesFile, { candidates: [] })?.candidates || [];
  const replyPosted = replies.filter(x => x.status === 'posted');
  const replyFailed = replies.filter(x => x.status === 'failed');
  const errors = events.filter(x => /ERROR|REAUTH|FAILED/.test(String(x.type || '')));
  const accountInsights = await getAccountInsights(day);
  const postInsights = await getPostInsights(posts);
  const apiRateLimited = events.some(e => e.type === 'RAKUTEN_PRODUCT_ERROR' && e.error === 'HTTP_429') ||
    eventCount(events, 'RAKUTEN_RATE_LIMIT_COOLDOWN') > 0;
  const status = !state.browserOk || replyFailed.length > 0 || postSummary.uncertainAttempts > 0 ||
    eventCount(events, 'POST_ERROR') > 0 || apiRateLimited ? 'CAUTION' : 'NORMAL';

  const report = {
    version: 'm8-night-eval-v2-insights',
    generatedAt: new Date().toISOString(),
    jstDate: day,
    status,
    actuals: {
      posts: postSummary.posts,
      postsByRole: postSummary.postsByRole,
      uncertainPostingAttempts: postSummary.uncertainAttempts,
      externalRepliesPosted: replyPosted.length,
      externalRepliesFailed: replyFailed.length,
      latestCandidateCount: candidates.length,
      latestEligibleCount: candidates.filter(x => x?.evaluation?.eligible).length,
      browserOk: state.browserOk ?? null,
      rakutenRateLimitDetected: apiRateLimited,
      rakutenCooldownUntil: state.lastRakutenRateLimitAt ? new Date(Date.parse(state.lastRakutenRateLimitAt) + 30 * 60000).toISOString() : null,
      lastThreadsScanAt: state.lastThreadsScanAt || null,
      lastPostAt: state.lastPostAt || null,
      lastExternalReplyAt: state.lastExternalReplyAt || null,
      errors: errors.map(x => ({ at: x.at, type: x.type, error: x.error || null })).slice(-20)
    },
    threadsInsights: {
      account: accountInsights,
      posts: postInsights
    },
    funnel: {
      // Views are exposure, not profile visits. Do not mislabel them as profile views.
      threadsViews: accountInsights.metrics.views ?? 'unknown',
      profileViews: 'unknown',
      threadsLinkClicks: accountInsights.metrics.clicks ?? 'unknown',
      followersCount: accountInsights.metrics.followers_count ?? 'unknown',
      conversions: affiliate.orders,
      reward: affiliate.rewardYen,
      rewardStatus: affiliate.rewardStatus,
      profit: affiliate.profitYen
    },
    affiliateResults: affiliate,
    affiliateCapture,
    affiliateImport,
    decisions: {
      ...operationalAdvice({
        autoPosting: String(process.env.CFE_AUTO_POST_ENABLED || 'false').toLowerCase() === 'true',
        externalReply: String(process.env.CFE_EXTERNAL_REPLY_ENABLED || 'false').toLowerCase() === 'true',
        status
      }),
      revenueDataReadiness: affiliate.dataStatus,
      rewardStatus: affiliate.rewardStatus,
      evidenceNote: accountInsights.available
        ? 'Threads insights do not prove Rakuten affiliate conversions.'
        : 'Threads insights unavailable; do not infer missing click or conversion data as zero.'
    }
  };

  report.revenueDecisions = decideRevenueActions(report);

  writeJson(path.join(reportsDir, `${day}-night.json`), report);
  writeJson(path.join(dataDir, 'latest-night-evaluation.json'), report);
  return report;
}

function updateEnv(values) {
  if (!fs.existsSync(envFile)) return { changed: false, keys: [] };
  let text = fs.readFileSync(envFile, 'utf8');
  const changed = [];
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${escapeRegex(key)}=.*$`, 'm');
    const old = (text.match(re) || [null])[0];
    if (old === line) continue;
    if (re.test(text)) text = text.replace(re, line);
    else text += `${text.endsWith('\n') ? '' : '\r\n'}${line}\r\n`;
    changed.push(key);
  }
  if (changed.length) fs.writeFileSync(envFile, text, 'utf8');
  return { changed: changed.length > 0, keys: changed };
}

function recentReports(limit = 3) {
  if (!fs.existsSync(reportsDir)) return [];
  return fs.readdirSync(reportsDir).filter(x => /-night\.json$/.test(x)).sort().reverse().slice(0, limit).map(x => readJson(path.join(reportsDir, x), null)).filter(Boolean);
}

async function runDailyCommander() {
  let latest = readJson(path.join(dataDir, 'latest-night-evaluation.json'), null);
  if (!latest) latest = await buildNightReport();
  const history = recentReports(3);
  const current = readJson(stateFile, {});

  let maxReplies = 3;
  let minScore = 45;
  let queries = '家事 時短,収納 困る,掃除 面倒,献立 悩み,便利グッズ';
  const reasons = [];

  const recentFailures = history.reduce((n, r) => n + Number(r?.actuals?.externalRepliesFailed || 0), 0);
  const candidateCount = Number(latest?.actuals?.latestCandidateCount || current.lastCandidateCount || 0);
  const eligibleCount = Number(latest?.actuals?.latestEligibleCount || current.lastEligibleReplyCount || 0);
  const insightReports = history.filter(r => r?.threadsInsights?.account?.available);
  // Threads link clicks and impression views are NOT Rakuten affiliate link clicks or profile visits.
  const clicks = insightReports.reduce((n, r) => n + (Number.isFinite(r?.funnel?.threadsLinkClicks) ? r.funnel.threadsLinkClicks : 0), 0);
  const views = insightReports.reduce((n, r) => n + (Number.isFinite(r?.funnel?.threadsViews) ? r.funnel.threadsViews : 0), 0);

  if (recentFailures > 0 || current.browserOk === false) {
    maxReplies = 2;
    minScore = 55;
    reasons.push('Browser/reply failure detected: tighten reply policy.');
  } else if (candidateCount < 5) {
    minScore = 40;
    queries = '家事,時短,収納,掃除,献立';
    reasons.push('Candidate supply is low: broaden discovery while keeping daily cap fixed.');
  } else if (insightReports.length >= 3 && clicks > 0 && candidateCount >= 20 && eligibleCount >= 3) {
    maxReplies = 4;
    minScore = 45;
    reasons.push('Three-day Threads insights show link clicks with healthy candidate supply: allow a controlled increase to 4 replies/day.');
  } else if (insightReports.length >= 3 && views > 0 && clicks === 0) {
    maxReplies = 3;
    minScore = 50;
    reasons.push('Threads views exist but reported Threads link clicks are zero: improve traffic quality before increasing reply volume.');
  } else if (candidateCount >= 20 && eligibleCount >= 3) {
    reasons.push('Candidate supply is healthy: keep 3/day until downstream signal is mature.');
  } else {
    reasons.push('Keep baseline policy while gathering more observations.');
  }

  const strategy = {
    version: 'm8-daily-commander-v2',
    generatedAt: new Date().toISOString(),
    jstDate: dayKey(),
    mode: latest.status === 'CAUTION' ? 'CAUTION' : 'NORMAL',
    settings: {
      CFE_EXTERNAL_REPLY_MAX_PER_DAY: maxReplies,
      CFE_EXTERNAL_REPLY_MIN_SCORE: minScore,
      THREADS_DISCOVERY_QUERIES: queries,
      CFE_MAX_POSTS_PER_DAY: 3,
      CFE_POST_SLOTS: '07:30,12:30,19:30'
    },
    observed: {
      reportsWithThreadsInsights: insightReports.length,
      threeDayThreadsViews: insightReports.length ? views : 'unknown',
      threeDayThreadsLinkClicks: insightReports.length ? clicks : 'unknown'
    },
    constraints: {
      unknownMetricsAreNotZero: true,
      maxExternalRepliesHardLimit: 5,
      requireThreeDaysOfInsightsBeforeIncreasingReplyVolume: true
    },
    reasons
  };

  const applied = updateEnv(strategy.settings);
  strategy.applied = applied;
  writeJson(strategyFile, strategy);
  writeJson(path.join(dataDir, 'latest-daily-plan.json'), strategy);
  if (applied.changed) fs.writeFileSync(restartFlag, new Date().toISOString(), 'ascii');
  return strategy;
}

const mode = process.argv[2] || '';
if (mode === 'night-eval') {
  console.log(JSON.stringify(await buildNightReport(), null, 2));
} else if (mode === 'daily-commander') {
  console.log(JSON.stringify(await runDailyCommander(), null, 2));
} else {
  console.error('Usage: node src/operations-agent.js night-eval|daily-commander');
  process.exit(2);
}
