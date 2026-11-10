import {discoverRevenueOpportunity} from './magazine-opportunity.js';
import {createRakutenEditorialSearch} from './magazine-research.js';
import {buildWriterBrief} from './magazine-writing-workflow.js';
const day=process.argv[2]||new Date(Date.now()+9*3600000).toISOString().slice(0,10);
try{
 const result=await discoverRevenueOpportunity(day,'19:30',{search:createRakutenEditorialSearch(),includeSeasonal:true});
 console.log(JSON.stringify({...result,writerBrief:result.selected?buildWriterBrief({...result.selected.issue,candidates:[result.selected.product]}):null},null,2));
}catch(e){console.error(JSON.stringify({status:'failed',reason:/^rakuten_search_http_\d+$|^rakuten_credentials_missing$/.test(e.message)?e.message:'opportunity_scan_failed'}));process.exitCode=1;}
