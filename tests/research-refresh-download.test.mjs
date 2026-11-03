// The research refresh's source downloads: a brief outage is retried, a permanent refusal is not, and a failure names the
// source and the HTTP status (run 41320419043 on November 1 failed with "Free research source unavailable." and nothing else).
import test from 'node:test';
import assert from 'node:assert/strict';
import { download } from '../scripts/research-refresh.mjs';

const body = text => new Response(text, { status: 200 });
const status = code => new Response(null, { status: code });
const scripted = replies => {
  const calls = [];
  return { calls, fetchImpl: async url => { calls.push(url); const next = replies.shift(); if (next instanceof Error) throw next; return next; } };
};
const options = (fetchImpl, waits = []) => ({ name: 'nflverse schedule', fetchImpl, sleep: async ms => { waits.push(ms); } });

test('a 5xx, 429 or network failure is retried with growing waits, then the source is read', async () => {
  const waits = [], { calls, fetchImpl } = scripted([status(502), new TypeError('fetch failed'), body('season,week\n')]);
  const bytes = await download('https://example.test/games.csv', 1000, options(fetchImpl, waits));
  assert.equal(bytes.toString('utf8'), 'season,week\n');
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [5000, 10000]);
  const limited = scripted([status(429), body('ok')]);
  assert.equal((await download('https://example.test/games.csv', 1000, options(limited.fetchImpl))).toString('utf8'), 'ok');
});

test('a failure names the source and the last status after three attempts', async () => {
  const { calls, fetchImpl } = scripted([status(503), status(503), status(503)]);
  await assert.rejects(download('https://example.test/games.csv', 1000, options(fetchImpl)),
    { message: 'Free research source unavailable: nflverse schedule (HTTP 503).' });
  assert.equal(calls.length, 3);
  const offline = scripted([new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('fetch failed')]);
  await assert.rejects(download('https://example.test/games.csv', 1000, options(offline.fetchImpl)),
    { message: 'Free research source unavailable: nflverse schedule (network error).' });
});

test('a 404 or an oversized source fails at once, without a retry', async () => {
  const missing = scripted([status(404), body('never read')]);
  await assert.rejects(download('https://example.test/games.csv', 1000, options(missing.fetchImpl)),
    { message: 'Free research source unavailable: nflverse schedule (HTTP 404).' });
  assert.equal(missing.calls.length, 1);
  const large = scripted([body('x'.repeat(11)), body('never read')]);
  await assert.rejects(download('https://example.test/games.csv', 10, options(large.fetchImpl)), { message: 'Research source exceeds limit.' });
  assert.equal(large.calls.length, 1);
});
