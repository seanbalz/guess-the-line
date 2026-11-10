// EPL delivery stage 4 on PGlite with every repo migration (20261110120000_gtl_epl_result_announcements.sql): the results
// job's state, its bounded final-match read reservation and the once-only announcement with delivery claims. The winners
// SQL computes are checked against shared/epl-results.mjs. No hosted connection; pg_net is a local outbox double.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL, PRELUDE, migrationSql } from './migrations.mjs';
import { pickATeamResults } from '../shared/epl-results.mjs';

let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const ENDPOINT = 'https://example.supabase.co/functions/v1/gtl-epl-jobs';
const NEMO = '865667912365666304', CULLEN = '1259267898757611520', ADAM = '719745569895018496', SEAN = '473955676301815808';
const EVAN = '719658248843632640', MARK = '1257180071064510465', DARIN = '1395236217460633600';
const ORDER = [NEMO, CULLEN, ADAM, SEAN, EVAN, MARK];
const user = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SAT = '2026-11-07T15:00:00Z', SUN = '2026-11-08T14:00:00Z', MON = '2026-11-09T20:00:00Z';
const PICKS = [[NEMO, 'MNC'], [CULLEN, 'AVL'], [ADAM, 'LIV'], [SEAN, 'TOT'], [EVAN, 'ARS'], [MARK, 'BRE']];
// [event, home, away, kickoff, status, homeGoals, awayGoals]
const FINALS = [['e1', 'MNC', 'BOU', SAT, 'final', 3, 0], ['e2', 'AVL', 'LIV', SAT, 'final', 1, 1], ['e3', 'TOT', 'CHE', SUN, 'final', 2, 1],
  ['e4', 'ARS', 'EVE', SUN, 'final', 0, 1], ['e5', 'BRE', 'FUL', MON, 'final', 4, 2]];

