// Extract VAKUEN's published size chart from a bounded specifications region.
// This is a catalogue table, not proof of which option can actually be purchased.
import {extractProductPageText} from './editorial-page-verifier.js';
export function extractVacuumSizeChart(html){
 const text=extractProductPageText(html);
 const start=text.indexOf('サイズ（横×奥行×高さ）');
 if(start<0)return {status:'size_chart_missing',variants:[],selectedVariant:null};
 const end=text.indexOf('素材',start);
 if(end<0||end-start>1800||end-start<40)
  return {status:'size_chart_unbounded',variants:[],selectedVariant:null};
 const section=text.slice(start,end);
 const segments=[...section.matchAll(/◆(MINI|BASIC|HIGH|LONG|LARGE)/gu)];
 const variants=[];
 for(let i=0;i<segments.length;i++){
  const segment=segments[i];
  const chunk=section.slice(segment.index+segment[0].length,
    i+1<segments.length?segments[i+1].index:section.length);
  const matches=[...chunk.matchAll(/(?:・\s*)(\d+(?:\.\d+)?)L\s*(\d+)\s*[×xX]\s*(\d+)\s*[×xX]\s*(\d+)/gu)];
  for(const m of matches){
   variants.push({series:segment[1],capacityLiters:Number(m[1]),
    widthMm:Number(m[2]),depthMm:Number(m[3]),heightMm:Number(m[4])});
  }
 }
 const unique=new Set(variants.map(x=>x.series+':'+x.capacityLiters));
 if(!variants.length||unique.size!==variants.length||variants.length>20)
  return {status:'size_chart_ambiguous',variants:[],selectedVariant:null};
 return {status:'size_chart_extracted',variants,selectedVariant:null,
  caveat:'Listed dimensions are general model specifications, not the selected purchase option.'};
}
