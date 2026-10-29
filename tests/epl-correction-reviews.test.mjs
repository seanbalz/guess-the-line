import test from 'node:test';
import assert from 'node:assert/strict';
import { createEplService, handleEpl } from '../cloud/epl.mjs';
import { createSupabaseAdapter } from '../cloud/handler.mjs';
import { readEplCorrectionReviews } from '../cloud/epl-correction-reviews.mjs';
import { MANAGER_NAMES } from '../shared/epl-sleeper.mjs';

const USER = { id: '00000000-0000-4000-8000-00000000000a', is_anonymous: false };
const owner = Object.keys(MANAGER_NAMES)[0];
const rosters = changed => Object.keys(MANAGER_NAMES).map(id => ({ owner_id: id, players: ['PRIVATE_PLAYER'], settings: {
  fpts: 500 + (changed && id === owner ? 1 : 0), fpts_decimal: 25, fpts_against: 400,
} }));
const audit = [{ season: 2026, week: 9, checked_at: '2026-11-03T20:05:00Z', original_snapshot_id: 1, recheck_snapshot_id: 2 }];
const snapshots = () => [
  { id: 1, label: 'after-mw9', captured_at: '2026-11-03T02:00:00Z', rosters: rosters(false), sha256: { rosters: 'a'.repeat(64) } },
  { id: 2, label: 'after-mw9-recheck', captured_at: '2026-11-03T20:05:00Z', rosters: rosters(true), sha256: { rosters: 'b'.repeat(64) } },
];
const read = service => handleEpl({ route: '/epl/admin/corrections/read', body: {}, user: USER, service });

test('commissioner reviews use bounded fixed fields and expose normalized totals and source times without roster payloads', async () => {
  const queries = [];
  const reviews = await readEplCorrectionReviews({ season: 2026, rows: async (table, query, max) => {
    queries.push({ table, query, max });
    return table === 'gtl_epl_stat_rechecks' ? audit : table === 'gtl_epl_snapshots' ? snapshots() : [{ week: 10 }];
  } });
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].nextPickCount, 1);
  assert.equal(reviews[0].totalsComplete, true);
  assert.deepEqual(reviews[0].changes, [{ name: MANAGER_NAMES[owner], before: { points: 500.25, against: 400 }, after: { points: 501.25, against: 400 }, pointsChange: 1, againstChange: 0 }]);
  assert.equal(reviews[0].original.capturedAt, '2026-11-03T02:00:00Z');
  assert.equal(reviews[0].corrected.capturedAt, '2026-11-03T20:05:00Z');
  assert.deepEqual(queries.map(q => q.table).sort(), ['gtl_epl_picks', 'gtl_epl_snapshots', 'gtl_epl_stat_rechecks']);
  assert.ok(queries.every(q => !q.query.select.includes('*') && q.max <= 304));
  assert.equal(queries.find(q => q.table === 'gtl_epl_picks').query.select, 'week');
  assert.ok(!JSON.stringify(reviews).includes('PRIVATE_') && !JSON.stringify(reviews).includes(owner));
});

test('missing, duplicate and nonnumeric source totals stay explicitly unavailable instead of becoming zero', async () => {
  for (const change of [list => list.slice(1), list => [...list, list[0]], list => list.map((r, i) => i ? r : { ...r, settings: {} }),
    list => list.map((r, i) => i ? r : { ...r, settings: { ...r.settings, fpts: '501' } })]) {
    const saved = snapshots(); saved[1].rosters = change(saved[1].rosters);
    const reviews = await readEplCorrectionReviews({ season: 2026, rows: async table => table === 'gtl_epl_stat_rechecks' ? audit : table === 'gtl_epl_snapshots' ? saved : [] });
    const row = reviews[0].changes.find(c => c.name === MANAGER_NAMES[owner]);
    assert.equal(row.after.points, null);
    assert.equal(row.pointsChange, null);
    assert.equal(reviews[0].totalsComplete, false);
  }
});

test('review endpoint checks commissioner access before any source read and distinguishes M33 absence from real errors', async () => {
  const paths = [];
  function adapter({ admin, missing = false, failed = false }) {
    return createSupabaseAdapter({ url: 'https://example.supabase.co', anonKey: 'fixture-public', serviceRoleKey: 'fixture-private', fetchImpl: async (url, options) => {
      const path = new URL(url).pathname; paths.push(path);
      if (path.endsWith('/gtl_community_admin')) { assert.deepEqual(JSON.parse(options.body), { p_user: USER.id }); return Response.json(admin); }
      if (path.endsWith('/gtl_epl_recheck_due_at')) {
        if (missing) return Response.json({ code: 'PGRST202' }, { status: 404 });
        if (failed) return Response.json({ code: '42501', message: 'private failure detail' }, { status: 403 });
        return Response.json(null);
      }
      throw new Error('No table read was expected');
    } }).epl;
  }
  await assert.rejects(read(adapter({ admin: false })), error => error.status === 403 && error.code === 'GTL_EPL_FORBIDDEN');
  assert.deepEqual(paths, ['/rest/v1/rpc/gtl_community_admin']);
  paths.length = 0;
  assert.deepEqual(await read(adapter({ admin: true, missing: true })), { available: false, season: null, reviews: [] });
  assert.equal(paths.length, 2);
  await assert.rejects(read(adapter({ admin: true, failed: true })), /unavailable/);
  assert.ok(paths.every(path => path.startsWith('/rest/v1/rpc/')));
});

test('review endpoint performs no writer, uses its validated season, and handles an empty audit', async () => {
  const calls = [];
  const service = createEplService({ rpc: async (name, args) => { calls.push([name, args]); return name === 'gtl_community_admin' ? true : null; },
    rest: async () => ({ season: 2026, week: 10 }), rows: async (table, query) => { calls.push([table, query]); return []; } });
  assert.deepEqual(await read(service), { available: true, season: 2026, reviews: [] });
  assert.deepEqual(calls.map(c => c[0]), ['gtl_community_admin', 'gtl_epl_recheck_due_at', 'gtl_epl_order_correction_state', 'gtl_epl_stat_rechecks']);
  await assert.rejects(handleEpl({ route: '/epl/admin/corrections/read', body: { season: '2026' }, user: USER, service }), error => error.status === 400);
});

test('applied/same-order outcomes leave the review list while preserved and unknown outcomes stay visible', async () => {
  const rows = async table => table === 'gtl_epl_stat_rechecks' ? audit : table === 'gtl_epl_snapshots' ? snapshots() : [];
  for (const outcome of ['applied','same_order']) assert.deepEqual(await readEplCorrectionReviews({ rows, season: 2026, orderStates: [{week:9,outcome}] }), []);
  for (const orderStates of [null,[],[{week:9,outcome:'preserved_picks'}],[{week:9,outcome:'preserved_closed'}]])
    assert.equal((await readEplCorrectionReviews({ rows, season: 2026, orderStates })).length, 1);
  await assert.rejects(readEplCorrectionReviews({ rows, season: 2026, orderStates: [{week:9,outcome:'invented'}] }),/Invalid order/);
});
