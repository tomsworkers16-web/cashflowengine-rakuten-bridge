import {discoverRevenueOpportunity} from './magazine-opportunity.js';
import {createRakutenEditorialSearch} from './magazine-research.js';
import {buildWriterBrief} from './magazine-writing-workflow.js';
import {createRakutenRankingSearch,attachRankingEvidence} from './magazine-ranking.js';
const day=process.argv[2]||new Date(Date.now()+9*3600000).toISOString().slice(0,10);
try{
 let result=await discoverRevenueOpportunity(day,'19:30',{search:createRakutenEditorialSearch(),includeSeasonal:true});
 if(process.argv.includes('--ranking')){
  await new Promise(resolve=>setTimeout(resolve,2000));
  result=attachRankingEvidence(result,await createRakutenRankingSearch()());
 }
 const json=JSON.stringify({...result,writerBrief:result.selected?buildWriterBrief({...result.selected.issue,candidates:[result.selected.product]}):null},null,2);
 // ASCII JSON escapes preserve Japanese across Windows PowerShell native stdout decoding.
 console.log(json.replace(/[\u007f-\uffff]/g,ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0')));
}catch(e){console.error(JSON.stringify({status:'failed',reason:/^(?:rakuten_search|ranking)_http_\d+$|^rakuten_credentials_missing$/.test(e.message)?e.message:'opportunity_scan_failed',searchNumber:e.searchNumber??null,retryAfter:e.retryAfter??null}));process.exitCode=1;}
