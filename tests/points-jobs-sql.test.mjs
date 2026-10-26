import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ALL, NOT_HOSTED } from './migrations.mjs';
import { createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';

// P-03 Task A (20261026120000_gtl_points_jobs.sql, D-56): the Points job schedule, its run queue with a one-run capability,
// and the service-only jobs-state read, on main's P-01 slate table. Local PGlite only; no hosted connection. The pg_net
// call is replaced by a local outbox double (as tests/week-open.test.mjs does) so the capability the dispatcher sends can be
// read back. session_replication_role = replica is used only to write fixture slates and FINAL rows the writers would refuse.
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const HOUR = 3_600_000, DAY = 24 * HOUR;
const ENDPOINT = 'https://example.supabase.co/functions/v1/gtl-points-jobs';
const SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
const RULES = { format: 'ppr', passingTds: 4, version: 'ppr4-v1' };
const sha = text => createHash('sha256').update(text).digest('hex');
const FUNCTIONS = ['gtl_dispatch_points_jobs()', 'gtl_claim_points_jobs(text,uuid)', 'gtl_complete_points_jobs(uuid,uuid,text,jsonb)', 'gtl_points_jobs_state(integer)'];
const TABLES = ['gtl_points_job_schedule', 'gtl_points_job_runs'];

async function fixture(t, { enabled = true } = {}) {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world;
  await db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';grant usage on schema net to anon,authenticated;grant select on net.outbox to anon,authenticated;");
  await db.query('insert into public.gtl_points_job_schedule(id,enabled,endpoint) values($1,$2,$3)', ['nfl-points', enabled, ENDPOINT]);
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const rpc = async (name, args) => (await as('service_role', `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value;
  const dispatch = async () => (await db.query('select public.gtl_dispatch_points_jobs() value')).rows[0].value;
  const token = async runId => (await db.query("select headers->>'Authorization' auth from net.outbox where body->>'runId'=$1 order by id desc limit 1", [runId])).rows[0]?.auth.slice(7);
  /** Dispatch then claim: returns the claim reply and the capability. */
  const claimed = async () => { const queued = await dispatch(); const cap = await token(queued.runId); return { runId: queued.runId, cap, reply: await rpc('gtl_claim_points_jobs', [cap, queued.runId]) }; };
  return { db, as, rpc, dispatch, token, claimed };
}

test('migration is registered as unapplied and creates exactly the documented objects', { skip }, async t => {
  assert(NOT_HOSTED.includes(20261026120000), 'written, not applied: waits for the apply word');
  const f = await fixture(t);
  const functions = (await f.db.query("select proname,prosecdef,proconfig from pg_proc where proname in ('gtl_dispatch_points_jobs','gtl_claim_points_jobs','gtl_complete_points_jobs','gtl_points_jobs_state')")).rows;
  assert.equal(functions.length, 4);
  assert(functions.every(row => row.prosecdef === false), 'every function is security invoker');
  assert(functions.every(row => row.proconfig?.includes('search_path=""')), 'every function pins an empty search_path');
  assert.deepEqual((await f.db.query("select column_name from information_schema.columns where table_name='gtl_points_job_runs'")).rows.map(r => r.column_name).sort(),
    ['capability_hash', 'claim_token', 'claimed_at', 'created_at', 'finished_at', 'id', 'reason', 'schedule_id', 'slot_start', 'status', 'summary']);
});

test('privileges: tables and functions are closed to players; dispatch is cron only; the service role gets the narrow set', { skip }, async t => {
  const f = await fixture(t);
  for (const role of ['anon', 'authenticated']) {
    for (const table of TABLES) {
      assert.equal((await f.db.query('select has_table_privilege($1,$2,$3) ok', [role, `public.${table}`, 'SELECT'])).rows[0].ok, false);
      assert.equal((await f.db.query('select has_any_column_privilege($1,$2,$3) ok', [role, `public.${table}`, 'UPDATE'])).rows[0].ok, false);
      for (const query of [`select * from public.${table}`, `delete from public.${table}`]) await assert.rejects(() => f.as(role, query), /permission denied/);
    }
    for (const signature of FUNCTIONS) assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false, `${role} cannot run ${signature}`);
  }
  assert.equal((await f.db.query("select has_function_privilege('service_role','public.gtl_dispatch_points_jobs()','EXECUTE') ok")).rows[0].ok, false, 'the dispatcher is cron only');
  await assert.rejects(() => f.rpc('gtl_dispatch_points_jobs', []), /permission denied/);
  for (const signature of FUNCTIONS.slice(1)) assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${signature}`, 'EXECUTE'])).rows[0].ok, true);
  await assert.rejects(() => f.as('service_role', 'update public.gtl_points_job_schedule set enabled=false'), /permission denied/, 'only an administrator changes the switch');
  await assert.rejects(() => f.as('service_role', "update public.gtl_points_job_runs set capability_hash=repeat('f',64)"), /permission denied/);
  await assert.rejects(() => f.as('service_role', 'update public.gtl_points_job_runs set slot_start=now()'), /permission denied/);
  await f.as('service_role', 'select * from public.gtl_points_job_schedule');
  await f.as('service_role', 'select * from public.gtl_points_job_runs');
  assert.equal((await f.db.query("select count(*)::int n from pg_class where relname in ('gtl_points_job_schedule','gtl_points_job_runs') and relrowsecurity")).rows[0].n, 2, 'row level security on both');
});

