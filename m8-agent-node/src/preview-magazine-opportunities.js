import {discoverRevenueOpportunity} from './magazine-opportunity.js';
import {createRakutenEditorialSearch} from './magazine-research.js';
import {buildWriterBrief} from './magazine-writing-workflow.js';
import {createRakutenRankingSearch,attachRankingEvidence} from './magazine-ranking.js';
import {captureListingSearch,replayListingSearch,saveListingSnapshot,loadListingSnapshot,asciiJson} from './magazine-listing-snapshot.js';
const args=process.argv.slice(2);
const day=args[0]&&!args[0].startsWith('--')?args[0]:new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const option=name=>{const i=args.indexOf(name);if(i===-1)return null;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('snapshot_path_required');return args[i+1];};
try{
 const savePath=option('--snapshot'),replayPath=option('--replay');
 if(replayPath&&(savePath||args.includes('--ranking')))throw Error('snapshot_replay_offline_only');
 const captured=replayPath?await loadListingSnapshot(replayPath):null;
 const capture=replayPath?null:captureListingSearch(createRakutenEditorialSearch(),{day});
 const search=replayPath?replayListingSearch(captured,{day}):capture.search;
 let result=await discoverRevenueOpportunity(day,'19:30',{search,includeSeasonal:true});
 const snapshot=captured||capture.snapshot();
 if(savePath)await saveListingSnapshot(savePath,snapshot);
 if(args.includes('--ranking')){
  await new Promise(resolve=>setTimeout(resolve,2000));
  result=attachRankingEvidence(result,await createRakutenRankingSearch()());
 }
 const briefFor=(candidate)=>candidate?buildWriterBrief({...result.opportunities.find(o=>o.topicId===candidate.topicId).issue,candidates:[candidate.product]}):null;
 console.log(asciiJson({...result,dataSource:replayPath?'local_snapshot':'rakuten_search',capturedAt:snapshot.capturedAt,writerBrief:briefFor(result.selected),turnoverWriterBrief:briefFor(result.strategyCandidates.turnoverOriented)}));
}catch(e){console.error(JSON.stringify({status:'failed',reason:/^(?:rakuten_search|ranking)_http_\d+$|^rakuten_credentials_missing$|^snapshot_[a-z_]+$/.test(e.message)?e.message:e.code==='EEXIST'?'snapshot_already_exists':'opportunity_scan_failed',searchNumber:e.searchNumber??null,retryAfter:e.retryAfter??null}));process.exitCode=1;}