async function setup(t, { fixtures = FINALS, status = 'resolved', nextOpen = true, budget = 300 } = {}) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  for (const file of ALL) await db.exec(migrationSql(file));
  await db.exec("create schema if not exists net;create table if not exists net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create or replace function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';");
  for (const job of ['results', 'nudge']) await db.query('insert into public.gtl_epl_jobs_schedule(job,enabled,endpoint) values($1,true,$2)', [job, ENDPOINT]);
  await db.query(`insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status) values
    (2026,11,'2026-11-06T00:00Z','2026-11-11T00:00Z',$1,$2,$3)`, [SAT, ORDER, status]);
  if (nextOpen) await db.query(`insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status) values
    (2026,12,'2026-11-11T00:00Z','2026-11-18T00:00Z','2026-11-21T12:30Z',$1,'open')`, [ORDER]);
  for (const [e, h, a, k, s, hg, ag] of fixtures) await db.query('insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time,status,home_goals,away_goals) values($1,2026,11,$2,$3,$4,$5,$6,$7)', [e, h, a, k, s, hg, ag]);
  for (const [owner, club] of PICKS) await db.query("insert into public.gtl_epl_picks(season,week,owner_id,club,source,final) values(2026,11,$1,$2,'pick',true)", [owner, club]);
  // Three linked managers: Nemo (two devices) and Sean opted in; Cullen linked with a disabled subscription; Darin unlinked.
  for (const [n, owner] of [[1, NEMO], [2, SEAN], [3, CULLEN]]) {
    await db.query('insert into auth.users(id) values($1)', [user(n)]);
    await db.query('update public.gtl_epl_managers set user_id=$1 where owner_id=$2', [user(n), owner]);
  }
  const sub = (endpoint, n, disabled = false) => db.query(`insert into public.gtl_push_subscriptions(endpoint,user_id,p256dh,auth,disabled_at) values($1,$2,$3,$4,${disabled ? 'now()' : 'null'})`, [endpoint, user(n), `B${'x'.repeat(86)}`, 'y'.repeat(22)]);
  await sub('https://web.push.apple.com/nemo-phone-0001', 1); await sub('https://web.push.apple.com/nemo-tablet-001', 1);
  await sub('https://web.push.apple.com/sean-phone-0001', 2); await sub('https://web.push.apple.com/cullen-old-0001', 3, true);
  await db.query("update public.gtl_odds_budget set conservative_remaining=$1,paused=false where provider='the-odds-api'", [budget]);
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const rpc = async (name, args) => (await as('service_role', `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value;
  const claimed = async (job = 'results') => {
    // One run per job and five-minute slot: move any run in the current slot to a distinct past slot first.
    await db.query("update public.gtl_epl_job_runs set slot_start=timestamptz '2000-01-01T00:00Z'+(select count(*) from public.gtl_epl_job_runs)*interval '5 minutes' where job=$1 and slot_start>clock_timestamp()-interval '10 minutes'", [job]);
    const queued = (await db.query('select public.gtl_epl_dispatch_jobs($1) value', [job])).rows[0].value;
    const cap = (await db.query("select headers->>'Authorization' auth from net.outbox where body->>'runId'=$1 order by id desc limit 1", [queued.runId])).rows[0].auth.slice(7);
    const reply = await rpc('gtl_epl_claim_job', [cap, queued.runId]);
    return { runId: queued.runId, claim: reply.claim };
  };
  return { db, as, rpc, claimed };
}
const count = async (db, table) => (await db.query(`select count(*)::int n from public.${table}`)).rows[0].n;
const jsFixtures = rows => rows.map(([eventId, home, away, commenceTime, status, homeGoals, awayGoals]) => ({ eventId, home, away, commenceTime, status, homeGoals, awayGoals }));
const jsPicks = PICKS.map(([ownerId, club]) => ({ ownerId, club }));

test('results_state picks the week before an open draft and needs a live results claim', { skip }, async t => {
  const f = await setup(t);
  const run = await f.claimed();
  const state = await f.rpc('gtl_epl_results_state', [run.runId, run.claim]);
  assert.equal(state.week.week, 11); assert.equal(state.week.status, 'resolved');
  assert.equal(state.fixtures.length, 5); assert.equal(state.picks.length, 6); assert.equal(state.announcement, null);
  assert.deepEqual(state.reads, []); assert.deepEqual(state.budget, { remaining: 300, paused: false });
  assert.ok(!JSON.stringify(state).includes('web.push.apple.com') && !JSON.stringify(state).includes(user(1)), 'no endpoint or account id');
  const nudge = await f.claimed('nudge');
  await assert.rejects(() => f.rpc('gtl_epl_results_state', [nudge.runId, nudge.claim]), /GTL_SCHEDULE_RUN/, 'another job cannot read it');
  await assert.rejects(() => f.as('authenticated', 'select public.gtl_epl_results_state($1,$2)', [run.runId, run.claim]), /permission denied/);
  await assert.rejects(() => f.as('anon', 'select * from public.gtl_epl_result_announcements'), /permission denied/);
});

test('verified finals: one announcement with the JS winners, one delivery per opted-in member, nothing on a retry', { skip }, async t => {
  const f = await setup(t);
  const run = await f.claimed();
  const first = await f.rpc('gtl_epl_record_result_announcement', [run.runId, run.claim, 2026, 11, '2026-11-09T23:00:00Z']);
  assert.equal(first.recorded, true); assert.equal(first.notify, true); assert.equal(first.members, 2);
  const expected = pickATeamResults({ season: 2026, week: 11, picks: jsPicks, fixtures: jsFixtures(FINALS) }).winners;
  assert.deepEqual(first.winners, expected);
  assert.deepEqual(first.subscriptions.map(s => s.endpoint).sort(), ['https://web.push.apple.com/nemo-phone-0001', 'https://web.push.apple.com/nemo-tablet-001', 'https://web.push.apple.com/sean-phone-0001']);
  assert.deepEqual((await f.db.query('select owner_id from public.gtl_epl_result_deliveries order by owner_id')).rows.map(r => r.owner_id), [SEAN, NEMO].sort());
  // A retry in the same run and an overlapping later run both get nothing to send.
  assert.deepEqual(await f.rpc('gtl_epl_record_result_announcement', [run.runId, run.claim, 2026, 11, '2026-11-09T23:01:00Z']), { recorded: false, reason: 'announced', subscriptions: [] });
  await f.rpc('gtl_epl_complete_job', [run.runId, run.claim, null, '{}']);
  const later = await f.claimed();
  assert.equal((await f.rpc('gtl_epl_results_state', [later.runId, later.claim])).announcement.notify, true);
  assert.deepEqual(await f.rpc('gtl_epl_record_result_announcement', [later.runId, later.claim, 2026, 11, '2026-11-09T23:15:00Z']), { recorded: false, reason: 'announced', subscriptions: [] });
  assert.equal(await count(f.db, 'gtl_epl_result_announcements'), 1); assert.equal(await count(f.db, 'gtl_epl_result_deliveries'), 2);
  // No settlement, snapshot or bonus row was needed or written.
  assert.equal(await count(f.db, 'gtl_epl_bonus'), 0); assert.equal(await count(f.db, 'gtl_epl_snapshots'), 0);
  assert.equal((await f.db.query("select status from public.gtl_epl_weeks where week=11")).rows[0].status, 'resolved');
  await assert.rejects(() => f.as('service_role', 'delete from public.gtl_epl_result_deliveries'), /permission denied/, 'append-only');
});

test('a scheduled match or a missing drafted fixture refuses the announcement; postponement and ties follow the rules', { skip }, async t => {
  const pending = FINALS.map(r => (r[0] === 'e5' ? ['e5', 'BRE', 'FUL', MON, 'scheduled', null, null] : r));
  const f = await setup(t, { fixtures: pending });
  const run = await f.claimed();
  assert.deepEqual(await f.rpc('gtl_epl_record_result_announcement', [run.runId, run.claim, 2026, 11, '2026-11-12T00:00:00Z']), { recorded: false, reason: 'pending', subscriptions: [] });
  assert.equal(await count(f.db, 'gtl_epl_result_announcements'), 0);
  // Explicit postponement completes the week; Mark's postponed match earns nothing, so Nemo wins alone.
  await f.db.exec("update public.gtl_epl_fixtures set status='postponed' where event_id='e5'");
  // A full shared tie with another club: Evan's ARS also 3-0.
  await f.db.exec("update public.gtl_epl_fixtures set home_goals=3,away_goals=0 where event_id='e4'");
  const tied = await f.rpc('gtl_epl_record_result_announcement', [run.runId, run.claim, 2026, 11, '2026-11-10T00:00:00Z']);
  assert.equal(tied.recorded, true);
  assert.deepEqual(tied.winners.map(w => [w.ownerId, w.club, w.margin, w.bonus]), [[EVAN, 'ARS', 3, 15], [NEMO, 'MNC', 3, 15]].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  const fixtures = (await f.db.query("select event_id,home,away,commence_time,status,home_goals,away_goals from public.gtl_epl_fixtures where week=11")).rows
    .map(r => [r.event_id, r.home, r.away, r.commence_time.toISOString(), r.status, r.home_goals, r.away_goals]);
  assert.deepEqual(tied.winners, pickATeamResults({ picks: jsPicks, fixtures: jsFixtures(fixtures) }).winners);
  assert.deepEqual((await f.db.query('select fixtures,postponed from public.gtl_epl_result_announcements')).rows[0], { fixtures: 5, postponed: 1 });
});

test('no winner is still announced; an old week is announced without a late push', { skip }, async t => {
  const losers = [['e1', 'MNC', 'BOU', SAT, 'final', 0, 0], ['e2', 'AVL', 'LIV', SAT, 'final', 1, 1], ['e3', 'TOT', 'CHE', SUN, 'final', 0, 2],
    ['e4', 'ARS', 'EVE', SUN, 'final', 0, 1], ['e5', 'BRE', 'FUL', MON, 'postponed', null, null]];
  const f = await setup(t, { fixtures: losers });
  const run = await f.claimed();
  const late = await f.rpc('gtl_epl_record_result_announcement', [run.runId, run.claim, 2026, 11, '2026-11-20T00:00:00Z']);
  assert.deepEqual(late, { recorded: true, notify: false, winners: [], members: 0, subscriptions: [] });
  assert.equal(await count(f.db, 'gtl_epl_result_deliveries'), 0);
});

test('final reads: offsets after the latest pending kickoff, 30-minute spacing, four at most, shared 50-credit reserve', { skip }, async t => {
  const pending = FINALS.map(r => (r[0] === 'e5' ? ['e5', 'BRE', 'FUL', MON, 'scheduled', null, null] : r));
  const f = await setup(t, { fixtures: pending, budget: 57 });
  const reserve = async now => { const run = await f.claimed(); const r = await f.rpc('gtl_epl_reserve_final_result_read', [run.runId, run.claim, 2026, 11, now]); await f.rpc('gtl_epl_complete_job', [run.runId, run.claim, 'results_pending', '{}']); return r; };
  const early = await reserve('2026-11-09T22:29:00Z');
  assert.equal(early.ok, false); assert.equal(early.reason, 'not_due'); assert.equal(Date.parse(early.dueAt), Date.parse('2026-11-09T22:30:00Z'));
  assert.deepEqual(await reserve('2026-11-09T22:30:00Z'), { ok: true, attempt: 1, remaining: 55 });
  assert.equal((await reserve('2026-11-09T23:19:00Z')).reason, 'not_due');
  assert.deepEqual(await reserve('2026-11-09T23:20:00Z'), { ok: true, attempt: 2, remaining: 53 });
  assert.deepEqual(await reserve('2026-11-10T01:00:00Z'), { ok: true, attempt: 3, remaining: 51 });
  assert.equal((await reserve('2026-11-10T08:00:00Z')).reason, 'budget_guard', 'never below the 50-credit reserve');
  await f.db.exec("update public.gtl_odds_budget set conservative_remaining=300 where provider='the-odds-api'");
  assert.deepEqual(await reserve('2026-11-10T08:00:00Z'), { ok: true, attempt: 4, remaining: 298 });
  assert.equal((await reserve('2026-11-11T08:00:00Z')).reason, 'limit');
  assert.equal(await count(f.db, 'gtl_epl_final_result_reads'), 4);
  // A pending match rescheduled later moves the anchor, but the 30-minute spacing still holds.
  await f.db.exec('delete from public.gtl_epl_final_result_reads where attempt=4');
  await f.db.exec("update public.gtl_epl_final_result_reads set reserved_at='2026-11-12T10:50:00Z' where attempt=3");
  await f.db.exec("update public.gtl_epl_fixtures set commence_time='2026-11-10T04:00:00Z' where event_id='e5'");
  assert.equal((await reserve('2026-11-12T11:00:00Z')).reason, 'spacing');
  // Once finals are stored, nothing is due; once announced, nothing more is bought.
  await f.db.exec("update public.gtl_epl_fixtures set status='final',home_goals=1,away_goals=0 where event_id='e5'");
  assert.equal((await reserve('2026-11-12T12:00:00Z')).reason, 'nothing_due');
});

test('the job constraint admits results alongside every earlier job; an open week reads nothing', { skip }, async t => {
  const f = await setup(t, { status: 'open', nextOpen: false });
  for (const job of ['snapshot', 'fixtures', 'resolve', 'settle', 'dnb-check', 'standings', 'moneyline'])
    await f.db.query('insert into public.gtl_epl_jobs_schedule(job,enabled,endpoint) values($1,false,$2)', [job, ENDPOINT]);
  await assert.rejects(() => f.db.query("insert into public.gtl_epl_jobs_schedule(job) values('other')"), /gtl_epl_jobs_schedule_job_check/);
  const run = await f.claimed();
  assert.deepEqual(await f.rpc('gtl_epl_results_state', [run.runId, run.claim]), { week: null });
  await assert.rejects(() => f.rpc('gtl_epl_record_result_announcement', [run.runId, run.claim, 2026, 11, null]), /GTL_EPL_NO_WEEK/);
  await assert.rejects(() => f.rpc('gtl_epl_reserve_final_result_read', [run.runId, run.claim, 2026, 11, null]), /GTL_EPL_NO_WEEK/);
});
