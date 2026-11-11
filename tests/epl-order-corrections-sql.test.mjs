// Serialized PGlite actors exercise both lock orderings; this is not a live concurrent PostgreSQL test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunityWorld, id, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { ALL } from './migrations.mjs';
import { pickOrder } from '../shared/epl-draft.mjs';

const skip = pgliteAvailable ? false : 'Install optional local PGlite; no remote database tests are run.';
const ORDER = ['865667912365666304','1259267898757611520','719745569895018496','473955676301815808','719658248843632640','1257180071064510465','702644837370929152','1395236217460633600'];
const RUN = id(600), CLAIM = id(601), NOW = '2026-11-03T20:05:00Z';
// Reorder RPCs correctly compare with the database clock after taking row locks.
// Keep this fictional draft open relative to the run, rather than expiring on Nov 7, 2026.
const NEXT_KICKOFF = new Date(Date.now()+48*3600_000).toISOString();
async function fixture(t, { baseline = true } = {}) {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false }); t.after(() => world.db.close());
  const db = world.db;
  const rpc = (name,args) => db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value; });
  const payload = (week,changed) => ({ state:{week,season:'2026'}, rosters:ORDER.map((owner,i)=>({owner_id:owner,settings:{fpts:500+(changed?(i===0?100:i===1?0:10):0),fpts_decimal:25,fpts_against:400}})) });
  await db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status) values(2026,9,'2026-10-30','2026-11-04','2026-10-31T12:30Z',$1,'settled'),(2026,10,'2026-11-04','2026-11-11',$2,$1,'open')",[ORDER,NEXT_KICKOFF]);
  await db.query("update public.gtl_epl_managers set user_id=case when owner_id=$1 then $2::uuid when owner_id=$3 then $4::uuid end where owner_id in ($1,$3)",[ORDER[0],id(1),ORDER[1],id(2)]);
  await db.query("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values('next',2026,10,'ARS','LIV',$1)",[NEXT_KICKOFF]);
  await db.query("insert into public.gtl_epl_snapshots(label,week,captured_at,payload) values('after-mw9',9,'2026-11-03T02:00Z',$1),('after-mw9-recheck',9,$2,$3)",[payload(10,false),NOW,payload(10,true)]);
  await db.exec("insert into public.gtl_epl_stat_rechecks(season,week,original_snapshot_id,recheck_snapshot_id,checked_at,scores_changed,status) select 2026,9,a.id,b.id,b.captured_at,true,'needs_review' from public.gtl_epl_snapshots a,public.gtl_epl_snapshots b where a.label='after-mw9' and b.label='after-mw9-recheck'");
  const addBaseline = () => db.query("insert into public.gtl_epl_snapshots(label,week,captured_at,payload) values('after-mw08',8,'2026-10-28T02:00Z',$1)",[payload(9,false)]);
  if (baseline) await addBaseline();
  await db.query("insert into public.gtl_epl_capture_intervals(season,week,next_week,next_kickoff,verified_at,verified_by,schedule_sha256,reference,coverage_complete) values(2026,9,10,$1,'2026-10-28T00:00Z','00000000-0000-4000-8000-000000000003',repeat('c',64),'https://example.test/fixture-interval',true)",[NEXT_KICKOFF]);
  await db.query("insert into public.gtl_epl_job_runs(id,job,slot_start,capability_hash,status,claim_token,claimed_at) values($1,'snapshot',clock_timestamp(),$2,'running',$3,clock_timestamp())",[RUN,'a'.repeat(64),CLAIM]);
  const apply = (now=NOW) => rpc('gtl_epl_apply_recheck_orders',[RUN,CLAIM,now]);
  const order = async () => (await db.query('select pick_order from public.gtl_epl_weeks where week=10')).rows[0].pick_order;
  return {db,rpc,apply,order,addBaseline};
}

test('empty-draft correction uses Sleeper scores/season ties without readding recorded bonuses, with immutable audit replay', {skip}, async t => {
  const f=await fixture(t);
  await f.db.query("insert into public.gtl_epl_bonus(season,week,owner_id,points,margin,club) values(2026,9,$1,15,3,'ARS'),(2026,8,$2,5,1,'LIV')",[ORDER[1],ORDER[2]]);
  const expected=pickOrder(ORDER.map((owner,i)=>({id:owner,weekScore:i===0?100:i===1?0:10,weekBonus:0,seasonTotal:500.25+(i===0?100:i===1?0:10)})));
  assert.deepEqual(await f.apply(),{applied:1,sameOrder:0,preserved:0,pending:0});
  assert.deepEqual(await f.order(),expected);
  assert.deepEqual(await f.apply(),{applied:0,sameOrder:0,preserved:0,pending:0});
  const audit=(await f.db.query('select outcome,previous_order,candidate_order from public.gtl_epl_order_corrections')).rows;
  assert.deepEqual(audit,[{outcome:'applied',previous_order:ORDER,candidate_order:expected}]);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_snapshots')).rows[0].n,3);
  assert.deepEqual(await f.rpc('gtl_epl_order_correction_state',[2026]),[{week:9,outcome:'applied'}]);
});

