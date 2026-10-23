// Contract: /fantasy/week serves only checksum-verified, validated public files for signed-in users; failures are 503 and
// never cached; foreign redirects are refused; a cached index is served stale when GitHub is unreachable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFantasyService, handleFantasy, FantasyError } from '../cloud/fantasy.mjs';
import { snapshotFileName, updateFantasyIndex } from '../shared/fantasy-index.mjs';

const snapshotBytes = readFileSync(new URL('../shared/fantasy/2026-week-06.json', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const file = snapshotFileName(2026, 6, sha(snapshotBytes));
const index = updateFantasyIndex(null, { season: 2026, updatedAt: '2026-10-16T11:00:00Z', review: null,
  snapshot: { week: 6, file, sha256: sha(snapshotBytes), bytes: snapshotBytes.byteLength, generatedAt: '2026-10-15T19:29:56.273Z', statsThroughWeek: 5, publishedAfterFreeze: false, rosterFallbackTeams: 0 } });
const user = { id: '00000000-0000-4000-8000-00000000000b' };
const base = 'https://github.com/seanbalz/guess-the-lines-repo/releases/download/fantasy-data-2026/';
const serve = (files, log = []) => async url => {
  log.push(url);
  if (url.startsWith(base)) return new Response(null, { status: 302, headers: { location: `https://release-assets.githubusercontent.com/x/${url.slice(base.length)}` } });
  const name = url.split('/').at(-1);
  return name in files ? new Response(files[name]) : new Response('missing', { status: 404 });
};
const files = { 'index.json': JSON.stringify(index), [file]: snapshotBytes };
let now = Date.parse('2026-10-16T12:00:00Z');
const clock = () => now;

test('signed-in only; body is empty or season and week; feature switch', async () => {
  const service = createFantasyService({ fetchImpl: serve(files), clock });
  await assert.rejects(handleFantasy({ route: '/fantasy/week', body: {}, user: null, service, clock }), { status: 401 });
  for (const body of [{ season: 2026 }, { season: 2026, week: 6, user: 'x' }, { season: 2026, week: 19 }]) {
    await assert.rejects(handleFantasy({ route: '/fantasy/week', body, user, service, clock }), { status: 400 });
  }
  await assert.rejects(handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock, featureOff: new Set(['fantasy']) }), { status: 503 });
});

test('serves the newest or the requested week, verified', async () => {
  const service = createFantasyService({ fetchImpl: serve(files), clock });
  const latest = await handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock });
  assert.equal(latest.snapshot.week, 6);
  assert.equal(latest.review, null);
  assert.equal(latest.source.stale, false);
  assert.equal((await handleFantasy({ route: '/fantasy/week', body: { season: 2026, week: 6 }, user, service, clock })).snapshot.week, 6);
  await assert.rejects(handleFantasy({ route: '/fantasy/week', body: { season: 2026, week: 7 }, user, service, clock }), { status: 404 });
});

test('a checksum mismatch is 503 and is not cached', async () => {
  const tampered = { ...files, [file]: Buffer.concat([snapshotBytes, Buffer.from(' ')]) };
  let current = tampered;
  const service = createFantasyService({ fetchImpl: async url => serve(current)(url), clock });
  await assert.rejects(handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock }), error => error instanceof FantasyError && error.status === 503);
  current = files;
  assert.equal((await handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock })).snapshot.week, 6);
});

test('a redirect to another origin is refused', async () => {
  const service = createFantasyService({ clock, fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/index.json' } }) });
  await assert.rejects(handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock }), { status: 503 });
});

test('after the index TTL, an unreachable GitHub serves the cached index marked stale', async () => {
  let online = true;
  const service = createFantasyService({ clock, fetchImpl: async url => { if (!online) throw new TypeError('offline'); return serve(files)(url); } });
  await handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock });
  online = false; now += 11 * 60_000;
  const reply = await handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock });
  assert.equal(reply.source.stale, true);
  assert.equal(reply.snapshot.week, 6, 'the verified file comes from the checksum cache');
});
