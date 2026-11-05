import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';
import { chromium } from 'playwright-core';
import { shouldRunNightly, nightlyWindow } from './nightly-schedule.js';
import { makeExternalReplyEngine, scoreCandidate } from './external-reply-engine.js';
import { roleForSlot, editorialText, revenueText, validatePublicationText } from './product-posting.js';
import { approvedImageFor, renderProductCard, publishImageBrowser } from './image-card.js';
import { publishTextOnce, findRecoverablePosts, postedNearAttempt, imageSubmitMayHaveHappened } from './posting-guard.js';

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
const IMAGE_CARD_ENABLED = String(env.CFE_IMAGE_CARD_ENABLED || 'true').toLowerCase() === 'true';
const IMAGE_POST_ENABLED = String(env.CFE_IMAGE_POST_ENABLED || 'false').toLowerCase() === 'true';
let imageBrowserContext = null;
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
  lastRakutenKeyword: null,
  lastImagePostAt: null,
  lastImagePostResult: null,
  lastImageTemplate: null,
  lastImagePostError: null,
  imageFallbackUsed: false,
  lastNightEvalAttemptDay: null,
  lastNightEvalCompletedDay: null,
  lastNightEvalError: null
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
  const p = await threads('/me/threads', { method: 'POST', params: { media_type: 'TEXT', text, auto_publish_text: 'true' }, attempts: 1 });
  if (!p?.id) throw new Error('threads_publish_no_id');
  return p.id;
}

