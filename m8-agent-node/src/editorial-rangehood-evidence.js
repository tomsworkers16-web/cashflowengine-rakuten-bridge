// Conservative, read-only analysis of range-hood filter product pages.
// Evidence snippets are literal source text, never proof of compatibility.
// If installation configurations could be mixed, publication stays blocked.
import { extractProductPageText } from './editorial-page-verifier.js';

const LIMIT=12;
function snippet(text,phrase,side=70) {
  const i=text.indexOf(phrase);
  if(i<0)return null;
  return text.slice(Math.max(0,i-side),Math.min(text.length,i+phrase.length+side)).trim();
}
export function analyzeRangehoodFilterPage(html) {
  const text=extractProductPageText(html);
  const phrases=[
    ['model_check','レンジフードの機種名をご確認いただき'],
    ['size_check','該当しない場合はサイズをご確認ください'],
    ['frame_count','既存の金属フィルターと同数の専用枠をご注文ください'],
    ['magnet','強力マグネット+交換フィルター3枚'],
    ['fiber','ガラス繊維タイプ']
  ];
  const evidence=phrases.map(([id,phrase])=>({id,quote:snippet(text,phrase),found:text.includes(phrase)}));
  const model=evidence.find(x=>x.id==='model_check')?.found===true;
  const size=evidence.find(x=>x.id==='size_check')?.found===true;
  const frame=evidence.find(x=>x.id==='frame_count')?.found===true;
  const magnet=evidence.find(x=>x.id==='magnet')?.found===true;
  const sizes=[...text.matchAll(/(?:200|250|270|275|297|300|320|340|350|375|400)\s*[×xX]\s*\d{2,4}\s*mm/gu)]
    .slice(0,LIMIT).map(m=>m[0]);
  const ambiguity=frame&&magnet;
  return {
    status:ambiguity?'configuration_review_required':model&&size?'evidence_found':'research_required',
    publishApproved:false,
    evidence,
    mentionedFrameSizes:[...new Set(sizes)],
    ambiguity:ambiguity?'magnet_set_and_separate_frame_guidance_on_same_page':null,
    guidance:[
      'Check the exact range-hood model and existing filter size before choosing a product.',
      'Do not treat generic compatibility/model examples as verification for a particular buyer.',
      'Determine whether separate-frame instructions apply to this magnet starter set before product-specific recommendations.'
    ],
    articleEligible:false,
    published:0
  };
}
