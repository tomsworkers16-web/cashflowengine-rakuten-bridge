// End-to-end opt-in metadata feed -> baseline/fusion offline comparison.
// Only explicitly allowed JSON Feed endpoints; never modifies existing M8 scheduler.
import {readFile} from 'node:fs/promises';
import {loadListingSnapshot,replayListingSearch,asciiJson} from './magazine-listing-snapshot.js';
import {collectJsonFeedDemand} from './magazine-json-feed-demand.js';
import {discoverRevenueOpportunity} from './magazine-opportunity.js';
export async function previewFeedFusion(snapshot,{feeds=[],fetchImpl,now}={}){
 const metadata=await collectJsonFeedDemand({feeds,day:snapshot.day,fetchImpl,now});
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
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1].replace(/\\/g,'/')).href){
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
