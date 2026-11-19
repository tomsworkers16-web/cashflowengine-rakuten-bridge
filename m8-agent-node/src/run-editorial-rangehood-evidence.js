// One-item diagnostic, read-only. No posting, no model writing, no publishing.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {fetchRakutenEditorialEvidence} from './editorial-rakuten-evidence.js';
import {fetchRakutenProductPageHtml} from './editorial-page-verifier.js';
import {analyzeRangehoodFilterPage} from './editorial-rangehood-evidence.js';

const ITEM='starfilter:10000112';
export async function runRangehoodEvidence({
 applicationId,accessKey,affiliateId,fetchFn=fetch
}={}) {
 if(!applicationId||!accessKey||!affiliateId)
  return {status:'research_required',reason:'rakuten_credentials_missing',published:0};
 let e;
 try{e=await fetchRakutenEditorialEvidence(ITEM,{applicationId,accessKey,affiliateId,fetchFn});}
 catch{return {status:'research_required',reason:'official_product_fetch_failed',published:0};}
 if(e.status!=='needs_product_detail_research'||!e.productPageUrl)
  return {status:'research_required',reason:'product_page_missing',published:0};
 let p;
 try{p=await fetchRakutenProductPageHtml(e.productPageUrl,{fetchFn});}
 catch{return {status:'research_required',reason:'product_page_fetch_failed',published:0};}
 const review=analyzeRangehoodFilterPage(p.html);
 return {itemCode:ITEM,productPageUrl:p.url,
  ...review,mode:'read_only_no_publication',
  note:'The text matching only establishes what this page says; fit and configuration remain unverified.'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 runRangehoodEvidence({applicationId:process.env.RAKUTEN_APPLICATION_ID,
  accessKey:process.env.RAKUTEN_ACCESS_KEY,
  affiliateId:process.env.RAKUTEN_AFFILIATE_ID})
 .then(x=>console.log(JSON.stringify(x,null,2)))
 .catch(()=>{console.log(JSON.stringify({status:'research_required',reason:'inspection_failed',published:0}));process.exitCode=1;});
}
