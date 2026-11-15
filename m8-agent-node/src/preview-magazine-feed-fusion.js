// End-to-end opt-in metadata feed -> baseline/fusion offline comparison.
// Only explicitly allowed JSON Feed endpoints; never modifies existing M8 scheduler.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {loadListingSnapshot,replayListingSearch,asciiJson} from './magazine-listing-snapshot.js';
import {collectJsonFeedDemand} from './magazine-json-feed-demand.js';
import {discoverRevenueOpportunity} from './magazine-opportunity.js';
export async function previewFeedFusion(snapshot,{feeds=[],fetchImpl,now=()=>new Date().toISOString(),observationDay}={}){
 const currentDay=observationDay||new Date(Date.parse(now())+9*3600000).toISOString().slice(0,10);
 if(snapshot?.day!==currentDay)return {status:'snapshot_stale_for_live_evidence',snapshotDay:snapshot?.day||null,observationDay:currentDay,publicationAllowed:false};
 const metadata=await collectJsonFeedDemand({feeds,day:currentDay,fetchImpl,now});
 const options={search:replayListingSearch(snapshot,{day:snapshot.day,slot:snapshot.slot}),includeSeasonal:true};
 const baseline=await discoverRevenueOpportunity(snapshot.day,snapshot.slot,options);
 const withEvidence=await discoverRevenueOpportunity(snapshot.day,snapshot.slot,{...options,demandSignals:metadata.signals});
 const selected=v=>v?{topicId:v.topicId,itemCode:v.product?.itemCode??null,baselineScore:v.score??null,fusedScore:v.fusedScore??null}:null;
 return {status:'read_only_fusion_comparison',baseline:selected(baseline.selected),
  fusion:selected(withEvidence.fusion.selected),
  evidence:{feedsRetrieved:metadata.fetchedFeedCount,signalsAccepted:metadata.accepted,signalsRejected:metadata.rejected,diagnostics:metadata.diagnostics},
  isDemandVerified:false,comparisonShowsMeasuredRevenue:false,publicationAllowed:false,
  caveat:'Approved feed headlines are editorial hypotheses; no tracked conversions, attributable rewards, or verified buyer demand.'};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 try{
  const [snapshotPath,feedConfigPath]=process.argv.slice(2);
  if(!snapshotPath||!feedConfigPath)throw Error('inputs_required');
  const snapshot=await loadListingSnapshot(snapshotPath);
  const configuration=JSON.parse(await readFile(feedConfigPath,'utf8'));
  if(!Array.isArray(configuration?.feeds))throw Error('invalid_feed_configuration');
  const result=await previewFeedFusion(snapshot,{feeds:configuration.feeds});
  console.log(asciiJson(result));
 }catch{console.error(JSON.stringify({status:'failed',reason:'feed_fusion_preview_failed'}));process.exitCode=1;}
}