test('schedule row: a single nfl-points row with a supabase gtl-points-jobs endpoint, disabled by default', { skip }, async t => {
  const f = await fixture(t);
  await assert.rejects(() => f.db.query("insert into public.gtl_points_job_schedule(id,endpoint) values('other',$1)", [ENDPOINT]), /check/);
  for (const endpoint of ['http://x.supabase.co/functions/v1/gtl-points-jobs', 'https://x.supabase.co/functions/v1/gtl-week-open', 'https://evil.example/functions/v1/gtl-points-jobs'])
    await assert.rejects(() => f.db.query('update public.gtl_points_job_schedule set endpoint=$1', [endpoint]), /check/);
  assert.equal((await f.db.query("select column_default d from information_schema.columns where table_name='gtl_points_job_schedule' and column_name='enabled'")).rows[0].d, 'false');
});

test('dispatch: disabled does nothing; enabled queues one run per hour carrying exactly one 64-hex capability', { skip }, async t => {
  const off = await fixture(t, { enabled: false });
  assert.deepEqual(await off.dispatch(), { status: 'disabled' });
  assert.equal((await off.db.query('select count(*)::int n from net.outbox')).rows[0].n, 0);
  assert.equal((await off.db.query('select count(*)::int n from public.gtl_points_job_runs')).rows[0].n, 0);

  const f = await fixture(t);
  const queued = await f.dispatch();
  assert.equal(queued.status, 'queued'); assert.deepEqual(Object.keys(queued).sort(), ['runId', 'status']);
  assert.deepEqual(await f.dispatch(), { status: 'already_dispatched' });
  const calls = (await f.db.query('select url,body,headers from net.outbox')).rows;
  assert.equal(calls.length, 1, 'one call for the hour');
  assert.equal(calls[0].url, ENDPOINT); assert.deepEqual(calls[0].body, { runId: queued.runId });
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.match(calls[0].headers.Authorization, /^Bearer [0-9a-f]{64}$/);
  const run = (await f.db.query('select * from public.gtl_points_job_runs')).rows[0];
  assert.equal(run.status, 'queued'); assert.equal(run.schedule_id, 'nfl-points');
  assert.equal(run.capability_hash, sha(calls[0].headers.Authorization.slice(7)), 'only the hash of the capability is stored');
  assert.equal(new Date(run.slot_start).getTime() % HOUR, 0, 'the slot is the clock hour');
});