function normalizeItem(entry) {
  const i = entry?.Item || entry?.item || entry || {};
  return {
    itemName: i.itemName || '', price: Number(i.itemPrice || 0), affiliateUrl: i.affiliateUrl || '',
    reviewCount: Number(i.reviewCount || 0), reviewAverage: Number(i.reviewAverage || 0),
    shopName: i.shopName || '', pointRate: Number(i.pointRate || 0), postageFlag: i.postageFlag, itemCode: i.itemCode || '',
    mediumImageUrls: i.mediumImageUrls || [], smallImageUrls: i.smallImageUrls || []
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
async function rakutenBest(keyword, excluded = new Set(), role = 'discovery') {
  if (!RAKUTEN_APPLICATION_ID || !RAKUTEN_ACCESS_KEY || !RAKUTEN_AFFILIATE_ID) throw new Error('rakuten_credentials_missing');
  const q = new URLSearchParams({ applicationId: RAKUTEN_APPLICATION_ID, accessKey: RAKUTEN_ACCESS_KEY, affiliateId: RAKUTEN_AFFILIATE_ID, keyword, format: 'json', hits: '20', sort: '-reviewCount', availability: '1', imageFlag: '1' });
  const data = await fetchJson(`${RAKUTEN_API_BASE}?${q}`, { attempts: 2 });
  const items = (data.Items || data.items || []).map(normalizeItem)
    .filter(i => i.itemName && i.itemCode && i.price > 0 && /^https:\/\//.test(i.affiliateUrl))
    .sort((a, b) => itemScore(b) - itemScore(a));
  const candidates = items.filter(i => !excluded.has(i.itemCode));
  if (IMAGE_CARD_ENABLED) {
    const licensed = candidates.find(i => approvedImageFor(i, DATA_DIR, { hasAffiliateLink: role === 'revenue' }));
    if (licensed) return licensed;
  }
  return candidates[0] || null;
}

function recentlyFeaturedItems() {
  const cutoff = Date.now() - 7 * 86400000;
  return new Set(readJsonl(postsFile).filter(p => Date.parse(p.at || '') >= cutoff)
    .map(p => p.meta?.itemCode).filter(Boolean));
}
function safeFallbackText() {
  return '便利グッズを選ぶときは、価格だけでなく「置き場所」「手入れのしやすさ」「本当に使う頻度」まで確認したい。\n\n買う前のひと手間で、使わなくなる失敗を減らせそう。';
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
  const role = catchup ? 'discovery' : roleForSlot(slot, SLOTS, nowJst().getUTCDate());
  let text = null;
  let chosenItem = null;
  const meta = { role, slot, catchup, copyPolicy: 'product-first-v1' };
  const used = recentlyFeaturedItems();
  const keywordBase = (nowJst().getUTCDate() + Math.max(0, SLOTS.indexOf(slot))) % KEYWORDS.length;
  for (let attempt = 0; attempt < Math.min(KEYWORDS.length, 3) && !text; attempt++) {
    const kw = KEYWORDS[(keywordBase + attempt) % KEYWORDS.length];
    try {
      state.lastRakutenKeyword = kw;
      const item = await rakutenBest(kw, used, role);
      if (!item) continue;
      text = role === 'revenue' ? revenueText(item) : editorialText(item, role);
      if (text) {
        chosenItem = item;
        Object.assign(meta, { keyword: kw, itemCode: item.itemCode, price: item.price, affiliate: role === 'revenue' });
      }
    } catch (e) { event('RAKUTEN_PRODUCT_ERROR', { keyword: kw, error: e.message }); }
  }
  if (!text) {
    if (role === 'revenue') {
      state.lastDecision = 'revenue_skipped_no_valid_product';
      event('POST_SKIPPED', { slot, reason: state.lastDecision });
      return;
    }
    // Non-commercial fallback: no invented product, testimonial or broken link.
    text = safeFallbackText();
    meta.role = 'editorial_fallback';
    if (todayLocalPosts().some(p => p.text === text)) {
      state.lastDecision = 'fallback_already_posted'; return;
    }
  }
  // Validate before browser image submit or text POST, including editorial fallback.
  const copyError = validatePublicationText(text, {
    revenue: role === 'revenue',
    affiliateUrl: chosenItem?.affiliateUrl || null
  });
  if (copyError) {
    state.lastDecision = 'unsafe_copy_skipped';
    event('POST_SKIPPED', { slot, reason: copyError });
    saveState();
    return;
  }
  if (official.some(p => String(p.text || '').trim() === text.trim())) {
    state.lastDecision = 'duplicate_official_text'; return;
  }
  let id = null;
  let imageCard = null;
  if (IMAGE_CARD_ENABLED && chosenItem && imageBrowserContext) {
    try {
      imageCard = await renderProductCard(imageBrowserContext, chosenItem, role, DATA_DIR, { hasAffiliateLink: role === 'revenue' });
      state.lastImageTemplate = imageCard.template;
      state.lastImagePostResult = 'card_generated';
      state.lastImagePostError = null;
      event('IMAGE_CARD_GENERATED', { slot, itemCode: meta.itemCode, template: imageCard.template });
    } catch (e) {
      state.lastImagePostResult = 'card_generation_failed';
      state.lastImagePostError = e.message;
      event('IMAGE_CARD_ERROR', { slot, error: e.message });
    }
  }
  if (IMAGE_POST_ENABLED && imageCard && imageBrowserContext) {
    let imageSubmitAttempted = false;
    try {
      // Write an intent *before* any browser interaction, so process crashes never
      // cause blind resubmission of a possibly published image.
      const imageAttemptAt = new Date().toISOString();
      append(postsFile, {at:imageAttemptAt, jstDate:dayKey(), slot, id:null, text,
        meta:{...meta,publishStatus:'pending',imageTemplate:imageCard.template}});
      const result = await publishImageBrowser(imageBrowserContext, imageCard.path, text);
      imageSubmitAttempted = imageSubmitMayHaveHappened(result);
      state.lastImagePostResult = result.status;
      // The browser's submit click is NOT a durable success guarantee.
      // Check the official API; never blindly publish the same text through the API.
      await sleep(5000);
      const verified = (await threadsToday()).find(p => String(p.text || '').trim() === text.trim() && postedNearAttempt(p, imageAttemptAt));
      if (verified?.id) {
        id = verified.id;
        state.lastImagePostResult = 'verified_posted';
        state.lastImagePostAt = new Date().toISOString();
      } else {
        state.lastDecision = 'image_publish_unverified';
        state.lastImagePostError = 'browser_submit_not_confirmed_by_threads_api';
        append(postsFile, { at: new Date().toISOString(), jstDate: dayKey(), slot, id: null, text, meta: { ...meta, publishStatus: 'unverified', imageTemplate: imageCard.template } });
        saveState();
        event('IMAGE_POST_UNVERIFIED', { slot, itemCode: meta.itemCode });
        return;
      }
    } catch (e) {
      imageSubmitAttempted = imageSubmitAttempted || imageSubmitMayHaveHappened(null, e);
      state.lastImagePostResult = imageSubmitAttempted ? 'uncertain' : 'failed_before_submit';
      state.lastImagePostError = e.message;
      event('IMAGE_POST_ERROR', { slot, error: e.message, submitAttempted: imageSubmitAttempted });
      if (imageSubmitAttempted) {
        // Uncertain post outcome: do not text-fallback or retry, to avoid duplicates.
        state.lastDecision = 'image_publish_uncertain';
        append(postsFile, { at: new Date().toISOString(), jstDate: dayKey(), slot, id: null, text, meta: { ...meta, publishStatus: 'uncertain' } });
        saveState();
        return;
      }
      state.imageFallbackUsed = true;
    }
  }
  if (!id) {
    const attempt = await publishTextOnce({
      text, slot, jstDate: dayKey(), meta,
      record: row => append(postsFile, row),
      send: publishThreads,
      lookup: threadsToday
    });
    if (attempt.status === 'uncertain') {
      // A timeout can mean the post succeeded. Never retry this slot automatically.
      state.lastDecision = 'text_publish_uncertain';
      state.lastError = attempt.reason;
      saveState();
      event('TEXT_POST_UNCERTAIN', {slot, itemCode: meta.itemCode || null, reason: attempt.reason});
      return;
    }
    id = attempt.id;
  } else {
    // Verified image publication, no text API fallback required.
    append(postsFile, {at: new Date().toISOString(), jstDate: dayKey(), slot, id, text,
      meta: {...meta, publishStatus:'verified_posted', imageTemplate:imageCard?.template}});
  }
  const row = { at: new Date().toISOString(), jstDate: dayKey(), slot, id, text, meta };
  Object.assign(state, { lastPostAt: row.at, lastPostId: id, lastDecision: 'posted', lastError: null });
  saveState(); event('POSTED', { id, slot, role: meta.role, itemCode: meta.itemCode || null, catchup });
}

// Runs a separate non-posting reporting process at 23:45 JST once per day.
let nightlyBusy=false;
async function nightlyTick() {
  if(nightlyBusy) return;
  const nowMs=Date.now();
  if(!shouldRunNightly({nowMs,lastCompletedDay:state.lastNightEvalCompletedDay,
    lastAttemptDay:state.lastNightEvalAttemptDay})) return;
  nightlyBusy=true;
  const {jstDay}=nightlyWindow(nowMs);
  state.lastNightEvalAttemptDay=jstDay;
  saveState();
  event('NIGHT_EVAL_STARTED',{jstDay});
  try {
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['src/operations-agent.js','night-eval'],{
        cwd:process.cwd(),env:process.env,windowsHide:true,stdio:['ignore','ignore','pipe']
      });
      let errorText='';
      child.stderr.on('data',chunk=>{errorText=(errorText+String(chunk)).slice(-500);});
      child.once('error',reject);
      child.once('exit',code=>code===0?resolve():reject(new Error('night_eval_exit_'+code+' '+errorText)));
    });
    state.lastNightEvalCompletedDay=jstDay;
    state.lastNightEvalError=null;
    event('NIGHT_EVAL_COMPLETED',{jstDay});
  } catch(e) {
    state.lastNightEvalError=String(e.message||'night_eval_failed').slice(0,250);
    event('NIGHT_EVAL_ERROR',{jstDay,error:state.lastNightEvalError});
  } finally {nightlyBusy=false;saveState();}
}

