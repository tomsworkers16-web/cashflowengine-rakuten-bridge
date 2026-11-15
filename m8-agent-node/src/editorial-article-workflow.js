// Offline article workflow connecting the existing Rakuten editorial shortlist to the B quality gate.
// No network calls, external publishing, or automatic promotion to production.
import { buildEditorialShortlist } from './editorial-shortlist.js';
import { evaluateEditorialDraft, revisionRequest } from './editorial-quality-gate.js';
import { draftFromResearch } from './editorial-research-drafter.js';

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function safeParagraph(value) { return text(value).replace(/\r\n?/g, '\n'); }
function articleBody(draft) {
  const checks = Array.isArray(draft.purchaseChecks) ? draft.purchaseChecks : [];
  const facts = Array.isArray(draft.verifiedFacts) ? draft.verifiedFacts : [];
  const sections = [
    '# ' + text(draft.title || draft.reader?.problem),
    '## こんな悩みがある方へ\n' + safeParagraph(draft.reader?.problem) + '\n' + safeParagraph(draft.reader?.context),
    '## 購入前に確認したいこと\n' + checks.map((c, i) =>
      (i + 1) + '. **' + text(c.risk) + '**：' + text(c.howToCheck)
    ).join('\n'),
    '## 比較するときの手順\n' + safeParagraph(draft.comparisonMethod),
    '## 向く人・向かない人\n向く人：' + safeParagraph(draft.goodFor) +
      '\n向かない人：' + safeParagraph(draft.notGoodFor),
    '## 商品情報と確認元\n' + facts.map(f =>
      '- ' + text(f.claim) + '（確認日：' + text(f.checkedAt) + '、出典：' + text(f.sourceUrl) + '）'
    ).join('\n')
  ];
  if (draft.isAffiliate === true) {
    sections.push('## 商品ページ\n' + text(draft.disclosure) + '\n' + text(draft.affiliateUrl));
  }
  return sections.join('\n\n') + '\n';
}

/**
 * Input:
 * { ranking: Rakuten ranking candidate array,
 *   draftsByItemCode: { [itemCode]: { ...quality-gate schema, itemCode, title } } }
 * Ranking/title-only evidence never becomes verifiedFacts.
 */
export function buildEditorialArticleWorkflow({
  ranking, draftsByItemCode = {}, researchByItemCode = {}, max = 5, autoRevise = true
} = {}) {
  const shortlist = buildEditorialShortlist(ranking, { max });
  const entries = shortlist.selected.map(candidate => {
    const generated = !draftsByItemCode[candidate.itemCode]
      ? draftFromResearch(candidate, researchByItemCode[candidate.itemCode]) : null;
    const draft = draftsByItemCode[candidate.itemCode] || generated?.draft;
    if (!draft) return {
      itemCode: candidate.itemCode, candidate, status: 'research_required',
      publishApproved: false,
      researchReason: generated?.reason || 'research_not_provided',
      feedback: ['楽天ランキング・商品名だけでは記事の根拠不足。商品仕様・確認日・出典・購入前の注意点を調査してドラフトを作成する']
    };
    // Guard against accidentally applying research about a different product.
    if (draft.itemCode !== candidate.itemCode) return {
      itemCode: candidate.itemCode, candidate, status: 'revision_required',
      publishApproved: false, feedback: ['itemCodeの不一致を修正する。異なる商品の根拠を流用しない']
    };
    const initialAudit = evaluateEditorialDraft(draft);
    let finalDraft = draft;
    let audit = initialAudit;
    let autoRevision = null;
    // One offline correction pass only. Never rewrite a draft containing unverifiable
    // product claims, fabricated experience, or missing affiliate disclosure.
    const blocked = new Set(['fabricated_experience','unverified_performance',
      'unsupported_product_claims','affiliate_label_or_url_invalid']);
    if (autoRevise && audit.status === 'revision_required' &&
        !audit.blockingIssues.some(i => blocked.has(i.code)) &&
        researchByItemCode[candidate.itemCode]) {
      const proposed = draftFromResearch(candidate, researchByItemCode[candidate.itemCode]);
      if (proposed.draft) {
        const reassessed = evaluateEditorialDraft(proposed.draft);
        if (reassessed.status === 'review_candidate') {
          finalDraft = proposed.draft;
          audit = reassessed;
          autoRevision = {attempted:1,method:'regenerate_from_supplied_research',
            previousScore:initialAudit.total,result:'review_candidate'};
        }
      }
    }
    return {
      itemCode: candidate.itemCode, candidate,
      status: audit.status,
      publishApproved: false,
      audit,autoRevision,
      draftOrigin: finalDraft !== draft || generated?.status === 'drafted' ? 'research_template' : 'provided_draft',
      revision: audit.status === 'revision_required' ? revisionRequest(finalDraft, audit) : null,
      // Render only a qualified draft; the audit is structural, not external verification.
      article: audit.status === 'review_candidate' ? articleBody(finalDraft) : null
    };
  });
  return {
    version: 'editorial-article-workflow-v1',
    mode: 'offline_review_only',
    scanned: shortlist.scanned,
    eligible: shortlist.eligible,
    entries,
    summary: {
      researchRequired: entries.filter(x => x.status === 'research_required').length,
      revisionRequired: entries.filter(x => x.status === 'revision_required').length,
      reviewCandidates: entries.filter(x => x.status === 'review_candidate').length,
      published: 0
    }
  };
}

/**
 * Recheck a revised draft for the same shortlist candidate.
 * Resubmission is never publication; it reruns the full audit from scratch.
 */
export function recheckEditorialArticle(candidate, correctedDraft) {
  if (!candidate?.itemCode) throw new TypeError('candidate_item_code_required');
  return buildEditorialArticleWorkflow({
    ranking: [{
      itemCode: candidate.itemCode, itemName: candidate.itemName, price: candidate.price,
      rank: candidate.rank, genreId: candidate.genreId, hasAffiliateUrl: true
    }],
    draftsByItemCode: { [candidate.itemCode]: correctedDraft }, max: 1
  });
}

/**
 * Safe one-step regeneration from *the same provided research*.
 * Never fabricates missing evidence or auto-approves the resulting article.
 * This is template-based correction, not a live LLM rewrite.
 */
export function reviseEditorialArticleFromResearch(candidate, previousDraft, research) {
  if (previousDraft?.itemCode !== candidate?.itemCode) {
    return { status:'revision_required', publishApproved:false,
      reason:'candidate_draft_identity_mismatch' };
  }
  const initial = evaluateEditorialDraft(previousDraft);
  if (initial.status === 'review_candidate') {
    return { status:'review_candidate', publishApproved:false,
      reason:'already_qualified', audit:initial };
  }
  const unsafe = ['fabricated_experience','unverified_performance','unsupported_product_claims','affiliate_label_or_url_invalid'];
  if (initial.blockingIssues.some(i => unsafe.includes(i.code))) {
    return { status:'revision_required', publishApproved:false, reason:'manual_evidence_review_required',
      audit:initial, revision:revisionRequest(previousDraft, initial) };
  }
  const next = draftFromResearch(candidate, research);
  if (!next.draft) {
    return { status:'research_required', publishApproved:false,
      reason:next.reason, audit:initial };
  }
  const result = recheckEditorialArticle(candidate, next.draft);
  const entry = result.entries[0];
  return {
    ...entry,
    autoRevision: 'regenerated_from_sourced_research_once',
    previousScore: initial.total,
    publishApproved:false,
    recheckCount:1
  };
}
