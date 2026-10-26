import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ALL, NOT_HOSTED, version } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { serviceSql } from './helpers/guess-week.mjs';
import { createFeaturesHandler } from '../cloud/features-run.mjs';

// M-26 features_schedule (redesign build plan stage 70): the disabled schedule, the 15-minute dispatcher, the one-run claim
// and completion, and the gtl-league-features worker end to end on local PGlite (ALL). pg_net is hosted-only, so net.http_post
// is a stand-in that records each call in an outbox (as tests/web-push-sql.test.mjs does). Fixture accounts only.
const MIGRATION = '20261026233000_gtl_features_schedule.sql';
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const SEAN = ACCOUNTS.sean.id, LUKE = ACCOUNTS.luke.id;
const ENDPOINT = 'https://onmrgvcehkflfaizvedl.supabase.co/functions/v1/gtl-league-features';

async function fixture(t) {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world;
  await db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';");
  const dispatch = async () => (await db.query('select public.gtl_dispatch_league_features() value')).rows[0].value;
  const lastToken = async () => (await db.query("select headers->>'Authorization' auth from net.outbox order by id desc limit 1")).rows[0].auth.slice(7);
  const runs = async () => (await db.query('select id,status,reason from public.gtl_features_schedule_runs order by created_at')).rows;
  const schedule = (enabled, by = SEAN) => db.query("insert into public.gtl_features_schedule(id,enabled,endpoint,authorized_by,season) values('league-features',$1,$2,$3,2026) on conflict(id) do update set enabled=excluded.enabled,authorized_by=excluded.authorized_by", [enabled, ENDPOINT, by]);
  return { world, db, call: serviceSql(db), dispatch, lastToken, runs, schedule };
}

