// Editorial review queue planner only; never schedules or sends posts.
// Articles can be placed in a queue only after a separate owner approval
// record and all publication blockers have been resolved.
// The resulting entries are PROPOSALS, not executable publication jobs.
export function planEditorialReviewQueue({items=[],now='2026-11-20',max=3}={}){
 if(!Array.isArray(items))throw new TypeError('editorial_items_required');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(now))throw new TypeError('invalid_plan_date');
 if(!Number.isInteger(max)||max<1||max>7)throw new TypeError('invalid_plan_limit');
 const selected=[],held=[],seen=new Set();
 for(const item of items){
  const code=typeof item?.itemCode==='string'?item.itemCode.trim():'';
  if(!code||seen.has(code)) {
   held.push({itemCode:code||null,reason:seen.has(code)?'duplicate_item':'item_code_missing'});
   continue;
  }
  seen.add(code);
  const reasons=[];
  if(!['review_candidate','editorial_review_draft'].includes(item.status))
   reasons.push('review_draft_missing');
  if(typeof item.article!=='string'||item.article.trim().length<200)
   reasons.push('article_missing_or_short');
  if(item.productConditionsVerified!==true)
   reasons.push('product_conditions_unverified');
  if(item.variantResolved!==true)
   reasons.push('variant_unresolved');
  if(item.affiliateComplianceVerified!==true)
   reasons.push('affiliate_compliance_unverified');
  if(item.ownerApproved!==true)
   reasons.push('owner_approval_missing');
  if(item.destinationVerified!==true)
   reasons.push('destination_unverified');
  if(reasons.length){
   held.push({itemCode:code,reason:'publication_blocked',blockingReasons:reasons});
   continue;
  }
  if(selected.length>=max){
   held.push({itemCode:code,reason:'queue_capacity_exceeded'});
   continue;
  }
  selected.push({
   itemCode:code,
   proposalDate:now,
   status:'schedule_proposal_only',
   publishApproved:false,
   published:0
  });
 }
 return {
  version:'editorial-queue-planner-v1',
  mode:'dry_run_no_publication',
  proposed:selected,
  held,
  summary:{scanned:items.length,proposed:selected.length,held:held.length,published:0},
  automaticallyPublish:false,
  requiresManualScheduling:true
 };
}
