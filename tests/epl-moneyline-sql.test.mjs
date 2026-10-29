// M-32 executed on PGlite on top of M-30 and M-31: EPL Guess the Line (2-way draw-no-bet moneyline) guesses, their
// references and the readers (plan 2026-10-28-epl-moneyline.md Task 2; Review Focus 1, 2, 3 and 4). Same harness as
// epl-migration-sql.test.mjs; never connects to the hosted project.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APPLIED, NOT_HOSTED, REQUIRES, PRELUDE } from './migrations.mjs';
import { distance as jsDistance, leaderboard as jsLeaderboard } from '../shared/epl-moneyline.mjs';
const { PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js');

const M30 = 'supabase/migrations/20261028190000_gtl_epl_pick_a_team.sql';
const M31 = 'supabase/migrations/20261029060000_gtl_epl_open_access.sql';
const FILE = 'supabase/migrations/20261029150000_gtl_epl_moneyline.sql';
const VERSION = 20261029150000;
const U = n => `00000000-0000-4000-8000-00000000000${n}`;
const EVAN = '719658248843632640', SEAN = '473955676301815808', STEVEN = '702644837370929152';
// The fixtures lie ahead of the real clock (the board reads it); a save passes its own service-side clock.
const DAY = 86400e3;
const at = ms => new Date(ms).toISOString();
const T0 = Date.now();
const KICK = at(T0 + 10 * DAY), BEFORE = at(T0 + 9 * DAY), AFTER = at(T0 + 10 * DAY + 3600e3);

async function setup(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  await db.exec(fs.readFileSync('supabase/migrations/20261008164249_gtl_private_cloud_state.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261008174007_gtl_profiles_private_games_invites.sql', 'utf8'));
  await db.exec('alter default privileges grant all on tables to anon,authenticated,service_role;');
  await db.exec(fs.readFileSync(M30, 'utf8'));
  await db.exec(fs.readFileSync(M31, 'utf8'));
  await db.exec(fs.readFileSync(FILE, 'utf8'));
  await db.exec(`insert into auth.users values ('${U(1)}'),('${U(2)}'),('${U(3)}'),('${U(4)}'),('${U(5)}');
    update public.gtl_epl_managers set user_id='${U(1)}' where owner_id='${EVAN}';
    update public.gtl_epl_managers set user_id='${U(2)}' where owner_id='${SEAN}';
    update public.gtl_epl_managers set user_id='${U(3)}' where owner_id='${STEVEN}';
    insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status)
      values(2026,9,'${at(T0)}','${at(T0 + 14 * DAY)}','${KICK}','{${EVAN},${SEAN},${STEVEN}}','open');
    insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values
      ('e1',2026,9,'ARS','CHE','${KICK}'),('e2',2026,9,'LIV','EVE','${KICK}'),('e3',2026,9,'TOT','FUL','${KICK}');`);
  const call = async (sql, params = []) => (await db.query(sql, params)).rows[0].r;
  const save = (user, event, club, price, lock = false, now = BEFORE) =>
    call('select public.gtl_epl_save_guess($1,$2,$3,$4,$5,$6) r', [user, event, club, price, lock, now]);
  const price = (event, club, p, observed) => db.query(
    "insert into public.gtl_epl_prices(event_id,club,market,price,observed_at) values($1,$2,'draw_no_bet',$3,$4) on conflict(event_id,club,market) do update set price=excluded.price,observed_at=excluded.observed_at",
    [event, club, p, observed]);
  const resolve = event => call('select public.gtl_epl_resolve_pending_references($1) r', [event]);
  const board = (user, week = 9) => call('select public.gtl_epl_guess_board($1,2026,$2) r', [user, week]);
  const leaderboard = () => call('select public.gtl_epl_guess_leaderboard(2026) r');
  const guess = async (event, owner) => (await db.query('select * from public.gtl_epl_guesses where event_id=$1 and owner_id=$2', [event, owner])).rows[0];
  // Kickoff passes on the real clock: fixtures move into the past, keeping their order.
  const kickoffPassed = (event = null) => db.exec(`update public.gtl_epl_fixtures set commence_time=now()-interval '1 hour'${event ? ` where event_id='${event}'` : ''}`);
  return { db, call, save, price, resolve, board, leaderboard, guess, kickoffPassed };
}

test('M-32 is listed in NOT_HOSTED, builds on the hosted M-30 and calls no unapplied function', () => {
  assert.ok(NOT_HOSTED.includes(VERSION));
  assert.ok(APPLIED.includes(20261028190000));
  assert.equal(REQUIRES[VERSION], undefined);
});

test('M-32 admits a disabled dnb-check schedule and reuses the existing private claim/completion queue', async t => {
  const { db, call } = await setup(t);
  assert.equal((await db.query('select count(*)::int n from public.gtl_epl_jobs_schedule')).rows[0].n, 0,
    'the migration never creates or enables a schedule');
  await db.exec("insert into public.gtl_epl_jobs_schedule(job,enabled) values('dnb-check',false)");
  assert.deepEqual(await call("select public.gtl_epl_dispatch_jobs('dnb-check') r"), { status: 'disabled' });
  await assert.rejects(db.exec("insert into public.gtl_epl_jobs_schedule(job) values('unknown')"), /check constraint/);
  // Local fixture only: simulate the separately authorized enable/dispatch, without any network or hosted state.
  await db.exec("update public.gtl_epl_jobs_schedule set enabled=true where job='dnb-check'");
  const run = (await db.query("insert into public.gtl_epl_job_runs(job,slot_start,capability_hash) values('dnb-check',clock_timestamp(),encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex')) returning id")).rows[0].id;
  await db.exec('set role service_role');
  const claim = await call('select public.gtl_epl_claim_job(repeat(\'a\',64),$1) r', [run]);
  assert.equal(claim.job, 'dnb-check');
  const complete = await call("select public.gtl_epl_complete_job($1,$2,null,'{\"season\":2026,\"week\":9,\"dnbAvailable\":false,\"events\":[]}') r", [run, claim.claim]);
  assert.equal(complete.status, 'succeeded');
  await db.exec('reset role');
  const row = (await db.query('select job,status,detail from public.gtl_epl_job_runs where id=$1', [run])).rows[0];
  assert.equal(row.job, 'dnb-check'); assert.equal(row.detail.dnbAvailable, false);
});

test('a draft saves and changes freely; Lock in takes the newest stored price at or before the save as its reference', async t => {
  const { save, price, guess, db } = await setup(t);
  await price('e1', 'ARS', -150, at(T0 + 8 * DAY));
  await price('e1', 'CHE', 130, at(T0 + 8 * DAY));
  const draft = await save(U(1), 'e1', 'ARS', -130);
  assert.equal(draft.status, 'draft'); assert.equal(draft.state, 'draft'); assert.equal(draft.referencePrice, null);
  const changed = await save(U(1), 'e1', 'CHE', 110);
  assert.equal(changed.club, 'CHE'); assert.equal(changed.price, 110);
  const locked = await save(U(1), 'e1', 'ARS', -120, true);
  assert.equal(locked.status, 'locked'); assert.equal(locked.state, 'scored');
  assert.equal(locked.referencePrice, -150); assert.equal(locked.referenceSource, 'at-lock');
  assert.equal(locked.distance, 30, '-120 vs -150 on the line');
  assert.equal(locked.distance, jsDistance(-120, -150), 'the same math as shared/epl-moneyline.mjs');
  const row = await guess('e1', EVAN);
  assert.equal(new Date(row.locked_at).getTime(), Date.parse(BEFORE)); assert.equal(new Date(row.reference_observed_at).getTime(), T0 + 8 * DAY);
  assert.deepEqual((await db.query('select club,price,action from public.gtl_epl_guess_history order by id')).rows,
    [{ club: 'ARS', price: -130, action: 'draft' }, { club: 'CHE', price: 110, action: 'draft' }, { club: 'ARS', price: -120, action: 'lock' }],
    'every save is kept (D-23)');
});

test('Review Focus 3: a second Lock in (double tap) or a later draft save is refused GTL_EPL_GUESS_LOCKED; one final guess', async t => {
  const { save, guess, db } = await setup(t);
  await save(U(1), 'e1', 'ARS', -120, true);
  await assert.rejects(save(U(1), 'e1', 'ARS', -120, true), /GTL_EPL_GUESS_LOCKED/);
  await assert.rejects(save(U(1), 'e1', 'CHE', 140, false), /GTL_EPL_GUESS_LOCKED/);
  await assert.rejects(save(U(1), 'e1', 'ARS', -120, true, AFTER), /GTL_EPL_GUESS_LOCKED/, 'a locked guess reads as locked after kickoff too');
  const row = await guess('e1', EVAN);
  assert.equal(row.club, 'ARS'); assert.equal(row.price, -120); assert.equal(row.status, 'locked');
  assert.equal((await db.query("select count(*)::int n from public.gtl_epl_guess_history where action='lock'")).rows[0].n, 1);
});

test('Review Focus 3: two Lock in calls racing on one guess: exactly one wins', async t => {
  const { save, db } = await setup(t);
  const results = await Promise.allSettled([save(U(2), 'e2', 'LIV', -200, true), save(U(2), 'e2', 'LIV', -190, true)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(String(results.find(r => r.status === 'rejected').reason), /GTL_EPL_GUESS_LOCKED/);
  assert.equal((await db.query("select count(*)::int n from public.gtl_epl_guesses where event_id='e2'")).rows[0].n, 1);
});

test('Review Focus 4: after kickoff a save is GTL_EPL_GUESS_CLOSED and the stored draft is kept unchanged', async t => {
  const { save, guess, db } = await setup(t);
  await save(U(1), 'e1', 'ARS', -130);
  await assert.rejects(save(U(1), 'e1', 'ARS', -120, true, KICK), /GTL_EPL_GUESS_CLOSED/, 'kickoff itself closes it');
  await assert.rejects(save(U(1), 'e1', 'CHE', 120, false, AFTER), /GTL_EPL_GUESS_CLOSED/);
  const row = await guess('e1', EVAN);
  assert.deepEqual([row.club, row.price, row.status], ['ARS', -130, 'draft']);
  assert.equal((await db.query('select count(*)::int n from public.gtl_epl_guess_history')).rows[0].n, 1, 'a refused save writes nothing');
  await db.exec("update public.gtl_epl_fixtures set status='postponed' where event_id='e2'");
  await assert.rejects(save(U(1), 'e2', 'LIV', -200, true), /GTL_EPL_GUESS_CLOSED/, 'a postponed match takes no guess');
});

test('invalid guesses are GTL_EPL_GUESS_INVALID and only a linked manager may guess (GTL_EPL_FORBIDDEN)', async t => {
  const { save, db } = await setup(t);
  for (const p of [99, -99, 0, null]) await assert.rejects(save(U(1), 'e1', 'ARS', p), /GTL_EPL_GUESS_INVALID/, `price ${p}`);
  await assert.rejects(save(U(1), 'e1', 'LIV', -120), /GTL_EPL_GUESS_INVALID/, 'a club not in that match');
  await assert.rejects(save(U(1), 'e1', null, -120), /GTL_EPL_GUESS_INVALID/);
  await assert.rejects(save(U(1), 'nope', 'ARS', -120), /GTL_EPL_GUESS_INVALID/, 'an unknown match');
  await assert.rejects(save(U(4), 'e1', 'ARS', -120), /GTL_EPL_FORBIDDEN/, 'an unlinked account');
  await assert.rejects(save(null, 'e1', 'ARS', -120), /GTL_EPL_FORBIDDEN/);
  await db.exec('alter table public.gtl_memberships drop constraint gtl_memberships_league_id_fkey');
  await db.exec(`insert into public.gtl_memberships(league_id,user_id,player_id,role,active) values('sean-troy-luke','${U(5)}','sean','commissioner',true)`);
  await assert.rejects(save(U(5), 'e1', 'ARS', -120), /GTL_EPL_FORBIDDEN/, 'the commissioner is not a manager');
  assert.equal((await db.query('select count(*)::int n from public.gtl_epl_guesses')).rows[0].n, 0);
  assert.equal(Number.isInteger((await save(U(1), 'e1', 'ARS', -100)).price), true, '-100 is a valid price');
  assert.equal((await save(U(1), 'e1', 'ARS', 100)).price, 100, '+100 is a valid price');
});

test('Review Focus 2: a price of exactly +100 or -100 in the guess or the reference measures on the line', async t => {
  const { save, price } = await setup(t);
  await price('e1', 'ARS', -100, at(T0 + 8 * DAY));
  await price('e2', 'LIV', 100, at(T0 + 8 * DAY));
  await price('e3', 'TOT', -105, at(T0 + 8 * DAY));
  assert.equal((await save(U(1), 'e1', 'ARS', 100, true)).distance, 0, '+100 vs -100');
  assert.equal((await save(U(1), 'e2', 'LIV', -105, true)).distance, 5, '-105 vs +100');
  assert.equal((await save(U(1), 'e3', 'TOT', 105, true)).distance, 10, '+105 vs -105');
});

test('a pending guess takes the first price observed after Lock in and before kickoff; an earlier or later collection is never used', async t => {
  const { save, price, resolve, guess } = await setup(t);
  await price('e1', 'CHE', 130, at(T0 + 8 * DAY)); // the other club only
  await price('e1', 'ARS', -150, at(T0 + 9 * DAY + 60e3)); // stored after the save's clock
  const locked = await save(U(1), 'e1', 'ARS', -120, true);
  assert.equal(locked.state, 'pending'); assert.equal(locked.referencePrice, null); assert.equal(locked.distance, null);
  assert.equal((await resolve('e1')).resolved, 1, 'the price observed after the lock resolves it');
  const row = await guess('e1', EVAN);
  assert.deepEqual([row.reference_price, row.reference_source, row.distance], [-150, 'first-after', 30]);
  await price('e1', 'ARS', -200, at(T0 + 9 * DAY + 120e3));
  assert.equal((await resolve('e1')).resolved, 0, 'a resolved reference never moves');
  assert.equal((await guess('e1', EVAN)).reference_price, -150);
  // A price collected only after kickoff is never a reference.
  await save(U(2), 'e2', 'LIV', -200, true);
  await price('e2', 'LIV', -180, AFTER);
  assert.equal((await resolve('e2')).resolved, 0);
  assert.equal((await guess('e2', SEAN)).reference_price, null);
  // A stored price that fails the 2-way rule (|p| < 100 or not whole) is not a qualifying price.
  await save(U(3), 'e3', 'TOT', -120, true);
  await price('e3', 'TOT', 50, at(T0 + 9 * DAY + 60e3));
  assert.equal((await resolve('e3')).resolved, 0);
  await price('e3', 'TOT', -110.5, at(T0 + 9 * DAY + 60e3));
  assert.equal((await resolve('e3')).resolved, 0);
  await assert.rejects(resolve(null), /GTL_EPL_GUESS_INVALID/);
});

test('Review Focus 1: no price before kickoff leaves the guess unscored, shown as unscored and left out of the average', async t => {
  const { save, price, resolve, board, leaderboard, kickoffPassed } = await setup(t);
  await price('e2', 'LIV', -200, at(T0 + 8 * DAY));
  await save(U(1), 'e1', 'ARS', -120, true); // never gets a price
  await save(U(1), 'e2', 'LIV', -180, true); // 20
  await kickoffPassed();
  assert.equal((await resolve('e1')).resolved, 0);
  const mine = (await board(U(1))).guesses.filter(g => g.ownerId === EVAN);
  assert.deepEqual(mine.map(g => [g.eventId, g.state]).sort(), [['e1', 'unscored'], ['e2', 'scored']]);
  const rows = (await leaderboard()).rows;
  assert.deepEqual(rows.map(r => [r.ownerId, Number(r.average), r.guessed, r.unscored]), [[EVAN, 20, 1, 1]]);
});

test('the board shows your own guesses, and others\' locked guesses only once you lock that match or it kicks off (D-31)', async t => {
  const { save, board, kickoffPassed } = await setup(t);
  await save(U(2), 'e1', 'ARS', -140, true);
  await save(U(2), 'e2', 'LIV', -200, true);
  await save(U(3), 'e1', 'CHE', 120); // a draft is never shown to anyone else
  await save(U(1), 'e1', 'ARS', -130); // Evan's own draft
  const seen = async user => (await board(user)).guesses.map(g => `${g.ownerId}:${g.eventId}:${g.status}`).sort();
  assert.deepEqual(await seen(U(1)), [`${EVAN}:e1:draft`], 'a draft does not open others\' guesses');
  await save(U(1), 'e1', 'ARS', -130, true);
  assert.deepEqual(await seen(U(1)), [`${SEAN}:e1:locked`, `${EVAN}:e1:locked`], 'locking e1 opens e1 only');
  assert.deepEqual(await seen(U(4)), [], 'a signed-in non-manager sees nothing before kickoff');
  const before = await board(U(4));
  assert.equal(before.ownerId, null); assert.equal(before.fixtures.length, 3);
  await kickoffPassed('e2');
  assert.deepEqual(await seen(U(4)), [`${SEAN}:e2:locked`], 'kickoff opens that match to everyone');
  assert.deepEqual(await seen(U(3)), [`${SEAN}:e2:locked`, `${STEVEN}:e1:draft`]);
  assert.equal((await board(U(1), 10)).guesses.length, 0, 'another week');
});

test('the leaderboard ranks lowest average distance, ties by more matches guessed, kicked-off locked guesses only', async t => {
  const { save, price, leaderboard, kickoffPassed, db } = await setup(t);
  const ref = at(T0 + 8 * DAY);
  await price('e1', 'ARS', -150, ref); await price('e2', 'LIV', -200, ref); await price('e3', 'TOT', 110, ref);
  await save(U(1), 'e1', 'ARS', -140, true); // 10
  await save(U(1), 'e2', 'LIV', -190, true); // 10
  await save(U(2), 'e1', 'ARS', -160, true); // 10
  await save(U(3), 'e1', 'ARS', -100, true); // 50
  await save(U(3), 'e3', 'TOT', 110); // a draft never counts
  await save(U(2), 'e3', 'TOT', 120, true); // e3 has not kicked off: not counted yet
  await kickoffPassed('e1'); await kickoffPassed('e2');
  const rows = (await leaderboard()).rows;
  assert.deepEqual(rows.map(r => [r.ownerId, Number(r.average), r.guessed, r.unscored]),
    [[EVAN, 10, 2, 0], [SEAN, 10, 1, 0], [STEVEN, 50, 1, 0]]);
  assert.equal(rows[0].name, 'Evan');
  const js = jsLeaderboard((await db.query("select owner_id \"ownerId\",distance from public.gtl_epl_guesses g join public.gtl_epl_fixtures f using(event_id) where g.status='locked' and f.commence_time<=now()")).rows);
  assert.deepEqual(rows.map(r => r.ownerId), js.map(r => r.ownerId), 'the same order as shared/epl-moneyline.mjs');
});

test('every new function is service-only and every new table is closed to browser roles', async t => {
  const { db } = await setup(t);
  const fns = ['public.gtl_epl_save_guess(uuid,text,text,integer,boolean,timestamptz)', 'public.gtl_epl_resolve_pending_references(text)',
    'public.gtl_epl_guess_board(uuid,integer,integer)', 'public.gtl_epl_guess_leaderboard(integer)', 'public.gtl_epl_moneyline_distance(integer,integer)'];
  const can = async (role, fn) => (await db.query("select has_function_privilege($1,$2,'execute') r", [role, fn])).rows[0].r;
  for (const fn of fns) {
    assert.equal(await can('service_role', fn), true, fn);
    for (const role of ['anon', 'authenticated']) assert.equal(await can(role, fn), false, `${role} ${fn}`);
  }
  for (const table of ['public.gtl_epl_guesses', 'public.gtl_epl_guess_history']) {
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await db.query("select has_table_privilege($1,$2,'select') r", [role, table])).rows[0].r, false, `${role} ${table}`);
    }
    assert.equal((await db.query("select has_table_privilege('service_role',$1,'delete') r", [table])).rows[0].r, false, `no delete on ${table} (D-23)`);
  }
  assert.equal((await db.query("select has_table_privilege('service_role','public.gtl_epl_guess_history','update') r")).rows[0].r, false, 'history is append-only');
});

test('the migration reruns cleanly and keeps every guess', async t => {
  const { db, save } = await setup(t);
  await save(U(1), 'e1', 'ARS', -120, true);
  await db.exec(fs.readFileSync(FILE, 'utf8'));
  assert.equal((await db.query('select count(*)::int n from public.gtl_epl_guesses')).rows[0].n, 1);
});
