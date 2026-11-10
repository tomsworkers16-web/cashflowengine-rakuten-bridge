// Offline editorial candidate matching; normalized Rakuten item records are supplied by caller.
import {planMagazineIssue} from './magazine-editorial.js';
import {cleanProductName,validatePublicationText} from './product-posting.js';
const rules={
 'storage-flow':[/収納/u,/ラック|棚/u],
 'washbasin':[/洗面台|洗面所/u,/排水口|ヘアーキャッチャー|ゴミ受け/u],
 'kitchen-cleanup':[/水切り/u,/ラック|かご|カゴ/u]
};
export function matchEditorialProducts(issue,items){
 const conditions=rules[issue?.topicId]||[];
 if(!conditions.length)return [];
 return (Array.isArray(items)?items:[]).filter(item=>{
  const title=String(item?.itemName||'');
  return conditions.every(r=>r.test(title))&&typeof item.itemCode==='string'&&
   /^[\w-]+:[\w-]+$/.test(item.itemCode)&&typeof item.affiliateUrl==='string'&&
   /^https:\/\//.test(item.affiliateUrl);
 }).map(item=>({itemCode:item.itemCode,itemName:cleanProductName(item.itemName),price:Number.isFinite(Number(item.price))&&Number(item.price)>0?Number(item.price):null,
  affiliateUrl:item.affiliateUrl,matchEvidence:'listing_title_only',specificationsVerified:false}));
}
export function previewMagazineWithProducts(day,slot,items){
 const issue=planMagazineIssue(day,slot);
 const candidates=matchEditorialProducts(issue,items);
 // Candidate association is not endorsement; never claim verified specifications from title matching.
 const candidate=candidates[0];
 if(!candidate)return {...issue,productSelection:'no_relevant_candidate',candidates:[],commercialDraft:null};
 const price=candidate.price===null?'':'掲載時価格：約'+candidate.price.toLocaleString('ja-JP')+'円（変動あり）';
 const draft=['【PR】',issue.text,'関連する商品の候補：'+candidate.itemName,price,
  '適合条件・仕様・送料は商品ページで確認してください。',candidate.affiliateUrl].filter(Boolean).join('\n\n');
 const valid=!validatePublicationText(draft,{revenue:true,affiliateUrl:candidate.affiliateUrl});
 return {...issue,productSelection:'title_matched_review_required',candidates,
  commercialDraft:valid?draft:null,commercialDraftStatus:valid?'manual_review_required':'too_long_or_invalid',
  reviewRequired:['verify_product_specifications','verify_current_price_and_shipping','verify_editorial_relevance']};
}
