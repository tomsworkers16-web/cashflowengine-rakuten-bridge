// Exact Rakuten item-code read-only research on M8. No publication.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {fetchRakutenEditorialEvidence} from './editorial-rakuten-evidence.js';
import {fetchRakutenProductPageHtml} from './editorial-page-verifier.js';
import {analyzeVacuumContainerPage} from './editorial-vacuum-evidence.js';

const ITEM='kitchenavi:10000408';
export async function runVacuumEvidence({
  applicationId,accessKey,affiliateId,fetchFn=fetch
}={}){
 if(!applicationId||!accessKey||!affiliateId)
  return {status:'research_required',reason:'rakuten_credentials_missing',published:0};
 let product;
 try {product=await fetchRakutenEditorialEvidence(ITEM,{applicationId,accessKey,affiliateId,fetchFn});}
 catch {return {status:'research_required',reason:'official_item_fetch_failed',published:0};}
 if(product.status!=='needs_product_detail_research'||!product.productPageUrl)
  return {status:'research_required',reason:'product_evidence_missing',published:0};
 let page;
 try {page=await fetchRakutenProductPageHtml(product.productPageUrl,{fetchFn});}
 catch {return {status:'research_required',reason:'product_page_fetch_failed',published:0};}
 return {
  itemCode:ITEM,productPageUrl:page.url,
  ...analyzeVacuumContainerPage(page.html)
 };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 runVacuumEvidence({
  applicationId:process.env.RAKUTEN_APPLICATION_ID,
  accessKey:process.env.RAKUTEN_ACCESS_KEY,
  affiliateId:process.env.RAKUTEN_AFFILIATE_ID
 }).then(x=>console.log(JSON.stringify(x,null,2)))
 .catch(()=>{console.log(JSON.stringify({status:'research_required',reason:'vacuum_research_failed',published:0}));process.exitCode=1;});
}
