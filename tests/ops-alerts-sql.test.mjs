import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ALL, APPLIED, NOT_HOSTED, version } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { serviceSql } from './helpers/guess-week.mjs';

// M-38 ops alerts (item 22, docs/OPS_ALERTS.md): the checks, the incidents, the 15-minute dispatcher and the worker's claim,
// mark, delivery and completion, on local PGlite (ALL). pg_net is hosted-only, so net.http_post is a stand-in that records each
// call in an outbox (as tests/features-schedule-sql.test.mjs does). Fixture accounts and fixture rows only.
const MIGRATION = '20261103190000_gtl_ops_alerts.sql';
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const SEAN = ACCOUNTS.sean.id, LUKE = ACCOUNTS.luke.id, TROY = ACCOUNTS.troy.id;
const ENDPOINT = 'https://onmrgvcehkflfaizvedl.supabase.co/functions/v1/gtl-ops-alerts';
const FUNCTION = name => `https://abc.supabase.co/functions/v1/${name}`;
const MINUTE = 60_000, HOUR = 60 * MINUTE, SLOT = 15 * MINUTE;
const iso = ms => new Date(ms).toISOString();
const RUNS = { results: ['gtl_results_refresh_runs', 'nfl-results'], odds: ['gtl_odds_refresh_runs', 'nfl-12h'], points: ['gtl_points_job_runs', 'nfl-points'],
  push: ['gtl_push_reminder_runs', 'deadline-2h'], week_open: ['gtl_week_open_runs', 'nfl-weekly'], features: ['gtl_features_schedule_runs', 'league-features'] };
const EPL_JOBS = ['snapshot', 'fixtures', 'resolve', 'settle', 'nudge', 'dnb-check', 'standings', 'moneyline'];
const WORKER_RPCS = ['gtl_claim_ops_alerts(text,uuid)', 'gtl_mark_ops_notification(uuid,uuid,bigint,text)', 'gtl_record_ops_delivery(uuid,uuid,text,text)',
  'gtl_complete_ops_alerts(uuid,uuid,text,integer,integer)', 'gtl_ops_test_alert()'];
const CRON_ONLY = ['gtl_dispatch_ops_alerts()', 'gtl_ops_findings(timestamptz)'];
const TABLES = ['gtl_ops_alert_schedule', 'gtl_ops_alert_runs', 'gtl_ops_incidents'];
const RULES = { format: 'ppr', passingTds: 4, version: 'v1' };
const SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX'].map(slot => ({ slot }));
// A device subscription in the shape gtl_push_subscriptions accepts.
const device = n => ({ endpoint: `https://fcm.googleapis.com/fcm/send/ops-fixture-${n}`, p256dh: `B${String(n).padStart(86, 'a')}`, auth: String(n).padStart(22, 'b') });

async function fixture(t) {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world;
  await db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';");
  const rows = async (text, params = []) => (await db.query(text, params)).rows;
  const one = async (text, params) => (await rows(text, params))[0];
  // Every job family's schedule row, enabled: a run row needs its schedule, and quiet applies only while enabled.
  await db.exec(`
    insert into public.gtl_results_refresh_schedule(id,enabled,endpoint,authorized_by,season) values('nfl-results',true,'${FUNCTION('gtl-results-refresh')}','${SEAN}',2026);
    insert into public.gtl_odds_schedule(id,enabled,endpoint,authorized_by,season,week,slate_signature) values('nfl-12h',true,'${FUNCTION('gtl-odds-refresh')}','${SEAN}',2026,5,'{}');
    insert into public.gtl_points_job_schedule(id,enabled,endpoint) values('nfl-points',true,'${FUNCTION('gtl-points-jobs')}');
    insert into public.gtl_push_reminder_schedule(id,enabled,endpoint) values('deadline-2h',true,'${FUNCTION('gtl-push-reminders')}');
    insert into public.gtl_week_open_schedule(id,enabled,endpoint,authorized_by,season) values('nfl-weekly',true,'${FUNCTION('gtl-week-open')}','${SEAN}',2026);
    insert into public.gtl_features_schedule(id,enabled,endpoint,authorized_by,season) values('league-features',true,'${FUNCTION('gtl-league-features')}','${SEAN}',2026);
    insert into public.gtl_epl_jobs_schedule(job,enabled,endpoint) select j,true,'${FUNCTION('gtl-epl-jobs')}' from unnest(array['${EPL_JOBS.join("','")}']) j;`);
  const f = {
    world, db, rows, one, call: serviceSql(db),
    /** One run row for a family: its slot and status, finished at `finished` (null while queued or running). */
    run: (family, { slot, status = 'succeeded', finished = slot }) => family.startsWith('epl:')
      ? db.query('insert into public.gtl_epl_job_runs(job,slot_start,capability_hash,status,finished_at) values($1,$2,$3,$4,$5)', [family.slice(4), iso(slot), 'a'.repeat(64), status, finished == null ? null : iso(finished)])
      : db.query(`insert into public.${RUNS[family][0]}(schedule_id,slot_start,capability_hash,status,finished_at) values($1,$2,$3,$4,$5)`, [RUNS[family][1], iso(slot), 'a'.repeat(64), status, finished == null ? null : iso(finished)]),
    findings: async (now, kind) => (await rows('select key,kind,family,season,week,at from public.gtl_ops_findings($1::timestamptz) order by key', [iso(now)]))
      .filter(row => !kind || row.kind === kind).map(row => ({ ...row, at: row.at.toISOString() })),
    pointsSlate: (week, { opensAt, finalizeAt, published = true }) => db.query(`insert into public.gtl_points_slates(season,week,status,opens_at,finalize_at,scoring_rules,slots,provenance,published_at)
      values(2026,$1,$2,$3,$4,$5,$6,'{}',$7)`, [week, published ? 'published' : 'draft', iso(opensAt), iso(finalizeAt), RULES, JSON.stringify(SLOTS), published ? iso(opensAt - HOUR) : null]),
    weeklySlate: (week, deadline) => db.query('insert into public.gtl_weekly_slates(season,week,signature) values(2026,$1,$2)', [week, { season: 2026, week, deadline: deadline / 1000, games: [] }]),
    ops: enabled => db.query("insert into public.gtl_ops_alert_schedule(id,enabled,endpoint) values('ops',$1,$2) on conflict(id) do update set enabled=excluded.enabled", [enabled, ENDPOINT]),
    subscribe: (user, n, disabled = false) => db.query('insert into public.gtl_push_subscriptions(endpoint,user_id,p256dh,auth,disabled_at) values($1,$2,$3,$4,$5)',
      [device(n).endpoint, user, device(n).p256dh, device(n).auth, disabled ? new Date().toISOString() : null]),
    // A dispatch and the claim after it must share one 15-minute slot (the claim refuses another slot's run). Near a slot edge,
    // wait for the next slot first (at most 3 s) so the pair cannot straddle it.
    dispatch: async () => {
      const edge = Date.now() % SLOT;
      if (edge > SLOT - 3000) await new Promise(resolve => setTimeout(resolve, SLOT - edge + 50));
      return (await one('select public.gtl_dispatch_ops_alerts() value')).value;
    },
    outbox: async () => rows('select url,body,headers from net.outbox order by id'),
    lastToken: async () => (await one("select headers->>'Authorization' auth from net.outbox order by id desc limit 1")).auth.slice(7),
    incidents: async () => rows('select id,key,kind,family,season,week,at,opened_at,notified_at,cleared_at,cleared_notified_at from public.gtl_ops_incidents order by id'),
    runs: async () => rows('select id,status,reason,sent,failed from public.gtl_ops_alert_runs order by created_at'),
    // Moves this slot's run (at most one) to its own past slot, as if 15 minutes went by, so the next dispatch may queue again.
    nextSlot: () => db.query("update public.gtl_ops_alert_runs set slot_start=timestamptz '2000-01-01 00:00:00+00'+(select count(*) from public.gtl_ops_alert_runs)*interval '15 minutes' where slot_start=date_bin(interval '15 minutes',clock_timestamp(),timestamptz '2000-01-01 00:00:00+00')"),
  };
  /** The worker's database half for the newest run: claim, mark each alert a device accepted, complete. */
  f.work = async ({ deliver = true } = {}) => {
    const runId = (await one('select id from public.gtl_ops_alert_runs order by created_at desc limit 1')).id;
    const claim = await f.call('gtl_claim_ops_alerts', { p_token: await f.lastToken(), p_run: runId });
    if (claim.replay) return { claim };
    const marks = [];
    if (deliver) for (const n of claim.notifications) marks.push(await f.call('gtl_mark_ops_notification', { p_run: runId, p_claim: claim.claim, p_incident: n.incidentId, p_phase: n.phase }));
    const done = await f.call('gtl_complete_ops_alerts', { p_run: runId, p_claim: claim.claim, p_reason: deliver ? null : 'send_failed',
      p_sent: deliver ? claim.notifications.length : 0, p_failed: deliver ? 0 : claim.notifications.length });
    return { claim, marks, done };
  };
  return f;
}