test('first pick wins before recompute: preserve byte-identical picks/order and flag review once', {skip}, async t => {
  const f=await fixture(t);
  await f.rpc('gtl_epl_save_pick',[id(1),2026,10,'ARS',NOW]);
  const picks=(await f.db.query('select jsonb_agg(to_jsonb(p)) value from public.gtl_epl_picks p')).rows[0].value;
  assert.deepEqual(await f.apply(),{applied:0,sameOrder:0,preserved:1,pending:0});
  assert.deepEqual(await f.order(),ORDER);
  assert.deepEqual((await f.db.query('select jsonb_agg(to_jsonb(p)) value from public.gtl_epl_picks p')).rows[0].value,picks);
  assert.deepEqual(await f.apply(),{applied:0,sameOrder:0,preserved:0,pending:0});
  assert.equal((await f.db.query('select status from public.gtl_epl_stat_rechecks')).rows[0].status,'needs_review');
});

test('recompute wins before first pick: old first manager is refused and corrected first manager can pick', {skip}, async t => {
  const f=await fixture(t); await f.apply();
  await assert.rejects(()=>f.rpc('gtl_epl_save_pick',[id(1),2026,10,'ARS',NOW]),/GTL_EPL_NOT_YOUR_TURN/);
  await f.rpc('gtl_epl_save_pick',[id(2),2026,10,'ARS',NOW]);
  assert.equal((await f.db.query('select owner_id from public.gtl_epl_picks')).rows[0].owner_id,ORDER[1]);
});

test('missing baseline/settlement stays retryable; zero picks at deadline never permits a late reorder', {skip}, async t => {
  const f=await fixture(t,{baseline:false});
  assert.deepEqual(await f.apply(),{applied:0,sameOrder:0,preserved:0,pending:1});
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_order_corrections')).rows[0].n,0);
  await f.addBaseline(); await f.db.exec("update public.gtl_epl_weeks set status='resolved' where week=9");
  assert.equal((await f.apply()).pending,1);
  await f.rpc('gtl_epl_settle_week',[2026,9,[],null]);
  assert.equal((await f.apply(NEXT_KICKOFF)).preserved,1);
  assert.deepEqual(await f.order(),ORDER);
  assert.deepEqual(await f.rpc('gtl_epl_order_correction_state',[2026]),[{week:9,outcome:'preserved_closed'}]);
});

test('a later baseline repairs a pending correction without a duplicate outcome or new source capture', {skip}, async t => {
  const f=await fixture(t,{baseline:false});
  assert.equal((await f.apply()).pending,1); await f.addBaseline();
  assert.equal((await f.apply()).applied,1);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_order_corrections')).rows[0].n,1);
  assert.equal((await f.apply()).applied,0);
});

test('explicit interval evidence requires a commissioner/full coverage and never extends an earlier conservative bound', {skip}, async t => {
  const f=await fixture(t);
  const args=[2026,9,10,NEXT_KICKOFF,'2026-10-28T12:00Z','a'.repeat(64),'https://example.test/verified-schedule',true];
  await assert.rejects(()=>f.rpc('gtl_epl_attest_capture_interval',[id(1),...args]),/GTL_EPL_FORBIDDEN/);
  await assert.rejects(()=>f.rpc('gtl_epl_attest_capture_interval',[id(3),...args.slice(0,-1),false]),/GTL_EPL_INVALID/);
  assert.equal(await f.rpc('gtl_epl_attest_capture_interval',[id(3),...args]),true);
  assert.equal(await f.rpc('gtl_epl_attest_capture_interval',[id(3),...args]),false);
  const later=[...args];later[3]=new Date(Date.parse(NEXT_KICKOFF)+24*3600_000).toISOString();later[5]='b'.repeat(64);
  assert.equal(await f.rpc('gtl_epl_attest_capture_interval',[id(3),...later]),true);
  const interval=await f.rpc('gtl_epl_capture_interval',[RUN,CLAIM,2026,9]);
  assert.equal(Date.parse(interval.nextKickoff),Date.parse(args[3]));
  assert.equal(interval.source,'commissioner_verified_schedule');
  assert.equal(await f.rpc('gtl_epl_capture_interval',[RUN,CLAIM,2026,10]),null);
  for(const role of ['anon','authenticated'])for(const table of ['gtl_epl_order_corrections','gtl_epl_result_reads','gtl_epl_capture_intervals'])
    await assert.rejects(()=>f.db.transaction(async tx=>{await tx.exec(`set local role ${role}`);return tx.query(`select * from public.${table}`);}),/permission denied/);
  const fn=(await f.db.query("select p.proname,p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') as anon,has_function_privilege('authenticated',p.oid,'EXECUTE') as auth,has_function_privilege('service_role',p.oid,'EXECUTE') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('gtl_epl_reserve_result_read','gtl_epl_apply_recheck_orders','gtl_epl_order_correction_state','gtl_epl_capture_interval','gtl_epl_attest_capture_interval')")).rows;
  assert.equal(fn.length,5); assert.ok(fn.every(row=>!row.prosecdef&&!row.anon&&!row.auth&&row.service));
});

