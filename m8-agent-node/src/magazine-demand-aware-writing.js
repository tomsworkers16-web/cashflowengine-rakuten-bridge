// Connect approved headline hypotheses to a writer/reviewer without presenting them as buyer facts.
// No publication, no scheduler changes, writer and reviewer must be injected.
import {discoverRevenueOpportunity} from './magazine-opportunity.js';
import {replayListingSearch} from './magazine-listing-snapshot.js';
import {buildWriterBrief,reviewArticle} from './magazine-writing-workflow.js';
import {prepareMagazineCommercialDraft} from './magazine-commercial-draft.js';
export async function draftDemandAwareMagazine(snapshot,{demandSignals=[],writer,reviewer}={}){
 if(!Array.isArray(demandSignals))throw Error('invalid_demand_signals');
 const result=await discoverRevenueOpportunity(snapshot.day,snapshot.slot,{
  search:replayListingSearch(snapshot,{day:snapshot.day,slot:snapshot.slot}),includeSeasonal:true,demandSignals});
 const choice=result.fusion.selected;
 if(!choice?.product)return {status:'no_eligible_product',publicationAllowed:false};
 const topicEvidence=choice.demandEvidence;
 if(!topicEvidence?.evidenceCount)return {status:'insufficient_topic_evidence',topicId:choice.topicId,publicationAllowed:false};
 const {product}=choice;
 const brief={...buildWriterBrief({...choice.issue,candidates:[product]}),
  sourcePolicy:{sourceType:'headline_metadata_only',verifiedReaderNeeds:false,verifiedProductClaims:false,
   editorialUse:'inspiration_only_not_evidence_of_product_performance',requireOwnerReview:true},
  topicId:choice.topicId,itemCode:product.itemCode,
  sourceHeadlines:topicEvidence.sourceLinks.map(s=>({url:s.url,readerNeed:s.readerNeed,observedAt:s.observedAt,sourceType:s.sourceType})),
  constraints:['Do not quote source articles beyond supplied headlines','Do not claim to have tested the product',
   'Do not claim search volume, popularity, effectiveness, safety or reader experiences without reliable source verification',
   'Write a useful reader-first story before introducing a relevant product']};
 if(typeof writer!=='function'||typeof reviewer!=='function')
  return {status:'writer_or_reviewer_not_configured',topicId:choice.topicId,itemCode:product.itemCode,brief,publicationAllowed:false};
 try{
  const linkLength=String(product.affiliateUrl||'').length;
  const maxBody=500-linkLength-130;
  if(maxBody<40)return {status:'link_budget_too_small',topicId:choice.topicId,publicationAllowed:false};
  const raw=await writer({...brief,maxBodyCharacters:maxBody});
  if(typeof raw!=='string'||raw.length>maxBody)return {status:'writer_output_rejected',topicId:choice.topicId,publicationAllowed:false};
  const reviewed=reviewArticle(raw);
  if(reviewed.errors.length)return {status:'writer_output_rejected',topicId:choice.topicId,reviewed,publicationAllowed:false};
  const opinion=await reviewer({brief,article:raw,itemCode:product.itemCode});
  if(opinion?.decision!=='accept'||opinion.itemCode!==product.itemCode)return {status:'editorial_revision_required',topicId:choice.topicId,publicationAllowed:false};
  const draft=prepareMagazineCommercialDraft({article:raw,product});
  return {status:draft.status,topicId:choice.topicId,itemCode:product.itemCode,sourceCount:topicEvidence.evidenceCount,
   review:reviewed,draft,publicationAllowed:false,ownerApprovalRequired:true,
   verifiedOutcomes:false};
 }catch{return {status:'writer_or_reviewer_failed',topicId:choice.topicId,publicationAllowed:false};}
}