test('M-38 is written and not applied; the migration inserts no schedule row and registers no cron job', () => {
  assert.ok(ALL.includes(MIGRATION));
  assert.ok(NOT_HOSTED.includes(version(MIGRATION)) && !APPLIED.includes(version(MIGRATION)), 'Gate M applies it separately');
  const sql = fs.readFileSync(new URL(`../supabase/migrations/${MIGRATION}`, import.meta.url), 'utf8');
  assert.doesNotMatch(sql, /insert into public\.gtl_ops_alert_schedule\b/, 'the admin script adds the schedule row, disabled first');
  assert.doesNotMatch(sql, /cron\.schedule/);
  assert.doesNotMatch(sql, /delete from public\.gtl_ops_|truncate/i, 'no incident, run or schedule row is ever deleted (D-23)');
});

test('grants: anon and authenticated cannot execute any M-38 function; the worker functions are service-role only; the dispatcher and findings are cron only; the tables are RLS-on and never deletable', { skip }, async t => {
  const { db } = await fixture(t);
  const can = async (role, fn) => (await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${fn}`, 'EXECUTE'])).rows[0].ok;
  for (const fn of [...WORKER_RPCS, ...CRON_ONLY]) for (const role of ['anon', 'authenticated']) assert.equal(await can(role, fn), false, `${role} ${fn}`);
  for (const fn of WORKER_RPCS) assert.equal(await can('service_role', fn), true, fn);
  for (const fn of CRON_ONLY) assert.equal(await can('service_role', fn), false, `${fn} is cron's alone, as gtl_dispatch_league_features`);
  for (const table of TABLES) {
    assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true, table);
    assert.equal((await db.query('select count(*)::int n from pg_policies where tablename=$1', [table])).rows[0].n, 0, `${table}: no client policy`);
    for (const role of ['anon', 'authenticated']) for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
      assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok', [role, `public.${table}`, priv])).rows[0].ok, false, `${role} ${priv} ${table}`);
    assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok', ['service_role', `public.${table}`, 'DELETE'])).rows[0].ok, false, `DELETE ${table}`);
  }
  for (const table of ['gtl_ops_alert_schedule', 'gtl_ops_alert_runs'])
    assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok', ['service_role', `public.${table}`, 'INSERT'])).rows[0].ok, false, `only the dispatcher writes ${table}`);
});