test('result reservations share cooldown/cap across jobs, count unknown attempts, and preserve atomic reserve50', {skip}, async t => {
  const f=await fixture(t);
  await f.db.exec("update public.gtl_odds_budget set conservative_remaining=100,paused=false where provider='the-odds-api'");
  const reserve=async(i,job,when)=>{const run=id(700+i);await f.db.query("insert into public.gtl_epl_job_runs(id,job,slot_start,capability_hash,status,claim_token,claimed_at) values($1,$2,timestamptz '2026-10-01'+($3+1)*interval '5 minutes',$4,'running',$5,clock_timestamp())",[run,job,i,'a'.repeat(64),CLAIM]);return f.rpc('gtl_epl_reserve_result_read',[run,CLAIM,2026,9,when]);};
  assert.equal((await reserve(0,'snapshot',NOW)).ok,true);
  assert.equal((await f.rpc('gtl_epl_reserve_result_read',[id(700),CLAIM,2026,9,NOW])).reason,'already_reserved');
  assert.equal((await reserve(1,'settle','2026-11-04T08:04Z')).reason,'cooldown');
  assert.equal((await reserve(2,'settle','2026-11-04T08:05Z')).ok,true);
  for(let i=2;i<8;i++)assert.equal((await reserve(i+1,i%2?'snapshot':'settle',new Date(Date.parse(NOW)+i*12*3600_000).toISOString())).ok,true);
  assert.equal((await reserve(20,'snapshot','2026-11-10T20:05Z')).reason,'limit');
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_result_reads')).rows[0].n,8);
  assert.equal((await f.db.query("select conservative_remaining n from public.gtl_odds_budget where provider='the-odds-api'")).rows[0].n,84);
  await f.db.exec("update public.gtl_odds_budget set conservative_remaining=51 where provider='the-odds-api'");
  assert.equal((await f.rpc('gtl_epl_reserve_result_read',[RUN,CLAIM,2026,10,'2026-11-10T20:05Z'])).reason,'budget_guard');
  for(const role of ['anon','authenticated'])await assert.rejects(()=>f.db.transaction(async tx=>{await tx.exec(`set local role ${role}`);return tx.query('select * from public.gtl_epl_order_corrections');}),/permission denied/);
});


test('post-lock database clock prevents a reorder using a stale pre-deadline supplied timestamp', {skip},async t=>{
 const f=await fixture(t);
 await f.db.exec("update public.gtl_epl_weeks set first_kickoff=clock_timestamp()-interval '1 second' where week=10");
 assert.equal((await f.apply('2026-10-01T00:00Z')).preserved,1);
 assert.deepEqual(await f.order(),ORDER);
 assert.deepEqual(await f.rpc('gtl_epl_order_correction_state',[2026]),[{week:9,outcome:'preserved_closed'}]);
});

// D-83 (Sean, November 11, 2026: "Yes, import wins"). The commissioner's confirmed weekly-score import (hosted M-43) of
// week n decides week n+1's order; a later recheck records the order it would have set and changes nothing.
const IMPORTED = [...ORDER].reverse();
const confirmImport = (f, order = IMPORTED, week = 9) => f.rpc('gtl_epl_import_weekly_scores', [id(3), 2026, week, week, false, ['d'.repeat(64)],
  JSON.stringify(order.map((owner_id, i) => ({ owner_id, score: 40 + i }))), order, true, false, null]);
const corrected = () => pickOrder(ORDER.map((owner, i) => ({ id: owner, weekScore: i === 0 ? 100 : i === 1 ? 0 : 10, weekBonus: 0, seasonTotal: 500.25 + (i === 0 ? 100 : i === 1 ? 0 : 10) })));

