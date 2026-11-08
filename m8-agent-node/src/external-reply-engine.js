import fs from 'node:fs';
import path from 'node:path';

const POSITIVE = [
  '時短','家事','掃除','収納','キッチン','料理','献立','洗濯','片付け','便利','買ってよかった',
  'おすすめ','困る','困って','悩み','悩ん','面倒','めんどう','ラク','楽に','省スペース','整理'
];
const NEED = ['どうしてる','ありませんか','ないかな','困って','悩ん','おすすめ','教えて','面倒','めんどう','欲しい'];
const AD = ['楽天','amazon','アマゾン','アフィリエイト','pr','広告','クーポン','セール','案件','提供'];
const SENSITIVE = [
  '政治','選挙','政党','首相','大統領','戦争','宗教','病気','癌','がん','薬','投資','株','FX','仮想通貨',
  '借金','自殺','死にたい','事件','事故','災害','暴力','性的','アダルト','ギャンブル'
];

function norm(s='') { return String(s).toLowerCase().replace(/\s+/g,' ').trim(); }
function countHits(text, words) { return words.reduce((n,w)=>n + (text.includes(w.toLowerCase()) ? 1 : 0),0); }
function hash(s='') { let h=0; for (const ch of s) h=((h<<5)-h+ch.charCodeAt(0))|0; return Math.abs(h); }

