// Bounded, read-only research -> daily plan. No browser automation or publication.
import { runDiscoveryProbe } from './probe-rakuten-discovery.js';
import { fetchRakutenEditorialEvidence, canonicalRakutenItemUrl, assembleEditorialResearch, apiSource } from './editorial-rakuten-evidence.js';
import { fetchRakutenProductPageHtml, verifyProductPageQuotes } from './editorial-page-verifier.js';
import { extractEditorialSpecQuotes } from './editorial-spec-extractor.js';
import { buildEditorialShortlist } from './editorial-shortlist.js';
import { planThreadsDailyCycle } from './threads-daily-cycle.js';

const limited=reason=>({status:'research_required',reason,mode:'review_only',slots:[],published:0,publishApproved:false});
const rateLimited=e=>/\b(?:rakuten_[a-z_]+_http_429|HTTP_429|product_page_http_429)\b/i.test(String(e?.message||''));
export async function prepareDailyThreadsCycle({jstDate,applicationId,accessKey,affiliateId,performanceRecords,history=[],replyCandidates=[],replyHistory=[],ownUsername='',fetchFn=fetch,delayFn=ms=>new Promise(r=>setTimeout(r,ms)),maxDetail=6,
 discover=runDiscoveryProbe,fetchEvidence=fetchRakutenEditorialEvidence,fetchPage=fetchRakutenProductPageHtml}={}){
 if(!Number.isInteger(maxDetail)||maxDetail<1||maxDetail>6)throw new TypeError('invalid_research_limit');
 if(!applicationId||!accessKey||!affiliateId)return limited('rakuten_credentials_missing');
 const boundedFetch=(url,options={})=>fetchFn(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});
 let discovered;
 try{discovered=await discover({applicationId,accessKey,affiliateId,fetchFn:boundedFetch,enrich:false});}
 catch(e){return limited(rateLimited(e)?'rakuten_rate_limited':'discovery_failed');}
 // Prefer official lifestyle categories. If the first category has no usable
 // evidence, try a second category, not lower the fact gate. Bounded to six
 // item details and at most two scoped discovery calls.
 const genres=(discovered.results?.genre?.children||[]).filter(g=>Number.isInteger(Number(g.genreId))&&Number(g.genreId)>0&&/キッチン用品|日用品雑貨|インテリア・寝具・収納/u.test(String(g.name)));
 const general=discovered;let chosenIndex=-1;
 if(genres.length){
  chosenIndex=new Date(jstDate+'T00:00:00Z').getUTCDate()%genres.length;
  const chosen=genres[chosenIndex];
  try{await delayFn(1100);const scoped=await discover({applicationId,accessKey,affiliateId,genreId:Number(chosen.genreId),fetchFn:boundedFetch,enrich:false});if(scoped.editorialShortlist?.selected?.length)discovered=scoped;}
  catch(e){if(rateLimited(e))return limited('rakuten_rate_limited');}
 }
 // The existing discovery shortlist is already filtered by editorial suitability.
 const rank=d=>(d.editorialShortlist?.selected??[]).filter(c=>!c.theme||['storage','cleaning','kitchen_textiles','food_preservation','digital','cooking'].includes(c.theme)).map(c=>({...c,hasAffiliateUrl:true}));
 const researchByItemCode={}, held=[];
 const used=new Set(history.filter(r=>{const age=Date.parse(jstDate+'T00:00:00Z')-Date.parse(r?.jstDate+'T00:00:00Z');return Number.isFinite(age)&&age>=0&&age<=7*86400000;}).map(r=>r.meta?.itemCode).filter(Boolean));
 let attempted=0;const seen=new Set();
 for(let batch=0;batch<2;batch++){
 if(batch===1){
  if(attempted>=maxDetail)break;
  discovered=general;
  if(genres.length>1){const alternate=genres[(chosenIndex+1)%genres.length];try{await delayFn(1100);const scoped=await discover({applicationId,accessKey,affiliateId,genreId:Number(alternate.genreId),fetchFn:boundedFetch,enrich:false});if(scoped.editorialShortlist?.selected?.length)discovered=scoped;}catch(e){if(rateLimited(e))return {...limited('rakuten_rate_limited'),researchAttemptCount:attempted,researchHeld:held};}}
 }
 const ranking=rank(discovered).filter(c=>!used.has(c.itemCode)&&!seen.has(c.itemCode));
 const order=buildEditorialShortlist(ranking,{max:Math.min(5,Math.max(1,ranking.length)),performanceRecords}).selected;
 const batchStart=attempted;
 for(const c of order){
  if(attempted>=maxDetail||attempted-batchStart>=3)break;
  seen.add(c.itemCode);
  attempted++;
  await delayFn(1100); // Includes delay after the ranking result.
  try{
   const api=await fetchEvidence(c.itemCode,{applicationId,accessKey,affiliateId,fetchFn:boundedFetch,checkedAt:jstDate});
   const direct=canonicalRakutenItemUrl(api.productPageUrl), linked=canonicalRakutenItemUrl(api.affiliateUrl);
   const page=direct||linked;
   if(api.status!=='needs_product_detail_research'||api.itemCode!==c.itemCode||!page||!linked||linked!==page||new URL(page).pathname.split('/')[1]!==c.itemCode.split(':')[0]){held.push({itemCode:c.itemCode,reason:api.status==='item_not_found'?'item_not_found':!page?'product_page_missing':'product_or_link_identity_unverified'});continue;}
   const html=await fetchPage(page,{fetchFn:boundedFetch});
   const extracted=extractEditorialSpecQuotes(html.html);
   const verified=verifyProductPageQuotes({apiEvidence:{...api,productPageUrl:page},pageUrl:html.url,html:html.html,quotePlans:extracted.quotePlans,checkedAt:jstDate});
   let assembled;
   if(verified.status==='page_quotes_matched')assembled=assembleEditorialResearch(c,{...api,productPageUrl:page},verified.pageReview);
   else {
     // API caption is a separate official item-specific source, not proof that
     // the literal claims appeared in the HTML or were independently tested.
     const caption=typeof api.itemCaption==='string'?api.itemCaption:'';
     const captionPlans=extractEditorialSpecQuotes('商品説明 '+caption).quotePlans;
     if(captionPlans.length<2){held.push({itemCode:c.itemCode,reason:'product_page_evidence_insufficient',quoteCount:extracted.quotePlans.length,captionQuoteCount:captionPlans.length});continue;}
     assembled={research:{itemCode:c.itemCode,affiliateUrl:api.affiliateUrl,rights:{noMedia:true},facts:captionPlans.map(s=>({id:s.id,claim:'楽天の商品説明：'+s.quote+'と記載',sourceUrl:apiSource,sourceKind:'official_item_caption',checkedAt:jstDate,evidenceQuote:s.quote}))}};
   }
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
 }
 return {...limited('no_qualified_product'),researchAttemptCount:attempted,researchHeld:held};
}
