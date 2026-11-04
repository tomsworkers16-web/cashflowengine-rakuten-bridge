import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

const port = Number(process.env.CFE_IMAGE_ADMIN_PORT || 18788);
const dir = path.resolve(process.env.CFE_DATA_DIR || '.data', 'approved-product-images');
const manifestFile = path.join(dir, 'manifest.json');
fs.mkdirSync(dir, { recursive: true });
const json = (res, status, value) => {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"});
  res.end(JSON.stringify(value));
};
function entries() {
  try { const x = JSON.parse(fs.readFileSync(manifestFile,'utf8')); return Array.isArray(x.items) ? x.items : []; }
  catch { return []; }
}
function inspectImage(b) {
  if (b.length >= 24 && b.subarray(0,8).toString('hex') === '89504e470d0a1a0a')
    return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),ext:'.png'};
  if (b[0] !== 255 || b[1] !== 216) return null;
  let i=2;
  while(i+10<b.length){
    if(b[i++]!==255) return null;
    const m=b[i++];
    if(m===0xd9||m===0xda)break;
    if(m===0xff||m===0x01||(m>=0xd0&&m<=0xd7))continue;
    const n=b.readUInt16BE(i);
    if(n<2||i+n>b.length)return null;
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(m))
      return n>=7?{height:b.readUInt16BE(i+3),width:b.readUInt16BE(i+5),ext:'.jpg'}:null;
    i+=n;
  }
  return null;
}
async function body(req){
  let n=0;const parts=[];
  for await(const part of req){n+=part.length;if(n>12*1024*1024)throw Error('request_too_large');parts.push(part);}
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
let lastSearch=0;
async function search(keyword){
  const e=process.env;
  if(!e.RAKUTEN_APPLICATION_ID||!e.RAKUTEN_ACCESS_KEY||!e.RAKUTEN_AFFILIATE_ID)throw Error('rakuten_credentials_missing');
  if(!keyword||keyword.length>60)throw Error('keyword_invalid');
  if(Date.now()-lastSearch<3000)throw Error('search_rate_limited');
  lastSearch=Date.now();
  const q=new URLSearchParams({applicationId:e.RAKUTEN_APPLICATION_ID,accessKey:e.RAKUTEN_ACCESS_KEY,affiliateId:e.RAKUTEN_AFFILIATE_ID,
    keyword,format:'json',hits:'20',availability:'1'});
  const endpoint=e.RAKUTEN_API_BASE||'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
  const r=await fetch(endpoint+'?'+q,{signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('rakuten_http_'+r.status);
  const data=await r.json();
  return (data.Items||data.items||[]).map(v=>{
    const x=v.Item||v.item||v;
    return {itemCode:String(x.itemCode||''),itemName:String(x.itemName||'').slice(0,160),price:Number(x.itemPrice||0)};
  }).filter(x=>x.itemCode&&x.itemName);
}
const html = [
'<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ラクミツ 商品画像登録</title>',
'<style>body{background:#f5f4ed;color:#243a30;max-width:780px;margin:20px auto;padding:15px;font-family:Meiryo,Arial,sans-serif}h1{font-size:26px}.box{background:white;padding:22px;border:1px solid #dce4db;border-radius:14px;margin:20px 0}label{display:block;font-weight:bold;margin:15px 0 6px}input[type=text],select{width:100%;box-sizing:border-box;padding:11px;border:1px solid #a8b4aa;border-radius:7px}button{background:#245b40;color:white;border:0;border-radius:7px;padding:11px 16px;margin:9px 0;cursor:pointer}button:disabled{background:#aab1a9}#results button{background:#e7f1e8;color:#23442f;text-align:left;width:100%}.warn{background:#fff5d9;border-left:5px solid #ba8e29;padding:14px;line-height:1.7}#message{white-space:pre-wrap}</style>',
'</head><body><h1>ラクミツ｜画像素材登録</h1><div class="warn">許諾済みの高画質素材のみ登録できます。楽天APIのサムネイルを勝手に拡大したり、商品ページから無断取得したりしません。登録だけではSNS投稿されません。</div>',
'<div class="box"><h2>1. 商品を選ぶ</h2><label>キーワード</label><input id="keyword" type="text" value="キッチン 便利グッズ"><button id="search">楽天の商品を検索</button><div id="results"></div><label>商品コード</label><input id="itemCode" type="text" placeholder="例：shop:12345"><small id="selected"></small></div>',
'<div class="box"><h2>2. 許諾済み画像を登録</h2><label>画像（JPEG・PNG、縦横各600px以上、8MB以下）</label><input type="file" id="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg"><label>画像の利用権限</label><select id="source"><option value="">選択してください</option><option value="rights_holder_permission">権利者からの個別利用許諾</option><option value="rakuten_affiliate_link_creator">楽天リンク作成画面から条件に従い取得（PR投稿専用）</option></select>',
'<label>許諾根拠・利用条件・確認日</label><input type="text" id="permission" placeholder="許諾メールや利用条件のURL・確認日"><p><label><input type="checkbox" id="confirm"> 画像の利用条件と商品コードを確認しました</label></p><button id="register">画像を登録</button><p id="message" role="status"></p></div>',
'<div class="box"><h2>登録済み画像</h2><button id="refresh">更新</button><div id="registered"></div></div>',
'<script>',
'const $=s=>document.getElementById(s);const message=s=>$("message").textContent=s;',
'async function api(url,options){const r=await fetch(url,options);const j=await r.json();if(!r.ok)throw Error(j.error||"request_failed");return j;}',
'$("search").onclick=async()=>{try{const j=await api("/api/search?keyword="+encodeURIComponent($("keyword").value));$("results").replaceChildren();j.items.forEach(x=>{const b=document.createElement("button");b.textContent=x.itemName+" / "+x.price+"円";b.onclick=()=>{$("itemCode").value=x.itemCode;$("selected").textContent=x.itemName};$("results").append(b)});if(!j.items.length)$("results").textContent="候補なし";}catch(e){message(e.message)}};',
'$("register").onclick=async()=>{try{const f=$("file").files[0];if(!f)throw Error("画像を選択してください");if(f.size>8*1024*1024)throw Error("8MBを超えています");$("register").disabled=true;message("確認中…");const b64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]);r.onerror=()=>reject(Error("read_failed"));r.readAsDataURL(f)});const j=await api("/api/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemCode:$("itemCode").value,source:$("source").value,permissionReference:$("permission").value,confirmed:$("confirm").checked,imageBase64:b64})});message("登録完了："+j.itemCode+" / "+j.width+"×"+j.height+"px");await load();}catch(e){message("登録失敗："+e.message)}finally{$("register").disabled=false}};',
'async function load(){try{const j=await api("/api/list");$("registered").replaceChildren();j.items.forEach(x=>{const p=document.createElement("p");p.textContent=x.itemCode+" / "+x.width+"×"+x.height+"px / "+x.source;$("registered").append(p)});if(!j.items.length)$("registered").textContent="未登録です";}catch(e){message(e.message)}}$("refresh").onclick=load;load();',
'</script></body></html>'
].join('');

http.createServer(async(req,res)=>{
  try {
    const host=String(req.headers.host||'');
    if(!['127.0.0.1:'+port,'localhost:'+port].includes(host))return json(res,403,{error:'invalid_host'});
    const u=new URL(req.url||'/','http://127.0.0.1:'+port);
    if(req.method==='GET'&&u.pathname==='/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY',
        'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:"});
      return res.end(html);
    }
    if(req.method==='GET'&&u.pathname==='/api/search')return json(res,200,{items:await search(u.searchParams.get('keyword')||'')});
    if(req.method==='GET'&&u.pathname==='/api/list')return json(res,200,{items:entries().map(x=>({itemCode:x.itemCode,width:x.width,height:x.height,source:x.source}))});
    if(req.method==='POST'&&u.pathname==='/api/register'){
      if(!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(String(req.headers.origin||'')))return json(res,403,{error:'invalid_origin'});
      if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{error:'json_required'});
      const x=await body(req);
      const code=String(x.itemCode||'').trim();
      const source=String(x.source||'');
      const ref=String(x.permissionReference||'').trim();
      if(!/^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(code)||code.length>140)throw Error('item_code_invalid');
      if(!['rights_holder_permission','rakuten_affiliate_link_creator'].includes(source))throw Error('source_invalid');
      if(x.confirmed!==true||ref.length<8||ref.length>700)throw Error('permission_confirmation_required');
      const b64=String(x.imageBase64||'');
      if(!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)||b64.length>12*1024*1024)throw Error('bad_file_encoding');
      const img=Buffer.from(b64,'base64');
      if(img.length<1000||img.length>8*1024*1024)throw Error('image_file_size_invalid');
      const d=inspectImage(img);
      if(!d||Math.min(d.width,d.height)<600||Math.max(d.width,d.height)>10000)throw Error('source_resolution_below_600px');
      const filename=crypto.randomUUID()+d.ext;
      fs.writeFileSync(path.join(dir,filename),img,{flag:'wx'});
      const next={itemCode:code,filename,approved:true,source,permissionReference:ref,width:d.width,height:d.height,registeredAt:new Date().toISOString()};
      const keep=entries().filter(e=>e.itemCode!==code);
      keep.push(next);
      const temp=manifestFile+'.tmp';
      fs.writeFileSync(temp,JSON.stringify({items:keep},null,2),'utf8');
      fs.renameSync(temp,manifestFile);
      return json(res,200,{ok:true,itemCode:code,width:d.width,height:d.height});
    }
    return json(res,404,{error:'not_found'});
  }catch(e){return json(res,e.message==='search_rate_limited'?429:400,{error:e.message||'unknown_error'})}
}).listen(port,'127.0.0.1',()=>{
  console.log('画像素材の登録画面: http://127.0.0.1:'+port);
  console.log('この機能は画像登録のみ。Threads投稿は実行しません。');
});
