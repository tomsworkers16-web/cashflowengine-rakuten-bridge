// Restricted RSS 2.0 / Atom XML metadata parser. Not a general-purpose XML reader.
// Reject DTD/entities, process only titles and links, never retain article bodies.
import {signalsFromJsonFeed} from './magazine-json-feed-demand.js';
import {normalizeDemandSignals} from './magazine-demand-evidence.js';
function decoded(s){
 return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
  .replace(/&#(x[0-9a-f]+|[0-9]+);|&(amp|lt|gt|quot|apos);/gi,(m,n,named)=>{
   if(named)return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[named.toLowerCase()];
   const value=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);
   return value>0&&value<=0x10ffff&&!(value>=0xd800&&value<=0xdfff)?String.fromCodePoint(value):'';
  });
}
function textOf(block,tag){
 const pattern=new RegExp('<(?:[\\w-]+:)?'+tag+'(?:\\s[^<>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?'+tag+'\\s*>','i');
 const m=block.match(pattern);
 return m?decoded(m[1]).replace(/<[^>]*>/g,'').trim():null;
}
function attribute(element,name){
 const m=element.match(new RegExp("(?:\\s|^)"+name+"\\s*=\\s*([\\\"'])([^\\\"']+)\\1",'i'));
 return m?.[2]||null;
}
function atomUrl(block){
 const tags=block.match(/<link\b[^<>]*\/?>/gi)||[];
 for(const tag of tags){
  const rel=attribute(tag,'rel');
  if(rel&&rel!=='alternate')continue;
  const href=attribute(tag,'href');
  if(href)return decoded(href);
 }
 return null;
}
export function parseFeedXmlMetadata(xml){
 if(typeof xml!=='string'||xml.length>256000||/<\s*!(?:DOCTYPE|ENTITY)\b/i.test(xml)||/<\?xml-stylesheet/i.test(xml))throw Error('feed_xml_unsafe');
 const atom=/<feed(?:\s[^<>]*)?>/i.test(xml);
 const rss=/<rss(?:\s[^<>]*)?>/i.test(xml)||/<rdf:RDF(?:\s[^<>]*)?>/i.test(xml);
 if(!atom&&!rss)throw Error('feed_xml_unsupported');
 const pattern=atom?/<entry(?:\s[^<>]*)?>([\s\S]*?)<\/entry\s*>/gi:/<item(?:\s[^<>]*)?>([\s\S]*?)<\/item\s*>/gi;
 const items=[];let m;
 while((m=pattern.exec(xml))!==null&&items.length<30){
  const title=textOf(m[1],'title');
  const url=atom?atomUrl(m[1]):textOf(m[1],'link');
  if(title&&url)items.push({title,url});
 }
 return {version:'https://jsonfeed.org/version/1.1',items};
}
export async function collectXmlFeedDemand({feeds=[],day,fetchImpl=fetch,now=()=>new Date().toISOString()}={}){
 if(!Array.isArray(feeds)||feeds.length>5)throw Error('feed_config_invalid');
 const rows=[],diagnostics=[],seen=new Set();
 for(const spec of feeds){
  let url;
  try{
   url=new URL(spec?.url);
   if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!url.hostname.includes('.')||
    url.pathname.length>250||/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(url.hostname))throw Error('feed_invalid_url');
   if(spec.enabled!==true||spec.allowedDomain!==url.hostname||seen.has(url.href))throw Error('feed_config_invalid');
   seen.add(url.href);
   const res=await fetchImpl(url.href,{method:'GET',redirect:'error',headers:{Accept:'application/rss+xml, application/atom+xml, application/xml'},signal:AbortSignal.timeout(8000)});
   if(!res?.ok)throw Error('feed_http_unavailable');
   if(Number(res.headers?.get?.('content-length')||0)>256000)throw Error('feed_too_large');
   const xml=await res.text();
   if(xml.length>256000)throw Error('feed_too_large');
   const parsed=parseFeedXmlMetadata(xml);
   const candidates=signalsFromJsonFeed(parsed,{feedUrl:url.href,allowedDomain:url.hostname,observedAt:now()});
   rows.push(...candidates);
   diagnostics.push({domain:url.hostname,status:'retrieved',candidateCount:candidates.length});
  }catch(e){
   diagnostics.push({domain:url?.hostname||'invalid',status:'skipped',reason:/^feed_/.test(String(e.message))?e.message:'fetch_failed'});
  }
 }
 const normalized=normalizeDemandSignals(rows,{day});
 return {status:'offline_approval_required',signals:normalized.signals.map(({sourceDomain,trafficVerified,sourceNote,...rest})=>rest),accepted:normalized.signals.length,rejected:normalized.rejections.length,diagnostics,fetchedFeedCount:diagnostics.filter(x=>x.status==='retrieved').length,
  automaticPost:false,publicationAllowed:false,caution:'RSS/Atom metadata only; no measured demand or verified product claims.'};
}
