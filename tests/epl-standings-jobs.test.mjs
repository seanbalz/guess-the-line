// Dated captured table only; no sports-provider request or hosted write. Real worker/SQL compatibility is below.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALL, version } from './migrations.mjs';
import { createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { createEplJobsAdapter, createEplJobsHandler, runEplJob } from '../cloud/epl-jobs.mjs';

const RECORD = JSON.parse(fs.readFileSync('data/epl/standings/wikimedia-2026-round-08-2026-10-29.json', 'utf8'));
const CAPTURE = Date.parse(RECORD.capturedAt), SAVE = CAPTURE + 60e3, DEADLINE = CAPTURE + 10 * 60e3, USE = CAPTURE + 11 * 60e3;
const ID = '11111111-1111-4111-8111-111111111111';
const state = changes => ({ week: { season: 2026, week: 9, status: 'open', firstKickoff: new Date(DEADLINE).toISOString(), pickOrder: ['one', 'two'] },
  picks: [], queues: {}, fixtures: [{ eventId: 'e1', home: 'MNC', away: 'ARS', status: 'scheduled', commenceTime: new Date(DEADLINE).toISOString() }],
  prices: [], budget: { paused: true, remaining: 50 }, ...changes });
function fake({ value = state(), snapshot = { id: ID, record: RECORD }, enabled = true, errors = {} } = {}) {
  const calls = [], sourceCalls = [];
  const service = { async rpc(name, args) {
    calls.push([name, args]);
    if (errors[name]) throw Object.assign(new Error('private transport detail'), { code: errors[name] });
    if (name === 'gtl_epl_jobs_state') return value;
    if (name === 'gtl_epl_standings_state') return { enabled, snapshot };
    if (name === 'gtl_epl_save_standings') return { id: ID, saved: true };
    if (['gtl_epl_resolve_week', 'gtl_epl_resolve_with_standings'].includes(name)) return { added: args.p_rows.length };
    throw new Error(`Unexpected ${name}`);
  } };
  const sources = { async standings(args) { sourceCalls.push(args); return { status: 'ready', data: structuredClone(RECORD) }; } };
  const run = (job, now) => runEplJob({ job, now, run: { p_run: ID, p_claim: ID }, service, sources, push: {} });
  return { calls, sourceCalls, service, sources, run };
}

test('collection is a separate guarded free job: disabled/missing/not-due/cache-hit paths make no provider request', async () => {
  for (const [options, now, reason] of [
    [{ enabled: false }, SAVE, 'not_open'],
    [{ errors: { gtl_epl_standings_state: 'GTL_EPL_STANDINGS_OFF' } }, SAVE, 'not_open'],
    [{}, DEADLINE, 'not_due'],
    [{}, SAVE, 'nothing_due'],
  ]) {
    const f = fake(options), result = await f.run('standings', now);
    assert.equal(result.reason, reason); assert.equal(f.sourceCalls.length, 0);
    assert.equal(f.calls.filter(([name]) => name === 'gtl_epl_save_standings').length, 0);
  }
  const f = fake({ snapshot: null });
  assert.equal((await f.run('standings', SAVE)).reason, null);
  assert.equal(f.sourceCalls.length, 1);
  assert.deepEqual(f.sourceCalls[0], { season: 2026, completedRound: 8 });
  assert.ok(f.calls.some(([name]) => name === 'gtl_epl_save_standings'));
  assert.ok(!f.calls.some(([name]) => /reserve_credits|record_quota/.test(name)), 'the paused Odds API budget is untouched');
});

test('bad/stale collected input is never persisted, and resolving never fetches a replacement table', async () => {
  const f = fake({ snapshot: null });
  f.sources.standings = async () => ({ status: 'unavailable', reason: 'stale' });
  assert.equal((await f.run('standings', SAVE)).reason, 'source_unavailable');
  assert.ok(!f.calls.some(([name]) => name === 'gtl_epl_save_standings'));
  const stale = fake(); assert.equal((await stale.run('resolve', CAPTURE + 25 * 3600e3)).reason, 'needs_review');
  assert.equal(stale.sourceCalls.length, 0);
  assert.ok(!stale.calls.some(([name]) => name.startsWith('gtl_epl_resolve_')));
});

test('a position dependency resolves through the immutable-reference writer; expiry/conflict at write becomes review', async () => {
  const f = fake(), result = await f.run('resolve', USE);
  assert.equal(result.reason, null);
  const [, args] = f.calls.find(([name]) => name === 'gtl_epl_resolve_with_standings');
  assert.equal(args.p_standings, ID); assert.equal(args.p_rows.find(r => r.source === 'auto').club, 'MNC');
  assert.ok(!f.calls.some(([name]) => name === 'gtl_epl_resolve_week'));
  assert.equal(f.sourceCalls.length, 0);
  for (const code of ['GTL_EPL_STANDINGS_INVALID', 'GTL_EPL_STANDINGS_CONFLICT']) {
    const bad = fake({ errors: { gtl_epl_resolve_with_standings: code } });
    assert.equal((await bad.run('resolve', USE)).reason, 'needs_review');
    assert.ok(!bad.calls.some(([name]) => name === 'gtl_epl_resolve_week'));
  }
});

test('queues and uniquely decisive prices work without any standings dependency; missing/tied price decisions require review', async () => {
  for (const value of [state({ queues: { one: ['ARS'] } }), state({ prices: [
    { eventId: 'e1', club: 'MNC', market: 'h2h', price: -200 }, { eventId: 'e1', club: 'ARS', market: 'h2h', price: 180 },
  ] })]) {
    const f = fake({ value, errors: { gtl_epl_standings_state: 'UNAVAILABLE' } });
    assert.equal((await f.run('resolve', USE)).reason, null);
    assert.ok(f.calls.some(([name]) => name === 'gtl_epl_resolve_week'));
    assert.ok(!f.calls.some(([name]) => name === 'gtl_epl_standings_state'));
  }
  for (const value of [state(), state({ prices: ['MNC', 'ARS'].map(club => ({ eventId: 'e1', club, market: 'h2h', price: -110 })) })]) {
    const f = fake({ value, errors: { gtl_epl_standings_state: 'GTL_EPL_STANDINGS_OFF' } });
    assert.equal((await f.run('resolve', USE)).reason, 'needs_review');
    assert.ok(!f.calls.some(([name]) => name.startsWith('gtl_epl_resolve_')));
  }
});

test('only exact absent optional entries are off; permissions, nested SQL and network errors stay failures', async () => {
  for (const [name, off] of [['gtl_epl_standings_state', 'GTL_EPL_STANDINGS_OFF'], ['gtl_epl_apply_recheck_orders', 'GTL_EPL_ORDER_UPDATE_OFF'],
    ['gtl_epl_reserve_result_read', 'GTL_EPL_RESULT_READ_OFF'], ['gtl_epl_capture_interval', 'GTL_EPL_CAPTURE_INTERVAL_OFF'],
    ['gtl_epl_order_correction_state', 'GTL_EPL_ORDER_STATE_OFF']]) {
    for (const [status, body, expected] of [
      [404, { code: 'PGRST202' }, off], [404, { code: '42883', message: `function public.${name}(uuid) does not exist` }, off],
      [404, { code: '42883', message: 'function public.nested_dependency() does not exist' }, 'UNAVAILABLE'],
      [403, { code: '42501' }, 'UNAVAILABLE'], [503, { code: 'PGRST202' }, 'UNAVAILABLE'],
    ]) {
      const service = createEplJobsAdapter({ url: 'https://example.supabase.co', serviceRoleKey: 'local-fixture',
        fetchImpl: async () => new Response(JSON.stringify(body), { status }) });
      await assert.rejects(service.rpc(name, {}), error => error.code === expected);
    }
  }
});

async function sqlWorld(t, migrations) {
  const world = await createCommunityWorld({ migrations, games: 2, troyBallots: false });
  t.after(() => world.db.close()); const db = world.db, names = [];
  await db.exec("create schema net;create table net.outbox(id bigserial,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id'");
  const service = createEplJobsAdapter({ url: 'https://example.supabase.co', serviceRoleKey: 'local-only-key', fetchImpl: async (url, options) => {
    const name = new URL(url).pathname.split('/').at(-1), args = JSON.parse(options.body); names.push(name);
    const exists = (await db.query("select exists(select 1 from pg_proc where proname=$1) r", [name])).rows[0].r;
    if (!exists) return new Response(JSON.stringify({ code: 'PGRST202' }), { status: 404 });
    try {
      const result = await db.transaction(async tx => {
        await tx.exec('set local role service_role');
        return (await tx.query(`select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) r`, Object.values(args))).rows[0].r;
      });
      return new Response(JSON.stringify(result), { status: 200 });
    } catch (error) { return new Response(JSON.stringify({ code: error.code, message: error.message }), { status: 400 }); }
  } });
  const queue = async job => {
    await db.query("insert into public.gtl_epl_jobs_schedule(job,enabled,endpoint) values($1,true,'https://example.supabase.co/functions/v1/gtl-epl-jobs') on conflict(job) do update set enabled=true", [job]);
    const out = (await db.query('select public.gtl_epl_dispatch_jobs($1) r', [job])).rows[0].r;
    const auth = (await db.query("select headers->>'Authorization' auth from net.outbox where body->>'runId'=$1", [out.runId])).rows[0].auth;
    return new Request('https://example.supabase.co/functions/v1/gtl-epl-jobs', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ runId: out.runId }) });
  };
  return { db, service, names, queue };
}
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed.';

