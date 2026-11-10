// D-82 Player Props jobs storage (supabase/migrations/20261110160000_gtl_player_props_jobs.sql) and both jobs run end to
// end against it, on local PGlite only: it never connects to the hosted project. Both migrations are written and NOT
// applied, so this suite runs on ALL. Synthetic identities, lines and stats only: not bookmaker quotes or nflverse records.
// Optional disposable PostgreSQL runtime.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ALL, HOSTED, MIGRATIONS_DIR, NOT_HOSTED, PRELUDE, REQUIRES, ROLLBACK_DIR, migrationSql, version } from './migrations.mjs';
import { catalog, parseFunctions, readMigrations } from '../scripts/migration-functions.mjs';
import { propScheduleGames, runPropOffersJob, runPropResultsJob } from '../cloud/player-prop-jobs.mjs';
import { CUT, QB, RB, WR, fakeSources, fetchRow, file, rosterCsv, snapsCsv, statsCsv, threeBooks } from './helpers/player-prop-job-fixtures.mjs';

let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';

const MIGRATION = '20261110160000_gtl_player_props_jobs.sql';
const BASE = '20261110130000_gtl_player_props.sql';
const FUTURE = '2026_10_DAL_PHI', PAST = '2026_10_NYG_WAS';
const iso = ms => new Date(ms).toISOString();
/** An Eastern date and HH:MM for an instant, so the schedule fixture's kickoff is a real future (or past) time. */
const eastern = ms => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};

async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  for (const file of ALL) await db.exec(migrationSql(file));
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const call = (name, args) => as('service_role', `select public.${name}(${Object.keys(args).map((k, i) => `${k}=>$${i + 1}`).join(',')}) value`, Object.values(args)).then(r => r.rows[0].value);
  // The PostgREST adapter's contract (scripts/player-props-jobs.mjs) on PGlite: GTL_* messages become error codes.
  const service = {
    rpc: async (name, body) => {
      try { return await call(name, body); } catch (error) { const code = /GTL_[A-Z_]+/.exec(error.message)?.[0]; throw Object.assign(new Error(code ?? error.message), { code }); }
    },
    rows: async (table, query) => {
      assert.equal(table, 'gtl_research_quote_fetches');
      const { rows } = await as('service_role', `select request_id::text,game_id,markets,status,error,started_at,quote_payload from public.gtl_research_quote_fetches
        where season=$1 and week=$2 and status='finished' and error is null and started_at>=$3 order by started_at desc,request_id desc limit $4`,
      [Number(query.season.slice(3)), Number(query.week.slice(3)), query.started_at.slice(4), Number(query.limit)]);
      return rows.map(row => ({ ...row, started_at: iso(Date.parse(row.started_at)) }));
    },
  };
  const now = Date.now();
  const future = eastern(now + 2 * 86_400_000), past = eastern(now - 2 * 86_400_000);
  const games = (scored = true) => ['game_id,season,game_type,week,gameday,gametime,away_team,home_team,away_score,home_score',
    `${FUTURE},2026,REG,10,${future.day},${future.time},DAL,PHI,,`, `${PAST},2026,REG,10,${past.day},${past.time},NYG,WAS,${scored ? '17,20' : ','}`].join('\n');
  const [futureGame, pastGame] = propScheduleGames(games(), { season: 2026 });
  const insertFetch = async row => db.query(`insert into public.gtl_research_quote_fetches(request_id,lease,season,week,game_id,markets,reserved_credits,status,started_at,expires_at,quota,error,quote_payload)
    values($1,gen_random_uuid(),2026,10,$2,$3,$4,$5,$6,$6::timestamptz+interval '90 seconds','{}',$7,$8)`,
  [row.request_id, row.game_id, row.markets, row.markets.length, row.status, row.started_at, row.error, JSON.stringify(row.quote_payload)]);
  const count = async (table, where = 'true', args = []) => (await db.query(`select count(*)::int n from public.${table} where ${where}`, args)).rows[0].n;
  return { db, as, call, service, now, games, futureGame, pastGame, insertFetch, count };
}

