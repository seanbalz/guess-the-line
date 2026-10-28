// Plan 2026-10-28-epl-pick-a-team.md Task 9: the MW9 hand seed and the Sleeper snapshot import. Both scripts default to a
// dry run that makes no request; --apply posts to gtl-api's commissioner routes with the commissioner's session token.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MW09, buildMw09Seed, describeSeed, parseSeedArgs, runSeed } from '../scripts/epl-seed-mw09.mjs';
import { buildSnapshotImport, listSnapshotFiles, parseImportArgs, runImport, snapshotLabel } from '../scripts/epl-import-snapshots.mjs';
import { EPL_CLUB_CODES } from '../shared/epl-clubs.mjs';
import { MANAGER_NAMES } from '../shared/epl-sleeper.mjs';

const NEMO = '865667912365666304', CULLEN = '1259267898757611520', ADAM = '719745569895018496', SEAN = '473955676301815808';
const EVAN = '719658248843632640', MARK = '1257180071064510465', STEVEN = '702644837370929152', DARIN = '1395236217460633600';
const ORDER = [NEMO, CULLEN, ADAM, SEAN, EVAN, MARK, STEVEN, DARIN];
const USER_UUID = '00000000-0000-4000-8000-00000000000d';
const TARGET = { url: 'https://example.supabase.co', apikey: 'publishable-test-key', token: 'commissioner-session-token' };

const noFetch = () => { throw new Error('dry run must not make a request'); };
function recorder(reply = (route, body) => ({ ok: true, route, body })) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const route = new URL(url).pathname.replace('/functions/v1/gtl-api', '');
    return new Response(JSON.stringify(reply(route, JSON.parse(init.body))), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, fetchImpl };
}

test('the MW9 seed is exactly the Global Constraints order and seven picks, with Darin to pick', () => {
  const seed = buildMw09Seed();
  assert.deepEqual(seed, {
    season: 2026, week: 9,
    windowStart: '2026-10-30T00:00:00.000Z', windowEnd: '2026-11-04T00:00:00.000Z', firstKickoff: '2026-10-31T12:30:00.000Z',
    order: ORDER,
    picks: [
      { ownerId: NEMO, club: 'MNC' }, { ownerId: CULLEN, club: 'AVL' }, { ownerId: ADAM, club: 'LIV' }, { ownerId: SEAN, club: 'TOT' },
      { ownerId: EVAN, club: 'ARS' }, { ownerId: MARK, club: 'BRE' }, { ownerId: STEVEN, club: 'NEW' },
    ],
  });
  assert.deepEqual(seed.order.map(id => MANAGER_NAMES[id]), ['Nemo', 'Cullen', 'Adam', 'Sean', 'Evan', 'Mark', 'Steven', 'Darin']);
  assert.ok(seed.picks.every(p => EPL_CLUB_CODES.includes(p.club)));
  assert.equal(new Set(seed.picks.map(p => p.club)).size, 7);
  // The body carries only the keys admin/week accepts; the RPC stamps source 'seeded' (a client cannot send one).
  assert.ok(seed.picks.every(p => !Object.hasOwn(p, 'source')));
  assert.ok(Object.isFrozen(MW09) && Object.isFrozen(MW09.picks));
  assert.notEqual(buildMw09Seed().picks, buildMw09Seed().picks, 'each call returns a fresh copy');
});

test('the seed preview names every pick as seeded and Darin on the clock', () => {
  const preview = describeSeed(buildMw09Seed());
  assert.deepEqual(preview.picks.map(p => [p.name, p.club, p.source]), [
    ['Nemo', 'MNC', 'seeded'], ['Cullen', 'AVL', 'seeded'], ['Adam', 'LIV', 'seeded'], ['Sean', 'TOT', 'seeded'],
    ['Evan', 'ARS', 'seeded'], ['Mark', 'BRE', 'seeded'], ['Steven', 'NEW', 'seeded'],
  ]);
  assert.equal(preview.onTheClock, 'Darin');
  assert.deepEqual(preview.order, ['Nemo', 'Cullen', 'Adam', 'Sean', 'Evan', 'Mark', 'Steven', 'Darin']);
});

test('a dry-run seed makes no request and lists what --apply would send', async () => {
  const result = await runSeed({ ...TARGET, apply: false, fetchImpl: noFetch, links: [{ ownerId: DARIN, userId: USER_UUID }] });
  assert.equal(result.applied, false);
  assert.deepEqual(result.requests.map(r => r.route), ['epl/admin/week', 'epl/admin/link']);
  assert.deepEqual(result.requests[0].body, buildMw09Seed());
  assert.deepEqual(result.requests[1].body, { ownerId: DARIN, userId: USER_UUID });
  // Without a target a dry run still works (nothing is sent).
  const bare = await runSeed({ apply: false, fetchImpl: noFetch });
  assert.deepEqual(bare.requests.map(r => r.route), ['epl/admin/week']);
});

