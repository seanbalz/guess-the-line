// The gtl-epl-jobs run queue in M-30 (plan 2026-10-28-epl-pick-a-team.md, Task 5) on PGlite with every repo migration: the
// per-job dispatcher and its one-run capability, claim and complete, the worker's state and snapshot reads, the shared Odds
// API budget reserve, and the once-per-turn nudge mark. The pg_net call is replaced by a local outbox double (as
// tests/points-jobs-sql.test.mjs does) so the capability the dispatcher sends can be read back. No hosted connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ALL } from './migrations.mjs';
import { EPL_FAIL_REASONS, EPL_SKIP_REASONS } from '../cloud/epl-jobs.mjs';
import { createCommunityWorld, id, pgliteAvailable } from './cloud-browser/community-world.mjs';

const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const ENDPOINT = 'https://example.supabase.co/functions/v1/gtl-epl-jobs';
const sha = text => createHash('sha256').update(text).digest('hex');
const DARIN = '1395236217460633600', NEMO = '865667912365666304';

async function fixture(t, { enabled = true } = {}) {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world;
  await db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';");
  for (const job of ['snapshot', 'fixtures', 'resolve', 'settle', 'nudge']) await db.query('insert into public.gtl_epl_jobs_schedule(job,enabled,endpoint) values($1,$2,$3)', [job, enabled, ENDPOINT]);
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const rpc = async (name, args) => (await as('service_role', `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value;
  const dispatch = async job => (await db.query('select public.gtl_epl_dispatch_jobs($1) value', [job])).rows[0].value;
  const token = async runId => (await db.query("select headers->>'Authorization' auth from net.outbox where body->>'runId'=$1 order by id desc limit 1", [runId])).rows[0]?.auth.slice(7);
  const claimed = async (job = 'resolve') => { const q = await dispatch(job); const cap = await token(q.runId); return { runId: q.runId, cap, reply: await rpc('gtl_epl_claim_job', [cap, q.runId]) }; };
  return { db, as, rpc, dispatch, token, claimed };
}

test('dispatch queues one run per job and five-minute slot, posting only the capability; disabled jobs post nothing', { skip }, async t => {
  const f = await fixture(t);
  const queued = await f.dispatch('nudge');
  assert.equal(queued.status, 'queued'); assert.deepEqual(Object.keys(queued).sort(), ['runId', 'status']);
  assert.deepEqual(await f.dispatch('nudge'), { status: 'already_dispatched' });
  assert.equal((await f.dispatch('resolve')).status, 'queued', 'another job has its own slot');
  const calls = (await f.db.query('select url,body,headers from net.outbox order by id')).rows;
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, ENDPOINT); assert.deepEqual(calls[0].body, { runId: queued.runId });
  assert.match(calls[0].headers.Authorization, /^Bearer [0-9a-f]{64}$/);
  const run = (await f.db.query('select * from public.gtl_epl_job_runs where id=$1', [queued.runId])).rows[0];
  assert.equal(run.job, 'nudge'); assert.equal(run.status, 'queued');
  assert.equal(run.capability_hash, sha(calls[0].headers.Authorization.slice(7)), 'only the hash is stored');
  assert.equal(new Date(run.slot_start).getTime() % 300_000, 0);
  await f.db.query("update public.gtl_epl_jobs_schedule set enabled=false where job='settle'");
  assert.deepEqual(await f.dispatch('settle'), { status: 'disabled' });
  assert.deepEqual(await f.dispatch('unknown'), { status: 'disabled' });
  await assert.rejects(() => f.as('service_role', "select public.gtl_epl_dispatch_jobs('nudge')"), /permission denied/, 'cron only, never the API');
});

test('dispatch: a failing transport records dispatch_unavailable; a stale run times out', { skip }, async t => {
  const f = await fixture(t);
  const { runId } = await f.claimed('resolve');
  await f.db.query("update public.gtl_epl_job_runs set claimed_at=clock_timestamp()-interval '11 minutes',slot_start=slot_start-interval '1 hour' where id=$1", [runId]);
  await f.db.exec("create or replace function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language plpgsql as 'begin raise exception ''no network''; end'");
  assert.deepEqual(await f.dispatch('resolve'), { status: 'failed', reason: 'dispatch_unavailable' });
  assert.deepEqual((await f.db.query('select status,reason from public.gtl_epl_job_runs where id=$1', [runId])).rows[0], { status: 'failed', reason: 'worker_timeout' });
});

test('claim opens exactly its run once; wrong, stale or disabled capabilities are GTL_SCHEDULE_AUTH; a second claim replays', { skip }, async t => {
  const f = await fixture(t);
  const q = await f.dispatch('fixtures'), cap = await f.token(q.runId);
  for (const bad of [null, 'short', 'b'.repeat(64), cap.toUpperCase()]) await assert.rejects(() => f.rpc('gtl_epl_claim_job', [bad, q.runId]), /GTL_SCHEDULE_AUTH/, String(bad));
  await assert.rejects(() => f.rpc('gtl_epl_claim_job', [cap, id(99)]), /GTL_SCHEDULE_AUTH/);
  const reply = await f.rpc('gtl_epl_claim_job', [cap, q.runId]);
  assert.deepEqual(Object.keys(reply).sort(), ['claim', 'job', 'now', 'replay', 'runId']);
  assert.equal(reply.job, 'fixtures'); assert.equal(reply.replay, false);
  assert.deepEqual(await f.rpc('gtl_epl_claim_job', [cap, q.runId]), { replay: true, runId: q.runId, job: 'fixtures', status: 'running', reason: null });
  const stale = await f.dispatch('settle'), staleCap = await f.token(stale.runId);
  await f.db.query("update public.gtl_epl_job_runs set started_at=clock_timestamp()-interval '6 minutes' where id=$1", [stale.runId]);
  await assert.rejects(() => f.rpc('gtl_epl_claim_job', [staleCap, stale.runId]), /GTL_SCHEDULE_AUTH/, 'a capability lasts five minutes');
  const off = await f.dispatch('nudge'), offCap = await f.token(off.runId);
  await f.db.query("update public.gtl_epl_jobs_schedule set enabled=false where job='nudge'");
  await assert.rejects(() => f.rpc('gtl_epl_claim_job', [offCap, off.runId]), /GTL_SCHEDULE_AUTH/, 'switching a job off stops a queued run');
});

test('complete records the worker reason as succeeded, skipped or failed, once, and refuses an unknown reason or claim', { skip }, async t => {
  const f = await fixture(t);
  const { runId, reply } = await f.claimed('resolve');
  await assert.rejects(() => f.rpc('gtl_epl_complete_job', [runId, id(98), null, '{}']), /GTL_SCHEDULE_RUN/);
  await assert.rejects(() => f.rpc('gtl_epl_complete_job', [runId, reply.claim, 'made_up', '{}']), /GTL_SCHEDULE_RUN/);
  assert.deepEqual(await f.rpc('gtl_epl_complete_job', [runId, reply.claim, 'already_resolved', JSON.stringify({ added: 0 })]), { runId, status: 'skipped', reason: 'already_resolved' });
  assert.deepEqual(await f.rpc('gtl_epl_complete_job', [runId, reply.claim, null, '{}']), { runId, status: 'skipped', reason: 'already_resolved' }, 'a second completion changes nothing');
  assert.deepEqual((await f.db.query('select detail from public.gtl_epl_job_runs where id=$1', [runId])).rows[0].detail, { added: 0 });
  const body = (await f.db.query("select prosrc from pg_proc where proname='gtl_epl_complete_job'")).rows[0].prosrc;
  for (const reason of [...EPL_SKIP_REASONS, ...EPL_FAIL_REASONS]) assert.ok(body.includes(`'${reason}'`), `SQL knows ${reason}`);
  for (const [i, reason] of [...EPL_SKIP_REASONS, ...EPL_FAIL_REASONS].entries()) {
    const run = await f.claimed('nudge');
    // Free the five-minute slot so the next dispatch can queue another run.
    await f.db.query("update public.gtl_epl_job_runs set slot_start=slot_start-make_interval(days=>$2) where id=$1", [run.runId, i + 1]);
    const expected = EPL_SKIP_REASONS.includes(reason) ? 'skipped' : 'failed';
    assert.equal((await f.rpc('gtl_epl_complete_job', [run.runId, run.reply.claim, reason, '{}'])).status, expected, reason);
  }
});

test('jobs_state needs a running claim and returns the latest week, queues, subscriptions and the shared budget', { skip }, async t => {
  const f = await fixture(t);
  const { runId, reply } = await f.claimed('resolve');
  await assert.rejects(() => f.rpc('gtl_epl_jobs_state', [runId, id(97)]), /GTL_SCHEDULE_RUN/);
  const empty = await f.rpc('gtl_epl_jobs_state', [runId, reply.claim]);
  assert.equal(empty.week, null); assert.deepEqual(empty.picks, []);
  await f.db.exec(`insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order) values
      (2026,8,'2026-10-23T00:00Z','2026-10-30T00:00Z','2026-10-24T11:30Z','{${NEMO},${DARIN}}'),
      (2026,9,'2026-10-30T00:00Z','2026-11-04T00:00Z','2026-10-31T12:30Z','{${NEMO},${DARIN}}');
    insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values('e1',2026,9,'MNC','BOU','2026-10-31T12:30Z');
    insert into public.gtl_epl_prices(event_id,club,market,price,observed_at) values('e1','MNC','h2h',-250,now());
    insert into public.gtl_epl_picks(season,week,owner_id,club) values(2026,9,'${NEMO}','MNC');
    insert into public.gtl_epl_queues(season,week,owner_id,clubs) values(2026,9,'${DARIN}','{BOU}');
    insert into public.gtl_epl_bonus(season,week,owner_id,points,margin,club) values(2026,8,'${NEMO}',10,2,'ARS');
    insert into public.gtl_epl_snapshots(captured_at,label,payload) values(now(),'after-mw08','{"rosters":[{"owner_id":"1"}],"users":[],"stats_mw8":[1,2,3]}');
    update public.gtl_epl_managers set user_id='${id(3)}' where owner_id='${DARIN}';
    insert into public.gtl_push_subscriptions(endpoint,user_id,p256dh,auth) values('https://web.push.apple.com/abcdefghijklmnop','${id(3)}','B${'x'.repeat(86)}','${'y'.repeat(22)}');
    update public.gtl_odds_budget set conservative_remaining=120 where provider='the-odds-api';`);
  const state = await f.rpc('gtl_epl_jobs_state', [runId, reply.claim]);
  assert.equal(state.week.week, 9); assert.equal(state.week.status, 'open'); assert.deepEqual(state.week.pickOrder, [NEMO, DARIN]);
  assert.deepEqual(state.picks.map(p => [p.ownerId, p.club]), [[NEMO, 'MNC']]);
  assert.deepEqual(state.queues, { [DARIN]: ['BOU'] });
  assert.deepEqual(state.fixtures.map(x => x.eventId), ['e1']);
  assert.deepEqual(state.prices, [{ eventId: 'e1', club: 'MNC', market: 'h2h', price: -250 }]);
  assert.deepEqual(state.snapshots, ['after-mw08']);
  assert.deepEqual(state.bonusTotals, { [NEMO]: 10 });
  assert.deepEqual(state.managers.filter(m => m.subscribed).map(m => m.ownerId), [DARIN]);
  assert.deepEqual(state.budget, { remaining: 120, paused: false });
  const read = await f.rpc('gtl_epl_read_snapshots', [runId, reply.claim, ['after-mw08', 'after-mw9']]);
  assert.deepEqual(Object.keys(read), ['after-mw08']);
  assert.deepEqual(read['after-mw08'].rosters, [{ owner_id: '1' }]);
  assert.equal(read['after-mw08'].stats_mw8, undefined, 'only users and rosters leave the table');
});

test('reserve_credits never takes the shared Odds API budget below 50; record_quota only lowers it', { skip }, async t => {
  const f = await fixture(t);
  const { runId, reply } = await f.claimed('fixtures');
  await f.db.query("update public.gtl_odds_budget set conservative_remaining=null where provider='the-odds-api'");
  assert.deepEqual(await f.rpc('gtl_epl_reserve_credits', [runId, reply.claim, 1]), { ok: false, remaining: null });
  await f.db.query("update public.gtl_odds_budget set conservative_remaining=52 where provider='the-odds-api'");
  assert.deepEqual(await f.rpc('gtl_epl_reserve_credits', [runId, reply.claim, 2]), { ok: true, remaining: 50 });
  assert.deepEqual(await f.rpc('gtl_epl_reserve_credits', [runId, reply.claim, 1]), { ok: false, remaining: 50 });
  assert.deepEqual(await f.rpc('gtl_epl_record_quota', [runId, reply.claim, 70, 430, 2]), { remaining: 50 }, 'a higher provider count never raises the conservative budget');
  assert.deepEqual(await f.rpc('gtl_epl_record_quota', [runId, reply.claim, 40, 460, 2]), { remaining: 40 });
  const row = (await f.db.query("select observed_remaining,observed_used,observed_last from public.gtl_odds_budget where provider='the-odds-api'")).rows[0];
  assert.deepEqual(row, { observed_remaining: 40, observed_used: 460, observed_last: 2 });
  await f.db.query("update public.gtl_odds_budget set conservative_remaining=400,paused=true where provider='the-odds-api'");
  assert.equal((await f.rpc('gtl_epl_reserve_credits', [runId, reply.claim, 1])).ok, false, 'a paused budget refuses');
});

test('mark_nudge records a turn once and returns the linked manager\'s active subscriptions', { skip }, async t => {
  const f = await fixture(t);
  const { runId, reply } = await f.claimed('nudge');
  const mark = (owner, key) => f.rpc('gtl_epl_mark_nudge', [runId, reply.claim, 2026, 9, owner, key]);
  assert.deepEqual(await mark(DARIN, `2026-9-${DARIN}-7`), { recorded: false, subscriptions: [] }, 'an unlinked manager is never marked');
  await f.db.exec(`update public.gtl_epl_managers set user_id='${id(3)}' where owner_id='${DARIN}';
    insert into public.gtl_push_subscriptions(endpoint,user_id,p256dh,auth) values('https://web.push.apple.com/abcdefghijklmnop','${id(3)}','B${'x'.repeat(86)}','${'y'.repeat(22)}');`);
  const first = await mark(DARIN, `2026-9-${DARIN}-7`);
  assert.equal(first.recorded, true);
  assert.deepEqual(first.subscriptions.map(s => s.endpoint), ['https://web.push.apple.com/abcdefghijklmnop']);
  assert.deepEqual(await mark(DARIN, `2026-9-${DARIN}-7`), { recorded: false, subscriptions: [] });
  await assert.rejects(() => mark(DARIN, 'not a key'), /GTL_EPL_INVALID/);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_nudges')).rows[0].n, 1);
});
