// Offline editorial packet: re-evaluate the saved listings, then bind drafts to exact selected items.
import {discoverRevenueOpportunity} from './magazine-opportunity.js';
import {replayListingSearch} from './magazine-listing-snapshot.js';
import {buildWriterBrief} from './magazine-writing-workflow.js';
import {prepareMagazineCommercialDraft} from './magazine-commercial-draft.js';
export async function buildEditorialPacket(snapshot,{articles=[]}={}){
 const result=await discoverRevenueOpportunity(snapshot.day,snapshot.slot,{search:replayListingSearch(snapshot,{day:snapshot.day,slot:snapshot.slot}),includeSeasonal:true});
 const entries=[];
 for(const strategy of ['turnoverOriented','rewardOriented']){
  const candidate=result.strategyCandidates[strategy];
  if(!candidate)continue;
  const issue=result.opportunities.find(o=>o.topicId===candidate.topicId).issue;
  const product=candidate.product;
  const article=articles.find(a=>a.strategy===strategy&&a.itemCode===product.itemCode);
  entries.push({strategy,topicId:issue.topicId,itemCode:product.itemCode,product,brief:buildWriterBrief({...issue,candidates:[product]}),draft:article?prepareMagazineCommercialDraft({article:article.text,product}):null});
 }
 return {status:'editorial_preview',capturedAt:snapshot.capturedAt,entries,comparisonEligible:entries.length===2&&entries[0].topicId===entries[1].topicId&&entries[0].itemCode!==entries[1].itemCode,publicationAllowed:false};
}
