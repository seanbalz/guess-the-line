// NBA build-out N2 (M-49, supabase/migrations/20261112040000_gtl_nba_slate_lines.sql; hosted as 20261112055355 on November 12,
// 2026 UTC, RELEASE_2026_11_12_NBA_N2_M49.md) on local PGlite with every repo migration (ALL). It never connects to the hosted
// project and never calls a provider: BALLDONTLIE and The Odds API are local doubles counted by the end-to-end tests, and pg_net
// is a local outbox (as tests/epl-jobs-sql.test.mjs does). Every game, team pairing, time and line is synthetic.
// Optional disposable PostgreSQL runtime.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ALL, APPLIED, NOT_HOSTED, PRELUDE, REQUIRES, ROLLBACK_DIR, migrationSql, version } from './migrations.mjs';
import { createNbaJobsHandler, createNbaSources, NBA_FAIL_REASONS, NBA_SKIP_REASONS } from '../cloud/nba-jobs.mjs';
import { nbaOddsApiName, nbaTeam } from '../shared/nba-teams.mjs';
import { pacificDate } from '../shared/nba-slate.mjs';

let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const { createCommunityWorld, ACCOUNTS } = PGlite ? await import('./cloud-browser/community-world.mjs') : {};

const MIGRATION = '20261112040000_gtl_nba_slate_lines.sql';
const ENDPOINT = 'https://example.supabase.co/functions/v1/gtl-nba-jobs';
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const iso = ms => new Date(ms).toISOString();
/** A stored timestamp (PGlite returns Date objects) in milliseconds; Date.parse would drop the milliseconds. */
const ms = value => new Date(value).getTime();
const sha = text => createHash('sha256').update(text).digest('hex');
const NET = "create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);"
  + "create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as "
  + "'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';";

/** A database with every migration, or (world) the Community fixture world with every migration, for NFL collections. The
 * world's NFL week kicks off at `deadline` and an hour later; by default six hours out, so no test's "now" is in an NFL hour
 * (D-85 item 7) unless it puts one there. */
async function database(t, { world = false, defaults = false, deadline = iso(Date.now() + 6 * HOUR) } = {}) {
  let db, nflUser = null;
  if (world) {
    const w = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false, deadline });
    db = w.db; nflUser = ACCOUNTS.sean.id;
  } else {
    db = new PGlite();
    await db.exec(PRELUDE);
    for (const file of ALL) {
      // Supabase grants every new table and function to the browser roles by default; prove the migration revokes them.
      if (defaults && file === MIGRATION) await db.exec('alter default privileges in schema public grant all on tables to anon,authenticated,service_role;'
        + 'alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;');
      await db.exec(migrationSql(file));
    }
  }
  t.after(() => db.close());
  await db.exec(NET);
  await db.query("insert into public.gtl_nba_jobs_schedule(job,enabled,endpoint) values('slate',true,$1),('lines',true,$1)", [ENDPOINT]);
  await db.query("update public.gtl_odds_budget set conservative_remaining=400,paused=false,lease_token=null,lease_until=null,last_successful_preflight_at=clock_timestamp(),last_collection_at=null");
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const rpc = async (name, args = {}) => (await as('service_role', `select public.${name}(${Object.keys(args).map((k, i) => `${k}=>$${i + 1}`).join(',')}) value`,
    Object.values(args).map(v => (v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v)))).rows[0].value;
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const today = async () => (await one("select (clock_timestamp() at time zone 'America/Los_Angeles')::date::text d")).d;
  /** A run queued as the dispatcher would (its capability's hash only), without the dispatcher's due check. */
  let slots = 0;
  const queue = async job => {
    const token = randomBytes(32).toString('hex');
    const { id } = await one("insert into public.gtl_nba_job_runs(job,slot_start,capability_hash) values($1,timestamptz '2000-01-01'+make_interval(secs=>$2),$3) returning id::text",
      [job, ++slots, sha(token)]);
    return { runId: id, token };
  };
  const claimed = async job => {
    const { runId, token } = await queue(job);
    const reply = await rpc('gtl_nba_claim_job', { p_token: token, p_run: runId });
    return { runId, claim: reply.claim, run: { p_run: runId, p_claim: reply.claim } };
  };
  const publish = async (games, summary = {}) => {
    const { run } = await claimed('slate');
    return rpc('gtl_nba_publish_slate', { ...run, p_date: await today(), p_observed_at: iso(Date.now() - 1000), p_games: games,
      p_summary: { events: 0, linkedEvents: 0, unmatchedEvents: 0, unknownTeamEvents: 0, eventsCost: 0, eventsRead: true, quota: null, ...summary } });
  };
  const stored = gameId => one('select *,game_date::text as day from public.gtl_nba_games where game_id=$1', [gameId]);
  // The game day defaults to the one the plan names now (a game an hour or two out may fall on tomorrow's Pacific date).
  const begin = async gameDate => { const { run } = await claimed('lines'); const due = gameDate ?? (await rpc('gtl_nba_lines_plan', { p_stamp: iso(Date.now()) }))?.gameDate ?? await today(); return rpc('gtl_nba_begin_lines_read', { ...run, p_game_date: due }); };
  const budget = () => one("select conservative_remaining,paused,lease_token::text,lease_until from public.gtl_odds_budget where provider='the-odds-api'");
  const count = async (table, where = 'true', args = []) => (await one(`select count(*)::int n from public.${table} where ${where}`, args)).n;
  /** Publishes an NFL week whose games kick off at `kickoffs` (ms), as gtl_publish_week stores its signature (epoch seconds). */
  let nflWeeks = 0;
  const nflWeek = kickoffs => db.query('insert into public.gtl_weekly_slates(season,week,signature) values(2099,$1,$2)', [++nflWeeks,
    JSON.stringify({ season: 2099, week: nflWeeks, games: kickoffs.map((k, i) => ({ id: `NFL-${nflWeeks}-${i}`, away: 'AAA', home: 'BBB', kickoff: k / 1000 })) })]);
  const plan = at => rpc('gtl_nba_lines_plan', { p_stamp: iso(at) });
  return { db, as, rpc, one, today, queue, claimed, publish, stored, begin, budget, count, nflUser, nflWeek, plan };
}

/** A slate row as the worker sends it (shared/nba-slate.mjs linkNbaSlate). */
const row = (n, { home = 'BOS', away = 'NYK', start = Date.now() + HOUR, odds = start, eventId = `ev${n}`, status = 'scheduled', homeScore = null, awayScore = null } = {}) => ({
  gameId: `NBA:balldontlie:${n}`, sourceDate: new Date((start ?? Date.now()) - 8 * HOUR).toISOString().slice(0, 10), home, away,
  startTime: start === null ? null : iso(start), status, homeScore, awayScore,
  oddsEventId: eventId, oddsCommenceTime: eventId ? iso(odds) : null });
/** A qualified line item: three books one half point apart around `line`, observed a minute before it was collected (now,
 * after the reservation: SQL refuses evidence collected before its read was reserved). */
const qualifiedItem = (gameId, eventId, line = -4.5, collected = Date.now()) => ({
  gameId, oddsEventId: eventId, qualified: true, line, reason: null, collectedAt: iso(collected), observedAt: iso(collected - MIN),
  books: [['draftkings', line - 0.5], ['fanduel', line], ['betmgm', line + 0.5]].map(([book, value]) => ({ book, line: value, homePrice: -110, awayPrice: -110, observedAt: iso(collected - MIN) })),
});
/** Seeds spent NBA credits this month, as finished reads of past game days (never due again). */
async function seedSpent(f, credits) {
  if (!credits) return;
  const { runId } = await f.queue('lines');
  await f.db.query(`insert into public.gtl_nba_line_attempts(run_id,game_date,attempt,status,reserved_credits,observed_cost,requested_at,expires_at,finished_at,lease)
    select $1,date '2020-01-01'+i,1,'finished',1,1,clock_timestamp(),clock_timestamp(),clock_timestamp(),gen_random_uuid() from generate_series(1,$2) i`, [runId, credits]);
}