test('failed:<family> fires when an enabled family\'s latest finished run is failed, from its finish time and not a minute before; partial and skipped are not failures; a later finished run or disabling the family clears it', { skip }, async t => {
  const f = await fixture(t);
  const T = Date.parse('2026-11-02T20:00:00Z');
  const families = [...Object.keys(RUNS), 'epl:moneyline', 'epl:dnb-check'];
  for (const family of families) {
    await f.run(family, { slot: T - HOUR, finished: T - HOUR + 5 * MINUTE });
    await f.run(family, { slot: T, status: 'failed', finished: T + 5 * MINUTE });
  }
  assert.deepEqual(await f.findings(T + 4 * MINUTE, 'failed'), [], 'one minute before the failed run finished');
  const expected = families.map(family => ({ key: `failed:${family}`, kind: 'failed', family, season: null, week: null, at: iso(T + 5 * MINUTE) })).sort((a, b) => a.key.localeCompare(b.key));
  assert.deepEqual(await f.findings(T + 5 * MINUTE, 'failed'), expected);
  // A run still running is not finished: the latest finished run is still the failed one.
  await f.run('results', { slot: T + 30 * MINUTE, status: 'running', finished: null });
  assert.ok((await f.findings(T + HOUR, 'failed')).some(row => row.key === 'failed:results'));
  // Odds partial runs (item 40) and skipped runs are not failures, so they clear; so does a success.
  await f.run('odds', { slot: T + HOUR, status: 'partial' });
  await f.run('points', { slot: T + HOUR, status: 'skipped' });
  await f.run('epl:moneyline', { slot: T + HOUR, status: 'succeeded' });
  assert.deepEqual((await f.findings(T + HOUR, 'failed')).map(row => row.key),
    expected.map(row => row.key).filter(key => !['failed:odds', 'failed:points', 'failed:epl:moneyline'].includes(key)));
  // A disabled family is never failed: it cannot run again to clear the alert.
  await f.db.query("update public.gtl_results_refresh_schedule set enabled=false");
  await f.db.query("update public.gtl_week_open_schedule set enabled=false");
  await f.db.query("update public.gtl_epl_jobs_schedule set enabled=false where job='dnb-check'");
  assert.deepEqual((await f.findings(T + HOUR, 'failed')).map(row => row.key),
    expected.map(row => row.key).filter(key => !['failed:odds', 'failed:points', 'failed:epl:moneyline', 'failed:results', 'failed:week_open', 'failed:epl:dnb-check'].includes(key)));
});

test('quiet:<family> fires when an enabled family\'s newest run is its limit old and not a minute before; disabled families and the unchecked ones are never quiet; a new run clears it', { skip }, async t => {
  const f = await fixture(t);
  const T = Date.parse('2026-11-02T20:00:00Z');
  const limits = { results: 2 * HOUR, odds: 26 * HOUR, points: 26 * HOUR, 'epl:moneyline': HOUR, 'epl:snapshot': HOUR, 'epl:resolve': HOUR, 'epl:nudge': HOUR };
  for (const family of Object.keys(limits)) {
    await f.run(family, { slot: T - 3 * HOUR });
    await f.run(family, { slot: T });
  }
  for (const [family, limit] of Object.entries(limits)) {
    assert.ok(!(await f.findings(T + limit - MINUTE, 'quiet')).some(row => row.family === family), `${family}: one minute before its limit`);
    assert.deepEqual((await f.findings(T + limit, 'quiet')).find(row => row.family === family),
      { key: `quiet:${family}`, kind: 'quiet', family, season: null, week: null, at: iso(T) }, `${family}: at its limit, naming its last run`);
  }
  // Push reminders, week open, features and the other EPL jobs run only when something is due: never quiet.
  for (const family of ['push', 'week_open', 'features', 'epl:fixtures', 'epl:settle', 'epl:dnb-check', 'epl:standings']) await f.run(family, { slot: T });
  const month = T + 30 * 24 * HOUR;
  assert.deepEqual((await f.findings(month, 'quiet')).map(row => row.family).sort(), Object.keys(limits).sort());
  // A disabled schedule is not quiet.
  await f.db.query("update public.gtl_results_refresh_schedule set enabled=false");
  await f.db.query("update public.gtl_odds_schedule set enabled=false");
  await f.db.query("update public.gtl_points_job_schedule set enabled=false");
  await f.db.query("update public.gtl_epl_jobs_schedule set enabled=false where job in ('moneyline','resolve')");
  assert.deepEqual((await f.findings(month, 'quiet')).map(row => row.family).sort(), ['epl:nudge', 'epl:snapshot']);
  // A run row appearing clears it.
  await f.run('epl:nudge', { slot: month - 10 * MINUTE });
  assert.deepEqual((await f.findings(month, 'quiet')).map(row => row.family), ['epl:snapshot']);
});

test('points-open fires 2 hours after the next week\'s expected Tuesday open and not a minute before, DST-safe: a PDT Week 8 open expects Week 9 at 08:00 UTC; publishing clears it', { skip }, async t => {
  const f = await fixture(t);
  // Week 8 opens Tuesday October 27, 12:00 AM PDT (07:00 UTC). Week 9 is due Tuesday November 3, 12:00 AM PST: 08:00 UTC.
  await f.pointsSlate(8, { opensAt: Date.parse('2026-10-27T07:00:00Z'), finalizeAt: Date.parse('2026-11-03T20:00:00Z') });
  const due = Date.parse('2026-11-03T08:00:00Z');
  assert.deepEqual(await f.findings(due + 2 * HOUR - MINUTE, 'points-open'), []);
  const week9 = [{ key: 'points-open:2026-9', kind: 'points-open', family: null, season: 2026, week: 9, at: iso(due) }];
  assert.deepEqual(await f.findings(due + 2 * HOUR, 'points-open'), week9);
  // A draft is not open.
  await f.pointsSlate(9, { opensAt: due, finalizeAt: Date.parse('2026-11-10T20:00:00Z'), published: false });
  assert.deepEqual(await f.findings(due + 2 * HOUR, 'points-open'), week9);
  await f.db.query("update public.gtl_points_slates set status='published',published_at=$1 where season=2026 and week=9", [iso(due)]);
  assert.deepEqual(await f.findings(due + 2 * HOUR, 'points-open'), [], 'published clears it');
  // Week 10 is then expected a week after Week 9's open.
  assert.deepEqual(await f.findings(Date.parse('2026-11-10T10:00:00Z'), 'points-open'),
    [{ key: 'points-open:2026-10', kind: 'points-open', family: null, season: 2026, week: 10, at: '2026-11-10T08:00:00.000Z' }]);
});

