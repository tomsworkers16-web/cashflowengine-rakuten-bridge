// Local owner review only. No network or publishing.
import fs from 'node:fs';
import path from 'node:path';
import { selectDailyStage } from './threads-daily-cycle.js';
const dir=path.resolve(process.env.CFE_DATA_DIR||'.data');
const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const proposal=path.join(dir,'threads-daily-proposal.json');
const approvalFile=path.join(dir,'threads-daily-approval.json');
try{
 const plan=JSON.parse(fs.readFileSync(proposal,'utf8'));
 if(process.argv.length===2){console.log(JSON.stringify(plan,null,2));}
 else{
  const [, ,flag,digest,...extra]=process.argv;
  if(flag!=='--approve'||digest!==plan.digest||extra.length)throw Error('Exact current digest required; replies are not approved by this command');
  const approval={approvedByOwner:true,jstDate:day,campaignId:plan.campaignId,digest,approvedReplyUrls:[],approvedAt:new Date().toISOString()};
  if(selectDailyStage({plan,approval,jstDate:day,slot:'07:30',journal:[],officialPostCount:0}).status!=='eligible_for_existing_publisher')throw Error('Invalid or stale proposal');
  if(fs.existsSync(approvalFile)&&JSON.parse(fs.readFileSync(approvalFile,'utf8')).jstDate===day)throw Error('Today already has an approval; preserved');
  const temp=approvalFile+'.tmp-'+process.pid;
  try{fs.writeFileSync(temp,JSON.stringify(approval,null,2),{flag:'wx',mode:0o600});fs.renameSync(temp,approvalFile);}
  finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  console.log('Exact batch approved locally. No publication performed.');
 }
}catch(e){console.error('Review failed:',e.message);process.exitCode=1;}
