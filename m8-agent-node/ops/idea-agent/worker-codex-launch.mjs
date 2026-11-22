// Build the isolated Windows Codex launch without cmd.exe quoting or shell interpolation.
// The explicit Windows unelevated sandbox was verified manually on AF-CodexWorker (2026-11-22).
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
export function buildWorkerCodexLaunch({platform=process.platform,env=process.env,fileExists=existsSync}={}) {
 if(platform==='win32'){
  const local=env.LOCALAPPDATA;
  if(typeof local!=='string'||!local)throw Error('worker_localappdata_missing');
  const entry=resolve(local,'AF-CodexTools','node_modules','@openai','codex','bin','codex.js');
  if(!fileExists(entry))throw Error('worker_codex_entrypoint_missing');
  return Object.freeze({
   executable:process.execPath,
   arguments:Object.freeze([entry,'-c','windows.sandbox="unelevated"','exec','--ephemeral','--sandbox','workspace-write','-'])
  });
 }
 return Object.freeze({
  executable:'codex',
  arguments:Object.freeze(['exec','--ephemeral','--sandbox','workspace-write','-'])
 });
}
