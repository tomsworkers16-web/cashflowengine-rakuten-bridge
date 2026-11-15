// CLI: local snapshot + verified evidence metadata -> review packet. No external calls or publication.
import {readFile} from 'node:fs/promises';
import {loadListingSnapshot,asciiJson} from './magazine-listing-snapshot.js';
import {buildMatchedFusionCreativePacket} from './magazine-fusion-creative-pilot.js';
import {summarizeMatchedCreativeReview} from './magazine-fusion-preflight.js';
try{
 const [snapshotPath,signalsPath]=process.argv.slice(2);
 if(!snapshotPath||!signalsPath)throw Error('input_paths_required');
 const snapshot=await loadListingSnapshot(snapshotPath);
 const signals=JSON.parse(await readFile(signalsPath,'utf8'));
 const result=await buildMatchedFusionCreativePacket(snapshot,signals);
 console.log(asciiJson(process.argv.includes('--summary')?summarizeMatchedCreativeReview(result):result));
 if(result.status!=='creatives_ready_for_review')process.exitCode=2;
}catch(e){console.error(JSON.stringify({status:'failed',reason:'fusion_creative_pilot_input_invalid'}));process.exitCode=1;}
