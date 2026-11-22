import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeJob } from './job-metrics.mjs';

test('summarizes passing and failing jobs', () => {
  for (const [status, tests, pass, fail] of [
    ['passed', 2, 2, 0],
    ['passed', 0, 0, 0],
    ['failed', 3, 2, 1],
  ]) {
    assert.deepEqual(summarizeJob({ tests, pass, fail }), { status, tests, pass, fail });
  }
});

test('rejects invalid counts and inconsistent totals', () => {
  for (const input of [
    { tests: 2, pass: 1, fail: 0 },
    { tests: 0, pass: 1, fail: -1 },
    { tests: 1.5, pass: 1, fail: 0.5 },
    { tests: '1', pass: 1, fail: 0 },
    { tests: 1, pass: 1 },
  ]) {
    assert.throws(() => summarizeJob(input), TypeError);
  }
});
