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

// D-83 (Sean, November 11, 2026: "Yes, import wins"): M-35 records preserved_import when a confirmed import kept the order.
const OWNERS = Object.keys(MANAGER_NAMES);
const KEPT = [...OWNERS], WOULD_BE = [OWNERS[3], ...OWNERS.filter((_, i) => i !== 3)], OTHER = [...OWNERS].reverse();
const firstNames = order => order.map(owner => MANAGER_NAMES[owner]);
const held = (extra = {}) => [{ week: 9, outcome: 'preserved_import', keptOrder: KEPT, candidateOrder: WOULD_BE, ...extra }];
// gtl_epl_weeks answers MW10's live order: the reader compares it with the frozen kept order and Tuesday's order.
const reader = (live = KEPT, queries = []) => async (table, query, max) => {
  queries.push({ table, query, max });
  if (table === 'gtl_epl_stat_rechecks') return audit;
  if (table === 'gtl_epl_snapshots') return snapshots();
  if (table === 'gtl_epl_weeks') return typeof live === 'function' ? live() : [{ week: 10, pick_order: live }];
  return [];
};

test('a kept week reports what happened to the order since the recheck: kept, adopted or changed, by first name only', async () => {
  const queries = [];
  const [kept] = await readEplCorrectionReviews({ rows: reader(KEPT, queries), season: 2026, orderStates: held() });
  assert.equal(kept.orderState, 'kept', 'the live order is still the order the recheck kept');
  assert.deepEqual(kept.currentOrder, firstNames(KEPT));
  assert.deepEqual(kept.candidateOrder, firstNames(WOULD_BE));
  assert.equal(kept.nextPickCount, 0);
  assert.ok(!('keptOrder' in kept), 'the frozen order is compared on the server, not shown as if it were current');
  // One bounded fixed-field read of the next week, only for weeks a confirmed import kept.
  assert.deepEqual(queries.find(q => q.table === 'gtl_epl_weeks'), { table: 'gtl_epl_weeks', query: { select: 'week,pick_order', season: 'eq.2026', week: 'in.(10)', limit: '1' }, max: 1 });
  const [adopted] = await readEplCorrectionReviews({ rows: reader(WOULD_BE), season: 2026, orderStates: held() });
  assert.equal(adopted.orderState, 'adopted', 'a later correction import applied the order Tuesday’s totals give');
  assert.deepEqual(adopted.currentOrder, firstNames(WOULD_BE));
  const [changed] = await readEplCorrectionReviews({ rows: reader(OTHER), season: 2026, orderStates: held() });
  assert.equal(changed.orderState, 'changed', 'a later import set an order that is neither');
  assert.deepEqual(changed.currentOrder, firstNames(OTHER));
  assert.deepEqual(changed.candidateOrder, firstNames(WOULD_BE));
  for (const review of [kept, adopted, changed]) assert.ok(OWNERS.every(owner => !JSON.stringify(review).includes(owner)), 'owner ids never leave the server');
});

test('weeks without preserved_import read no live order and carry no order state', async () => {
  for (const orderStates of [null, [], [{ week: 9, outcome: 'preserved_picks' }], [{ week: 9, outcome: 'preserved_closed' }], held({ week: 8 })]) {
    const queries = [];
    const [other] = await readEplCorrectionReviews({ rows: reader(KEPT, queries), season: 2026, orderStates });
    assert.equal(other.orderState, null); assert.equal(other.currentOrder, null); assert.equal(other.candidateOrder, null);
    assert.ok(!queries.some(q => q.table === 'gtl_epl_weeks'), JSON.stringify(orderStates));
  }
  const unknown = '9'.repeat(18);
  const [named] = await readEplCorrectionReviews({ rows: reader([...KEPT.slice(0, 7), unknown]), season: 2026,
    orderStates: held({ keptOrder: [...KEPT.slice(0, 7), unknown], candidateOrder: [unknown, ...KEPT.slice(0, 7)] }) });
  assert.equal(named.orderState, 'kept');
  assert.equal(named.currentOrder[7], null); assert.equal(named.candidateOrder[0], null);
  assert.ok(!JSON.stringify(named).includes(unknown));
});

test('a preserved_import reply without both complete, different orders is refused instead of shown half-empty', async () => {
  for (const extra of [{ keptOrder: undefined }, { candidateOrder: null }, { candidateOrder: [] }, { keptOrder: [KEPT[0], KEPT[0]] },
    { candidateOrder: WOULD_BE.slice(1) }, { candidateOrder: [...WOULD_BE.slice(1), '42'] }, { keptOrder: KEPT.map(Number) }, { keptOrder: [...KEPT, '42'] },
    { candidateOrder: [...KEPT] }])
    await assert.rejects(readEplCorrectionReviews({ rows: reader(), season: 2026, orderStates: held(extra) }), /Invalid order/, JSON.stringify(extra));
});

test('a missing, duplicated or invalid live order is refused instead of guessing a state', async () => {
  for (const live of [() => [], () => [{ week: 11, pick_order: KEPT }], () => [{ week: 10, pick_order: KEPT }, { week: 10, pick_order: KEPT }],
    () => [{ week: 10, pick_order: null }], () => [{ week: 10, pick_order: [] }], () => [{ week: 10, pick_order: [KEPT[0], KEPT[0]] }],
    () => [{ week: 10, pick_order: KEPT.map(Number) }], () => [null], () => ({ week: 10, pick_order: KEPT })])
    await assert.rejects(readEplCorrectionReviews({ rows: reader(live), season: 2026, orderStates: held() }), /Invalid correction/, String(live));
});

test('review endpoint returns the order state and both orders from the M-35 state through the commissioner route', async () => {
  const service = createEplService({ rpc: async name => name === 'gtl_community_admin' ? true : name === 'gtl_epl_order_correction_state' ? held() : null,
    rest: async () => ({ season: 2026, week: 10 }), rows: reader(WOULD_BE) });
  const reply = await read(service);
  assert.equal(reply.available, true);
  assert.equal(reply.reviews.length, 1);
  assert.equal(reply.reviews[0].orderState, 'adopted');
  assert.equal(reply.reviews[0].currentOrder[0], MANAGER_NAMES[WOULD_BE[0]]);
  assert.equal(reply.reviews[0].candidateOrder[0], MANAGER_NAMES[WOULD_BE[0]]);
});
