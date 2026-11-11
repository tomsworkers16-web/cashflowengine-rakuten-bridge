// Read-only A/B opportunity report: both arms replay one snapshot, never call Rakuten.
import {readFile} from 'node:fs/promises';
import {loadListingSnapshot,replayListingSearch,asciiJson} from './magazine-listing-snapshot.js';
import {discoverRevenueOpportunity} from './magazine-opportunity.js';
try{
 const snapshotPath=process.argv[2],evidencePath=process.argv[3];
 if(!snapshotPath)throw Error('snapshot_path_required');
 const snapshot=await loadListingSnapshot(snapshotPath);
 const signals=evidencePath?JSON.parse(await readFile(evidencePath,'utf8')):[];
 const opts={includeSeasonal:true,search:replayListingSearch(snapshot,{day:snapshot.day,slot:snapshot.slot})};
 const baseline=await discoverRevenueOpportunity(snapshot.day,snapshot.slot,opts);
 const fusion=await discoverRevenueOpportunity(snapshot.day,snapshot.slot,{...opts,demandSignals:signals});
 const compact=o=>o?{topicId:o.topicId,score:o.score??null,fusedScore:o.fusedScore??null,itemCode:o.product?.itemCode??null,price:o.product?.price??null}:null;
 console.log(asciiJson({status:'offline_ab_preview',snapshotCapturedAt:snapshot.capturedAt,baseline:compact(baseline.selected),fusion:compact(fusion.fusion.selected),sourcesAccepted:fusion.fusion.sourcesAccepted,sourcesRejected:fusion.fusion.sourcesRejected,sourceRejections:fusion.fusion.rejections,
 comparison:fusion.fusion.opportunities.map(o=>({topicId:o.topicId,baselineScore:o.score,fusedScore:o.fusedScore,evidenceCount:o.demandEvidence?.evidenceCount||0,sourceLinks:o.demandEvidence?.sourceLinks||[]})),
 caveat:'different_topic_rankings_are_heuristic_not_a_b_performance_data',publicationAllowed:false}));
}catch(e){console.error(JSON.stringify({status:'failed',reason:/^(?:snapshot_|demand_)/.test(String(e.message))?e.message:'offline_ab_preview_failed'}));process.exitCode=1;}
