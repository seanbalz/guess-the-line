// Contract: /fantasy/week serves only checksum-verified, validated public files for signed-in users; failures are 503 and
// never cached; foreign redirects are refused; a cached index is served stale when GitHub is unreachable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFantasyService, createAssetReader, handleFantasy, FantasyError } from '../cloud/fantasy.mjs';
import { snapshotFileName, reviewFileName, updateFantasyIndex, validateFantasyIndex } from '../shared/fantasy-index.mjs';
import { parseFeatureOff } from '../cloud/feature-off.mjs';

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

test('a redirect to another origin is refused before it is requested, with no credentials and manual redirects', async () => {
  const urls = [], optionsSeen = [];
  const fetchImpl = async (url, options) => {
    urls.push(url); optionsSeen.push(options);
    if (new URL(url).origin === 'https://evil.example') return new Response(JSON.stringify(index));
    return new Response(null, { status: 302, headers: { location: 'https://evil.example/index.json' } });
  };
  const service = createFantasyService({ clock, fetchImpl });
  await assert.rejects(handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock }), { status: 503 });
  const allowed = new Set(['https://github.com', 'https://release-assets.githubusercontent.com', 'https://objects.githubusercontent.com']);
  assert.ok(urls.length >= 1);
  assert.deepEqual(urls.filter(url => !allowed.has(new URL(url).origin)), [], 'no request left the GitHub origins');
  assert.ok(optionsSeen.every(options => options.credentials === 'omit' && options.redirect === 'manual'));
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

const validateIndexShape = text => validateFantasyIndex(JSON.parse(text)).valid;
const call = (service, body = {}) => handleFantasy({ route: '/fantasy/week', body, user, service, clock });
const entryFor = (week, name, bytes) => ({ week, file: name, sha256: sha(bytes), bytes: bytes.byteLength, generatedAt: '2026-10-15T19:29:56.273Z', statsThroughWeek: week - 1, publishedAfterFreeze: false, rosterFallbackTeams: 0 });

test('GTL_FEATURE_OFF=fantasy, parsed by the real parser, turns the route off', async () => {
  const service = createFantasyService({ fetchImpl: serve(files), clock });
  await assert.rejects(handleFantasy({ route: '/fantasy/week', body: {}, user, service, clock, featureOff: parseFeatureOff('fantasy') }), { status: 503 });
});

test('a 404 index after the TTL keeps serving the cached index marked stale and does not overwrite it', async () => {
  let current = files;
  const service = createFantasyService({ clock, fetchImpl: async url => serve(current)(url) });
  await call(service);
  now += 11 * 60_000; current = { [file]: snapshotBytes };
  const reply = await call(service);
  assert.equal(reply.snapshot.week, 6);
  assert.equal(reply.source.stale, true);
  current = files; now += 11 * 60_000;
  assert.equal((await call(service)).source.stale, false);
});

test('a 404 index with nothing cached is "no data" and is not cached', async () => {
  let current = {};
  const service = createFantasyService({ clock, fetchImpl: async url => serve(current)(url) });
  await assert.rejects(call(service), { status: 404, message: 'No Fantasy data has been published for this season.' });
  current = files;
  assert.equal((await call(service)).snapshot.week, 6);
});

test('the asset reader refuses by content-length without pulling any body', async () => {
  let pulls = 0, cancelled = false;
  const body = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(4)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const read = createAssetReader({ fetchImpl: async () => new Response(body, { headers: { 'content-length': '1000' } }) });
  await assert.rejects(read('https://github.com/x', 10, 5000), /Too large/);
  assert.equal(cancelled, true);
  assert.equal(pulls, 0, 'the declared size alone stops the read');
});

test('the asset reader stops a stream without content-length at the cap', async () => {
  let sent = 0, cancelled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(4)); sent += 4; }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const read = createAssetReader({ fetchImpl: async () => new Response(body) });
  await assert.rejects(read('https://github.com/x', 10, 5000), /Too large/);
  assert.equal(cancelled, true);
  assert.ok(sent <= 10 + 4, `read stopped at the cap plus one chunk (sent ${sent})`);
});