test('D-82 jobs migration: new gtl_props_* functions and gtl_prop_* tables only, not hosted, follows the props migration, no schedule', () => {
  assert.ok(ALL.includes(MIGRATION)); assert.ok(ALL.indexOf(BASE) < ALL.indexOf(MIGRATION));
  assert.ok(NOT_HOSTED.includes(version(MIGRATION))); assert.ok(!HOSTED.includes(MIGRATION));
  assert.deepEqual(REQUIRES[version(MIGRATION)], [version(BASE)]);
  assert.ok(version(MIGRATION) >= 20261110160000);
  const source = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  const before = catalog(readMigrations(ALL.filter(f => f < MIGRATION))).latest;
  const fns = parseFunctions(source, MIGRATION);
  assert.deepEqual(fns.map(fn => fn.name).sort(), ['gtl_props_jobs_capability', 'gtl_props_jobs_state', 'gtl_props_record_check', 'gtl_props_record_review']);
  for (const fn of fns) assert.equal(before.has(`${fn.schema}.${fn.name}`), false, `${fn.name} is new`);
  assert.ok(!fs.existsSync(path.join(ROLLBACK_DIR, MIGRATION)), 'replaces nothing, so it needs no rollback file');
  assert.doesNotMatch(source, /\b(drop|truncate|delete\s+from|alter\s+table\s+public\.gtl_(?!prop_offer_reviews|prop_result_checks))\b/i);
  assert.doesNotMatch(source, /live_lock_in\s*=|cron\.|net\.http|gtl_research_quote_fetches|gtl_odds_budget/i, 'no enable, schedule, provider or budget statement');
  const referenced = new Set([...source.matchAll(/public\.(gtl_[a-z_]+)/g)].map(m => m[1]).filter(name => !/^gtl_props?_/.test(name)));
  assert.deepEqual([...referenced], [], 'only Player Props objects are referenced');
});

test('service-only: RLS on, browsers hold no grants, both tables are append-only', { skip }, async t => {
  const f = await fixture(t);
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['gtl_prop_offer_reviews', 'gtl_prop_result_checks']) {
      assert.equal((await f.db.query(`select has_table_privilege($1,'public.${table}','select,insert,update,delete') ok`, [role])).rows[0].ok, false, `${role} ${table}`);
    }
    for (const sig of ['gtl_props_jobs_capability()', 'gtl_props_record_review(jsonb)', 'gtl_props_record_check(jsonb)', 'gtl_props_jobs_state(integer,integer)'])
      assert.equal((await f.db.query("select has_function_privilege($1,$2,'execute') ok", [role, `public.${sig}`])).rows[0].ok, false, `${role} ${sig}`);
  }
  for (const table of ['gtl_prop_offer_reviews', 'gtl_prop_result_checks']) {
    assert.equal((await f.db.query("select relrowsecurity ok from pg_class where relname=$1", [table])).rows[0].ok, true);
    assert.equal((await f.db.query("select has_table_privilege('service_role',$1,'update,delete') ok", [`public.${table}`])).rows[0].ok, false);
  }
  assert.deepEqual(await f.call('gtl_props_jobs_capability', {}), { jobs: true, ready: false });
  await f.call('gtl_props_record_review', { p_review: { runId: randomUUID(), season: 2026, week: 10, gameId: 'DAL-PHI', playerRef: 'roster-7', stat: 'player_receptions', eligible: false, reasons: ['player_id_invalid'] } });
  await assert.rejects(f.db.query('update public.gtl_prop_offer_reviews set eligible=false'), /GTL_PROPS_APPEND_ONLY/);
  await assert.rejects(f.db.query('delete from public.gtl_prop_offer_reviews'), /GTL_PROPS_APPEND_ONLY/);
});

