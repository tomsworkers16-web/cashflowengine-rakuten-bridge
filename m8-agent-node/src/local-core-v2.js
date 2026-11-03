import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { URL } from 'node:url';
import { chromium } from 'playwright-core';
import { makeExternalReplyEngine, scoreCandidate } from './external-reply-engine.js';

const env = process.env;
const DATA_DIR = path.resolve(env.CFE_DATA_DIR || '.data');
const PROFILE_DIR = path.resolve(env.THREADS_PROFILE_DIR || '.data/threads-profile');
const PORT = Number(env.CFE_LOCAL_PORT || 18787);
const THREADS_API_BASE = env.THREADS_API_BASE || 'https://graph.threads.net/v1.0';
const THREADS_ACCESS_TOKEN = env.THREADS_ACCESS_TOKEN || '';
const THREADS_USER_ID = env.THREADS_USER_ID || '';
const RAKUTEN_APPLICATION_ID = env.RAKUTEN_APPLICATION_ID || '';
const RAKUTEN_ACCESS_KEY = env.RAKUTEN_ACCESS_KEY || '';
const RAKUTEN_AFFILIATE_ID = env.RAKUTEN_AFFILIATE_ID || '';
const RAKUTEN_API_BASE = env.RAKUTEN_API_BASE || 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const AUTO_POST_ENABLED = String(env.CFE_AUTO_POST_ENABLED || 'false').toLowerCase() === 'true';
const HEADLESS = String(env.THREADS_HEADLESS || 'true').toLowerCase() === 'true';
const SCAN_MIN = Math.max(10, Number(env.THREADS_SCAN_INTERVAL_MINUTES || 30));
const MAX_POSTS = Math.max(1, Math.min(5, Number(env.CFE_MAX_POSTS_PER_DAY || 3)));
const CATCH_UP = String(env.CFE_CATCH_UP || 'true').toLowerCase() === 'true';
const SLOT_WINDOW_MIN = Number(env.CFE_SLOT_WINDOW_MINUTES || 20);
const SLOTS = (env.CFE_POST_SLOTS || '07:30,12:30,19:30').split(',').map(s => s.trim()).filter(Boolean);
const KEYWORDS = (env.RAKUTEN_KEYWORDS || 'キッチン 便利グッズ,収納 便利グッズ,家事 時短,掃除 便利グッズ,スマホ 便利グッズ').split(',').map(s => s.trim()).filter(Boolean);
const EXTERNAL_REPLY_ENABLED = String(env.CFE_EXTERNAL_REPLY_ENABLED || 'false').toLowerCase() === 'true';
const EXTERNAL_REPLY_MAX = Math.max(1, Math.min(10, Number(env.CFE_EXTERNAL_REPLY_MAX_PER_DAY || 3)));
const EXTERNAL_REPLY_MIN_SCORE = Math.max(20, Math.min(90, Number(env.CFE_EXTERNAL_REPLY_MIN_SCORE || 45)));
const DISCOVERY_QUERIES = (env.THREADS_DISCOVERY_QUERIES || '家事 時短,収納 困る,掃除 面倒,献立 悩み,便利グッズ').split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
const JST = 9 * 60 * 60 * 1000;

const stateFile = path.join(DATA_DIR, 'state.json');
const eventsFile = path.join(DATA_DIR, 'events.jsonl');
const candidatesFile = path.join(DATA_DIR, 'external-reply-candidates.json');
const postsFile = path.join(DATA_DIR, 'posts.jsonl');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PROFILE_DIR, { recursive: true });

let state = {
  version: 'm8-local-core-v2',
  startedAt: null,
  lastTickAt: null,
  lastPostAt: null,
  lastPostId: null,
  lastDecision: 'not_started',
  lastError: null,
  threadsUsername: null,
  browserOk: false,
  lastBrowserError: null,
  lastThreadsScanAt: null,
  lastCandidateCount: 0,
  lastEligibleReplyCount: 0,
  lastExternalReplyAt: null,
  lastExternalReplyResult: null,
  lastRakutenKeyword: null
};