test('--apply posts admin/week then each admin/link with the commissioner session', async () => {
  const { calls, fetchImpl } = recorder((route, body) => (route === '/epl/admin/week' ? { season: 2026, week: 9, seeded: 7 } : body));
  const result = await runSeed({ ...TARGET, apply: true, fetchImpl, links: [{ ownerId: DARIN, userId: USER_UUID }] });
  assert.equal(result.applied, true);
  assert.deepEqual(calls.map(c => c.url), [
    'https://example.supabase.co/functions/v1/gtl-api/epl/admin/week', 'https://example.supabase.co/functions/v1/gtl-api/epl/admin/link',
  ]);
  for (const c of calls) {
    assert.equal(c.init.method, 'POST');
    assert.equal(c.init.headers.Authorization, 'Bearer commissioner-session-token');
    assert.equal(c.init.headers.apikey, 'publishable-test-key');
    assert.equal(c.init.redirect, 'error');
  }
  assert.deepEqual(calls[0].body, buildMw09Seed());
  assert.deepEqual(result.responses[0], { season: 2026, week: 9, seeded: 7 });
});

test('--apply refuses a missing target or an unsafe URL before any request, and stops at the first refusal', async () => {
  await assert.rejects(runSeed({ apply: true, fetchImpl: noFetch }), /GTL_SUPABASE_URL/);
  await assert.rejects(runSeed({ ...TARGET, token: '', apply: true, fetchImpl: noFetch }), /GTL_SESSION_TOKEN/);
  await assert.rejects(runSeed({ ...TARGET, url: 'http://example.supabase.co', apply: true, fetchImpl: noFetch }), /https/);
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push(url); return new Response(JSON.stringify({ error: 'This matchweek already has in-app picks.', code: 'GTL_EPL_SEED_REFUSED' }), { status: 409 }); };
  await assert.rejects(runSeed({ ...TARGET, apply: true, fetchImpl, links: [{ ownerId: DARIN, userId: USER_UUID }] }), /409.*GTL_EPL_SEED_REFUSED/);
  assert.equal(calls.length, 1, 'no link is sent after the seed is refused');
});

test('seed arguments: dry run by default, --apply, --link Name=uuid or ownerId=uuid, and nothing else', () => {
  assert.deepEqual(parseSeedArgs([]), { apply: false, links: [] });
  assert.deepEqual(parseSeedArgs(['--apply', '--link', `Darin=${USER_UUID}`, '--link', `${SEAN}=${USER_UUID.replace('d', 'e')}`]), {
    apply: true, links: [{ ownerId: DARIN, userId: USER_UUID }, { ownerId: SEAN, userId: USER_UUID.replace('d', 'e') }],
  });
  assert.deepEqual(parseSeedArgs(['--link', 'darin=none']), { apply: false, links: [{ ownerId: DARIN, userId: null }] });
  assert.throws(() => parseSeedArgs(['--link', `Ben=${USER_UUID}`]), /manager/);
  assert.throws(() => parseSeedArgs(['--link', 'Darin=not-a-uuid']), /uuid/);
  assert.throws(() => parseSeedArgs(['--execute']), /Unknown/);
});

// --- Snapshot import ---

function snapshotFixture(dir, name, overrides = {}) {
  const snap = {
    capturedAt: '2026-10-28T17:32:37+00:00', leagueId: '1395122699423993856',
    sources: { users: { path: '/v1/league/1395122699423993856/users', sha256: 'a'.repeat(64) }, rosters: { path: '/v1/league/x/rosters', sha256: 'b'.repeat(64) } },
    users: [{ user_id: SEAN, display_name: 'seanbalz' }], rosters: [{ owner_id: SEAN, roster_id: 1, settings: { fpts: 100 } }],
    ...overrides,
  };
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(snap, null, 1));
  return file;
}

test('snapshot labels drop the capture date and give the matchweek the jobs worker looks for', () => {
  assert.deepEqual(snapshotLabel('2026-10-28-after-mw08.json'), { label: 'after-mw08', week: 8 });
  assert.deepEqual(snapshotLabel('/x/2026-10-30-before-mw09-kickoff.json'), { label: 'before-mw09-kickoff', week: 9 });
  assert.deepEqual(snapshotLabel('after-mw10.json'), { label: 'after-mw10', week: 10 });
  assert.equal(snapshotLabel('notes.json'), null);
  assert.equal(snapshotLabel('2026-10-28-after-mw08.txt'), null);
});

