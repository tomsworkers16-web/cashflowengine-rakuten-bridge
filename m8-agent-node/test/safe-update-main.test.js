import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('M8 updater fast-forwards only fetched origin main and never resets or auto-posts',()=>{
 const source=fs.readFileSync(path.join(process.cwd(),'Update-And-Check.ps1'),'utf8');
 assert.match(source,/Invoke-Checked 'git' @\('fetch','origin','main'\)/);
 assert.match(source,/Invoke-Checked 'git' @\('merge','--ff-only','FETCH_HEAD'\)/);
 assert.doesNotMatch(source,/Invoke-Checked 'git' @\('pull'/);
 assert.match(source,/Expected main branch/);
 assert.match(source,/Tracked local changes detected/);
 assert.doesNotMatch(source,/git reset --hard|git push --force|npm\.cmd run start/i);
});
