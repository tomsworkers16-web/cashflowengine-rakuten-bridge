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
// The original extractor recognised almost exclusively one chest layout.
// For other products, accept only unambiguous labelled values in a bounded
// product-description region, never marketing claims or inferred specs.
function generalSpecs(text) {
  const starts=[...text.matchAll(/(?:商品仕様|商品詳細|商品情報|商品説明)\s*[:：]?/gu)];
  const regions=starts.map(m=>text.slice(m.index+m[0].length,m.index+m[0].length+1800).split(/関連商品|おすすめ商品|こちらもおすすめ|商品レビュー|他の商品|ショップレビュー/u)[0]);
  // Unscoped facts cannot establish which variant a labelled value belongs to.
  if(regions.some(region=>/(?:[A-Z]{1,3}|小|中|大|通常|ワイド|スリム)サイズ\s*[:：]|[1-9]\d*\s*サイズ(?:展開|から選)/u.test(region)))return [];
  const rules=[
    ['material',/(?:材質|素材)\s*[:：]?\s*((?:ポリプロピレン|ポリエチレン|ポリエステル|ステンレス(?:鋼)?|シリコーン(?:ゴム)?|シリコン(?:ゴム)?|ABS樹脂|(?:綿|コットン)\s*[1１][0０][0０]\s*[%％]))(?=\s|[、。／/]|$)/gu],
    ['dimensions',/(?<![\p{L}\p{N}])(?:本体サイズ|商品サイズ|外寸|本体寸法|サイズ|寸法)\s*[:：]?\s*(約?\s*\d+(?:\.\d+)?\s*(?:cm|mm)?\s*[×xX]\s*\d+(?:\.\d+)?\s*(?:cm|mm)?(?:\s*[×xX]\s*\d+(?:\.\d+)?)?\s*(?:cm|mm))(?![A-Za-z]|\s*[×xX\d./～〜-])(?:\s*表記は洗濯後の寸法)?/gu],
    ['product_weight',/(?<![\p{L}\p{N}])(?:本体重量|商品重量|本体質量|重量)\s*[:：]?\s*(約?\s*\d+(?:\.\d+)?\s*(?:kg|g))(?![A-Za-z]|\s*[～〜/~−-])/gu],
    ['capacity',/(?:満水容量|実容量|容量)\s*[:：]?\s*(約?\s*\d+(?:\.\d+)?\s*(?:mL|ml|L|リットル))\b/gu],
    ['heat_resistance',/耐熱温度\s*[:：]?\s*(約?\s*\d{1,3}\s*(?:℃|°C))/gu],
    ['load_capacity',/耐荷重\s*[:：]?\s*(約?\s*\d+(?:\.\d+)?\s*kg)\b/gu],
    ['cable_length',/(?:ケーブル長|コード長)\s*[:：]?\s*(約?\s*\d+(?:\.\d+)?\s*(?:cm|m))\b/gu]
  ];
  const out=[];
  for(const [id,re] of rules){
    const matches=regions.flatMap(region=>[...region.matchAll(re)]);
    const distinct=new Set(matches.map(m=>clean(m[1]).normalize('NFKC').replace(/\s+/gu,'')));
    const quote=matches.map(m=>clean(m[0])).find(value=>value.normalize('NFKC').replace(/\s+/gu,'').length>=8&&value.length<=150);
    if(distinct.size===1&&quote)out.push({id,quote,claim:quote+'と記載'});
  }
  return out;
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
  if(!variantNames.some(([,label])=>text.includes('【'+label+'】'))){
    for(const spec of generalSpecs(text))add(spec);
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
