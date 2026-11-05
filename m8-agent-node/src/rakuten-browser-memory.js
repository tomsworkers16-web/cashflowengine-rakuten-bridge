// Preflight only for the separate Rakuten report Chrome, not the posting agent.
// Win32_OperatingSystem.FreeVirtualMemory is in KiB and reflects available
// system virtual memory/commit headroom, not browser process working set.
import {spawnSync} from 'node:child_process';
const MIN_FREE_VIRTUAL_KIB=1024*1024; // 1 GiB safety threshold
export function classifyBrowserMemory(freeVirtualKiB){
 if(!Number.isFinite(freeVirtualKiB)||freeVirtualKiB<0)
  return {status:'unknown',allowed:false,reason:'virtual_memory_measurement_unavailable'};
 const freeVirtualGiB=Math.round(freeVirtualKiB/1024/1024*100)/100;
 if(freeVirtualKiB<MIN_FREE_VIRTUAL_KIB)
  return {status:'low',allowed:false,freeVirtualGiB,
   reason:'windows_virtual_memory_low'};
 return {status:'ready',allowed:true,freeVirtualGiB};
}
export function inspectBrowserMemory({platform=process.platform,run=spawnSync}={}){
 if(platform!=='win32')return {status:'not_windows',allowed:true};
 const command='(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory';
 const result=run('powershell.exe',
  ['-NoProfile','-NonInteractive','-Command',command],
  {encoding:'utf8',timeout:10000,windowsHide:true,maxBuffer:32768});
 if(result.error||result.status!==0)
  return {status:'unknown',allowed:false,reason:'virtual_memory_measurement_failed'};
 const n=Number(String(result.stdout||'').trim());
 return classifyBrowserMemory(n);
}
export function classifyChromeLaunchError(error){
 const message=String(error?.message||'');
 if(/VirtualAlloc failed|new_pages != nullptr failed|low_level_alloc|out of memory/i.test(message))
  return 'chrome_virtual_memory_exhausted';
 if(/Target page, context or browser has been closed/i.test(message))
  return 'chrome_exited_unexpectedly';
 return 'rakuten_browser_operation_failed';
}