test('M-49 is registered as hosted: APPLIED, not NOT_HOSTED, no REQUIRES, an off-switch rollback, ledger number in its header', () => {
  assert.ok(ALL.includes(MIGRATION));
  // Hosted as 20261112055355 on November 12, 2026 UTC (RELEASE_2026_11_12_NBA_N2_M49.md).
  assert.ok(APPLIED.includes(version(MIGRATION)));
  assert.ok(!NOT_HOSTED.includes(version(MIGRATION)));
  assert.equal(REQUIRES[version(MIGRATION)], undefined, 'it needed no unapplied file');
  assert.ok(fs.existsSync(`${ROLLBACK_DIR}${MIGRATION}`));
  const sql = fs.readFileSync(`supabase/migrations/${MIGRATION}`, 'utf8');
  assert.match(sql, /^-- M-49 gtl_nba_slate_lines/);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\b(drop|truncate|delete\s+from)\b/i, 'nothing is dropped, truncated or deleted');
});

test('boundary: anon and authenticated reach no gtl_nba_* table or function, even with Supabase default grants', { skip }, async t => {
  const f = await database(t, { defaults: true });
  const tables = (await f.db.query("select c.relname,c.relrowsecurity rls,(select count(*)::int from pg_policy p where p.polrelid=c.oid) policies from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname like 'gtl_nba_%' order by 1")).rows;
  assert.deepEqual(tables.map(r => r.relname), ['gtl_nba_budget', 'gtl_nba_game_observations', 'gtl_nba_games', 'gtl_nba_job_runs', 'gtl_nba_jobs_schedule',
    'gtl_nba_line_attempts', 'gtl_nba_lines', 'gtl_nba_slate_reads']);
  for (const { relname, rls, policies } of tables) {
    assert.equal(rls, true, `${relname}: row level security`); assert.equal(policies, 0, `${relname}: no policy`);
    for (const role of ['anon', 'authenticated']) for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'])
      assert.equal((await f.one('select has_table_privilege($1,$2,$3) ok', [role, `public.${relname}`, privilege])).ok, false, `${role} ${privilege} ${relname}`);
    for (const privilege of ['DELETE', 'TRUNCATE']) assert.equal((await f.one('select has_table_privilege($1,$2,$3) ok', ['service_role', `public.${relname}`, privilege])).ok, false, `service_role ${privilege} ${relname}`);
    for (const role of ['anon', 'authenticated']) await assert.rejects(f.as(role, `select * from public.${relname} limit 1`), /permission denied/, `${role} reads ${relname}`);
  }
  const functions = (await f.db.query("select p.oid::regprocedure::text sig,p.proname,p.prosecdef,p.proconfig from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'gtl_nba_%' or p.proname like 'gtl_dispatch_nba_%') order by 1")).rows;
  assert.ok(functions.length >= 16, 'the earlier NBA cache and tracker functions and every N2 function');
  for (const fn of functions) {
    for (const role of ['anon', 'authenticated']) assert.equal((await f.one("select has_function_privilege($1,$2,'execute') ok", [role, fn.sig])).ok, false, `${role} executes ${fn.sig}`);
  }
  for (const fn of functions.filter(x => /^gtl_(nba_(claim_job|finish_job|publish_slate|lines_due|begin_lines_read|finish_lines_read|shadow_gate|lines_plan|month_spent|append_only|games_guard|attempts_guard)|dispatch_nba_jobs)$/.test(x.proname))) {
    assert.equal(fn.prosecdef, false, `${fn.sig} is security invoker`); assert.deepEqual(fn.proconfig, ['search_path=""'], fn.sig);
    assert.equal((await f.one("select has_function_privilege('service_role',$1,'execute') ok", [fn.sig])).ok, fn.proname !== 'gtl_dispatch_nba_jobs', `service_role ${fn.sig}`);
  }
  for (const role of ['anon', 'authenticated']) await assert.rejects(f.as(role, 'select public.gtl_nba_shadow_gate()'), /permission denied/);
  await assert.rejects(f.as('service_role', "select public.gtl_dispatch_nba_jobs('lines')"), /permission denied/, 'cron only, never the API');
});

test('lines are append-only: no role the API runs as changes or deletes one, and the trigger refuses even the owner', { skip }, async t => {
  const f = await database(t);
  await f.publish([row(1, { start: Date.now() + HOUR })]);
  const begun = await f.begin();
  assert.equal(begun.status, 'ready');
  const done = await f.rpc('gtl_nba_finish_lines_read', { p_attempt: begun.attemptId, p_lease: begun.lease, p_quota: { remaining: 399, used: 101, last: 1 }, p_error: null,
    p_lines: [qualifiedItem('NBA:balldontlie:1', 'ev1')] });
  assert.deepEqual([done.stored, done.qualified, done.error], [1, 1, null]);
  const line = await f.one('select id::text,qualified,line::float8 line from public.gtl_nba_lines');
  assert.deepEqual([line.qualified, line.line], [true, -4.5]);
  for (const sql of ['update public.gtl_nba_lines set line=0', 'delete from public.gtl_nba_lines', 'update public.gtl_nba_game_observations set status=\'final\'',
    'delete from public.gtl_nba_game_observations', 'update public.gtl_nba_slate_reads set games=0', 'delete from public.gtl_nba_slate_reads',
    'delete from public.gtl_nba_line_attempts', 'delete from public.gtl_nba_games', 'delete from public.gtl_nba_job_runs']) {
    await assert.rejects(f.as('service_role', sql), /permission denied/, `service_role: ${sql}`);
    await assert.rejects(f.db.query(sql), /GTL_NBA_APPEND_ONLY/, `owner: ${sql}`);
  }
  await assert.rejects(f.db.query('update public.gtl_nba_line_attempts set reserved_credits=0'), /GTL_NBA_APPEND_ONLY/, 'a finished reservation never changes');
  assert.equal(await f.count('gtl_nba_lines'), 1);
});

test('the 31-credit monthly cap: the 31st credit is reserved, the 32nd is refused and spends nothing', { skip }, async t => {
  await t.test('30 spent: the read reserves the 31st', async t2 => {
    const f = await database(t2);
    await seedSpent(f, 30);
    await f.publish([row(1)]);
    const begun = await f.begin();
    assert.equal(begun.status, 'ready'); assert.equal(begun.spent, 31); assert.equal(begun.cap, 31);
    assert.equal((await f.budget()).conservative_remaining, 399, 'one credit reserved on the shared row');
  });
  await t.test('31 spent: the 32nd is refused, recorded, and the shared budget and lease are untouched', async t2 => {
    const f = await database(t2);
    await seedSpent(f, 31);
    await f.publish([row(1)]);
    const before = await f.budget();
    const refused = await f.begin();
    assert.equal(refused.status, 'refused'); assert.equal(refused.reason, 'cap');
    assert.deepEqual(await f.budget(), before);
    assert.deepEqual(await f.one("select status,refusal,reserved_credits from public.gtl_nba_line_attempts where game_date>date '2021-01-01'"),
      { status: 'refused', refusal: 'cap', reserved_credits: 0 });
    assert.equal(await f.rpc('gtl_nba_month_spent', { p_month_start: (await f.one("select (date_trunc('month',clock_timestamp() at time zone 'UTC') at time zone 'UTC') m")).m }), 31);
  });
  await t.test('the cap row cannot be raised above 31 or the pause lowered below 100', async t2 => {
    const f = await database(t2);
    await assert.rejects(f.db.query('update public.gtl_nba_budget set monthly_cap=32'), /check constraint/);
    await assert.rejects(f.db.query('update public.gtl_nba_budget set pause_below=99'), /check constraint/);
    await assert.rejects(f.as('service_role', 'update public.gtl_nba_budget set paused=false'), /permission denied/);
  });
});

