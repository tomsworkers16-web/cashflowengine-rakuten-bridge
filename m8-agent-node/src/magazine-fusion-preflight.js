// Human-readable preflight model for the non-publishing baseline/fusion creative preview.
// The review report omits tracking URLs; full exact links remain only in the local preview packet.
import {validatePublicationText} from './product-posting.js';
export function summarizeMatchedCreativeReview(packet){
 if(packet?.status!=='creatives_ready_for_review'||!Array.isArray(packet.arms)||packet.arms.length!==2)
  return {status:'not_ready',reason:packet?.status||'invalid_packet',publicationAllowed:false};
 const arms=['baseline','fusion'].map(arm=>packet.arms.find(x=>x.arm===arm));
 if(arms.some(x=>!x?.draft?.text||x.itemCode!==packet.productItemCode))
  return {status:'not_ready',reason:'item_binding_or_missing_draft',publicationAllowed:false};
 const results=arms.map(x=>{
  const text=x.draft.text, url=x.draft.text.split(/\n/).at(-1).trim();
  const error=validatePublicationText(text,{revenue:true,affiliateUrl:url});
  const body=text.split('気になる方はこちら：')[0].replace(/^【PR】\s*/u,'').trim();
  return {arm:x.arm,itemCode:x.itemCode,characters:text.length,postSafeShape:error===null,
   bodyPreview:body,editorialWarnings:x.draft.review?.warnings||[],sourceCount:x.evidenceLinks.length,
   affiliateLinkPresent:!!url&&text.endsWith(url),remainingCharacters:500-text.length};
 });
 const distinct=results[0].bodyPreview!==results[1].bodyPreview;
 const valid=distinct&&results.every(x=>x.postSafeShape&&x.affiliateLinkPresent);
 return {status:valid?'manual_editorial_review_required':'not_ready',sameProduct:true,distinctEditorialAngles:distinct,
  itemCode:packet.productItemCode,comparisonType:packet.comparisonType,results,
  prePublicationChecks:['confirm_current_listing_price_stock_shipping','verify_installation_and_dimensions','review_reader_value_and_copy_naturalness','check_external_article_evidence','choose_actual_preassigned_time_slots','confirm_no_collision_with_existing_auto_post','owner_approval_before_publication'],
  publicationAllowed:false,copyAffectOnCTR:'unmeasured',affiliateOutcomeAttribution:'unverified'};
}
