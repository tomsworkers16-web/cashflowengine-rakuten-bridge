// Verify candidate quotations against a product-page snapshot. No publication.
// This checks literal evidence only, not interpretation or product effectiveness.
import { canonicalRakutenItemUrl } from './editorial-rakuten-evidence.js';

function decodeEntities(v) {
  return String(v).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,entity)=>{
    const key=entity.toLowerCase();
    const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
    if(Object.hasOwn(named,key))return named[key];
    const n=key.startsWith('#x')?parseInt(key.slice(2),16):Number(key.slice(1));
    return Number.isInteger(n)&&n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)
      ? String.fromCodePoint(n) : ' ';
  });
}
function normalized(s) {
  return decodeEntities(s).normalize('NFKC').replace(/[\u00a0\s\u3000]+/gu,'').toLowerCase();
}
export function extractProductPageText(html) {
  if(typeof html!=='string'||html.length>1_000_000)throw new Error('invalid_page_html');
  return decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<(?:script|style|svg|noscript|template)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|svg|noscript|template)\s*>/gi,' ')
    .replace(/<[^>]+>/g,' '))
    .replace(/[\u00a0\s\u3000]+/gu,' ').trim();
}
// Require meaningful exact text fragments. Quoted product facts must be more
// than a short ambiguous unit like "cm" or "幅".
export function verifyProductPageQuotes({apiEvidence, pageUrl, html, quotePlans, checkedAt}={}) {
  const canonical=canonicalRakutenItemUrl(apiEvidence?.productPageUrl);
  if(!canonical||canonical!==canonicalRakutenItemUrl(pageUrl))
    return {status:'research_required',reason:'product_page_url_mismatch'};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(checkedAt||''))
    return {status:'research_required',reason:'invalid_checked_at'};
  let pageText;
  try {pageText=extractProductPageText(html);} catch {
    return {status:'research_required',reason:'invalid_page_html'};
  }
  if(pageText.length<50)return {status:'research_required',reason:'page_content_insufficient'};
  const plans=Array.isArray(quotePlans)?quotePlans:[];
  const found=[];
  const missing=[];
  const indexed=normalized(pageText);
  for(const plan of plans.slice(0,12)){
    const quote=typeof plan?.quote==='string'?plan.quote.trim():'';
    const marker=normalized(quote);
    if(!plan?.id || !plan?.claim || marker.length<8 || marker.length>300 || !indexed.includes(marker)){
      missing.push(String(plan?.id||'missing_id'));
      continue;
    }
    found.push({id:String(plan.id),claim:String(plan.claim),quote,sourceUrl:canonical,reviewed:true});
  }
  if(missing.length || found.length<2 || new Set(found.map(x=>x.id)).size!==found.length)
    return {status:'research_required',reason:'quoted_evidence_not_in_page',missing};
  return {
    status:'page_quotes_matched',
    pageReview:{
      itemCode:apiEvidence.itemCode,reviewed:true,
      sourceUrl:canonical,checkedAt,specs:found,
      verificationMethod:'literal_page_text_match_v1'
    },
    limitations:'Literal HTML text match does not establish that the quotation describes the selected variant, supports the claim, or is still current.'
  };
}
// Only exact Rakuten item pages: no automatic redirects to affiliate hosts or other domains.
// The caller must obey the site's access policy; HTTP 403 and dynamic pages are held.
// Most Rakuten item pages use UTF-8, but some shops still serve EUC-JP or
// Shift_JIS. Response.text() always decodes as UTF-8 and corrupts those pages.
// Decode raw bytes according to HTTP charset or HTML meta, failing closed when
// the declared encoding cannot be decoded without replacement characters.
function declaredCharset(type, sample) {
  const header = /charset\s*=\s*["']?([^\s;"']+)/i.exec(type)?.[1];
  if (header) return header;
  const head = new TextDecoder('windows-1252').decode(sample.slice(0,8192));
  const meta = /<meta\b[^>]*\bcharset\s*=\s*["']?([^\s"'/>;]+)/i.exec(head)?.[1];
  return meta || null;
}
export function decodeProductPageHtml(bytes, contentType='') {
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if (!data.length || data.byteLength>1_000_000)throw new Error('product_page_too_large');
  const label=declaredCharset(contentType,data);
  if (label) {
    try { return new TextDecoder(label,{fatal:true}).decode(data); }
    catch { throw new Error('product_page_charset_invalid'); }
  }
  // Encoding unspecified: try standards-default UTF-8, then the two common
  // legacy Japanese encodings. Never use replacement characters as evidence.
  for (const candidate of ['utf-8','euc-jp','shift_jis']) {
    try {return new TextDecoder(candidate,{fatal:true}).decode(data);}
    catch { /* Try next decoder */ }
  }
  throw new Error('product_page_charset_unrecognized');
}

export async function fetchRakutenProductPageHtml(url,{fetchFn=fetch,signal}={}) {
  const canonical=canonicalRakutenItemUrl(url);
  if(!canonical || !/^https:\/\/item\.rakuten\.co\.jp\/[\w-]+\/[\w-]+\/$/.test(canonical))
    throw new Error('unsupported_product_page_url');
  const response=await fetchFn(canonical,{method:'GET',redirect:'manual',
    headers:{Accept:'text/html'},signal});
  if(!response?.ok)throw new Error('product_page_http_'+String(response?.status??'unknown'));
  const type=response.headers?.get?.('content-type')||'';
  if(!/text\/html/i.test(type))throw new Error('product_page_not_html');
  const reported=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(reported)&&reported>1_000_000)throw new Error('product_page_too_large');
  // Real fetch responses always expose arrayBuffer(). Test stubs can also
  // provide it; do not decode Japanese HTML through response.text().
  if(typeof response.arrayBuffer!=='function')
    throw new Error('product_page_binary_response_required');
  const raw=await response.arrayBuffer();
  const html=decodeProductPageHtml(raw,type);
  if(html.length>1_000_000)throw new Error('product_page_too_large');
  return {url:canonical,html};
}
