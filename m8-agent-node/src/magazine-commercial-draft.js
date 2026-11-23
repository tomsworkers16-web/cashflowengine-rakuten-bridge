// Prepare a single-product commercial draft from a reviewed article and listing.
// Preview only: factual verification and publication approval remain external.
import {reviewArticle} from './magazine-writing-workflow.js';
import {cleanProductName,validatePublicationText} from './product-posting.js';
export function prepareMagazineCommercialDraft({article,product}={}){
 const review=reviewArticle(article);
 if(review.errors.length)return {status:'article_rejected',review,publicationAllowed:false};
 const url=product?.affiliateUrl;
 let parsed;try{parsed=new URL(url);}catch{return {status:'invalid_affiliate_url',publicationAllowed:false};}
 if(parsed.protocol!=='https:'||parsed.hostname!=='hb.afl.rakuten.co.jp'||parsed.username||parsed.password||!parsed.pathname.startsWith('/hgc/'))return {status:'invalid_affiliate_url',publicationAllowed:false};
 const name=cleanProductName(product?.itemName,44);
 if(!name||!product?.itemCode)return {status:'invalid_product',publicationAllowed:false};
 const text=['【PR】',article,'気になる方はこちら：'+name,'購入前にサイズ・仕様・価格・送料を確認してください。',url].join('\n\n');
 const error=validatePublicationText(text,{revenue:true,affiliateUrl:url});
 return {status:error?'requires_shorter_or_corrected_article':'manual_review_required',text:error?null:text,characters:text.length,error,review,
 itemCode:product.itemCode,checksStillRequired:['verify_product_page','verify_current_price_and_availability','verify_claims','verify_editorial_quality','owner_publication_approval'],publicationAllowed:false};
}