test('M-26 is written and not applied, and its admin script registers the schedule disabled with the cron commented out', () => {
  assert.ok(ALL.includes(MIGRATION));
  assert.ok(NOT_HOSTED.includes(version(MIGRATION)));
  const sql = fs.readFileSync(new URL('../supabase/admin/league_features_cron.sql', import.meta.url), 'utf8');
  assert.match(sql, /insert into public\.gtl_features_schedule\(id,enabled,endpoint,authorized_by,season\)\s*select 'league-features',false,/);
  const live = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
  assert.doesNotMatch(live, /cron\.schedule|enabled=true|set enabled = true/, 'enabling and the cron are Sean\'s, after a live dry run');
  assert.match(sql, /-- select cron\.schedule\('gtl-league-features-every-15-minutes','\*\/15 \* \* \* \*'/);
  assert.doesNotMatch(fs.readFileSync(new URL(`../supabase/migrations/${MIGRATION}`, import.meta.url), 'utf8'), /insert into public\.gtl_features_schedule\b/, 'the migration inserts no schedule row');
});

test('grants: the dispatcher is cron only; claim and complete are service-role only; the tables are read-only to it', { skip }, async t => {
  const { db } = await fixture(t);
  const has = async (role, fn) => (await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${fn}`, 'EXECUTE'])).rows[0].ok;
  for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(await has(role, 'gtl_dispatch_league_features()'), false, role);
  for (const fn of ['gtl_claim_league_features(text,uuid)', 'gtl_complete_league_features(uuid,uuid,text)']) {
    assert.equal(await has('service_role', fn), true, fn);
    for (const role of ['anon', 'authenticated']) assert.equal(await has(role, fn), false, `${role} ${fn}`);
  }
  for (const table of ['gtl_features_schedule', 'gtl_features_schedule_runs']) {
    assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true);
    for (const priv of ['INSERT', 'DELETE']) assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok', ['service_role', `public.${table}`, priv])).rows[0].ok, false, `${priv} ${table}`);
  }
});

test('off by default; one run per 15-minute slot; a run is claimed once with its own token', { skip }, async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.dispatch(), { status: 'disabled' }, 'no schedule row');
  await f.schedule(false);
  assert.deepEqual(await f.dispatch(), { status: 'disabled' }, 'disabled until Sean enables it');
  assert.equal((await f.db.query('select count(*)::int n from net.outbox')).rows[0].n, 0, 'nothing is called while disabled');
  await f.schedule(true);
  const queued = await f.dispatch();
  assert.equal(queued.status, 'queued');
  assert.deepEqual(await f.dispatch(), { status: 'already_dispatched' }, 'two dispatches in one slot give one run');
  const token = await f.lastToken();
  await assert.rejects(f.call('gtl_claim_league_features', { p_token: 'f'.repeat(64), p_run: queued.runId }), /GTL_SCHEDULE_AUTH/);
  const claim = await f.call('gtl_claim_league_features', { p_token: token, p_run: queued.runId });
  assert.deepEqual({ ...claim, claim: typeof claim.claim, now: typeof claim.now }, { replay: false, runId: queued.runId, claim: 'string', actorId: SEAN, season: 2026, now: 'string' });
  const second = await f.call('gtl_claim_league_features', { p_token: token, p_run: queued.runId });
  assert.deepEqual(second, { replay: true, runId: queued.runId, status: 'running', reason: null }, 'two claims give one run');
  await assert.rejects(f.call('gtl_complete_league_features', { p_run: queued.runId, p_claim: randomUUID(), p_reason: null }), /GTL_SCHEDULE_RUN/);
  await assert.rejects(f.call('gtl_complete_league_features', { p_run: queued.runId, p_claim: claim.claim, p_reason: 'made_up' }), /GTL_SCHEDULE_RUN/);
  assert.deepEqual(await f.call('gtl_complete_league_features', { p_run: queued.runId, p_claim: claim.claim, p_reason: 'no_season' }), { runId: queued.runId, status: 'skipped', reason: 'no_season' });
  assert.deepEqual(await f.call('gtl_complete_league_features', { p_run: queued.runId, p_claim: claim.claim, p_reason: null }), { runId: queued.runId, status: 'skipped', reason: 'no_season' }, 'a finished run stays as it finished');
});

test('a schedule whose authorizing account is no longer the commissioner skips its run', { skip }, async t => {
  const f = await fixture(t);
  await f.schedule(true, LUKE);
  const queued = await f.dispatch();
  assert.deepEqual(await f.call('gtl_claim_league_features', { p_token: await f.lastToken(), p_run: queued.runId }),
    { replay: true, runId: queued.runId, status: 'skipped', reason: 'commissioner_unavailable' });
});

test('the worker end to end: it claims, records through M-25 as a scheduled run with the run\'s own id, and completes', { skip }, async t => {
  const f = await fixture(t);
  await f.schedule(true);
  const queued = await f.dispatch();
  // As createFeaturesAdapter does: a schedule refusal keeps its code, anything else is UNAVAILABLE.
  const service = { rpc: (name, args) => f.call(name, args).catch(error => {
    throw Object.assign(new Error('Features operation unavailable'), { code: /^GTL_SCHEDULE_(AUTH|RUN|EXPIRED)$/.test(error.message) ? error.message : 'UNAVAILABLE' });
  }) };
  const handler = createFeaturesHandler({ service });
  const request = (token, body = { runId: queued.runId }) => new Request(ENDPOINT, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await handler(request('0'.repeat(64)))).status, 401, 'a token that is not this run\'s');
  const response = await handler(request(await f.lastToken()));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { runId: queued.runId, status: 'succeeded', reason: null });
  assert.deepEqual(await f.runs(), [{ id: queued.runId, status: 'succeeded', reason: null }]);
  const recorded = (await f.db.query('select id,trigger,actor_id,summary from public.gtl_feature_runs')).rows;
  assert.deepEqual(recorded.map(r => [r.id, r.trigger, r.actor_id, r.summary.replay]), [[queued.runId, 'schedule', SEAN, false]], 'M-25 recorded it under the schedule run\'s id');
  assert.equal((await handler(request(await f.lastToken()))).status, 200, 'a repeated call replays');
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_feature_runs')).rows[0].n, 1, 'and records nothing new');
});
