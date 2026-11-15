// A/B creative packet built from one saved product snapshot and external editorial evidence.
// Crucially, both arms advertise the SAME item. This is a no-publish preview, not a schedule.
import {discoverRevenueOpportunity} from './magazine-opportunity.js';
import {replayListingSearch} from './magazine-listing-snapshot.js';
import {prepareMagazineCommercialDraft} from './magazine-commercial-draft.js';
const baselineBody='水切りラックを選ぶとき、サイズと置き場所を先に確認していますか？シンク上に置くタイプなら、設置面や蛇口との位置関係も大切。買う前にキッチンの寸法を測っておくと、選びやすくなります。';
const fusionBody='洗い物が終わったのに、調理台が狭いまま。そんなとき、水切りラックの置き場所を変えるという考え方があります。シンク上の空間を使う方法も一つ。ただし設置面や蛇口の高さは要確認。まず自宅の台所を測るところから始めたいですね。';
export async function buildMatchedFusionCreativePacket(snapshot,demandSignals=[]){
 const opts={search:replayListingSearch(snapshot,{day:snapshot.day,slot:snapshot.slot}),includeSeasonal:true};
 const baseline=await discoverRevenueOpportunity(snapshot.day,snapshot.slot,opts);
 const fused=await discoverRevenueOpportunity(snapshot.day,snapshot.slot,{...opts,demandSignals});
 const a=baseline.selected,b=fused.fusion.selected;
 if(!a||!b)return {status:'no_eligible_product',publicationAllowed:false,arms:[]};
 if(a.topicId!=='kitchen-cleanup'||b.topicId!==a.topicId||a.product.itemCode!==b.product.itemCode)
  return {status:'unmatched_products_or_topic',baselineItemCode:a.product.itemCode,fusionItemCode:b.product.itemCode,publicationAllowed:false,arms:[]};
 const evidence=b.demandEvidence;
 if(!evidence||evidence.sourceDomains<2)return {status:'insufficient_external_evidence',publicationAllowed:false,arms:[]};
 const candidates=[{arm:'baseline',article:baselineBody},{arm:'fusion',article:fusionBody}].map(x=>({
  arm:x.arm,topicId:a.topicId,itemCode:a.product.itemCode,
  evidenceLinks:x.arm==='fusion'?evidence.sourceLinks:[],
  draft:prepareMagazineCommercialDraft({article:x.article,product:a.product})
 }));
 return {status:candidates.every(x=>x.draft.status==='manual_review_required')?'creatives_ready_for_review':'draft_review_needed',
  comparisonType:'same_item_different_editorial_angle',productItemCode:a.product.itemCode,baselineScore:a.score,fusedScore:b.fusedScore,
  contentAssurance:'illustrative_editorial_copy_not_automatic_claim_verification',
  arms:candidates,assignmentStatus:'not_assigned',publishStatus:'not_published',ownerApprovalRequired:true,publicationAllowed:false};
}
