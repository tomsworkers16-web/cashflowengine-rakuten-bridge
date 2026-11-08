// Read-only diagnostic: NEVER clicks a publishing control.
import fs from 'node:fs';
import path from 'node:path';
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
    return {title:document.title,url:location.href,
      buttons,editors,dialogs,articles:document.querySelectorAll('article').length,
      loginVisible:!!document.querySelector('input[type="password"]')};
  });
  const shot=path.join(outDir,label+'.png');
  await page.screenshot({path:shot,fullPage:false,timeout:15000});
  return {label,shot,documentTitle:state.title,url:state.url,
    buttons:summarizeButtons(state.buttons),editors:state.editors.slice(0,12),
    dialogs:state.dialogs.slice(0,5),articleCount:state.articles,
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
    // This clicks only a visible reply opener. It never clicks a submit button.
    const openers=page.locator('article').first().getByRole('button',{name:/^返信$|^Reply$/i});
    const opener=await openers.count()?openers.first():page.getByRole('button',{name:/^返信$|^Reply$/i}).first();
    let openerResult='not_found';
    if(await opener.count()){
      await opener.click();
      openerResult='clicked_reply_opener_only';
      await page.waitForTimeout(700);
    }
    const composer=await snapshot(page,'after-open');
    console.log(JSON.stringify({status:'diagnostic_complete',noPosting:true,
      target:url,openerResult:openerResult,before:initial,after:composer,
      note:'Only reply opener clicked; no text entered and no submit clicked.'},null,2));
  }finally{if(context)await context.close()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  main().catch(e=>{
    console.error(JSON.stringify({status:'diagnostic_failed',noPosting:true,reason:e.message}));
    process.exitCode=1;
  });
}
