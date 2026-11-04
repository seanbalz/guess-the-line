import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PRELUDE} from './migrations.mjs';
const {PGlite}=await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js');
const FILE='supabase/migrations/20261103212932_gtl_epl_turn_queue.sql';
const managers=['719658248843632640','473955676301815808','702644837370929152'];
const user=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function setup(t,{apply=true}={}){
 const db=new PGlite();t.after(()=>db.close());await db.exec(PRELUDE);
 for(const file of ['20261008164249_gtl_private_cloud_state.sql','20261028190000_gtl_epl_pick_a_team.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 for(let i=0;i<3;i++){await db.query('insert into auth.users(id) values($1)',[user(i+1)]);await db.query('update public.gtl_epl_managers set user_id=$1 where owner_id=$2',[user(i+1),managers[i]]);}
 await db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status) values(2026,9,now()-interval '1 day',now()+interval '8 days',now()+interval '7 days',$1,'open')",[managers]);
 await db.exec("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values('one',2026,9,'ARS','CHE',now()+interval '7 days'),('two',2026,9,'LIV','EVE',now()+interval '7 days')");
 if(apply)await db.exec(fs.readFileSync(FILE,'utf8'));
 const call=async(sql,args=[]) => (await db.query(sql,args)).rows[0].r;
 const pick=(n,club)=>call('select public.gtl_epl_save_pick($1,2026,9,$2) r',[user(n),club]);
 const queue=(n,clubs)=>call('select public.gtl_epl_save_queue($1,2026,9,$2) r',[user(n),clubs]);
 const rows=async()=>(await db.query('select owner_id,club,source,final from public.gtl_epl_picks order by array_position($1,owner_id)',[managers])).rows;
 const history=async()=>(await db.query('select owner_id,club,action from public.gtl_epl_pick_history order by id')).rows;
 return{db,call,pick,queue,rows,history};
}
test('turn advances through consecutive ranked managers atomically, skipping taken clubs and retaining private rankings',async t=>{
 const f=await setup(t);await f.queue(2,['ARS','CHE']);await f.queue(3,['ARS','CHE','LIV']);assert.deepEqual(await f.rows(),[]);
 const saved=await f.pick(1,'ARS');assert.equal(saved.picks.length,3);
 assert.deepEqual(await f.rows(),[
  {owner_id:managers[0],club:'ARS',source:'pick',final:true},
  {owner_id:managers[1],club:'CHE',source:'queue',final:true},
  {owner_id:managers[2],club:'LIV',source:'queue',final:false},
 ]);
 assert.deepEqual((await f.history()).map(r=>r.action),['pick','queue:turn','queue:turn']);
 await assert.rejects(f.pick(1,'EVE'),/GTL_EPL_NOT_YOUR_TURN/);
 const before=await f.history();assert.equal(await f.call('select public.gtl_epl_advance_queues(2026,9) r'),0);assert.deepEqual(await f.history(),before);
 const state=await f.call('select public.gtl_epl_week_state(2026,9) r');assert.equal(state.queueOnTurn,true);assert(!JSON.stringify(state).includes('clubs":['),'week state never contains private queue arrays');
 assert.deepEqual((await f.db.query('select clubs from public.gtl_epl_queues where owner_id=$1',[managers[1]])).rows[0].clubs,['ARS','CHE']);
});
test('exhausted ranking leaves the turn open and blocks later queues until a manual pick',async t=>{
 const f=await setup(t);await f.queue(2,['ARS']);await f.queue(3,['LIV']);await f.pick(1,'ARS');
 assert.equal((await f.rows()).length,1);assert.equal((await f.rows())[0].final,false);
 await assert.rejects(f.pick(3,'LIV'),/GTL_EPL_NOT_YOUR_TURN/);
 await f.pick(2,'CHE');assert.equal((await f.rows()).length,3);assert.equal((await f.rows())[2].club,'LIV');
});
test('saving a ranking while already on the clock assigns once; repeated saves preserve the pick and receipt time',async t=>{
 const f=await setup(t);await f.queue(1,['CHE','ARS']);const first=await f.call('select public.gtl_epl_week_state(2026,9) r');
 assert.equal(first.picks[0].club,'CHE');assert.equal(first.picks[0].source,'queue');
 await f.queue(1,['ARS']);const next=await f.call('select public.gtl_epl_week_state(2026,9) r');assert.deepEqual(next.picks,first.picks);assert.equal((await f.history()).length,1);
 await f.pick(1,'EVE');assert.equal((await f.rows())[0].source,'pick','latest picker retains existing manual change window');
});
test('nonplaying and postponed backups are skipped; no unranked club is chosen',async t=>{
 const f=await setup(t);await f.db.exec("update public.gtl_epl_fixtures set status='postponed' where event_id='one'");
 await f.queue(1,['XXX','ARS','LIV']);assert.equal((await f.rows())[0].club,'LIV');
 await f.queue(2,['ARS']);assert.equal((await f.rows()).length,1);
});
test('kickoff and closed-week boundaries preserve saved queues and prevent late assignments',async t=>{
 const f=await setup(t);await f.queue(2,['CHE']);await f.db.exec("update public.gtl_epl_weeks set first_kickoff=now()-interval '1 minute'");
 await assert.rejects(f.queue(2,['LIV']),/GTL_EPL_DRAFT_CLOSED/);await assert.rejects(f.pick(1,'ARS'),/GTL_EPL_DRAFT_CLOSED/);
 assert.equal(await f.call('select public.gtl_epl_advance_queues(2026,9) r'),0);assert.deepEqual(await f.rows(),[]);
 await f.db.exec("update public.gtl_epl_weeks set first_kickoff=now()+interval '1 day',status='resolved'");assert.equal(await f.call('select public.gtl_epl_advance_queues(2026,9) r'),0);
 assert.deepEqual((await f.db.query('select clubs from public.gtl_epl_queues')).rows,[{clubs:['CHE']}]);
});
test('migration does not backfill picks, helper is service-only, and rollback restores existing writers',async t=>{
 const f=await setup(t,{apply:false});await f.queue(1,['CHE']);const before=await f.rows();await f.db.exec(fs.readFileSync(FILE,'utf8'));assert.deepEqual(await f.rows(),before);
 const grants=(await f.db.query("select has_function_privilege('anon','public.gtl_epl_advance_queues(integer,integer,timestamptz)','EXECUTE') a,has_function_privilege('authenticated','public.gtl_epl_advance_queues(integer,integer,timestamptz)','EXECUTE') u,has_function_privilege('service_role','public.gtl_epl_advance_queues(integer,integer,timestamptz)','EXECUTE') s")).rows[0];assert.deepEqual(grants,{a:false,u:false,s:true});
 await assert.rejects(f.queue(99,['ARS']),/GTL_EPL_NOT_MEMBER/);assert.deepEqual(await f.rows(),[]);
 await f.db.exec(fs.readFileSync('supabase/rollback/20261103212932_gtl_epl_turn_queue.sql','utf8'));
 assert.equal((await f.call('select public.gtl_epl_week_state(2026,9) r')).queueOnTurn,undefined);await f.queue(1,['CHE']);assert.deepEqual(await f.rows(),[]);
});