try {
  if (fs.existsSync(stateFile)) state = { ...state, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) };
} catch {}

function saveState() { fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8'); }
function append(file, row) { fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8'); }
function event(type, meta = {}) {
  const row = { at: new Date().toISOString(), type, ...meta };
  append(eventsFile, row);
  console.log(`[${type}]`, JSON.stringify(meta));
}
function nowJst() { return new Date(Date.now() + JST); }
function dayKey() { return nowJst().toISOString().slice(0, 10); }
function jstMinutes() { const d = nowJst(); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
function slotMinutes(s) { const [h, m] = s.split(':').map(Number); return h * 60 + m; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
}
function todayLocalPosts() { return readJsonl(postsFile).filter(x => String(x.jstDate || '') === dayKey()); }

async function fetchJson(url, { method = 'GET', attempts = 3, timeoutMs = 12000 } = {}) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    try {
      const r = await fetch(url, { method, signal: c.signal });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(`HTTP_${r.status}`); e.status = r.status; e.details = data; throw e; }
      return data;
    } catch (e) {
      last = e;
      const st = Number(e?.status || 0);
      if (i >= attempts || !(e?.name === 'AbortError' || st === 429 || st >= 500 || st === 0)) break;
      await sleep(400 * i);
    } finally { clearTimeout(t); }
  }
  throw last || new Error('fetch_failed');
}