export function scoreCandidate(c, { ownUsername='' } = {}) {
  const text = norm(c?.text);
  const author = norm(c?.author).replace(/^@/,'');
  const own = norm(ownUsername).replace(/^@/,'');
  const reasons=[];
  if (!text || !c?.url) return { eligible:false, score:0, reasons:['missing_data'] };
  if (own && author === own) return { eligible:false, score:0, reasons:['own_post'] };
  if (/https?:\/\//i.test(text)) return { eligible:false, score:0, reasons:['contains_url'] };
  if (countHits(text, SENSITIVE)) return { eligible:false, score:0, reasons:['sensitive'] };
  if (countHits(text, AD)) return { eligible:false, score:0, reasons:['commercial_or_affiliate'] };
  if (text.length < 18) return { eligible:false, score:0, reasons:['too_short'] };

  let score=0;
  const p=countHits(text,POSITIVE); score += Math.min(40,p*10); if(p) reasons.push(`topic:${p}`);
  const n=countHits(text,NEED); score += Math.min(30,n*15); if(n) reasons.push(`need:${n}`);
  if (/[？?]/.test(text)) { score += 15; reasons.push('question'); }
  if (text.length >= 40 && text.length <= 400) { score += 10; reasons.push('good_length'); }
  if (!/[@#]/.test(text)) score += 5;
  return { eligible: score >= 35, score, reasons };
}

function category(text='') {
  const t=norm(text);
  if (/掃除|汚れ|ほこり|ホコリ/.test(t)) return 'cleaning';
  if (/収納|片付|整理|省スペース/.test(t)) return 'storage';
  if (/料理|献立|キッチン|ごはん|夕飯/.test(t)) return 'kitchen';
  if (/洗濯|干す|乾燥/.test(t)) return 'laundry';
  return 'general';
}

const TEMPLATES = {
  cleaning: [
    'わかります。掃除は「始めるまでの手間」が減るだけでもかなりラクになりますよね。',
    'これ地味に毎回積み重なるやつですね。手入れまで簡単な方法だと続きやすいです。'
  ],
  storage: [
    '収納って容量より「戻しやすさ」で使いやすさがかなり変わりますよね。',
    'わかります。しまえるだけじゃなく、出して戻す動作が少ないと一気にラクになります。'
  ],
  kitchen: [
    '毎日のことなので、数分でも手間が減る方法はかなり助かりますよね。',
    'これ共感です。便利でも洗い物が増えないものが結局いちばん使い続けやすい気がします。'
  ],
  laundry: [
    '洗濯は毎回の小さな手間が積み重なるので、1工程減るだけでも大きいですよね。',
    'わかります。準備と片付けまで含めてラクになる方法が一番ありがたいですね。'
  ],
  general: [
    'わかります。毎日やることほど、ほんの少し手間が減るだけでもかなり違いますよね。',
    'こういう「地味に面倒」を減らせる工夫って、結局いちばん満足度が高い気がします。'
  ]
};

export function looksCorruptedJapanese(value) {
  const s=String(value||'');
  return /\uFFFD|[縺繧譁蜿螟豁ｮ髪諱驛]/u.test(s) ||
    (/[譎鄒繝繧縺]/u.test(s) && !/[ぁ-んァ-ン]/u.test(s));
}

export function replyAppearsPublished(rows, ownUsername, replyText) {
  const own=norm(ownUsername).replace(/^@/,'');
  const text=norm(replyText);
  if(!own || !text)return false;
  return Array.isArray(rows)&&rows.some(row=>
    row.author===own && row.text.includes(text) && row.permalink);
}

export function buildReply(c) {
  const cat=category(c?.text);
  const list=TEMPLATES[cat] || TEMPLATES.general;
  return list[hash(`${c?.url}|${c?.text}`)%list.length];
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map(x=>{try{return JSON.parse(x)}catch{return null}}).filter(Boolean);
}

export function makeExternalReplyEngine({ dataDir, ownUsername='', maxPerDay=3, minScore=45, enabled=false, event=()=>{} }) {
  const logFile=path.join(dataDir,'external-replies.jsonl');
  const dayKey=()=>new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10);
  const todays=()=>readJsonl(logFile).filter(x=>x.jstDate===dayKey() && x.status==='posted');

  async function readOwnReplyRows(page) {
    // Only a reply authored by the authenticated account and linked to its
    // own post permalink can qualify. A toast or editor dismissal is not proof.
    return page.locator('article').evaluateAll((articles, own) => {
      const out=[];
      for(const article of articles) {
        const anchors=[...article.querySelectorAll('a[href]')];
        const profile=anchors.some(a=>{
          try {
            const u=new URL(a.href, location.href);
            return u.hostname==='www.threads.com'||u.hostname==='threads.com'
              ? u.pathname.replace(/\/$/,'').toLowerCase()==='/@'+own : false;
          } catch { return false; }
        });
        if(!profile)continue;
        const link=anchors.find(a=>{
          try {
            const u=new URL(a.href,location.href);
            return (u.hostname==='threads.com'||u.hostname==='www.threads.com')
              && u.pathname.toLowerCase().startsWith('/@'+own+'/post/');
          }catch{return false;}
        });
        if(link)out.push({author:own,text:(article.innerText||'').toLowerCase().replace(/\s+/g,' ').trim(),
          permalink:true});
      }
      return out;
    },norm(ownUsername).replace(/^@/,''));
  }

  async function verifiedReplyVisible(page, candidate, replyText) {
    for(let attempt=0;attempt<3;attempt++){
      await page.goto(candidate.url,{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForTimeout(1200);
      const rows=await readOwnReplyRows(page);
      if(replyAppearsPublished(rows,ownUsername,replyText))return true;
    }
    return false;
  }

  async function postReply(page, candidate, replyText, beforeSubmit) {
    if(!norm(ownUsername))throw Error('own_username_missing');
    if(looksCorruptedJapanese(candidate.text)||looksCorruptedJapanese(replyText))
      throw Error('possible_mojibake_detected');
    await page.goto(candidate.url,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(1800);

    // If a former attempt already exists, never publish another copy.
    const existing=await readOwnReplyRows(page);
    if(replyAppearsPublished(existing,ownUsername,replyText))
      return {status:'unverified',reason:'matching_reply_already_visible_no_resubmit'};

    const article=page.locator('article').first();
    const replyButton=article.getByRole('button',{name:/返信|Reply/i}).first();
    if(await replyButton.count())await replyButton.click();
    else {
      const generic=page.getByRole('button',{name:/返信|Reply/i}).first();
      if(!(await generic.count()))throw Error('reply_button_not_found');
      await generic.click();
    }
    await page.waitForTimeout(800);

    let box=page.getByRole('textbox').last();
    if(!(await box.count()))box=page.locator('[contenteditable="true"]').last();
    if(!(await box.count()))throw Error('reply_editor_not_found');
    await box.fill(replyText).catch(async()=>{await box.click();await page.keyboard.type(replyText,{delay:20});});
    await page.waitForTimeout(500);

    const submit=page.getByRole('button',{name:/投稿|Post|返信|Reply/i})
      .filter({hasNotText:/キャンセル|Cancel/i}).last();
    if(!(await submit.count()))throw Error('reply_submit_not_found');

    // Journal the intent *before* the irreversible click, avoiding blind retry.
    beforeSubmit();
    try {
      await submit.click();
      await page.waitForTimeout(1800);
      if(await verifiedReplyVisible(page,candidate,replyText))return {status:'posted'};
      return {status:'unverified',reason:'reply_not_visible_after_submit'};
    }catch {
      return {status:'unverified',reason:'reply_submit_or_verification_failed'};
    }
  }
  async function run(page, candidates=[]) {
    if (!enabled) return { enabled:false, posted:0, considered:candidates.length };
    const history=readJsonl(logFile);
    const postedToday=history.filter(x=>x.jstDate===dayKey()&&x.status==='posted');
    const attemptsToday=[...new Map(history.filter(x=>x.jstDate===dayKey()&&
      ['posted','pending','unverified'].includes(x.status)).map(x=>[x.url,x])).values()];
    if(attemptsToday.length>=maxPerDay)
      return {enabled:true,posted:0,dailyCap:true,considered:candidates.length};
    const repliedUrls=new Set(history.map(x=>x.url));
    const repliedAuthors=new Set(attemptsToday.map(x=>norm(x.author).replace(/^@/,'')));
    const ranked=candidates
      .map(c=>({...c,evaluation:scoreCandidate(c,{ownUsername})}))
      .filter(c=>c.evaluation.eligible&&c.evaluation.score>=minScore)
      .filter(c=>!repliedUrls.has(c.url))
      .filter(c=>!repliedAuthors.has(norm(c.author).replace(/^@/,'')))
      .sort((a,b)=>b.evaluation.score-a.evaluation.score);

    const write=(row)=>fs.appendFileSync(logFile,JSON.stringify(row)+'\n','utf8');
    let posted=0,unverified=0;
    for(const c of ranked) {
      if(attemptsToday.length+posted+unverified>=maxPerDay)break;
      const replyText=buildReply(c);
      let submitted=false;
      try {
        const result=await postReply(page,c,replyText,()=>{
          submitted=true;
          write({at:new Date().toISOString(),jstDate:dayKey(),status:'pending',
            author:c.author,url:c.url,score:c.evaluation.score});
        });
        if(result.status!=='posted'){
          write({at:new Date().toISOString(),jstDate:dayKey(),status:'unverified',
            author:c.author,url:c.url,reason:result.reason||'not_confirmed'});
          event('EXTERNAL_REPLY_UNVERIFIED',{url:c.url,reason:result.reason});
          unverified++;
          break;
        }
        write({at:new Date().toISOString(),jstDate:dayKey(),status:'posted',
          author:c.author,url:c.url,sourceText:c.text.slice(0,600),
          replyText,score:c.evaluation.score,reasons:c.evaluation.reasons,
          verification:'own_permalink_visible_after_reload'});
        event('EXTERNAL_REPLY_POSTED',{author:c.author,url:c.url,score:c.evaluation.score});
        posted++;
        await page.waitForTimeout(2500+Math.floor(Math.random()*2500));
      }catch(e){
        // A click attempted before an exception can have succeeded. Never retry.
        const status=submitted?'unverified':'failed';
        write({at:new Date().toISOString(),jstDate:dayKey(),status,
          author:c.author,url:c.url,score:c.evaluation.score,
          error:submitted?'reply_outcome_unknown':String(e.message||'reply_error').slice(0,120)});
        event(status==='unverified'?'EXTERNAL_REPLY_UNVERIFIED':'EXTERNAL_REPLY_ERROR',
          {url:c.url,reason:status});
        if(submitted)unverified++;
        break;
      }
    }
    return {enabled:true,posted,unverified,considered:candidates.length,
      eligible:ranked.length,remaining:Math.max(0,maxPerDay-attemptsToday.length-posted-unverified)};

  }

  return { run, scoreCandidate, buildReply };
}