test('review writer: ineligible needs reasons from the vocabulary, eligible needs the recorded offer and reference, retries replay', { skip }, async t => {
  const f = await fixture(t);
  const runId = randomUUID();
  const review = extra => ({ runId, season: 2026, week: 10, gameId: 'DAL-PHI', playerRef: WR, stat: 'player_reception_yds', eventId: FUTURE, eligible: false, reasons: ['roster_inactive'], ...extra });
  const first = await f.call('gtl_props_record_review', { p_review: review() });
  assert.equal(first.replayed, false);
  assert.equal((await f.call('gtl_props_record_review', { p_review: review() })).replayed, true, 'a retried run replays');
  await assert.rejects(f.call('gtl_props_record_review', { p_review: review({ reasons: ['kicked_off'] }) }), /GTL_PROPS_RETRY_CONFLICT/);
  await assert.rejects(f.call('gtl_props_record_review', { p_review: review({ runId: randomUUID(), reasons: ['looked_fine'] }) }), /check constraint|violates/);
  await assert.rejects(f.call('gtl_props_record_review', { p_review: review({ runId: randomUUID(), reasons: [] }) }), /check constraint|violates/, 'ineligible without a reason');
  await assert.rejects(f.call('gtl_props_record_review', { p_review: review({ runId: randomUUID(), eligible: true, reasons: [], referenceId: randomUUID() }) }), /GTL_PROPS_INVALID/, 'no offer recorded');
  await assert.rejects(f.call('gtl_props_record_review', { p_review: review({ runId: randomUUID(), quoteRequests: ['not-a-uuid'] }) }), /GTL_PROPS_INVALID/);
  await assert.rejects(f.call('gtl_props_record_review', { p_review: review({ runId: randomUUID(), sources: [{ name: 'x', sha256: 'nope' }] }) }), /GTL_PROPS_INVALID/);
  assert.equal(await f.count('gtl_prop_offer_reviews'), 1);
});

test('offer job end to end while dark: only retained quotes, verified roster/schedule, offers + median references + reviews; the board still offers nothing', { skip }, async t => {
  const f = await fixture(t);
  const now = Date.now(), kickoff = f.futureGame.kickoff;
  const opts = { now, kickoff };
  const requestId = randomUUID();
  await f.insertFetch(fetchRow([...threeBooks([66.5, 70.5, 67.5], opts), ...threeBooks(undefined, { ...opts, player: QB }), ...threeBooks(undefined, { ...opts, player: CUT })],
    { requestId, now, minutesAgo: 4 }));
  // An older fetch of the same market is superseded by the newer one and contributes nothing.
  await f.insertFetch(fetchRow(threeBooks([10.5, 10.5, 10.5], { ...opts, player: RB }), { requestId: randomUUID(), now, minutesAgo: 60 }));
  const sources = () => fakeSources({ schedule: file('schedule', f.games()), rosters: file('rosters', rosterCsv()) });
  const runId = randomUUID();
  const args = { service: f.service, season: 2026, week: 10, now, runId };
  const dry = await runPropOffersJob({ ...args, sources: sources(), write: true });
  assert.equal(dry.blocked, 'dark'); assert.equal(await f.count('gtl_prop_offers'), 0, 'dark and not acknowledged: nothing written');
  const summary = await runPropOffersJob({ ...args, sources: sources(), write: true, recordWhileDark: true });
  assert.deepEqual([summary.candidates, summary.eligible, summary.ineligible, summary.reasons], [3, 1, 2, { roster_inactive: 1, position_unsupported: 1 }]);
  const offers = (await f.db.query('select event_id,player_id,stat,player_name,team,position,away,home,kickoff from public.gtl_prop_offers')).rows;
  assert.equal(offers.length, 1);
  assert.deepEqual({ ...offers[0], kickoff: iso(Date.parse(offers[0].kickoff)) }, { event_id: FUTURE, player_id: WR, stat: 'player_reception_yds', player_name: 'Fixture Receiver',
    team: 'DAL', position: 'WR', away: 'DAL', home: 'PHI', kickoff });
  const refs = (await f.db.query('select id,line::float8 line,books from public.gtl_prop_references')).rows;
  assert.equal(refs.length, 1); assert.equal(refs[0].line, 67.5, 'the three-book median, in yards');
  assert.deepEqual(refs[0].books.map(b => b.book), ['betmgm', 'draftkings', 'fanduel']);
  const reviews = (await f.db.query('select player_ref,eligible,reasons,reference_id::text ref,quote_requests::text[] q,event_id from public.gtl_prop_offer_reviews order by player_ref')).rows;
  assert.deepEqual(reviews.map(r => [r.player_ref, r.eligible, r.reasons]), [[WR, true, []], [QB, false, ['roster_inactive']], [CUT, false, ['position_unsupported']]].sort((a, b) => a[0].localeCompare(b[0])));
  const eligible = reviews.find(r => r.eligible);
  assert.equal(eligible.ref, refs[0].id); assert.deepEqual(eligible.q, [requestId]);
  // Dark: the member board offers nothing, and no guess can be written.
  await f.db.query('insert into auth.users values($1)', ['00000000-0000-4000-8000-000000000001']);
  await f.db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Fixture')", ['00000000-0000-4000-8000-000000000001']);
  assert.deepEqual((await f.call('gtl_props_board', { p_user: '00000000-0000-4000-8000-000000000001', p_season: 2026, p_week: 10 })).offers, []);
  // A retried run replays its reviews; the offer is the same row.
  await runPropOffersJob({ ...args, sources: sources(), write: true, recordWhileDark: true });
  assert.equal(await f.count('gtl_prop_offer_reviews'), 3); assert.equal(await f.count('gtl_prop_offers'), 1);
  // Once live, the recorded offer appears and a lock-in finds the recorded reference.
  await f.db.exec('update public.gtl_prop_capability set live_lock_in=true');
  assert.equal((await f.call('gtl_props_board', { p_user: '00000000-0000-4000-8000-000000000001', p_season: 2026, p_week: 10 })).offers.length, 1);
  const locked = await f.call('gtl_props_lock_in', { p_user: '00000000-0000-4000-8000-000000000001', p_request: randomUUID(), p_event_id: FUTURE, p_player_id: WR, p_stat: 'player_reception_yds', p_guess: 72.5 });
  assert.equal(locked.status, 'locked'); assert.equal(Number(locked.reference.line), 67.5);
});

