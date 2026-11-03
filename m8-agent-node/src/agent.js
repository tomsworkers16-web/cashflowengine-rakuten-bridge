import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { chromium } from 'playwright-core';

const env = process.env;
const dataDir = path.resolve(env.CFE_DATA_DIR || '.data');
const profileDir = path.resolve(env.THREADS_PROFILE_DIR || path.join(dataDir, 'threads-profile'));
const localPort = Number(env.CFE_LOCAL_PORT || 18787);
const scanIntervalMinutes = Math.max(10, Number(env.THREADS_SCAN_INTERVAL_MINUTES || 30));
const headless = String(env.THREADS_HEADLESS || 'false').toLowerCase() === 'true';
const maxCandidates = Math.max(1, Math.min(20, Number(env.THREADS_MAX_CANDIDATES || 10)));

const stateFile = path.join(dataDir, 'agent-state.json');
const candidatesFile = path.join(dataDir, 'external-reply-candidates.json');
const logFile = path.join(dataDir, 'agent.log');

const state = {
  version: 'm8-agent-local-v1',
  hostname: os.hostname(),
  startedAt: new Date().toISOString(),
  lastScanAt: null,
  lastScanStatus: 'not_started',
  lastCandidateCount: 0,
  threadsLoggedIn: null,
  lastError: null
};

const chromeExeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
];

function ensureDirs() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(profileDir, { recursive: true });
}

function log(message, extra) {
  const line = `[${new Date().toISOString()}] ${message}${extra ? ` ${JSON.stringify(extra)}` : ''}`;
  console.log(line);
  try { fs.appendFileSync(logFile, `${line}\n`, 'utf8'); } catch {}
}

function saveState() {
  try { fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8'); } catch (err) { console.error(err); }
}

function findChromeExecutable() {
  for (const p of chromeExeCandidates) if (fs.existsSync(p)) return p;
  throw new Error('Google Chrome が見つかりません。Chromeをインストールしてください。');
}

function normalizeText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

async function scanThreads(page) {
  await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  const currentUrl = page.url();
  if (/login|accounts\/login/i.test(currentUrl)) return { loggedIn: false, candidates: [], currentUrl };

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
    candidates.push({ source: 'm8-playwright', author: p.author, url, text: normalizeText(p.text).slice(0, 1200), discoveredAt: new Date().toISOString() });
  }
  return { loggedIn: true, candidates, currentUrl };
}

async function runOnce(context) {
  const page = context.pages()[0] || await context.newPage();
  state.lastScanAt = new Date().toISOString();
  try {
    const result = await scanThreads(page);
    state.threadsLoggedIn = result.loggedIn;
    state.lastCandidateCount = result.candidates.length;
    if (!result.loggedIn) {
      state.lastScanStatus = 'reauth_required';
      state.lastError = 'threads_login_required';
      saveState();
      log('[threads] ログインが必要です。', { currentUrl: result.currentUrl });
      return;
    }

    fs.writeFileSync(candidatesFile, JSON.stringify({ scannedAt: new Date().toISOString(), candidates: result.candidates }, null, 2), 'utf8');
    state.lastScanStatus = 'healthy';
    state.lastError = null;
    saveState();
    log('[threads] scan complete', { candidateCount: result.candidates.length });
  } catch (err) {
    state.lastScanStatus = 'error';
    state.lastError = String(err?.message || err);
    saveState();
    log('[threads] scan failed', { error: state.lastError });
  }
}

function startLocalHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, service: 'cashflowengine-m8-agent', mode: 'local-first', ...state }));
      return;
    }
    if (req.url === '/candidates') {
      let body = { scannedAt: null, candidates: [] };
      try { body = JSON.parse(fs.readFileSync(candidatesFile, 'utf8')); } catch {}
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  });
  server.listen(localPort, '127.0.0.1', () => log('[local] health server started', { url: `http://127.0.0.1:${localPort}/health` }));
  return server;
}

async function main() {
  ensureDirs();
  saveState();
  const server = startLocalHealthServer();
  const executablePath = findChromeExecutable();
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless,
    viewport: { width: 1440, height: 1000 },
    args: ['--disable-blink-features=AutomationControlled']
  });

  log('CFE M8 Agent Node started', { hostname: state.hostname, mode: 'local-first', profileDir });
  await runOnce(context);
  const timer = setInterval(() => runOnce(context).catch(err => log('[interval] error', { error: String(err?.message || err) })), scanIntervalMinutes * 60 * 1000);

  const shutdown = async () => {
    clearInterval(timer);
    server.close();
    await context.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  log('[fatal]', { error: String(err?.message || err) });
  process.exit(1);
});