test('import then recheck: the confirmed order stays and preserved_import records both orders beside the evidence', {skip}, async t => {
  const f = await fixture(t);
  assert.equal((await confirmImport(f)).opening.outcome, 'order_applied');
  assert.deepEqual(await f.order(), IMPORTED);
  assert.notDeepEqual(corrected(), IMPORTED);
  assert.deepEqual(await f.apply(), { applied: 0, sameOrder: 0, preserved: 1, pending: 0 });
  assert.deepEqual(await f.order(), IMPORTED, 'the recheck never changes an imported week by itself');
  const audit = (await f.db.query("select c.outcome,c.previous_order,c.candidate_order,b.label baseline from public.gtl_epl_order_corrections c join public.gtl_epl_snapshots b on b.id=c.baseline_snapshot_id")).rows;
  assert.deepEqual(audit, [{ outcome: 'preserved_import', previous_order: IMPORTED, candidate_order: corrected(), baseline: 'after-mw08' }]);
  assert.deepEqual(await f.rpc('gtl_epl_order_correction_state', [2026]), [{ week: 9, outcome: 'preserved_import', keptOrder: IMPORTED, candidateOrder: corrected() }]);
  assert.deepEqual(await f.apply(), { applied: 0, sameOrder: 0, preserved: 0, pending: 0 }, 'one outcome per recheck, never a second');
  // The corrected order's first manager is refused: the imported order is the one the draft uses.
  await assert.rejects(() => f.rpc('gtl_epl_save_pick', [id(2), 2026, 10, 'ARS', NOW]), /GTL_EPL_NOT_YOUR_TURN/);
  // D-23: the M-33 flag, both snapshots, the baseline and every import row are kept.
  assert.equal((await f.db.query('select status from public.gtl_epl_stat_rechecks')).rows[0].status, 'needs_review');
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_snapshots')).rows[0].n, 3);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_score_import_rows')).rows[0].n, 8);
  await assert.rejects(() => f.db.query("insert into public.gtl_epl_order_corrections(recheck_snapshot_id,season,week,outcome,previous_order,recorded_at) select id,2026,9,'preserved_import',$1,now() from public.gtl_epl_snapshots where label='after-mw08'", [IMPORTED]),
    /gtl_epl_order_corrections_check/, 'preserved_import needs its candidate order and baseline');
});

test('import then recheck with the same order is same_order and leaves nothing to preserve', {skip}, async t => {
  const f = await fixture(t);
  await confirmImport(f, corrected());
  assert.deepEqual(await f.apply(), { applied: 0, sameOrder: 1, preserved: 0, pending: 0 });
  assert.deepEqual(await f.order(), corrected());
  assert.deepEqual(await f.rpc('gtl_epl_order_correction_state', [2026]), [{ week: 9, outcome: 'same_order' }]);
});

test('recheck then import: the reorder applies first and the confirmed import then sets its own order', {skip}, async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.apply(), { applied: 1, sameOrder: 0, preserved: 0, pending: 0 });
  assert.deepEqual(await f.order(), corrected());
  const out = await confirmImport(f);
  assert.equal(out.opening.outcome, 'order_applied');
  assert.deepEqual(out.opening.order, IMPORTED);
  assert.deepEqual(await f.order(), IMPORTED);
  assert.deepEqual((await f.db.query('select outcome,previous_order,applied_order from public.gtl_epl_score_import_openings')).rows,
    [{ outcome: 'order_applied', previous_order: corrected(), applied_order: IMPORTED }]);
  assert.deepEqual(await f.apply(), { applied: 0, sameOrder: 0, preserved: 0, pending: 0 });
  assert.deepEqual(await f.order(), IMPORTED);
  assert.deepEqual(await f.rpc('gtl_epl_order_correction_state', [2026]), [{ week: 9, outcome: 'applied' }]);
});

test('a week without its own import still gets the corrected order automatically, even when another week has one', {skip}, async t => {
  const f = await fixture(t);
  await f.db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status) values(2026,8,'2026-10-23','2026-10-30','2026-10-24T12:30Z',$1,'settled')", [ORDER]);
  assert.equal((await confirmImport(f, IMPORTED, 8)).opening.outcome, 'preserved_closed', 'the week 8 import cannot touch settled week 9');
  assert.equal(await f.rpc('gtl_epl_score_import_head', [2026, 9]), null);
  assert.deepEqual(await f.apply(), { applied: 1, sameOrder: 0, preserved: 0, pending: 0 });
  assert.deepEqual(await f.order(), corrected());
});
