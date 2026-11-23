// Offline editorial quality gate. Evaluation is deterministic and deliberately conservative.
// It does not claim to independently fact-check URLs or detect all hallucinations.
const filled = value => typeof value === 'string' && value.trim().length > 0;
const nonempty = value => Array.isArray(value) ? value.filter(Boolean) : [];
const checked = item => filled(item?.claim) && /^https?:\/\//i.test(item?.sourceUrl || '') && /^\d{4}-\d{2}-\d{2}$/.test(item?.checkedAt || '');
const issue = (code, action) => ({ code, action });

export function evaluateEditorialDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new TypeError('draft_object_required');
  const reader = draft.reader || {};
  const checks = nonempty(draft.purchaseChecks);
  const actionable = checks.filter(c => filled(c?.risk) && filled(c?.howToCheck));
  const verified = nonempty(draft.verifiedFacts).filter(checked);
  const unsupported = nonempty(draft.productClaims).filter(c => !filled(c?.factId) || !verified.some(f => f.id === c.factId));
  const ad = draft.isAffiliate === true;
  const hasDisclosure = filled(draft.disclosure) && /PR|広告|アフィリエイト/.test(draft.disclosure);
  const hasLink = /^https:\/\//i.test(draft.affiliateUrl || '');
  const hasDecision = filled(draft.goodFor) && filled(draft.notGoodFor);
  const score = {
    readerProblem: filled(reader.problem) ? (filled(reader.context) ? 2 : 1) : 0,
    overlookedChecks: actionable.length >= 3 ? 2 : actionable.length > 0 ? 1 : 0,
    decisionSupport: hasDecision ? 2 : filled(draft.goodFor) || filled(draft.notGoodFor) ? 1 : 0,
    productEvidence: verified.length > 0 && unsupported.length === 0 ? 2 : verified.length > 0 ? 1 : 0,
    practicalValue: actionable.length >= 3 && filled(draft.comparisonMethod) ? 2 : actionable.length > 0 ? 1 : 0,
    transparentRevenue: !ad ? (draft.affiliateUrl || draft.disclosure ? 0 : 2) : (hasDisclosure && hasLink ? 2 : hasDisclosure || hasLink ? 1 : 0)
  };
  const problems = [];
  if (score.readerProblem < 2) problems.push(issue('reader_context_missing','読者の困りごとと利用状況を具体化する'));
  if (score.overlookedChecks < 2) problems.push(issue('purchase_checks_insufficient','購入前の盲点を3点以上、問題と確認方法の対で記載する'));
  if (score.decisionSupport < 2) problems.push(issue('decision_support_incomplete','向く人と向かない人を両方記載する'));
  if (score.productEvidence < 2) problems.push(issue('verified_evidence_incomplete','重要な商品情報に確認日・根拠URLを紐づけ、未確認の主張を除く'));
  if (score.practicalValue < 2) problems.push(issue('comparison_missing','読者が実行できる比較・確認手順を記載する'));
  if (score.transparentRevenue < 2) problems.push(issue('affiliate_disclosure_incomplete','アフィリエイト記事の場合は明確なPR表記とHTTPSリンクを付ける'));
  if (draft.fabricatedExperience === true) problems.push(issue('fabricated_experience','実際に確認していない使用体験を削除する'));
  if (draft.unverifiedPerformance === true) problems.push(issue('unverified_performance','性能の未確認断定を削除する'));
  if (draft.mediaRightsVerified !== true) problems.push(issue('media_rights_unverified','使用素材の権利を確認する。画像不使用なら画像不使用を明示し権利確認済みとする'));
  if (unsupported.length) problems.push(issue('unsupported_product_claims','商品に関するすべての主張をverifiedFactsのidに対応させる'));
  if (draft.isAffiliate !== true && draft.isAffiliate !== false) problems.push(issue('affiliate_status_unknown','広告・非広告の区分を明示する'));
  if (ad && (!hasDisclosure || !hasLink)) problems.push(issue('affiliate_label_or_url_invalid','PR表記と有効なHTTPSアフィリエイトリンクを確認する'));
  const total = Object.values(score).reduce((a,b) => a+b,0);
  const hardBlockers = new Set(['purchase_checks_insufficient','fabricated_experience','unverified_performance','media_rights_unverified','unsupported_product_claims','affiliate_status_unknown','affiliate_label_or_url_invalid']);
  const passed = total >= 10 && score.productEvidence === 2 && score.transparentRevenue === 2 && !problems.some(p => hardBlockers.has(p.code));
  return {
    version: 'editorial-gate-b-v1',
    score, total, maxScore: 12,
    status: passed ? 'review_candidate' : 'revision_required',
    publishApproved: false, // ALWAYS requires owner approval. Never treat score as publish permission.
    issues: problems,
    blockingIssues: problems.filter(p => hardBlockers.has(p.code)),
    feedback: problems.map(x => x.action),
    disclaimer: 'Structure/evidence-presence audit only; linked sources, claims and media rights require independent verification.'
  };
}

export function revisionRequest(draft, report = evaluateEditorialDraft(draft)) {
  return {
    task: 'revise_editorial_draft',
    constraints: [
      '根拠のない商品性能・口コミ・購入体験を創作しない',
      '未確認事項は不明として残す。商品が確認できない場合は商品PRを行わない',
      '本文、根拠、確認手順を人間がレビュー可能な状態で返す',
      '自動公開・外部送信は禁止'
    ],
    requiredChanges: report.feedback,
    previousDraft: draft
  };
}
