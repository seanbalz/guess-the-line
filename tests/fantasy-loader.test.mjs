// Contract: hosted data first; a non-auth failure falls back to the committed snapshot for that week (never another
// week); 400/401/403 never fall back; local mode reads committed files; the week list is the union of both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFantasyLoader } from '../web/src/fantasyLoader.js';

const week6 = JSON.parse(readFileSync(new URL('../shared/fantasy/2026-week-06.json', import.meta.url), 'utf8'));
const staticWeeks = { '2026-06': async () => ({ default: week6 }) };
const now = () => Date.parse('2026-10-16T12:00:00Z');
const hostedReply = { index: { season: 2026, snapshots: [{ week: 6 }, { week: 7 }] }, snapshot: week6, review: null, source: { retrievedAt: '2026-10-16T12:00:00Z', stale: false } };

test('hosted reply wins and the week list unions hosted and committed weeks', async () => {
  const loader = createFantasyLoader({ cloud: true, readHosted: async () => hostedReply, staticWeeks, initialKey: '2026-06', now });
  const value = await loader.load(null);
  assert.equal(value.origin, 'hosted');
  assert.equal(value.fallback, false);
  assert.deepEqual(value.weeks.map(week => week.key), ['2026-07', '2026-06']);
});

test('a 503 or network failure falls back to the committed file for the same week; none means null', async () => {
  const failing = createFantasyLoader({ cloud: true, readHosted: async () => { throw Object.assign(new Error('down'), { status: 503 }); }, staticWeeks, initialKey: '2026-06', now });
  const saved = await failing.load('2026-06');
  assert.deepEqual([saved.origin, saved.fallback, saved.snapshot.week], ['saved', true, 6]);
  assert.equal(await failing.load('2026-07'), null, 'never another week');
});

test('400, 401 and 403 never fall back; local mode reads committed files without calling the API', async () => {
  for (const status of [400, 401, 403]) {
    const loader = createFantasyLoader({ cloud: true, readHosted: async () => { throw Object.assign(new Error('no'), { status }); }, staticWeeks, initialKey: '2026-06', now });
    await assert.rejects(loader.load('2026-06'), { status });
  }
  let calls = 0;
  const local = createFantasyLoader({ cloud: false, readHosted: async () => { calls++; return hostedReply; }, staticWeeks, initialKey: '2026-06', now });
  assert.equal((await local.load(null)).origin, 'saved');
  assert.equal(calls, 0);
});

test('a reply for another week than requested is refused, then falls back', async () => {
  const loader = createFantasyLoader({ cloud: true, readHosted: async () => ({ ...hostedReply, snapshot: { ...week6, week: 7 } }), staticWeeks, initialKey: '2026-06', now });
  assert.equal((await loader.load('2026-06')).origin, 'saved');
});
