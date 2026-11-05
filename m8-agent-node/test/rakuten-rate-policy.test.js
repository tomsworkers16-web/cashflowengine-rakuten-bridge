import test from 'node:test';
import assert from 'node:assert/strict';
import {RAKUTEN_COOLDOWN_MS,isRakutenRateLimitError,rakutenCooldownRemaining} from '../src/rakuten-rate-policy.js';

test('429 signals a rate limit and other errors do not',()=>{
  assert.equal(isRakutenRateLimitError({status:429,message:'HTTP_429'}),true);
  assert.equal(isRakutenRateLimitError({message:'HTTP_429'}),true);
  assert.equal(isRakutenRateLimitError({status:500,message:'HTTP_500'}),false);
});
test('rate limit cooldown holds for 30 minutes and expires',()=>{
  const start=Date.parse('2026-11-05T12:00:00Z');
  const at=new Date(start).toISOString();
  assert.equal(RAKUTEN_COOLDOWN_MS,1800000);
  assert.equal(rakutenCooldownRemaining(at,start),1800);
  assert.equal(rakutenCooldownRemaining(at,start+900000),900);
  assert.equal(rakutenCooldownRemaining(at,start+1800000),0);
  assert.equal(rakutenCooldownRemaining(null,start),0);
});