for (const [label, cutoff, count] of [['M30/M31', 20261029060000, 5], ['M32/M33', 20261029151727, 6], ['M34', Infinity, 6]]) {
  test(`existing ${count} jobs still dispatch, claim and complete before/after M34 on ${label}`, { skip }, async t => {
    const f = await sqlWorld(t, ALL.filter(file => version(file) <= cutoff));
    const handler = createEplJobsHandler({ service: f.service, sources: {}, push: {}, clock: () => SAVE });
    for (const job of ['snapshot', 'fixtures', 'resolve', 'settle', 'nudge', ...(count === 6 ? ['dnb-check'] : [])]) {
      const response = await handler(await f.queue(job)), body = await response.json();
      assert.equal(response.status, 200); assert.equal(body.reason, 'no_week'); assert.equal(body.status, 'skipped');
    }
    assert.equal((await f.db.query("select count(*)::int n from public.gtl_epl_jobs_schedule where job='standings'")).rows[0].n, 0);
  });
}

test('captured source → real private persistence → strict resolver → immutable usage works through the handler and adapter', { skip }, async t => {
  const f = await sqlWorld(t, ALL);
  const owners = (await f.db.query('select owner_id from public.gtl_epl_managers order by owner_id limit 2')).rows.map(r => r.owner_id);
  await f.db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order) values(2026,9,'2026-10-28','2026-11-04',$1,$2)", [new Date(DEADLINE).toISOString(), owners]);
  await f.db.query("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values('e1',2026,9,'MNC','ARS',$1)", [new Date(DEADLINE).toISOString()]);
  let sourceCalls = 0;
  const sources = { async standings() { sourceCalls++; return { status: 'ready', data: structuredClone(RECORD) }; } };
  const before = (await f.db.query("select * from public.gtl_odds_budget where provider='the-odds-api'")).rows;
  const collection = await createEplJobsHandler({ service: f.service, sources, push: {}, clock: () => SAVE })(await f.queue('standings'));
  assert.equal((await collection.json()).status, 'succeeded');
  const resolved = await createEplJobsHandler({ service: f.service, sources, push: {}, clock: () => USE })(await f.queue('resolve'));
  assert.equal((await resolved.json()).status, 'succeeded'); assert.equal(sourceCalls, 1);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_picks')).rows[0].n, 2);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_standings_usage')).rows[0].n, 1);
  assert.ok(f.names.includes('gtl_epl_resolve_with_standings'));
  assert.ok(!f.names.includes('gtl_epl_resolve_week'), 'the atomic wrapper retains the reference');
  assert.deepEqual((await f.db.query("select * from public.gtl_odds_budget where provider='the-odds-api'")).rows, before);
});
