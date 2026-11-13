// Offline, no-publish planning preview. Does not inspect or change the live posting queue.
// A missing occupied-slot file is explicitly marked as UNVERIFIED.
import {readFile} from 'node:fs/promises';
import {loadListingSnapshot,asciiJson} from './magazine-listing-snapshot.js';
import {buildMatchedFusionCreativePacket} from './magazine-fusion-creative-pilot.js';
import {createFusionTrialPlan} from './magazine-fusion-trial-plan.js';
try{
 const [snapshotPath,signalsPath,startDay,slot='19:30',occupiedPath]=process.argv.slice(2);
 if(!snapshotPath||!signalsPath||!startDay)throw Error('required_arguments_missing');
 const snapshot=await loadListingSnapshot(snapshotPath);
 const signals=JSON.parse(await readFile(signalsPath,'utf8'));
 const packet=await buildMatchedFusionCreativePacket(snapshot,signals);
 const occupiedSlots=occupiedPath?JSON.parse(await readFile(occupiedPath,'utf8')):[];
 const plan=createFusionTrialPlan(packet,{startDay,slot,pairs:3,occupiedSlots});
 console.log(asciiJson({...plan,existingQueueVerified:false,queueWarning:occupiedPath?'provided_slots_not_live_queue_verified':'NO_LIVE_QUEUE_CHECKED_DO_NOT_SCHEDULE',
  creativePacketStatus:packet.status,sourceSnapshotDate:snapshot.day,sourceSnapshotCapturedAt:snapshot.capturedAt,publicationAllowed:false}));
 if(plan.status!=='plan_ready_for_owner_review')process.exitCode=2;
}catch{console.error(JSON.stringify({status:'failed',reason:'offline_fusion_trial_plan_input_invalid'}));process.exitCode=1;}
