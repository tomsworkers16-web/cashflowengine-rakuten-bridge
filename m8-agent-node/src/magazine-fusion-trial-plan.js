// Prepublication experiment assignments. Generates a PLAN, never publishes, queues or overwrites.
// A/B copy tests require the same item and distinct angles; arm allocation is locked before results.
const SLOTS=new Set(['07:30','12:30','19:30']);
const DAY=/^\d{4}-\d{2}-\d{2}$/;
function dateToMs(day){
 if(typeof day!=='string'||!DAY.test(day))throw Error('invalid_plan_date');
 const time=Date.parse(day+'T00:00:00Z');
 if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==day)throw Error('invalid_plan_date');
 return time;
}
function plusDay(day,n){return new Date(dateToMs(day)+n*86400000).toISOString().slice(0,10);}
export function createFusionTrialPlan(packet,{startDay,slot='19:30',pairs=3,occupiedSlots=[],dayLimit=30}={}){
 dateToMs(startDay);
 if(!SLOTS.has(slot)||!Number.isInteger(pairs)||pairs<1||pairs>10||!Number.isInteger(dayLimit)||dayLimit<2||dayLimit>60)throw Error('invalid_plan_options');
 if(!Array.isArray(occupiedSlots))throw Error('invalid_occupied_slots');
 const busy=new Set();
 for(const x of occupiedSlots){
  if(!x||typeof x.jstDate!=='string'||!DAY.test(x.jstDate)||!SLOTS.has(x.slot))throw Error('invalid_occupied_slots');
  busy.add(x.jstDate+'|'+x.slot);
 }
 const valid=packet?.status==='creatives_ready_for_review'&&packet.publicationAllowed===false&&packet.arms?.length===2
  &&packet.arms[0]?.arm==='baseline'&&packet.arms[1]?.arm==='fusion'
  &&packet.arms.every(x=>x.itemCode===packet.productItemCode&&x.draft?.status==='manual_review_required'&&typeof x.draft.text==='string')
  &&packet.arms[0].draft.text!==packet.arms[1].draft.text;
 if(!valid)return {status:'creative_packet_not_ready',publicationAllowed:false,entries:[]};
 const candidates=[];
 for(let i=0;i<dayLimit;i++){
  const day=plusDay(startDay,i);
  if(!busy.has(day+'|'+slot))candidates.push(day);
 }
 const need=pairs*2;
 if(candidates.length<need)return {status:'insufficient_free_slots',required:need,available:candidates.length,entries:[],publicationAllowed:false};
 const entries=[];
 for(let i=0;i<pairs;i++){
  // AB then BA to reduce a simple first-position/weekday trend; does NOT establish randomization.
  const arms=i%2===0?['baseline','fusion']:['fusion','baseline'];
  for(let j=0;j<2;j++)entries.push({planId:'cfe-fusion-copy-v1',sequence:i*2+j+1,jstDate:candidates[i*2+j],slot,arm:arms[j],topicId:packet.arms[0].topicId,itemCode:packet.productItemCode,
   publishStatus:'not_published',postId:null,approvalStatus:'owner_approval_required',snapshotFreshness:'must_recheck_before_publication'});
 }
 return {status:'plan_ready_for_owner_review',experimentType:'same_product_copy_angle',allocationPolicy:'alternating_ab_ba_not_randomized',
  startDay,slot,pairs,entries,armCounts:{baseline:pairs,fusion:pairs},occupiedSlotsExcluded:busy.size,selectedSlotCount:need,
  constraints:['confirm_existing_automatic_post_queue','refresh_current_product_price_specs_availability','ensure_same_product_and_link','owner_approval_each_publication','no_auto_post_from_plan'],
  independentRevenueAttribution:'not_established',publicationAllowed:false,autoScheduleChanged:false};
}