test('result job end to end: verified final, participation before zero, ungraded reasons, and a correction graded only after a second release', { skip }, async t => {
  const f = await fixture(t);
  const now = Date.now();
  const offer = (playerId, stat, team = 'NYG') => f.call('gtl_props_record_offer', { p_offer: { season: 2026, week: 10, eventId: PAST, playerId, stat, playerName: 'Fixture Athlete',
    team, position: 'WR', away: 'NYG', home: 'WAS', kickoff: f.pastGame.kickoff, source: 'fixture roster + schedule' } });
  await offer(WR, 'player_reception_yds'); await offer(RB, 'player_rush_yds'); await offer(QB, 'player_pass_yds');
  const roster = rosterCsv([[WR, 'NYG', 'WR', 'ACT', 'Fixture Receiver', 'pfrWR'], [RB, 'NYG', 'RB', 'ACT', 'Fixture Back', 'pfrRB'], [QB, 'NYG', 'QB', 'INA', 'Fixture Passer', 'pfrQB']]);
  const updatedAt = iso(now - 3_600_000);
  const files = stats => ({ stats: file('stats', stats, { updatedAt }), snaps: file('snaps', snapsCsv([]).replaceAll('2026_10_DAL_PHI', PAST), { updatedAt }),
    rosters: file('rosters', roster, { updatedAt }), schedule: file('schedule', f.games(), { updatedAt }) });
  const run = stats => runPropResultsJob({ service: f.service, sources: fakeSources(files(stats)), season: 2026, week: 10, now, runId: randomUUID(), write: true, recordWhileDark: true });
  const results = async () => (await f.db.query('select player_id,version,status,actual,participated from public.gtl_prop_results order by player_id,version')).rows;

  const first = await run(statsCsv([[WR, PAST, 87, 6]]));
  assert.deepEqual(first.outcomes, { recorded: 2, ungraded: 1 });
  const byPlayer = Object.fromEntries((await results()).map(r => [r.player_id, r]));
  assert.deepEqual([byPlayer[WR].status, byPlayer[WR].actual], ['final', 87]);
  assert.deepEqual([byPlayer[QB].status, byPlayer[QB].participated], ['dnp', false], 'inactive on the weekly roster');
  assert.equal(byPlayer[RB], undefined, 'no row and no participation evidence: no receipt, never a zero');
  const rbCheck = (await f.db.query('select outcome,reason from public.gtl_prop_result_checks where player_id=$1', [RB])).rows;
  assert.deepEqual(rbCheck, [{ outcome: 'ungraded', reason: 'participation_unverified' }]);

  assert.deepEqual((await run(statsCsv([[WR, PAST, 87, 6]]))).outcomes, { unchanged: 2, ungraded: 1 });
  assert.equal(await f.count('gtl_prop_results', 'player_id=$1', [WR]), 1, 'an unchanged observation writes no version');
  // A correction: 87 becomes 91 in a later release. It stays ungraded until a second verified release confirms it.
  const corrected = statsCsv([[WR, PAST, 91, 6]]);
  assert.equal((await run(corrected)).outcomes.correction_pending, 1);
  assert.equal((await run(corrected)).outcomes.correction_unconfirmed, 1, 'the same file twice confirms nothing');
  assert.equal((await run(`${corrected}\n`)).outcomes.recorded, 1, 'a different verified file with the same value confirms it');
  const wr = (await results()).filter(r => r.player_id === WR).map(r => [r.version, r.status, r.actual]);
  assert.deepEqual(wr, [[1, 'final', 87], [2, 'correction_pending', null], [3, 'final', 91]]);
  const state = await f.call('gtl_props_jobs_state', { p_season: 2026, p_week: 10 });
  const wrState = state.offers.find(o => o.playerId === WR);
  assert.deepEqual([wrState.result.version, wrState.result.status, wrState.result.actual], [3, 'final', 91]);
  assert.equal(wrState.lastCheck.outcome, 'recorded');
  assert.doesNotMatch(JSON.stringify(state), /guess|draft|line|price|odds/i, 'the jobs state carries no guess or market number');

  // Not final yet (no score in the schedule): nothing new is recorded and the reason is explicit.
  const before = await f.count('gtl_prop_results');
  const pending = await runPropResultsJob({ service: f.service, sources: fakeSources({ ...files(corrected), schedule: file('schedule', f.games(false), { updatedAt }) }),
    season: 2026, week: 10, now, runId: randomUUID(), write: true, recordWhileDark: true });
  assert.deepEqual(pending.ungraded, { not_final: 3 }); assert.equal(await f.count('gtl_prop_results'), before);
});

