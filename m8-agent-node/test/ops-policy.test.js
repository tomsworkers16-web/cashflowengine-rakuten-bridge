import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalAdvice} from '../src/ops-policy.js';

test('paused controls must never be recommended as active',()=>{
  const d=operationalAdvice({autoPosting:false,externalReply:false,status:'NORMAL'});
  assert.equal(d.currentAutoPostingEnabled,false);
  assert.equal(d.currentExternalReplyEnabled,false);
  assert.equal(d.keepAutoPostEnabled,false);
  assert.equal(d.keepExternalReplyEnabled,false);
  assert.equal(d.requiresOperatorReview,false);
});
test('caution flags running publication controls for review, no automatic changes',()=>{
  const d=operationalAdvice({autoPosting:true,externalReply:true,status:'CAUTION'});
  assert.equal(d.keepAutoPostEnabled,false);
  assert.equal(d.keepExternalReplyEnabled,false);
  assert.equal(d.requiresOperatorReview,true);
});
test('healthy live controls remain unchanged with no reply-volume growth',()=>{
  const d=operationalAdvice({autoPosting:true,externalReply:false,status:'NORMAL'});
  assert.equal(d.keepAutoPostEnabled,true);
  assert.equal(d.keepExternalReplyEnabled,false);
  assert.equal(d.increaseReplyVolume,false);
});