async function threads(pathname, { method = 'GET', params = {}, attempts = 3 } = {}) {
  if (!THREADS_ACCESS_TOKEN) throw new Error('threads_access_token_missing');
  const u = new URL(`${THREADS_API_BASE}${pathname}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  u.searchParams.set('access_token', THREADS_ACCESS_TOKEN);
  return fetchJson(u, { method, attempts });
}

async function threadsHealth() {
  const me = await threads('/me', { params: { fields: 'id,username,name' } });
  if (me?.username) state.threadsUsername = me.username;
  return { ok: true, id: me?.id || THREADS_USER_ID, username: me?.username || null };
}

async function threadsToday() {
  const d = await threads('/me/threads', { params: { fields: 'id,text,timestamp,permalink', limit: '50' } });
  const start = new Date(`${dayKey()}T00:00:00+09:00`).getTime();
  return (d?.data || []).filter(p => new Date(p.timestamp || 0).getTime() >= start);
}

async function publishThreads(text) {
  const p = await threads('/me/threads', { method: 'POST', params: { media_type: 'TEXT', text, auto_publish_text: 'true' }, attempts: 2 });
  if (!p?.id) throw new Error('threads_publish_no_id');
  return p.id;
}

function normalizeItem(entry) {
  const i = entry?.Item || entry?.item || entry || {};
  return {
    itemName: i.itemName || '', price: Number(i.itemPrice || 0), affiliateUrl: i.affiliateUrl || '',
    reviewCount: Number(i.reviewCount || 0), reviewAverage: Number(i.reviewAverage || 0),
    shopName: i.shopName || '', pointRate: Number(i.pointRate || 0), postageFlag: i.postageFlag, itemCode: i.itemCode || ''
  };
}
function itemScore(i) {
  let s = 0;
  if (i.reviewAverage >= 4.5) s += 30; else if (i.reviewAverage >= 4.2) s += 24; else if (i.reviewAverage >= 4) s += 18;
  if (i.reviewCount >= 2000) s += 30; else if (i.reviewCount >= 500) s += 24; else if (i.reviewCount >= 100) s += 16;
  if (i.price >= 1000 && i.price <= 5000) s += 20; else if (i.price > 5000 && i.price <= 10000) s += 12; else if (i.price > 0) s += 8;
  if (i.postageFlag === 0 || i.postageFlag === '0') s += 10;
  if (i.pointRate >= 5) s += 5;
  if (/^https?:\/\//.test(i.affiliateUrl)) s += 5;
  return s;
}
async function rakutenBest(keyword) {
  if (!RAKUTEN_APPLICATION_ID || !RAKUTEN_ACCESS_KEY || !RAKUTEN_AFFILIATE_ID) throw new Error('rakuten_credentials_missing');
  const q = new URLSearchParams({ applicationId: RAKUTEN_APPLICATION_ID, accessKey: RAKUTEN_ACCESS_KEY, affiliateId: RAKUTEN_AFFILIATE_ID, keyword, format: 'json', hits: '20', sort: '-reviewCount', availability: '1' });
  const data = await fetchJson(`${RAKUTEN_API_BASE}?${q}`, { attempts: 2 });
  return (data.Items || data.items || []).map(normalizeItem).filter(i => /^https?:\/\//.test(i.affiliateUrl)).sort((a, b) => itemScore(b) - itemScore(a))[0] || null;
}

function roleForSlot(slot) {
  const idx = SLOTS.indexOf(slot);
  if (SLOTS.length <= 1) return 'revenue';
  if (SLOTS.length === 2) return idx === 0 ? 'growth' : 'revenue';
  if (SLOTS.length === 3) return ['growth', 'revenue', 'trust'][idx] || 'growth';
  return ['growth', 'revenue', 'trust', 'growth', 'revenue'][idx] || 'growth';
}
function growthText(seed = '暮らしの時短') {
  const v = [
    `${seed}で「これだけは毎回めんどう」って作業、何ですか？\n便利グッズを探すなら、まずリアルな困りごとから知りたいです。`,
    `${seed}って、安い物より「毎日の手間が1つ減る物」の方が満足度高い気がします。\n何を一番ラクにしたいですか？`,
    `${seed}の便利アイテム、選ぶならどれを優先します？\n①時短 ②片付けやすさ ③価格 ④手入れの楽さ`
  ];
  return v[new Date().getDate() % v.length];
}
function trustText(seed = '暮らしの時短') { return `${seed}の物を選ぶときは「便利そう」だけでなく、\n・置き場所\n・洗いやすさ\n・毎週使うか\nまで見ると失敗しにくいです。\n結局、使い続けられる物が一番コスパいい。`; }
function revenueText(i) {
  const name = String(i.itemName || '便利アイテム').replace(/\s+/g, ' ').slice(0, 90);
  const price = i.price ? `\n目安 ${i.price.toLocaleString('ja-JP')}円。` : '';
  return `【PR】便利グッズは「毎日使うか」で選ぶ派です。\n今回気になったのは ${name}${price}\n詳細はこちら👇\n${i.affiliateUrl}`.slice(0, 500);
}
function dueSlot() {
  const now = jstMinutes();
  for (const s of SLOTS) { const age = now - slotMinutes(s); if (age >= 0 && age <= SLOT_WINDOW_MIN) return s; }
  return null;
}

async function postFor(slot, { catchup = false } = {}) {
  const official = await threadsToday();
  if (official.length >= MAX_POSTS) { state.lastDecision = 'daily_cap_reached'; return; }
  if (todayLocalPosts().some(p => p.slot === slot)) { state.lastDecision = 'slot_already_posted'; return; }
  let role = catchup ? 'growth' : roleForSlot(slot), text;
  let meta = { role, slot, catchup };
  if (role === 'revenue') {
    try {
      const kw = KEYWORDS[(new Date().getDate() + Math.max(0, SLOTS.indexOf(slot))) % KEYWORDS.length];
      state.lastRakutenKeyword = kw;
      const item = await rakutenBest(kw);
      if (item) { text = revenueText(item); meta = { ...meta, keyword: kw, itemCode: item.itemCode, price: item.price }; }
    } catch (e) { event('RAKUTEN_FALLBACK', { error: e.message }); role = 'growth'; meta.role = 'growth_fallback'; }
  }
  if (!text) text = role === 'trust' ? trustText() : growthText();
  const id = await publishThreads(text);
  const row = { at: new Date().toISOString(), jstDate: dayKey(), slot, id, text, meta };
  append(postsFile, row);
  Object.assign(state, { lastPostAt: row.at, lastPostId: id, lastDecision: 'posted', lastError: null });
  saveState(); event('POSTED', { id, slot, role: meta.role, catchup });
}

async function postingTick() {
  state.lastTickAt = new Date().toISOString();
  try {
    if (!AUTO_POST_ENABLED) { state.lastDecision = 'disabled'; saveState(); return; }
    await threadsHealth();
    const s = dueSlot();
    if (s) { await postFor(s); saveState(); return; }
    if (CATCH_UP) {
      const mins = jstMinutes();
      const official = await threadsToday();
      if (official.length === 0 && mins >= 16 * 60 && mins < 19 * 60) {
        const key = `catchup-${dayKey()}`;
        if (!todayLocalPosts().some(p => p.slot === key)) await postFor(key, { catchup: true });
      }
    }
    state.lastDecision = state.lastDecision === 'posted' ? 'posted' : 'waiting';
    state.lastError = null;
  } catch (e) { state.lastDecision = 'error'; state.lastError = e.message; event('POST_ERROR', { error: e.message }); }
  saveState();
}

const chromeCandidates = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
function chromeExe() { const p = chromeCandidates.find(fs.existsSync); if (!p) throw new Error('chrome_not_found'); return p; }

async function extractCandidates(page, source) {
  await page.waitForTimeout(2500);
  await page.mouse.wheel(0, 1600).catch(() => {});
  await page.waitForTimeout(1200);
  return page.locator('a[href*="/post/"]').evaluateAll((links, sourceName) => {
    const rows = [];
    for (const a of links.slice(0, 80)) {
      const href = a.getAttribute('href');
      if (!href) continue;
      let node = a;
      let container = null;
      for (let i = 0; i < 8 && node; i++, node = node.parentElement) {
        const txt = (node.innerText || '').replace(/\s+/g, ' ').trim();
        if (txt.length >= 25 && txt.length <= 2500) { container = node; }
      }
      container = container || a.closest('article') || a.parentElement;
      if (!container) continue;
      const text = (container.innerText || '').replace(/\s+/g, ' ').trim();
      const authorHref = [...container.querySelectorAll('a[href^="/@"]')].map(x => x.getAttribute('href')).find(Boolean) || '';
      rows.push({ href, text, author: authorHref.replace(/^\//, ''), discoverySource: sourceName });
    }
    return rows;
  }, source).catch(() => []);
}

async function scanThreads(page) {
  const targets = [{ url: 'https://www.threads.com/', source: 'home' }];
  for (const q of DISCOVERY_QUERIES) {
    targets.push({ url: `https://www.threads.com/search?q=${encodeURIComponent(q)}&serp_type=default`, source: `search:${q}` });
  }

  const seen = new Set();
  const out = [];
  let loggedIn = true;
  for (const target of targets) {
    try {
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1800);
      if (/login|accounts\/login/i.test(page.url())) { loggedIn = false; break; }
      const posts = await extractCandidates(page, target.source);
      for (const p of posts) {
        if (!p.href || !p.text) continue;
        const url = p.href.startsWith('http') ? p.href : `https://www.threads.com${p.href}`;
        if (seen.has(url)) continue;
        seen.add(url);
        out.push({ source: 'm8-local-playwright', discoverySource: p.discoverySource, author: p.author, url, text: p.text.slice(0, 1200), discoveredAt: new Date().toISOString() });
      }
      if (out.length >= 30) break;
    } catch (e) {
      event('THREADS_DISCOVERY_TARGET_ERROR', { source: target.source, error: e.message });
    }
  }
  return { loggedIn, candidates: out.slice(0, 30) };
}