test('points-open is anchored on the scheduled Tuesday, not the publish time: Week 8 published early on Monday 10:00 PM PT still expects Week 9 at Tuesday 00:00 PT a week later', { skip }, async t => {
  const f = await fixture(t);
  // A manual early publish stores opens_at = publish time: Monday October 26, 10:00 PM PDT = October 27, 05:00 UTC.
  await f.pointsSlate(8, { opensAt: Date.parse('2026-10-27T05:00:00Z'), finalizeAt: Date.parse('2026-11-03T20:00:00Z') });
  const due = Date.parse('2026-11-03T08:00:00Z');
  assert.deepEqual(await f.findings(due + 2 * HOUR - MINUTE, 'points-open'), [], 'not expected a week after the early publish');
  assert.deepEqual(await f.findings(due + 2 * HOUR, 'points-open'), [{ key: 'points-open:2026-9', kind: 'points-open', family: null, season: 2026, week: 9, at: iso(due) }]);
  // A Sunday open (November 1, 11:59 PM PST, published early the same way) is in the same ISO week: the same Tuesday.
  const sunday = await fixture(t);
  await sunday.pointsSlate(8, { opensAt: Date.parse('2026-11-02T07:59:00Z'), finalizeAt: Date.parse('2026-11-03T20:00:00Z') });
  assert.deepEqual(await sunday.findings(due + 2 * HOUR - MINUTE, 'points-open'), []);
  assert.deepEqual((await sunday.findings(due + 2 * HOUR, 'points-open')).map(row => row.at), [iso(due)]);
});

test('points-final fires an hour after a published slate\'s finalize_at and not a minute before; the FINAL row clears it; a draft is never due', { skip }, async t => {
  const f = await fixture(t);
  const finalize = Date.parse('2026-11-03T20:00:00Z');
  await f.pointsSlate(8, { opensAt: Date.parse('2026-10-26T07:00:00Z'), finalizeAt: finalize });
  await f.pointsSlate(9, { opensAt: Date.parse('2026-11-02T08:00:00Z'), finalizeAt: finalize - HOUR, published: false });
  assert.deepEqual(await f.findings(finalize + HOUR - MINUTE, 'points-final'), []);
  assert.deepEqual(await f.findings(finalize + HOUR, 'points-final'), [{ key: 'points-final:2026-8', kind: 'points-final', family: null, season: 2026, week: 8, at: iso(finalize) }]);
  await f.db.query("insert into public.gtl_points_week_final(season,week,maximum,slots,members,house) values(2026,8,50,'[]','[]','{}')");
  assert.deepEqual(await f.findings(finalize + 2 * HOUR, 'points-final'), []);
});

test('week-open fires 2 hours after the next Spread and Total week\'s expected Monday 12:00 AM PT open and not a minute before, across DST; publishing the week clears it', { skip }, async t => {
  const f = await fixture(t);
  // gtl_weekly_slates is the proof of opening (see the migration header). Week 8's deadline: Thursday October 29, 5:15 PM PDT.
  await f.weeklySlate(8, Date.parse('2026-10-30T00:15:00Z'));
  const due = Date.parse('2026-11-02T08:00:00Z');
  assert.deepEqual(await f.findings(due + 2 * HOUR - MINUTE, 'week-open'), []);
  assert.deepEqual(await f.findings(due + 2 * HOUR, 'week-open'), [{ key: 'week-open:2026-9', kind: 'week-open', family: null, season: 2026, week: 9, at: iso(due) }]);
  await f.weeklySlate(9, Date.parse('2026-11-06T01:15:00Z'));
  assert.deepEqual(await f.findings(due + 2 * HOUR, 'week-open'), [], 'published clears it');
  assert.deepEqual((await f.findings(Date.parse('2026-11-09T10:00:00Z'), 'week-open')).map(row => [row.key, row.at]), [['week-open:2026-10', '2026-11-09T08:00:00.000Z']]);
});

test('Week 19 is never expected: after Week 18 neither Points nor Spread and Total is due', { skip }, async t => {
  const f = await fixture(t);
  await f.pointsSlate(18, { opensAt: Date.parse('2027-01-04T08:00:00Z'), finalizeAt: Date.parse('2027-01-12T20:00:00Z') });
  await f.db.query("insert into public.gtl_points_week_final(season,week,maximum,slots,members,house) values(2026,18,50,'[]','[]','{}')");
  await f.weeklySlate(18, Date.parse('2027-01-09T21:30:00Z'));
  const later = Date.parse('2027-03-01T00:00:00Z');
  assert.deepEqual((await f.findings(later)).filter(row => ['points-open', 'week-open', 'points-final'].includes(row.kind)), []);
});