test('an NBA read is refused below the 100-credit pause while an NFL collection still succeeds; NBA never takes the pool under 100', { skip }, async t => {
  await t.test('at 100 remaining NBA is refused and NFL begins its collection', async t2 => {
    const f = await database(t2, { world: true });
    await f.db.query('update public.gtl_odds_budget set conservative_remaining=100');
    await f.publish([row(1)]);
    const refused = await f.begin();
    assert.deepEqual([refused.status, refused.reason], ['refused', 'pause']);
    assert.equal((await f.budget()).conservative_remaining, 100);
    const nfl = await f.rpc('gtl_begin_odds_collection', { p_user: f.nflUser, p_request: randomUUID(), p_operation: 'collect' });
    assert.equal(nfl.replay, false); assert.ok(nfl.lease);
    assert.equal((await f.budget()).conservative_remaining, 98, 'NFL reserved its two credits');
  });
  await t.test('at 101 remaining NBA reserves one credit and leaves exactly 100', async t2 => {
    const f = await database(t2);
    await f.db.query('update public.gtl_odds_budget set conservative_remaining=101');
    await f.publish([row(1)]);
    assert.equal((await f.begin()).status, 'ready');
    assert.equal((await f.budget()).conservative_remaining, 100);
  });
  await t.test('an unknown or paused shared budget refuses NBA', async t2 => {
    const f = await database(t2);
    await f.db.query('update public.gtl_odds_budget set conservative_remaining=null');
    await f.publish([row(1)]);
    assert.equal((await f.begin()).reason, 'budget_unknown');
  });
});

test('NBA and NFL reads serialize on the one shared lease, and NBA is always the lane refused', { skip }, async t => {
  await t.test('an NBA lease makes NFL wait; finishing the NBA read releases it to NFL', async t2 => {
    const f = await database(t2, { world: true });
    await f.publish([row(1)]);
    const nba = await f.begin();
    assert.equal(nba.status, 'ready');
    assert.equal((await f.budget()).lease_token, nba.lease);
    await assert.rejects(f.rpc('gtl_begin_odds_collection', { p_user: f.nflUser, p_request: randomUUID(), p_operation: 'collect' }), /GTL_ODDS_BUSY/);
    await f.rpc('gtl_nba_finish_lines_read', { p_attempt: nba.attemptId, p_lease: nba.lease, p_quota: { remaining: 399, used: 101, last: 1 }, p_error: null, p_lines: [] });
    assert.equal((await f.budget()).lease_token, null);
    assert.equal((await f.rpc('gtl_begin_odds_collection', { p_user: f.nflUser, p_request: randomUUID(), p_operation: 'collect' })).replay, false);
  });
  await t.test('an NFL lease refuses NBA as busy, live or expired, and NBA never clears it', async t2 => {
    const f = await database(t2, { world: true });
    const nfl = await f.rpc('gtl_begin_odds_collection', { p_user: f.nflUser, p_request: randomUUID(), p_operation: 'collect' });
    await f.db.query("update public.gtl_odds_budget set lease_until=clock_timestamp()-interval '1 second'");
    await f.publish([row(1)]);
    const before = await f.budget();
    const refused = await f.begin();
    assert.deepEqual([refused.status, refused.reason], ['refused', 'busy']);
    assert.deepEqual(await f.budget(), before, 'the NFL lease and the shared remaining are untouched');
    assert.equal(before.lease_token, nfl.lease);
  });
  await t.test('NBA clears only its own expired lease, and that read stays counted with no retry', async t2 => {
    const f = await database(t2);
    await f.publish([row(1)]);
    // A worker that reserved a read 31 minutes ago and never finished it: its 30-second lease is still on the shared row.
    const { runId } = await f.queue('lines'), lease = randomUUID();
    const { id } = await f.one(`insert into public.gtl_nba_line_attempts(run_id,game_date,attempt,status,reserved_credits,requested_at,expires_at,lease)
      values($1,$2::date,1,'running',1,clock_timestamp()-interval '31 minutes',clock_timestamp()-interval '30 minutes',$3) returning id::text`,
      // The game's own Pacific day, not today's: near Pacific midnight a game an hour out belongs to tomorrow.
      [runId, (await f.stored('NBA:balldontlie:1')).day, lease]);
    await f.db.query("update public.gtl_odds_budget set lease_token=$1,lease_until=clock_timestamp()-interval '30 minutes'", [lease]);
    assert.equal((await f.begin()).status, 'not_due', 'the unfinished read spent its credit, so there is no retry');
    assert.deepEqual(await f.one('select status,error,reserved_credits from public.gtl_nba_line_attempts where id=$1', [id]),
      { status: 'finished', error: 'lease_expired', reserved_credits: 1 });
    assert.equal((await f.budget()).lease_token, null, 'its own lease is released');
    await assert.rejects(f.rpc('gtl_nba_finish_lines_read', { p_attempt: id, p_lease: randomUUID(), p_quota: null, p_error: null, p_lines: [] }), /GTL_NBA_INVALID/);
    assert.deepEqual(await f.rpc('gtl_nba_finish_lines_read', { p_attempt: id, p_lease: lease, p_quota: { remaining: 1 }, p_error: null, p_lines: [] }),
      { status: 'finished', replay: true, error: 'lease_expired' }, 'a late finish changes nothing');
  });
});

test('a slate upsert never deletes a game, and an event missing from one read never unlinks a game', { skip }, async t => {
  const f = await database(t);
  const first = await f.publish([row(1), row(2, { home: 'LAL', away: 'GSW' }), row(3, { home: 'MIA', away: 'ORL' })], { events: 3, linkedEvents: 3 });
  assert.deepEqual([first.inserted, first.updated, first.linked], [3, 0, 3]);
  const second = await f.publish([{ ...row(1), oddsEventId: null, oddsCommenceTime: null }], { events: 0, unmatchedEvents: 0 });
  assert.deepEqual([second.inserted, second.updated, second.games], [0, 1, 1]);
  assert.equal(await f.count('gtl_nba_games'), 3, 'games the second read did not list are kept');
  assert.equal((await f.stored('NBA:balldontlie:1')).odds_event_id, 'ev1', 'the link stays');
  assert.equal(await f.count('gtl_nba_game_observations'), 4);
  assert.deepEqual(await f.one('select count(*)::int reads,sum(unmatched_events)::int unmatched from public.gtl_nba_slate_reads'), { reads: 2, unmatched: 0 });
  const third = await f.publish([row(4, { home: 'DEN', away: 'UTA' })], { events: 5, linkedEvents: 1, unmatchedEvents: 4, unknownTeamEvents: 1 });
  assert.equal(third.unmatchedEvents, 4);
  assert.deepEqual(await f.one('select unmatched_events,unknown_team_events from public.gtl_nba_slate_reads order by recorded_at desc limit 1'), { unmatched_events: 4, unknown_team_events: 1 });
  // A link another game already holds is never taken.
  const conflict = await f.publish([row(5, { home: 'SAS', away: 'HOU', eventId: 'ev4' })]);
  assert.equal(conflict.linkConflicts, 1);
  assert.equal((await f.stored('NBA:balldontlie:5')).odds_event_id, null);
  await assert.rejects(f.publish([row(6, { home: 'XXX' })]), /GTL_NBA_INVALID/, 'only the 30 NBA codes');
});

test('a final never regresses to another status; its corrected score still records', { skip }, async t => {
  const f = await database(t);
  await f.publish([row(1, { start: Date.now() - 3 * HOUR, status: 'final', homeScore: 110, awayScore: 104 })]);
  const back = await f.publish([row(1, { start: Date.now() - 3 * HOUR, status: 'scheduled' })]);
  assert.equal(back.keptFinal, 1);
  const kept = await f.stored('NBA:balldontlie:1');
  assert.deepEqual([kept.status, kept.home_score, kept.away_score], ['final', 110, 104]);
  await f.publish([row(1, { start: Date.now() - 3 * HOUR, status: 'final', homeScore: 111, awayScore: 104 })]);
  assert.equal((await f.stored('NBA:balldontlie:1')).home_score, 111);
  await assert.rejects(f.db.query("update public.gtl_nba_games set status='scheduled'"), /GTL_NBA_FINAL/);
  assert.equal(await f.count('gtl_nba_game_observations', "status='scheduled'"), 1, 'what the read said is still observed');
});

