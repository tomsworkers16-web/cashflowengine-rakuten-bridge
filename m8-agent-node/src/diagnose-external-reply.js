// Read-only diagnostic: NEVER clicks a publishing control.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';

const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6);
const dataDir=path.resolve(process.env.CFE_DATA_DIR||'.data');
const profileDir=path.resolve(process.env.THREADS_PROFILE_DIR||'.data/threads-profile');
const outDir=path.join(dataDir,'reply-diagnostics');
const allowed=/^https:\/\/www\.threads\.com\/@[A-Za-z0-9_.]+\/post\/[A-Za-z0-9_-]+$/;
const bool=v=>String(v||'false').toLowerCase()==='true';
export function summarizeButtons(buttons){
  return buttons.slice(0,35).map((b,i)=>({
    index:i,aria:String(b.aria||'').slice(0,90),
    text:String(b.text||'').slice(0,90),
    disabled:!!b.disabled,withinDialog:!!b.withinDialog
  }));
}
export function validDiagnosisUrl(input){return typeof input==='string'&&allowed.test(input)}

async function coreRunning(){
  const port=process.env.CFE_LOCAL_PORT||'18787';
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),1000);
    try{return (await fetch('http://127.0.0.1:'+port+'/health',{signal:controller.signal})).ok}
    finally{clearTimeout(timer)}
  }catch{return false}
}
async function snapshot(page,label){
  const state=await page.evaluate(()=>{
    const buttons=[...document.querySelectorAll('button')].map(b=>({
      aria:b.getAttribute('aria-label'),text:b.innerText?.trim(),
      disabled:b.disabled,withinDialog:!!b.closest('[role="dialog"]')
    }));
    const editors=[...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')].map(e=>({
      tag:e.tagName,role:e.getAttribute('role'),aria:e.getAttribute('aria-label'),
      contenteditable:e.getAttribute('contenteditable'),withinDialog:!!e.closest('[role="dialog"]')
    }));
    const dialogs=[...document.querySelectorAll('[role="dialog"]')].map(d=>({
      text:String(d.innerText||'').slice(0,150)
    }));
    // Inspect only nearby interactive ancestors of the existing reply editor.
    // Never click, submit, or inspect the full DOM markup.
    const activeEditor=document.querySelector('[role="textbox"][contenteditable="true"]');
    const sendCandidates=[];
    if(activeEditor){
      let ancestor=activeEditor;
      for(let depth=0;ancestor&&depth<7;depth++,ancestor=ancestor.parentElement){
        const rect=ancestor.getBoundingClientRect();
        if(rect.width>0&&rect.height>0&&rect.height<400&&rect.width<1200){
          const nodes=[...ancestor.querySelectorAll('[role="button"],button,[tabindex],svg')].slice(0,40);
          for(const node of nodes){
            const r=node.getBoundingClientRect();
            if(r.width<8||r.height<8||r.width>180||r.height>180)continue;
            const key=[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)].join(':');
            if(sendCandidates.some(x=>x.rectKey===key))continue;
            sendCandidates.push({
              depth,tag:node.tagName,role:node.getAttribute('role'),
              aria:node.getAttribute('aria-label'),
              title:node.getAttribute('title'),testid:node.getAttribute('data-testid'),
              tabIndex:node.getAttribute('tabindex'),
              svgChildren:node.querySelectorAll('svg').length,
              fill:node.getAttribute('fill'),
              rectKey:key,
              classHint:String(node.className?.baseVal??node.className??'').slice(0,80)
            });
          }
        }
      }
    }
    return {title:document.title,url:location.href,
      buttons,editors,dialogs,sendCandidates:sendCandidates.slice(0,45),articles:document.querySelectorAll('article').length,
      loginVisible:!!document.querySelector('input[type="password"]')};
  });
  const shot=path.join(outDir,label+'.png');
  await page.screenshot({path:shot,fullPage:false,timeout:15000});
  return {label,shot,documentTitle:state.title,url:state.url,
    buttons:summarizeButtons(state.buttons),editors:state.editors.slice(0,12),
    dialogs:state.dialogs.slice(0,5),sendCandidates:state.sendCandidates||[],articleCount:state.articles,
    loginVisible:state.loginVisible};
}
async function main(){
  if(!validDiagnosisUrl(url))throw Error('invalid_target_url');
  if(bool(process.env.CFE_EXTERNAL_REPLY_ENABLED))throw Error('auto_reply_must_remain_disabled');
  if(await coreRunning())throw Error('local_core_running_stop_via_wrapper_first');
  fs.mkdirSync(outDir,{recursive:true});
  const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
  if(!chrome)throw Error('chrome_not_found');
  let context;
  try{
    context=await chromium.launchPersistentContext(profileDir,{
      executablePath:chrome,headless:true,chromiumSandbox:true,
      viewport:{width:1440,height:1000},args:['--disable-blink-features=AutomationControlled']
    });
    const page=context.pages()[0]||await context.newPage();
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(1800);
    const initial=await snapshot(page,'before-open');
    // In current Threads UI the inline reply editor is already visible.
    // Click only that editor; never a reply icon under a different comment.
    if(page.url()!==url)throw Error('target_url_changed_before_editor');
    const editor=page.getByRole('textbox');
    const editorCount=await editor.count();
    let openerResult='editor_not_unique';
    if(editorCount===1){
      await editor.click();
      openerResult='clicked_inline_reply_editor_only';
      await page.waitForTimeout(700);
    }
    const navigationChanged=page.url()!==url;
    const composer=await snapshot(page,'after-open');
    let draftStatus='skipped_not_unique';
    let draft=null;
    if(editorCount===1 && !navigationChanged){
      // A throwaway draft is NEVER submitted. It is cleared in finally.
      // Validate that the visible reply-to label matches the target account.
      const targetUser=new URL(url).pathname.split('/')[1].toLowerCase();
      const recipientVisible=await page.evaluate(()=>{
        const attrs=['placeholder','data-placeholder','aria-label','title'];
        const labels=[document.body.innerText||''];
        for(const e of document.querySelectorAll('*')){
          for(const attr of attrs){
            const value=e.getAttribute(attr);
            if(value && /に返信/.test(value))labels.push(value);
          }
        }
        return labels.join(' ');
      });
      const replyLabelMatches=recipientVisible.includes(targetUser.slice(1)+'に返信')?1:0;
      if(replyLabelMatches<1){
        draftStatus='skipped_reply_recipient_not_visible';
      }else{
        try{
          await editor.fill('【送信しない診断用下書き】');
          await page.waitForTimeout(800);
          if(page.url()!==url)throw Error('target_url_changed_after_draft');
          draft=await snapshot(page,'draft-not-sent');
          draftStatus='draft_displayed_without_send';
        }finally{
          // Dispose of the draft before closing the temporary browser context.
          if(page.url()===url)await editor.fill('').catch(()=>{});
        }
      }
    }
    console.log(JSON.stringify({status:'diagnostic_complete',noPosting:true,
      target:url,openerResult:openerResult,navigationChanged,draftStatus,before:initial,after:composer,draft,
      note:'Temporary diagnostic text was never submitted; cleared before browser close.'},null,2));
  }finally{if(context)await context.close()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{
    console.error(JSON.stringify({status:'diagnostic_failed',noPosting:true,reason:e.message}));
    process.exitCode=1;
  });
}
