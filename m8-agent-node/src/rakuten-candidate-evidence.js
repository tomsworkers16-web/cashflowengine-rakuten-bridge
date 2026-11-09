// Enrich up to five short-listed ranking items via Rakuten official Item Search API.
// This is a read-only research view. Neither projected conversions nor real profit.
const ENDPOINT='https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const NUMERIC=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export function makeItemDetailRequest(itemCode,{applicationId,accessKey,affiliateId}={}){
  if(!applicationId||!accessKey||!affiliateId)throw new Error('rakuten_credentials_missing');
  if(!/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(String(itemCode)))throw new Error('invalid_item_code');
  const url=new URL(ENDPOINT);
  const params={applicationId,affiliateId,itemCode,format:'json',formatVersion:'2',hits:'1',page:'1'};
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
  return {url,headers:{accessKey:String(accessKey)}};
}
export function parseVerifiedItem(payload,itemCode){
  const entries=payload?.Items??payload?.items;
  if(!Array.isArray(entries))throw new Error('unexpected_item_search_shape');
  const matched=entries.map(x=>x?.Item??x?.item??x)
    .find(x=>x?.itemCode===itemCode);
  if(!matched)return null;
  const price=NUMERIC(matched.itemPrice),rate=NUMERIC(matched.affiliateRate);
  const reviews=NUMERIC(matched.reviewCount),average=NUMERIC(matched.reviewAverage);
  const hasLink=typeof matched.affiliateUrl==='string'&&matched.affiliateUrl.startsWith('https://');
  // Approximate gross commission only. Actual commissions vary by category, caps,
  // adjustments, eligibility, attribution and later cancellations.
  const indicativeGrossYen=price>0&&rate>0?Math.round(Math.min(1000,price*rate/100)):null;
  return {itemCode,price,affiliateRatePct:rate,reviewCount:reviews,reviewAverage:average,
    hasValidAffiliateUrl:hasLink,indicativeGrossYen,
    claimedSalesVolume:null,verifiedLongevity:null,verifiedConversionRate:null};
}
export function addEvidenceScore(candidate,detail){
  if(!detail)return {...candidate,researchStatus:'item_not_found',evidenceScore:null};
  if(!detail.hasValidAffiliateUrl||!(detail.price>0))
    return {...candidate,researchStatus:'not_eligible',evidenceScore:null,detail};
  let score=Number(candidate.priority)||0;
  const reasons=[];
  if(detail.reviewAverage>=4.5&&detail.reviewCount>=20){score+=20;reasons.push('rating_4_5_with_20_reviews');}
  else if(detail.reviewAverage>=4&&detail.reviewCount>=10){score+=10;reasons.push('rating_4_with_10_reviews');}
  if(detail.reviewCount>=30&&detail.reviewCount<500){score+=10;reasons.push('moderate_review_count_niche_hypothesis');}
  if(detail.indicativeGrossYen>=100){score+=10;reasons.push('gross_commission_estimate_100_or_more');}
  return {...candidate,researchStatus:'candidate_for_editorial_review',evidenceScore:score,detail,
    additionalRationale:reasons};
}
export async function enrichShortlist(candidates,{applicationId,accessKey,affiliateId,fetchFn=fetch,delayMs=1100}={}){
  if(!Array.isArray(candidates)||candidates.length>5)throw new Error('too_many_candidates');
  if(candidates.length===0)return {status:'read_only',count:0,products:[]};
  const products=[];
  for(const candidate of candidates){
    const {url,headers}=makeItemDetailRequest(candidate.itemCode,{applicationId,accessKey,affiliateId});
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),12000);
    try{
      const response=await fetchFn(url,{method:'GET',headers,redirect:'error',signal:abort.signal});
      if(!response.ok)throw new Error('rakuten_item_http_'+response.status);
      const detail=parseVerifiedItem(await response.json(),candidate.itemCode);
      products.push(addEvidenceScore(candidate,detail));
    }finally{clearTimeout(timer);}
    if(products.length<candidates.length)await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
  return {status:'read_only',count:products.length,
    postingPerformed:false,persistencePerformed:false,
    financialCaveat:'indicativeGrossYen is a capped illustrative gross commission per conversion, not realized profit or predicted earnings',
    products:products.sort((a,b)=>(b.evidenceScore??-1)-(a.evidenceScore??-1))};
}
