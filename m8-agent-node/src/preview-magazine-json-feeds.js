// Opt-in feed intake preview; never schedules or publishes. Explicit config path required.
// The result is compatible with magazine demandSignals input.
import {readFile} from 'node:fs/promises';
import {collectJsonFeedDemand} from './magazine-json-feed-demand.js';
import {asciiJson} from './magazine-listing-snapshot.js';
try{
 const [configPath,day]=process.argv.slice(2);
 if(!configPath||!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw Error('arguments_missing');
 const config=JSON.parse(await readFile(configPath,'utf8'));
 if(!Array.isArray(config.feeds))throw Error('config_invalid');
 const result=await collectJsonFeedDemand({feeds:config.feeds,day});
 console.log(asciiJson({...result,mode:'manual_read_only_preview',sourceConfigPathOmittedFromOutput:true}));
}catch{console.error(JSON.stringify({status:'failed',reason:'feed_preview_invalid_config_or_unavailable'}));process.exitCode=1;}
