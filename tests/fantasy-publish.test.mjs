// Contract: the Fantasy publish readback (scripts/fantasy-publish.mjs) accepts a correct upload that GitHub serves late
// or stale for a while, retries network errors and timeouts, and still fails, naming the file and what it saw, when the
// public bytes never match. On October 23, 2026 the first publish uploaded correct files but failed after about 20 s
// because index.json was not served yet; it was served within about a minute.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readBack, READBACK_WAITS_MS } from '../scripts/fantasy-publish.mjs';

const base = 'https://github.com/seanbalz/guess-the-line/releases/download/fantasy-data-2026';
const local = { 'index.json': Buffer.from('{"v":2}'), 'a.json': Buffer.from('aaa'), 'b.json': Buffer.from('bbb') };
const names = Object.keys(local);
const total = READBACK_WAITS_MS.reduce((sum, ms) => sum + ms, 0);

// A simulated clock: sleep advances it; serve(name, t) decides what GitHub returns at that moment.
function harness(serve) {
  let t = 0;
  const waited = [], logs = [], fetched = [];
  const fetchImpl = async url => {
    const name = url.slice(base.length + 1);
    fetched.push(name);
    const reply = serve(name, t);
    if (reply instanceof Error) throw reply;
    return new Response(reply.body ?? null, { status: reply.status });
  };
  const run = () => readBack({ base, names, readLocal: async name => local[name], fetchImpl, sleep: async ms => { waited.push(ms); t += ms; }, log: line => logs.push(line) });
  return { run, waited, logs, fetched, elapsed: () => t };
}
const current = name => ({ status: 200, body: local[name] });

test('a first upload that GitHub serves after about a minute passes', async () => {
  const h = harness((name, t) => (name === 'index.json' && t < 60_000 ? { status: 404 } : current(name)));
  await h.run();
  assert.ok(h.elapsed() >= 60_000 && h.elapsed() < total, `waited ${h.elapsed()} ms`);
  assert.match(h.logs[0], /^Readback of index\.json not current yet \(HTTP 404\); retrying in 5 s\.$/);
  assert.deepEqual([...new Set(h.fetched)], names, 'every file is read back, index.json first');
});

test('a replaced file served stale for a while passes once current', async () => {
  const h = harness((name, t) => (name === 'index.json' && t < 45_000 ? { status: 200, body: Buffer.from('{"v":1}') } : current(name)));
  await h.run();
  assert.ok(h.elapsed() >= 45_000);
  assert.match(h.logs[0], /\(7 bytes, different content\)/);
});

test('network errors and timeouts are retried, not fatal', async () => {
  const errors = [new TypeError('fetch failed'), new DOMException('The operation was aborted due to timeout', 'TimeoutError')];
  let calls = 0;
  const h = harness(name => (name === 'a.json' && calls++ < 2 ? errors[calls - 1] : current(name)));
  await h.run();
  assert.equal(h.logs.length, 2);
  assert.match(h.logs[0], /\(network error\)/);
  assert.match(h.logs[1], /\(timeout\)/);
});

test('bytes that never match fail after the whole budget, naming the file and what was seen', async () => {
  const h = harness(name => (name === 'b.json' ? { status: 200, body: Buffer.from('xx') } : current(name)));
  await assert.rejects(h.run(), /^Error: Readback mismatch: b\.json \(last: 2 bytes, different content\)$/);
  assert.deepEqual(h.waited, [...READBACK_WAITS_MS], 'the whole schedule, then stop');
});

test('one budget is shared by all files, so a slow run stays bounded', async () => {
  // index.json uses most of the budget before it is served; a.json never is. A fresh budget per file would wait longer.
  const h = harness((name, t) => (name === 'a.json' || (name === 'index.json' && t < total - 60_000) ? { status: 404 } : current(name)));
  await assert.rejects(h.run(), /Readback mismatch: a\.json \(last: HTTP 404\)/);
  assert.equal(h.elapsed(), total);
  assert.ok(!h.fetched.includes('b.json'));
});

test('the schedule covers the observed delay with room, inside the workflow timeout', () => {
  assert.ok(total >= 3 * 60_000, `budget ${total} ms is under 3 minutes`);
  assert.ok(total <= 5 * 60_000, `budget ${total} ms is over 5 minutes; the job times out at 15`);
  assert.ok(READBACK_WAITS_MS.every((ms, i) => ms > 0 && (i === 0 || ms >= READBACK_WAITS_MS[i - 1])), 'waits never shrink');
  assert.ok(Object.isFrozen(READBACK_WAITS_MS));
});
