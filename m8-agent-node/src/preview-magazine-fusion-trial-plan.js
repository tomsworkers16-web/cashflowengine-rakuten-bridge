// Offline, no-publish planning preview. Does not inspect or change the live posting queue.
// A missing occupied-slot file is explicitly marked as UNVERIFIED.
import {readFile} from 'node:fs/promises';
import {loadListingSnapshot,asciiJson} from './magazine-listing-snapshot.js';
import {buildMatchedFusionCreativePacket} from './magazine-fusion-creative-pilot.js';
import {createFusionTrialPlan} from './magazine-fusion-trial-plan.js';
import {assessFusionPostingSlots} from './magazine-slot-availability.js';
try{
 const [snapshotPath,signalsPath,startDay,slot='19:30',schedulerStatePath]=process.argv.slice(2);
 if(!snapshotPath||!signalsPath||!startDay)throw Error('required_arguments_missing');
 const snapshot=await loadListingSnapshot(snapshotPath);
 const signals=JSON.parse(await readFile(signalsPath,'utf8'));
 const packet=await buildMatchedFusionCreativePacket(snapshot,signals);
 const schedulerState=schedulerStatePath?JSON.parse(await readFile(schedulerStatePath,'utf8')):{};
 const assessment=assessFusionPostingSlots({...schedulerState,dayFrom:startDay,dayCount:30});
 if(assessment.status==='scheduler_state_unknown'){
  console.log(asciiJson({status:'scheduler_state_unknown',reason:'offline_queue_not_verified',creativePacketStatus:packet.status,publicationAllowed:false,entries:[]}));
  process.exitCode=2;
 }else{
 const plan=createFusionTrialPlan(packet,{startDay,slot,pairs:3,occupiedSlots:assessment.occupiedSlots});
 console.log(asciiJson({...plan,existingQueueVerified:false,queueWarning:'OFFLINE_ONLY_LIVE_QUEUE_NOT_VERIFIED_DO_NOT_SCHEDULE',collisionAssessment:{status:assessment.status,autoPostEnabled:assessment.autoPostEnabled,occupiedCount:assessment.occupiedSlots.length,requiresLiveQueueConfirmation:true},
  creativePacketStatus:packet.status,sourceSnapshotDate:snapshot.day,sourceSnapshotCapturedAt:snapshot.capturedAt,publicationAllowed:false}));
 if(plan.status!=='plan_ready_for_owner_review')process.exitCode=2;
 }
}catch{console.error(JSON.stringify({status:'failed',reason:'offline_fusion_trial_plan_input_invalid'}));process.exitCode=1;}