test('the dispatcher: off until enabled; opens one incident per key and clears it; times out a stale run; queues a run only when a push is owed and the commissioner has a subscription, and one at a time', { skip }, async t => {
  const f = await fixture(t);
  const now = Date.now();
  await f.run('results', { slot: now - 40 * MINUTE, status: 'failed', finished: now - 35 * MINUTE });
  assert.deepEqual(await f.dispatch(), { status: 'disabled' }, 'no schedule row');
  await f.ops(false);
  assert.deepEqual(await f.dispatch(), { status: 'disabled' });
  assert.deepEqual(await f.incidents(), [], 'nothing opens while disabled');
  await f.ops(true);
  assert.deepEqual(await f.dispatch(), { status: 'no_subscriptions', opened: 1, cleared: 0, owed: 1 });
  assert.deepEqual(await f.dispatch(), { status: 'no_subscriptions', opened: 0, cleared: 0, owed: 1 }, 'one open incident per key');
  const [incident] = await f.incidents();
  assert.deepEqual({ ...incident, id: typeof incident.id, at: incident.at.toISOString(), opened_at: incident.opened_at instanceof Date },
    { id: 'number', key: 'failed:results', kind: 'failed', family: 'results', season: null, week: null, at: iso(now - 35 * MINUTE), opened_at: true,
      notified_at: null, cleared_at: null, cleared_notified_at: null });
  await f.subscribe(LUKE, 1);
  await f.subscribe(SEAN, 2, true);
  assert.equal((await f.dispatch()).status, 'no_subscriptions', 'a player\'s device or a disabled one is not the commissioner\'s');
  assert.deepEqual(await f.outbox(), []);
  await f.subscribe(SEAN, 3);
  const queued = await f.dispatch();
  assert.deepEqual({ ...queued, runId: typeof queued.runId }, { status: 'queued', runId: 'string', opened: 0, cleared: 0, owed: 1 });
  const [call] = await f.outbox();
  assert.equal(call.url, ENDPOINT);
  assert.deepEqual(call.body, { runId: queued.runId });
  assert.match(call.headers.Authorization, /^Bearer [0-9a-f]{64}$/);
  assert.deepEqual(await f.dispatch(), { status: 'run_active', opened: 0, cleared: 0, owed: 1 }, 'at most one queued or running run');
  // A run left queued for ten minutes is failed by the next dispatch, exactly as the other dispatchers do, and the push is retried.
  await f.db.query("update public.gtl_ops_alert_runs set created_at=created_at-interval '11 minutes'");
  await f.nextSlot();
  const retried = await f.dispatch();
  assert.equal(retried.status, 'queued');
  assert.deepEqual((await f.runs()).map(r => [r.status, r.reason]), [['failed', 'worker_timeout'], ['queued', null]]);
  const { marks, done } = await f.work();
  assert.deepEqual(marks, [{ recorded: true }]);
  assert.deepEqual(done, { runId: retried.runId, status: 'succeeded', reason: null, sent: 1, failed: 0 });
  assert.deepEqual(await f.dispatch(), { status: 'nothing_owed', opened: 0, cleared: 0, owed: 0 }, 'pushed once, so a quiet tick calls nothing');
  // The results refresh works again: the incident clears and its recovery is owed.
  await f.run('results', { slot: now - 10 * MINUTE, finished: now - 5 * MINUTE });
  await f.nextSlot();
  const recovery = await f.dispatch();
  assert.deepEqual({ ...recovery, runId: typeof recovery.runId }, { status: 'queued', runId: 'string', opened: 0, cleared: 1, owed: 1 });
  const second = await f.work();
  assert.deepEqual(second.claim.notifications.map(n => [n.key, n.phase]), [['failed:results', 'cleared']]);
  assert.deepEqual(second.marks, [{ recorded: true }]);
  await f.nextSlot();
  assert.deepEqual(await f.dispatch(), { status: 'nothing_owed', opened: 0, cleared: 0, owed: 0 });
  assert.equal((await f.outbox()).length, 3);
});

test('a push that fails stays owed and is retried; an incident cleared before it was ever pushed owes nothing, opened or cleared', { skip }, async t => {
  const f = await fixture(t);
  const now = Date.now();
  await f.run('features', { slot: now - 40 * MINUTE, status: 'failed', finished: now - 35 * MINUTE });
  await f.ops(true);
  await f.subscribe(SEAN, 1);
  assert.equal((await f.dispatch()).status, 'queued');
  const first = await f.work({ deliver: false });
  assert.deepEqual(first.claim.notifications.map(n => [n.key, n.phase]), [['failed:features', 'opened']]);
  assert.deepEqual(first.done.status, 'failed');
  await f.nextSlot();
  assert.equal((await f.dispatch()).status, 'queued', 'still owed, so retried');
  const again = await f.work({ deliver: false });
  assert.deepEqual(again.claim.notifications.map(n => [n.key, n.phase]), [['failed:features', 'opened']]);
  await f.run('features', { slot: now - 10 * MINUTE, finished: now - 5 * MINUTE });
  await f.nextSlot();
  assert.deepEqual(await f.dispatch(), { status: 'nothing_owed', opened: 0, cleared: 1, owed: 0 }, 'cleared before notified: no recovery push');
  const [incident] = await f.incidents();
  assert.ok(incident.cleared_at instanceof Date);
  assert.equal(incident.notified_at, null);
  assert.equal(incident.cleared_notified_at, null);
  assert.equal((await f.outbox()).length, 2, 'no third call');
});

test('a test incident is pushed, clears on the first dispatch after its push was recorded, and its recovery is pushed once', { skip }, async t => {
  const f = await fixture(t);
  await f.ops(true);
  await f.subscribe(SEAN, 1);
  const opened = await f.call('gtl_ops_test_alert', {});
  assert.match(opened.key, /^test:\d{10}$/);
  assert.equal(opened.key, `test:${Math.floor(Date.parse(opened.at) / 1000)}`, 'keyed by its epoch second');
  assert.equal((await f.incidents()).length, 1);
  assert.deepEqual(await f.dispatch().then(r => [r.status, r.cleared]), ['queued', 0], 'not cleared before it was pushed');
  const first = await f.work();
  assert.deepEqual(first.claim.notifications, [{ incidentId: opened.incidentId, key: opened.key, phase: 'opened', kind: 'test', family: null, season: null, week: null, at: opened.at }]);
  await f.nextSlot();
  assert.deepEqual(await f.dispatch().then(r => [r.status, r.cleared, r.owed]), ['queued', 1, 1]);
  const second = await f.work();
  assert.deepEqual(second.claim.notifications.map(n => [n.incidentId, n.phase]), [[opened.incidentId, 'cleared']]);
  assert.deepEqual(second.marks, [{ recorded: true }]);
  await f.nextSlot();
  assert.deepEqual(await f.dispatch(), { status: 'nothing_owed', opened: 0, cleared: 0, owed: 0 });
  const [row] = await f.incidents();
  assert.ok([row.opened_at, row.notified_at, row.cleared_at, row.cleared_notified_at].every(time => time instanceof Date));
  assert.ok(row.notified_at <= row.cleared_at && row.cleared_at <= row.cleared_notified_at);
});

