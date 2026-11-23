// Owner-local opt-in. The standing policy covers only the three own-account
// posts; it cannot generate approvals for other users' posts or replies.
import fs from 'node:fs';
import path from 'node:path';
import { DAILY_AUTO_POLICY } from './threads-daily-cycle.js';
export const POLICY_FILE='threads-daily-owner-policy.json';
export function readOwnerDailyPolicy(dataDir){
 try{
  const file=path.join(dataDir,POLICY_FILE);
  if(fs.statSync(file).size>4096)return null;
  const p=JSON.parse(fs.readFileSync(file,'utf8'));
  return p?.policy===DAILY_AUTO_POLICY&&p?.account==='rakumitsu_select'&&p?.scope==='own_posts_only'&&p?.enabled===true?p.policy:null;
 }catch{return null;}
}
export function dailyAutoEnabled(dataDir,env=process.env){return env.CFE_THREADS_DAILY_AUTO_PUBLISH===DAILY_AUTO_POLICY||readOwnerDailyPolicy(dataDir)===DAILY_AUTO_POLICY;}
export function dailyCycleEnabled(dataDir,env=process.env){return String(env.CFE_THREADS_DAILY_CYCLE_ENABLED||'false').toLowerCase()==='true'||dailyAutoEnabled(dataDir,env)||fs.existsSync(path.join(dataDir,POLICY_FILE));}
