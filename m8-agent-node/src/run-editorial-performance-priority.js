// Offline-only item research ranker, data supplied by reviewed report export.
// Usage: node src/run-editorial-performance-priority.js input.json
import {readFileSync} from 'node:fs';
import {prioritizeEditorialResearch} from './editorial-performance-priority.js';
try{
 const filename=process.argv[2];
 if(!filename)throw new Error('input_required');
 const input=JSON.parse(readFileSync(filename,'utf8'));
 const result=prioritizeEditorialResearch(input);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(_error){
 process.stderr.write('editorial_performance_input_invalid\n');
 process.exitCode=2;
}