async function browserLoop() {
  try {
    let ownUsername = state.threadsUsername || '';
    try { ownUsername = (await threadsHealth()).username || ownUsername; } catch {}
    const replyEngine = makeExternalReplyEngine({ dataDir: DATA_DIR, ownUsername, maxPerDay: EXTERNAL_REPLY_MAX, minScore: EXTERNAL_REPLY_MIN_SCORE, enabled: EXTERNAL_REPLY_ENABLED, event });
    const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      executablePath: chromeExe(), headless: HEADLESS, chromiumSandbox: true,
      viewport: { width: 1440, height: 1000 }, args: ['--disable-blink-features=AutomationControlled']
    });
    state.browserOk = true; state.lastBrowserError = null; saveState();

    const run = async () => {
      try {
        const page = ctx.pages()[0] || await ctx.newPage();
        const r = await scanThreads(page);
        state.lastThreadsScanAt = new Date().toISOString();
        state.lastCandidateCount = r.candidates.length;
        state.lastEligibleReplyCount = r.candidates.filter(c => scoreCandidate(c, { ownUsername }).eligible).length;
        if (!r.loggedIn) {
          state.browserOk = false;
          state.lastBrowserError = 'threads_reauth_required';
          event('THREADS_REAUTH_REQUIRED');
        } else {
          fs.writeFileSync(candidatesFile, JSON.stringify({ scannedAt: state.lastThreadsScanAt, queries: DISCOVERY_QUERIES, candidates: r.candidates.map(c => ({...c, evaluation: scoreCandidate(c, { ownUsername })})) }, null, 2), 'utf8');
          event('THREADS_SCAN', { count: r.candidates.length, eligible: state.lastEligibleReplyCount, queries: DISCOVERY_QUERIES.length });
          const rr = await replyEngine.run(page, r.candidates);
          state.lastExternalReplyResult = rr;
          if (rr.posted > 0) state.lastExternalReplyAt = new Date().toISOString();
          state.browserOk = true; state.lastBrowserError = null;
        }
        saveState();
      } catch (e) {
        state.browserOk = false; state.lastBrowserError = e.message; saveState();
        event('THREADS_SCAN_ERROR', { error: e.message });
      }
    };

    await run();
    setInterval(() => run().catch(() => {}), SCAN_MIN * 60 * 1000);
  } catch (e) {
    state.browserOk = false; state.lastBrowserError = e.message; saveState();
    event('BROWSER_START_ERROR', { error: e.message });
  }
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  if (u.pathname === '/health') {
    let th = { ok: false };
    try { th = await threadsHealth(); } catch (e) { th = { ok: false, error: e.message }; }
    res.end(JSON.stringify({
      ok: true, mode: 'm8-local-only', state, threads: th,
      autoPostEnabled: AUTO_POST_ENABLED, slots: SLOTS, maxPostsPerDay: MAX_POSTS,
      externalReply: { enabled: EXTERNAL_REPLY_ENABLED, maxPerDay: EXTERNAL_REPLY_MAX, minScore: EXTERNAL_REPLY_MIN_SCORE, browserOk: state.browserOk, lastError: state.lastBrowserError, discoveryQueries: DISCOVERY_QUERIES },
      externalRuntimeDependencies: [], directExternalApis: ['Meta Threads API','Rakuten API']
    }, null, 2)); return;
  }
  if (u.pathname === '/status') { res.end(JSON.stringify(state, null, 2)); return; }
  if (u.pathname === '/external-reply/candidates') {
    res.end(fs.existsSync(candidatesFile) ? fs.readFileSync(candidatesFile, 'utf8') : JSON.stringify({ candidates: [] })); return;
  }
  res.statusCode = 404; res.end(JSON.stringify({ error: 'not_found' }));
}).listen(PORT, '127.0.0.1', () => event('LOCAL_API_STARTED', { url: `http://127.0.0.1:${PORT}` }));

state.version = 'm8-local-core-v2';
state.startedAt = new Date().toISOString();
saveState();
event('M8_LOCAL_CORE_STARTED', { version: state.version, slots: SLOTS, autoPostEnabled: AUTO_POST_ENABLED, externalReplyEnabled: EXTERNAL_REPLY_ENABLED });
postingTick();
setInterval(() => postingTick().catch(() => {}), 60000);
browserLoop().catch(() => {});