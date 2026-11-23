// Conservative extraction of literal specification excerpts from Rakuten item pages.
// Extract only supported patterns with original quotes; never infer units,
// cross-contaminate slim/wide variants, or imply actual product testing.
import { extractProductPageText } from './editorial-page-verifier.js';

const clean = value => String(value??'').replace(/\s+/gu,' ').trim();
const variantNames=[['slim','スリムサイズ'],['wide','ワイドサイズ']];
function exactMatch(text,re,id,claimBuilder) {
  const m=re.exec(text);
  if(!m)return null;
  const quote=clean(m[0]);
  if(quote.length<8||quote.length>300)return null;
  return {id,claim:claimBuilder(m),quote};
}
function variantSection(text,label,nextLabels) {
  const start=text.indexOf('【'+label+'】');
  if(start<0)return null;
  let end=text.length;
  for(const other of nextLabels) {
    const idx=text.indexOf('【'+other+'】',start+label.length+2);
    if(idx>=0&&idx<end)end=idx;
  }
  // A section boundary is mandatory. If a section seems unbounded,
  // avoid reaching into other products or promotional content.
  return text.slice(start,end).slice(0,1200);
}
export function extractEditorialSpecQuotes(html,{max=10}={}) {
  if(!Number.isInteger(max)||max<2||max>12)throw new Error('invalid_spec_limit');
  const text=extractProductPageText(html);
  const plans=[];
  const add=spec=>{if(spec&&plans.length<max&&!plans.some(x=>x.id===spec.id))plans.push(spec);};
  add(exactMatch(text,/材質\s*[:：]?\s*ポリプロピレン/iu,'material',
    ()=> '材質はポリプロピレンと記載'));
  add(exactMatch(text,/組立時間\s*[:：]?\s*約?\s*\d{1,3}\s*[-～〜]\s*\d{1,3}\s*分/iu,'assembly_duration',
    m=>'組立時間は'+m[0].replace(/^組立時間\s*[:：]?\s*/u,'')+'と記載'));
  for(const [key,label] of variantNames) {
    const section=variantSection(text,label,['スリムサイズ','ワイドサイズ','商品説明','商品詳細','仕様','関連商品'].filter(v=>v!==label));
    if(!section)continue;
    add(exactMatch(section,/引出し内寸\s*[:：]?\s*幅\s*(\d+(?:\.\d+)?)\s*(?:cm)?\s*奥行き?\s*(\d+(?:\.\d+)?)\s*(?:cm)?\s*深さ\s*(\d+(?:\.\d+)?)\s*cm/iu, key+'_drawer_inner_dimensions',
      m=>label+'の引出し内寸は幅'+m[1]+'×奥行'+m[2]+'×深さ'+m[3]+'cmと記載'));
    add(exactMatch(section,/耐荷重\s*[:：]?\s*天板\s*[（(]?約[）)]?\s*(\d+(?:\.\d+)?)\s*kg\s*[、,]\s*引出し1段あたり\s*[（(]?約[）)]?\s*(\d+(?:\.\d+)?)\s*kg/iu,key+'_load_capacity',
      m=>label+'の耐荷重は天板約'+m[1]+'kg、引出し1段あたり約'+m[2]+'kgと記載'));
  }
  return {
    status:plans.length>=2?'spec_quotes_extracted':'research_required',
    quotePlans:plans,
    checks:{
      slim:plans.filter(x=>x.id.startsWith('slim_')).length,
      wide:plans.filter(x=>x.id.startsWith('wide_')).length,
      common:plans.filter(x=>!x.id.startsWith('slim_')&&!x.id.startsWith('wide_')).length
    },
    caveat:'Automated literal extraction only. Confirm selected variant, price, applicability and interpretation before publication.'
  };
}