test('dispatch: a failing transport records dispatch_unavailable instead of throwing', { skip }, async t => {
  const f = await fixture(t);
  await f.db.exec("create or replace function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language plpgsql as 'begin raise exception ''no network''; end'");
  assert.deepEqual(await f.dispatch(), { status: 'failed', reason: 'dispatch_unavailable' });
  const run = (await f.db.query('select status,reason,finished_at from public.gtl_points_job_runs')).rows[0];
  assert.equal(run.status, 'failed'); assert.equal(run.reason, 'dispatch_unavailable'); assert(run.finished_at);
});

test('dispatch: a queued or running run older than ten minutes is timed out as worker_timeout by the next dispatch', { skip }, async t => {
  const f = await fixture(t);
  const { runId } = await f.claimed();
  await f.db.query("update public.gtl_points_job_runs set claimed_at=clock_timestamp()-interval '11 minutes' where id=$1", [runId]);
  await f.db.query("update public.gtl_points_job_runs set slot_start=slot_start-interval '2 hours' where id=$1", [runId]);
  const queued = await f.dispatch(); assert.equal(queued.status, 'queued');
  const stale = (await f.db.query('select status,reason,finished_at from public.gtl_points_job_runs where id=$1', [runId])).rows[0];
  assert.equal(stale.status, 'failed'); assert.equal(stale.reason, 'worker_timeout'); assert(stale.finished_at);
  const fresh = (await f.db.query('select status from public.gtl_points_job_runs where id=$1', [queued.runId])).rows[0];
  assert.equal(fresh.status, 'queued', 'the new run is untouched');
});

test('claim: the capability opens exactly this run; a wrong, malformed, stale, other-hour or disabled claim is GTL_SCHEDULE_AUTH', { skip }, async t => {
  const f = await fixture(t);
  const queued = await f.dispatch(), cap = await f.token(queued.runId);
  for (const bad of [null, '', 'short', 'A'.repeat(64), 'b'.repeat(64), cap.toUpperCase()]) await assert.rejects(() => f.rpc('gtl_claim_points_jobs', [bad, queued.runId]), /GTL_SCHEDULE_AUTH/, String(bad));
  await assert.rejects(() => f.rpc('gtl_claim_points_jobs', [cap, '00000000-0000-4000-8000-000000000001']), /GTL_SCHEDULE_AUTH/, 'another run');
  assert.equal((await f.db.query('select status from public.gtl_points_job_runs')).rows[0].status, 'queued', 'a refused claim changes nothing');

  const reply = await f.rpc('gtl_claim_points_jobs', [cap, queued.runId]);
  assert.equal(reply.replay, false); assert.equal(reply.runId, queued.runId);
  assert.deepEqual(Object.keys(reply).sort(), ['claim', 'now', 'replay', 'runId']);
  assert.match(reply.claim, /^[0-9a-f-]{36}$/); assert(Number.isFinite(Date.parse(reply.now)));
  assert.equal((await f.db.query('select status from public.gtl_points_job_runs')).rows[0].status, 'running');
  const replay = await f.rpc('gtl_claim_points_jobs', [cap, queued.runId]);
  assert.deepEqual(replay, { replay: true, runId: queued.runId, status: 'running', reason: null }, 'a second claim replays and gives out no claim');
  await assert.rejects(() => f.rpc('gtl_claim_points_jobs', ['c'.repeat(64), queued.runId]), /GTL_SCHEDULE_AUTH/, 'a replay also needs the right token');

  const stale = await fixture(t);
  const s = await stale.dispatch(), sCap = await stale.token(s.runId);
  await stale.db.query("update public.gtl_points_job_runs set created_at=clock_timestamp()-interval '6 minutes'");
  await assert.rejects(() => stale.rpc('gtl_claim_points_jobs', [sCap, s.runId]), /GTL_SCHEDULE_AUTH/, 'older than five minutes');

  const hour = await fixture(t);
  const h = await hour.dispatch(), hCap = await hour.token(h.runId);
  await hour.db.query("update public.gtl_points_job_runs set slot_start=slot_start-interval '1 hour'");
  await assert.rejects(() => hour.rpc('gtl_claim_points_jobs', [hCap, h.runId]), /GTL_SCHEDULE_AUTH/, 'a run from another clock hour');

  const off = await fixture(t);
  const o = await off.dispatch(), oCap = await off.token(o.runId);
  await off.db.query('update public.gtl_points_job_schedule set enabled=false');
  await assert.rejects(() => off.rpc('gtl_claim_points_jobs', [oCap, o.runId]), /GTL_SCHEDULE_AUTH/, 'switching it off refuses a queued run');
});