test('capability rules: claim, mark, record and complete refuse a bad token or claim, replay a finished run, and expire', { skip }, async t => {
  const f = await fixture(t);
  const now = Date.now();
  await f.run('odds', { slot: now - 40 * MINUTE, status: 'failed', finished: now - 35 * MINUTE });
  await f.ops(true);
  await f.subscribe(SEAN, 1);
  const { runId } = await f.dispatch();
  const token = await f.lastToken();
  for (const bad of ['f'.repeat(64), 'not-a-token', null]) await assert.rejects(f.call('gtl_claim_ops_alerts', { p_token: bad, p_run: runId }), /GTL_SCHEDULE_AUTH/, String(bad));
  await assert.rejects(f.call('gtl_claim_ops_alerts', { p_token: token, p_run: randomUUID() }), /GTL_SCHEDULE_AUTH/, 'another run');
  const claim = await f.call('gtl_claim_ops_alerts', { p_token: token, p_run: runId });
  assert.deepEqual(Object.keys(claim).sort(), ['claim', 'notifications', 'now', 'replay', 'runId', 'status', 'subscriptions']);
  assert.deepEqual([claim.replay, claim.runId, claim.status, typeof claim.claim, typeof claim.now], [false, runId, 'running', 'string', 'string']);
  assert.deepEqual(await f.call('gtl_claim_ops_alerts', { p_token: token, p_run: runId }), { replay: true, runId, status: 'running', reason: null, sent: 0, failed: 0 }, 'two claims give one run');
  const incident = claim.notifications[0].incidentId;
  const wrong = randomUUID();
  await assert.rejects(f.call('gtl_mark_ops_notification', { p_run: runId, p_claim: wrong, p_incident: incident, p_phase: 'opened' }), /GTL_SCHEDULE_RUN/);
  await assert.rejects(f.call('gtl_record_ops_delivery', { p_run: runId, p_claim: wrong, p_endpoint: device(1).endpoint, p_outcome: 'ok' }), /GTL_SCHEDULE_RUN/);
  await assert.rejects(f.call('gtl_complete_ops_alerts', { p_run: runId, p_claim: wrong, p_reason: null, p_sent: 1, p_failed: 0 }), /GTL_SCHEDULE_RUN/);
  await assert.rejects(f.call('gtl_record_ops_delivery', { p_run: runId, p_claim: claim.claim, p_endpoint: device(1).endpoint, p_outcome: 'made_up' }), /GTL_SCHEDULE_RUN/);
  await assert.rejects(f.call('gtl_complete_ops_alerts', { p_run: runId, p_claim: claim.claim, p_reason: 'made_up', p_sent: 0, p_failed: 0 }), /GTL_SCHEDULE_RUN/);
  await assert.rejects(f.call('gtl_complete_ops_alerts', { p_run: runId, p_claim: claim.claim, p_reason: null, p_sent: -1, p_failed: 0 }), /GTL_SCHEDULE_RUN/);
  // A claim older than ten minutes: mark and record refuse it as gtl_mark_push_reminder does; complete reports it expired.
  await f.db.query("update public.gtl_ops_alert_runs set claimed_at=claimed_at-interval '11 minutes' where id=$1", [runId]);
  await assert.rejects(f.call('gtl_mark_ops_notification', { p_run: runId, p_claim: claim.claim, p_incident: incident, p_phase: 'opened' }), /GTL_SCHEDULE_RUN/);
  await assert.rejects(f.call('gtl_record_ops_delivery', { p_run: runId, p_claim: claim.claim, p_endpoint: device(1).endpoint, p_outcome: 'ok' }), /GTL_SCHEDULE_RUN/);
  await assert.rejects(f.call('gtl_complete_ops_alerts', { p_run: runId, p_claim: claim.claim, p_reason: null, p_sent: 0, p_failed: 0 }), /GTL_SCHEDULE_EXPIRED/);
  await f.db.query("update public.gtl_ops_alert_runs set claimed_at=claimed_at+interval '11 minutes' where id=$1", [runId]);
  const done = await f.call('gtl_complete_ops_alerts', { p_run: runId, p_claim: claim.claim, p_reason: 'send_failed', p_sent: 0, p_failed: 1 });
  assert.deepEqual(done, { runId, status: 'failed', reason: 'send_failed', sent: 0, failed: 1 });
  assert.deepEqual(await f.call('gtl_complete_ops_alerts', { p_run: runId, p_claim: claim.claim, p_reason: null, p_sent: 1, p_failed: 0 }), done, 'a finished run stays as it finished');
  assert.deepEqual(await f.call('gtl_claim_ops_alerts', { p_token: token, p_run: runId }), { replay: true, runId, status: 'failed', reason: 'send_failed', sent: 0, failed: 1 });
  await assert.rejects(f.call('gtl_mark_ops_notification', { p_run: runId, p_claim: claim.claim, p_incident: incident, p_phase: 'opened' }), /GTL_SCHEDULE_RUN/, 'a finished run marks nothing');
  // A capability is good for five minutes from its dispatch.
  await f.nextSlot();
  const late = await f.dispatch();
  await f.db.query("update public.gtl_ops_alert_runs set created_at=created_at-interval '6 minutes' where id=$1", [late.runId]);
  await assert.rejects(f.call('gtl_claim_ops_alerts', { p_token: await f.lastToken(), p_run: late.runId }), /GTL_SCHEDULE_AUTH/);
  // With nothing owed at claim time, the run is skipped there, as a replay.
  await f.db.query("update public.gtl_ops_alert_runs set created_at=created_at+interval '6 minutes' where id=$1", [late.runId]);
  await f.db.query('update public.gtl_ops_incidents set notified_at=clock_timestamp()');
  assert.deepEqual(await f.call('gtl_claim_ops_alerts', { p_token: await f.lastToken(), p_run: late.runId }), { replay: true, runId: late.runId, status: 'skipped', reason: 'nothing_owed', sent: 0, failed: 0 });
});