test('check writer: result_version must exist for that selection; the check and its outcome stay consistent', { skip }, async t => {
  const f = await fixture(t);
  await f.call('gtl_props_record_offer', { p_offer: { season: 2026, week: 10, eventId: PAST, playerId: WR, stat: 'player_receptions', playerName: 'Fixture', team: 'NYG', position: 'WR',
    away: 'NYG', home: 'WAS', kickoff: f.pastGame.kickoff, source: 'fixture' } });
  const check = extra => ({ runId: randomUUID(), eventId: PAST, playerId: WR, stat: 'player_receptions', outcome: 'recorded', observedStatus: 'final', observedActual: 6,
    observedParticipated: true, reason: null, resultVersion: 1, source: 'nflverse fixture', sourceSha256: 'a'.repeat(64), observedAt: iso(Date.now()), ...extra });
  await assert.rejects(f.call('gtl_props_record_check', { p_check: check() }), /GTL_PROPS_INVALID/, 'no such version');
  await assert.rejects(f.call('gtl_props_record_check', { p_check: check({ outcome: 'ungraded', resultVersion: null }) }), /check constraint|violates/, 'ungraded needs a reason and no status');
  await assert.rejects(f.call('gtl_props_record_check', { p_check: check({ outcome: 'unchanged', resultVersion: null, observedParticipated: false }) }), /check constraint|violates/, 'final needs participation');
  const ok = await f.call('gtl_props_record_check', { p_check: check({ outcome: 'ungraded', observedStatus: null, observedActual: null, observedParticipated: null, reason: 'not_final', resultVersion: null }) });
  assert.equal(ok.replayed, false);
  await assert.rejects(f.call('gtl_props_record_check', { p_check: check({ eventId: FUTURE }) }), /GTL_PROPS_INVALID/, 'only a recorded offer');
});
