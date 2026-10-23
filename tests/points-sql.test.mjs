import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ALL } from './migrations.mjs';
import { createCommunityWorld, id, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { serviceSql } from './helpers/guess-week.mjs';

// P-01 (20261026120000_gtl_points_core.sql, D-56): Guess the Points tables, guards, publish, lock-in, the reveal gate
// (part 1), then actuals loads, slot results, schedule updates, rulings, the FINAL freeze and the gated read (part 2).
// Local PGlite only; fixture accounts and players, never real data. The guard trigger uses the real clock (defense in
// depth), so slate kickoffs are relative to Date.now(); functions take p_now, so a test moves time by passing it.
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const TABLES = ['gtl_points_slates', 'gtl_points_guesses', 'gtl_points_guess_events', 'gtl_points_receipts',
  'gtl_points_actual_loads', 'gtl_points_actuals', 'gtl_points_rulings', 'gtl_points_regrades', 'gtl_points_week_final'];
const APPEND_ONLY = TABLES.slice(4);
const FUNCTIONS = ['gtl_points_guess_guard()', 'gtl_points_publish_slate(uuid,integer,integer,jsonb,timestamptz,timestamptz)',
  'gtl_points_save(uuid,integer,integer,text,integer,boolean,uuid,timestamptz)', 'gtl_points_revealed(uuid,integer,integer,text,timestamptz)',
  'gtl_points_slate_guard()', 'gtl_points_slot_results(integer,integer)', 'gtl_points_member_points(integer,integer)',
  'gtl_points_update_schedule(integer,integer,jsonb,timestamptz)', 'gtl_points_load_actuals(integer,integer,jsonb,timestamptz)',
  'gtl_points_rule_slot(uuid,integer,integer,text,text,text,timestamptz)', 'gtl_points_finalize(integer,integer,timestamptz)',
  'gtl_points_jobs_state(integer,timestamptz)', 'gtl_points_is_admin(uuid)', 'gtl_points_read(uuid,integer,integer,text,timestamptz)'];
const [LUKE, TROY, SEAN, ZED] = [id(1), id(2), id(3), id(4)];
const HOUR = 3_600_000, DAY = 24 * HOUR;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const READ_KEYS = ['status', 'season', 'week', 'opensAt', 'finalizeAt', 'rules', 'viewer', 'admin', 'leagueId', 'optedIn', 'members', 'slots', 'weekBoard', 'seasonBoard'];
const SLOT_KEYS = ['slot', 'playerId', 'name', 'team', 'position', 'gameId', 'kickoff', 'window', 'void', 'result', 'mine', 'lockedBy', 'revealed', 'others', 'house'];

const slate = now => ({ selectionVersion: 'slate-1', provenance: { file: '2026-week-08.3f9c1a2b.json', sha256: 'f'.repeat(64), generatedAt: new Date(now).toISOString() },
  slots: ['QB', 'RB', 'WR', 'TE', 'FLEX'].map((slot, i) => ({ slot, playerId: `00-000000${i + 1}`, pfrId: `Pf${i}`, name: `P${i}`, team: ['SEA', 'KC', 'BUF', 'DAL', 'MIA'][i],
    position: slot === 'FLEX' ? 'WR' : slot, gameId: ['SEA-DEN', 'KC-LV', 'BUF-NYJ', 'DAL-PHI', 'MIA-NE'][i],
    kickoff: new Date(now + (i < 2 ? 2 : 50) * HOUR).toISOString(), window: i < 2 ? 'Sun early' : 'Mon night', house: 10 + i })) });

// An actuals payload in the actualsPayload shape (shared/points-actuals.mjs, Task 3): a stats row for each slate player
// named in `actuals` (by slot; a number or null is that row's points, an object overrides row fields), one kicker row
// outside the slate, and the played flag a stats row implies (true; otherwise null) unless `played` overrides it by slot.
const actualsFixture = (now, { week = 8, sha = 'a', actuals = {}, played = {}, review = { checked: false, agrees: null } } = {}) => {
  const slots = slate(now).slots;
  const row = (s, a) => ({ playerId: s.playerId, name: s.name, team: s.team, position: s.position, gameId: s.gameId, stats: { receptions: 1 },
    ...(a !== null && typeof a === 'object' ? a : { points: a }) });
  const players = slots.filter(s => s.slot in actuals).map(s => row(s, actuals[s.slot]));
  players.push({ playerId: '00-0000099', name: 'K9', team: 'SEA', position: 'K', gameId: 'SEA-DEN', stats: { fg_made_40_49: 1 }, points: 4 });
  return { season: 2026, week, rulesVersion: 'points-1', sources: { stats: { sha256: sha.repeat(64), updatedAt: '2026-10-27T04:46:00Z' } }, review,
    played: Object.fromEntries(slots.map(s => [s.playerId, s.slot in played ? played[s.slot] : (s.slot in actuals ? true : null)])), players };
};

async function fixture(t) {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world, call = serviceSql(db);
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const now = Date.now(), at = ms => new Date(ms).toISOString();
  const publish = (over = {}, actor = SEAN, p = {}) => call('gtl_points_publish_slate', { p_actor: actor, p_season: p.season ?? 2026, p_week: p.week ?? 8,
    p_slate: over.slate ?? slate(now), p_finalize_at: p.finalize ?? at(now + 6 * DAY), p_now: p.now ?? at(now) });
  const save = (user, slot, guess, lock = false, request = randomUUID(), pNow = at(Date.now()), week = 8) => call('gtl_points_save', { p_user: user, p_season: 2026, p_week: week,
    p_slot: slot, p_guess: guess, p_lock: lock, p_request: request, p_now: pNow });
  const revealed = (viewer, slot, pNow) => call('gtl_points_revealed', { p_viewer: viewer, p_season: 2026, p_week: 8, p_slot: slot, p_now: pNow });
  const count = async table => Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n);
  const payload = (opts = {}) => actualsFixture(now, opts);
  const load = (body, week = body?.week ?? 8) => call('gtl_points_load_actuals', { p_season: 2026, p_week: week, p_payload: body, p_now: at(Date.now()) });
  const read = (user, pNow, { season = 2026, week = 8, league = null } = {}) => call('gtl_points_read', { p_user: user, p_season: season, p_week: week, p_league: league, p_now: pNow });
  const rule = (actor, slot, ruling, reason, pNow, week = 8) => call('gtl_points_rule_slot', { p_actor: actor, p_season: 2026, p_week: week, p_slot: slot, p_ruling: ruling, p_reason: reason, p_now: pNow });
  const finalize = (pNow, week = 8) => call('gtl_points_finalize', { p_season: 2026, p_week: week, p_now: pNow });
  const schedule = (games, pNow, week = 8) => call('gtl_points_update_schedule', { p_season: 2026, p_week: week, p_games: games, p_now: pNow });
  const results = async (week = 8) => Object.fromEntries((await db.query('select slot,status,actual::float8 actual,void_reason from public.gtl_points_slot_results(2026,$1)', [week])).rows.map(r => [r.slot, r]));
  const addMember = async (n, name) => { await db.query('insert into auth.users values($1)', [id(n)]); await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [id(n), name]); };
  return { db, call, as, now, at, publish, save, revealed, count, payload, load, read, rule, finalize, schedule, results, addMember };
}
const code = c => new RegExp(c);
const slotOf = (reply, name) => reply.slots.find(s => s.slot === name);
const row = (rows, user) => rows.find(r => r.userId === user);
// The hidden-sentinel check reads every value in the reply except clock-derived ISO timestamps, which are not member data.
const withoutTimes = reply => JSON.stringify(reply).replace(/"\d{4}-\d{2}-\d{2}T[^"]*"/g, '"<time>"');

