// Bounded, read-only research -> daily plan. No browser automation or publication.
import { runDiscoveryProbe } from './probe-rakuten-discovery.js';
import { fetchRakutenEditorialEvidence, canonicalRakutenItemUrl, assembleEditorialResearch } from './editorial-rakuten-evidence.js';
import { fetchRakutenProductPageHtml, verifyProductPageQuotes } from './editorial-page-verifier.js';
import { extractEditorialSpecQuotes } from './editorial-spec-extractor.js';
import { buildEditorialShortlist } from './editorial-shortlist.js';
import { planThreadsDailyCycle } from './threads-daily-cycle.js';

const limited=reason=>({status:'research_required',reason,mode:'review_only',slots:[],published:0,publishApproved:false});
const rateLimited=e=>/\b(?:rakuten_[a-z_]+_http_429|HTTP_429|product_page_http_429)\b/i.test(String(e?.message||''));
export async function prepareDailyThreadsCycle({jstDate,applicationId,accessKey,affiliateId,performanceRecords,history=[],replyCandidates=[],replyHistory=[],ownUsername='',fetchFn=fetch,delayFn=ms=>new Promise(r=>setTimeout(r,ms)),maxDetail=3,
 discover=runDiscoveryProbe,fetchEvidence=fetchRakutenEditorialEvidence,fetchPage=fetchRakutenProductPageHtml}={}){
 if(!Number.isInteger(maxDetail)||maxDetail<1||maxDetail>3)throw new TypeError('invalid_research_limit');
 if(!applicationId||!accessKey||!affiliateId)return limited('rakuten_credentials_missing');
 const boundedFetch=(url,options={})=>fetchFn(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});
 let discovered;
 try{discovered=await discover({applicationId,accessKey,affiliateId,fetchFn:boundedFetch,enrich:false});}
 catch(e){return limited(rateLimited(e)?'rakuten_rate_limited':'discovery_failed');}
 // The existing discovery shortlist is already filtered by editorial suitability.
 const ranking=(discovered.editorialShortlist?.selected??[]).map(c=>({...c,hasAffiliateUrl:true}));
 const order=buildEditorialShortlist(ranking,{max:Math.min(5,Math.max(1,ranking.length)),performanceRecords}).selected;
 const researchByItemCode={}, held=[];
 const used=new Set(history.filter(r=>{const age=Date.parse(jstDate+'T00:00:00Z')-Date.parse(r?.jstDate+'T00:00:00Z');return Number.isFinite(age)&&age>=0&&age<=7*86400000;}).map(r=>r.meta?.itemCode).filter(Boolean));
 let attempted=0;
 for(const c of order){
  if(used.has(c.itemCode))continue;
  if(attempted>=maxDetail)break;
  attempted++;
  await delayFn(1100); // Includes delay after the ranking result.
  try{
   const api=await fetchEvidence(c.itemCode,{applicationId,accessKey,affiliateId,fetchFn:boundedFetch,checkedAt:jstDate});
   const page=canonicalRakutenItemUrl(api.productPageUrl);
   if(!page){held.push({itemCode:c.itemCode,reason:'product_page_missing'});continue;}
   const html=await fetchPage(page,{fetchFn:boundedFetch});
   const extracted=extractEditorialSpecQuotes(html.html);
   const verified=verifyProductPageQuotes({apiEvidence:api,pageUrl:html.url,html:html.html,quotePlans:extracted.quotePlans,checkedAt:jstDate});
   if(verified.status!=='page_quotes_matched'){held.push({itemCode:c.itemCode,reason:'product_page_evidence_insufficient',quoteCount:extracted.quotePlans.length});continue;}
   const assembled=assembleEditorialResearch(c,api,verified.pageReview);
   if(!assembled.research){held.push({itemCode:c.itemCode,reason:'research_packet_incomplete'});continue;}
   researchByItemCode[c.itemCode]={...assembled.research,productPageUrl:page};
   const plan=planThreadsDailyCycle({jstDate,ranking,performanceRecords,researchByItemCode,history,replyCandidates,replyHistory,ownUsername});
   if(plan.status==='batch_review_required')return {...plan,researchAttemptCount:attempted,researchHeld:held};
   held.push({itemCode:c.itemCode,reason:plan.held?.find(x=>x.itemCode===c.itemCode)?.reason||'editorial_plan_held'});
  }catch(e){
   if(rateLimited(e))return {...limited('rakuten_rate_limited'),researchAttemptCount:attempted,researchHeld:held};
   const safe=/^(?:rakuten_item_http_\d{3}|product_page_http_\d{3}|product_page_(?:too_large|not_html|charset_invalid|charset_unrecognized|binary_response_required)|unsupported_product_page_url|invalid_page_html|unexpected_item_search_shape)$/.test(String(e?.message||''))?e.message:'product_research_failed';
   held.push({itemCode:c.itemCode,reason:safe});
  }
 }
 return {...limited('no_qualified_product'),researchAttemptCount:attempted,researchHeld:held};
}
