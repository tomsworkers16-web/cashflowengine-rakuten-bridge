// Fail-closed, read-only collision assessment. Does not inspect live M8 processes or change schedules.
// A configured recurring schedule occupies future slots even if journal has no entries yet.
const SLOTS=['07:30','12:30','19:30'];
const DAY=/^\d{4}-\d{2}-\d{2}$/;
function validDay(day){return typeof day==='string'&&DAY.test(day)&&!Number.isNaN(Date.parse(day+'T00:00:00Z'))&&new Date(Date.parse(day+'T00:00:00Z')).toISOString().startsWith(day);}
export function assessFusionPostingSlots({autoPostEnabled,configuredSlots,posts=[],dayFrom,dayCount=30}={}){
 if(!validDay(dayFrom)||!Number.isInteger(dayCount)||dayCount<1||dayCount>60)throw Error('invalid_slot_assessment_window');
 if(!Array.isArray(posts))throw Error('invalid_post_journal');
 // An unknown environment is unsafe, not an invitation to claim available slots.
 if(typeof autoPostEnabled!=='boolean'||!Array.isArray(configuredSlots))
  return {status:'scheduler_state_unknown',safeToSchedule:false,occupiedSlots:[],checkedLiveScheduler:false,publicationAllowed:false};
 if(configuredSlots.some(x=>!SLOTS.includes(x)))throw Error('invalid_configured_slots');
 const occupied=new Map();
 const note=(day,slot,reason)=>{const k=day+'|'+slot;if(!occupied.has(k))occupied.set(k,{jstDate:day,slot,reasons:[]});const a=occupied.get(k).reasons;if(!a.includes(reason))a.push(reason);};
 const from=Date.parse(dayFrom+'T00:00:00Z'),end=from+dayCount*86400000;
 for(let i=0;i<dayCount;i++){
  const day=new Date(from+i*86400000).toISOString().slice(0,10);
  if(autoPostEnabled)for(const slot of configuredSlots)note(day,slot,'recurring_auto_post');
 }
 for(const row of posts){
  const day=row?.jstDate,slot=row?.slot;
  if(!validDay(day)||!SLOTS.includes(slot))continue;
  const ts=Date.parse(day+'T00:00:00Z');
  if(ts<from||ts>=end)continue;
  // Even a pending/uncertain attempt reserves the slot; do not retry or overlap.
  note(day,slot,'post_journal_attempt');
 }
 return {status:'offline_collision_assessment',safeToSchedule:false,occupiedSlots:[...occupied.values()].sort((a,b)=>a.jstDate.localeCompare(b.jstDate)||a.slot.localeCompare(b.slot)),
  checkedLiveScheduler:false,requiresLiveQueueConfirmation:true,autoPostEnabled,configuredSlots:[...configuredSlots],publicationAllowed:false};
}
