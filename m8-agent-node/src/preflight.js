// Read-only M8 readiness report. Never sends a post, prints credentials, or modifies .env.
import fs from 'node:fs';
import path from 'node:path';

const e = process.env;
const dataDir = path.resolve(e.CFE_DATA_DIR || '.data');
const required = ['THREADS_ACCESS_TOKEN','RAKUTEN_APPLICATION_ID','RAKUTEN_ACCESS_KEY','RAKUTEN_AFFILIATE_ID'];
const credentialsPresent = Object.fromEntries(required.map(k => [k, Boolean(String(e[k] || '').trim())]));
const enabled = key => String(e[key] || 'false').toLowerCase() === 'true';
const localPort = Number(e.CFE_LOCAL_PORT || 18787);
const adminPort = Number(e.CFE_IMAGE_ADMIN_PORT || 18788);

async function localStatus(port, endpoint) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return {reachable:false, reason:'invalid_port'};
  try {
    const response = await fetch('http://127.0.0.1:' + port + endpoint,
      {signal:AbortSignal.timeout(2500)});
    if (!response.ok) return {reachable:false, reason:'http_' + response.status};
    const body = await response.json();
    return {reachable:true, ...(endpoint === '/status'
      ? {lastDecision:body.lastDecision || 'unknown', lastError:body.lastError || null,
        version:body.version || null} : {registeredImages:Array.isArray(body.items) ? body.items.length : 'unknown'})};
  } catch { return {reachable:false, reason:'not_running_or_unreachable'}; }
}
const [core, imageAdmin] = await Promise.all([
  localStatus(localPort, '/status'),localStatus(adminPort, '/api/list')
]);
const report = {
  generatedAt:new Date().toISOString(),
  mode:'read_only_no_post',
  credentialsPresent,
  configuration: {
    autoPostingEnabled:enabled('CFE_AUTO_POST_ENABLED'),
    imagePostingEnabled:enabled('CFE_IMAGE_POST_ENABLED'),
    rakutenImageReuseOptIn:enabled('CFE_RAKUTEN_IMAGE_PUBLICATION_ENABLED'),
  },
  localServices:{core,imageAdmin},
  localData:{postsJournalPresent:fs.existsSync(path.join(dataDir,'posts.jsonl')),
    affiliateResultsPresent:fs.existsSync(path.join(dataDir,'affiliate-results.json'))},
  blockers: []
};
if (Object.values(credentialsPresent).some(v=>!v)) report.blockers.push('missing_api_credentials');
if (!core.reachable) report.blockers.push('m8_core_not_running');
if (report.configuration.rakutenImageReuseOptIn)
  report.blockers.push('review_rakuten_image_reuse_permission_before_publication');
if (!report.configuration.autoPostingEnabled) report.blockers.push('auto_post_disabled');
console.log(JSON.stringify(report,null,2));