test('complete: the reason decides the status, the claim is required, the summary is stored, and an expired claim is refused', { skip }, async t => {
  const outcomes = { null: 'succeeded', nothing_due: 'skipped', source_unavailable: 'failed', load_failed: 'failed', worker_error: 'failed', worker_timeout: 'failed', dispatch_unavailable: 'failed' };
  for (const [key, status] of Object.entries(outcomes)) {
    const reason = key === 'null' ? null : key;
    const f = await fixture(t);
    const { runId, reply } = await f.claimed();
    const summary = { slate: { drafted: 1 }, actuals: { loaded: 2 }, finalize: { finalized: 0 } };
    const done = await f.rpc('gtl_complete_points_jobs', [runId, reply.claim, reason, summary]);
    assert.deepEqual(done, { runId, status, reason }, key);
    const row = (await f.db.query('select status,reason,summary,finished_at from public.gtl_points_job_runs')).rows[0];
    assert.equal(row.status, status); assert.deepEqual(row.summary, summary); assert(row.finished_at);
    const again = await f.rpc('gtl_complete_points_jobs', [runId, reply.claim, 'worker_error', null]);
    assert.deepEqual(again, { runId, status, reason }, 'finishing twice returns the first outcome and changes nothing');
  }
  const f = await fixture(t);
  const { runId, reply } = await f.claimed();
  await assert.rejects(() => f.rpc('gtl_complete_points_jobs', [runId, '00000000-0000-4000-8000-000000000009', null, null]), /GTL_SCHEDULE_RUN/, 'wrong claim');
  await assert.rejects(() => f.rpc('gtl_complete_points_jobs', [runId, null, null, null]), /GTL_SCHEDULE_RUN/, 'no claim');
  await assert.rejects(() => f.rpc('gtl_complete_points_jobs', [runId, reply.claim, 'already_published', null]), /GTL_SCHEDULE_RUN/, 'a reason from another vocabulary');
  await assert.rejects(() => f.rpc('gtl_complete_points_jobs', [runId, reply.claim, null, [1]]), /GTL_SCHEDULE_RUN/, 'a summary is an object');
  await assert.rejects(() => f.rpc('gtl_complete_points_jobs', [runId, reply.claim, null, { text: 'x'.repeat(5000) }]), /GTL_SCHEDULE_RUN/, 'a summary is at most 4 KB');
  assert.equal((await f.db.query('select status from public.gtl_points_job_runs')).rows[0].status, 'running', 'refusals leave the run running');
  assert.equal((await f.rpc('gtl_complete_points_jobs', [runId, reply.claim, null, null])).status, 'succeeded', 'a null summary is allowed');
  assert.equal((await f.db.query('select summary from public.gtl_points_job_runs')).rows[0].summary, null);

  const late = await fixture(t);
  const l = await late.claimed();
  await late.db.query("update public.gtl_points_job_runs set claimed_at=clock_timestamp()-interval '11 minutes'");
  await assert.rejects(() => late.rpc('gtl_complete_points_jobs', [l.runId, l.reply.claim, null, null]), /GTL_SCHEDULE_EXPIRED/);
});