test('a start time that has passed cannot move, and neither can the lock or the link; a future start time can', { skip }, async t => {
  const f = await database(t);
  const past = Date.now() - 10 * MIN, future = Date.now() + 3 * HOUR;
  await f.publish([row(1, { start: past }), row(2, { home: 'LAL', away: 'GSW', start: future })]);
  const moved = await f.publish([row(1, { start: Date.now() + 2 * HOUR, eventId: 'ev9' }), row(2, { home: 'LAL', away: 'GSW', start: future + HOUR })]);
  assert.equal(moved.keptStart, 1);
  const one = await f.stored('NBA:balldontlie:1'), two = await f.stored('NBA:balldontlie:2');
  assert.equal(ms(one.bdl_start_at), past); assert.equal(ms(one.lock_at), past); assert.equal(one.odds_event_id, 'ev1');
  assert.equal(ms(two.bdl_start_at), future + HOUR, 'before it passes, a start time moves');
  await assert.rejects(f.db.query("update public.gtl_nba_games set bdl_start_at=clock_timestamp()+interval '1 day' where game_id='NBA:balldontlie:1'"), /GTL_NBA_STARTED/);
  await assert.rejects(f.db.query("update public.gtl_nba_games set odds_event_id='other',odds_commence_at=clock_timestamp()+interval '1 day' where game_id='NBA:balldontlie:1'"), /GTL_NBA_STARTED/);
  await assert.rejects(f.db.query("update public.gtl_nba_games set home='LAL' where game_id='NBA:balldontlie:1'"), /GTL_NBA_INVALID/);
});

test('the lock is the earlier start time; an in-progress or final status closes a game at once and it never reopens', { skip }, async t => {
  const f = await database(t);
  const bdl = Date.now() + 2 * HOUR, odds = Date.now() + 80 * MIN;
  await f.publish([row(1, { start: bdl, odds }), row(2, { home: 'LAL', away: 'GSW', start: Date.now() + 4 * HOUR, status: 'in_progress', homeScore: 2, awayScore: 0 })]);
  const one = await f.stored('NBA:balldontlie:1'), two = await f.stored('NBA:balldontlie:2');
  assert.equal(ms(one.lock_at), odds); assert.equal(one.closed_at, null);
  assert.equal(one.day, (await f.one("select ($1::timestamptz at time zone 'America/Los_Angeles')::date::text d", [iso(odds)])).d, 'the game day is the lock\'s Pacific date');
  assert.ok(two.closed_at, 'in progress before its listed start: closed at once');
  await f.publish([row(2, { home: 'LAL', away: 'GSW', start: Date.now() + 4 * HOUR, status: 'scheduled' })]);
  assert.ok((await f.stored('NBA:balldontlie:2')).closed_at, 'a closed game never reopens');
  await f.db.query("update public.gtl_nba_games set closed_at=null where game_id='NBA:balldontlie:2'");
  assert.ok((await f.stored('NBA:balldontlie:2')).closed_at);
  const plan = await f.rpc('gtl_nba_lines_plan', { p_stamp: iso(Date.now()) });
  assert.deepEqual(plan?.games.map(g => g.gameId) ?? [], ['NBA:balldontlie:1'], 'a closed game is never offered a line');
});

test('lines are due 90 minutes before the first tip-off, once a game day, with one retry 30 minutes later only when the first read spent nothing', { skip }, async t => {
  const plan = f => f.rpc('gtl_nba_lines_plan', { p_stamp: iso(Date.now()) });
  const firstAttempt = async (f, { status, cost, minutesAgo }) => {
    const { runId } = await f.queue('lines');
    const at = iso(Date.now() - minutesAgo * MIN);
    await f.db.query(`insert into public.gtl_nba_line_attempts(run_id,game_date,attempt,status,refusal,reserved_credits,observed_cost,requested_at,expires_at,finished_at,lease)
      values($1,$2::date,1,$3,$4,$5,$6,$7,$7::timestamptz+interval '30 seconds',case when $3='running' then null else $7::timestamptz end,case when $3='refused' then null else gen_random_uuid() end)`,
    // The game's own Pacific day, not today's: near Pacific midnight a game an hour out belongs to tomorrow.
    [runId, (await f.stored('NBA:balldontlie:1')).day, status, status === 'refused' ? 'busy' : null, status === 'refused' ? 0 : 1, cost, at]);
  };
  await t.test('not before 90 minutes; due inside them', async t2 => {
    const f = await database(t2);
    const later = Date.now() + 2 * HOUR, soon = Date.now() + 80 * MIN;
    await f.publish([row(1, { start: later })]);
    assert.equal(await plan(f), null);
    await f.publish([row(2, { home: 'LAL', away: 'GSW', start: soon })]);
    const due = await plan(f);
    assert.equal(due.attempt, 1); assert.equal(due.gameDate, (await f.stored('NBA:balldontlie:2')).day);
    // One read covers the whole game day (both games, unless Pacific midnight falls between them).
    assert.deepEqual(due.games.map(g => g.gameId).sort(), pacificDate(later) === pacificDate(soon) ? ['NBA:balldontlie:1', 'NBA:balldontlie:2'] : ['NBA:balldontlie:2']);
  });
  await t.test('an unlinked game day is not due', async t2 => {
    const f = await database(t2);
    await f.publish([row(1, { start: Date.now() + HOUR, eventId: null })]);
    assert.equal(await plan(f), null);
  });
  for (const [label, attempt, retry] of [
    ['a first read that spent 0 credits 31 minutes ago: the retry is due', { status: 'finished', cost: 0, minutesAgo: 31 }, true],
    ['a refused first read 31 minutes ago: the retry is due', { status: 'refused', cost: null, minutesAgo: 31 }, true],
    ['a first read that spent 1 credit: no retry', { status: 'finished', cost: 1, minutesAgo: 31 }, false],
    ['a first read whose cost is unknown: counted as spent, no retry', { status: 'finished', cost: null, minutesAgo: 31 }, false],
    ['a free first read only 10 minutes ago: not yet', { status: 'finished', cost: 0, minutesAgo: 10 }, false],
  ]) {
    await t.test(label, async t2 => {
      const f = await database(t2);
      await f.publish([row(1, { start: Date.now() + HOUR })]);
      await firstAttempt(f, attempt);
      const due = await plan(f);
      assert.equal(due?.attempt ?? null, retry ? 2 : null);
      if (retry) {
        assert.equal((await f.begin()).status, 'ready');
        assert.equal(await plan(f), null, 'no third read');
      }
    });
  }
});

