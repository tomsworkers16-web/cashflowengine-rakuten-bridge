// Bridge between the existing official Rakuten Item Search request and article research.
// Its output is a research packet, NOT independent product-spec verification.
// No publishing, no persistent state, and no model/API-key exposure in output.
import { makeItemDetailRequest } from './rakuten-candidate-evidence.js';

const apiSource='https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const isHttps = value => typeof value==='string' && /^https:\/\/[^\s]+$/i.test(value);
const positive = value => typeof value==='number' && Number.isFinite(value) && value>0;
const today = () => new Date().toISOString().slice(0,10);

export function rakutenEditorialEvidence(payload, itemCode, {checkedAt=today()}={}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedAt)) throw new Error('invalid_checked_at');
  const entries=payload?.Items ?? payload?.items;
  if (!Array.isArray(entries)) throw new Error('unexpected_item_search_shape');
  const item=entries.map(entry=>entry?.Item ?? entry?.item ?? entry)
    .find(entry=>entry?.itemCode === itemCode);
  if (!item) return {itemCode,status:'item_not_found',research:null,missing:['item_not_found']};
  const affiliateUrl=isHttps(item.affiliateUrl)?item.affiliateUrl:null;
  const itemUrl=isHttps(item.itemUrl)?item.itemUrl:null;
  const name=typeof item.itemName==='string'?item.itemName.trim():'';
  const price=Number(item.itemPrice);
  const reviewCount=Number(item.reviewCount);
  const facts=[];
  if (name) facts.push({id:'rakuten_item_name',claim:'楽天商品検索API掲載の商品名：'+name,sourceUrl:apiSource,checkedAt});
  if (positive(price)) facts.push({id:'rakuten_item_price',claim:'楽天商品検索API取得時の税込価格表示：'+price+'円（変動あり）',sourceUrl:apiSource,checkedAt});
  if (Number.isSafeInteger(reviewCount) && reviewCount>=0 && item.reviewCount!==null && item.reviewCount!==undefined)
    facts.push({id:'rakuten_review_count',claim:'楽天商品検索API取得時のレビュー件数：'+reviewCount+'件（販売数ではありません）',sourceUrl:apiSource,checkedAt});
  const missing=[];
  if (!itemUrl) missing.push('product_page_url');
  if (!affiliateUrl) missing.push('affiliate_url');
  // The Rakuten Item Search API listing is not enough to verify dimensions, material,
  // installation restrictions or cleaning conditions that B-grade articles require.
  missing.push('product_specific_specs_confirmed_against_product_page');
  return {
    itemCode,status:'needs_product_detail_research',
    source:'rakuten_official_item_search',checkedAt,
    facts,productPageUrl:itemUrl,affiliateUrl,
    missing,needsProductPageReview:true,
    research:null,
    disclaimer:'API-listed price/name/review counts are verified as response fields only. They do not verify product dimensions, performance, suitability or the page itself.'
  };
}

export async function fetchRakutenEditorialEvidence(itemCode,{
  applicationId,accessKey,affiliateId,fetchFn=fetch,checkedAt=today()
}={}) {
  const request=makeItemDetailRequest(itemCode,{applicationId,accessKey,affiliateId});
  // Single read-only request; never expose request.url since it contains credentials.
  const response=await fetchFn(request.url,{method:'GET',headers:request.headers,redirect:'error'});
  if (!response?.ok) throw new Error('rakuten_item_http_'+String(response?.status??'unknown'));
  return rakutenEditorialEvidence(await response.json(),itemCode,{checkedAt});
}

/**
 * Product page evidence is separately verified by the research operator, not inferred
 * from the official API. Only a verified record with explicit evidence can be promoted.
 * This function intentionally refuses an automatic promotion on API payload alone.
 */
export function assembleEditorialResearch(candidate, apiEvidence, productPageReview) {
  if (!candidate?.itemCode || apiEvidence?.itemCode!==candidate.itemCode)
    return {status:'research_required',reason:'item_identity_mismatch'};
  if (apiEvidence?.status!=='needs_product_detail_research')
    return {status:'research_required',reason:'official_api_evidence_missing'};
  if (!productPageReview || productPageReview.reviewed!==true ||
      productPageReview.itemCode!==candidate.itemCode)
    return {status:'research_required',reason:'product_page_not_verified'};
  if (!isHttps(productPageReview.sourceUrl) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(productPageReview.checkedAt||''))
    return {status:'research_required',reason:'invalid_product_page_provenance'};
  if (apiEvidence.productPageUrl!==productPageReview.sourceUrl)
    return {status:'research_required',reason:'product_page_url_mismatch'};
  const specs=Array.isArray(productPageReview.specs)?productPageReview.specs:[];
  const supported=specs.filter(f=>typeof f?.id==='string' && f.id.trim() &&
    typeof f?.claim==='string' && f.claim.trim() &&
    typeof f?.quote==='string' && f.quote.trim() &&
    typeof f?.sourceUrl==='string' && f.sourceUrl===productPageReview.sourceUrl &&
    f.reviewed===true);
  if (supported.length<2 || new Set(supported.map(f=>f.id)).size!==supported.length)
    return {status:'research_required',reason:'product_specs_insufficient'};
  if (!isHttps(apiEvidence.affiliateUrl))
    return {status:'research_required',reason:'affiliate_url_missing'};
  const facts=supported.map(f=>({
    id:f.id, claim:f.claim, sourceUrl:productPageReview.sourceUrl,
    checkedAt:productPageReview.checkedAt, evidenceQuote:f.quote
  }));
  return {status:'research_packet_ready',
    research:{
      itemCode:candidate.itemCode,affiliateUrl:apiEvidence.affiliateUrl,
      rights:{noMedia:true},
      subjectContext:typeof productPageReview.subjectContext==='string' ? productPageReview.subjectContext : '',
      facts
    },
    caveat:'This checks provenance declarations and quote presence; it does not independently verify that the quotes appear on the source page.'
  };
}
