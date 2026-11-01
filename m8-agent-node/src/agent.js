import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';

const env = process.env;
const bridgeBaseUrl = env.CFE_BRIDGE_BASE_URL || 'https://cashflowengine-rakuten-bridge.onrender.com';
const nodeId = env.CFE_M8_NODE_ID || 'm8-node-001';
const sharedSecret = env.CFE_M8_SHARED_SECRET || '';
const profileDir = path.resolve(env.THREADS_PROFILE_DIR || '.data/threads-profile');
const scanIntervalMinutes = Math.max(10, Number(env.THREADS_SCAN_INTERVAL_MINUTES || 30));
const headless = String(env.THREADS_HEADLESS || 'false').toLowerCase() === 'true';
const maxCandidates = Math.max(1, Math.min(20, Number(env.THREADS_MAX_CANDIDATES || 10)));

const chromeExeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
];

function findChromeExecutable() {
  for (const p of chromeExeCandidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Google Chrome が見つかりません。Chromeをインストールしてください。');
}

function authHeaders() {
  const h = { 'content-type': 'application/json' };
  if (sharedSecret) h['x-cfe-m8-secret'] = sharedSecret;
  return h;
}

async function postJson(endpoint, body) {
  const res = await fetch(`${bridgeBaseUrl}${endpoint}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

async function heartbeat(status, extra = {}) {
  try {
    await postJson('/automation/external-reply-node/heartbeat', {
      nodeId,
      status,
      hostname: os.hostname(),
      platform: process.platform,
      timestamp: new Date().toISOString(),
      ...extra
    });
  } catch (err) {
    console.error('[heartbeat]', err.message);
  }
}

function normalizeText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

async function scanThreads(page) {
  await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  const currentUrl = page.url();
  if (/login|accounts\/login/i.test(currentUrl)) {
    return { loggedIn: false, candidates: [], currentUrl };
  }

  const profileVisible = await page.locator('a[href*="/@@rakumitsu_select"], a[href*="/@rakumitsu_select"]').count().catch(() => 0);
  const posts = await page.locator('article').evaluateAll((articles, limit) => {
    const out = [];
    for (const article of articles.slice(0, limit * 3)) {
      const text = (article.innerText || '').replace(/\s+/g, ' ').trim();
      const anchors = [...article.querySelectorAll('a[href*="/post/"]')];
      const href = anchors.map(a => a.getAttribute('href')).find(Boolean);
      const authorAnchor = [...article.querySelectorAll('a[href^="/@"]')].find(a => !String(a.getAttribute('href') || '').includes('/post/'));
      const author = authorAnchor?.getAttribute('href')?.replace(/^\//, '') || '';
      if (!href || !text) continue;
      out.push({ text, href, author });
      if (out.length >= limit) break;
    }
    return out;
  }, maxCandidates).catch(() => []);

  const seen = new Set();
  const candidates = [];
  for (const p of posts) {
    const url = p.href.startsWith('http') ? p.href : `https://www.threads.com${p.href}`;
    if (seen.has(url)) continue;
    seen.add(url);
    candidates.push({
      source: 'm8-playwright',
      author: p.author,
      url,
      text: normalizeText(p.text).slice(0, 1200),
      discoveredAt: new Date().toISOString()
    });
  }

  return { loggedIn: profileVisible > 0 || !/login/i.test(currentUrl), candidates, currentUrl };
}

async function runOnce(context) {
  const page = context.pages()[0] || await context.newPage();
  try {
    const result = await scanThreads(page);
    if (!result.loggedIn) {
      await heartbeat('reauth_required', { currentUrl: result.currentUrl });
      console.error('[threads] ログインが必要です。');
      return;
    }

    await heartbeat('healthy', { candidateCount: result.candidates.length });
    if (result.candidates.length) {
      await postJson('/automation/external-reply-node/candidates', {
        nodeId,
        scannedAt: new Date().toISOString(),
        candidates: result.candidates
      });
      console.log(`[threads] ${result.candidates.length}件をBridgeへ送信しました。`);
    } else {
      console.log('[threads] 候補0件。');
    }
  } catch (err) {
    await heartbeat('error', { error: err.message });
    console.error('[scan]', err);
  }
}

async function main() {
  fs.mkdirSync(profileDir, { recursive: true });
  const executablePath = findChromeExecutable();
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless,
    viewport: { width: 1440, height: 1000 },
    args: ['--disable-blink-features=AutomationControlled']
  });

  console.log(`CFE M8 Agent Node started: ${nodeId}`);
  console.log(`Threads profile: ${profileDir}`);
  await heartbeat('starting');
  await runOnce(context);

  setInterval(() => {
    runOnce(context).catch(err => console.error('[interval]', err));
  }, scanIntervalMinutes * 60 * 1000);

  const shutdown = async () => {
    await heartbeat('stopping');
    await context.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