test('mark is once-only: an alert is recorded as pushed once, and a recovery only for a cleared incident whose alert was pushed', { skip }, async t => {
  const f = await fixture(t);
  const now = Date.now();
  await f.run('push', { slot: now - 40 * MINUTE, status: 'failed', finished: now - 35 * MINUTE });
  await f.ops(true);
  await f.subscribe(SEAN, 1);
  const { runId } = await f.dispatch();
  const claim = await f.call('gtl_claim_ops_alerts', { p_token: await f.lastToken(), p_run: runId });
  const mark = (phase, incident = claim.notifications[0].incidentId) => f.call('gtl_mark_ops_notification', { p_run: runId, p_claim: claim.claim, p_incident: incident, p_phase: phase });
  assert.deepEqual(await mark('cleared'), { recorded: false }, 'not cleared yet');
  assert.deepEqual(await mark('opened'), { recorded: true });
  const first = (await f.incidents())[0].notified_at;
  assert.deepEqual(await mark('opened'), { recorded: false });
  assert.deepEqual((await f.incidents())[0].notified_at, first, 'the first push time stays');
  assert.deepEqual(await mark('opened', 999999), { recorded: false }, 'no such incident');
  for (const phase of ['both', null]) await assert.rejects(mark(phase), /GTL_SCHEDULE_RUN/, String(phase));
  await assert.rejects(mark('opened', null), /GTL_SCHEDULE_RUN/);
});

test('only the commissioner\'s active subscriptions are returned, and deliveries touch only them (gone deletes the device as gtl_record_push_delivery does)', { skip }, async t => {
  const f = await fixture(t);
  const now = Date.now();
  await f.run('week_open', { slot: now - 40 * MINUTE, status: 'failed', finished: now - 35 * MINUTE });
  await f.ops(true);
  await f.subscribe(LUKE, 1);
  await f.subscribe(TROY, 2);
  await f.subscribe(SEAN, 3);
  await f.subscribe(SEAN, 4, true);
  await f.subscribe(SEAN, 5);
  const { runId } = await f.dispatch();
  const claim = await f.call('gtl_claim_ops_alerts', { p_token: await f.lastToken(), p_run: runId });
  assert.deepEqual(claim.subscriptions, [device(3), device(5)]);
  const record = (n, outcome) => f.call('gtl_record_ops_delivery', { p_run: runId, p_claim: claim.claim, p_endpoint: device(n).endpoint, p_outcome: outcome });
  const sub = async n => f.one('select failure_count,last_success_at,disabled_at from public.gtl_push_subscriptions where endpoint=$1', [device(n).endpoint]);
  assert.deepEqual(await record(1, 'gone'), { outcome: 'gone' });
  assert.ok(await sub(1), 'a player\'s device is never touched');
  assert.deepEqual(await record(3, 'failed'), { outcome: 'failed' });
  assert.equal((await sub(3)).failure_count, 0, 'a failed push is not counted against the device');
  await record(3, 'ok');
  assert.equal((await sub(3)).last_success_at instanceof Date, true);
  await record(5, 'gone');
  assert.equal(await sub(5), undefined, 'an expired device is removed (D-28: a device setting, not a player entry)');
  // An inactive commissioner seat has no devices to alert.
  await f.db.query("update public.gtl_memberships set active=false where player_id='sean'");
  await f.call('gtl_complete_ops_alerts', { p_run: runId, p_claim: claim.claim, p_reason: 'send_failed', p_sent: 0, p_failed: 1 });
  await f.nextSlot();
  assert.equal((await f.dispatch()).status, 'no_subscriptions');
});

test('a failed ops push never counts against the commissioner\'s device: 20 failed outcomes in one run leave failure_count and disabled_at unchanged, and only gone removes it', { skip }, async t => {
  const f = await fixture(t);
  await f.run('results', { slot: Date.now() - 40 * MINUTE, status: 'failed', finished: Date.now() - 35 * MINUTE });
  await f.ops(true);
  await f.subscribe(SEAN, 1);
  await f.db.query('update public.gtl_push_subscriptions set failure_count=2 where endpoint=$1', [device(1).endpoint]);
  const { runId } = await f.dispatch();
  const claim = await f.call('gtl_claim_ops_alerts', { p_token: await f.lastToken(), p_run: runId });
  const sub = () => f.one('select failure_count,disabled_at from public.gtl_push_subscriptions where endpoint=$1', [device(1).endpoint]);
  for (let n = 0; n < 20; n++) await f.call('gtl_record_ops_delivery', { p_run: runId, p_claim: claim.claim, p_endpoint: device(1).endpoint, p_outcome: 'failed' });
  assert.deepEqual(await sub(), { failure_count: 2, disabled_at: null }, 'one bad run cannot disable the phone that also gets deadline reminders');
  assert.deepEqual(await f.call('gtl_record_ops_delivery', { p_run: runId, p_claim: claim.claim, p_endpoint: device(1).endpoint, p_outcome: 'gone' }), { outcome: 'gone' });
  assert.equal(await sub(), undefined, 'gone (404/410) removes the device, as gtl_record_push_delivery');
});

test('a key can fire again after it clears: fail, alert, recover, recovery pushed, fail again opens a new incident and queues a run', { skip }, async t => {
  const f = await fixture(t);
  const now = Date.now();
  await f.run('results', { slot: now - 40 * MINUTE, status: 'failed', finished: now - 35 * MINUTE });
  await f.ops(true);
  await f.subscribe(SEAN, 1);
  assert.deepEqual(await f.dispatch().then(r => [r.status, r.opened]), ['queued', 1]);
  await f.work();
  await f.run('results', { slot: now - 20 * MINUTE, finished: now - 15 * MINUTE });
  await f.nextSlot();
  assert.deepEqual(await f.dispatch().then(r => [r.status, r.cleared]), ['queued', 1]);
  const recovery = await f.work();
  assert.deepEqual(recovery.claim.notifications.map(n => [n.key, n.phase]), [['failed:results', 'cleared']]);
  await f.nextSlot();
  assert.equal((await f.dispatch()).status, 'nothing_owed');
  // It fails again: the old incident is cleared and kept, so the key is free for a new one.
  await f.run('results', { slot: now - 10 * MINUTE, status: 'failed', finished: now - 5 * MINUTE });
  await f.nextSlot();
  const again = await f.dispatch();
  assert.deepEqual([again.status, again.opened, again.cleared, again.owed], ['queued', 1, 0, 1]);
  const incidents = await f.incidents();
  assert.equal(incidents.length, 2);
  assert.ok(incidents[0].id !== incidents[1].id && incidents[0].cleared_at instanceof Date && incidents[1].cleared_at === null, 'a new open incident beside the cleared one');
  const second = await f.work();
  assert.deepEqual(second.claim.notifications.map(n => [n.incidentId, n.key, n.phase]), [[incidents[1].id, 'failed:results', 'opened']]);
});

