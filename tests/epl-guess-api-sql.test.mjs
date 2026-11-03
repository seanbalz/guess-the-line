// Actual applied M32 SQL behind the real HTTP handler/adapter; no hosted or provider requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRELUDE } from './migrations.mjs';
import { createCloudHandler,createSupabaseAdapter } from '../cloud/handler.mjs';
const {PGlite}=await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js');
const id=n=>`00000000-0000-4000-8000-00000000000${n}`,OWNER='473955676301815808',OTHER='719658248843632640';
async function setup(t,{ready=true}={}){
 const db=new PGlite();t.after(()=>db.close());await db.exec(PRELUDE);
 for(const file of ['20261008164249_gtl_private_cloud_state.sql','20261008174007_gtl_profiles_private_games_invites.sql','20261028190000_gtl_epl_pick_a_team.sql','20261029060000_gtl_epl_open_access.sql','20261029150000_gtl_epl_moneyline.sql'])await db.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
 if(ready)await db.exec(fs.readFileSync('supabase/migrations/20261029165947_gtl_epl_moneyline_collector.sql','utf8'));
 const stamp=Date.now(),kick=new Date(stamp+86400_000).toISOString();let now=stamp,refreshes=0;
 await db.query('insert into auth.users(id) values($1),($2),($3)',[id(1),id(2),id(3)]);
 await db.query('update public.gtl_epl_managers set user_id=$1 where owner_id=$2',[id(1),OWNER]);await db.query('update public.gtl_epl_managers set user_id=$1 where owner_id=$2',[id(2),OTHER]);
 await db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order) values(2026,9,clock_timestamp(),clock_timestamp()+interval '7 days',$1,$2)",[kick,[OWNER,OTHER]]);
 await db.query("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values('e1',2026,9,'ARS','CHE',$1),('e2',2026,9,'LIV','EVE',$1)",[kick]);
 const detail={season:2026,week:9,dnbAvailable:true,events:['e1','e2'].map(eventId=>({eventId,books:{draftkings:{ARS:-130,CHE:110},fanduel:{ARS:-140,CHE:120}}}))};
 await db.query("insert into public.gtl_epl_job_runs(job,slot_start,capability_hash,status,detail) values('dnb-check',clock_timestamp(),repeat('a',64),'succeeded',$1)",[detail]);
 const rpcCalls=[];
 const fetchImpl=async(url,options={})=>{
  const u=new URL(url),name=u.pathname.split('/').at(-1);
  if(u.pathname.includes('/rpc/')){
   const body=JSON.parse(options.body);rpcCalls.push(name);
   try{const result=await db.transaction(async tx=>{await tx.exec('set local role service_role');return tx.query(`select public.${name}(${Object.keys(body).map((key,i)=>`${key}=>$${i+1}`).join(',')}) as value`,Object.values(body));});return Response.json(result.rows[0].value);}
   catch(e){const absent=e.code==='42883'&&e.message.includes(`function public.${name}(`);return Response.json({code:absent?'PGRST202':e.code,message:e.message},{status:absent?404:400});}
  }
  if(name==='gtl_epl_weeks')return Response.json((await db.query('select season,week from public.gtl_epl_weeks order by season desc,week desc limit 38')).rows);
  if(name==='gtl_epl_job_runs')return Response.json((await db.query("select status,reason,detail from public.gtl_epl_job_runs where job='dnb-check' and status='succeeded' and reason is null and detail @> $1 order by slot_start,id limit 100",[JSON.parse(u.searchParams.get('detail').slice(3))])).rows);
  if(name==='gtl_epl_fixtures')return Response.json((await db.query('select event_id,season,week from public.gtl_epl_fixtures where event_id=$1',[u.searchParams.get('event_id').slice(3)])).rows);
  throw new Error(`Unexpected private read ${name}`);
 };
 const adapter=createSupabaseAdapter({url:'https://fixture.supabase.co',anonKey:'fixture',serviceRoleKey:'fixture',fetchImpl,eplMoneylineRefreshForLock:async()=>{refreshes++;now=Date.parse(kick)+1000;return {status:'unavailable'};}});
 const handler=createCloudHandler({epl:adapter.epl,authenticate:async token=>({id:id(Number(token)),email:'fixture@example.test',emailConfirmed:true}),clock:()=>now});
 const call=async(action,body={},user=1)=>{const response=await handler(new Request(`https://fixture.test/epl/guess/${action}`,{method:'POST',headers:{authorization:`Bearer ${user}`,'content-type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};
 const stored=async()=> (await db.query('select * from public.gtl_epl_guesses order by owner_id')).rows;
 return {db,call,stored,rpcCalls,refreshes:()=>refreshes,kick,resetTime:()=>{now=stamp;}};
}
test('M32 HTTP drafts/reveal/locks/closed history/guest boundaries use real storage with save-first hook',async t=>{
 const f=await setup(t),save=(price,lock=false)=>({eventId:'e1',club:'ARS',price,lock});
 assert.equal((await f.call('save',save(-130))).status,200);assert.equal(f.refreshes(),0);
 assert.deepEqual((await f.call('read',{},2)).body.guesses,[],'opponent draft hidden before kickoff');
 assert.equal((await f.call('save',save(-140),3)).status,403,'unlinked signed-in read allowed but write denied');
 assert.equal((await f.call('read',{},3)).status,200);
 const locked=await f.call('save',save(-140,true));assert.equal(locked.status,200);assert.equal(locked.body.status,'locked');assert.equal(locked.body.referencePrice,null);assert.equal(f.refreshes(),1);
 const ordered=f.rpcCalls.slice(-3);assert.deepEqual(ordered,['gtl_epl_moneyline_gate','gtl_epl_save_guess_current','gtl_epl_guess_board']);
 assert.equal((await f.call('save',save(-150,true))).status,409);assert.equal(f.refreshes(),1,'duplicate lock never refreshes');
 f.resetTime();assert.equal((await f.call('read',{},2)).body.guesses.length,0,'another viewer has not locked this event');
 await f.call('save',{...save(-120),club:'CHE'},2);
 await f.db.exec("update public.gtl_epl_fixtures set status='postponed' where event_id='e1'");
 const closed=await f.call('save',{...save(-110,true),club:'CHE'},2);assert.equal(closed.status,409);assert.equal(closed.body.draft.price,-120);
 assert.equal((await f.call('read',{},3)).body.guesses.length,0,'postponed alone never reveals');
 await f.db.exec("update public.gtl_epl_fixtures set commence_time=clock_timestamp()-interval '1 minute' where event_id='e1'");
 const publicRead=await f.call('read',{},3);assert.equal(publicRead.body.guesses.length,1);assert.equal(publicRead.body.guesses[0].status,'locked','opponent draft remains hidden after kickoff');
 const board=await f.call('leaderboard');assert.equal(board.body.rows.length,1);assert.equal(board.body.rows[0].unscored,1);assert.equal(board.body.rows[0].average,null);
});
test('malformed/range/nonboolean and actual integer-distance overflow return structured400 without changing stored draft',async t=>{
 const f=await setup(t),body={eventId:'e1',club:'ARS',price:-130,lock:false};await f.call('save',body);const before=await f.stored();
 for(const invalid of [{price:2147383848},{price:-2147383848},{price:2147483648},{price:-2147483648},{price:'-130'},{price:100.5},{lock:null},{lock:'true'},{now:'2020-01-01'}]){const r=await f.call('save',{...body,...invalid});assert.equal(r.status,400);assert.equal(r.body.code,'GTL_EPL_GUESS_INVALID');assert.deepEqual(await f.stored(),before);}
 await f.db.query("insert into public.gtl_epl_prices(event_id,club,market,price,observed_at) values('e1','ARS','draw_no_bet',2147483647,clock_timestamp()-interval '1 hour')");
 const overflow=await f.call('save',{...body,price:-2147383847,lock:true});assert.equal(overflow.status,400);assert.equal(overflow.body.code,'GTL_EPL_GUESS_INVALID');assert.deepEqual(await f.stored(),before);assert.equal(f.refreshes(),0);
 assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_guess_history')).rows[0].n,1);
});


test('actual M32-only schema retains permitted history but entry stays off until the safe M36 writer is installed',async t=>{
 const f=await setup(t,{ready:false});
 await f.db.query("select public.gtl_epl_save_guess($1,'e1','ARS',-130,false,null)",[id(1)]);
 const v=await f.call('read');assert.equal(v.status,200);assert.equal(v.body.available,false);assert.equal(v.body.reason,'schema_unavailable');assert.equal(v.body.guesses[0].price,-130);
 const save=await f.call('save',{eventId:'e1',club:'ARS',price:-140,lock:true});assert.equal(save.status,404);assert.equal(save.body.code,'GTL_EPL_GUESS_OFF');
 assert.ok(!f.rpcCalls.includes('gtl_epl_save_guess_current'));assert.ok(!f.rpcCalls.includes('gtl_epl_save_guess'));assert.equal((await f.stored())[0].price,-130);
});
