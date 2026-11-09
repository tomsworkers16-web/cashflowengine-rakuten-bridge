import {fileURLToPath} from 'node:url';
import path from 'node:path';
// Read-only, bounded Rakuten Product Search release-date feasibility probe.
// Does not publish, persist product data, or print API credentials.
const ENDPOINT = 'https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801';
const DEFAULT_KEYWORDS = ['収納ラック','掃除機','キッチン 便利'];
const MAX_KEYWORDS = 3;
const MAX_HITS = 10;

export function buildProductSearchRequest({applicationId,accessKey,keyword,hits=MAX_HITS}){
  if(!applicationId||!accessKey)throw new Error('rakuten_credentials_missing');
  if(typeof keyword!=='string'||!keyword.trim()||keyword.length>60)throw new Error('invalid_keyword');
  if(!Number.isInteger(hits)||hits<1||hits>MAX_HITS)throw new Error('hits_out_of_bounds');
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    applicationId,keyword,format:'json',formatVersion:'2',hits:String(hits),page:'1'
  }).toString();
  return {url,headers:{accessKey}};
}

export function normalizeProductSearchResponse(payload){
  // Official formatVersion=2 uses an unwrapped array; accept v1 wrappers
  // defensively without treating an unexpected response as an empty sample.
  const raw=payload?.Products??payload?.products??payload?.Items??payload?.items;
  if(!Array.isArray(raw))throw new Error('unexpected_product_response_shape');
  return raw.map(entry=>entry?.Product??entry?.product??entry).filter(v=>v&&typeof v==='object');
}

export function summarizeReleaseDates(products,keyword){
  const rows=products.map(p=>{
    const raw=p.releaseDate;
    const present=typeof raw==='string'&&raw.trim().length>0;
    const year=present&&/^\d{4}/.test(raw)?Number(raw.slice(0,4)):null;
    return {
      productName:String(p.productName??'').replace(/\s+/g,' ').slice(0,75),
      releaseDate:present?raw:null,
      releaseYear:Number.isInteger(year)&&year>=1900&&year<=2100?year:null,
      reviewCount:Number.isFinite(Number(p.reviewCount))?Number(p.reviewCount):null,
      salesItemCount:Number.isFinite(Number(p.salesItemCount))?Number(p.salesItemCount):null,
      rank:Number.isFinite(Number(p.rank))?Number(p.rank):null,
      hasProductCode:Boolean(p.productCode),
      hasProductId:Boolean(p.productId)
    };
  });
  return {
    keyword,
    sampled:rows.length,
    releaseDateFound:rows.filter(p=>p.releaseDate!==null).length,
    productCodeFound:rows.filter(p=>p.hasProductCode).length,
    productIdFound:rows.filter(p=>p.hasProductId).length,
    candidates:rows
  };
}

export async function runProbe({applicationId,accessKey,keywords=DEFAULT_KEYWORDS,hits=MAX_HITS,fetchFn=fetch}={}){
  if(!Array.isArray(keywords)||keywords.length<1||keywords.length>MAX_KEYWORDS)
    throw new Error('keywords_out_of_bounds');
  const results=[];
  for(let i=0;i<keywords.length;i++){
    const req=buildProductSearchRequest({applicationId,accessKey,keyword:keywords[i],hits});
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const res=await fetchFn(req.url,{headers:req.headers,signal:controller.signal,redirect:'error'});
      if(!res.ok)throw new Error('rakuten_product_http_'+res.status);
      const payload=await res.json();
      results.push(summarizeReleaseDates(normalizeProductSearchResponse(payload),keywords[i]));
    }finally{clearTimeout(timeout)}
    // Gentle pacing. No retries, pagination or background monitoring.
    if(i<keywords.length-1)await new Promise(resolve=>setTimeout(resolve,1100));
  }
  const total=results.reduce((n,x)=>n+x.sampled,0);
  const dated=results.reduce((n,x)=>n+x.releaseDateFound,0);
  return {status:'read_only_probe_complete',postingPerformed:false,
    persistencePerformed:false,endpointVersion:'20250801',
    totalSampled:total,releaseDateFound:dated,
    releaseDateCoveragePct:total?Math.round(100*dated/total):null,
    caveat:'releaseDate means product launch date, not Rakuten first listing date or verified long-term sales',
    searches:results};
}

async function main(){
  const applicationId=process.env.RAKUTEN_APPLICATION_ID;
  const accessKey=process.env.RAKUTEN_ACCESS_KEY;
  const result=await runProbe({applicationId,accessKey});
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{
    // Never print raw request URL, response body or exception containing credentials.
    const reason=String(e.message||'error');
    const safe=/^(?:rakuten_credentials_missing|invalid_keyword|hits_out_of_bounds|keywords_out_of_bounds|unexpected_product_response_shape|rakuten_product_http_\d{3})$/.test(reason)?reason:'product_probe_failed';
    console.error(JSON.stringify({status:'probe_failed',postingPerformed:false,reason:safe}));
    process.exitCode=1;
  });
}
