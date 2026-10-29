import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { ALL, version } from './migrations.mjs';
import { createEplJobsAdapter, createEplJobsHandler } from '../cloud/epl-jobs.mjs';

for (const schema of ['m30-m31', 'm32', 'm33']) test(schema === 'm33'
  ? 'the real worker handler and adapter record a due recheck once M33 is installed'
  : `the real worker handler keeps existing daily captures working against ${schema.toUpperCase()} before M33 apply`, {
  skip: pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.',
}, async t => {
  const installed = schema === 'm33';
  // Explicit before-M33 boundaries remain reproducible after later apply records change HOSTED.
  const legacy = ALL.filter(file => version(file) <= (schema === 'm32' ? 20261029150000 : 20261029060000));
  const world = await createCommunityWorld({ migrations: installed ? ALL : legacy, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const db = world.db, calls = [], transportErrors = [];
  const runId = '11111111-1111-4111-8111-111111111111', capability = 'a'.repeat(64);
  const now = installed ? '2026-11-03T20:05:00Z' : '2026-10-29T15:00:00Z';
  const owners = (await db.query('select owner_id from public.gtl_epl_managers order by owner_id')).rows.map(r => r.owner_id);
  await db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order) values(2026,9,'2026-10-30','2026-11-04','2026-10-31T12:30Z',$1)", [owners]);
  const rosterRows = changed => owners.map((id, i) => ({ owner_id: id, settings: { fpts: 500 + (changed && i === 0 ? 1 : 0), fpts_against: 400 } }));
  if (installed) {
    await db.exec("update public.gtl_epl_weeks set status='settled' where week=9");
    await db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order) values(2026,10,'2026-11-04','2026-11-11','2026-11-07T12:30Z',$1)", [owners]);
    await db.exec("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time,status,home_goals,away_goals) values('fixture',2026,9,'ARS','LIV','2026-11-02T20:00Z','final',2,0)");
    await db.query("insert into public.gtl_epl_snapshots(label,captured_at,week,payload) values('after-mw9','2026-11-03T02:00Z',9,$1)", [{ state: { season: '2026', week: 10 }, rosters: rosterRows(false) }]);
  }
  await db.query("insert into public.gtl_epl_jobs_schedule(job,enabled,endpoint) values('snapshot',true,'https://example.supabase.co/functions/v1/gtl-epl-jobs')");
  await db.query("insert into public.gtl_epl_job_runs(id,job,slot_start,capability_hash) values($1,'snapshot',clock_timestamp(),$2)", [runId, createHash('sha256').update(capability).digest('hex')]);
  const service = createEplJobsAdapter({ url: 'https://example.supabase.co', serviceRoleKey: 'local-fixture-key', fetchImpl: async (url, options) => {
    const name = new URL(url).pathname.split('/').at(-1), args = JSON.parse(options.body);
    calls.push(name);
    // Local PostgREST transport double: real catalog absence is exactly the 404/PGRST202 response Supabase returns.
    const exists = (await db.query("select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1) value", [name])).rows[0].value;
    if (!exists) return new Response(JSON.stringify({ code: 'PGRST202' }), { status: 404 });
    try {
      const keys = Object.keys(args);
      assert.ok(keys.every(key => /^p_[a-z0-9_]+$/.test(key)));
      const result = await db.transaction(async tx => {
        await tx.exec('set local role service_role');
        return (await tx.query(`select public.${name}(${keys.map((key, i) => `${key}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value;
      });
      return new Response(JSON.stringify(result), { status: 200 });
    } catch (error) { transportErrors.push({ name, code: error.code }); return new Response(JSON.stringify({ code: error.code, message: error.message }), { status: 400 }); }
  } });
  const handler = createEplJobsHandler({ service, clock: () => Date.parse(now), sources: {
    sleeper: async ({ label }) => ({ label, capturedAt: now, sha256: {}, payload: { state: { season: '2026', week: installed ? 10 : 9 }, rosters: installed ? rosterRows(true) : [] } }),
  } });
  const response = await handler(new Request('https://example.supabase.co/functions/v1/gtl-epl-jobs', {
    method: 'POST', headers: { authorization: `Bearer ${capability}`, 'content-type': 'application/json' }, body: JSON.stringify({ runId }),
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, installed ? 'skipped' : 'succeeded', JSON.stringify({ calls, transportErrors }));
  assert.equal(body.reason, installed ? 'needs_review' : null);
  assert.ok(calls.includes('gtl_epl_recheck_state'));
  assert.equal(calls.includes('gtl_epl_record_recheck'), installed);
  assert.deepEqual((await db.query('select label from public.gtl_epl_snapshots order by id')).rows.map(r => r.label), installed
    ? ['after-mw9', 'daily-2026-11-03', 'after-mw9-recheck'] : ['daily-2026-10-29']);
  const storedRun = (await db.query('select status,detail from public.gtl_epl_job_runs where id=$1', [runId])).rows[0];
  assert.equal(storedRun.status, installed ? 'skipped' : 'succeeded');
  assert.equal(storedRun.detail.recheckReady, installed, 'operational readback explicitly distinguishes captures from correction readiness');
  assert.deepEqual(transportErrors, []);
});
