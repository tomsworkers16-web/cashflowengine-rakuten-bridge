import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';

const PORT = process.env.PORT || 10000;
const PINTEREST_API_BASE = process.env.PINTEREST_API_BASE || 'https://api.pinterest.com/v5';
const PINTEREST_APP_ID = process.env.PINTEREST_APP_ID || '';
const PINTEREST_APP_SECRET = process.env.PINTEREST_APP_SECRET || '';
const PINTEREST_ACCESS_TOKEN = process.env.PINTEREST_ACCESS_TOKEN || '';
const PINTEREST_REFRESH_TOKEN = process.env.PINTEREST_REFRESH_TOKEN || '';
const PINTEREST_REDIRECT_URI = process.env.PINTEREST_REDIRECT_URI || '';
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';
const OAUTH_STATE_SECRET = process.env.PINTEREST_OAUTH_STATE_SECRET || BRIDGE_TOKEN || '';

function json(res, status, body) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
  res.end(JSON.stringify(body));
}
function html(res,status,body){res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(body);}
function authOk(req){return Boolean(BRIDGE_TOKEN) && (req.headers.authorization||'')===`Bearer ${BRIDGE_TOKEN}`;}
function appConfigured(){return Boolean(PINTEREST_APP_ID && PINTEREST_APP_SECRET && PINTEREST_REDIRECT_URI);}
function tokenConfigured(){return Boolean(PINTEREST_ACCESS_TOKEN);}
function signState(nonce){return crypto.createHmac('sha256',OAUTH_STATE_SECRET).update(nonce).digest('hex');}
function makeState(){const nonce=crypto.randomBytes(18).toString('hex');return `${nonce}.${signState(nonce)}`;}
function validState(state){if(!state||!OAUTH_STATE_SECRET)return false;const [nonce,sig]=String(state).split('.');if(!nonce||!sig)return false;const expected=signState(nonce);try{return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));}catch{return false;}}

async function readJsonBody(req){const chunks=[];for await(const c of req)chunks.push(c);if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{const e=new Error('invalid_json');e.status=400;throw e;}}

async function pinterestRequest(path,{method='GET',query={},body=null,token=PINTEREST_ACCESS_TOKEN}={}){
  if(!token){const e=new Error('pinterest_access_token_not_configured');e.status=503;throw e;}
  const url=new URL(`${PINTEREST_API_BASE}${path}`);
  for(const [k,v] of Object.entries(query))if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));
  const headers={'Authorization':`Bearer ${token}`,'Accept':'application/json'};
  const init={method,headers};
  if(body!==null){headers['Content-Type']='application/json';init.body=JSON.stringify(body);}
  const upstream=await fetch(url,init);const data=await upstream.json().catch(()=>({}));
  if(!upstream.ok){const e=new Error(`Pinterest API error ${upstream.status}`);e.status=upstream.status;e.details=data;throw e;}
  return data;
}

async function exchangeCode(code){
  if(!appConfigured()){const e=new Error('pinterest_app_credentials_not_configured');e.status=503;throw e;}
  const basic=Buffer.from(`${PINTEREST_APP_ID}:${PINTEREST_APP_SECRET}`).toString('base64');
  const form=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:PINTEREST_REDIRECT_URI});
  const r=await fetch(`${PINTEREST_API_BASE}/oauth/token`,{method:'POST',headers:{'Authorization':`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},body:form});
  const data=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(`Pinterest OAuth error ${r.status}`);e.status=r.status;e.details=data;throw e;}return data;
}

async function refreshToken(refreshToken=PINTEREST_REFRESH_TOKEN){
  if(!appConfigured()||!refreshToken){const e=new Error('pinterest_refresh_not_configured');e.status=503;throw e;}
  const basic=Buffer.from(`${PINTEREST_APP_ID}:${PINTEREST_APP_SECRET}`).toString('base64');
  const form=new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken});
  const r=await fetch(`${PINTEREST_API_BASE}/oauth/token`,{method:'POST',headers:{'Authorization':`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},body:form});
  const data=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(`Pinterest OAuth refresh error ${r.status}`);e.status=r.status;e.details=data;throw e;}return data;
}

function oauthUrl(){
  if(!appConfigured())return null;
  const u=new URL('https://www.pinterest.com/oauth/');
  u.searchParams.set('client_id',PINTEREST_APP_ID);u.searchParams.set('redirect_uri',PINTEREST_REDIRECT_URI);u.searchParams.set('response_type','code');
  u.searchParams.set('scope','boards:read,boards:write,pins:read,pins:write');u.searchParams.set('state',makeState());return u.toString();
}