test('the claim returns the 20 oldest owed alerts in order; the 21st follows on the next dispatch', { skip }, async t => {
  const f = await fixture(t);
  await f.ops(true);
  await f.subscribe(SEAN, 1);
  const base = Date.now() - 3 * HOUR;
  // Inserted newest first, so id order is the reverse of age: the claim must order by age.
  const keys = Array.from({ length: 21 }, (_, n) => `test:${1700000000 + n}`);
  for (let n = 20; n >= 0; n--)
    await f.db.query("insert into public.gtl_ops_incidents(key,kind,at,opened_at) values($1,'test',$2,$3)", [keys[n], iso(base), iso(base + n * MINUTE)]);
  assert.equal((await f.dispatch()).status, 'queued');
  const first = await f.work();
  assert.deepEqual(first.claim.notifications.map(n => n.key), keys.slice(0, 20), 'oldest first, at most 20');
  assert.equal(first.marks.length, 20);
  await f.nextSlot();
  const next = await f.dispatch();
  assert.equal(next.status, 'queued');
  const second = await f.work();
  assert.equal(second.claim.notifications.length, 20);
  assert.deepEqual([second.claim.notifications[0].key, second.claim.notifications[0].phase], [keys[20], 'opened'], 'the 21st is next, oldest owed first');
});

test('no row is ever deleted: every incident and run stays through open, push, clear, recovery, timeout and a cleared-before-pushed incident', { skip }, async t => {
  const f = await fixture(t);
  const now = Date.now();
  await f.run('results', { slot: now - 40 * MINUTE, status: 'failed', finished: now - 35 * MINUTE });
  await f.run('epl:snapshot', { slot: now - 40 * MINUTE, status: 'failed', finished: now - 35 * MINUTE });
  await f.ops(true);
  await f.subscribe(SEAN, 1);
  const seen = { incidents: new Set(), runs: new Set() };
  const keep = async () => {
    for (const row of await f.incidents()) seen.incidents.add(row.id);
    for (const row of await f.runs()) seen.runs.add(row.id);
    assert.deepEqual(new Set((await f.incidents()).map(row => row.id)), seen.incidents);
    assert.deepEqual(new Set((await f.runs()).map(row => row.id)), seen.runs);
  };
  await f.dispatch(); await keep();
  // The first run times out; the second fails to push.
  await f.db.query("update public.gtl_ops_alert_runs set created_at=created_at-interval '11 minutes'");
  await f.nextSlot(); await f.dispatch(); await keep();
  await f.work({ deliver: false }); await keep();
  // The results refresh recovers before its alert was ever pushed: cleared, and owed nothing.
  await f.run('results', { slot: now - 10 * MINUTE, finished: now - 5 * MINUTE });
  await f.nextSlot(); await f.dispatch(); await keep();
  await f.work(); await keep();
  await f.call('gtl_ops_test_alert', {});
  await f.run('epl:snapshot', { slot: now - 10 * MINUTE, finished: now - 5 * MINUTE });
  await f.nextSlot(); await f.dispatch(); await keep();
  await f.work(); await keep();
  await f.nextSlot(); await f.dispatch(); await keep();
  await f.work(); await keep();
  const incidents = await f.incidents();
  assert.deepEqual(incidents.map(row => [row.key.replace(/\d+$/, 'N'), row.notified_at instanceof Date, row.cleared_at instanceof Date, row.cleared_notified_at instanceof Date])
    .sort((a, b) => a[0].localeCompare(b[0])), [['failed:epl:snapshot', true, true, true], ['failed:results', false, true, false], ['test:N', true, true, true]]);
  assert.deepEqual((await f.runs()).map(row => row.status), ['failed', 'failed', 'succeeded', 'succeeded', 'succeeded']);
  assert.equal(seen.incidents.size, 3);
  assert.equal(seen.runs.size, 5);
});

test('privacy: the checks, the dispatcher and the claim never read a pick, guess, ballot, selection, score or name, and an alert carries only its key, kind, family, week and time', { skip }, async t => {
  const f = await fixture(t);
  const source = async fn => (await f.one('select prosrc from pg_proc where oid=$1::regprocedure', [`public.${fn}`])).prosrc;
  const entries = /gtl_(weekly_ballots|weekly_selections|weekly_optouts|week_forfeits|ruled_ballot_imports|points_guesses|points_guess_events|virtual_units_picks|epl_picks|epl_pick_history|epl_guesses|epl_guess_history|journal_entries|bet_receipts|bet_versions|social_weeks|social_commits|leagues|profiles|feed_posts)\b/;
  for (const fn of [...CRON_ONLY, ...WORKER_RPCS, 'gtl_week_open_at(integer,integer)']) assert.doesNotMatch(await source(fn), entries, fn);
  assert.doesNotMatch(await source('gtl_ops_findings(timestamptz)'), /\b(members|slots|house|picks|display_name|signature)\b/, 'existence and times only');
  await f.run('results', { slot: Date.now() - 40 * MINUTE, status: 'failed', finished: Date.now() - 35 * MINUTE });
  await f.ops(true);
  await f.subscribe(SEAN, 1);
  await f.dispatch();
  const { claim } = await f.work();
  for (const note of claim.notifications) assert.deepEqual(Object.keys(note).sort(), ['at', 'family', 'incidentId', 'key', 'kind', 'phase', 'season', 'week']);
  for (const sub of claim.subscriptions) assert.deepEqual(Object.keys(sub).sort(), ['auth', 'endpoint', 'p256dh']);
});
