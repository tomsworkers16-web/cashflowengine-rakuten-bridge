import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmOfficialPost} from '../src/verify-official-post.js';
const id='18224593717352322';
const text='【PR・アフィリエイト】\n商品はこちら\nhttps://hb.afl.rakuten.co.jp/test';
const local=[{id,text,slot:'manual-revenue-2026-11-05',meta:{role:'revenue',affiliate:true}}];
const official=[{id,text,timestamp:'2026-11-05T07:40:00Z',permalink:'https://www.threads.com/@rakumitsu_select/post/example'}];
test('checks identity, exact copy and affiliate link against official API',()=>{
 const r=confirmOfficialPost(local,official,id);
 assert.equal(r.ok,true);assert.equal(r.status,'officially_confirmed');
 assert.equal(r.affiliateLinkMatched,true);assert.equal(r.role,'revenue');
});
test('does not mistake missing or changed content for confirmed publication',()=>{
 assert.equal(confirmOfficialPost(local,[],id).ok,false);
 assert.equal(confirmOfficialPost(local,[{...official[0],text:'別の投稿'}],id).status,'content_mismatch');
 assert.equal(confirmOfficialPost([],official,id).status,'not_in_local_journal');
});
test('refuses malformed post IDs',()=>{
 assert.throws(()=>confirmOfficialPost(local,official,'../.env'),/invalid_post_id/);
});
