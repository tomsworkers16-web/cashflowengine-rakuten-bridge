import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 10000);
const SHARED_SECRET = process.env.CFE_M8_SHARED_SECRET || '';

const nodeState = {
  lastHeartbeat: null,
  lastStatus: 'not_connected',
  lastNodeId: null,
  lastCandidateBatchAt: null,
  lastCandidateCount: 0,
  latestCandidates: []
};

const workflow = {
  version: 'external-reply-v2-m8',
  mode: 'chatgpt_assisted_human_send',
  enabled: true,
  discoverySource: 'm8_agent_node',
  localPcRequired: false,
  dedicatedNodeRequired: true,
  browserRuntime: {
    provider: 'gmktec_m8_playwright',
    nodeId: 'm8-node-001',
    targetUrl: 'https://www.threads.com',
    expectedAccount: 'rakumitsu_select',
    persistentProfile: true,
    readOnly: true,
    allowedActions: ['read', 'discover', 'inspect_reply_state'],
    prohibitedActions: ['post', 'reply', 'like', 'follow', 'repost']
  },
  migration: {
    tinyfishStatus: 'paused_no_topup',
    tinyfishFallbackEnabled: false,
    reason: 'dedicated M8 node selected to remove metered browser-agent dependency'
  },
  officialApiAutonomousExternalReply: false,
  dailyCap: 5,
  discoveryWindowsJst: ['08:30', '18:30'],
  priorities: ['conversation_followup', 'new_high_value_reply'],
  initialApproachSameAccountPerDay: 1,
  conversationFollowupExemptFromInitialCap: true,
  candidateThreshold: 80,
  internalDraftVariants: ['empathy', 'question', 'experience', 'helpful_context'],
  userFacingDraftCount: 1,
  allowSecondDraftOnlyWhenUncertain: true,
  notification: {
    channel: 'chatgpt',
    directTargetPermalinkRequired: true,
    replyTextStandaloneRequired: true,
    copyReplyTextOnly: true,
    showPriorityForConversationFollowup: true
  },
  safety: {
    affiliateLinksInExternalReplies: false,
    promotionalReplies: false,
    politicsInflammatorySensitive: false,
    duplicateOrNearDuplicateReplies: false,
    massReplying: false,
    skipUnclearContext: true,
    credentialDisclosureAllowed: false
  },
  exceptionPolicy: {
    userActionRequiredOnlyFor: ['threads_reauth', 'meta_identity_verification', 'm8_physical_access']
  },
  learning: {
    trackCandidate: true,
    trackSentWhenKnown: true,
    trackCounterReply: true,
    trackProfileEffectWhenAvailable: true,
    trackFollowEffectWhenAvailable: true,
    trackDownstreamClickCvWhenAttributable: true
  }
};

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex,nofollow',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(JSON.stringify(body));
}

async function readJson(req, maxBytes = 256000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('payload_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function authorized(req) {
  if (!SHARED_SECRET) return false;
  return req.headers['x-cfe-m8-secret'] === SHARED_SECRET;
}

function selfTest() {
  return {
    passed:
      workflow.dailyCap === 5 &&
      workflow.userFacingDraftCount === 1 &&
      workflow.discoverySource === 'm8_agent_node' &&
      workflow.localPcRequired === false &&
      workflow.browserRuntime.provider === 'gmktec_m8_playwright' &&
      workflow.browserRuntime.readOnly === true &&
      workflow.notification.directTargetPermalinkRequired === true &&
      workflow.notification.replyTextStandaloneRequired === true &&
      workflow.notification.copyReplyTextOnly === true &&
      workflow.safety.affiliateLinksInExternalReplies === false &&
      workflow.priorities[0] === 'conversation_followup',
    checks: {
      dailyCapFive: workflow.dailyCap === 5,
      oneBestReply: workflow.userFacingDraftCount === 1,
      m8Primary: workflow.discoverySource === 'm8_agent_node',
      pcIndependentFromMainPc: workflow.localPcRequired === false,
      dedicatedNode: workflow.dedicatedNodeRequired === true,
      readOnlyBrowser: workflow.browserRuntime.readOnly === true,
      directLinkRequired: workflow.notification.directTargetPermalinkRequired === true,
      copyReplyOnly: workflow.notification.copyReplyTextOnly === true,
      followupPriority: workflow.priorities[0] === 'conversation_followup',
      noAffiliateReply: workflow.safety.affiliateLinksInExternalReplies === false
    }
  };
}

const previous = http.createServer.bind(http);
http.createServer = function externalReplyWorkflowCreateServer(listener) {
  return previous(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);

      if (url.pathname === '/automation/external-reply-context' && req.method === 'GET') {
        const body = { ...workflow, nodeState, selfTest: selfTest() };
        res.writeHead(body.selfTest.passed ? 200 : 503, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex,nofollow',
          'Referrer-Policy': 'no-referrer'
        });
        res.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>CFE External Reply Workflow</title></head><body><h1>Cash Flow Engine External Reply Workflow</h1><pre>${esc(JSON.stringify(body, null, 2))}</pre></body></html>`);
        return;
      }

      if (url.pathname === '/automation/external-reply-node/status' && req.method === 'GET') {
        json(res, 200, { version: workflow.version, nodeState, sharedSecretConfigured: Boolean(SHARED_SECRET) });
        return;
      }

      if (url.pathname === '/automation/external-reply-node/heartbeat' && req.method === 'POST') {
        if (!authorized(req)) return json(res, 401, { ok: false, error: 'unauthorized' });
        const body = await readJson(req);
        nodeState.lastHeartbeat = new Date().toISOString();
        nodeState.lastStatus = String(body.status || 'unknown');
        nodeState.lastNodeId = String(body.nodeId || 'unknown');
        json(res, 200, { ok: true, nodeState });
        return;
      }

      if (url.pathname === '/automation/external-reply-node/candidates' && req.method === 'POST') {
        if (!authorized(req)) return json(res, 401, { ok: false, error: 'unauthorized' });
        const body = await readJson(req);
        const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 20) : [];
        nodeState.lastCandidateBatchAt = new Date().toISOString();
        nodeState.lastCandidateCount = candidates.length;
        nodeState.latestCandidates = candidates;
        nodeState.lastNodeId = String(body.nodeId || nodeState.lastNodeId || 'unknown');
        json(res, 200, { ok: true, accepted: candidates.length });
        return;
      }
    } catch (err) {
      if (!res.headersSent) json(res, 400, { ok: false, error: err?.message || 'bad_request' });
      return;
    }
    return listener(req, res);
  });
};