test('the dispatcher queues only what is due and posts only the run capability', { skip }, async t => {
  const f = await database(t);
  const dispatch = async job => (await f.db.query('select public.gtl_dispatch_nba_jobs($1) value', [job])).rows[0].value;
  assert.deepEqual(await dispatch('lines'), { status: 'not_due' });
  assert.equal(await f.count('gtl_nba_job_runs', "job='lines'"), 0, 'nothing due adds no run row');
  assert.equal((await f.db.query('select count(*)::int n from net.outbox')).rows[0].n, 0, 'and posts nothing');
  await f.publish([row(1)]);
  const queued = await dispatch('lines');
  assert.equal(queued.status, 'queued');
  assert.deepEqual(await dispatch('lines'), { status: 'already_dispatched' });
  const posted = (await f.db.query('select url,body,headers from net.outbox')).rows;
  assert.equal(posted.length, 1); assert.equal(posted[0].url, ENDPOINT); assert.deepEqual(posted[0].body, { runId: queued.runId });
  const token = posted[0].headers.Authorization.slice(7);
  assert.equal((await f.one('select capability_hash from public.gtl_nba_job_runs where id=$1', [queued.runId])).capability_hash, sha(token), 'only the hash is kept');
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  const slate = await dispatch('slate');
  if ([9, 15].includes(hour)) assert.equal(slate.status, 'queued'); else assert.deepEqual(slate, { status: 'not_due' }, `Pacific hour ${hour} is not 9 or 15`);
  await f.db.query("update public.gtl_nba_jobs_schedule set enabled=false where job='lines'");
  assert.deepEqual(await dispatch('lines'), { status: 'disabled' });
  await assert.rejects(f.rpc('gtl_nba_claim_job', { p_token: token, p_run: queued.runId }), /GTL_SCHEDULE_AUTH/, 'switching a job off stops its queued run');
});

test('a claim opens exactly its run once; finishing records only the reasons the worker knows', { skip }, async t => {
  const f = await database(t);
  const { runId, token } = await f.queue('lines');
  for (const bad of [null, 'short', 'b'.repeat(64), token.toUpperCase()]) await assert.rejects(f.rpc('gtl_nba_claim_job', { p_token: bad, p_run: runId }), /GTL_SCHEDULE_AUTH/);
  const reply = await f.rpc('gtl_nba_claim_job', { p_token: token, p_run: runId });
  assert.deepEqual(Object.keys(reply).sort(), ['claim', 'job', 'now', 'replay', 'runId']);
  assert.deepEqual(await f.rpc('gtl_nba_claim_job', { p_token: token, p_run: runId }), { replay: true, runId, job: 'lines', status: 'running', reason: null });
  await assert.rejects(f.rpc('gtl_nba_lines_due', { p_run: runId, p_claim: randomUUID() }), /GTL_SCHEDULE_RUN/);
  await assert.rejects(f.rpc('gtl_nba_finish_job', { p_run: runId, p_claim: reply.claim, p_reason: 'made_up', p_detail: {} }), /GTL_SCHEDULE_RUN/);
  for (const [reasons, status] of [[NBA_SKIP_REASONS, 'skipped'], [NBA_FAIL_REASONS, 'failed'], [[null], 'succeeded']]) {
    for (const reason of reasons) {
      const { run } = await f.claimed('lines');
      assert.equal((await f.rpc('gtl_nba_finish_job', { ...run, p_reason: reason, p_detail: { n: 1 } })).status, status, String(reason));
    }
  }
});

test('a lines read stores every game, re-checks qualified evidence in SQL and keeps only lower provider quota', { skip }, async t => {
  const f = await database(t);
  await f.publish([row(1), row(2, { home: 'LAL', away: 'GSW' }), row(3, { home: 'MIA', away: 'ORL' }), row(4, { home: 'DEN', away: 'UTA' }), row(5, { home: 'CHI', away: 'DET' })]);
  const begun = await f.begin();
  const disagree = qualifiedItem('NBA:balldontlie:2', 'ev2');
  disagree.books[2].line = 3; // 7.5 points from the median: the worker's claim of "qualified" is not trusted
  const early = qualifiedItem('NBA:balldontlie:3', 'ev3', -2.5, Date.now() - 10 * MIN); // "collected" before the read was reserved
  const wrongEvent = qualifiedItem('NBA:balldontlie:4', 'ev1'); // another game's event
  const done = await f.rpc('gtl_nba_finish_lines_read', { p_attempt: begun.attemptId, p_lease: begun.lease, p_quota: { remaining: 380, used: 120, last: 1 }, p_error: null,
    p_lines: [qualifiedItem('NBA:balldontlie:1', 'ev1', -6.5), disagree, early, wrongEvent,
      { gameId: 'NBA:balldontlie:5', oddsEventId: 'ev5', qualified: false, line: null, reason: 'too_few_books', collectedAt: iso(Date.now()), books: [] }] });
  assert.deepEqual([done.stored, done.qualified, done.cost, done.error], [5, 1, 1, null]);
  const rows = (await f.db.query('select game_id,qualified,line::float8 line,reason,book_count from public.gtl_nba_lines order by game_id')).rows;
  assert.deepEqual(rows, [
    { game_id: 'NBA:balldontlie:1', qualified: true, line: -6.5, reason: null, book_count: 3 },
    { game_id: 'NBA:balldontlie:2', qualified: false, line: null, reason: 'invalid_evidence', book_count: 3 },
    { game_id: 'NBA:balldontlie:3', qualified: false, line: null, reason: 'invalid_evidence', book_count: 3 },
    { game_id: 'NBA:balldontlie:4', qualified: false, line: null, reason: 'invalid_evidence', book_count: 3 },
    { game_id: 'NBA:balldontlie:5', qualified: false, line: null, reason: 'too_few_books', book_count: 0 }]);
  const b = await f.budget();
  assert.deepEqual([b.conservative_remaining, b.lease_token], [380, null]);
  assert.deepEqual(await f.rpc('gtl_nba_finish_lines_read', { p_attempt: begun.attemptId, p_lease: begun.lease, p_quota: { remaining: 999 }, p_error: null, p_lines: [] }),
    { status: 'finished', replay: true, error: null }, 'a read finishes once');
  assert.equal((await f.budget()).conservative_remaining, 380, 'a higher reported remaining never raises the budget');
});

test('an unexpected cost pauses NBA for the month without pausing the shared budget for NFL or EPL', { skip }, async t => {
  await t.test('a paid read that reports 2 credits', async t2 => {
    const f = await database(t2);
    await f.publish([row(1)]);
    const begun = await f.begin();
    const done = await f.rpc('gtl_nba_finish_lines_read', { p_attempt: begun.attemptId, p_lease: begun.lease, p_quota: { remaining: 397, used: 103, last: 2 }, p_error: 'ODDS_QUOTA_COST', p_lines: [] });
    assert.deepEqual([done.error, done.cost, done.stored], ['unexpected_cost', 2, 0]);
    assert.equal((await f.budget()).paused, false, 'the shared pause is never NBA\'s to set');
    assert.equal(await f.rpc('gtl_nba_month_spent', { p_month_start: (await f.one("select (date_trunc('month',clock_timestamp() at time zone 'UTC') at time zone 'UTC') m")).m }), 2);
  });
  await t.test('a free slate read that reported a cost', async t2 => {
    const f = await database(t2);
    await f.publish([row(1)], { eventsCost: 1, quota: { remaining: 398, used: 102, last: 1 } });
    assert.equal((await f.begin()).reason, 'cost_review');
    assert.equal((await f.budget()).paused, false);
  });
  await t.test('the NBA-only pause', async t2 => {
    const f = await database(t2);
    await f.db.query('update public.gtl_nba_budget set paused=true');
    await f.publish([row(1)]);
    assert.equal((await f.begin()).reason, 'nba_paused');
  });
});

