// Contract: account-scoped reads that several screens start together share one request and, for FRESH_MS after it
// succeeds, its answer; a refresh always reads again, a failure is never kept, and one caller cancelling never cancels
// the request for the others.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FRESH_MS, forgetSharedReads, sharedRead } from '../web/src/sharedReads.js';

function counter(result = key => ({ key })) {
  const calls = [];
  const read = signal => { calls.push(signal); return Promise.resolve(result(calls.length)); };
  return { calls, read };
}

test('two callers at once share one request and the same answer', async () => {
  forgetSharedReads();
  const { calls, read } = counter();
  const [a, b] = await Promise.all([sharedRead('u1:tickets', read), sharedRead('u1:tickets', read)]);
  assert.equal(calls.length, 1);
  assert.equal(a, b);
});

test('a caller within FRESH_MS reuses the answer; after it, or with reuse: false, it reads again', async () => {
  forgetSharedReads();
  let time = 1_000;
  const now = () => time;
  const { calls, read } = counter();
  await sharedRead('u1:prefs', read, undefined, { now });
  time += FRESH_MS - 1;
  await sharedRead('u1:prefs', read, undefined, { now });
  assert.equal(calls.length, 1, 'still fresh');
  await sharedRead('u1:prefs', read, undefined, { now, reuse: false });
  assert.equal(calls.length, 2, 'a refresh reads again');
  time += FRESH_MS;
  await sharedRead('u1:prefs', read, undefined, { now });
  assert.equal(calls.length, 3, 'stale answers are read again');
});

test('a failed read is never kept: the next caller reads again', async () => {
  forgetSharedReads();
  let attempt = 0;
  const read = () => { attempt += 1; return attempt === 1 ? Promise.reject(Object.assign(new Error('Unavailable'), { status: 503 })) : Promise.resolve({ ok: true }); };
  await assert.rejects(sharedRead('u1:score', read), /Unavailable/);
  assert.deepEqual(await sharedRead('u1:score', read), { ok: true });
  assert.equal(attempt, 2);
});

test('one caller cancelling leaves the request running for the other; the last one cancelling aborts it', async () => {
  forgetSharedReads();
  let release, seen;
  const read = signal => { seen = signal; return new Promise(resolve => { release = resolve; }); };
  const first = new AbortController(), second = new AbortController();
  const a = sharedRead('u1:slow', read, first.signal), b = sharedRead('u1:slow', read, second.signal);
  await Promise.resolve();
  first.abort();
  await assert.rejects(a, { name: 'AbortError' });
  assert.equal(seen.aborted, false, 'the other caller still waits');
  release({ done: true });
  assert.deepEqual(await b, { done: true });

  forgetSharedReads();
  const c = new AbortController();
  const lone = sharedRead('u1:slower', read, c.signal);
  await Promise.resolve();
  c.abort();
  await assert.rejects(lone, { name: 'AbortError' });
  assert.equal(seen.aborted, true, 'nobody waits, so the request is cancelled');
});

test('forgetting by account prefix drops only that account\'s kept answers', async () => {
  forgetSharedReads();
  const { calls, read } = counter();
  await sharedRead('u1:prefs', read);
  await sharedRead('u2:prefs', read);
  forgetSharedReads('u1:');
  await sharedRead('u1:prefs', read);
  await sharedRead('u2:prefs', read);
  assert.equal(calls.length, 3, 'u1 reads again, u2 is still kept');
});