test('privilege: anon and authenticated cannot touch any points table or function, and every function is security invoker', { skip }, async t => {
  const f = await fixture(t);
  const priv = async (fn, role, table, p) => (await f.db.query(`select ${fn}($1,$2,$3) ok`, [role, `public.${table}`, p])).rows[0].ok;
  for (const role of ['anon', 'authenticated']) {
    for (const table of TABLES) {
      // Column-level grants (update(slots, audit), ...) are invisible to has_table_privilege, so read them per column.
      for (const p of ['SELECT', 'INSERT', 'UPDATE']) assert.equal(await priv('has_any_column_privilege', role, table, p), false, `${role} ${p} ${table}`);
      for (const p of ['DELETE', 'TRUNCATE']) assert.equal(await priv('has_table_privilege', role, table, p), false, `${role} ${p} ${table}`);
      await assert.rejects(() => f.as(role, `delete from public.${table}`), /permission denied/, `${role}: delete ${table}`);
    }
    for (const fn of FUNCTIONS) assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${fn}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${fn}`);
  }
  // Loads, actuals, rulings, re-grades and finals are append-only even for the service (D-23).
  for (const table of APPEND_ONLY) {
    for (const p of ['SELECT', 'INSERT']) assert.equal(await priv('has_any_column_privilege', 'service_role', table, p), true, `service_role ${p} ${table}`);
    assert.equal(await priv('has_any_column_privilege', 'service_role', table, 'UPDATE'), false, `service_role UPDATE ${table}`);
    for (const p of ['DELETE', 'TRUNCATE']) assert.equal(await priv('has_table_privilege', 'service_role', table, p), false, `service_role ${p} ${table}`);
  }
  const rls = (await f.db.query("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname like 'gtl_points_%' and relkind='r'")).rows;
  assert.deepEqual(rls.map(r => r.relname).sort(), [...TABLES].sort()); assert(rls.every(r => r.relrowsecurity), 'row level security is on for every points table');
  const flags = (await f.db.query("select proname,prosecdef from pg_proc where proname like 'gtl_points_%'")).rows;
  assert.equal(flags.length, FUNCTIONS.length); assert(flags.every(row => row.prosecdef === false), 'all points functions are security invoker');
  const cfg = (await f.db.query("select proname,proconfig from pg_proc where proname like 'gtl_points_%'")).rows;
  for (const row of cfg) assert(row.proconfig?.includes('search_path=""'), `${row.proname} pins search_path`);
});

test('publish: only the commissioner publishes once per week, a malformed slate or window is refused, opensAt is p_now', { skip }, async t => {
  const f = await fixture(t), { now, at } = f;
  await assert.rejects(() => f.publish({}, LUKE), code('GTL_POINTS_FORBIDDEN'));
  const bad = edit => { const s = slate(now); edit(s); return { slate: s }; };
  const cases = {
    'repeated game': bad(s => { s.slots[1].gameId = s.slots[0].gameId; }),
    'wrong position': bad(s => { s.slots[1].position = 'WR'; }),
    'flex as QB': bad(s => { s.slots[4].position = 'QB'; }),
    'one window': bad(s => { s.slots.forEach(x => { x.window = 'Sun early'; }); }),
    'kickoff before now': bad(s => { s.slots[0].kickoff = at(now - HOUR); }),
    'four slots': bad(s => { s.slots.pop(); }),
    'slot order': bad(s => { s.slots.reverse(); }),
    'repeated player': bad(s => { s.slots[1].playerId = s.slots[0].playerId; }),
    'bad player id': bad(s => { s.slots[0].playerId = 'x'; }),
    'bad provenance hash': bad(s => { s.provenance.sha256 = 'zz'; }),
    'no selection version': bad(s => { delete s.selectionVersion; }),
    'empty window': bad(s => { s.slots[0].window = ''; }),
    'relative kickoff text': bad(s => { s.slots[0].kickoff = 'tomorrow'; }),
    'kickoff without offset': bad(s => { s.slots[0].kickoff = at(now + 2 * HOUR).replace('Z', ''); }),
    'team not in game': bad(s => { s.slots[0].team = 'KC'; }),
  };
  for (const [name, c] of Object.entries(cases)) await assert.rejects(() => f.publish(c), code('GTL_POINTS_INVALID'), name);
  await assert.rejects(() => f.publish({}, SEAN, { finalize: at(now + 50 * HOUR) }), code('GTL_POINTS_INVALID'), 'finalize at last kickoff');
  for (const week of [0, 19]) await assert.rejects(() => f.publish({}, SEAN, { week }), code('GTL_POINTS_INVALID'), `week ${week}`);
  for (const season of [1999, 2201]) await assert.rejects(() => f.publish({}, SEAN, { season }), code('GTL_POINTS_INVALID'), `season ${season}`);
  assert.equal(await f.count('gtl_points_slates'), 0, 'nothing stored by a refused publish');
  const out = await f.publish();
  assert.equal(new Date(out.opensAt).toISOString(), at(now)); assert.equal(out.season, 2026); assert.equal(out.week, 8);
  const row = (await f.db.query('select slots,audit from public.gtl_points_slates')).rows[0];
  row.slots.forEach((s, i) => assert.equal(new Date(s.kickoff).toISOString(), slate(now).slots[i].kickoff, `canonical kickoff ${i}`));
  assert(row.slots.every(s => /(Z|[+-]\d{2}(:\d{2})?)$/.test(s.kickoff)), 'stored kickoff carries an explicit offset');
  assert.equal(row.slots.length, 5); assert.equal(row.slots[0].void, null); assert.equal(row.audit[0].action, 'published');
  await assert.rejects(() => f.publish(), code('GTL_POINTS_PUBLISHED'));
});

test('save and lock: drafts change, a lock is final, the table refuses edits and deletes of a locked row, every save is an event', { skip }, async t => {
  const f = await fixture(t); await f.publish();
  const a = await f.save(LUKE, 'QB', 20);
  assert.deepEqual([a.guess, a.lockedAt, a.slot], [20, null, 'QB']);
  assert.equal((await f.save(LUKE, 'QB', 22)).guess, 22);
  const lockNow = new Date(Date.now()).toISOString();
  const locked = await f.save(LUKE, 'QB', 25, true, randomUUID(), lockNow);
  assert.equal(new Date(locked.lockedAt).toISOString(), lockNow); assert.equal(locked.guess, 25);
  await assert.rejects(() => f.save(LUKE, 'QB', 1), code('GTL_POINTS_LOCKED'));
  await assert.rejects(() => f.save(LUKE, 'QB', 1, true), code('GTL_POINTS_LOCKED'));
  await assert.rejects(() => f.as('service_role', "update public.gtl_points_guesses set guess=1 where slot='QB'"), code('GTL_POINTS_LOCKED'));
  await assert.rejects(() => f.db.query('delete from public.gtl_points_guesses'), code('GTL_POINTS_DELETE'));
  await assert.rejects(() => f.as('service_role', 'delete from public.gtl_points_guesses'), /permission denied/);
  assert.equal((await f.db.query("select guess from public.gtl_points_guesses where slot='QB'")).rows[0].guess, 25);
  const events = (await f.db.query('select kind,guess from public.gtl_points_guess_events order by id')).rows;
  assert.deepEqual(events, [{ kind: 'draft', guess: 20 }, { kind: 'draft', guess: 22 }, { kind: 'lock', guess: 25 }]);
  assert.equal(await f.count('gtl_points_receipts'), 3);
});

test('windows: no slate, closed after kickoff (function and real-clock trigger), invalid guess, non-member', { skip }, async t => {
  const f = await fixture(t), { now, at } = f;
  await assert.rejects(() => f.save(LUKE, 'QB', 10), code('GTL_POINTS_NO_SLATE'));
  await f.publish();
  await assert.rejects(() => f.save(LUKE, 'QB', 10, false, randomUUID(), at(now + 3 * HOUR)), code('GTL_POINTS_CLOSED'));
  await assert.rejects(() => f.save(LUKE, 'QB', 10, false, randomUUID(), at(now + 2 * HOUR)), code('GTL_POINTS_CLOSED'), 'at the kickoff instant');
  await assert.rejects(() => f.save(LUKE, 'QB', 10, false, randomUUID(), at(now - HOUR)), code('GTL_POINTS_NOT_OPEN'));
  for (const guess of [61, -1, null]) await assert.rejects(() => f.save(LUKE, 'QB', guess), code('GTL_POINTS_INVALID'), String(guess));
  await assert.rejects(() => f.save(LUKE, 'XX', 10), code('GTL_POINTS_INVALID'));
  await assert.rejects(() => f.save(LUKE, 'QB', 10, false, null), code('GTL_POINTS_INVALID'));
  await assert.rejects(() => f.save(randomUUID(), 'QB', 10), code('GTL_POINTS_MEMBER'));
  assert.equal(await f.count('gtl_points_guesses'), 0, 'refused saves store nothing');
  // The trigger refuses on the real clock even if a caller bypasses the function: make QB's kickoff past.
  await f.db.query("update public.gtl_points_slates set slots=jsonb_set(slots,'{0,kickoff}',to_jsonb((now()-interval '1 hour')::text))");
  await assert.rejects(() => f.as('service_role', `insert into public.gtl_points_guesses(user_id,season,week,slot,guess) values('${LUKE}',2026,8,'QB',5)`), code('GTL_POINTS_CLOSED'));
});

test('idempotent retries: the same request and payload replays, another guess under that request conflicts', { skip }, async t => {
  const f = await fixture(t); await f.publish();
  const request = randomUUID();
  const first = await f.save(LUKE, 'RB', 12, false, request);
  const again = await f.save(LUKE, 'RB', 12, false, request);
  assert.deepEqual(again, first);
  assert.equal(await f.count('gtl_points_guess_events'), 1, 'no second event');
  await assert.rejects(() => f.save(LUKE, 'RB', 13, false, request), code('GTL_POINTS_RETRY_CONFLICT'));
  assert.equal(await f.count('gtl_points_guess_events'), 1);
});

test('gate: another player sees a slot only after locking it or at kickoff', { skip }, async t => {
  const f = await fixture(t), { now, at } = f; await f.publish();
  await f.save(LUKE, 'QB', 20, true);
  assert.equal(await f.revealed(TROY, 'QB', at(now + HOUR)), false, 'troy has not locked');
  await f.save(TROY, 'QB', 17, false);
  assert.equal(await f.revealed(TROY, 'QB', at(now + HOUR)), false, 'a draft does not reveal');
  await f.save(TROY, 'QB', 18, true);
  assert.equal(await f.revealed(TROY, 'QB', at(now + HOUR)), true, 'troy locked QB');
  assert.equal(await f.revealed(TROY, 'RB', at(now + HOUR)), false, 'other slot still hidden');
  assert.equal(await f.revealed(SEAN, 'RB', at(now + 2 * HOUR)), true, 'everyone at kickoff');
  assert.equal(await f.revealed(SEAN, 'TE', at(now + 2 * HOUR)), false, 'later kickoff still hidden');
});

// ---- P-01 part 2: actuals, results, schedule, rulings, FINAL and the gated read --------------------------------------

test('scoring: a saved load scores each locked guess max(0, 10 - |guess - actual|) to the tenth; a draft scores nothing', { skip }, async t => {
  const f = await fixture(t), { now, at } = f;
  const none = await f.read(LUKE, at(now), { season: null, week: null });
  assert.deepEqual(none, { status: 'none', viewer: LUKE, admin: false, leagueId: null, optedIn: false, members: none.members });
  assert.deepEqual(none.members.map(m => m.id).sort(), [LUKE, TROY, SEAN].sort());
  assert.equal((await f.read(SEAN, at(now), { season: null, week: null })).admin, true, 'the commissioner sees admin before any slate');
  await f.publish();
  await f.save(LUKE, 'QB', 18, true); await f.save(LUKE, 'RB', 9, true); await f.save(LUKE, 'TE', 7);
  const out = await f.load(f.payload({ actuals: { QB: 14.6, RB: 0, TE: 7 } }));
  assert.equal(out.status, 'saved'); assert.match(out.loadId, UUID); assert.deepEqual(out.regraded, ['QB', 'RB', 'TE'], 'the first grading is audited too');
  const points = (await f.db.query('select user_id,slot,guess,points::float8 points from public.gtl_points_member_points(2026,8) order by slot')).rows;
  assert.deepEqual(points, [{ user_id: LUKE, slot: 'QB', guess: 18, points: 6.6 }, { user_id: LUKE, slot: 'RB', guess: 9, points: 1 }], 'locked guesses only');
  const r = await f.read(LUKE, at(now + 3 * DAY), { season: null, week: null });
  assert.deepEqual(Object.keys(r).sort(), [...READ_KEYS].sort());
  for (const s of r.slots) assert.deepEqual(Object.keys(s).sort(), [...SLOT_KEYS].sort(), s.slot);
  assert.deepEqual([r.status, r.season, r.week, r.viewer, r.admin, r.leagueId, r.optedIn], ['closed', 2026, 8, LUKE, false, null, true]);
  assert.deepEqual(r.rules, { format: 'ppr', passingTds: 4, version: 'points-1' });
  assert.equal(new Date(r.opensAt).toISOString(), at(now)); assert.equal(new Date(r.finalizeAt).toISOString(), at(now + 6 * DAY));
  assert.deepEqual(r.slots.map(s => s.slot), ['QB', 'RB', 'WR', 'TE', 'FLEX']);
  const qb = slotOf(r, 'QB');
  assert.deepEqual([qb.playerId, qb.name, qb.team, qb.position, qb.gameId, qb.window, qb.void], ['00-0000001', 'P0', 'SEA', 'QB', 'SEA-DEN', 'Sun early', null]);
  assert.deepEqual(qb.result, { status: 'scored', actual: 14.6 }); assert.equal(typeof qb.result.actual, 'number', 'JSON numbers, not strings');
  assert.deepEqual([qb.mine.guess, qb.mine.points, qb.lockedBy], [18, 6.6, [LUKE]]); assert.equal(typeof qb.mine.points, 'number');
  assert.deepEqual([slotOf(r, 'RB').result, slotOf(r, 'RB').mine.points], [{ status: 'scored', actual: 0 }, 1]);
  const te = slotOf(r, 'TE');
  assert.deepEqual([te.result.status, te.mine.guess, te.mine.lockedAt, te.mine.points, te.lockedBy], ['scored', 7, null, null, []], 'an unlocked draft scores nothing');
  assert.deepEqual([slotOf(r, 'WR').mine, slotOf(r, 'WR').result], [null, { status: 'pending', actual: null }]);
  assert.deepEqual(qb.house, { visible: true, value: 10, points: 5.4 });
  assert.deepEqual(r.weekBoard, { max: 50, mine: 7.6, house: 9.4, standings: [{ userId: LUKE, points: 7.6, slotsScored: 2 }] });
  assert.deepEqual(r.seasonBoard, { standings: [{ userId: LUKE, points: 7.6, weeksPlayed: 1, beatHouse: 0 }], house: 9.4 });
  assert.equal((await f.read(LUKE, at(now + HOUR))).status, 'open');
});

test('played: a played flag with no stats row scores an actual of 0; a stats row with a missing stat stays pending, never 0', { skip }, async t => {
  const f = await fixture(t), { now, at } = f; await f.publish();
  await f.save(LUKE, 'WR', 3, true); await f.save(LUKE, 'TE', 4, true);
  await f.load(f.payload({ actuals: { QB: 14.6, RB: 0, FLEX: 7, TE: null }, played: { WR: true } }));
  const res = await f.results();
  assert.deepEqual([res.WR.status, res.WR.actual, res.WR.void_reason], ['scored', 0, null]);
  assert.deepEqual([res.TE.status, res.TE.actual], ['pending', null], 'a played row with a missing stat');
  const r = await f.read(LUKE, at(now + 3 * DAY));
  assert.deepEqual([slotOf(r, 'WR').mine.points, slotOf(r, 'TE').mine.points, slotOf(r, 'TE').result], [7, null, { status: 'pending', actual: null }]);
  assert.deepEqual(await f.finalize(at(now + 7 * DAY)), { status: 'waiting_on_stats' }, 'the missing stat blocks FINAL');
});

test('void: no snap, a team change or a game moved out of the week voids a slot for everyone; a later kickoff moves the lock; a slate changes only kickoff and void', { skip }, async t => {
  const f = await fixture(t), { now, at } = f; await f.publish();
  const kick = slate(now).slots.map(s => s.kickoff);
  await f.save(LUKE, 'QB', 18, true); await f.save(LUKE, 'WR', 12, true); await f.save(TROY, 'TE', 5, true); await f.save(TROY, 'RB', 7);
  // KC-LV (RB) is missing from the schedule (cancelled); MIA-NE (FLEX) moved to week 9; SEA-DEN (QB) moved an hour later.
  const games = { 'SEA-DEN': { week: 8, kickoff: at(now + 3 * HOUR) }, 'BUF-NYJ': { week: 8, kickoff: kick[2] }, 'DAL-PHI': { week: 8, kickoff: kick[3] },
    'MIA-NE': { week: 9, kickoff: at(now + 8 * DAY) } };
  for (const bad of [null, [], { ...games, 'SEA-DEN': { week: '8', kickoff: kick[0] } }, { ...games, 'SEA-DEN': { week: 8, kickoff: 'soon' } }, { ...games, 'SEA-DEN': { week: 8 } }]) {
    await assert.rejects(() => f.schedule(bad, at(now)), code('GTL_POINTS_INVALID'), JSON.stringify(bad));
  }
  assert.deepEqual(await f.schedule(games, at(now)), { changed: ['QB', 'RB', 'FLEX'] });
  const stored = (await f.db.query('select slots,audit from public.gtl_points_slates')).rows[0];
  assert.equal(new Date(stored.slots[0].kickoff).toISOString(), at(now + 3 * HOUR), 'QB kickoff moved later');
  assert.deepEqual(stored.slots.map(s => s.void), [null, 'postponed', null, null, 'postponed']);
  assert.deepEqual(stored.slots.map(s => [s.slot, s.playerId, s.team, s.gameId, s.house, s.window]),
    slate(now).slots.map(s => [s.slot, s.playerId, s.team, s.gameId, s.house, s.window]), 'slot identity never changes');
  const audit = stored.audit.slice(1);
  assert.deepEqual(audit.map(a => [a.action, a.slot]), [['schedule', 'QB'], ['schedule', 'RB'], ['schedule', 'FLEX']]);
  assert.equal(new Date(audit[0].at).toISOString(), at(now));
  assert.deepEqual([new Date(audit[0].before.kickoff).toISOString(), new Date(audit[0].after.kickoff).toISOString()], [kick[0], at(now + 3 * HOUR)]);
  assert.deepEqual([audit[1].before, audit[1].after], [{ void: null }, { void: 'postponed' }]);
  assert.deepEqual(await f.schedule(games, at(now)), { changed: [] }, 'a repeat changes nothing');
  assert.deepEqual(await f.schedule({ ...games, 'SEA-DEN': { week: 8, kickoff: at(now + 5 * HOUR) } }, at(now + 4 * HOUR)), { changed: [] }, 'a kickoff already passed never moves');
  // The lock moved with the kickoff; a void slot refuses every later save, through the function and the real-clock trigger.
  await f.save(TROY, 'QB', 15, true, randomUUID(), at(now + 2.5 * HOUR));
  await assert.rejects(() => f.save(TROY, 'RB', 8), code('GTL_POINTS_CLOSED'), 'a draft edit on a cancelled game');
  await assert.rejects(() => f.save(LUKE, 'FLEX', 8, true), code('GTL_POINTS_CLOSED'), 'a lock on a game moved out of the week');
  await assert.rejects(() => f.as('service_role', `insert into public.gtl_points_guesses(user_id,season,week,slot,guess) values('${LUKE}',2026,8,'FLEX',5)`), code('GTL_POINTS_CLOSED'), 'trigger: insert on a void slot');
  await assert.rejects(() => f.as('service_role', `update public.gtl_points_guesses set guess=9 where user_id='${TROY}' and slot='RB'`), code('GTL_POINTS_CLOSED'), 'trigger: draft update on a void slot');
  await f.load(f.payload({ actuals: { QB: 14.6, TE: { points: 9, team: 'NYG' } }, played: { WR: false } }));
  const res = await f.results();
  assert.deepEqual(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, [v.status, v.void_reason]])),
    { QB: ['scored', null], RB: ['void', 'postponed'], WR: ['void', 'inactive'], TE: ['void', 'team_change'], FLEX: ['void', 'postponed'] });
  const r = await f.read(LUKE, at(now + 3 * DAY));
  assert.deepEqual([r.weekBoard.max, r.slots.map(s => s.void)], [10, [null, 'postponed', 'inactive', 'team_change', 'postponed']]);
  assert.deepEqual([slotOf(r, 'WR').mine.points, slotOf(r, 'WR').result], [null, { status: 'void', actual: null }], 'no one scores a void slot');
  assert.deepEqual(slotOf(r, 'TE').others, [{ userId: TROY, guess: 5, points: null }]);
  assert.deepEqual([row(r.weekBoard.standings, LUKE), row(r.weekBoard.standings, TROY)], [{ userId: LUKE, points: 6.6, slotsScored: 1 }, { userId: TROY, points: 9.6, slotsScored: 1 }]);
  // gtl_points_update_schedule is the only legitimate writer: any other change to a published slate is refused.
  const edits = {
    'a slot house': `update public.gtl_points_slates set slots=jsonb_set(slots,'{0,house}','99')`,
    'a slot player': `update public.gtl_points_slates set slots=jsonb_set(slots,'{2,playerId}','"00-0000077"')`,
    'a slot window': `update public.gtl_points_slates set slots=jsonb_set(slots,'{2,window}','"Sun late"')`,
    'slot order': 'update public.gtl_points_slates set slots=(select jsonb_agg(x order by n desc) from jsonb_array_elements(slots) with ordinality t(x,n))',
    'a dropped void key': `update public.gtl_points_slates set slots=jsonb_set(slots,'{0}',(slots->0)-'void')`,
    'a kickoff that is not a time': `update public.gtl_points_slates set slots=jsonb_set(slots,'{2,kickoff}','"soon"')`,
    'an audit rewrite': `update public.gtl_points_slates set audit='[]'`,
    'an audit edit': `update public.gtl_points_slates set audit=jsonb_set(audit,'{0,action}','"swapped"')`,
  };
  for (const [name, sql] of Object.entries(edits)) await assert.rejects(() => f.as('service_role', sql), code('GTL_POINTS_INVALID'), name);
  for (const sql of [`update public.gtl_points_slates set finalize_at=finalize_at+interval '1 day'`, `update public.gtl_points_slates set provenance=provenance||'{"seed":"x"}'`]) {
    await assert.rejects(() => f.db.query(sql), code('GTL_POINTS_INVALID'), sql);
  }
  await f.as('service_role', `update public.gtl_points_slates set audit=audit||'[{"action":"note"}]'`);
  assert.equal((await f.db.query('select jsonb_array_length(audit) n from public.gtl_points_slates')).rows[0].n, 5, 'appending to the audit is allowed');
});

test('pending: no stats and no played flag stays pending until the commissioner rules on it after kickoff', { skip }, async t => {
  const f = await fixture(t), { now, at } = f; await f.publish();
  await f.save(LUKE, 'QB', 18, true); await f.save(LUKE, 'WR', 12, true); await f.save(LUKE, 'FLEX', 4, true);
  await f.load(f.payload({ actuals: { QB: 14.6, RB: 0, TE: 5.2 } }));
  const res = await f.results();
  assert.deepEqual([res.WR.status, res.FLEX.status], ['pending', 'pending']);
  let r = await f.read(LUKE, at(now + 3 * DAY));
  assert.deepEqual([slotOf(r, 'WR').result, slotOf(r, 'WR').mine.points], [{ status: 'pending', actual: null }, null]);
  assert.deepEqual(r.weekBoard.standings, [{ userId: LUKE, points: 6.6, slotsScored: 1 }], 'a pending slot adds nothing');
  assert.deepEqual(await f.finalize(at(now + 7 * DAY)), { status: 'waiting_on_stats' });
  assert.equal(await f.count('gtl_points_week_final'), 0);
  assert.equal(await f.call('gtl_points_is_admin', { p_user: SEAN }), true); assert.equal(await f.call('gtl_points_is_admin', { p_user: LUKE }), false);
  await assert.rejects(() => f.rule(LUKE, 'WR', 'void', 'Inactive per team report', at(now + 3 * DAY)), code('GTL_POINTS_FORBIDDEN'));
  await assert.rejects(() => f.rule(SEAN, 'WR', 'void', 'Inactive per team report', at(now + HOUR)), code('GTL_POINTS_INVALID'), 'no ruling before the game');
  for (const [slot, ruling, reason] of [['XX', 'void', 'x'], ['WR', 'maybe', 'x'], ['WR', 'void', ''], ['WR', 'void', 'x'.repeat(201)], ['WR', 'void', 'a\u0007b']]) {
    await assert.rejects(() => f.rule(SEAN, slot, ruling, reason, at(now + 3 * DAY)), code('GTL_POINTS_INVALID'), `${slot} ${ruling} ${reason.length}`);
  }
  await assert.rejects(() => f.rule(SEAN, 'WR', 'void', 'x', at(now + 3 * DAY), 9), code('GTL_POINTS_NO_SLATE'));
  assert.equal(await f.count('gtl_points_rulings'), 0, 'refused rulings store nothing');
  const voided = await f.rule(SEAN, 'WR', 'void', 'Inactive per team report', at(now + 3 * DAY));
  assert.deepEqual([voided.slot, voided.status, voided.actual, voided.voidReason], ['WR', 'void', null, 'ruled']);
  const played = await f.rule(SEAN, 'FLEX', 'played', 'Played special teams only', at(now + 3 * DAY));
  assert.deepEqual([played.slot, played.status, played.actual, played.voidReason], ['FLEX', 'scored', 0, null]);
  assert.deepEqual((await f.db.query('select slot,ruling,reason,ruled_by from public.gtl_points_rulings order by id')).rows,
    [{ slot: 'WR', ruling: 'void', reason: 'Inactive per team report', ruled_by: SEAN }, { slot: 'FLEX', ruling: 'played', reason: 'Played special teams only', ruled_by: SEAN }]);
  r = await f.read(LUKE, at(now + 3 * DAY));
  assert.deepEqual([r.weekBoard.max, r.weekBoard.mine, slotOf(r, 'WR').void, slotOf(r, 'FLEX').mine.points], [40, 12.6, 'ruled', 6]);
  assert.deepEqual(await f.finalize(at(now + 7 * DAY)), { status: 'final' });
});

test('re-grade: a corrected actual re-scores with one audit row; the identical payload replays and writes nothing', { skip }, async t => {
  const f = await fixture(t), { now, at } = f; await f.publish();
  await f.save(LUKE, 'QB', 18, true);
  const first = await f.load(f.payload({ sha: 'a', actuals: { QB: 14.6 } }));
  assert.equal(slotOf(await f.read(LUKE, at(now + 3 * DAY)), 'QB').mine.points, 6.6);
  const second = await f.load(f.payload({ sha: 'b', actuals: { QB: 16.6 } }));
  assert.deepEqual([second.status, second.regraded], ['saved', ['QB']]); assert.notEqual(second.loadId, first.loadId);
  const audit = (await f.db.query('select slot,season,week,before,after from public.gtl_points_regrades where load_id=$1', [second.loadId])).rows;
  assert.equal(audit.length, 1);
  assert.deepEqual([audit[0].slot, audit[0].season, audit[0].week, audit[0].before.status, audit[0].before.actual, audit[0].after.status, audit[0].after.actual],
    ['QB', 2026, 8, 'scored', 14.6, 'scored', 16.6]);
  assert.equal(slotOf(await f.read(LUKE, at(now + 3 * DAY)), 'QB').mine.points, 8.6);
  const counts = () => Promise.all(['gtl_points_actual_loads', 'gtl_points_actuals', 'gtl_points_regrades'].map(table => f.count(table)));
  const was = await counts();
  assert.deepEqual(was, [2, 4, 2]);
  assert.deepEqual(await f.load(f.payload({ sha: 'b', actuals: { QB: 16.6 } })), { status: 'replay', loadId: second.loadId, regraded: [] });
  assert.deepEqual(await counts(), was, 'a replay writes nothing');
});

test('flagged and refused loads: a review disagreement is stored but results keep the last saved load; a malformed payload stores nothing', { skip }, async t => {
  const f = await fixture(t); await f.publish();
  await f.save(LUKE, 'QB', 18, true);
  await f.load(f.payload({ actuals: { QB: 14.6 } }));
  const flagged = await f.load(f.payload({ sha: 'b', actuals: { QB: 20 }, review: { checked: true, agrees: false } }));
  assert.deepEqual([flagged.status, flagged.regraded], ['flagged', []]); assert.match(flagged.loadId, UUID);
  assert.equal((await f.results()).QB.actual, 14.6, 'results still use the saved load');
  assert.equal(await f.count('gtl_points_regrades'), 1, 'only the first grading');
  const agreed = await f.load(f.payload({ sha: 'c', actuals: { QB: 16.6 }, review: { checked: true, agrees: true } }));
  assert.deepEqual([agreed.status, (await f.results()).QB.actual], ['saved', 16.6]);
  const bad = edit => { const p = f.payload({ sha: 'd', actuals: { QB: 14.6 } }); edit(p); return p; };
  const cases = {
    'rules version': bad(p => { p.rulesVersion = 'points-2'; }),
    'stats checksum': bad(p => { p.sources.stats.sha256 = 'zz'; }),
    'no stats source': bad(p => { delete p.sources.stats; }),
    'snaps checksum': bad(p => { p.sources.snaps = { sha256: 'x' }; }),
    'players not a list': bad(p => { p.players = {}; }),
    'too many players': bad(p => { p.players = Array.from({ length: 5001 }, (_, i) => ({ ...p.players[0], playerId: `00-${String(i).padStart(7, '0')}` })); }),
    'duplicate player': bad(p => { p.players.push({ ...p.players[0] }); }),
    'bad player id': bad(p => { p.players[0].playerId = 'x'; }),
    'bad game id': bad(p => { p.players[0].gameId = 'sea-den'; }),
    'bad position': bad(p => { p.players[0].position = 'DST'; }),
    'points in hundredths': bad(p => { p.players[0].points = 14.65; }),
    'points as text': bad(p => { p.players[0].points = '14.6'; }),
    'missing points': bad(p => { delete p.players[0].points; }),
    'stats not an object': bad(p => { p.players[0].stats = []; }),
    'played not a boolean': bad(p => { p.played['00-0000001'] = 'yes'; }),
    'review without checked': bad(p => { p.review = { agrees: null }; }),
    'review agrees as text': bad(p => { p.review = { checked: true, agrees: 'no' }; }),
    'another week': bad(p => { p.week = 9; }),
  };
  for (const [name, body] of Object.entries(cases)) await assert.rejects(() => f.load(body, 8), code('GTL_POINTS_INVALID'), name);
  assert.equal(await f.count('gtl_points_actual_loads'), 3, 'nothing stored by a refused load');
  await assert.rejects(() => f.load(f.payload({ week: 9, sha: 'e', actuals: { QB: 1 } })), code('GTL_POINTS_NO_SLATE'));
});

test('FINAL: finalize waits for its time and every result, freezes once, and later loads, rulings and schedules change nothing', { skip }, async t => {
  const f = await fixture(t), { now, at } = f; await f.publish();
  const kick = slate(now).slots.map(s => s.kickoff);
  assert.deepEqual(await f.finalize(at(now), 9), { status: 'no_slate' });
  await f.save(LUKE, 'QB', 18, true); await f.save(LUKE, 'RB', 9, true); await f.save(TROY, 'WR', 30, true);
  const first = await f.load(f.payload({ actuals: { QB: 14.6, RB: 0, WR: 10.2, TE: 5.2, FLEX: 7 } }));
  const state = await f.call('gtl_points_jobs_state', { p_season: 2026, p_now: at(now + 5 * DAY) });
  assert.deepEqual([state.published, state.unfinal.length, state.unfinal[0].week], [[8], 1, 8]);
  assert.deepEqual([new Date(state.unfinal[0].finalizeAt).toISOString(), new Date(state.unfinal[0].firstKickoff).toISOString()], [at(now + 6 * DAY), kick[0]]);
  assert.deepEqual(await f.finalize(at(now + 6 * DAY - 1000)), { status: 'not_due' });
  assert.deepEqual(await f.finalize(at(now + 6 * DAY)), { status: 'final' });
  const frozen = (await f.db.query('select load_id,finalized_at,results from public.gtl_points_week_final')).rows;
  assert.equal(frozen.length, 1); assert.equal(frozen[0].load_id, first.loadId);
  assert.equal(new Date(frozen[0].finalized_at).toISOString(), at(now + 6 * DAY));
  const { results } = frozen[0];
  assert.deepEqual(results.slots.map(s => [s.slot, s.playerId, new Date(s.kickoff).toISOString(), s.status, s.actual, s.voidReason, s.house]), [
    ['QB', '00-0000001', kick[0], 'scored', 14.6, null, 10], ['RB', '00-0000002', kick[1], 'scored', 0, null, 11], ['WR', '00-0000003', kick[2], 'scored', 10.2, null, 12],
    ['TE', '00-0000004', kick[3], 'scored', 5.2, null, 13], ['FLEX', '00-0000005', kick[4], 'scored', 7, null, 14]]);
  assert.deepEqual(results.members, [
    { userId: LUKE, points: 7.6, slots: { QB: 6.6, RB: 1, WR: null, TE: null, FLEX: null } },
    { userId: TROY, points: 0, slots: { QB: null, RB: null, WR: 0, TE: null, FLEX: null } }]);
  assert.deepEqual([results.house, results.max], [18.8, 50]);
  assert.deepEqual((await f.call('gtl_points_jobs_state', { p_season: 2026, p_now: at(now + 7 * DAY) })).unfinal, []);
  const late = await f.load(f.payload({ sha: 'b', actuals: { QB: 20, RB: 0, WR: 10.2, TE: 5.2, FLEX: 7 } }));
  assert.deepEqual([late.status, late.regraded], ['after_final', []]);
  assert.equal(await f.count('gtl_points_actual_loads'), 2, 'a correction after FINAL is recorded');
  assert.equal((await f.results()).QB.actual, 14.6, 'and changes nothing');
  assert.deepEqual(await f.finalize(at(now + 7 * DAY)), { status: 'replay' });
  assert.equal(await f.count('gtl_points_week_final'), 1);
  await assert.rejects(() => f.rule(SEAN, 'QB', 'void', 'Late ruling', at(now + 7 * DAY)), code('GTL_POINTS_FINAL'));
  assert.deepEqual(await f.schedule({}, at(now + 7 * DAY)), { changed: [] }, 'a FINAL week never changes its schedule');
  assert.deepEqual((await f.db.query('select slots from public.gtl_points_slates')).rows[0].slots.map(s => s.void), [null, null, null, null, null]);
  const r = await f.read(LUKE, at(now + 7 * DAY));
  assert.deepEqual([r.status, slotOf(r, 'QB').result.actual, slotOf(r, 'QB').mine.points, r.weekBoard.mine, r.weekBoard.house], ['final', 14.6, 6.6, 7.6, 18.8]);
});

test('gate in the read: another member\'s guess, points and the House show only after the viewer locks that slot or at its kickoff', { skip }, async t => {
  const f = await fixture(t), { now, at } = f; await f.publish();
  await f.save(LUKE, 'QB', 57, true); await f.save(LUKE, 'RB', 33, true); await f.save(TROY, 'WR', 44);
  // Results loaded early (a fixture only; real stats follow the game) must not leak luke's points through the boards either.
  await f.load(f.payload({ actuals: { QB: 50, RB: 11 } }));
  const before = await f.read(TROY, at(now + HOUR));
  const qb = slotOf(before, 'QB');
  assert.deepEqual([qb.revealed, qb.others, qb.house, qb.lockedBy], [false, null, { visible: false }, [LUKE]]);
  assert.deepEqual([row(before.weekBoard.standings, LUKE), before.weekBoard.house], [{ userId: LUKE, points: 0, slotsScored: 0 }, 0]);
  assert.doesNotMatch(withoutTimes(before), /57/, 'the hidden sentinel guess appears nowhere in troy\'s reply');
  assert.equal(slotOf(before, 'WR').mine.guess, 44, 'troy sees his own draft');
  assert.equal(slotOf(await f.read(LUKE, at(now + HOUR)), 'QB').mine.guess, 57, 'luke sees his own guess');
  await f.save(TROY, 'QB', 18, true);
  const after = await f.read(TROY, at(now + HOUR));
  assert.deepEqual([slotOf(after, 'QB').revealed, slotOf(after, 'QB').others, slotOf(after, 'QB').house],
    [true, [{ userId: LUKE, guess: 57, points: 3 }], { visible: true, value: 10, points: 0 }]);
  assert.deepEqual([slotOf(after, 'RB').revealed, slotOf(after, 'RB').others, slotOf(after, 'RB').house], [false, null, { visible: false }], 'another slot stays hidden');
  assert.deepEqual([row(after.weekBoard.standings, LUKE), after.weekBoard.house], [{ userId: LUKE, points: 3, slotsScored: 1 }, 0]);
  const atKickoff = await f.read(SEAN, at(now + 2 * HOUR));
  assert.deepEqual(atKickoff.slots.map(s => s.revealed), [true, true, false, false, false]);
  assert.deepEqual([slotOf(atKickoff, 'RB').others, slotOf(atKickoff, 'RB').house, atKickoff.weekBoard.house], [[{ userId: LUKE, guess: 33, points: 0 }], { visible: true, value: 11, points: 10 }, 10]);
  const later = await f.read(SEAN, at(now + 3 * DAY));
  assert(later.slots.every(s => s.revealed && s.house.visible && Array.isArray(s.others)), 'every slot shows from its kickoff');
  assert.deepEqual([slotOf(later, 'WR').others, slotOf(later, 'WR').lockedBy], [[], []], 'a draft never shows to anyone else');
});

test('boards: standings list opted-in members only, sum exact tenths, and count weeks that beat a complete House week', { skip }, async t => {
  const f = await fixture(t), { now, at } = f;
  await f.addMember(4, 'Zed Fixture');
  const week8 = slate(now); week8.slots.forEach((s, i) => { s.house = i === 0 ? 10 : 30; });
  const week9 = slate(now); week9.slots.forEach((s, i) => { s.house = i === 0 ? null : 30; });
  await f.publish({ slate: week8 }); await f.publish({ slate: week9 }, SEAN, { week: 9 });
  await f.save(LUKE, 'QB', 18, true); await f.save(LUKE, 'WR', 12, true);   // 6.6 + 8.2
  await f.save(TROY, 'TE', 0, true); await f.save(TROY, 'FLEX', 7, true);   // 4.8 + 10
  await f.save(SEAN, 'QB', 0, true);                                         // 0
  await f.save(LUKE, 'QB', 18, true, randomUUID(), at(Date.now()), 9);       // week 9: 6.6
  const actuals = { QB: 14.6, RB: 0, WR: 10.2, TE: 5.2, FLEX: 7 };
  await f.load(f.payload({ actuals })); await f.load(f.payload({ week: 9, actuals }));
  const r = await f.read(LUKE, at(now + 3 * DAY));
  assert.deepEqual(r.members.map(m => m.id).sort(), [LUKE, TROY, SEAN, ZED].sort());
  assert.deepEqual(r.weekBoard.standings.map(s => s.userId).sort(), [LUKE, TROY, SEAN].sort(), 'zed never locked in');
  assert.deepEqual([row(r.weekBoard.standings, LUKE), row(r.weekBoard.standings, TROY), row(r.weekBoard.standings, SEAN)],
    [{ userId: LUKE, points: 14.8, slotsScored: 2 }, { userId: TROY, points: 14.8, slotsScored: 2 }, { userId: SEAN, points: 0, slotsScored: 1 }]);
  assert.equal(row(r.weekBoard.standings, LUKE).points, row(r.weekBoard.standings, TROY).points, 'exact tenths: 6.6 + 8.2 equals 4.8 + 10');
  assert.equal(r.weekBoard.house, 5.4);
  assert.deepEqual(r.seasonBoard.standings.map(s => s.userId).sort(), [LUKE, TROY, SEAN].sort());
  assert.deepEqual([row(r.seasonBoard.standings, LUKE), row(r.seasonBoard.standings, TROY), row(r.seasonBoard.standings, SEAN)], [
    { userId: LUKE, points: 21.4, weeksPlayed: 2, beatHouse: 1 }, { userId: TROY, points: 14.8, weeksPlayed: 1, beatHouse: 1 }, { userId: SEAN, points: 0, weeksPlayed: 1, beatHouse: 0 }],
    'week 9 has no complete House week, so it never counts');
  assert.equal(r.seasonBoard.house, 5.4);
  const week9Read = await f.read(TROY, at(now + 3 * DAY), { season: null, week: null });
  assert.deepEqual([week9Read.week, week9Read.weekBoard.house, week9Read.weekBoard.mine, row(week9Read.weekBoard.standings, LUKE).points], [9, null, null, 6.6]);
  assert.deepEqual(row(week9Read.weekBoard.standings, TROY), { userId: TROY, points: null, slotsScored: 0 }, 'a week not played is null, never 0');
});

test('league scope: a league read needs an active roster seat and lists only that roster', { skip }, async t => {
  const f = await fixture(t), { now, at } = f; await f.publish();
  await f.addMember(4, 'Zed Fixture');
  await f.save(LUKE, 'QB', 18, true); await f.save(TROY, 'QB', 20, true); await f.save(ZED, 'QB', 15, true);
  await f.db.query('update public.gtl_memberships set active=false where user_id=$1', [TROY]);
  const league = { league: 'sean-troy-luke' }, later = at(now + 3 * DAY);
  for (const user of [ZED, TROY]) await assert.rejects(() => f.read(user, later, league), code('GTL_POINTS_MEMBER'), user);
  await assert.rejects(() => f.read(LUKE, later, { league: 'no-such-league' }), code('GTL_POINTS_MEMBER'));
  await assert.rejects(() => f.read(randomUUID(), later), code('GTL_POINTS_MEMBER'), 'not a community member');
  for (const bad of [{ season: 2026, week: null }, { season: null, week: 8 }]) await assert.rejects(() => f.read(LUKE, later, bad), code('GTL_POINTS_INVALID'));
  const scoped = await f.read(LUKE, later, league);
  assert.equal(scoped.leagueId, 'sean-troy-luke');
  assert.deepEqual(scoped.members.map(m => m.id).sort(), [LUKE, SEAN].sort());
  assert.equal(scoped.members.find(m => m.id === SEAN).displayName, 'Sean Fixture');
  assert.deepEqual([scoped.weekBoard.standings.map(s => s.userId), scoped.seasonBoard.standings.map(s => s.userId)], [[LUKE], [LUKE]]);
  assert.deepEqual([slotOf(scoped, 'QB').lockedBy, slotOf(scoped, 'QB').others], [[LUKE], []]);
  const community = await f.read(LUKE, later);
  assert.deepEqual(community.members.map(m => m.id).sort(), [LUKE, TROY, SEAN, ZED].sort());
  assert.deepEqual(community.weekBoard.standings.map(s => s.userId).sort(), [LUKE, TROY, ZED].sort());
  assert.deepEqual([slotOf(community, 'QB').lockedBy, slotOf(community, 'QB').others.map(o => o.userId)], [[LUKE, TROY, ZED], [TROY, ZED]]);
  assert.equal((await f.read(ZED, later)).optedIn, true);
});