test('the shadow gate opens only after 10 consecutive covered game days at 80%, within the cap and with no lane refused because of NBA', { skip }, async t => {
  /** Game days `days` back from yesterday (Pacific): each with five games, `good` of them linked and qualified. */
  async function seedDays(f, plans) {
    const { runId } = await f.queue('slate');
    let n = 0;
    for (const [back, good, covered = true] of plans) {
      const day = (await f.one("select ((clock_timestamp() at time zone 'America/Los_Angeles')::date-$1::integer)::text d", [back])).d;
      const tip = Date.parse((await f.one("select ($1::date+time '19:00') at time zone 'America/Los_Angeles' t", [day])).t);
      if (covered) {
        const { runId: read } = await f.queue('slate');
        await f.db.query("insert into public.gtl_nba_slate_reads(run_id,center_date,observed_at,games,linked_games,events,linked_events,unmatched_events,unknown_team_events,events_read) values($1,$2::date,$3,5,5,5,5,0,0,true)", [read, day, iso(tip - 6 * HOUR)]);
      }
      if (good === null) continue;
      const { id: attempt } = await f.one(`insert into public.gtl_nba_line_attempts(run_id,game_date,attempt,status,reserved_credits,observed_cost,requested_at,expires_at,finished_at,lease)
        values($1,$2::date,1,'finished',1,1,$3,$3::timestamptz+interval '30 seconds',$3,gen_random_uuid()) returning id::text`, [runId, day, iso(tip - 90 * MIN)]);
      for (let i = 0; i < 5; i++) {
        const gameId = `NBA:balldontlie:${++n}`, [home, away] = [['BOS', 'NYK'], ['LAL', 'GSW'], ['MIA', 'ORL'], ['DEN', 'UTA'], ['SAS', 'HOU']][i];
        await f.db.query("insert into public.gtl_nba_games(game_id,source_date,game_date,home,away,bdl_start_at,odds_event_id,odds_commence_at,status,home_score,away_score,observed_at) values($1,$2::date,$2::date,$3,$4,$5,$6,$5,'final',100,90,$5)",
          [gameId, day, home, away, iso(tip), `g${n}`]);
        if (i < good) await f.db.query(`insert into public.gtl_nba_lines(attempt_id,game_id,odds_event_id,qualified,line,book_count,books,observed_at,collected_at) values($1,$2,$3,true,-3.5,3,'[]',$4,$4)`,
          [attempt, gameId, `g${n}`, iso(tip - 89 * MIN)]);
      }
    }
  }
  const gate = f => f.rpc('gtl_nba_shadow_gate');
  await t.test('10 covered game days at 4 of 5 (80%), with an off day between: open', async t2 => {
    const f = await database(t2);
    await seedDays(f, [[1, 4], [2, 5], [3, null], ...Array.from({ length: 8 }, (_, i) => [i + 4, 4])]);
    const g = await gate(f);
    assert.equal(g.consecutiveGameDays, 10); assert.equal(g.open, true); assert.equal(g.withinCap, true); assert.equal(g.refusedBecauseOfNba, 0);
  });
  await t.test('9 game days: closed', async t2 => {
    const f = await database(t2);
    await seedDays(f, Array.from({ length: 9 }, (_, i) => [i + 1, 5]));
    const g = await gate(f);
    assert.deepEqual([g.consecutiveGameDays, g.open, g.stoppedBy], [9, false, 'not_covered']);
  });
  await t.test('the latest game day at 3 of 5 (60%) resets the count', async t2 => {
    const f = await database(t2);
    await seedDays(f, [[1, 3], ...Array.from({ length: 10 }, (_, i) => [i + 2, 5])]);
    const g = await gate(f);
    assert.deepEqual([g.consecutiveGameDays, g.open, g.stoppedBy], [0, false, 'below_share']);
  });
  await t.test('a day no slate read covered stops the count: missing evidence is not a pass', async t2 => {
    const f = await database(t2);
    // Reads cover their date and the days either side, so a day is uncovered only with no read within a day of it: day 7.
    await seedDays(f, [...Array.from({ length: 5 }, (_, i) => [i + 1, 5]), [6, null, false], [7, 5, false], [8, null, false],
      ...Array.from({ length: 6 }, (_, i) => [i + 9, 5])]);
    const g = await gate(f);
    assert.deepEqual([g.consecutiveGameDays, g.open, g.stoppedBy], [5, false, 'not_covered']);
  });
  await t.test('a game day that lost its read to the NFL hour is not excused: it fails and says why', async t2 => {
    const f = await database(t2);
    await seedDays(f, [[1, 0], ...Array.from({ length: 10 }, (_, i) => [i + 2, 5])]);
    const day = (await f.one("select ((clock_timestamp() at time zone 'America/Los_Angeles')::date-1)::text d")).d;
    const { runId } = await f.queue('lines');
    await f.db.query(`insert into public.gtl_nba_line_attempts(run_id,game_date,attempt,status,refusal,reserved_credits,requested_at,expires_at,finished_at)
      values($1,$2::date,2,'refused','nfl_window',0,clock_timestamp(),clock_timestamp(),clock_timestamp())`, [runId, day]);
    const g = await gate(f);
    assert.deepEqual([g.consecutiveGameDays, g.open, g.stoppedBy, g.days[0].nflWindowRefusals, g.refusedBecauseOfNba], [0, false, 'below_share', 1, 0]);
  });
  await t.test('an EPL run refused for budget while an NBA read held its reservation keeps the gate closed', async t2 => {
    const f = await database(t2);
    await seedDays(f, Array.from({ length: 10 }, (_, i) => [i + 1, 5]));
    const { requested_at: at } = await f.one('select requested_at from public.gtl_nba_line_attempts order by requested_at desc limit 1');
    await f.db.query("insert into public.gtl_epl_job_runs(job,slot_start,capability_hash,status,reason,started_at,claimed_at,finished_at) values('fixtures',$1,$2,'skipped','budget_guard',$1,$1,$1::timestamptz+interval '10 seconds')",
      [iso(ms(at) - 5000), 'c'.repeat(64)]);
    const g = await gate(f);
    assert.deepEqual([g.consecutiveGameDays, g.refusedBecauseOfNba, g.open], [10, 1, false]);
  });
});

test('the rollback revokes every N2 entry point and write from the service role and keeps every row', { skip }, async t => {
  const f = await database(t);
  await f.publish([row(1)]);
  const begun = await f.begin();
  await f.rpc('gtl_nba_finish_lines_read', { p_attempt: begun.attemptId, p_lease: begun.lease, p_quota: { remaining: 399, used: 101, last: 1 }, p_error: null, p_lines: [qualifiedItem('NBA:balldontlie:1', 'ev1')] });
  const counts = async () => Promise.all(['gtl_nba_games', 'gtl_nba_game_observations', 'gtl_nba_slate_reads', 'gtl_nba_line_attempts', 'gtl_nba_lines', 'gtl_nba_job_runs'].map(table => f.count(table)));
  const before = await counts();
  await f.db.exec(fs.readFileSync(`${ROLLBACK_DIR}${MIGRATION}`, 'utf8'));
  assert.deepEqual(await counts(), before);
  for (const sql of ['select public.gtl_nba_shadow_gate()', 'select public.gtl_nba_lines_plan(now())', `select public.gtl_nba_claim_job('${'0'.repeat(64)}','${randomUUID()}')`,
    "insert into public.gtl_nba_job_runs(job,slot_start,capability_hash) values('lines',now(),repeat('a',64))", 'update public.gtl_nba_job_runs set status=status',
    'update public.gtl_nba_line_attempts set error=error']) {
    await assert.rejects(f.as('service_role', sql), /permission denied/, sql);
  }
  assert.equal((await f.as('service_role', 'select count(*)::int n from public.gtl_nba_lines')).rows[0].n, 1, 'evidence stays readable');
});

// ---------- the NFL hour (D-85 item 7: "Yes, avoid that hour") ----------
// Every published NFL kickoff K closes [K - 60 min, K) to NBA's lines read. gtl_nba_lines_plan is read at chosen database
// stamps, so each boundary is checked exactly; begin and the dispatcher run at the database's own clock.