test('jobs state: every slate of the season in week order with only the documented keys and no House, provenance or guess value', { skip }, async t => {
  const f = await fixture(t);
  const now = Date.now(), at = ms => new Date(ms).toISOString();
  const slotsFor = (week, base) => SLOTS.map((slot, i) => ({ slot, playerId: `00-0000${week}${i}`, name: `Fixture ${slot}`, team: ['SEA', 'KC', 'BUF', 'DAL', 'MIA'][i],
    position: slot === 'FLEX' ? 'WR' : slot, gameKey: `2026_0${week}_${['SEA_DEN', 'KC_LV', 'BUF_NYJ', 'DAL_PHI', 'MIA_NE'][i]}`, kickoff: at(base + i * HOUR) }));
  const SENTINEL = { house: 7777.7, checksum: 'd'.repeat(64), seed: 'sentinel-seed-4242' };
  const insert = async (season, week, status, base) => {
    await f.db.query(`insert into public.gtl_points_slates(season,week,status,opens_at,finalize_at,scoring_rules,slots,house,provenance,published_at,audit)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'[]')`, [season, week, status, at(base - 3 * DAY), at(base + 5 * DAY), RULES, JSON.stringify(slotsFor(week, base)),
      { QB: SENTINEL.house, RB: 1, WR: 2, TE: 3, FLEX: 4 }, { checksum: SENTINEL.checksum, seed: SENTINEL.seed, snapshotFile: 'secret.json' }, status === 'published' ? at(base - 3 * DAY) : null]);
  };
  await f.db.exec('set session_replication_role = replica');
  await insert(2026, 9, 'published', now - 10 * DAY); // FINAL
  await insert(2026, 7, 'published', now + 2 * DAY);
  await insert(2026, 8, 'draft', now + 9 * DAY);
  await insert(2025, 3, 'published', now - 400 * DAY); // another season
  await f.db.query(`insert into public.gtl_points_week_final(season,week,maximum,slots,members,house) values(2026,9,50,'[]','[{"name":"Hidden Member"}]','{"QB":8888}')`);
  await f.db.exec('set session_replication_role = origin');

  const state = await f.rpc('gtl_points_jobs_state', [2026]);
  assert.deepEqual(Object.keys(state).sort(), ['season', 'slates']); assert.equal(state.season, 2026);
  assert.deepEqual(state.slates.map(s => [s.week, s.status, s.final]), [[7, 'published', false], [8, 'draft', false], [9, 'published', true]]);
  for (const slate of state.slates) {
    assert.deepEqual(Object.keys(slate).sort(), ['final', 'finalizeAt', 'firstKickoff', 'opensAt', 'rulesVersion', 'slots', 'status', 'week']);
    assert.equal(slate.rulesVersion, 'ppr4-v1');
    assert.deepEqual(slate.slots.map(s => s.slot), SLOTS);
    for (const slot of slate.slots) assert.deepEqual(Object.keys(slot).sort(), ['gameKey', 'kickoff', 'name', 'playerId', 'position', 'slot', 'team']);
    assert.equal(Date.parse(slate.firstKickoff), Math.min(...slate.slots.map(s => Date.parse(s.kickoff))), 'firstKickoff is the earliest slot');
    assert(Number.isFinite(Date.parse(slate.opensAt)) && Number.isFinite(Date.parse(slate.finalizeAt)));
  }
  const text = JSON.stringify(state);
  for (const needle of [String(SENTINEL.house), SENTINEL.checksum, SENTINEL.seed, 'secret.json', 'Hidden Member', '8888', 'house', 'provenance', 'guess', 'members'])
    assert.equal(text.includes(needle), false, `${needle} must not leave the function`);
  assert.deepEqual(await f.rpc('gtl_points_jobs_state', [2030]), { season: 2030, slates: [] });
  for (const bad of [1999, 2201, null]) await assert.rejects(() => f.rpc('gtl_points_jobs_state', [bad]), /GTL_POINTS_INVALID/, String(bad));
});
