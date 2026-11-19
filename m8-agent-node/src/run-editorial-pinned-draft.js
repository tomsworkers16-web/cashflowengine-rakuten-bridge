// Read-only, pinned-product editorial article test for M8.
// Fetch official Rakuten API evidence and the exact Rakuten product page;
// extract and verify literal specs; prepare B-style offline review draft.
// This command never publishes, schedules, posts, or writes to the live service.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { fetchRakutenEditorialEvidence } from './editorial-rakuten-evidence.js';
import { fetchRakutenProductPageHtml, verifyProductPageQuotes } from './editorial-page-verifier.js';
import { extractEditorialSpecQuotes } from './editorial-spec-extractor.js';
import { buildEditorialArticleWorkflow } from './editorial-article-workflow.js';

const ITEM_CODE='e-kurashi:10048736';
const PAGE='https://item.rakuten.co.jp/e-kurashi/s1u57/';
// Pages are checked by the M8 operator in Japan; use the local calendar day.
export const japanCheckedAt=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
export async function runPinnedEditorialDraft({
  applicationId,accessKey,affiliateId,fetchFn=fetch,
  checkedAt=japanCheckedAt()
}={}) {
  if(!applicationId||!accessKey||!affiliateId) {
    return {status:'research_required',reason:'rakuten_credentials_missing',published:0};
  }
  // API and product page fetches are separately bounded by the caller's network.
  let evidence;
  try {
    evidence=await fetchRakutenEditorialEvidence(ITEM_CODE,{applicationId,accessKey,affiliateId,fetchFn,checkedAt});
  } catch {
    return {status:'research_required',reason:'official_item_research_failed',published:0};
  }
  if(evidence.status!=='needs_product_detail_research'||!evidence.affiliateUrl) {
    return {status:'research_required',reason:'official_item_evidence_insufficient',published:0};
  }
  let page;
  try {
    page=await fetchRakutenProductPageHtml(PAGE,{fetchFn});
  } catch {
    return {status:'research_required',reason:'product_page_fetch_failed',published:0};
  }
  let extracted,verified;
  try {
    extracted=extractEditorialSpecQuotes(page.html);
    verified=verifyProductPageQuotes({apiEvidence:evidence,pageUrl:page.url,html:page.html,
      quotePlans:extracted.quotePlans,checkedAt});
  } catch {
    return {status:'research_required',reason:'product_spec_extraction_failed',published:0};
  }
  if(verified.status!=='page_quotes_matched') {
    return {status:'research_required',reason:verified.reason||'product_spec_quotes_missing',
      extractedCount:extracted.quotePlans.length,published:0};
  }
  // rank=30 is only a *fixture* to pass the shortlist validator;
  // this pinned-product test does not verify the current Rakuten ranking.
  const itemPrice=Number(evidence.facts.find(x=>x.id==='rakuten_item_price')?.claim.match(/(\d+)円/u)?.[1]);
  if(!Number.isFinite(itemPrice)||itemPrice<=0)
    return {status:'research_required',reason:'official_price_missing',published:0};
  const candidate={itemCode:ITEM_CODE,itemName:evidence.facts.find(x=>x.id==='rakuten_item_name')
    ?.claim.replace(/^楽天商品検索API掲載の商品名：/u,'')||'壁付きチェスト 収納',
    price:itemPrice,
    rank:30,hasAffiliateUrl:true};
  const result=buildEditorialArticleWorkflow({
    ranking:[candidate],
    apiEvidenceByItemCode:{[ITEM_CODE]:evidence},
    productPageReviewsByItemCode:{[ITEM_CODE]:verified.pageReview},
    max:1,autoRevise:true
  });
  const entry=result.entries[0];
  return {
    status:entry?.status||'research_required',mode:'offline_review_only',
    itemCode:ITEM_CODE,productPageUrl:PAGE,
    evidenceCount:verified.pageReview.specs.length,
    extractedSpecifications:verified.pageReview.specs.map(x=>x.claim),
    article:entry?.article??null,
    gateScore:entry?.audit?.total??null,
    publishApproved:false,published:0,
    caveat:'Template draft, not an AI-model generated article; quoted text has been checked against HTML only. Check variant applicability, affiliate terms, product availability and publication approval separately.'
  };
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  runPinnedEditorialDraft({
    applicationId:process.env.RAKUTEN_APPLICATION_ID,
    accessKey:process.env.RAKUTEN_ACCESS_KEY,
    affiliateId:process.env.RAKUTEN_AFFILIATE_ID
  }).then(result=>console.log(JSON.stringify(result,null,2)))
  .catch(()=>{console.error(JSON.stringify({status:'failed',reason:'pinned_draft_failed',published:0}));process.exitCode=1;});
}