async function health(){
  const base={ok:false,appConfigured:appConfigured(),tokenConfigured:tokenConfigured(),redirectUri:PINTEREST_REDIRECT_URI||null};
  if(!tokenConfigured())return base;
  try{const me=await pinterestRequest('/user_account');return {...base,ok:true,username:me?.username||null,accountType:me?.account_type||null};}
  catch(e){return {...base,status:e?.status||500,message:String(e?.message||e)};}
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(url.pathname==='/'){return json(res,200,{ok:true,service:'cashflowengine-pinterest-bridge',appConfigured:appConfigured(),tokenConfigured:tokenConfigured()});}
    if(url.pathname==='/health'){const h=await health();return json(res,h.ok?200:503,h);}
    if(url.pathname==='/oauth/start'){
      if(!appConfigured())return json(res,503,{error:'pinterest_app_credentials_not_configured'});
      res.writeHead(302,{Location:oauthUrl(),'Cache-Control':'no-store'});return res.end();
    }
    if(url.pathname==='/oauth/callback'){
      const error=url.searchParams.get('error');if(error)return html(res,400,`<h1>Pinterest authorization failed</h1><p>${String(error)}</p>`);
      const code=url.searchParams.get('code');const state=url.searchParams.get('state');if(!code)return json(res,400,{error:'code_required'});if(!validState(state))return json(res,400,{error:'invalid_state'});
      const token=await exchangeCode(code);
      console.log('[PINTEREST_OAUTH_SUCCESS]',JSON.stringify({responseType:token?.response_type||null,expiresIn:token?.expires_in||null,refreshExpiresIn:token?.refresh_token_expires_in||null,scope:token?.scope||null}));
      return html(res,200,`<!doctype html><meta charset="utf-8"><title>Pinterest connected</title><style>body{font-family:sans-serif;max-width:700px;margin:60px auto;padding:20px;line-height:1.7}</style><h1>Pinterest authorization succeeded</h1><p>Authorization code exchange succeeded.</p><p>For security, tokens are not displayed in this browser.</p>`);
    }
    if(!url.pathname.startsWith('/pinterest/'))return json(res,404,{error:'not_found'});
    if(!authOk(req))return json(res,401,{error:'unauthorized'});
    if(url.pathname==='/pinterest/me'&&req.method==='GET')return json(res,200,await pinterestRequest('/user_account'));
    if(url.pathname==='/pinterest/boards'&&req.method==='GET')return json(res,200,await pinterestRequest('/boards',{query:{page_size:url.searchParams.get('page_size')||'25',bookmark:url.searchParams.get('bookmark')||''}}));
    if(url.pathname==='/pinterest/pins'&&req.method==='GET')return json(res,200,await pinterestRequest('/pins',{query:{page_size:url.searchParams.get('page_size')||'25',bookmark:url.searchParams.get('bookmark')||''}}));
    if(url.pathname==='/pinterest/pins'&&req.method==='POST'){
      const b=await readJsonBody(req);if(!b.board_id||!b.title||!b.media_source)return json(res,400,{error:'board_id_title_media_source_required'});
      const payload={board_id:b.board_id,title:b.title,description:b.description||'',link:b.link||undefined,alt_text:b.alt_text||undefined,media_source:b.media_source};
      return json(res,201,await pinterestRequest('/pins',{method:'POST',body:payload}));
    }
    if(url.pathname==='/pinterest/refresh'&&req.method==='POST'){
      const data=await refreshToken();console.log('[PINTEREST_REFRESH_SUCCESS]',JSON.stringify({expiresIn:data?.expires_in||null,refreshExpiresIn:data?.refresh_token_expires_in||null,scope:data?.scope||null}));
      return json(res,200,{ok:true,expires_in:data?.expires_in||null,refresh_token_expires_in:data?.refresh_token_expires_in||null,scope:data?.scope||null,note:'Tokens intentionally omitted from response.'});
    }
    return json(res,404,{error:'pinterest_route_not_found'});
  }catch(e){const status=Number(e?.status||500);return json(res,status,{error:status===500?'internal_error':'upstream_error',status,message:String(e?.message||e),...(e?.details?{details:e.details}:{})});}
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Cash Flow Engine Pinterest bridge listening on ${PORT}`));