test('the NFL hour: a planned read inside a TNF-style window moves earlier, to a whole cron slot before the window opens', { skip }, async t => {
  const f = await database(t);
  const tip = Date.now() + 4 * HOUR, planned = tip - 90 * MIN, kickoff = planned + 30 * MIN; // window [planned - 30 min, planned + 30 min)
  await f.nflWeek([kickoff]);
  await f.publish([row(1, { start: tip })]);
  assert.equal(await f.plan(kickoff - 66 * MIN), null, 'not before the moved time');
  const moved = await f.plan(kickoff - 65 * MIN);
  assert.deepEqual([moved.state, moved.attempt, ms(moved.dueAt), ms(moved.plannedAt)], ['due', 1, kickoff - 65 * MIN, planned]);
  assert.equal((await f.plan(kickoff - 61 * MIN)).state, 'due', 'the whole five-minute slot before the window is clear');
  const inside = await f.plan(kickoff - 60 * MIN);
  assert.deepEqual([inside.state, ms(inside.nflClearAt)], ['wait', kickoff], 'from K - 60 minutes nothing may begin');
  assert.equal((await f.plan(kickoff - MIN)).state, 'wait');
  assert.equal((await f.plan(kickoff)).state, 'due', 'once the NFL game has kicked off, the read may still run before the NBA lock');
  await t.test('a planned time 2 minutes before a window opens still moves to a whole cron slot before it', async t2 => {
    const g = await database(t2);
    await g.nflWeek([planned + 62 * MIN]); // window opens at planned + 2 min: a cron run in [planned, planned + 5) could land in it
    await g.publish([row(1, { start: tip })]);
    assert.equal(ms((await g.plan(planned)).dueAt), planned - 3 * MIN);
  });
  await t.test('chained windows (a Sunday 1:05 and 1:25 slate) move it before the earlier one', async t2 => {
    const g = await database(t2);
    await g.nflWeek([kickoff, kickoff - 20 * MIN]);
    await g.publish([row(1, { start: tip })]);
    assert.equal(ms((await g.plan(kickoff - 85 * MIN)).dueAt), kickoff - 85 * MIN);
    assert.equal((await g.plan(kickoff - 80 * MIN)).state, 'wait');
  });
});

test('the NFL hour: a cron firing inside the window is refused with 0 credits and does not take the shared lease', { skip }, async t => {
  await t.test('a clear time comes before the NBA lock: refused as nfl_window, nothing recorded, and the read follows the window', async t2 => {
    const f = await database(t2);
    await f.nflWeek([Date.now() + 20 * MIN]);
    await f.publish([row(1, { start: Date.now() + 60 * MIN })]);
    const dispatched = (await f.db.query("select public.gtl_dispatch_nba_jobs('lines') value")).rows[0].value;
    assert.deepEqual(dispatched, { status: 'not_due' }, 'the dispatcher queues nothing inside the window');
    const before = await f.budget();
    const refused = await f.begin();
    assert.deepEqual([refused.status, refused.reason, refused.recorded], ['refused', 'nfl_window', false]);
    assert.deepEqual(await f.budget(), before, 'no credit reserved and no lease taken');
    assert.equal(await f.count('gtl_nba_line_attempts'), 0, 'the day keeps its read and its retry');
    assert.equal((await f.plan(Date.now() + 20 * MIN)).state, 'due', 'after the kickoff the read is due');
  });
  await t.test('no clear time before the NBA lock: the refusal is recorded as the attempt, with 0 credits', async t2 => {
    const f = await database(t2);
    await f.nflWeek([Date.now() + 40 * MIN]);
    await f.publish([row(1, { start: Date.now() + 15 * MIN })]);
    assert.equal((await f.db.query("select public.gtl_dispatch_nba_jobs('lines') value")).rows[0].value.status, 'queued', 'queued so the refusal is recorded');
    const before = await f.budget();
    const refused = await f.begin();
    assert.deepEqual([refused.status, refused.reason, refused.recorded], ['refused', 'nfl_window', true]);
    assert.deepEqual(await f.budget(), before);
    assert.deepEqual(await f.one('select status,refusal,reserved_credits,lease from public.gtl_nba_line_attempts'), { status: 'refused', refusal: 'nfl_window', reserved_credits: 0, lease: null });
    assert.equal(await f.rpc('gtl_nba_month_spent', { p_month_start: (await f.one("select (date_trunc('month',clock_timestamp() at time zone 'UTC') at time zone 'UTC') m")).m }), 0);
  });
});

test('the NFL hour: the one retry respects it too, moving earlier or waiting the window out', { skip }, async t => {
  const f = await database(t);
  const now = Date.now(), kickoff = now + 60 * MIN; // window [now, now + 60 min) holds the retry's planned time, now + 10 min
  await f.nflWeek([kickoff]);
  await f.publish([row(1, { start: now + 3 * HOUR })]);
  const { runId } = await f.queue('lines');
  await f.db.query(`insert into public.gtl_nba_line_attempts(run_id,game_date,attempt,status,refusal,reserved_credits,requested_at,expires_at,finished_at)
    values($1,$2::date,1,'refused','busy',0,$3,$3::timestamptz+interval '30 seconds',$3)`, [runId, (await f.stored('NBA:balldontlie:1')).day, iso(now - 20 * MIN)]);
  assert.equal(await f.plan(kickoff - 66 * MIN), null);
  const retry = await f.plan(kickoff - 65 * MIN);
  assert.deepEqual([retry.state, retry.attempt, ms(retry.plannedAt), ms(retry.dueAt)], ['due', 2, now + 10 * MIN, kickoff - 65 * MIN],
    'moved 15 minutes earlier, out of the window');
  assert.equal((await f.plan(now + 10 * MIN)).state, 'wait', 'its planned time is inside the window');
  const refused = await f.begin();
  assert.deepEqual([refused.reason, refused.recorded, refused.attempt], ['nfl_window', false, 2], 'a late cron inside the window begins nothing');
  assert.equal((await f.plan(kickoff)).state, 'due');
});

test('the NFL hour: a day with no NFL game near it is unchanged', { skip }, async t => {
  const f = await database(t);
  const tip = Date.now() + 80 * MIN;
  await f.publish([row(1, { start: tip })]);
  const plain = await f.plan(Date.now());
  assert.deepEqual([plain.state, ms(plain.dueAt), ms(plain.plannedAt)], ['due', tip - 90 * MIN, tip - 90 * MIN], 'no NFL week published');
  await f.nflWeek([Date.now() + 2 * DAY, Date.now() - 2 * DAY]);
  const far = await f.plan(Date.now());
  assert.deepEqual([far.state, ms(far.dueAt)], ['due', tip - 90 * MIN], 'NFL games two days away change nothing');
  assert.equal((await f.begin()).status, 'ready');
  await t.test('a window opening right after the planned five-minute slot changes nothing', async t2 => {
    const g = await database(t2);
    await g.publish([row(1, { start: tip })]);
    await g.nflWeek([tip - 90 * MIN + 65 * MIN]);
    assert.deepEqual([(await g.plan(tip - 90 * MIN)).state, ms((await g.plan(tip - 90 * MIN)).dueAt)], ['due', tip - 90 * MIN]);
  });
});

test('the NFL hour: NFL claims are unaffected; inside the hour NBA is refused and the NFL collection begins', { skip }, async t => {
  const f = await database(t, { world: true, deadline: iso(Date.now() + 30 * MIN) });
  await f.publish([row(1, { start: Date.now() + 2 * HOUR })]);
  const refused = await f.begin();
  assert.deepEqual([refused.status, refused.reason], ['refused', 'nfl_window']);
  assert.equal((await f.budget()).lease_token, null);
  const nfl = await f.rpc('gtl_begin_odds_collection', { p_user: f.nflUser, p_request: randomUUID(), p_operation: 'collect' });
  assert.equal(nfl.replay, false); assert.ok(nfl.lease);
  assert.equal((await f.budget()).conservative_remaining, 398, 'NFL reserved its two credits; NBA reserved none');
});

// ---------- the worker against the real SQL (local provider doubles only) ----------

