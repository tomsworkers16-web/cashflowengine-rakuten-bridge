// Read-only end-to-end validation from supplied page snapshots or a bounded live fetch.
// The caller supplies exact excerpts/claims to check; never invent specifications.
// The model is optional and remains publish-disabled.
import { buildEditorialShortlist } from './editorial-shortlist.js';
import { verifyProductPageQuotes, fetchRakutenProductPageHtml } from './editorial-page-verifier.js';
import { runEditorialAiWorkflow } from './editorial-ai-workflow.js';

export async function runEditorialPageVerifiedWorkflow({
  ranking,apiEvidenceByItemCode={},quotePlansByItemCode={},
  pageHtmlByItemCode={},generateFn,max=3, fetchLivePages=false,
  fetchFn=fetch, checkedAt=new Date().toISOString().slice(0,10)
}={}){
  if(!Number.isInteger(max)||max<1||max>3)throw new Error('invalid_verified_workflow_limit');
  const selected=buildEditorialShortlist(ranking,{max}).selected;
  const productPageReviewsByItemCode={};
  const pageVerification=[];
  for (const candidate of selected) {
    const evidence=apiEvidenceByItemCode[candidate.itemCode];
    if (!evidence) {
      pageVerification.push({itemCode:candidate.itemCode,status:'research_required',reason:'api_evidence_missing'});
      continue;
    }
    let snapshot=pageHtmlByItemCode[candidate.itemCode];
    let pageUrl=evidence.productPageUrl;
    if (typeof snapshot!=='string' && fetchLivePages) {
      try {
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(),10000);
        try {
          const fetched=await fetchRakutenProductPageHtml(pageUrl,{fetchFn,signal:controller.signal});
          snapshot=fetched.html;
          pageUrl=fetched.url;
        } finally {clearTimeout(timeout);}
      } catch (e) {
        const reason=String(e?.message||'');
        pageVerification.push({itemCode:candidate.itemCode,status:'research_required',
          reason:/^(unsupported_product_page_url|product_page_http_\d{3}|product_page_not_html|product_page_too_large)$/.test(reason)
            ?reason:'product_page_fetch_failed'});
        continue;
      }
    }
    const verified=verifyProductPageQuotes({
      apiEvidence:evidence,pageUrl,html:snapshot,
      quotePlans:quotePlansByItemCode[candidate.itemCode],checkedAt
    });
    pageVerification.push({itemCode:candidate.itemCode,status:verified.status,
      reason:verified.reason||null,quoteCount:verified.pageReview?.specs?.length??0});
    if(verified.pageReview)productPageReviewsByItemCode[candidate.itemCode]=verified.pageReview;
  }
  const result=await runEditorialAiWorkflow({
    ranking,apiEvidenceByItemCode,productPageReviewsByItemCode,generateFn,max
  });
  return {...result,mode:'page_verified_ai_review_only',pageVerification,
    verificationCaveat:'A literal text match does not independently prove factual interpretation, product variant applicability, or media rights. Human approval is mandatory.',
    publishApproved:false};
}