test('an index over the 64 KB cap is 503 even though it would parse and validate', async () => {
  const padded = JSON.stringify(index).padEnd(70_000, ' ');
  assert.equal(padded.length, 70_000);
  assert.equal(validateIndexShape(padded), true);
  const service = createFantasyService({ clock, fetchImpl: serve({ ...files, 'index.json': padded }) });
  await assert.rejects(call(service), { status: 503 });
});

test('a file whose week differs from its index entry is 503 and is not cached', async () => {
  const wrongName = snapshotFileName(2026, 7, sha(snapshotBytes));
  const bad = updateFantasyIndex(null, { season: 2026, updatedAt: '2026-10-16T11:00:00Z', review: null, snapshot: entryFor(7, wrongName, snapshotBytes) });
  let current = { 'index.json': JSON.stringify(bad), [wrongName]: snapshotBytes };
  const service = createFantasyService({ clock, fetchImpl: async url => serve(current)(url) });
  await assert.rejects(call(service), { status: 503 });
  now += 11 * 60_000; current = files;
  assert.equal((await call(service)).snapshot.week, 6);
});

test('the prior week review rides along; a review failing its checksum leaves review null but the reply succeeds', async () => {
  const review = { schemaVersion: 1, season: 2026, week: 5, generatedAt: '2026-10-14T12:00:00Z', status: 'FINAL',
    estimate: { file: 'x.json', sha256: 'a'.repeat(64), generatedAt: '2026-10-08T12:00:00Z', publishedBeforeFreeze: true },
    actuals: { url: 'https://example.com/stats' }, players: [], playedWithoutEstimate: 0 };
  const reviewBytes = Buffer.from(JSON.stringify(review)), reviewName = reviewFileName(2026, 5, sha(reviewBytes));
  const withReview = updateFantasyIndex(index, { season: 2026, updatedAt: '2026-10-16T11:30:00Z', snapshot: null,
    review: { week: 5, file: reviewName, sha256: sha(reviewBytes), bytes: reviewBytes.byteLength, generatedAt: review.generatedAt, status: 'FINAL' } });
  const indexed = { 'index.json': JSON.stringify(withReview), [file]: snapshotBytes };
  const ok = createFantasyService({ clock, fetchImpl: serve({ ...indexed, [reviewName]: reviewBytes }) });
  assert.equal((await call(ok)).review.week, 5);
  const broken = createFantasyService({ clock, fetchImpl: serve({ ...indexed, [reviewName]: Buffer.from(JSON.stringify({ ...review, status: 'PROVISIONAL' })) }) });
  const reply = await call(broken);
  assert.equal(reply.review, null);
  assert.equal(reply.snapshot.week, 6);
});

test('two concurrent requests on a fresh service make one index request and one snapshot request', async () => {
  const log = [];
  const service = createFantasyService({ clock, fetchImpl: serve(files, log) });
  await Promise.all([call(service), call(service)]);
  const hits = suffix => log.filter(url => url.startsWith(base) && url.endsWith(suffix)).length;
  assert.equal(hits('index.json'), 1);
  assert.equal(hits(file), 1);
});

test('a checksum-cache hit is re-validated against the requested week', async () => {
  const wrongName = snapshotFileName(2026, 7, sha(snapshotBytes));
  const bad = updateFantasyIndex(null, { season: 2026, updatedAt: '2026-10-16T11:00:00Z', review: null, snapshot: entryFor(7, wrongName, snapshotBytes) });
  let current = files;
  const service = createFantasyService({ clock, fetchImpl: async url => serve(current)(url) });
  await call(service);
  now += 11 * 60_000; current = { 'index.json': JSON.stringify(bad), [wrongName]: snapshotBytes };
  await assert.rejects(call(service), { status: 503 });
});
