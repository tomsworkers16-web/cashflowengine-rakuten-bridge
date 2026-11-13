import {planMagazineIssue} from './magazine-editorial.js';
import {previewMagazineWithProducts} from './magazine-product-preview.js';
// Read-only search adapter. No retries, no publishing, no credential output.
export async function researchMagazineIssue(day,slot,{search}={}){
 const issue=planMagazineIssue(day,slot);
 if(typeof search!=='function')throw Error('search_adapter_required');
 const items=await search(issue.researchKeyword);
 return previewMagazineWithProducts(day,slot,items);
}
export function createRakutenEditorialSearch({env=process.env,fetchImpl=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 let calls=0,blocked=false;
 return async keyword=>{
  if(blocked)throw Error('rakuten_search_http_429');
  const {RAKUTEN_APPLICATION_ID:applicationId,RAKUTEN_ACCESS_KEY:accessKey,RAKUTEN_AFFILIATE_ID:affiliateId}=env;
  if(!applicationId||!accessKey||!affiliateId)throw Error('rakuten_credentials_missing');
  const q=new URLSearchParams({applicationId,accessKey,affiliateId,keyword,format:'json',hits:'20',availability:'1',sort:'standard'});
  const base=env.RAKUTEN_API_BASE||'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
  if(calls>0)await sleep(2000);
  calls++;
  let response;
  try{response=await fetchImpl(base+'?'+q,{signal:AbortSignal.timeout(15000)});}
  catch{throw Error('rakuten_search_unavailable');}
  if(!response.ok){
   if(response.status===429)blocked=true;
   const error=Error('rakuten_search_http_'+response.status);
   error.searchNumber=calls;
   error.retryAfter=response.headers?.get?.('retry-after')||null;
   throw error;
  }
  let data;try{data=await response.json();}catch{throw Error('rakuten_search_invalid_json');}
  const rows=data.Items||data.items;
  if(!Array.isArray(rows))throw Error('rakuten_search_invalid_shape');
  return rows.map(row=>{const i=row?.Item||row?.item||row||{};return {
   itemCode:i.itemCode,itemName:i.itemName,price:Number(i.itemPrice),affiliateUrl:i.affiliateUrl,reviewCount:i.reviewCount,reviewAverage:i.reviewAverage,affiliateRate:i.affiliateRate
  };});
 };
}