test('the import body carries the label, capture time, matchweek, the stored source hashes and the unchanged file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epl-import-'));
  const file = snapshotFixture(dir, '2026-10-28-after-mw08.json');
  const before = fs.readFileSync(file);
  const item = buildSnapshotImport(file);
  assert.deepEqual(item.body, {
    label: 'after-mw08', capturedAt: '2026-10-28T17:32:37.000Z', week: 8,
    sha256: { users: 'a'.repeat(64), rosters: 'b'.repeat(64) }, payload: JSON.parse(before),
  });
  assert.equal(item.fileSha256, createHash('sha256').update(before).digest('hex'));
  assert.ok(fs.readFileSync(file).equals(before), 'the snapshot file is only read');
  assert.throws(() => buildSnapshotImport(snapshotFixture(dir, '2026-10-28-after-mw07.json', { leagueId: '1' })), /league/);
  assert.throws(() => buildSnapshotImport(snapshotFixture(dir, '2026-10-28-after-mw06.json', { capturedAt: 'soon' })), /capturedAt/);
  assert.throws(() => buildSnapshotImport(snapshotFixture(dir, '2026-10-28-after-mw05.json', { sources: { users: { sha256: 'xyz' } } })), /sha256/);
});

test('a dry-run import lists the snapshot files in order, never sends and never writes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epl-import-'));
  snapshotFixture(dir, '2026-11-03-after-mw09.json');
  snapshotFixture(dir, '2026-10-28-after-mw08.json');
  fs.writeFileSync(path.join(dir, 'snapshot.py'), '# not a snapshot');
  const listing = fs.readdirSync(dir).sort();
  assert.deepEqual(listSnapshotFiles(dir).map(f => path.basename(f)), ['2026-10-28-after-mw08.json', '2026-11-03-after-mw09.json']);
  const result = await runImport({ dir, apply: false, fetchImpl: noFetch });
  assert.equal(result.applied, false);
  assert.deepEqual(result.items.map(i => [i.label, i.week]), [['after-mw08', 8], ['after-mw09', 9]]);
  assert.deepEqual(fs.readdirSync(dir).sort(), listing);
});

test('--apply posts each snapshot to admin/snapshot and reports whether the label was new', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epl-import-'));
  snapshotFixture(dir, '2026-10-28-after-mw08.json');
  const { calls, fetchImpl } = recorder((route, body) => ({ label: body.label, saved: false }));
  const result = await runImport({ ...TARGET, dir, apply: true, fetchImpl });
  assert.deepEqual(calls.map(c => c.url), ['https://example.supabase.co/functions/v1/gtl-api/epl/admin/snapshot']);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer commissioner-session-token');
  assert.equal(calls[0].body.label, 'after-mw08');
  assert.deepEqual(result.items.map(i => [i.label, i.saved]), [['after-mw08', false]]);
  await assert.rejects(runImport({ dir, apply: true, fetchImpl: noFetch }), /GTL_SUPABASE_URL/);
});

test('import arguments: dry run by default, --apply, --dir, --only label', () => {
  const defaults = parseImportArgs([]);
  assert.equal(defaults.apply, false);
  assert.equal(defaults.dir, path.join(os.homedir(), 'gtl-epl-snapshots'));
  assert.deepEqual(parseImportArgs(['--apply', '--dir', '/tmp/x', '--only', 'after-mw08']), { apply: true, dir: '/tmp/x', only: ['after-mw08'] });
  assert.throws(() => parseImportArgs(['--force']), /Unknown/);
});

test('both bodies pass gtl-api\'s own admin/week and admin/snapshot validation unchanged', async () => {
  const { handleEpl } = await import('../cloud/epl.mjs');
  const calls = [];
  const service = { rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === 'gtl_community_admin') return true;
    if (name === 'gtl_epl_seed_week') return { season: args.p_season, week: args.p_week, seeded: args.p_picks.length };
    if (name === 'gtl_epl_save_snapshot') return true;
    throw new Error(`unexpected ${name}`);
  } };
  const user = { id: '00000000-0000-4000-8000-00000000000a', is_anonymous: false };
  assert.deepEqual(await handleEpl({ route: '/epl/admin/week', body: buildMw09Seed(), user, service }), { season: 2026, week: 9, seeded: 7 });
  const seeded = calls.find(c => c[0] === 'gtl_epl_seed_week')[1];
  assert.equal(seeded.p_first_kickoff, '2026-10-31T12:30:00.000Z');
  assert.deepEqual(seeded.p_picks.map(p => [p.owner_id, p.club, p.picked_at]), MW09.picks.map(p => [p.ownerId, p.club, null]));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epl-import-'));
  const { body } = buildSnapshotImport(snapshotFixture(dir, '2026-10-28-after-mw08.json'));
  assert.deepEqual(await handleEpl({ route: '/epl/admin/snapshot', body, user, service }), { label: 'after-mw08', saved: true });
  const saved = calls.find(c => c[0] === 'gtl_epl_save_snapshot')[1];
  assert.deepEqual([saved.p_label, saved.p_week, saved.p_sha256], ['after-mw08', 8, body.sha256]);
});
