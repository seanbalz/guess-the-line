// EPL three-way moneyline (docs/EPL_FEATURES_2026_11_09.md stages 1 and 2) on disposable PGlite only, on top of hosted
// M-30/M-31/M-32/M-36. Never connects to the hosted project and makes no provider request.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRELUDE, NOT_HOSTED, APPLIED, FIX_FORWARD, REQUIRES } from './migrations.mjs';
import { distance as jsDistance, median as jsMedian } from '../shared/epl-moneyline.mjs';
const { PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js');

const FILE = 'supabase/migrations/20261110100000_gtl_epl_three_way_moneyline.sql';
const VERSION = 20261110100000;
const U = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [EVAN, SEAN, STEVEN] = ['719658248843632640', '473955676301815808', '702644837370929152'];
const fixtureDate = new Date();
const T = Date.UTC(fixtureDate.getUTCFullYear(), fixtureDate.getUTCMonth(), fixtureDate.getUTCDate() + 1, 12), K = T + 86400000;
const at = n => new Date(n).toISOString();
const gateBooks = { draftkings: { ARS: -150, CHE: 130 }, fanduel: { ARS: -140, CHE: 120 } };
const verdict = { season: 2026, week: 9, dnbAvailable: true, events: [{ eventId: 'e1', books: gateBooks }, { eventId: 'e2', books: gateBooks }] };
const dnbEvidence = (observed, changes = {}) => ({ eventId: 'e1', available: true, home: 'ARS', away: 'CHE', commenceTime: at(K), observedAt: at(observed),
  responseSha256: 'a'.repeat(64), books: gateBooks, bookObservedAt: { draftkings: at(observed - 60000), fanduel: at(observed - 120000) }, ...changes });
const threeBooks = { draftkings: { home: -120, draw: 260, away: 300 }, fanduel: { home: -110, draw: 250, away: 320 }, betmgm: { home: -125, draw: 270, away: 310 } };
const threeEvidence = (observed, changes = {}) => ({ eventId: 'e1', home: 'ARS', away: 'CHE', commenceTime: at(K), observedAt: at(observed),
  responseSha256: 'b'.repeat(64), books: threeBooks,
  bookObservedAt: { draftkings: at(observed - 60000), fanduel: at(observed - 60000), betmgm: at(observed - 30000) }, ...changes });

async function setup(t, { before } = {}) {
  const db = new PGlite(); t.after(() => db.close()); await db.exec(PRELUDE);
  for (const file of ['20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql',
    '20261028190000_gtl_epl_pick_a_team.sql', '20261029060000_gtl_epl_open_access.sql', '20261029150000_gtl_epl_moneyline.sql']) await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(`create table public.gtl_odds_budget(provider text primary key,conservative_remaining integer,paused boolean default false,
    observed_remaining integer,observed_used integer,observed_last integer,observed_at timestamptz,updated_at timestamptz);
    insert into public.gtl_odds_budget(provider,conservative_remaining) values('the-odds-api',100);
    grant select,update on public.gtl_odds_budget to service_role;`);
  await db.exec(fs.readFileSync('supabase/migrations/20261029165947_gtl_epl_moneyline_collector.sql', 'utf8'));
  for (const [i, owner] of [EVAN, SEAN, STEVEN].entries()) {
    await db.query('insert into auth.users values($1)', [U(i + 1)]);
    await db.query('update public.gtl_epl_managers set user_id=$1 where owner_id=$2', [U(i + 1), owner]);
  }
  await db.query('insert into auth.users values($1)', [U(9)]);
  await db.query('insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order) values(2026,9,$1,$2,$3,$4)', [at(T - 3600000), at(K + 86400000), at(K), [EVAN, SEAN, STEVEN]]);
  await db.query("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values('e1',2026,9,'ARS','CHE',$1),('e2',2026,9,'LIV','EVE',$1)", [at(K)]);
  const call = async (name, args = {}) => { const keys = Object.keys(args); return (await db.query(`select public.${name}(${keys.map((k, i) => `${k}=>$${i + 1}`).join(',')}) r`, Object.values(args))).rows[0].r; };
  if (before) await before({ db, call });
  await db.exec(fs.readFileSync(FILE, 'utf8'));
  const legacy = (user, event, club, price, lock = false, time = T) => call('gtl_epl_save_guess', { p_user: user, p_event_id: event, p_club: club, p_price: price, p_lock: lock, p_now: at(time) });
  const save = (user, event, market, outcome, price, lock = false, time = T) => call('gtl_epl_save_market_guess', { p_user: user, p_event_id: event, p_market: market, p_outcome: outcome, p_price: price, p_lock: lock, p_now: at(time) });
  const board = user => call('gtl_epl_guess_board_markets', { p_user: user, p_season: 2026, p_week: 9 });
  const legacyBoard = user => call('gtl_epl_guess_board', { p_user: user, p_season: 2026, p_week: 9 });
  const row = async (owner, event = 'e1') => (await db.query('select * from public.gtl_epl_guesses where event_id=$1 and owner_id=$2', [event, owner])).rows[0];
  const collection = (id, observed, prices = { home: -120, draw: 260, away: 300 }) => db.query(`insert into public.gtl_epl_moneyline_attempts(id,event_id,kickoff_at,kind,requested_at,expires_at,status)
      values($1,'e1',$2,'open',$3,$4,'refreshed');
    `, [id, at(observed), at(observed - 1000), at(observed + 60000)]).then(() => db.query(`insert into public.gtl_epl_three_way_collections(id,event_id,observed_at,home,away,home_price,draw_price,away_price,book_count,evidence)
      values($1,'e1',$2,'ARS','CHE',$3,$4,$5,3,'{}')`, [id, at(observed), prices.home, prices.draw, prices.away]));
  const dnbCollection = (id, observed, home, away) => db.query(`insert into public.gtl_epl_moneyline_attempts(id,event_id,kickoff_at,kind,requested_at,expires_at,status)
      values($1,'e1',$2,'open',$3,$4,'refreshed')`, [id, at(observed), at(observed - 1000), at(observed + 60000)]).then(() => db.query(`insert into public.gtl_epl_moneyline_collections(id,event_id,observed_at,home,away,home_price,away_price,evidence)
      values($1,'e1',$2,'ARS','CHE',$3,$4,$5)`, [id, at(observed), home, away, { books: { draftkings: {}, fanduel: {} } }]));
  const gate = () => db.query("insert into public.gtl_epl_job_runs(job,slot_start,capability_hash,status,detail) values('dnb-check',clock_timestamp(),repeat('a',64),'succeeded',$1)", [verdict]);
  const enable = () => db.exec("insert into public.gtl_epl_jobs_schedule(job,enabled) values('moneyline',true) on conflict(job) do update set enabled=true");
  const remaining = async () => (await db.query('select conservative_remaining n from public.gtl_odds_budget')).rows[0].n;
  const kickoff = () => db.exec("update public.gtl_epl_fixtures set commence_time=clock_timestamp()-interval '1 minute'");
  return { db, call, legacy, save, board, legacyBoard, row, collection, dnbCollection, gate, enable, remaining, kickoff };
}

test('M-42 migration: hosted since the November 10 apply, builds only on hosted EPL moneyline files and is fix-forward', () => {
  // Hosted as 20261110203759 on November 10, 2026 (RELEASE_2026_11_10_MIGRATIONS_M41_M47.md).
  assert.ok(!NOT_HOSTED.includes(VERSION)); assert.ok(APPLIED.includes(VERSION)); assert.ok(FIX_FORWARD.includes(VERSION));
  assert.equal(REQUIRES[VERSION], undefined);
  for (const hosted of [20261028190000, 20261029060000, 20261029150000, 20261029165947]) assert.ok(APPLIED.includes(hosted));
  const sql = fs.readFileSync(FILE, 'utf8');
  assert.doesNotMatch(sql, /\b(drop table|truncate|delete from)\b/i, 'no stored row is removed');
  assert.doesNotMatch(sql, /insert into public\.gtl_epl_jobs_schedule/i, 'no schedule row is created');
  for (const pending of ['gtl_epl_stat_rechecks', 'gtl_epl_standings', 'gtl_epl_order_corrections']) assert.ok(!sql.includes(pending));
});

test('existing guesses, history, references and the legacy board read exactly as before the migration', async t => {
  let beforeBoards, beforeHistory, beforeRows;
  const f = await setup(t, { before: async ({ db, call }) => {
    await db.query("insert into public.gtl_epl_prices(event_id,club,market,price,observed_at) values('e1','ARS','draw_no_bet',-150,$1)", [at(T - 60000)]);
    await call('gtl_epl_save_guess', { p_user: U(1), p_event_id: 'e1', p_club: 'ARS', p_price: -130, p_lock: true, p_now: at(T) });
    await call('gtl_epl_save_guess', { p_user: U(2), p_event_id: 'e1', p_club: 'CHE', p_price: 120, p_lock: false, p_now: at(T) });
    await call('gtl_epl_save_guess', { p_user: U(2), p_event_id: 'e2', p_club: 'LIV', p_price: -110, p_lock: true, p_now: at(T) });
    beforeBoards = await Promise.all([1, 2, 3, 9].map(n => call('gtl_epl_guess_board', { p_user: U(n), p_season: 2026, p_week: 9 })));
    beforeHistory = (await db.query('select id,season,week,event_id,owner_id,club,price,action,at from public.gtl_epl_guess_history order by id')).rows;
    beforeRows = (await db.query('select event_id,owner_id,club,price,status,saved_at,locked_at,reference_price,reference_observed_at,reference_source,distance from public.gtl_epl_guesses order by event_id,owner_id')).rows;
  } });
  const strip = board => ({ ...board, fixtures: board.fixtures.map(({ kickedOff, ...x }) => x) });
  const after = await Promise.all([1, 2, 3, 9].map(n => f.legacyBoard(U(n))));
  assert.deepEqual(after.map(strip), beforeBoards.map(strip));
  assert.deepEqual((await f.db.query('select id,season,week,event_id,owner_id,club,price,action,at from public.gtl_epl_guess_history order by id')).rows, beforeHistory);
  assert.deepEqual((await f.db.query('select event_id,owner_id,club,price,status,saved_at,locked_at,reference_price,reference_observed_at,reference_source,distance from public.gtl_epl_guesses order by event_id,owner_id')).rows, beforeRows);
  assert.deepEqual((await f.db.query('select distinct market,outcome from public.gtl_epl_guesses')).rows, [{ market: 'draw_no_bet', outcome: null }]);
  const own = (await f.board(U(1))).guesses.find(g => g.ownerId === EVAN);
  assert.equal(own.market, 'draw_no_bet'); assert.equal(own.outcome, 'home'); assert.equal(own.referencePrice, -150); assert.equal(own.distance, 20);
});

test('new objects are service-only, invoker, fixed search path; browser roles get nothing', async t => {
  const f = await setup(t);
  const names = ['gtl_epl_three_way_ready', 'gtl_epl_moneyline_line', 'gtl_epl_guess_market_json', 'gtl_epl_write_guess', 'gtl_epl_save_market_guess',
    'gtl_epl_save_market_guess_current', 'gtl_epl_guess_board_markets', 'gtl_epl_bet_recommendations', 'gtl_epl_begin_moneyline_markets', 'gtl_epl_finish_moneyline_markets'];
  const funcs = (await f.db.query('select proname,prosecdef,proconfig from pg_proc where proname = any($1)', [names])).rows;
  assert.equal(funcs.length, names.length, 'exactly one definition each');
  assert.ok(funcs.every(x => !x.prosecdef && x.proconfig.includes('search_path=""')));
  for (const role of ['anon', 'authenticated']) {
    await f.db.exec(`set role ${role}`);
    await assert.rejects(f.db.query('select * from public.gtl_epl_three_way_collections'), /permission denied/);
    await assert.rejects(f.call('gtl_epl_three_way_ready'), /permission denied/);
    await assert.rejects(f.call('gtl_epl_bet_recommendations', { p_user: U(1), p_season: 2026, p_week: 9 }), /permission denied/);
    await assert.rejects(f.call('gtl_epl_save_market_guess', { p_user: U(1), p_event_id: 'e1', p_market: 'three_way', p_outcome: 'draw', p_price: 250, p_lock: false }), /permission denied/);
    await assert.rejects(f.call('gtl_epl_guess_board_markets', { p_user: U(1), p_season: 2026, p_week: 9 }), /permission denied/);
    await f.db.exec('reset role');
  }
  await f.db.exec('set role service_role');
  assert.equal(await f.call('gtl_epl_three_way_ready'), true);
  await assert.rejects(f.db.query('delete from public.gtl_epl_three_way_collections'), /permission denied/);
  await assert.rejects(f.db.query('update public.gtl_epl_three_way_collections set draw_price=999'), /permission denied/);
  await assert.rejects(f.db.query('delete from public.gtl_epl_guesses'), /permission denied/);
});

test('one guess per match in either market; market, outcome and price become final together at lock-in', async t => {
  const f = await setup(t);
  const draft = await f.save(U(1), 'e1', 'three_way', 'draw', 250);
  assert.equal(draft.market, 'three_way'); assert.equal(draft.outcome, 'draw'); assert.equal(draft.club, null); assert.equal(draft.state, 'draft');
  const moved = await f.save(U(1), 'e1', 'draw_no_bet', 'away', 140, false, T + 1000);
  assert.equal(moved.market, 'draw_no_bet'); assert.equal(moved.club, 'CHE'); assert.equal(moved.outcome, 'away');
  // A legacy two-way save over a three-way draft leaves a coherent two-way draft, never a mixed row.
  await f.save(U(1), 'e1', 'three_way', 'home', -105, false, T + 2000);
  const legacy = await f.legacy(U(1), 'e1', 'ARS', -130, false, T + 3000);
  assert.equal(legacy.club, 'ARS'); assert.equal(legacy.market, undefined, 'the legacy reply keeps its exact M-32 shape');
  assert.deepEqual((({ market, outcome, club }) => ({ market, outcome, club }))(await f.row(EVAN)), { market: 'draw_no_bet', outcome: null, club: 'ARS' });
  const locked = await f.save(U(1), 'e1', 'three_way', 'away', 300, true, T + 4000);
  assert.equal(locked.status, 'locked'); assert.equal(locked.state, 'pending');
  for (const attempt of [() => f.save(U(1), 'e1', 'draw_no_bet', 'home', -150, false, T + 5000), () => f.save(U(1), 'e1', 'three_way', 'away', 310, true, T + 5000),
    () => f.legacy(U(1), 'e1', 'ARS', -150, false, T + 5000), () => f.call('gtl_epl_save_guess_current', { p_user: U(1), p_event_id: 'e1', p_club: 'ARS', p_price: -150, p_lock: true, p_now: at(T + 5000) })])
    await assert.rejects(attempt(), /GTL_EPL_GUESS_LOCKED/);
  const row = await f.row(EVAN);
  assert.deepEqual([row.market, row.outcome, row.club, row.price, row.status], ['three_way', 'away', 'CHE', 300, 'locked']);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_guesses where owner_id=$1', [EVAN])).rows[0].n, 1);
  const history = (await f.db.query('select market,outcome,club,price,action from public.gtl_epl_guess_history where owner_id=$1 order by id', [EVAN])).rows;
  assert.deepEqual(history.map(h => [h.market, h.outcome, h.club, h.price, h.action]), [
    ['three_way', 'draw', null, 250, 'draft'], ['draw_no_bet', null, 'CHE', 140, 'draft'], ['three_way', 'home', 'ARS', -105, 'draft'],
    ['draw_no_bet', null, 'ARS', -130, 'draft'], ['three_way', 'away', 'CHE', 300, 'lock']]);
});

test('invalid market, outcome, membership and closed matches refuse without changing a stored draft', async t => {
  const f = await setup(t);
  await f.save(U(1), 'e1', 'three_way', 'home', -120);
  for (const [market, outcome, price, event] of [['draw_no_bet', 'draw', 250, 'e1'], ['three_way', 'tie', 250, 'e1'], ['moneyline', 'home', -120, 'e1'],
    [null, 'home', -120, 'e1'], ['three_way', null, -120, 'e1'], ['three_way', 'draw', 99, 'e1'], ['three_way', 'draw', null, 'e1'], ['three_way', 'draw', 250, 'nope']])
    await assert.rejects(f.save(U(1), event, market, outcome, price), /GTL_EPL_GUESS_INVALID/);
  await assert.rejects(f.legacy(U(1), 'e1', 'LIV', -120), /GTL_EPL_GUESS_INVALID/);
  await assert.rejects(f.legacy(U(1), 'e1', null, -120), /GTL_EPL_GUESS_INVALID/);
  await assert.rejects(f.save(U(9), 'e1', 'three_way', 'draw', 250), /GTL_EPL_FORBIDDEN/);
  await f.db.exec("update public.gtl_epl_fixtures set status='postponed' where event_id='e1'");
  await assert.rejects(f.save(U(1), 'e1', 'three_way', 'draw', 250, true), /GTL_EPL_GUESS_CLOSED/);
  await f.db.exec("update public.gtl_epl_fixtures set status='scheduled' where event_id='e1'");
  await assert.rejects(f.save(U(1), 'e1', 'three_way', 'draw', 250, true, K), /GTL_EPL_GUESS_CLOSED/);
  const row = await f.row(EVAN);
  assert.deepEqual([row.market, row.outcome, row.price, row.status], ['three_way', 'home', -120, 'draft']);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_guess_history')).rows[0].n, 1);
});

test('three-way references: at-lock newest stored, first-after once, never post-kickoff, and never cross-market', async t => {
  const f = await setup(t);
  await f.collection(U(101), T - 60000, { home: -120, draw: 260, away: 300 });
  await f.db.query("insert into public.gtl_epl_prices(event_id,club,market,price,observed_at) values('e1','ARS','draw_no_bet',-200,$1),('e1','CHE','draw_no_bet',170,$1)", [at(T - 30000)]);
  const atLock = await f.save(U(1), 'e1', 'three_way', 'draw', 240, true);
  assert.equal(atLock.referencePrice, 260); assert.equal(atLock.referenceSource, 'at-lock'); assert.equal(atLock.distance, jsDistance(240, 260));
  const home = await f.save(U(2), 'e1', 'three_way', 'home', -100, true, T + 1000);
  assert.equal(home.referencePrice, -120, 'the three-way home price, not the draw-no-bet ARS price'); assert.equal(home.distance, 20);
  const dnb = await f.save(U(3), 'e1', 'draw_no_bet', 'home', -190, true, T + 1000);
  assert.equal(dnb.referencePrice, -200, 'a draw-no-bet guess never takes a three-way price');
  // Pending three-way guess: the first collection after lock-in, never a later one or one after kickoff.
  const pending = await f.save(U(2), 'e2', 'three_way', 'away', 400, true, T + 2000);
  assert.equal(pending.state, 'pending');
  await f.db.query("insert into public.gtl_epl_moneyline_attempts(id,event_id,kickoff_at,kind,requested_at,expires_at,status) values($1,'e2',$2,'open',$3,$4,'refreshed'),($5,'e2',$6,'open',$7,$8,'refreshed')",
    [U(201), at(T + 4000), at(T + 3000), at(T + 60000), U(202), at(T + 10000), at(T + 9000), at(T + 70000)]);
  await f.db.query("insert into public.gtl_epl_three_way_collections(id,event_id,observed_at,home,away,home_price,draw_price,away_price,book_count,evidence) values($1,'e2',$2,'LIV','EVE',-150,280,420,2,'{}'),($3,'e2',$4,'LIV','EVE',-160,290,450,2,'{}')",
    [U(201), at(T + 4000), U(202), at(T + 10000)]);
  assert.equal((await f.call('gtl_epl_resolve_pending_references', { p_event_id: 'e2' })).resolved, 1);
  const resolved = await f.row(SEAN, 'e2');
  assert.deepEqual([resolved.reference_price, resolved.reference_source, resolved.distance], [420, 'first-after', 20]);
  assert.equal((await f.call('gtl_epl_resolve_pending_references', { p_event_id: 'e2' })).resolved, 0, 'a set reference never moves');
  // A pending draw-no-bet guess never resolves from three-way evidence, and a three-way guess never from gtl_epl_prices.
  await f.db.query("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values('e5',2026,9,'MCI','BOU',$1)", [at(K)]);
  await f.save(U(1), 'e5', 'draw_no_bet', 'home', -150, true, T + 20000);
  await f.save(U(3), 'e5', 'three_way', 'home', -150, true, T + 20000);
  await f.db.query("insert into public.gtl_epl_prices(event_id,club,market,price,observed_at) values('e5','MCI','draw_no_bet',-180,$1)", [at(T + 30000)]);
  assert.equal((await f.call('gtl_epl_resolve_pending_references', { p_event_id: 'e5' })).resolved, 1);
  assert.equal((await f.row(EVAN, 'e5')).reference_price, -180);
  assert.equal((await f.row(STEVEN, 'e5')).reference_price, null, 'no three-way observation after this lock-in');
  await f.kickoff();
  await f.db.query("insert into public.gtl_epl_moneyline_attempts(id,event_id,kickoff_at,kind,requested_at,expires_at,status) values($1,'e5',clock_timestamp(),'open',clock_timestamp(),clock_timestamp()+interval '1 minute','refreshed')", [U(203)]);
  await f.db.query("insert into public.gtl_epl_three_way_collections(id,event_id,observed_at,home,away,home_price,draw_price,away_price,book_count,evidence) values($1,'e5',clock_timestamp(),'MCI','BOU',-170,300,460,2,'{}')", [U(203)]);
  assert.equal((await f.call('gtl_epl_resolve_pending_references', { p_event_id: 'e5' })).resolved, 0, 'a post-kickoff price is never used');
  const steven = (await f.board(U(3))).guesses.find(g => g.ownerId === STEVEN && g.eventId === 'e5');
  assert.equal(steven.state, 'unscored');
});

test('reveal isolation: drafts never shown; locked guesses after the caller locks in either market or kickoff; legacy board hides three-way rows', async t => {
  const f = await setup(t);
  await f.save(U(2), 'e1', 'three_way', 'draw', 250, true);
  await f.save(U(3), 'e1', 'three_way', 'home', -120);
  const before = await f.board(U(1));
  assert.deepEqual(before.guesses, []); assert.equal(before.threeWayEntry, true);
  await f.save(U(1), 'e1', 'draw_no_bet', 'home', -130, true);
  const after = await f.board(U(1));
  assert.deepEqual(after.guesses.map(g => [g.ownerId, g.market, g.outcome]).sort(), [[EVAN, 'draw_no_bet', 'home'], [SEAN, 'three_way', 'draw']].sort());
  const legacy = await f.legacyBoard(U(2));
  assert.deepEqual(legacy.guesses.map(g => g.ownerId), [EVAN], 'a three-way lock still reveals; its own three-way row is not sent to a legacy client');
  assert.ok(legacy.guesses.every(g => typeof g.club === 'string' && g.market === undefined));
  assert.deepEqual((await f.legacyBoard(U(3))).guesses, [], 'own three-way draft omitted, others hidden before own lock');
  assert.deepEqual((await f.board(U(9))).guesses, []);
  await f.kickoff();
  const viewer = await f.board(U(9));
  assert.equal(viewer.ownerId, null);
  assert.deepEqual(viewer.guesses.map(g => g.ownerId).sort(), [EVAN, SEAN].sort(), 'after kickoff only locked guesses show; the draft stays hidden');
});

test('combined leaderboard averages both markets with -100 and +100 the same point', async t => {
  const f = await setup(t);
  await f.collection(U(101), T - 60000, { home: 100, draw: 260, away: 300 });
  await f.db.query("insert into public.gtl_epl_prices(event_id,club,market,price,observed_at) values('e2','LIV','draw_no_bet',-150,$1)", [at(T - 60000)]);
  assert.equal((await f.save(U(1), 'e1', 'three_way', 'home', -100, true)).distance, 0, '-100 equals +100');
  assert.equal((await f.save(U(1), 'e2', 'draw_no_bet', 'home', -110, true)).distance, 40);
  assert.equal((await f.save(U(2), 'e1', 'three_way', 'draw', 230, true)).distance, 30);
  await f.save(U(3), 'e1', 'three_way', 'away', 500, true, T - 30000 + 60000);
  await f.db.exec("update public.gtl_epl_guesses set reference_price=null,reference_observed_at=null,reference_source=null,distance=null where owner_id='702644837370929152'");
  await f.kickoff();
  const rows = (await f.call('gtl_epl_guess_leaderboard', { p_season: 2026 })).rows;
  assert.deepEqual(rows.map(r => [r.ownerId, r.average === null ? null : Number(r.average), r.guessed, r.unscored]),
    [[EVAN, 20, 2, 0], [SEAN, 30, 1, 0], [STEVEN, null, 0, 1]]);
});

test('three-way lease reserves one more credit within the reserve; finish stores complete evidence and resolves pending three-way guesses', async t => {
  const f = await setup(t); await f.enable(); await f.gate();
  await f.save(U(1), 'e1', 'three_way', 'draw', 240, true);
  await f.save(U(2), 'e1', 'draw_no_bet', 'home', -130, true);
  const lease = await f.call('gtl_epl_begin_moneyline_markets', { p_event_id: 'e1', p_user: U(1), p_now: at(T) });
  assert.equal(lease.status, 'ready'); assert.equal(lease.threeWay, true); assert.equal(await f.remaining(), 98);
  const done = await f.call('gtl_epl_finish_moneyline_markets', { p_lease: lease.leaseId, p_token: lease.token, p_event: dnbEvidence(T + 1000), p_three_way: threeEvidence(T + 1000), p_now: at(T + 1000) });
  assert.deepEqual(done, { status: 'refreshed', threeWay: true });
  const stored = (await f.db.query('select home_price,draw_price,away_price,book_count from public.gtl_epl_three_way_collections')).rows[0];
  assert.deepEqual(stored, { home_price: jsMedian([-120, -110, -125]), draw_price: jsMedian([260, 250, 270]), away_price: jsMedian([300, 320, 310]), book_count: 3 });
  const three = await f.row(EVAN), dnb = await f.row(SEAN);
  assert.deepEqual([three.reference_price, three.reference_source, three.distance], [260, 'first-after', 20]);
  assert.equal(dnb.reference_price, -145, 'draw-no-bet reference still from its own market'); assert.equal(dnb.reference_source, 'first-after');
  // Replay never replaces evidence.
  assert.equal((await f.call('gtl_epl_finish_moneyline_markets', { p_lease: lease.leaseId, p_token: lease.token, p_event: null, p_three_way: threeEvidence(T + 2000, { books: { draftkings: threeBooks.draftkings, fanduel: threeBooks.fanduel } }), p_now: at(T + 2000) })).threeWay, false);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_three_way_collections')).rows[0].n, 1);
  // At the reserve, the lease stays two-way and never spends below 50.
  await f.db.exec('update public.gtl_odds_budget set conservative_remaining=51');
  await f.save(U(3), 'e2', 'draw_no_bet', 'home', -130, true, T + 600000);
  const thin = await f.call('gtl_epl_begin_moneyline_markets', { p_event_id: 'e2', p_user: U(3), p_now: at(T + 600000) });
  assert.equal(thin.status, 'ready'); assert.equal(thin.threeWay, false); assert.equal(await f.remaining(), 50);
});

test('incomplete or mismatched three-way evidence is never stored and the reservation stands', async t => {
  const f = await setup(t); await f.enable(); await f.gate();
  const bad = [{ books: { draftkings: { home: -120, away: 300 }, fanduel: threeBooks.fanduel } }, { books: { draftkings: threeBooks.draftkings } },
    { books: { draftkings: { home: -120, draw: 260, away: 300, extra: 100 }, fanduel: threeBooks.fanduel } }, { books: { ...threeBooks, caesars: threeBooks.fanduel } },
    { books: { draftkings: { home: -120, draw: 99, away: 300 }, fanduel: threeBooks.fanduel } }, { books: { draftkings: { home: -120, draw: '260', away: 300 }, fanduel: threeBooks.fanduel } },
    { home: 'CHE', away: 'ARS' }, { eventId: 'e2' }, { commenceTime: at(K + 60000) }, { responseSha256: 'x' },
    { bookObservedAt: { draftkings: at(T - 600000), fanduel: at(T), betmgm: at(T) } }];
  let remaining = 100;
  for (let i = 0; i < bad.length; i++) {
    const time = T + i * 600000;
    await f.db.query('delete from public.gtl_epl_moneyline_attempts'); // disposable fixture reset as database owner only
    await f.db.query("update public.gtl_epl_guesses set status='draft',locked_at=null where owner_id=$1", [EVAN]);
    await f.save(U(1), 'e1', 'three_way', 'draw', 240, true, time);
    const lease = await f.call('gtl_epl_begin_moneyline_markets', { p_event_id: 'e1', p_user: U(1), p_now: at(time) });
    assert.equal(lease.status, 'ready', `case ${i}`); remaining -= 2;
    const evidence = threeEvidence(time + 1000, { bookObservedAt: { draftkings: at(time), fanduel: at(time), betmgm: at(time) }, ...bad[i] });
    const result = await f.call('gtl_epl_finish_moneyline_markets', { p_lease: lease.leaseId, p_token: lease.token, p_event: null, p_three_way: evidence, p_now: at(time + 1000) });
    assert.deepEqual(result, { status: 'unavailable', threeWay: false }, `case ${i}`);
  }
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_three_way_collections')).rows[0].n, 0);
  assert.equal(await f.remaining(), remaining, 'no reservation is refunded');
  assert.equal((await f.row(EVAN)).reference_price, null, 'draw-no-bet evidence never resolves a three-way guess');
});

test('a two-way-only lease or legacy finish never prices a three-way guess from draw-no-bet evidence', async t => {
  const f = await setup(t); await f.enable(); await f.gate();
  await f.save(U(1), 'e1', 'three_way', 'home', -150, true);
  const lease = await f.call('gtl_epl_begin_moneyline_read', { p_event_id: 'e1', p_user: U(1), p_now: at(T) });
  assert.equal(lease.status, 'ready');
  assert.deepEqual(await f.call('gtl_epl_finish_moneyline_read', { p_lease: lease.leaseId, p_token: lease.token, p_event: dnbEvidence(T + 1000), p_now: at(T + 1000) }), { status: 'refreshed' });
  assert.equal((await f.row(EVAN)).reference_price, null);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_moneyline_collections')).rows[0].n, 1);
});

test('off switch: capability false refuses three-way entry and its credit, while reads and two-way entry continue', async t => {
  const f = await setup(t); await f.enable(); await f.gate();
  await f.save(U(1), 'e1', 'three_way', 'draw', 250);
  await f.db.exec("create or replace function public.gtl_epl_three_way_ready() returns boolean language sql stable security invoker set search_path='' as $$ select false; $$");
  await assert.rejects(f.save(U(1), 'e1', 'three_way', 'draw', 250, true), /GTL_EPL_MARKET_OFF/);
  const board = await f.board(U(1));
  assert.equal(board.threeWayEntry, false); assert.equal(board.guesses[0].market, 'three_way', 'stored three-way draft still reads');
  assert.equal((await f.save(U(1), 'e1', 'draw_no_bet', 'home', -130, true)).status, 'locked');
  const lease = await f.call('gtl_epl_begin_moneyline_markets', { p_event_id: 'e1', p_user: U(1), p_now: at(T) });
  assert.equal(lease.threeWay, false); assert.equal(await f.remaining(), 99);
});

test('market-aware save wrapper samples its clock after the fixture lock and cannot backdate a lock past kickoff', async t => {
  const f = await setup(t);
  await f.db.query("update public.gtl_epl_fixtures set commence_time=clock_timestamp()-interval '1 second' where event_id='e1'");
  await assert.rejects(f.call('gtl_epl_save_market_guess_current', { p_user: U(1), p_event_id: 'e1', p_market: 'three_way', p_outcome: 'draw', p_price: 250, p_lock: true, p_now: at(Date.now() - 86400000) }), /GTL_EPL_GUESS_CLOSED/);
  const body = (await f.db.query("select prosrc from pg_proc where proname='gtl_epl_save_market_guess_current'")).rows[0].prosrc;
  assert.ok(body.indexOf('for update') < body.indexOf('stamp:=clock_timestamp()'));
});

test('EPL Bets recommendations: own locked guesses only, ordered by favorable gap alone, from stored evidence', async t => {
  const f = await setup(t), N = Date.now();
  await f.db.query("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values('e3',2026,9,'TOT','FUL',$1),('e4',2026,9,'MCI','BOU',$1)", [at(K + 3600000)]);
  await f.save(U(1), 'e1', 'three_way', 'draw', 230, true);              // latest draw +260: gap 30
  await f.save(U(1), 'e2', 'draw_no_bet', 'home', -150, true);           // latest LIV -110: gap 40
  await f.save(U(1), 'e3', 'three_way', 'home', -110, true);             // no stored price: unpriced
  await f.save(U(1), 'e4', 'draw_no_bet', 'away', 150);                  // draft: never a candidate
  await f.save(U(2), 'e1', 'three_way', 'away', 200, true);              // another manager: never in Evan's list
  await f.collection(U(101), N - 9000, { home: -130, draw: 240, away: 330 });
  await f.collection(U(102), N - 5000, { home: -120, draw: 260, away: 300 });
  await f.db.query(`insert into public.gtl_epl_moneyline_attempts(id,event_id,kickoff_at,kind,requested_at,expires_at,status) values($1,'e2',$2,'open',$3,$4,'refreshed')`, [U(103), at(N - 7000), at(N - 8000), at(N + 60000)]);
  await f.db.query(`insert into public.gtl_epl_moneyline_collections(id,event_id,observed_at,home,away,home_price,away_price,evidence) values($1,'e2',$2,'LIV','EVE',-110,-110,$3)`, [U(103), at(N - 7000), { books: { draftkings: {}, fanduel: {}, betmgm: {} } }]);
  const budget = await f.remaining(), attempts = (await f.db.query('select count(*)::int n from public.gtl_epl_moneyline_attempts')).rows[0].n;
  await f.db.exec('set role service_role');
  const reply = await f.call('gtl_epl_bet_recommendations', { p_user: U(1), p_season: 2026, p_week: 9 });
  await f.db.exec('reset role');
  assert.equal(reply.ownerId, EVAN); assert.equal(reply.locked, 3); assert.equal(reply.unpriced, 1); assert.equal(reply.withoutGap, 0);
  assert.deepEqual(reply.items.map(i => [i.eventId, i.market, i.outcome, i.price, i.latestPrice, i.gap]), [['e2', 'draw_no_bet', 'home', -150, -110, 40], ['e1', 'three_way', 'draw', 230, 260, 30]]);
  const draw = reply.items[1];
  assert.equal(draw.club, null); assert.equal(draw.books, 3); assert.equal(draw.firstPrice, 240); assert.equal(draw.observations, 2);
  assert.equal(new Date(draw.latestObservedAt).getTime(), N - 5000);
  assert.ok(!JSON.stringify(reply).includes(SEAN), 'no other manager appears');
  assert.equal(await f.remaining(), budget); assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_moneyline_attempts')).rows[0].n, attempts, 'a read buys nothing');
  // An unfavorable latest price is counted, not recommended; kicked-off matches and non-managers have nothing.
  await f.collection(U(104), N - 1000, { home: -120, draw: 200, away: 300 });
  const later = await f.call('gtl_epl_bet_recommendations', { p_user: U(1), p_season: 2026, p_week: 9 });
  assert.deepEqual(later.items.map(i => i.eventId), ['e2']); assert.equal(later.withoutGap, 1);
  assert.deepEqual((await f.call('gtl_epl_bet_recommendations', { p_user: U(9), p_season: 2026, p_week: 9 })).items, []);
  await f.kickoff();
  assert.deepEqual((await f.call('gtl_epl_bet_recommendations', { p_user: U(1), p_season: 2026, p_week: 9 })).items, []);
});
