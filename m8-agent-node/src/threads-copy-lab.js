// Offline-only copy lab. Produces hypotheses for editorial review, not publish instructions.
// No API calls, uploads, posting, persisted state or assumed product performance.
import {cleanProductName,productUseCase,validatePublicationText} from './product-posting.js';

const MAX=500;
const UNSUPPORTED=/使ってみた|実際に使|愛用中|必ず|絶対|売れ続け|劇的|100%|最安|No\.1|大人気で|爆売れ/u;
function join(parts){return parts.filter(Boolean).join('\n');}
export function auditDraft(text,{affiliateUrl,revenue=true}={}){
 const failures=[];
 const structural=validatePublicationText(text,{affiliateUrl,revenue});
 if(structural)failures.push(structural);
 if(UNSUPPORTED.test(String(text)))failures.push('unverified_product_claim');
 if(typeof text==='string'&&text.length>MAX)failures.push('too_long');
 if(revenue&&typeof text==='string'&&text.includes('https://')&&
   text.indexOf('https://')!==text.lastIndexOf('https://'))failures.push('multiple_links_need_review');
 return {eligibleForManualReview:failures.length===0,failures,
  humanChecks:['specification_source','price_and_shipping_current','affiliate_disclosure','image_rights']};
}
export function createRevenueCopyHypotheses(item){
 const url=String(item?.affiliateUrl??'');
 const fullName=cleanProductName(item?.itemName,36);
 if(!fullName||!/^https:\/\//.test(url)||url.length>470)
  return {status:'ineligible',drafts:[],reason:'missing_product_or_affiliate_link'};
 const price=Number(item?.price);
 const priceText=Number.isFinite(price)&&price>0
  ?'掲載時価格：約'+price.toLocaleString('ja-JP')+'円（変動あり）':null;
 const use=productUseCase(item);
 const details=use||'使う場所や寸法が合うか、購入前に確認したい。';
 const candidates=[
  {id:'problem_question',label:'困りごとから始める',
   lead:use?use.replace(/。$/u,'？'):'置き場所やサイズ、購入前に確認していますか？',
   ending:'気になる場合は、仕様・送料を商品ページで確認してください。'},
  {id:'buyer_checklist',label:'購入前チェック型',
   lead:'買う前に見るのは、サイズ・設置場所・お手入れ。',
   ending:'自分の使い方に合うか、商品ページで確認できます。'},
  {id:'product_identity',label:'商品名先行の基準型',
   lead:'気になるアイテムを紹介。',
   ending:'サイズ・仕様・送料は商品ページを確認してください。'}
 ];
 const drafts=candidates.map(row=>{
  const parts=['【PR】',row.lead,'「'+fullName+'」',row.id==='problem_question'?null:details,
   priceText,row.ending,url];
  let text=join(parts);
  // Preserve unmodified affiliate link and PR label even with long URLs.
  if(text.length>MAX)text=join(['【PR】',row.lead,'「'+cleanProductName(item.itemName,18)+'」',url]);
  if(text.length>MAX)text=join(['【PR】',url]);
  const audit=auditDraft(text,{affiliateUrl:url,revenue:true});
  return {id:row.id,label:row.label,text,audit};
 });
 return {status:'offline_draft_only',drafts,
  experimentalCaveat:'These variants are untested copy hypotheses, not proof of reach, click or conversion lift; no automatic publishing.'};
}
