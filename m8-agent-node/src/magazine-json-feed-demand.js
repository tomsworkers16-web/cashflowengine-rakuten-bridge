// Read-only, opt-in JSON Feed v1 reader. Only explicitly configured public HTTPS hosts.
// No crawling, no article-body storage, no login, no publishing, no affiliate network access.
import {normalizeDemandSignals} from './magazine-demand-evidence.js';
const TOPIC_TERMS={
 'kitchen-cleanup':['水切り','食器の乾燥','シンク上','洗い物'],
 'storage-flow':['収納','整理整頓','片付け','収納棚'],
 'washbasin':['洗面台','洗面所','排水口','ヘアキャッチャー'],
 'winter-warmth':['防寒','電気毛布','寒さ対策','ひざ掛け'],
 'winter-cleaning':['大掃除','窓掃除','結露','掃除道具']
};
function httpsUrl(value){
 let u;
 try{u=new URL(value);}catch{throw Error('feed_invalid_url');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!u.hostname.includes('.')||u.search||u.pathname.length>250)throw Error('feed_invalid_url');
 if(/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(u.hostname))throw Error('feed_private_host');
 return u;
}
function classifyTitle(title){
 const hits=Object.entries(TOPIC_TERMS).filter(([,terms])=>terms.some(term=>title.includes(term)));
 // Avoid forcing unrelated headlines into a category.
 return hits.length===1?hits[0][0]:null;
}
function safeText(s,limit){return String(s||'').replace(/[\u0000-\u001f<>]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,limit);}
export function signalsFromJsonFeed(payload,{feedUrl,observedAt,allowedDomain}={}){
 const host=httpsUrl(feedUrl).hostname;
 if(host!==allowedDomain)throw Error('feed_host_not_allowed');
 if(!payload||typeof payload!=='object'||!String(payload.version||'').startsWith('https://jsonfeed.org/version/1')||!Array.isArray(payload.items))throw Error('feed_invalid_json_feed');
 const signals=[];
 for(const item of payload.items.slice(0,30)){
  const title=safeText(item?.title,180);
  const topicId=classifyTitle(title);
  if(!topicId||title.length<5)continue;
  let itemUrl;
  try{itemUrl=httpsUrl(item.url);}catch{continue;}
  // All outbound links must stay on this explicitly approved source domain.
  if(itemUrl.hostname!==host)continue;
  // Title is an editorial hint, not proof of what readers actually need.
  signals.push({topicId,sourceType:'article',url:itemUrl.origin+itemUrl.pathname,observedAt,
   title,readerNeed:'「'+TOPIC_TERMS[topicId].find(x=>title.includes(x))+'」に関する読者の疑問を調査するための候補記事'});
 }
 return signals;
}
export async function collectJsonFeedDemand({feeds=[],day,fetchImpl=fetch,now=()=>new Date().toISOString()}={}){
 if(!Array.isArray(feeds)||feeds.length>5)throw Error('feed_config_invalid');
 const rows=[],diagnostics=[],seen=new Set();
 for(const spec of feeds){
  let parsed;
  try{
   parsed=httpsUrl(spec?.url);
   if(spec.enabled!==true||spec.allowedDomain!==parsed.hostname||seen.has(parsed.href))throw Error('feed_config_invalid');
   seen.add(parsed.href);
   const res=await fetchImpl(parsed.href,{method:'GET',redirect:'error',headers:{Accept:'application/feed+json, application/json'},signal:AbortSignal.timeout(8000)});
   if(!res?.ok)throw Error('feed_http_unavailable');
   const len=Number(res.headers?.get?.('content-length')||0);
   if(len>256000)throw Error('feed_too_large');
   const raw=await res.text();
   if(raw.length>256000)throw Error('feed_too_large');
   const data=JSON.parse(raw);
   const candidate=signalsFromJsonFeed(data,{feedUrl:parsed.href,allowedDomain:parsed.hostname,observedAt:now()});
   rows.push(...candidate);
   diagnostics.push({domain:parsed.hostname,status:'retrieved',candidateCount:candidate.length});
  }catch(err){
   diagnostics.push({domain:parsed?.hostname||'invalid',status:'skipped',reason:/^feed_/.test(String(err.message))?err.message:'fetch_failed'});
  }
 }
 const normalized=normalizeDemandSignals(rows,{day});
 return {status:'offline_approval_required',signals:normalized.signals.map(({sourceDomain,trafficVerified,sourceNote,...rest})=>rest),
  fetchedFeedCount:diagnostics.filter(x=>x.status==='retrieved').length,accepted:normalized.signals.length,
  rejected:normalized.rejections.length,diagnostics,automaticPost:false,publicationAllowed:false,
  caution:'Headlines only. No search volume, demand verification, ownership permissions or affiliate outcomes are established.'};
}
