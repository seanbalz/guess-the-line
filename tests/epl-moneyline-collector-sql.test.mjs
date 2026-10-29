// Disposable PGlite only: M-36 depends on hosted M-30/M-31/M-32, never on pending M-33/M-34/M-35.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRELUDE, NOT_HOSTED, FIX_FORWARD } from './migrations.mjs';
import { createEplMoneylineCollector } from '../cloud/epl-moneyline-collector.mjs';
const { PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js');
const FILE='supabase/migrations/20261029165947_gtl_epl_moneyline_collector.sql';
const U=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const OWNERS=['719658248843632640','473955676301815808','702644837370929152'];
const T=Date.parse('2026-10-30T12:00:00Z'), K=T+86400000, at=n=>new Date(n).toISOString();
const gateBooks={draftkings:{ARS:-150,CHE:130},fanduel:{ARS:-140,CHE:120}};
const verdict=(week=9)=>({season:2026,week,dnbAvailable:true,events:[{eventId:'e1',books:gateBooks},{eventId:'e2',books:gateBooks}]});
const evidence=(observed=T+1000, changes={})=>({eventId:'e1',available:true,home:'ARS',away:'CHE',commenceTime:at(K),observedAt:at(observed),
  responseSha256:'a'.repeat(64),books:gateBooks,bookObservedAt:{draftkings:at(observed-60000),fanduel:at(observed-120000)},...changes});
async function setup(t) {
  const db=new PGlite(); t.after(()=>db.close()); await db.exec(PRELUDE);
  for(const file of ['20261008164249_gtl_private_cloud_state.sql','20261008174007_gtl_profiles_private_games_invites.sql',
    '20261028190000_gtl_epl_pick_a_team.sql','20261029060000_gtl_epl_open_access.sql','20261029150000_gtl_epl_moneyline.sql']) await db.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
  await db.exec(`create table public.gtl_odds_budget(provider text primary key,conservative_remaining integer,paused boolean default false,
    observed_remaining integer,observed_used integer,observed_last integer,observed_at timestamptz,updated_at timestamptz);
    insert into public.gtl_odds_budget(provider,conservative_remaining) values('the-odds-api',100);
    grant select,update on public.gtl_odds_budget to service_role;`);
  await db.exec(fs.readFileSync(FILE,'utf8'));
  for(let i=0;i<3;i++) {
    await db.query('insert into auth.users values($1)',[U(i+1)]);
    await db.query('update public.gtl_epl_managers set user_id=$1 where owner_id=$2',[U(i+1),OWNERS[i]]);
  }
  await db.query(`insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order) values(2026,9,$1,$2,$3,$4)`,[at(T-3600000),at(K+86400000),at(K),OWNERS]);
  await db.query("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values('e1',2026,9,'ARS','CHE',$1),('e2',2026,9,'LIV','EVE',$1)",[at(K)]);
  const call=async(name,args={})=>{ const keys=Object.keys(args); return (await db.query(`select public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) r`,Object.values(args))).rows[0].r; };
  const gate=async(detail=verdict(),status='succeeded')=>db.query("insert into public.gtl_epl_job_runs(job,slot_start,capability_hash,status,detail) values('dnb-check',clock_timestamp()+random()*interval '1 hour',repeat('a',64),$1,$2)",[status,detail]);
  const enable=()=>db.exec("insert into public.gtl_epl_jobs_schedule(job,enabled) values('moneyline',true) on conflict(job) do update set enabled=true");
  const save=(user=U(1),time=T,event='e1')=>call('gtl_epl_save_guess',{p_user:user,p_event_id:event,p_club:event==='e1'?'ARS':'LIV',p_price:-120,p_lock:true,p_now:at(time)});
  const begin=(time=T,user=U(1),extra={})=>call('gtl_epl_begin_moneyline_read',{p_event_id:'e1',p_user:user,p_now:at(time),...extra});
  const finish=(lease,event=evidence(),time=T+1000,extra={})=>call('gtl_epl_finish_moneyline_read',{p_lease:lease.leaseId,p_token:lease.token,p_event:event,p_now:at(time),...extra});
  const remaining=async()=> (await db.query('select conservative_remaining n from public.gtl_odds_budget')).rows[0].n;
  const guess=async()=> (await db.query("select reference_price,reference_source,distance,locked_at from public.gtl_epl_guesses where event_id='e1' and owner_id=$1",[OWNERS[0]])).rows[0];
  return {db,call,gate,enable,save,begin,finish,remaining,guess};
}

test('M36 is source-only/fix-forward; private tables and six invoker RPCs, no pending schema dependency or implicit schedule', async t=>{
  assert.ok(NOT_HOSTED.includes(20261029165947)); assert.ok(FIX_FORWARD.includes(20261029165947));
  const f=await setup(t);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_jobs_schedule')).rows[0].n,0);
  for(const role of ['anon','authenticated']) {
    await f.db.exec(`set role ${role}`);
    await assert.rejects(f.db.query('select * from public.gtl_epl_moneyline_collections'),/permission denied/);
    await assert.rejects(f.call('gtl_epl_moneyline_gate',{p_season:2026,p_week:9}),/permission denied/);
    await assert.rejects(f.call('gtl_epl_moneyline_save_ready'),/permission denied/);
    await f.db.exec('reset role');
  }
  const funcs=(await f.db.query("select proname,prosecdef,proconfig from pg_proc where proname in ('gtl_epl_moneyline_gate','gtl_epl_moneyline_due','gtl_epl_begin_moneyline_read','gtl_epl_finish_moneyline_read','gtl_epl_save_guess_current','gtl_epl_moneyline_save_ready')")).rows;
  assert.equal(funcs.length,6); assert.ok(funcs.every(f=>!f.prosecdef&&f.proconfig.includes('search_path=""')));
  await f.db.exec('set role service_role');
  assert.equal(await f.call('gtl_epl_moneyline_save_ready'),true);
  await assert.rejects(f.db.query('delete from public.gtl_epl_moneyline_attempts'),/permission denied/);
  await assert.rejects(f.db.query('update public.gtl_epl_moneyline_collections set home_price=-999'),/permission denied/);
});

test('weekly gate uses actual successful unique-event history and remains sticky; malformed/false/other-week checks buy nothing', async t=>{
  const f=await setup(t); await f.enable(); await f.save();
  for(const [detail,status] of [[verdict(),'failed'],[verdict(8),'succeeded'],[{...verdict(),dnbAvailable:false},'succeeded'],
    [{...verdict(),events:[verdict().events[0],verdict().events[0]]},'succeeded'],
    [{...verdict(),events:[{eventId:'bad',books:{draftkings:{A:'bad',B:120},fanduel:gateBooks.fanduel}}]},'succeeded']]) await f.gate(detail,status);
  assert.equal((await f.begin()).status,'unavailable'); assert.equal(await f.remaining(),100);
  await f.gate(); await f.gate({...verdict(),dnbAvailable:false});
  assert.equal((await f.begin()).status,'ready'); assert.equal(await f.remaining(),99);
});

test('disabled/absent, nonmanager, rejected/old locks, paused/unknown/reserve budget and kickoff reserve nothing', async t=>{
  const f=await setup(t); await f.gate(); await f.save();
  assert.equal((await f.begin()).status,'unavailable'); assert.equal((await f.guess()).reference_price,null,'disabled collection preserves accepted pending lock'); await f.enable();
  assert.equal((await f.begin(T,U(9))).status,'unavailable');
  assert.equal((await f.begin(T+31000)).status,'unavailable');
  assert.equal((await f.begin(K)).status,'unavailable');
  for(const [remain,paused] of [[null,false],[50,false],[49,false],[100,true]]) {
    await f.db.query('update public.gtl_odds_budget set conservative_remaining=$1,paused=$2',[remain,paused]);
    assert.equal((await f.begin()).status,'unavailable');
  }
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_moneyline_attempts')).rows[0].n,0);
  await f.db.exec('update public.gtl_odds_budget set conservative_remaining=51,paused=false');
  assert.equal((await f.begin()).status,'ready'); assert.equal(await f.remaining(),50);
});

test('concurrent managers share a lease/cooldown; atomic collection resolves first-after once and keeps immutable provenance', async t=>{
  const f=await setup(t); await f.enable(); await f.gate(); await f.save(); await f.save(U(2));
  const leases=await Promise.all([f.begin(),f.begin(T,U(2))]);
  assert.deepEqual(leases.map(x=>x.status).sort(),['cached','ready']); assert.equal(await f.remaining(),99);
  const lease=leases.find(x=>x.status==='ready');
  assert.deepEqual(await f.finish(lease),{status:'refreshed'});
  assert.deepEqual(await f.finish(lease,evidence(T+2000,{books:{}}),T+2000),{status:'refreshed'},'replay does not replace evidence');
  const g=await f.guess(); assert.equal(g.reference_price,-145); assert.equal(g.reference_source,'first-after'); assert.equal(g.distance,25);
  const rows=(await f.db.query("select club,price from public.gtl_epl_prices where market='draw_no_bet' order by club")).rows;
  assert.deepEqual(rows,[{club:'ARS',price:'-145'},{club:'CHE',price:'125'}]);
  const saved=(await f.db.query('select evidence from public.gtl_epl_moneyline_collections')).rows;
  assert.equal(saved.length,1); assert.equal(saved[0].evidence.responseSha256,'a'.repeat(64));
  await f.save(U(3),T+2000); assert.equal((await f.begin(T+2000,U(3))).status,'cached');
  assert.equal(await f.remaining(),99);
});

test('invalid three-way/missing/stale/future book, mismatched fixture or late result writes no prices and never refunds reservation', async t=>{
  const f=await setup(t); await f.enable(); await f.gate();
  const bad=[{books:{draftkings:{ARS:-150,CHE:120,Draw:300},fanduel:gateBooks.fanduel}},
    {books:{draftkings:{ARS:99,CHE:120},fanduel:gateBooks.fanduel}},
    {bookObservedAt:{draftkings:at(T-400000),fanduel:at(T-400000)}},
    {bookObservedAt:{draftkings:at(T+2000),fanduel:at(T+2000)}},{home:'LIV'},{commenceTime:at(K+1000)}, {responseSha256:'bad'}];
  for(let i=0;i<bad.length;i++) {
    await f.db.query("delete from public.gtl_epl_moneyline_attempts"); // fixture reset as database owner only
    const time=T+i*600000; await f.db.query('update public.gtl_epl_guesses set status=\'draft\',locked_at=null');
    if(i===0) await f.save(U(1),time); else await f.save(U(1),time);
    const lease=await f.begin(time); assert.equal(lease.status,'ready');
    assert.equal((await f.finish(lease,evidence(time+1000,{bookObservedAt:{draftkings:at(time),fanduel:at(time)},...bad[i]}),time+1000)).status,'unavailable');
  }
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_prices')).rows[0].n,0);
  assert.equal(await f.remaining(),100-bad.length);
});

test('kickoff after accepted lock never backdates a refresh; quota is still conserved and guess stays pending/unscored', async t=>{
  const f=await setup(t); await f.enable(); await f.gate(); await f.save(U(1),K-500);
  const lease=await f.begin(K-500); assert.equal(lease.status,'ready');
  assert.equal((await f.finish(lease,evidence(K+1000),K+1000,{p_quota:{remaining:95,used:405,last:1}})).status,'unavailable');
  assert.equal((await f.guess()).reference_price,null); assert.equal(new Date((await f.guess()).locked_at).getTime(),K-500);
  assert.equal(await f.remaining(),95);
  await assert.rejects(f.finish({...lease,token:U(9)}),/GTL_EPL_INVALID/);
});

test('timed checkpoints are separate at most once per kickoff; lock refresh cannot repeat or exceed shared daily six attempts', async t=>{
  const f=await setup(t); await f.enable(); await f.gate();
  const run=U(20),claim=U(21);
  await f.db.query("insert into public.gtl_epl_job_runs(id,job,slot_start,capability_hash,status,claim_token,claimed_at) values($1,'moneyline',clock_timestamp(),repeat('b',64),'running',$2,clock_timestamp())",[run,claim]);
  const args={p_user:null,p_run:run,p_claim:claim};
  assert.deepEqual(await f.call('gtl_epl_moneyline_due',{p_run:run,p_claim:claim,p_now:at(T)}),['e1','e2']);
  const first=await f.begin(T,null,args); assert.equal(first.status,'ready'); await f.finish(first,null,T+1000);
  assert.equal((await f.begin(T+600000,null,args)).status,'cached','open checkpoint is spent even after failure');
  assert.equal((await f.begin(K-3*3600000,null,args)).status,'ready');
  assert.equal((await f.begin(K-2*3600000,null,args)).status,'cached','pre-kickoff checkpoint is spent');
  assert.equal(await f.remaining(),98);
  await assert.rejects(f.call('gtl_epl_moneyline_due',{p_run:run,p_claim:U(99)}),/GTL_SCHEDULE_RUN/);
  await f.db.query("update public.gtl_epl_moneyline_attempts set kickoff_at=kickoff_at+interval '1 day',requested_at='2026-10-30T12:00:00Z'");
  const allOwners=(await f.db.query('select owner_id from public.gtl_epl_managers order by owner_id limit 4')).rows;
  for(const owner of allOwners) await f.db.query("insert into public.gtl_epl_moneyline_attempts(event_id,kickoff_at,kind,owner_id,requested_at,expires_at,status) values('e1',$1,'lock',$2,$3,$4,'unavailable')",[at(K),owner.owner_id,at(T),at(T+60000)]);
  assert.equal((await f.begin(T+3600000,null,args)).status,'unavailable'); assert.equal(await f.remaining(),98);
  assert.deepEqual(await f.call('gtl_epl_moneyline_due',{p_run:run,p_claim:claim,p_now:at(T+3600000)}),['e2'],'a locally capped match never starves other due events');
});

test('real collector hook → M36 SQL uses captured source only; preexisting at-lock reference stays fixed under later collections', async t=>{
  const f=await setup(t); await f.enable(); await f.gate();
  await f.db.query("insert into public.gtl_epl_prices(event_id,club,market,price,observed_at) values('e1','ARS','draw_no_bet',-180,$1)",[at(T-600000)]);
  await f.db.exec('set role service_role');
  assert.equal((await f.save()).referencePrice,-180);
  let calls=0; const collector=createEplMoneylineCollector({rpc:f.call,clock:()=>T+1000,drawNoBet:async args=>{calls++;assert.deepEqual(args,{eventIds:['e1'],observations:true});return {events:[evidence()],quota:{remaining:99,used:401,last:1}};}});
  assert.deepEqual(await collector.refreshForLock({userId:U(1),eventId:'e1'}),{status:'refreshed'});
  assert.equal(calls,1); assert.equal((await f.guess()).reference_price,-180); assert.equal((await f.guess()).reference_source,'at-lock');
  assert.deepEqual(await collector.refreshForLock({userId:U(1),eventId:'e1'}),{status:'unavailable'}); assert.equal(calls,1);
});

test('expired/uncertain attempt consumes budget and checkpoint, while later headers cannot raise remaining or overwrite a finish',async t=>{
  const f=await setup(t);await f.enable();await f.gate();await f.save();
  const lease=await f.begin();assert.equal(lease.status,'ready');
  assert.equal((await f.finish(lease,evidence(T+121000),T+121000,{p_quota:{remaining:450,last:1}})).status,'unavailable');
  assert.equal(await f.remaining(),99,'a high provider header does not undo reservation');
  assert.equal((await f.finish(lease,evidence(T+122000),T+122000,{p_quota:{remaining:1}})).status,'unavailable');
  assert.equal(await f.remaining(),99,'duplicate finish has no quota or price effects');
  assert.equal((await f.guess()).reference_price,null);
  assert.equal((await f.begin(T+10000)).status,'unavailable','one accepted lock buys at most once, even on timeout');
});

test('own first-after observation survives a newer latest row; extreme pending distance is privately audited without poisoning others',async t=>{
  const f=await setup(t);await f.enable();await f.gate();await f.save();await f.save(U(2));
  await f.db.query("update public.gtl_epl_guesses set price=2147483647 where owner_id=$1",[OWNERS[1]]);
  const lease=await f.begin();
  // Simulate an unrelated later writer. The collection must resolve from its captured evidence, never this mutable cache.
  await f.db.query("insert into public.gtl_epl_prices(event_id,club,market,price,observed_at) values('e1','ARS','draw_no_bet',-500,$1)",[at(T+2000)]);
  assert.equal((await f.finish(lease,evidence(T+1000,{books:{draftkings:{ARS:-1000,CHE:500},fanduel:{ARS:-900,CHE:400}}}),T+3000)).status,'refreshed');
  assert.equal((await f.guess()).reference_price,-950);assert.equal((await f.guess()).distance,830);
  const extreme=(await f.db.query('select reference_price,distance from public.gtl_epl_guesses where owner_id=$1',[OWNERS[1]])).rows[0];
  assert.deepEqual(extreme,{reference_price:null,distance:null});
  const stored=(await f.db.query('select home_price,unscorable_count from public.gtl_epl_moneyline_collections')).rows[0];
  assert.deepEqual(stored,{home_price:-950,unscorable_count:1});
  assert.equal((await f.db.query("select price from public.gtl_epl_prices where club='ARS'")).rows[0].price,'-500','latest cache stays latest');
});

test('SQL recorded gate rejects non-object books/out-of-bound prices with the same cap as JS',async t=>{
  const f=await setup(t);await f.enable();await f.save();
  for(const bad of [[],null,{A:'wrong',B:120},{A:100001,B:-150}]) {
    await f.gate({...verdict(),events:[{eventId:'e1',books:{draftkings:bad,fanduel:bad}},{eventId:'e2',books:{draftkings:bad,fanduel:bad}}]});
    assert.equal(await f.call('gtl_epl_moneyline_gate',{p_season:2026,p_week:9}),false);
  }
  assert.equal(await f.remaining(),100);
});

test('provider auth failure keeps reservation, backs off shared events, and settled draft does not stop future match moneylines',async t=>{
  const f=await setup(t);await f.enable();await f.gate();await f.save();await f.save(U(2),T,'e2');
  const lease=await f.begin();assert.equal(lease.status,'ready');
  assert.equal((await f.finish(lease,null,T+1000,{p_error:'auth',p_quota:{remaining:98}})).status,'unavailable');
  assert.equal((await f.begin(T+1000,U(2),{p_event_id:'e2'})).status,'unavailable');assert.equal(await f.remaining(),98);
  await f.db.exec("update public.gtl_epl_weeks set status='settled'");
  // A manager accepted a lock later. A completed Pick a Team draft does not close that match's own moneyline deadline.
  await f.save(U(3),T+600000,'e2');
  assert.equal((await f.begin(T+600000,U(3),{p_event_id:'e2'})).status,'ready');assert.equal(await f.remaining(),97);
});


test('fresh-save wrapper rejects a stale request timestamp after kickoff and preserves draft; clock is sampled after fixture lock',async t=>{
  const f=await setup(t), stale=at(Date.now()-86400000);
  await f.db.query("update public.gtl_epl_fixtures set commence_time=clock_timestamp()-interval '1 second' where event_id='e1'");
  // Reproduce the old applied entry point's stale-time issue in this disposable fixture only.
  assert.equal((await f.call('gtl_epl_save_guess',{p_user:U(1),p_event_id:'e1',p_club:'ARS',p_price:-120,p_lock:false,p_now:stale})).status,'draft');
  await f.db.exec('set role service_role');
  await assert.rejects(f.call('gtl_epl_save_guess_current',{p_user:U(1),p_event_id:'e1',p_club:'ARS',p_price:-130,p_lock:true,p_now:stale}),/GTL_EPL_GUESS_CLOSED/);
  const row=(await f.db.query("select price,status,saved_at from public.gtl_epl_guesses where event_id='e1' and owner_id=$1",[OWNERS[0]])).rows[0];
  assert.equal(row.price,-120);assert.equal(row.status,'draft');assert.equal(new Date(row.saved_at).toISOString(),stale);
  const body=(await f.db.query("select prosrc from pg_proc where proname='gtl_epl_save_guess_current'")).rows[0].prosrc;
  assert.ok(body.indexOf('for update')<body.indexOf('stamp:=clock_timestamp()'));
  // The future trusted clock seam may close a match early, but can never make a late request timely.
  assert.equal((await f.call('gtl_epl_save_guess_current',{p_user:U(2),p_event_id:'e2',p_club:'LIV',p_price:-120,p_lock:true,p_now:at(T)})).status,'locked');
});

test('an observation completed before a concurrent lock cannot become that pending guess first-after even if persisted later',async t=>{
  const f=await setup(t);await f.enable();await f.gate();await f.save();
  const lease=await f.begin();
  await f.save(U(2),T+2000);
  assert.equal((await f.finish(lease,evidence(T+1000),T+3000)).status,'refreshed');
  assert.equal((await f.guess()).reference_source,'first-after');
  assert.equal((await f.db.query('select reference_price from public.gtl_epl_guesses where owner_id=$1',[OWNERS[1]])).rows[0].reference_price,null);
});

test('independent M36 before M34 keeps existing disabled moneyline schedule and safe-save capabilities',async t=>{
  const f=await setup(t);await f.enable();await f.gate();
  await f.db.exec("update public.gtl_epl_jobs_schedule set enabled=false where job='moneyline'");
  await f.db.exec(fs.readFileSync('supabase/migrations/20261029161613_gtl_epl_standings.sql','utf8'));
  assert.equal((await f.db.query("select enabled from public.gtl_epl_jobs_schedule where job='moneyline'")).rows[0].enabled,false);
  assert.equal(await f.call('gtl_epl_moneyline_save_ready'),true);
  assert.equal(await f.call('gtl_epl_moneyline_gate',{p_season:2026,p_week:9}),true);
  assert.equal((await f.call('gtl_epl_save_guess_current',{p_user:U(1),p_event_id:'e1',p_club:'ARS',p_price:-120,p_lock:true,p_now:at(T)})).status,'locked');
  await f.db.exec("insert into public.gtl_epl_jobs_schedule(job,enabled) values('standings',false)");
  assert.equal((await f.begin()).status,'unavailable','later migration never enables collection');
});


test('fixture reassigned to an unpassed matchweek during lease cannot inherit old gate at finish',async t=>{
  const f=await setup(t);await f.enable();await f.gate();await f.save();const lease=await f.begin();
  await f.db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order) select season,10,window_start,window_end,first_kickoff,pick_order from public.gtl_epl_weeks where week=9");
  await f.db.exec("update public.gtl_epl_fixtures set week=10 where event_id='e1'");
  assert.equal((await f.finish(lease)).status,'unavailable');assert.equal((await f.guess()).reference_price,null);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_moneyline_collections')).rows[0].n,0);
  assert.equal(await f.remaining(),99,'already attempted read remains reserved');
});
