import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 10000);

const workflow = {
  version: 'external-reply-v1',
  mode: 'chatgpt_assisted_human_send',
  enabled: true,
  discoverySource: 'tinyfish_cloud_browser',
  localPcRequired: false,
  browserRuntime: {
    provider: 'tinyfish',
    profileName: 'Threads専用',
    profileId: 'prof_2c19d1241c4e4682',
    targetUrl: 'https://www.threads.com',
    useSavedProfile: true,
    expectedAccount: 'rakumitsu_select',
    readOnly: true,
    allowedActions: ['read', 'discover', 'inspect_reply_state'],
    prohibitedActions: ['post', 'reply', 'like', 'follow', 'repost']
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
    autoChargeAllowed: false,
    credentialDisclosureAllowed: false
  },
  exceptionPolicy: {
    userActionRequiredOnlyFor: [
      'tinyfish_session_expired',
      'meta_identity_verification',
      'tinyfish_wallet_insufficient'
    ]
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

function selfTest() {
  return {
    passed:
      workflow.dailyCap === 5 &&
      workflow.userFacingDraftCount === 1 &&
      workflow.discoverySource === 'tinyfish_cloud_browser' &&
      workflow.localPcRequired === false &&
      workflow.browserRuntime.provider === 'tinyfish' &&
      workflow.browserRuntime.profileId === 'prof_2c19d1241c4e4682' &&
      workflow.browserRuntime.readOnly === true &&
      workflow.notification.directTargetPermalinkRequired === true &&
      workflow.notification.replyTextStandaloneRequired === true &&
      workflow.notification.copyReplyTextOnly === true &&
      workflow.safety.affiliateLinksInExternalReplies === false &&
      workflow.priorities[0] === 'conversation_followup',
    checks: {
      dailyCapFive: workflow.dailyCap === 5,
      oneBestReply: workflow.userFacingDraftCount === 1,
      tinyfishPrimary: workflow.discoverySource === 'tinyfish_cloud_browser',
      pcIndependent: workflow.localPcRequired === false,
      expectedProfile: workflow.browserRuntime.profileId === 'prof_2c19d1241c4e4682',
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
        const body = { ...workflow, selfTest: selfTest() };
        res.writeHead(body.selfTest.passed ? 200 : 503, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex,nofollow',
          'Referrer-Policy': 'no-referrer'
        });
        res.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>CFE External Reply Workflow</title></head><body><h1>Cash Flow Engine External Reply Workflow</h1><pre>${esc(JSON.stringify(body, null, 2))}</pre></body></html>`);
        return;
      }
    } catch {}
    return listener(req, res);
  });
};