/** BALLDONTLIE and The Odds API as the worker calls them, answering from `games`; every request is counted. */
function providers(games, { oddsBooks = ['draftkings', 'fanduel', 'betmgm'], eventTeams = g => [nbaOddsApiName(g.home), nbaOddsApiName(g.away)], extraEvents = [] } = {}) {
  const requests = [];
  const response = (data, last) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'x-requests-remaining': '399', 'x-requests-used': '101', 'x-requests-last': String(last) } });
  const events = () => [...games.map(g => { const [home, away] = eventTeams(g); return { id: `odds_${g.id}`, sport_key: 'basketball_nba', home_team: home, away_team: away, commence_time: iso(g.start) }; }), ...extraEvents];
  const fetchImpl = async url => {
    const u = new URL(url);
    requests.push(u);
    if (u.hostname === 'api.balldontlie.io') return Response.json({ meta: { next_cursor: null }, data: games.map(g => ({ id: g.id, date: new Date(g.start - 8 * HOUR).toISOString().slice(0, 10), datetime: iso(g.start), status_state: 'scheduled', status: 'Scheduled',
      home_team: { id: g.id * 2, full_name: nbaTeam(g.home).name, abbreviation: g.home }, visitor_team: { id: g.id * 2 + 1, full_name: nbaTeam(g.away).name, abbreviation: g.away }, home_team_score: 0, visitor_team_score: 0 })) });
    if (u.pathname === '/v4/sports/basketball_nba/events') return response(events(), 0);
    if (u.pathname === '/v4/sports/basketball_nba/odds') {
      const ids = new Set(u.searchParams.get('eventIds').split(','));
      return response(events().filter(e => ids.has(e.id)).map(e => ({ ...e, bookmakers: oddsBooks.map((key, i) => ({ key, last_update: iso(Date.now() - 30_000), markets: [{ key: 'spreads', last_update: iso(Date.now() - 30_000),
        outcomes: [{ name: e.home_team, point: -4.5 + [0, 0.5, -0.5, 0][i], price: -110 }, { name: e.away_team, point: 4.5 - [0, 0.5, -0.5, 0][i], price: -110 }] }] })) })), 1);
    }
    throw new Error(`unexpected request ${u.hostname}${u.pathname}`);
  };
  return { requests, fetchImpl };
}

async function runWorker(f, job, source) {
  const service = { rpc: async (name, body) => {
    try { return await f.rpc(name, body); } catch (error) { const code = /GTL_[A-Z_]+/.exec(error.message)?.[0]; throw Object.assign(new Error(code ?? 'UNAVAILABLE'), { code: code ?? 'UNAVAILABLE' }); }
  } };
  const sources = createNbaSources({ oddsApiKey: 'fixture-odds-key', ballDontLieKey: 'fixture-bdl-key', fetchImpl: source.fetchImpl });
  const { runId, token } = await f.queue(job);
  const handler = createNbaJobsHandler({ service, sources });
  const response = await handler(new Request(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ runId }) }));
  return { status: response.status, body: await response.json(), run: await f.one('select status,reason,detail from public.gtl_nba_job_runs where id=$1', [runId]) };
}

test('end to end: the slate job takes the NBA lease, makes one BALLDONTLIE and one free /events request, links and counts unmatched events', { skip }, async t => {
  const f = await database(t);
  const start = Date.now() + 2 * HOUR;
  const games = [{ id: 101, home: 'LAC', away: 'DEN', start }, { id: 102, home: 'PHI', away: 'MIA', start: start + HOUR }];
  const source = providers(games, { extraEvents: [{ id: 'odds_allstar', sport_key: 'basketball_nba', home_team: 'Team East', away_team: 'Team West', commence_time: iso(start) },
    { id: 'odds_rev', sport_key: 'basketball_nba', home_team: 'Miami Heat', away_team: 'Philadelphia 76ers', commence_time: iso(start + HOUR) }] });
  const out = await runWorker(f, 'slate', source);
  assert.deepEqual([out.status, out.body.status, out.run.status, out.run.reason], [200, 'succeeded', 'succeeded', null]);
  assert.deepEqual(source.requests.map(u => `${u.hostname}${u.pathname}`), ['api.balldontlie.io/v1/games', 'api.the-odds-api.com/v4/sports/basketball_nba/events']);
  assert.deepEqual([out.run.detail.games, out.run.detail.linkedGames, out.run.detail.unmatchedEvents, out.run.detail.unknownTeamEvents, out.run.detail.reversedEvents], [2, 2, 2, 1, 1]);
  const lac = await f.stored('NBA:balldontlie:101');
  assert.deepEqual([lac.home, lac.away, lac.odds_event_id], ['LAC', 'DEN', 'odds_101'], 'the Clippers link across both providers\' names');
  assert.equal((await f.one('select unmatched_events from public.gtl_nba_slate_reads')).unmatched_events, 2);
  // The board's cache got the same observation, so the next read inside the TTL reuses it and asks BALLDONTLIE nothing.
  await f.db.query("update nba_private.game_provider set cooldown_until=null,lease_until=null");
  const again = await runWorker(f, 'slate', source);
  assert.equal(again.run.status, 'succeeded'); assert.equal(again.run.detail.requested, false);
  assert.equal(source.requests.filter(u => u.hostname === 'api.balldontlie.io').length, 1, 'one BALLDONTLIE request in all');
});

test('end to end: the lines job reads once at 1 credit with basketball_nba spreads, stores qualified lines, then has nothing due and makes no request', { skip }, async t => {
  const f = await database(t);
  const first = Date.now() + 70 * MIN, second = first + 5 * MIN, sameDay = pacificDate(first) === pacificDate(second);
  const games = [{ id: 201, home: 'BOS', away: 'NYK', start: first }, { id: 202, home: 'OKC', away: 'SAS', start: second }];
  const source = providers(games);
  await runWorker(f, 'slate', source);
  const before = source.requests.length;
  const out = await runWorker(f, 'lines', source);
  assert.deepEqual([out.run.status, out.run.reason], ['succeeded', null]);
  const calls = source.requests.slice(before);
  assert.deepEqual(calls.map(u => u.pathname), ['/v4/sports/basketball_nba/events', '/v4/sports/basketball_nba/odds']);
  const odds = calls[1];
  assert.deepEqual([odds.searchParams.get('markets'), odds.searchParams.get('regions'), odds.searchParams.get('bookmakers')], ['spreads', 'us', 'draftkings,fanduel,betmgm,betrivers']);
  const n = sameDay ? 2 : 1;
  assert.deepEqual([out.run.detail.games, out.run.detail.qualified, out.run.detail.cost], [n, n, 1]);
  assert.deepEqual((await f.db.query('select qualified,line::float8 line from public.gtl_nba_lines order by game_id')).rows, Array(n).fill({ qualified: true, line: -4.5 }));
  assert.equal((await f.budget()).lease_token, null);
  const idle = await runWorker(f, 'lines', source);
  assert.deepEqual([idle.run.status, idle.run.reason], ['skipped', 'nothing_due']);
  assert.equal(source.requests.length, before + 2, 'nothing due: no provider request');
});

test('end to end: two books are stored unqualified (too_few_books) and BetRivers stands in for a missing book', { skip }, async t => {
  await t.test('two books', async t2 => {
    const f = await database(t2);
    const source = providers([{ id: 301, home: 'CHI', away: 'DET', start: Date.now() + HOUR }], { oddsBooks: ['draftkings', 'fanduel'] });
    await runWorker(f, 'slate', source);
    await runWorker(f, 'lines', source);
    assert.deepEqual(await f.one('select qualified,reason,book_count from public.gtl_nba_lines'), { qualified: false, reason: 'too_few_books', book_count: 2 });
  });
  await t.test('BetRivers in place of BetMGM', async t2 => {
    const f = await database(t2);
    const source = providers([{ id: 302, home: 'CHI', away: 'DET', start: Date.now() + HOUR }], { oddsBooks: ['draftkings', 'fanduel', 'betrivers'] });
    await runWorker(f, 'slate', source);
    await runWorker(f, 'lines', source);
    const line = await f.one('select qualified,book_count,books from public.gtl_nba_lines');
    assert.equal(line.qualified, true); assert.deepEqual(line.books.map(b => b.book).sort(), ['betrivers', 'draftkings', 'fanduel']);
  });
});
