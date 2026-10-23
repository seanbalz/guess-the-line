import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ALL, HOSTED, MIGRATIONS_DIR, NOT_HOSTED, PRELUDE, ROLLBACK_DIR, migrationSql, version } from './migrations.mjs';
import { catalog, parseFunctions, readMigrations, topLevel } from '../scripts/migration-functions.mjs';
import { finalizeAt as jsFinalizeAt, slotPoints } from '../shared/points-scoring.mjs';
import { kickoffWindow } from '../shared/points-slate.mjs';

// P-01 (D-56 Guess the Points; spec sections 4.1, 4.2, 7 and the section 9 Locks, Gate, Scoring, Boards and actuals
// loader contracts) on local PGlite only; it never connects to the hosted project. The migration is written and not
// applied, so this suite runs on ALL. Fixture accounts, players and values only (no real player picks).
// Optional disposable PostgreSQL runtime.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';

const MIGRATION = '20261023180000_gtl_points_core.sql';
const TABLES = ['gtl_points_slates', 'gtl_points_guesses', 'gtl_points_guess_events', 'gtl_points_actual_loads', 'gtl_points_actuals', 'gtl_points_week_final'];
const HOUR = 3_600_000, DAY = 24 * HOUR, SEASON = 2026;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USERS = { sean: id(30), troy: id(1), luke: id(2), dana: id(3), gone: id(4) };
const NAMES = { sean: 'Sean Fixture', troy: 'Troy Fixture', luke: 'Luke Fixture', dana: 'Dana Fixture', gone: 'Gone Fixture' };
const iso = ms => new Date(ms).toISOString();
const RULES = { format: 'ppr', passingTds: 4, version: 'ppr4-v1' };
const PROVENANCE = { snapshotSeason: 2026, snapshotWeek: 7, checksum: 'f'.repeat(64), selectionVersion: 'points-slate-v1', seed: 'fixture' };
const SHA = c => c.repeat(64);

/** Five fixture slots in slot order; kickoffs a day apart so they always span several windows. */
function slotsAt(first, prefix) {
  return ['QB', 'RB', 'WR', 'TE', 'FLEX'].map((slot, i) => ({ slot, playerId: `${prefix}-${i + 1}`, name: `${prefix} ${slot} Fixture`,
    team: ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'][i], position: slot === 'FLEX' ? 'WR' : slot, gameKey: `${prefix}G${i + 1}`, kickoff: iso(first + i * DAY) }));
}

async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  for (const file of ALL) await db.exec(migrationSql(file));
  const state = league => ({ version: '1', league: { id: league, name: 'Fixture group' }, games: [], ballots: {}, audit: [] });
  await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state('sean-troy-luke')]);
  for (const [who, uid] of Object.entries(USERS)) {
    await db.query('insert into auth.users values($1)', [uid]);
    await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [uid, NAMES[who]]);
  }
  await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner'),($2,'sean-troy-luke','troy','player'),($3,'sean-troy-luke','luke','player')", [USERS.sean, USERS.troy, USERS.luke]);
  await db.query('insert into public.gtl_leagues(id,state,created_by) values($1,$2,$3)', ['second-group', state('second-group'), USERS.sean]);
  const pid = uid => `u_${uid.replaceAll('-', '')}`;
  await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'second-group',$2,'commissioner'),($3,'second-group',$4,'player')", [USERS.sean, pid(USERS.sean), USERS.troy, pid(USERS.troy)]);
  await db.query('insert into public.gtl_community_removals(user_id,removed_by) values($1,$2)', [USERS.gone, USERS.sean]);
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const sql = (name, args) => as('service_role', `select public.${name}(${Object.keys(args).map((k, i) => `${k}=>$${i + 1}`).join(',')}) value`, Object.values(args)).then(r => r.rows[0].value);
  const write = (fn, who, week, slot, guess, request = randomUUID()) => sql(fn, { p_user: USERS[who], p_request: request, p_season: SEASON, p_week: week, p_slot: slot, p_guess: guess });
  const draft = (...a) => write('gtl_points_save_draft', ...a);
  const lock = (...a) => write('gtl_points_lock_in', ...a);
  const read = (who, week, { group = null, now = null } = {}) => sql('gtl_points_read', { p_viewer: USERS[who], p_season: SEASON, p_week: week, p_group: group, p_now: now });
  /** A published slate written straight into the table: the fixture for weeks already under way or played. */
  const publishedSlate = async (week, opens, slots, house) => db.query(`insert into public.gtl_points_slates(season,week,status,opens_at,finalize_at,scoring_rules,slots,house,provenance,published_at,audit)
    values($1,$2,'published',$3,public.gtl_points_finalize_at($3),$4,$5,$6,$7,$3,'[]')`, [SEASON, week, iso(opens), RULES, JSON.stringify(slots), house, PROVENANCE]);
  /** Locked guesses for a week already played, written with triggers off (history fixture only). */
  const pastGuesses = async (week, rows) => db.transaction(async tx => {
    await tx.exec('set local session_replication_role = replica');
    for (const [who, slot, guess, locked] of rows) await tx.query('insert into public.gtl_points_guesses(user_id,season,week,slot,guess,locked_at) values($1,$2,$3,$4,$5,$6)', [USERS[who], SEASON, week, slot, guess, locked ? iso(Date.now() - 16 * DAY) : null]);
  });
  const count = async (table, where = 'true', args = []) => (await db.query(`select count(*)::int n from public.${table} where ${where}`, args)).rows[0].n;
  return { db, as, sql, draft, lock, read, publishedSlate, pastGuesses, count };
}

