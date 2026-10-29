import http from 'node:http';
import { URL } from 'node:url';

const PORT = process.env.PORT || 10000;

const RAKUTEN_APPLICATION_ID = process.env.RAKUTEN_APPLICATION_ID;
const RAKUTEN_ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;

const THREADS_API_BASE = process.env.THREADS_API_BASE || 'https://graph.threads.net/v1.0';
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const THREADS_SMOKE_THREAD_ID = process.env.THREADS_SMOKE_THREAD_ID;

const API_BASE = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const DAILY_THEMES = [
  '便利グッズ', '時短 家事', 'キッチン 便利', '収納 便利', '掃除 便利グッズ',
  'スマホ 便利グッズ', '洗濯 便利グッズ', '防寒 便利グッズ', '料理 時短', '新生活 便利グッズ'
];
let dailyPlanCache = null;
let dailyPlanGeneratedAt = null;

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(body));
}

function html(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300'
  });
  res.end(body);
}

function page(title, body) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;margin:0;background:#fafafa;color:#222;line-height:1.75}
main{max-width:820px;margin:48px auto;padding:0 22px}.card{background:#fff;border:1px solid #e8e8e8;border-radius:16px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,.04)}
h1{font-size:30px;margin:0 0 8px}h2{font-size:20px;margin-top:30px}p,li{font-size:15px}a{color:#1456c0}.muted{color:#666;font-size:13px}.brand{font-weight:700;color:#b56a00}
</style></head><body><main><div class="card">${body}</div></main></body></html>`;
}

function pinterestInfoPage() {
  return page('Cash Flow Engine Rakumitsu - App Information', `
    <div class="brand">Cash Flow Engine / ラクミツ</div>
    <h1>Cash Flow Engine Rakumitsu</h1>
    <p class="muted">Pinterest API Trial Access review information</p>
    <h2>サービス概要</h2>
    <p>ラクミツは、家事・収納・キッチン・スマートフォン周辺など、暮らしの負担を減らす便利グッズや時短アイテムを調査・紹介する日本向けコンテンツメディアです。</p>
    <h2>アプリの目的</h2>
    <p>Cash Flow Engine Rakumitsu は、運営者自身のPinterestビジネスアカウントで、コンテンツ制作と投稿管理を効率化するための社内運用ツールです。Pinterest APIを利用して、ボード情報の取得、Pinの作成・取得、基本的な分析データの取得を行います。</p>
    <h2>想定する利用方法</h2>
    <ul>
      <li>運営者自身が管理するボードの読み取り・管理</li>
      <li>暮らし改善コンテンツの画像Pin作成・公開</li>
      <li>公開済みPinの基本指標を取得し、内容改善に利用</li>
      <li>投稿候補の重複や品質を確認し、過剰投稿を避ける運用</li>
    </ul>
    <p>本アプリは第三者へPinterestアカウント管理機能を提供するSaaSではなく、現段階では運営者自身のアカウントのみを対象とします。スパム投稿、フォロワー操作、アルゴリズムの不正操作を目的としません。</p>
    <h2>データの取り扱い</h2>
    <p>APIから取得する情報は、コンテンツ作成・投稿管理・パフォーマンス分析のためにのみ使用します。アクセストークン等の認証情報は公開せず、サーバー側の環境変数として管理します。</p>
    <h2>連絡先</h2>
    <p>運営: ラクミツ｜暮らしの便利グッズ発掘<br>お問い合わせ: cashflowengine001@gmail.com</p>
    <p><a href="/privacy">プライバシーポリシー</a></p>
  `);
}

function privacyPage() {
  return page('Privacy Policy - Cash Flow Engine Rakumitsu', `
    <div class="brand">Cash Flow Engine / ラクミツ</div>
    <h1>プライバシーポリシー</h1>
    <p class="muted">最終更新日: 2026年10月29日</p>
    <p>ラクミツ｜暮らしの便利グッズ発掘（以下「当運営者」）は、Cash Flow Engine Rakumitsu（以下「本アプリ」）における情報の取り扱いについて、以下のとおり定めます。</p>
    <h2>1. 取得する情報</h2>
    <p>本アプリは、Pinterest APIその他の連携サービスを通じて、運営者自身のアカウントに関するプロフィール識別情報、ボード情報、Pin情報、投稿結果、基本的な分析指標等を取得する場合があります。また、API利用のためのアクセストークン等の認証情報を取り扱います。</p>
    <h2>2. 利用目的</h2>
    <p>取得した情報は、コンテンツの作成・投稿・管理、投稿結果の確認、パフォーマンス分析、運用品質の改善、不正利用や重複投稿の防止、システムの保守・障害対応のために利用します。</p>
    <h2>3. 第三者提供</h2>
    <p>法令に基づく場合を除き、取得した個人情報を本人の同意なく第三者へ販売または提供しません。API連携の実行に必要な範囲で、Pinterest等の外部サービスへデータが送信されることがあります。</p>
    <h2>4. 保存と安全管理</h2>
    <p>認証情報は公開ページやソースコードへ直接掲載せず、アクセス制限されたサーバー環境で管理します。不要となった情報は、運用上必要な期間を考慮したうえで削除または無効化します。</p>
    <h2>5. Cookie等</h2>
    <p>本審査用ページ自体では、独自の広告配信や行動ターゲティングを目的としたCookieを設置していません。ホスティング事業者等がサービス提供上必要な技術情報を処理する場合があります。</p>
    <h2>6. 外部サービス</h2>
    <p>本アプリはPinterestその他の外部サービスと連携する場合があります。各外部サービスにおける情報の取り扱いは、それぞれの規約・プライバシーポリシーにも従います。</p>
    <h2>7. 利用者の権利・連携解除</h2>
    <p>連携権限は、対象サービス側の設定から解除できます。データの確認・削除等に関するお問い合わせには、合理的な範囲で対応します。</p>
    <h2>8. 改定</h2>
    <p>法令、外部サービスの仕様、運用内容の変更等に応じて、本ポリシーを改定する場合があります。重要な変更は本ページへの掲載により告知します。</p>
    <h2>9. お問い合わせ</h2>
    <p>運営: ラクミツ｜暮らしの便利グッズ発掘<br>メール: cashflowengine001@gmail.com</p>
    <p><a href="/pinterest">アプリ説明ページへ戻る</a></p>
  `);
}

function authOk(req) {
  if (!BRIDGE_TOKEN) return false;
  return (req.headers.authorization || '') === `Bearer ${BRIDGE_TOKEN}`;
}

function configured() {
  return Boolean(RAKUTEN_APPLICATION_ID && RAKUTEN_ACCESS_KEY && RAKUTEN_AFFILIATE_ID && BRIDGE_TOKEN);
}

function threadsConfigured() {
  return Boolean(THREADS_ACCESS_TOKEN && THREADS_USER_ID && BRIDGE_TOKEN);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); }
  catch { const e = new Error('invalid_json'); e.status = 400; throw e; }
}

async function threadsRequest(path, { method = 'GET', params = {} } = {}) {
  if (!THREADS_ACCESS_TOKEN) { const e = new Error('threads_access_token_not_configured'); e.status = 503; throw e; }
  const url = new URL(`${THREADS_API_BASE}${path}`);
  for (const [k,v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  url.searchParams.set('access_token', THREADS_ACCESS_TOKEN);
  const upstream = await fetch(url, { method });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) { const e = new Error(`Threads API error ${upstream.status}`); e.status = upstream.status; e.details = data; throw e; }
  return data;
}

async function threadsSelftest() {
  if (!threadsConfigured()) return { ok:false, configured:false };
  try {
    const me = await threadsRequest('/me', { params:{ fields:'id,username,name,threads_profile_picture_url,threads_biography' } });
    return { ok:true, configured:true, userId:me?.id || THREADS_USER_ID, username:me?.username || null };
  } catch (error) {
    return { ok:false, configured:true, status:error?.status || 500, message:String(error?.message || error), details:error?.details || null };
  }
}

async function threadsReadSmokeTest(threadId) {
  const out = { ok:false, threadId, replies:{ok:false}, conversation:{ok:false}, insights:{ok:false} };
  try { const r = await threadsRequest(`/${encodeURIComponent(threadId)}/replies`, {params:{fields:'id,text,timestamp,username,permalink',reverse:'false'}}); out.replies={ok:true,count:Array.isArray(r?.data)?r.data.length:0}; } catch(e){ out.replies={ok:false,status:e?.status||500,message:String(e?.message||e)}; }
  try { const r = await threadsRequest(`/${encodeURIComponent(threadId)}/conversation`, {params:{fields:'id,text,timestamp,username,permalink',reverse:'false'}}); out.conversation={ok:true,count:Array.isArray(r?.data)?r.data.length:0}; } catch(e){ out.conversation={ok:false,status:e?.status||500,message:String(e?.message||e)}; }
  try { const r = await threadsRequest(`/${encodeURIComponent(threadId)}/insights`, {params:{metric:'views,likes,replies,reposts,quotes,shares'}}); const rows=Array.isArray(r?.data)?r.data:[]; out.insights={ok:true,count:rows.length,metrics:rows.map(x=>x?.name).filter(Boolean)}; } catch(e){ out.insights={ok:false,status:e?.status||500,message:String(e?.message||e)}; }
  out.ok = out.replies.ok && out.conversation.ok && out.insights.ok;
  return out;
}

async function publishThreadsText(text, replyToId = null) {
  if (!text || typeof text !== 'string') { const e = new Error('text_required'); e.status=400; throw e; }
  if (text.length > 500) { const e = new Error('text_too_long'); e.status=400; throw e; }
  const params={media_type:'TEXT',text,auto_publish_text:'true'};
  if (replyToId) params.reply_to_id=replyToId;
  const r=await threadsRequest('/me/threads',{method:'POST',params});
  return {ok:true,id:r?.id||null,replyToId:replyToId||null};
}

function normalizeItem(entry) {
  const item=entry?.Item||entry?.item||entry||{};
  const imageList=item.mediumImageUrls||item.smallImageUrls||[];
  const firstImage=imageList[0];
  return {
    itemName:item.itemName||null,itemPrice:Number(item.itemPrice||0)||null,itemUrl:item.itemUrl||null,affiliateUrl:item.affiliateUrl||null,
    imageUrl:typeof firstImage==='string'?firstImage:firstImage?.imageUrl||null,reviewCount:Number(item.reviewCount||0),reviewAverage:Number(item.reviewAverage||0),
    shopName:item.shopName||null,shopCode:item.shopCode||null,itemCode:item.itemCode||null,genreId:item.genreId||null,pointRate:Number(item.pointRate||0),
    postageFlag:item.postageFlag??null,availability:item.availability??null
  };
}

function scoreItem(item) {
  let score=0; const reasons=[];
  if(item.reviewAverage>=4.5){score+=28;reasons.push('高評価4.5+')}else if(item.reviewAverage>=4.2){score+=22;reasons.push('高評価4.2+')}else if(item.reviewAverage>=4.0){score+=16;reasons.push('評価4.0+')}
  if(item.reviewCount>=2000){score+=28;reasons.push('レビュー2000+')}else if(item.reviewCount>=500){score+=22;reasons.push('レビュー500+')}else if(item.reviewCount>=100){score+=15;reasons.push('レビュー100+')}else if(item.reviewCount>=20){score+=8;reasons.push('レビュー20+')}
  const price=Number(item.itemPrice||0); if(price>=1000&&price<=5000){score+=20;reasons.push('衝動買いしやすい価格帯')}else if(price>5000&&price<=10000){score+=13;reasons.push('中価格帯')}else if(price>0&&price<1000){score+=10;reasons.push('低価格')}
  if(item.postageFlag===0||item.postageFlag==='0'){score+=12;reasons.push('送料無料')} if(item.pointRate>=5){score+=7;reasons.push('ポイント倍率高め')} if(item.affiliateUrl){score+=5;reasons.push('アフィリエイトURL取得済み')}
  return {score:Math.min(score,100),reasons};
}

async function searchRakuten({keyword,hits=10,sort='-reviewCount',minPrice,maxPrice,genreId}) {
  const params=new URLSearchParams({applicationId:RAKUTEN_APPLICATION_ID,accessKey:RAKUTEN_ACCESS_KEY,affiliateId:RAKUTEN_AFFILIATE_ID,keyword,format:'json',hits:String(Math.min(Math.max(Number(hits||10),1),30)),sort,availability:'1'});
  if(minPrice)params.set('minPrice',String(minPrice)); if(maxPrice)params.set('maxPrice',String(maxPrice)); if(genreId)params.set('genreId',String(genreId));
  const upstream=await fetch(`${API_BASE}?${params.toString()}`); const data=await upstream.json().catch(()=>({}));
  if(!upstream.ok){const e=new Error(`Rakuten API error ${upstream.status}`);e.status=upstream.status;e.details=data;throw e;}
  const rawItems=data.Items||data.items||[]; return {meta:{page:data.page,pageCount:data.pageCount,hits:data.hits,count:data.count},items:rawItems.map(normalizeItem)};
}

async function buildDailyPlan() {
  const all=[]; const errors=[];
  for(const theme of DAILY_THEMES){try{const result=await searchRakuten({keyword:theme,hits:20,sort:'-reviewCount'});for(const item of result.items)all.push({theme,...item,...scoreItem(item)});}catch(error){errors.push({theme,status:error?.status||null,message:String(error?.message||error)});}}
  const seen=new Set(); const candidates=all.sort((a,b)=>b.score-a.score||b.reviewCount-a.reviewCount).filter(item=>{const key=item.itemCode||item.itemUrl;if(!key||seen.has(key))return false;seen.add(key);return true;}).slice(0,20).map((item,i)=>({rank:i+1,...item}));
  dailyPlanGeneratedAt=new Date().toISOString(); dailyPlanCache={ok:candidates.length>0,generatedAt:dailyPlanGeneratedAt,scoringVersion:'rakumitsu-v2',themes:DAILY_THEMES,candidateCount:candidates.length,candidates,errors};
  console.log('[DAILY_PLAN]',JSON.stringify({generatedAt:dailyPlanGeneratedAt,candidateCount:candidates.length,top5:candidates.slice(0,5).map(x=>({rank:x.rank,theme:x.theme,score:x.score,itemName:x.itemName,reviewCount:x.reviewCount,reviewAverage:x.reviewAverage,itemPrice:x.itemPrice}))}));
  return dailyPlanCache;
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(url.pathname==='/pinterest') return html(res,200,pinterestInfoPage());
    if(url.pathname==='/privacy') return html(res,200,privacyPage());
    if(url.pathname==='/health') return json(res,200,{ok:true,service:'cashflowengine-rakuten-bridge',configured:configured(),apiVersion:'20260701',dailyPlanGeneratedAt,threads:{configured:threadsConfigured(),apiBase:THREADS_API_BASE}});
    if(url.pathname==='/daily-plan'){if(!dailyPlanCache)return json(res,503,{ok:false,error:'daily_plan_not_ready'});return json(res,200,dailyPlanCache);}
    if(url.pathname==='/threads/health'){const r=await threadsSelftest();return json(res,r.ok?200:(r.configured?502:503),r);}
    if(url.pathname.startsWith('/threads/')){
      if(!authOk(req))return json(res,401,{error:'unauthorized'}); if(!threadsConfigured())return json(res,503,{error:'threads_credentials_not_configured'});
      if(url.pathname==='/threads/me'&&req.method==='GET')return json(res,200,await threadsRequest('/me',{params:{fields:url.searchParams.get('fields')||'id,username,name,threads_profile_picture_url,threads_biography'}}));
      if(url.pathname==='/threads/replies'&&req.method==='GET'){const id=url.searchParams.get('thread_id');if(!id)return json(res,400,{error:'thread_id_required'});return json(res,200,await threadsRequest(`/${encodeURIComponent(id)}/replies`,{params:{fields:url.searchParams.get('fields')||'id,text,timestamp,username,permalink',reverse:url.searchParams.get('reverse')||'false'}}));}
      if(url.pathname==='/threads/conversation'&&req.method==='GET'){const id=url.searchParams.get('thread_id');if(!id)return json(res,400,{error:'thread_id_required'});return json(res,200,await threadsRequest(`/${encodeURIComponent(id)}/conversation`,{params:{fields:url.searchParams.get('fields')||'id,text,timestamp,username,permalink',reverse:url.searchParams.get('reverse')||'false'}}));}
      if(url.pathname==='/threads/insights'&&req.method==='GET'){const id=url.searchParams.get('thread_id');if(!id)return json(res,400,{error:'thread_id_required'});return json(res,200,await threadsRequest(`/${encodeURIComponent(id)}/insights`,{params:{metric:url.searchParams.get('metric')||'views,likes,replies,reposts,quotes,shares'}}));}
      if(url.pathname==='/threads/post'&&req.method==='POST'){const body=await readJsonBody(req);return json(res,200,await publishThreadsText(body.text));}
      if(url.pathname==='/threads/reply'&&req.method==='POST'){const body=await readJsonBody(req);if(!body.replyToId)return json(res,400,{error:'replyToId_required'});return json(res,200,await publishThreadsText(body.text,body.replyToId));}
      return json(res,404,{error:'threads_route_not_found'});
    }
    if(!['/search','/recommend'].includes(url.pathname))return json(res,404,{error:'not_found'}); if(!authOk(req))return json(res,401,{error:'unauthorized'}); if(!configured())return json(res,503,{error:'rakuten_credentials_not_configured'});
    const keyword=(url.searchParams.get('keyword')||'').trim(); if(!keyword)return json(res,400,{error:'keyword_required'});
    const result=await searchRakuten({keyword,hits:url.searchParams.get('hits')||(url.pathname==='/recommend'?30:10),sort:url.searchParams.get('sort')||'-reviewCount',minPrice:url.searchParams.get('minPrice'),maxPrice:url.searchParams.get('maxPrice'),genreId:url.searchParams.get('genreId')});
    if(url.pathname==='/recommend'){const ranked=result.items.map(item=>({...item,...scoreItem(item)})).sort((a,b)=>b.score-a.score);return json(res,200,{keyword,count:ranked.length,scoringVersion:'rakumitsu-v1',items:ranked});}
    return json(res,200,{keyword,count:result.items.length,...result.meta,items:result.items});
  }catch(error){const status=Number(error?.status||500);return json(res,status,{error:status===500?'internal_error':(String(error?.message||'').startsWith('Threads API')?'threads_api_error':'upstream_error'),status,message:String(error?.message||error),...(error?.details?{details:error.details}:{})});}
});

async function runStartupJobs(){
  if(!configured())console.log('[SELFTEST] skipped: Rakuten credentials not fully configured');
  else{
    try{const result=await searchRakuten({keyword:'キッチン 便利グッズ',hits:1,sort:'-reviewCount'});const first=result.items[0];console.log('[SELFTEST]',JSON.stringify({ok:Boolean(first),itemReturned:Boolean(first),hasAffiliateUrl:Boolean(first?.affiliateUrl),itemName:first?.itemName||null,reviewCount:first?.reviewCount||0,reviewAverage:first?.reviewAverage||0}));}catch(error){console.error('[SELFTEST]',JSON.stringify({ok:false,status:error?.status||null,message:String(error?.message||error),details:error?.details||null}));}
    try{await buildDailyPlan();}catch(error){console.error('[DAILY_PLAN_ERROR]',String(error?.message||error));}
  }
  const threadsTest=await threadsSelftest(); console.log('[THREADS_SELFTEST]',JSON.stringify(threadsTest));
  if(threadsTest.ok&&THREADS_SMOKE_THREAD_ID){const readSmoke=await threadsReadSmokeTest(THREADS_SMOKE_THREAD_ID);console.log('[THREADS_READ_SMOKE]',JSON.stringify(readSmoke));}
}

server.listen(PORT,'0.0.0.0',()=>{console.log(`Cash Flow Engine bridge listening on ${PORT}`);setTimeout(runStartupJobs,1500);setInterval(()=>buildDailyPlan().catch(e=>console.error('[DAILY_PLAN_ERROR]',String(e?.message||e))),6*60*60*1000);});