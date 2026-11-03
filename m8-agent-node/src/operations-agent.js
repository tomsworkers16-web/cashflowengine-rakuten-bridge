import fs from 'node:fs';
import path from 'node:path';

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
const JST = 9 * 60 * 60 * 1000;

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

function nowJst() { return new Date(Date.now() + JST); }
function dayKey(d = nowJst()) { return d.toISOString().slice(0, 10); }
function readJson(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
}
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
function withinDay(row, day) { return String(row?.jstDate || '') === day || String(row?.at || '').slice(0, 10) === day; }
function eventCount(rows, type) { return rows.filter(x => x.type === type).length; }

function buildNightReport(day = dayKey()) {
  const state = readJson(stateFile, {});
  const posts = readJsonl(postsFile).filter(x => withinDay(x, day));
  const replies = readJsonl(repliesFile).filter(x => withinDay(x, day));
  const events = readJsonl(eventsFile).filter(x => withinDay(x, day));
  const candidates = readJson(candidatesFile, { candidates: [] })?.candidates || [];
  const replyPosted = replies.filter(x => x.status === 'posted');
  const replyFailed = replies.filter(x => x.status === 'failed');
  const errors = events.filter(x => /ERROR|REAUTH|FAILED/.test(String(x.type || '')));
  const status = !state.browserOk || replyFailed.length > 0 || eventCount(events, 'POST_ERROR') > 0 ? 'CAUTION' : 'NORMAL';

  const report = {
    version: 'm8-night-eval-v1',
    generatedAt: new Date().toISOString(),
    jstDate: day,
    status,
    actuals: {
      posts: posts.length,
      postsByRole: posts.reduce((a, x) => { const k = x?.meta?.role || 'unknown'; a[k] = (a[k] || 0) + 1; return a; }, {}),
      externalRepliesPosted: replyPosted.length,
      externalRepliesFailed: replyFailed.length,
      latestCandidateCount: candidates.length,
      latestEligibleCount: candidates.filter(x => x?.evaluation?.eligible).length,
      browserOk: state.browserOk ?? null,
      lastThreadsScanAt: state.lastThreadsScanAt || null,
      lastPostAt: state.lastPostAt || null,
      lastExternalReplyAt: state.lastExternalReplyAt || null,
      errors: errors.map(x => ({ at: x.at, type: x.type, error: x.error || null })).slice(-20)
    },
    funnel: {
      profileViews: 'unknown',
      linkClicks: 'unknown',
      conversions: 'unknown',
      reward: 'unknown',
      profit: 'unknown'
    },
    decisions: {
      keepAutoPostEnabled: true,
      keepExternalReplyEnabled: true,
      increaseReplyVolume: false,
      reason: 'Downstream profile/click/CV signals are not yet locally measurable; keep experimentation conservative.'
    }
  };

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
    const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=.*$`, 'm');
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

function runDailyCommander() {
  const latest = readJson(path.join(dataDir, 'latest-night-evaluation.json'), null) || buildNightReport();
  const history = recentReports(3);
  const current = readJson(stateFile, {});

  let maxReplies = 3;
  let minScore = 45;
  let queries = '家事 時短,収納 困る,掃除 面倒,献立 悩み,便利グッズ';
  const reasons = [];

  const recentFailures = history.reduce((n, r) => n + Number(r?.actuals?.externalRepliesFailed || 0), 0);
  const candidateCount = Number(latest?.actuals?.latestCandidateCount || current.lastCandidateCount || 0);
  const eligibleCount = Number(latest?.actuals?.latestEligibleCount || current.lastEligibleReplyCount || 0);

  if (recentFailures > 0 || current.browserOk === false) {
    maxReplies = 2;
    minScore = 55;
    reasons.push('Browser/reply failure detected: tighten reply policy.');
  } else if (candidateCount < 5) {
    minScore = 40;
    queries = '家事,時短,収納,掃除,献立';
    reasons.push('Candidate supply is low: broaden discovery while keeping daily cap fixed.');
  } else if (candidateCount >= 20 && eligibleCount >= 3) {
    reasons.push('Candidate supply is healthy: keep conservative 3/day cap until downstream funnel metrics are measurable.');
  } else {
    reasons.push('Keep baseline policy while gathering more observations.');
  }

  const strategy = {
    version: 'm8-daily-commander-v1',
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
    constraints: {
      noAutomaticVolumeIncreaseWithoutDownstreamMetrics: true,
      unknownMetricsAreNotZero: true,
      maxExternalRepliesHardLimit: 5
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
  console.log(JSON.stringify(buildNightReport(), null, 2));
} else if (mode === 'daily-commander') {
  console.log(JSON.stringify(runDailyCommander(), null, 2));
} else {
  console.error('Usage: node src/operations-agent.js night-eval|daily-commander');
  process.exit(2);
}