test('P-01 is a new, unapplied migration: six tables and only new functions; nothing dropped, deleted or replaced', () => {
  assert.ok(ALL.includes(MIGRATION));
  assert.ok(NOT_HOSTED.includes(version(MIGRATION)), 'not applied: it waits for Sean\'s "apply P-01"');
  assert.ok(!HOSTED.includes(MIGRATION));
  const source = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  const defined = parseFunctions(source, MIGRATION);
  const before = catalog(readMigrations(ALL.filter(file => file < MIGRATION))).latest;
  assert.ok(defined.length >= 15);
  for (const fn of defined) {
    assert.match(fn.name, /^gtl_points_/);
    assert.equal(before.has(`${fn.schema}.${fn.name}`), false, `${fn.name} is new, so no header and no rollback file`);
  }
  assert.equal(fs.existsSync(path.join(ROLLBACK_DIR, MIGRATION)), false);
  for (const table of TABLES) assert.match(source, new RegExp(`alter table public\\.${table} enable row level security`));
  const top = topLevel(source);
  assert.doesNotMatch(top, /\b(drop|truncate)\b/i);
  assert.doesNotMatch(top.replace(/on delete cascade/gi, '').replace(/before update or delete/gi, ''), /\bdelete\b/i, 'additive only (D-23)');
  assert.doesNotMatch(top, /\bto\s+(anon|authenticated)\b/i, 'browsers get no grant');
  assert.doesNotMatch(top, /\b(gtl_weekly_ballots|gtl_feed_posts|gtl_push_reminders_sent)\b/, 'Spread/Total and the P-02 CHECKs are untouched');
});