let postingBusy = false;
async function postingTick() {
  if (postingBusy) return;
  postingBusy = true;
  state.lastTickAt = new Date().toISOString();
  try {
    if (!AUTO_POST_ENABLED) { state.lastDecision = 'disabled'; saveState(); return; }
    await threadsHealth();
    // Recover uncertain post IDs from the official timeline without resubmitting content.
    try {
      const journal = todayLocalPosts();
      if (journal.some(x => !x.id && ['pending','uncertain','unverified'].includes(String(x.meta?.publishStatus || '')))) {
        const matches = findRecoverablePosts(journal, await threadsToday(), dayKey());
        for (const row of matches) {
          append(postsFile, row);
          event('POST_RECONCILED', {slot:row.slot, id:row.id});
        }
      }
    } catch (e) {
      event('POST_RECONCILE_ERROR', {error:e.message});
    }
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
  finally { postingBusy = false; saveState(); }
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
    imageBrowserContext = ctx;
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
      imagePosting: { cardGenerationEnabled: IMAGE_CARD_ENABLED, browserPublishingEnabled: IMAGE_POST_ENABLED, browserReady: Boolean(imageBrowserContext), lastResult: state.lastImagePostResult, lastError: state.lastImagePostError },
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

state.version = 'm8-local-core-v2-image-card-v3';
state.startedAt = new Date().toISOString();
saveState();
event('M8_LOCAL_CORE_STARTED', { version: state.version, slots: SLOTS, autoPostEnabled: AUTO_POST_ENABLED, externalReplyEnabled: EXTERNAL_REPLY_ENABLED });
postingTick();
setInterval(() => postingTick().catch(() => {}), 60000);
nightlyTick().catch(e=>event('NIGHT_EVAL_ERROR',{error:e.message}));
setInterval(() => nightlyTick().catch(e=>event('NIGHT_EVAL_ERROR',{error:e.message})), 60000);
browserLoop().catch(() => {});