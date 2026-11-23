// External-demand evidence adapter: evidence is a hypothesis, not traffic, conversion, or sales.
// Caller supplies lawfully obtained metadata; no scraping, publishing or network calls.
const TYPES=new Set(['article','social','search_trend','review']);
const TOPICS=new Set(['kitchen-cleanup','storage-flow','washbasin','winter-warmth','winter-cleaning']);
const DAY_MS=86400000;
export function normalizeDemandSignals(input,{day}={}){
 if(!Array.isArray(input))throw Error('demand_signals_invalid');
 const now=Date.parse(String(day)+'T23:59:59Z');
 if(!Number.isFinite(now))throw Error('demand_date_invalid');
 const seen=new Set(),signals=[],rejections=[];
 for(const [i,raw] of input.entries()){
  try{
   if(!raw||!TYPES.has(raw.sourceType)||!TOPICS.has(raw.topicId))throw Error('unknown_signal_type_or_topic');
   const u=new URL(raw.url);
   if(u.protocol!=='https:'||u.username||u.password||u.hash||u.searchParams.toString().length>0||!u.hostname.includes('.'))throw Error('unsafe_or_tracking_url');
   const observed=Date.parse(String(raw.observedAt||''));
   if(!Number.isFinite(observed)||observed>now||now-observed>90*DAY_MS)throw Error('stale_or_future_evidence');
   const title=String(raw.title||'').trim();
   const need=String(raw.readerNeed||'').trim();
   if(title.length<5||title.length>180||need.length<5||need.length>160)throw Error('insufficient_evidence');
   const key=raw.topicId+'|'+u.hostname.toLowerCase()+'|'+u.pathname.replace(/\/$/,'');
   if(seen.has(key))throw Error('duplicate_source');
   seen.add(key);
   signals.push({topicId:raw.topicId,sourceType:raw.sourceType,url:u.origin+u.pathname,sourceDomain:u.hostname.toLowerCase(),observedAt:new Date(observed).toISOString(),title,readerNeed:need,sourceNote:'unverified_external_claim',trafficVerified:false});
  }catch(e){rejections.push({index:i,reason:e.message});}
 }
 return {signals,rejections};
}
export function demandEvidenceByTopic(input,{day}={}){
 const normalized=normalizeDemandSignals(input,{day});
 const byTopic={};
 for(const s of normalized.signals){
  const entry=byTopic[s.topicId]??={signals:[],domains:new Set(),types:new Set()};
  entry.signals.push(s);entry.domains.add(s.sourceDomain);entry.types.add(s.sourceType);
 }
 const topics=Object.fromEntries(Object.entries(byTopic).map(([topicId,v])=>[topicId,{
  evidenceCount:v.signals.length,sourceDomains:v.domains.size,sourceTypes:[...v.types].sort(),
  // capped corroboration-only boost: no claim of popularity, ranking or sales performance.
  supportScore:Math.min(10,Math.max(0,v.domains.size-1)*3+Math.max(0,v.types.size-1)*2),
  sourceLinks:v.signals.map(x=>({url:x.url,sourceType:x.sourceType,readerNeed:x.readerNeed,observedAt:x.observedAt}))
 }]));
 return {topics,accepted:normalized.signals.length,rejected:normalized.rejections.length,rejections:normalized.rejections,meaning:'editorial_hypothesis_not_verified_demand'};
}