test('P-01 on PGlite: RLS, grants, locks, the gate, the read, scoring, loads and FINAL', { skip }, async t => {
  const f = await fixture(t);
  const NOW = Date.now();

  await t.test('RLS is on, browsers reach no table or function, functions are invoker with a fixed search path, nothing is deletable', async () => {
    for (const table of TABLES) {
      assert.equal((await f.db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true, table);
      for (const role of ['anon', 'authenticated']) {
        await assert.rejects(() => f.as(role, `select * from public.${table}`), /permission denied/, `${role} ${table}`);
        await assert.rejects(() => f.as(role, `insert into public.${table}(season) values(2026)`), /permission denied/);
      }
      await assert.rejects(() => f.as('service_role', `delete from public.${table}`), /permission denied/, `service_role cannot delete ${table}`);
    }
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(() => f.as(role, 'select public.gtl_points_read($1,2026,8,null,null)', [USERS.troy]), /permission denied/);
      await assert.rejects(() => f.as(role, "select public.gtl_points_lock_in($1,$2,2026,8,'QB',10)", [USERS.troy, randomUUID()]), /permission denied/);
      await assert.rejects(() => f.as(role, "select public.gtl_points_load_actuals('{}')"), /permission denied/);
    }
    const flags = (await f.db.query("select proname,prosecdef,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'gtl_points_%'")).rows;
    assert.ok(flags.length >= 15);
    for (const fn of flags) assert.deepEqual([fn.prosecdef, fn.proconfig], [false, ['search_path=""']], fn.proname);
    const browser = (await f.db.query("select count(*)::int n from information_schema.role_routine_grants where routine_name like 'gtl_points_%' and grantee in ('anon','authenticated','PUBLIC')")).rows[0].n;
    assert.equal(browser, 0);
  });

  await t.test('SQL helpers match the shared modules: slot points, kickoff windows and the FINAL time', async () => {
    for (const [g, a] of [[18, 14.6], [14, 14], [0, 30.2], [20, 10.1], [3, -1.2], [10, 14.65]]) {
      const value = (await f.db.query('select public.gtl_points_slot_points($1,$2)::float8 v', [g, a])).rows[0].v;
      assert.equal(value, slotPoints(g, a), `${g} vs ${a}`);
    }
    for (const kickoff of ['2026-10-30T00:15:00Z', '2026-11-01T14:30:00Z', '2026-11-01T18:00:00Z', '2026-11-01T21:05:00Z', '2026-11-02T01:20:00Z', '2026-11-03T01:15:00Z', '2026-11-26T17:30:00Z', '2026-12-26T21:30:00Z']) {
      assert.equal((await f.db.query('select public.gtl_points_kickoff_window($1) w', [kickoff])).rows[0].w, kickoffWindow(kickoff), kickoff);
    }
    for (const opens of ['2026-10-20T19:00:00Z', '2026-10-27T19:00:00Z', '2026-10-29T19:00:00Z', '2026-12-29T20:00:00Z']) {
      assert.equal((await f.db.query('select public.gtl_points_finalize_at($1) a', [opens])).rows[0].a.toISOString(), jsFinalizeAt(opens), opens);
    }
  });

  // Week 8: drafted by the scheduler, swapped by the commissioner, published early. Kickoffs from two hours ahead.
  const W8 = slotsAt(NOW + 2 * HOUR, 'W8');
  const HOUSE8 = { QB: 19.2, RB: 23.7, WR: 15.1, TE: 9.4, FLEX: 12.2 };
  await t.test('slate publisher: scheduler drafts, commissioner swaps (audited) and publishes early; a published slate is fixed', async () => {
    const draftSlate = { opensAt: iso(NOW + 30 * 60_000), scoringRules: RULES, slots: W8, house: HOUSE8, provenance: PROVENANCE };
    const drafted = await f.sql('gtl_points_publish_slate', { p_actor: null, p_action: 'draft', p_season: SEASON, p_week: 8, p_slate: draftSlate });
    assert.equal(drafted.status, 'draft');
    assert.equal(drafted.finalizeAt.slice(0, 19), jsFinalizeAt(draftSlate.opensAt).slice(0, 19));
    await assert.rejects(() => f.sql('gtl_points_publish_slate', { p_actor: USERS.troy, p_action: 'preview', p_season: SEASON, p_week: 8, p_slate: null }), /GTL_POINTS_FORBIDDEN/);
    await assert.rejects(() => f.sql('gtl_points_publish_slate', { p_actor: null, p_action: 'swap', p_season: SEASON, p_week: 8, p_slate: {} }), /GTL_POINTS_FORBIDDEN/, 'only the commissioner swaps');
    await assert.rejects(() => f.sql('gtl_points_publish_slate', { p_actor: null, p_action: 'publish', p_season: SEASON, p_week: 8, p_slate: null }), /GTL_POINTS_NOT_OPEN/, 'the scheduler waits for the open');
    // A draft with two slots in one game, or one kickoff window, is refused.
    for (const slots of [W8.map((s, i) => i === 1 ? { ...s, gameKey: W8[0].gameKey } : s), W8.map(s => ({ ...s, kickoff: W8[0].kickoff }))]) {
      await assert.rejects(() => f.sql('gtl_points_publish_slate', { p_actor: null, p_action: 'draft', p_season: SEASON, p_week: 8, p_slate: { ...draftSlate, slots } }), /GTL_POINTS_SLATE_INVALID/);
    }
    // Swap the TE before the open: same position only, constraints still hold, and the swap is audited.
    const te = { playerId: 'W8-9', name: 'W8 TE Swap Fixture', team: 'FFF', position: 'TE', gameKey: 'W8G9', kickoff: W8[3].kickoff };
    await assert.rejects(() => f.sql('gtl_points_publish_slate', { p_actor: USERS.sean, p_action: 'swap', p_season: SEASON, p_week: 8, p_slate: { slot: 'TE', player: { ...te, position: 'WR' } } }), /GTL_POINTS_SLATE_INVALID/);
    await assert.rejects(() => f.sql('gtl_points_publish_slate', { p_actor: USERS.sean, p_action: 'swap', p_season: SEASON, p_week: 8, p_slate: { slot: 'TE', player: { ...te, gameKey: W8[0].gameKey } } }), /GTL_POINTS_SLATE_INVALID/);
    const swapped = await f.sql('gtl_points_publish_slate', { p_actor: USERS.sean, p_action: 'swap', p_season: SEASON, p_week: 8, p_slate: { slot: 'TE', player: te, house: 9.4 } });
    assert.equal(swapped.slots[3].playerId, 'W8-9');
    assert.deepEqual(swapped.audit.map(e => e.action), ['draft', 'swap']);
    assert.deepEqual([swapped.audit[1].from, swapped.audit[1].to, swapped.audit[1].by], ['W8-4', 'W8-9', USERS.sean]);
    W8[3] = { slot: 'TE', ...te };
    const published = await f.sql('gtl_points_publish_slate', { p_actor: USERS.sean, p_action: 'publish', p_season: SEASON, p_week: 8, p_slate: null });
    assert.equal(published.status, 'published');
    assert.ok(Date.parse(published.opensAt) <= Date.now(), 'an early publish opens the week now');
    assert.equal(published.finalizeAt, drafted.finalizeAt, 'FINAL time stays on the scheduled week');
    assert.deepEqual(published.audit.map(e => e.action), ['draft', 'swap', 'publish']);
    assert.equal((await f.sql('gtl_points_publish_slate', { p_actor: null, p_action: 'publish', p_season: SEASON, p_week: 8, p_slate: null })).replayed, true);
    await assert.rejects(() => f.sql('gtl_points_publish_slate', { p_actor: USERS.sean, p_action: 'swap', p_season: SEASON, p_week: 8, p_slate: { slot: 'TE', player: te } }), /GTL_POINTS_SLATE_FIXED/);
    await assert.rejects(() => f.sql('gtl_points_publish_slate', { p_actor: null, p_action: 'draft', p_season: SEASON, p_week: 8, p_slate: draftSlate }), /GTL_POINTS_SLATE_FIXED/);
    await assert.rejects(() => f.as('service_role', "update public.gtl_points_slates set house='{}' where season=2026 and week=8"), /GTL_POINTS_SLATE_FIXED/);
    await assert.rejects(() => f.db.query("update public.gtl_points_slates set audit='[]' where season=2026 and week=8"), /GTL_POINTS_SLATE_FIXED/, 'the audit only grows');
    // A slate whose first game has kicked off can no longer be published: "No Points this week".
    const late = { ...draftSlate, opensAt: iso(NOW - DAY), slots: slotsAt(NOW - HOUR, 'W10') };
    await f.sql('gtl_points_publish_slate', { p_actor: null, p_action: 'draft', p_season: SEASON, p_week: 10, p_slate: late });
    await assert.rejects(() => f.sql('gtl_points_publish_slate', { p_actor: null, p_action: 'publish', p_season: SEASON, p_week: 10, p_slate: null }), /GTL_POINTS_TOO_LATE/);
  });

  // Week 9: open since yesterday; the QB game kicked off an hour ago.
  const W9 = slotsAt(NOW - HOUR, 'W9');
  await t.test('locks: drafts change freely, lock-in is final for every writer, writes after kickoff are refused, a duplicate request replays', async () => {
    await f.publishedSlate(9, NOW - DAY, W9, { QB: 20, RB: 10, WR: 10, TE: 8, FLEX: 10 });
    await assert.rejects(() => f.draft('troy', 10, 'RB', 10), /GTL_POINTS_NOT_OPEN/, 'a draft slate is not open');
    const first = await f.draft('troy', 9, 'RB', 12);
    assert.deepEqual([first.guess, first.locked, first.replayed], [12, false, false]);
    assert.equal((await f.draft('troy', 9, 'RB', 14)).guess, 14, 'a draft changes freely');
    const request = randomUUID();
    const locked = await f.lock('troy', 9, 'RB', 15, request);
    assert.deepEqual([locked.guess, locked.locked], [15, true]);
    const replay = await f.lock('troy', 9, 'RB', 15, request);
    assert.deepEqual({ ...replay, replayed: false }, locked, 'the duplicate request replays its receipt');
    assert.equal(replay.replayed, true);
    await assert.rejects(() => f.lock('troy', 9, 'RB', 16, request), /GTL_POINTS_RETRY_CONFLICT/);
    await assert.rejects(() => f.lock('troy', 9, 'RB', 16), /GTL_POINTS_LOCKED/);
    await assert.rejects(() => f.draft('troy', 9, 'RB', 16), /GTL_POINTS_LOCKED/);
    await assert.rejects(() => f.as('service_role', "update public.gtl_points_guesses set guess=1 where user_id=$1 and week=9 and slot='RB'", [USERS.troy]), /GTL_POINTS_LOCKED/);
    await assert.rejects(() => f.db.query("update public.gtl_points_guesses set locked_at=null where user_id=$1 and week=9 and slot='RB'", [USERS.troy]), /GTL_POINTS_LOCKED/, 'even the table owner cannot unlock');
    assert.equal((await f.db.query("select guess from public.gtl_points_guesses where user_id=$1 and week=9 and slot='RB'", [USERS.troy])).rows[0].guess, 15);
    // After the QB kickoff nothing lands on the QB slot, through the writers or directly.
    await assert.rejects(() => f.draft('luke', 9, 'QB', 20), /GTL_POINTS_CLOSED/);
    await assert.rejects(() => f.lock('luke', 9, 'QB', 20), /GTL_POINTS_CLOSED/);
    await assert.rejects(() => f.as('service_role', "insert into public.gtl_points_guesses(user_id,season,week,slot,guess) values($1,2026,9,'QB',20)", [USERS.luke]), /GTL_POINTS_CLOSED/);
    // Out of range or not a whole number; not a community member.
    for (const guess of [61, -1, 12.5]) await assert.rejects(() => f.draft('luke', 9, 'WR', guess), /GTL_POINTS_INVALID/, String(guess));
    await assert.rejects(() => f.draft('luke', 9, 'K', 5), /GTL_POINTS_INVALID/);
    await assert.rejects(() => f.draft('gone', 9, 'WR', 5), /GTL_COMMUNITY_MEMBER/);
    await assert.rejects(() => f.as('service_role', "insert into public.gtl_points_guesses(user_id,season,week,slot,guess) values($1,2026,9,'WR',61)", [USERS.luke]), /check constraint/);
    // Every save is in the append-only history; the replay added none.
    assert.deepEqual((await f.db.query("select action,guess from public.gtl_points_guess_events where user_id=$1 and week=9 order by created_at", [USERS.troy])).rows.map(r => [r.action, r.guess]), [['draft', 12], ['draft', 14], ['lock', 15]]);
    await assert.rejects(() => f.db.query('update public.gtl_points_guess_events set guess=0'), /GTL_POINTS_APPEND_ONLY/);
  });

  await t.test('gate: another member\'s guess and the House stay out of the read until the viewer locks in or the slot kicks off', async () => {
    await f.lock('troy', 8, 'RB', 47);
    await f.draft('troy', 8, 'WR', 33);
    const strip = body => JSON.stringify(body).replace(/"\d{4}-\d{2}-\d{2}T[^"]*"/g, '""').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '');
    const before = await f.read('luke', 8);
    const rb = before.slots.find(s => s.slot === 'RB');
    assert.equal(rb.revealed, false);
    assert.equal(rb.house, null);
    assert.deepEqual(rb.guesses, []);
    assert.deepEqual(rb.lockedIn, [{ userId: USERS.troy, displayName: 'Troy Fixture' }], 'faces, no numbers');
    assert.equal(rb.own, null);
    assert.doesNotMatch(strip(before), /(?<![\d.])(47|23\.7|33)(?![\d])/, 'no hidden guess, House estimate or draft anywhere in the read');
    assert.equal(await f.sql('gtl_points_revealed', { p_viewer: USERS.luke, p_season: SEASON, p_week: 8, p_slot: 'RB', p_now: null }), false);
    await f.lock('luke', 8, 'RB', 30);
    const after = (await f.read('luke', 8)).slots.find(s => s.slot === 'RB');
    assert.equal(after.revealed, true);
    assert.deepEqual(after.house, { estimate: 23.7, points: null });
    assert.deepEqual(after.guesses, [{ userId: USERS.troy, displayName: 'Troy Fixture', guess: 47, points: null }]);
    assert.deepEqual([after.own.guess, after.own.locked], [30, true]);
    // Dana has not locked in: the RB opens for her at kickoff, and Troy's WR draft never shows.
    const kickoff = Date.parse(W8[1].kickoff);
    assert.equal((await f.read('dana', 8, { now: iso(kickoff - 1000) })).slots.find(s => s.slot === 'RB').revealed, false);
    const atKickoff = await f.read('dana', 8, { now: iso(Date.parse(W8[2].kickoff)) });
    const danaRb = atKickoff.slots.find(s => s.slot === 'RB');
    assert.deepEqual([danaRb.revealed, danaRb.house.estimate, danaRb.guesses.map(g => g.guess)], [true, 23.7, [30, 47]]);
    assert.deepEqual(atKickoff.slots.find(s => s.slot === 'WR').guesses, [], 'a draft is never shown, even after kickoff');
    assert.ok(atKickoff.slots.find(s => s.slot === 'WR').closed);
    // Group filter: Luke is not in second-group; Sean's view of it lists only its roster.
    await assert.rejects(() => f.read('luke', 8, { group: 'second-group' }), /GTL_POINTS_INVALID/);
    await f.lock('sean', 8, 'RB', 22);
    const group = (await f.read('sean', 8, { group: 'second-group' })).slots.find(s => s.slot === 'RB');
    assert.deepEqual(group.lockedIn.map(x => x.userId), [USERS.sean, USERS.troy]);
    assert.deepEqual(group.guesses.map(x => x.userId), [USERS.troy]);
    assert.equal((await f.read('sean', 8)).slots.find(s => s.slot === 'RB').lockedIn.length, 3);
    // Cards come in kickoff order; an unopened week returns no slots.
    assert.deepEqual(before.slots.map(s => s.slot), ['QB', 'RB', 'WR', 'TE', 'FLEX']);
    const unopened = await f.read('luke', 10);
    assert.deepEqual([unopened.status, unopened.slots], ['unopened', []]);
    // Before any actual: nothing is scored and every total reads null, never 0.
    assert.deepEqual([before.result.status, before.result.points, before.result.maximum], [null, null, 50]);
    assert.ok(before.standings.week.every(r => r.points === null && r.rank === null));
  });

  // Week 7: played last week; its FINAL time has passed. RB voided (no snap).
  const W7 = slotsAt(NOW - 15 * DAY, 'W7');
  const player = (slot, points, extra = {}) => ({ playerId: W7[slot].playerId, name: W7[slot].name, team: W7[slot].team, position: W7[slot].position,
    gameKey: W7[slot].gameKey, stats: { receptions: 4 }, points: { 'ppr4-v1': points, 'ppr4-v2': points + 3 }, played: true, playedBasis: 'snaps', ...extra });
  const load = (sha, players, extra = {}) => f.sql('gtl_points_load_actuals', { p_payload: { season: SEASON, week: 7,
    source: { url: 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv', release: 'stats_player', publishedAt: iso(NOW - 2 * DAY), retrievedAt: iso(NOW - DAY), sha256: sha },
    coverage: { expected: 6, received: players.length, partial: false }, players, ...extra } });
  const ROWS = { QB: 14.6, WR: 9, TE: 5.5, FLEX: 12 };
  const base = () => [player(0, ROWS.QB), player(1, 0, { played: false, playedBasis: 'no_snap' }), player(2, ROWS.WR), player(3, ROWS.TE), player(4, ROWS.FLEX),
    { playerId: 'W7-other', name: 'Other Fixture', team: 'GGG', position: 'K', gameKey: 'W7G7', stats: {}, points: { 'ppr4-v1': 7 }, played: true }];

  await t.test('scoring: loads are idempotent per checksum, re-grade PROVISIONAL weeks with an audit, void lowers the maximum, ties share the rank', async () => {
    await f.publishedSlate(7, NOW - 20 * DAY, W7, { QB: 20.4, RB: 11.5, WR: 13.2, TE: 8.8, FLEX: 10 });
    await f.pastGuesses(7, [
      ['troy', 'QB', 18, true], ['troy', 'RB', 10, true], ['troy', 'WR', 9, true], ['troy', 'TE', 6, true], ['troy', 'FLEX', 12, true],
      ['luke', 'QB', 20, true], ['luke', 'RB', 10, true], ['luke', 'WR', 9, true], ['luke', 'TE', 6, true], ['luke', 'FLEX', 12, true],
      ['dana', 'QB', 14, true], ['dana', 'WR', 30, false],
      ['sean', 'QB', 14, true],
    ]);
    const pending = await f.read('troy', 7);
    assert.deepEqual(pending.slots.map(s => s.state), ['pending', 'pending', 'pending', 'pending', 'pending']);
    assert.deepEqual(await f.sql('gtl_points_finalize', { p_season: SEASON, p_week: 7 }), { season: SEASON, week: 7, final: false, reason: 'pending_stats' });

    const failed = await f.sql('gtl_points_load_actuals', { p_payload: { season: SEASON, week: 7, status: 'failed', error: 'checksum mismatch', source: { url: 'https://example.invalid/x.csv' } } });
    assert.equal(failed.status, 'failed');
    assert.equal(await f.count('gtl_points_actuals'), 0, 'a failed load changes nothing');

    const first = await load(SHA('a'), [...base(), { playerId: 'bad id!', name: 'x' }]);
    assert.deepEqual([first.status, first.rowsTotal, first.rowsSaved, first.rowsSkipped, first.regraded, first.partial], ['saved', 7, 6, 1, true, false]);
    assert.deepEqual(await load(SHA('a'), base()), { loadId: first.loadId, status: 'saved', replayed: true }, 'idempotent per checksum');
    assert.equal(await f.count('gtl_points_actual_loads', "status='saved'"), 1);

    const week = await f.read('troy', 7);
    assert.deepEqual(week.slots.map(s => [s.slot, s.state, s.actual, s.voidReason]),
      [['QB', 'scored', 14.6, null], ['RB', 'void', null, 'no_snap'], ['WR', 'scored', 9, null], ['TE', 'scored', 5.5, null], ['FLEX', 'scored', 12, null]]);
    assert.deepEqual([week.result.status, week.result.maximum, week.result.points], ['PROVISIONAL', 40, 36.1]);
    const qb = week.slots[0];
    assert.equal(qb.own.points, 6.6);
    assert.equal(week.slots[1].own.points, null, 'a void slot scores nothing for anyone');
    assert.deepEqual(qb.house, { estimate: 20.4, points: 4.2 });
    assert.deepEqual(week.result.house, { points: 24.7, complete: true });
    // Pinned rules: the slate's ppr4-v1 points, never the later ppr4-v2.
    assert.equal(qb.actual, 14.6);
    // Standings: Dana and Sean tie and share rank 3; Dana's WR draft scores nothing; the House takes no rank.
    assert.deepEqual(week.standings.week.map(r => [r.displayName, r.points, r.rank, r.tied]),
      [['Troy Fixture', 36.1, 1, false], ['Luke Fixture', 34.1, 2, false], ['Dana Fixture', 9.4, 3, true], ['Sean Fixture', 9.4, 3, true]]);
    const rows = Object.fromEntries(week.standings.week.map(r => [r.displayName, r]));
    assert.deepEqual([rows['Troy Fixture'].exact, rows['Troy Fixture'].off], [2, 3.9]);
    assert.ok(!week.standings.week.some(r => /house/i.test(r.displayName)));
    assert.deepEqual(week.slots[2].guesses.map(g => [g.displayName, g.guess, g.points]), [['Luke Fixture', 9, 10]], 'Dana\'s WR draft is not a guess');

    // A stat correction (QB 14.6 → 19.6) re-grades the PROVISIONAL week and records before and after.
    const corrected = await load(SHA('b'), [player(0, 19.6)]);
    assert.equal(corrected.regraded, true);
    const regrade = (await f.db.query('select regrades from public.gtl_points_actual_loads where id=$1', [corrected.loadId])).rows[0].regrades;
    const pts = (scores, uid) => scores.members.find(m => m.userId === uid).points;
    assert.deepEqual([pts(regrade[0].before, USERS.troy), pts(regrade[0].after, USERS.troy)], [36.1, 37.9]);
    assert.deepEqual([pts(regrade[0].before, USERS.luke), pts(regrade[0].after, USERS.luke)], [34.1, 39.1]);
    const regraded = await f.read('troy', 7);
    assert.deepEqual(regraded.standings.week.slice(0, 2).map(r => [r.displayName, r.points, r.rank]), [['Luke Fixture', 39.1, 1], ['Troy Fixture', 37.9, 2]]);
    await assert.rejects(() => f.db.query("update public.gtl_points_actual_loads set status='failed'"), /GTL_POINTS_APPEND_ONLY/);
  });

  await t.test('FINAL freezes at its time once every slot is settled; a re-run is a no-op; a later correction is a note and changes nothing', async () => {
    const final = await f.sql('gtl_points_finalize', { p_season: SEASON, p_week: 7 });
    assert.deepEqual([final.final, final.replayed], [true, false]);
    assert.deepEqual({ ...(await f.sql('gtl_points_finalize', { p_season: SEASON, p_week: 7 })), finalizedAt: null }, { season: SEASON, week: 7, final: true, replayed: true, finalizedAt: null });
    const frozen = await f.read('troy', 7);
    assert.equal(frozen.result.status, 'FINAL');
    const late = await load(SHA('c'), [player(0, 4), player(2, 30)]);
    assert.deepEqual([late.status, late.regraded, late.finalNote], ['saved', false, true]);
    const after = await f.read('troy', 7);
    assert.deepEqual(after.result, frozen.result, 'no total changes');
    assert.deepEqual(after.standings, frozen.standings, 'no rank or winner changes');
    assert.deepEqual(after.slots.map(s => s.actual), frozen.slots.map(s => s.actual));
    const notes = (await f.db.query('select notes from public.gtl_points_week_final where season=2026 and week=7')).rows[0].notes;
    assert.deepEqual(notes[0].changes.map(c => [c.slot, c.frozen.actual, c.loaded.actual]), [['QB', 19.6, 4], ['WR', 9, 30]]);
    await assert.rejects(() => f.as('service_role', "update public.gtl_points_week_final set maximum=50 where week=7"), /GTL_POINTS_FINAL_FROZEN/);
    await assert.rejects(() => f.db.query("update public.gtl_points_week_final set notes='[]' where week=7"), /GTL_POINTS_FINAL_FROZEN/);
    // Week 9 is not at its FINAL time yet; a week with no actuals stays pending; an unpublished week never freezes.
    assert.equal((await f.sql('gtl_points_finalize', { p_season: SEASON, p_week: 9 })).reason, 'not_yet');
    assert.equal((await f.sql('gtl_points_finalize', { p_season: SEASON, p_week: 10 })).reason, 'unpublished');
  });

  await t.test('boards: season standings start at the first lock-in, label PROVISIONAL, count beat the House and share ranks', async () => {
    const season = (await f.read('luke', 8)).standings.season;
    const row = name => season.find(r => r.displayName === name);
    // Week 7 is FINAL (Luke 39.1, Troy 37.9, Dana and Sean 4.4 against a complete House of 29.7); weeks 8 and 9 have no score yet.
    assert.deepEqual(season.map(r => [r.displayName, r.points, r.rank, r.tied, r.provisional, r.beatHouse]),
      [['Luke Fixture', 39.1, 1, false, false, 1], ['Troy Fixture', 37.9, 2, false, false, 1], ['Dana Fixture', 4.4, 3, true, false, 0], ['Sean Fixture', 4.4, 3, true, false, 0]]);
    assert.deepEqual([row('Troy Fixture').weeksPlayed, row('Troy Fixture').perWeek], [3, 37.9], 'weeks played count lock-ins; per week counts scored weeks');
    assert.equal(row('Dana Fixture').weeksPlayed, 1, 'Dana\'s week 8 has no lock-in, so it is not played');
    // Group filter on the board: second-group lists only Sean and Troy.
    const group = (await f.read('sean', 8, { group: 'second-group' })).standings.season;
    assert.deepEqual(group.map(r => r.displayName).sort(), ['Sean Fixture', 'Troy Fixture']);
  });

  await t.test('kickoffs: only absolute, offset-bearing timestamps are accepted, and they are stored as canonical UTC (toISOString form)', async () => {
    const opensAt = iso(NOW + 30 * 60_000);
    const base = slotsAt(NOW + 2 * HOUR, 'K13');
    const publish = (week, action, slate) => f.sql('gtl_points_publish_slate', { p_actor: action === 'swap' ? USERS.sean : null, p_action: action, p_season: SEASON, p_week: week, p_slate: slate });
    const draftWith = (week, kickoff, index = 0) => publish(week, 'draft', { opensAt, scoringRules: RULES, slots: base.map((x, i) => i === index ? { ...x, kickoff } : x), house: {}, provenance: PROVENANCE });
    const invalid = detail => err => /GTL_POINTS_SLATE_INVALID/.test(err.message) && err.detail === detail;
    // Relative words are re-evaluated on every later cast, and an offset-less value is read in the session time zone.
    for (const kickoff of ['tomorrow', 'now', 'today', 'infinity', '2026-10-25T13:00:00', '2026-10-25 13:00:00Z', '2026-10-25', '2026-10-25T13:00Z ', 20261025, null, {}])
      await assert.rejects(() => draftWith(13, kickoff), invalid('kickoff'), JSON.stringify(kickoff));
    assert.equal(await f.count('gtl_points_slates', 'week=13'), 0, 'a refused draft stores nothing');
    const stored = await draftWith(13, '2026-10-25T10:00:00-07:00');
    assert.equal(stored.slots[0].kickoff, '2026-10-25T17:00:00.000Z', 'an offset kickoff is stored as UTC with milliseconds');
    assert.deepEqual(stored.slots.slice(1).map(x => x.kickoff), base.slice(1).map(x => x.kickoff), 'canonical kickoffs are unchanged');
    assert.equal((await f.db.query("select slots->0->>'kickoff' k from public.gtl_points_slates where week=13")).rows[0].k, '2026-10-25T17:00:00.000Z');
    // Replacing the draft canonicalizes again, including fractions and compact offsets.
    const replaced = await draftWith(13, '2026-10-25T10:00:00.5+0000', 1);
    assert.equal(replaced.slots[1].kickoff, '2026-10-25T10:00:00.500Z');
    // A swap validates the same way and stores the same form.
    const te = { playerId: 'K13-9', name: 'K13 TE Swap Fixture', team: 'FFF', position: 'TE', gameKey: 'K13G9' };
    await assert.rejects(() => publish(13, 'swap', { slot: 'TE', player: { ...te, kickoff: 'tomorrow' } }), invalid('kickoff'));
    await assert.rejects(() => publish(13, 'swap', { slot: 'TE', player: { ...te, kickoff: '2026-10-28T09:30:00' } }), invalid('kickoff'));
    const swapped = await publish(13, 'swap', { slot: 'TE', player: { ...te, kickoff: '2026-10-28T09:30:00-07:00' } });
    assert.equal(swapped.slots[3].playerId, 'K13-9');
    assert.equal(swapped.slots[3].kickoff, '2026-10-28T16:30:00.000Z');
  });

  await t.test('kickoffs: publishing canonicalizes a draft edited directly, a swap needs a kickoff, and canonical text ignores the session time zone', async () => {
    const opensAt = iso(NOW + 30 * 60_000);
    const base = slotsAt(NOW + 2 * HOUR, 'K14');
    const publish = (action, slate) => f.sql('gtl_points_publish_slate', { p_actor: USERS.sean, p_action: action, p_season: SEASON, p_week: 14, p_slate: slate });
    await publish('draft', { opensAt, scoringRules: RULES, slots: base, house: {}, provenance: PROVENANCE });
    // service_role may update a DRAFT slate directly (the guard freezes only published rows), so a non-canonical offset kickoff can be stored.
    // Offset-bearing but non-canonical: -07:00 and a +05:30 with a fraction (both still in the future).
    const at = (ms, offsetMin) => { const sign = offsetMin < 0 ? '-' : '+', m = Math.abs(offsetMin);
      return new Date(ms + offsetMin * 60_000).toISOString().replace('Z', `${sign}${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`); };
    const future = base.map(x => ({ ...x }));
    future[0].kickoff = at(Date.parse(base[0].kickoff), -420);
    future[1].kickoff = at(Date.parse(base[1].kickoff) + 500, 330);
    await f.as('service_role', 'update public.gtl_points_slates set slots=$1::jsonb where season=2026 and week=14', [JSON.stringify(future)]);
    assert.match((await f.db.query("select slots->0->>'kickoff' k from public.gtl_points_slates where week=14")).rows[0].k, /-07:00$/, 'fixture: the draft holds a non-canonical kickoff');
    const published = await publish('publish');
    assert.equal(published.status, 'published');
    const stored = (await f.db.query("select slots from public.gtl_points_slates where week=14")).rows[0].slots;
    assert.equal(stored[0].kickoff, base[0].kickoff, 'publishing stores the exact toISOString() form');
    assert.equal(stored[1].kickoff, iso(Date.parse(base[1].kickoff) + 500));
    assert.deepEqual(stored.map(x => x.kickoff), published.slots.map(x => x.kickoff));
    for (const slot of stored) assert.equal(slot.kickoff, new Date(slot.kickoff).toISOString());

    // A swap whose player kickoff is JSON null or missing is refused as a bad kickoff.
    const swapIn = (week, kickoff) => f.sql('gtl_points_publish_slate', { p_actor: USERS.sean, p_action: 'swap', p_season: SEASON, p_week: week, p_slate: { slot: 'TE', player: { playerId: 'K15-9', name: 'K15 TE Swap Fixture', team: 'FFF', position: 'TE', gameKey: 'K15G9', ...kickoff } } });
    await f.sql('gtl_points_publish_slate', { p_actor: USERS.sean, p_action: 'draft', p_season: SEASON, p_week: 15, p_slate: { opensAt, scoringRules: RULES, slots: slotsAt(NOW + 2 * HOUR, 'K15'), house: {}, provenance: PROVENANCE } });
    const kickoffInvalid = err => /GTL_POINTS_SLATE_INVALID/.test(err.message) && err.detail === 'kickoff';
    await assert.rejects(() => swapIn(15, { kickoff: null }), kickoffInvalid, 'JSON null kickoff');
    await assert.rejects(() => swapIn(15, {}), kickoffInvalid, 'missing kickoff');

    // Canonical output does not depend on the session time zone.
    const inZone = zone => f.db.transaction(async tx => {
      await tx.exec(`set local time zone '${zone}'`);
      return (await tx.query("select public.gtl_points_canonical_slots($1::jsonb) s", [JSON.stringify(future)])).rows[0].s;
    });
    const utc = await inZone('UTC');
    assert.deepEqual(await inZone('Asia/Tokyo'), utc);
    assert.equal(utc[0].kickoff, base[0].kickoff);
  });

  await t.test('FINAL is not reopenable: slate slots, guesses and the frozen read hold even against altered live rows', async () => {
    assert.equal(await f.count('gtl_points_week_final', 'week=7'), 1, 'week 7 is FINAL (earlier subtest)');
    const slots = JSON.stringify(slotsAt(Date.now(), 'W7X'));
    await assert.rejects(() => f.as('service_role', 'update public.gtl_points_slates set slots=$1::jsonb where season=2026 and week=7', [slots]), /GTL_POINTS_SLATE_FIXED/);
    await assert.rejects(() => f.as('service_role', "update public.gtl_points_slates set status='draft', published_at=null where season=2026 and week=7"), /GTL_POINTS_SLATE_FIXED/);
    // Dana's unlocked WR draft cannot be updated or locked; no new row can be inserted; a locked row stays locked.
    await assert.rejects(() => f.as('service_role', "update public.gtl_points_guesses set guess=1, locked_at=now() where user_id=$1 and week=7 and slot='WR'", [USERS.dana]), /GTL_POINTS_CLOSED/);
    await assert.rejects(() => f.as('service_role', "insert into public.gtl_points_guesses(user_id,season,week,slot,guess) values($1,2026,7,'RB',5)", [USERS.sean]), /GTL_POINTS_CLOSED/);
    await assert.rejects(() => f.as('service_role', "update public.gtl_points_guesses set guess=0 where user_id=$1 and week=7 and slot='QB'", [USERS.troy]), /GTL_POINTS_LOCKED/);
    await assert.rejects(() => f.lock('dana', 7, 'WR', 30), /GTL_POINTS_CLOSED/);
    const frozen = await f.read('troy', 7);
    assert.equal(frozen.result.status, 'FINAL');
    // Alter live guess rows with triggers off, read as the service role inside the same transaction, then roll back.
    const sentinel = new Error('rollback');
    let altered;
    await f.db.transaction(async tx => {
      await tx.exec('set local session_replication_role = replica');
      await tx.query("update public.gtl_points_guesses set guess=0 where week=7 and slot in ('QB','FLEX')");
      await tx.query('update public.gtl_points_guesses set locked_at=null where week=7 and user_id=$1', [USERS.luke]);
      await tx.exec('set local session_replication_role = origin');
      await tx.exec('set local role service_role');
      altered = (await tx.query('select public.gtl_points_read($1,2026,7,null,null) value', [USERS.troy])).rows[0].value;
      throw sentinel;
    }).catch(err => { if (err !== sentinel) throw err; });
    assert.deepEqual(altered.result, frozen.result, 'the frozen result is read from week_final, not recomputed from live guesses');
    assert.deepEqual(altered.standings, frozen.standings);
    assert.deepEqual(altered.slots.map(x => [x.slot, x.state, x.actual]), frozen.slots.map(x => [x.slot, x.state, x.actual]));
    const after = await f.read('troy', 7);
    assert.deepEqual([after.result, after.standings], [frozen.result, frozen.standings], 'the rollback left the live rows as they were');
  });

  await t.test("gate: a viewer's own DRAFT opens nothing before kickoff; locking the same slot does", async () => {
    const W12 = slotsAt(NOW + 2 * HOUR, 'W12');
    await f.publishedSlate(12, NOW - HOUR, W12, { QB: 19, RB: 23.7, WR: 15, TE: 9, FLEX: 12 });
    await f.lock('luke', 12, 'RB', 30);
    await f.draft('dana', 12, 'RB', 41);
    const gate = () => f.sql('gtl_points_revealed', { p_viewer: USERS.dana, p_season: SEASON, p_week: 12, p_slot: 'RB', p_now: null });
    assert.equal(await gate(), false, 'a draft is not a lock-in');
    const hidden = await f.read('dana', 12);
    const rb = hidden.slots.find(x => x.slot === 'RB');
    assert.deepEqual([rb.revealed, rb.house, rb.guesses], [false, null, []]);
    assert.deepEqual([rb.own.guess, rb.own.locked], [41, false], 'her own draft is hers to see');
    assert.doesNotMatch(JSON.stringify(rb.guesses) + JSON.stringify(rb.house), /30|23\.7/);
    // Another slot's lock-in does not open this slot either.
    await f.lock('dana', 12, 'WR', 12);
    assert.equal(await gate(), false);
    await f.lock('dana', 12, 'RB', 41);
    assert.equal(await gate(), true, 'locking the same slot opens it');
    const open = (await f.read('dana', 12)).slots.find(x => x.slot === 'RB');
    assert.deepEqual([open.revealed, open.house.estimate, open.guesses.map(g => g.guess)], [true, 23.7, [30]]);
  });
});
