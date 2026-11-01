import http from 'node:http';
import { URL } from 'node:url';

const THREADS_API_BASE=process.env.THREADS_API_BASE||'https://graph.threads.net/v1.0';
const THREADS_ACCESS_TOKEN=process.env.THREADS_ACCESS_TOKEN||'';
const PORT=Number(process.env.PORT||10000);
const JST_OFFSET_MS=9*60*60*1000;

const state={version:'funnel-v1',configured:Boolean(THREADS_ACCESS_TOKEN),lastRefreshAt:null,lastError:null,profileViews:null,linkClicks:null,linkClickBreakdown:[],followersCount:null,clicksSupported:null,viewsSupported:null,filteredInvalidUrls:0};
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
function nowJst(){return new Date(Date.now()+JST_OFFSET_MS);}
function todayRange(){const j=nowJst();const y=j.getUTCFullYear(),m=j.getUTCMonth(),d=j.getUTCDate();const start=Date.UTC(y,m,d,0,0,0)-JST_OFFSET_MS;return{since:Math.floor(start/1000),until:Math.floor(Date.now()/1000)};}
async function fetchJson(url,timeoutMs=10000){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetch(url,{signal:c.signal});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={error:{message:'invalid_json'}}}return{status:r.status,data};}catch(e){return{status:599,data:{error:{message:e?.name==='AbortError'?'timeout':'fetch_failed'}}};}finally{clearTimeout(t)}}
async function meta(path,params={}){if(!THREADS_ACCESS_TOKEN)throw new Error('threads_token_missing');const u=new URL(`${THREADS_API_BASE}${path}`);for(const[k,v]of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));u.searchParams.set('access_token',THREADS_ACCESS_TOKEN);const r=await fetchJson(u);if(r.status<200||r.status>=300){const e=new Error(r.data?.error?.message||`threads_${r.status}`);e.status=r.status;throw e;}return r.data;}
function metric(rows,name){return(Array.isArray(rows)?rows:[]).find(x=>x?.name===name)||null;}
function valueOf(row){if(!row)return null;if(typeof row.value==='number')return row.value;if(typeof row?.total_value?.value==='number')return row.total_value.value;if(Array.isArray(row.values)&&row.values.length){const v=row.values[row.values.length-1]?.value;if(typeof v==='number')return v;}return null;}
function validTrackedUrl(value){try{const u=new URL(String(value||''));if(!['http:','https:'].includes(u.protocol))return false;const host=u.hostname.toLowerCase();if(!host||host==='invalid.invalid'||host.endsWith('.invalid'))return false;return true;}catch{return false;}}
function clicksOf(row){const links=Array.isArray(row?.link_total_values)?row.link_total_values:[];let filtered=0;const clean=links.map(x=>({linkUrl:x?.link_url||x?.url||null,value:Number(x?.value||0)})).filter(x=>{const ok=Number.isFinite(x.value)&&validTrackedUrl(x.linkUrl);if(!ok)filtered+=1;return ok;});const direct=valueOf(row);state.filteredInvalidUrls=filtered;return{total:direct!==null?direct:clean.reduce((a,b)=>a+b.value,0),links:clean.slice(0,20)};}

async function refresh(){
  if(!state.configured){state.lastError='threads_not_configured';return;}
  const range=todayRange(); let coreOk=false;
  try{
    const views=await meta('/me/threads_insights',{metric:'views',since:range.since,until:range.until});
    const vr=metric(views?.data||[],'views'); state.profileViews=valueOf(vr); state.viewsSupported=Boolean(vr); coreOk=true;
  }catch(e){state.viewsSupported=false;state.profileViews=null;state.lastError=`views:${String(e?.message||e)}`;}
  try{
    const clicks=await meta('/me/threads_insights',{metric:'clicks',since:range.since,until:range.until});
    const cr=metric(clicks?.data||[],'clicks');
    if(cr){const c=clicksOf(cr);state.linkClicks=c.total;state.linkClickBreakdown=c.links;state.clicksSupported=true;}else{state.linkClicks=null;state.linkClickBreakdown=[];state.clicksSupported=false;state.filteredInvalidUrls=0;}
  }catch{state.linkClicks=null;state.linkClickBreakdown=[];state.clicksSupported=false;state.filteredInvalidUrls=0;}
  try{const f=await meta('/me/threads_insights',{metric:'followers_count'});state.followersCount=valueOf(metric(f?.data||[],'followers_count'));coreOk=true;}catch{}
  state.lastRefreshAt=new Date().toISOString();
  if(coreOk) state.lastError=null;
}
function page(){return`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>CFE Funnel Engine</title></head><body><h1>Cash Flow Engine Funnel Analytics</h1><pre>${esc(JSON.stringify(state,null,2))}</pre></body></html>`;}
const previous=http.createServer.bind(http);http.createServer=function funnelCreateServer(listener){return previous(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||`127.0.0.1:${PORT}`}`);if(url.pathname==='/automation/funnel-context'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'no-referrer'});res.end(page());return;}}catch{}return listener(req,res);});};
setTimeout(()=>refresh().catch(()=>{}),30000).unref?.();setInterval(()=>refresh().catch(()=>{}),30*60*1000).unref?.();
