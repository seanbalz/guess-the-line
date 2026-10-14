import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { createCloudHandler } from '../cloud/handler.mjs';
import { providerWeeklyError } from '../cloud/weekly.mjs';
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const migrations = ['20261008164249_gtl_private_cloud_state.sql','20261008174007_gtl_profiles_private_games_invites.sql','20261008182836_gtl_canonical_weekly_entries.sql'].map(f => fs.readFileSync(`supabase/migrations/${f}`, 'utf8'));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const player = n => `u_${id(n).replaceAll('-', '')}`;
const skip = PGlite ? false : 'Optional local PGlite runtime absent; no hosted database tests.';
async function fixture(t, mutate) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  await db.exec(migrations[0]);
  const original = seed();
  // A future isolated schedule makes tests independent of the real Week 5 deadline.
  original.league.deadline = '2099-10-09T00:15:00Z';
  for (const g of original.games) g.kickoff = g.kickoff.replace('2026-', '2099-');
  await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', original]);
  for (let n=1;n<=6;n++) await db.query('insert into auth.users values($1)', [id(n)]);
  await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner')", [id(1)]);
  await db.exec(migrations[1]);
  const as = (role, sql, args=[]) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql,args); });
  const rpc = async (name,args) => (await as('service_role',`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`, args)).rows[0].value;
  let serial=100;
  async function create(n,practice=false) {
    await rpc('gtl_save_profile',[id(n),`Test player ${n}`]);
    return (await rpc('gtl_create_league',[id(n),'Private test','group',practice,id(++serial)])).leagueId;
  }
  async function join(owner,n,league) {
    await rpc('gtl_save_profile',[id(n),`Test player ${n}`]);
    const token=String(++serial).padStart(64,'0');
    await rpc('gtl_create_invite',[id(owner),`user${owner}@example.invalid`,league,`user${n}@example.invalid`,token,id(++serial)]);
    await rpc('gtl_accept_invite',[id(n),`user${n}@example.invalid`,token,null]);
  }
  const a=await create(1), b=await create(2), practice=await create(3,true);
  await join(2,1,b); await join(3,1,practice); await join(2,4,b);
  if (mutate) await mutate({db,original,a,b,practice});
  const snapshots=(await db.query('select id,state,revision from public.gtl_leagues order by id')).rows;
  const apply=()=>db.transaction(async tx=>{ await tx.exec(migrations[2]); await tx.exec(fs.readFileSync('supabase/migrations/20261008185715_gtl_weekly_eligibility_rulings.sql','utf8')); });
  const read=(n,l)=>rpc('gtl_read_weekly_state',[id(n),l]);
  const ballot=(n,l,mode,revision,picks,submit=false)=>rpc('gtl_save_weekly_ballot',[id(n),l,mode,revision,picks,submit]);
  const selection=(n,l,revision,bet)=>rpc('gtl_save_weekly_selection',[id(n),l,revision,bet]);
  return {db,as,rpc,apply,read,ballot,selection,original,snapshots,a,b,practice,join};
}

test('canonical weekly SQL and authenticated API preserve one record across groups', {skip}, async t=>{
  const f=await fixture(t); await f.apply();
  const full=value=>Object.fromEntries(f.original.games.map(g=>[g.id,value]));
  const bet={gameId:'TB-DAL',market:'spread',side:'home',line:-3,odds:-110,source:'Synthetic test fixture',quotedAt:new Date(Date.now()-60000).toISOString()};
  await t.test('archive and original snapshots are exact; Sean imported ballot keeps Dallas -9.5 and provenance',async()=>{
    assert.deepEqual((await f.db.query('select id,state,revision from public.gtl_leagues order by id')).rows,f.snapshots);
    assert.deepEqual((await f.db.query('select league_id id,state,revision from public.gtl_prediction_archives order by league_id')).rows,f.snapshots);
    const one=await f.read(1,'sean-troy-luke'), two=await f.read(1,f.b);
    assert.deepEqual(one.state.ballots.sean.guess_spread,f.original.ballots.sean.guess_spread);
    assert.deepEqual(two.state.ballots[player(1)].guess_spread,one.state.ballots.sean.guess_spread);
    assert.equal(two.state.ballots[player(1)].guess_spread.picks['TB-DAL'],-9.5);
    assert.deepEqual(one.state.league.roster.map(p=>p.id),['sean','troy','luke']);
    assert.equal(two.originPractice.guess_spread,false);
    await assert.rejects(()=>f.ballot(1,f.b,'guess_spread',0,full(-4),true),/GTL_BALLOT_LOCKED/);
  });
  await t.test('private tables and every helper/RPC deny both browser roles; archive cannot be overwritten by service',async()=>{
    for (const table of ['gtl_prediction_archives','gtl_weekly_slates','gtl_weekly_versions','gtl_weekly_ballots','gtl_weekly_selections']) {
      assert.equal((await f.db.query('select relrowsecurity from pg_class where oid=$1::regclass',[`public.${table}`])).rows[0].relrowsecurity,true);
      for (const role of ['anon','authenticated']) {
        await assert.rejects(()=>f.as(role,`select * from public.${table}`),/permission denied/);
        await assert.rejects(()=>f.as(role,`delete from public.${table}`),/permission denied/);
        await assert.rejects(()=>f.as(role,`insert into public.${table} default values`),/permission denied/);
        const column=table==='gtl_prediction_archives'?'revision':table==='gtl_weekly_slates'?'week':table==='gtl_weekly_versions'?'revision':'origin_practice';
        await assert.rejects(()=>f.as(role,`update public.${table} set ${column}=${column}`),/permission denied/);
      }
    }
    for (const sig of ['gtl_weekly_slate(jsonb)','gtl_weekly_context(uuid,text)','gtl_read_weekly_state(uuid,text)','gtl_save_weekly_ballot(uuid,text,text,bigint,jsonb,boolean)','gtl_save_weekly_selection(uuid,text,bigint,jsonb)','gtl_guard_legacy_entries()']) {
      for(const role of ['anon','authenticated']) assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok',[role,`public.${sig}`,'EXECUTE'])).rows[0].ok,false);
    }
    await assert.rejects(()=>f.as('service_role',"update public.gtl_prediction_archives set revision=0"),/permission denied/);
    await assert.rejects(()=>f.read(6,f.b),/GTL_FORBIDDEN/);
    await assert.rejects(()=>f.as('service_role',"update public.gtl_leagues set state=jsonb_set(state,'{ballots}','{}') where id='sean-troy-luke'"),/GTL_LEGACY_ENTRIES_FROZEN/);
  });
  await t.test('draft reused everywhere, cross-mode stale version denied and practice history remains sticky',async()=>{
    assert.equal(await f.ballot(1,f.practice,'guess_total',0,{'TB-DAL':44.5}),1);
    const state=await f.read(1,f.a);
    assert.equal(state.revision,1); assert.equal(state.originPractice.guess_total,true);
    assert.equal(state.state.ballots[player(1)].guess_total.picks['TB-DAL'],44.5);
    await assert.rejects(()=>f.ballot(1,f.b,'guess_total',0,full(46),true),/GTL_WEEKLY_CONFLICT/);
    assert.equal(await f.ballot(1,f.b,'guess_total',1,full(45),true),2);
    assert.equal((await f.read(1,f.b)).originPractice.guess_total,true);
    assert.equal((await f.read(1,f.practice)).originPractice.guess_spread,false);
    await assert.rejects(()=>f.ballot(1,f.a,'guess_total',2,full(47)),/GTL_BALLOT_LOCKED/);
  });
  await t.test('shared immutable Challenge quote uses same revision and cannot be changed through another group/market',async()=>{
    await assert.rejects(()=>f.selection(1,f.a,1,bet),/GTL_WEEKLY_CONFLICT/);
    assert.equal(await f.selection(1,f.practice,2,bet),3);
    const first=await f.read(1,f.practice), second=await f.read(1,f.a);
    assert.deepEqual(first.state.bets[player(1)],second.state.bets[player(1)]);
    assert.equal(second.selectionPractice,true); assert.equal(second.state.bets[player(1)]['TB-DAL'].line,-3);
    await assert.rejects(()=>f.selection(1,f.b,3,{...bet,market:'total',side:'over',line:45}),/GTL_SELECTION_LOCKED/);
    await assert.rejects(()=>f.ballot(1,f.b,'guess_total',2,full(40)),/GTL_WEEKLY_CONFLICT/);
    const entries=(await f.read(1,f.b)).state.audit;
    assert.equal(entries.filter(e=>e.type==='selection_recorded').length,1);
    assert.deepEqual((await f.db.query('select id,state,revision from public.gtl_leagues order by id')).rows,f.snapshots);
  });
  await t.test('joining later reuses entries; selected roster limits opponent entries and no opponent provenance reaches API',async()=>{
    await f.join(1,4,f.a);
    const joined=await f.read(4,f.a);
    assert.equal(joined.state.ballots[player(1)].guess_spread.picks['TB-DAL'],-9.5);
    assert.equal(Object.keys(joined.state.ballots).includes(player(3)),false);
    assert.equal(joined.state.audit.length,0);
    assert.equal(joined.state.ballots[player(1)].guess_spread.origin,undefined);
    const handler=createCloudHandler({
      authenticate:async token=>({id:id(Number(token)),email:`user${token}@example.invalid`,emailConfirmed:true}),
      storage:{membership:async(user,league)=>(await f.db.query('select player_id,active from public.gtl_memberships where user_id=$1 and league_id=$2',[user,league])).rows[0]},
      weekly:{load:(u,l)=>f.rpc('gtl_read_weekly_state',[u,l])},
    });
    const req=async(n,route)=>{
      const response=await handler(new Request(`https://test.invalid${route}`,{headers:{Authorization:`Bearer ${n}`}}));
      assert.equal(response.status,200);return response.json();
    };
    const hidden=await req(4,`/state?league=${f.a}`);
    assert(hidden.games.every(g=>g.prediction===null&&g.market===null&&g.opponents.length===0&&g.bet===null));
    assert.equal(JSON.stringify(hidden).includes('-9.5'),false);
    const own=await req(1,`/state?league=${f.b}&mode=guess_total`);
    assert.equal(own.revision,3); assert.equal(own.weeklyRevision,3); assert.equal(own.officialEligible,false); assert.equal(own.statuses.guess_total.originPractice,true);
    assert.equal(own.ballotScope,'weekly'); assert.equal(own.selectionScope,'weekly');
    const challenge=await req(1,`/state?league=${f.b}&mode=betting_challenge`);
    assert.equal(challenge.selectionOriginPractice,true);assert.equal(challenge.officialEligible,false);
    const exported=await req(4,`/export?league=${f.a}`);
    assert.equal(JSON.stringify(exported).includes('-9.5'),false); assert.deepEqual(exported.bets,{});
  });
  await t.test('first-row saves and cross-mode writes share one CAS winner (serialized embedded SQL)',async()=>{
    const results=await Promise.allSettled([
      f.ballot(4,f.b,'guess_total',0,{'TB-DAL':44}),
      f.ballot(4,f.a,'guess_spread',0,{'TB-DAL':-2}),
    ]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.match(results.find(r=>r.status==='rejected').reason.message,/GTL_WEEKLY_CONFLICT/);
    assert.equal((await f.read(4,f.b)).revision,1);
  });
  await t.test('Challenge saves in two groups share a CAS winner and cannot duplicate immutable selections',async()=>{
    const games=f.original.games.filter(g=>g.id!=='TB-DAL').slice(0,2);
    const results=await Promise.allSettled(games.map((game,index)=>f.selection(1,index?f.b:f.a,3,{...bet,gameId:game.id})));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.match(results.find(r=>r.status==='rejected').reason.message,/GTL_WEEKLY_CONFLICT/);
    const current=await f.read(1,f.b);
    assert.equal(current.revision,4); assert.equal(Object.keys(current.state.bets[player(1)]).length,2);
    const winner=games[results.findIndex(r=>r.status==='fulfilled')];
    await assert.rejects(()=>f.selection(1,f.b,4,{...bet,gameId:winner.id,line:-5}),/GTL_SELECTION_LOCKED/);
  });
  await t.test('DB rejects invalid values, missing ballot, stale quotes and incompatible deadlines',async()=>{
    await assert.rejects(()=>f.selection(2,f.b,0,bet),/GTL_MATCHING_BALLOT_REQUIRED/);
    for(const picks of [{'TB-DAL':null},{'TB-DAL':'44'},{'TB-DAL':44.1},{'TB-DAL':201},{unknown:45}]) await assert.rejects(()=>f.ballot(2,f.b,'guess_total',0,picks),/GTL_BALLOT_INVALID/);
    await assert.rejects(()=>f.ballot(2,f.b,'guess_total',0,{},true),/GTL_BALLOT_INCOMPLETE/);
    await f.ballot(2,f.b,'guess_spread',0,full(-3),true);
    await assert.rejects(()=>f.selection(2,f.b,1,{...bet,quotedAt:'2000-01-01T00:00:00Z'}),/GTL_QUOTE_STALE/);
    await assert.rejects(()=>f.selection(2,f.b,1,{...bet,verification:'verified'}),/GTL_SELECTION_INVALID/);
    await f.db.query("update public.gtl_leagues set state=jsonb_set(state,'{league,deadline}','\"2099-10-10T00:15:00Z\"') where id=$1",[f.a]);
    await assert.rejects(()=>f.read(1,f.a),/GTL_SLATE_CONFLICT/);
  });
});

test('migration fails closed for conflicting ballots, unmapped entries, and incompatible slates', {skip},async t=>{
  for(const kind of ['conflict','unmapped','slate']) await t.test(kind,async t=>{
    const f=await fixture(t,async({db,a,original})=>{
      if(kind==='conflict') await db.query("update public.gtl_leagues set state=jsonb_set(state,'{ballots}',$2) where id=$1",[a,{[player(1)]:{guess_spread:{...original.ballots.sean.guess_spread,picks:{...original.ballots.sean.guess_spread.picks,'TB-DAL':-7.5}}}}]);
      if(kind==='unmapped') await db.query("update public.gtl_leagues set state=jsonb_set(state,'{ballots,troy}',$1) where id='sean-troy-luke'",[{guess_total:{picks:{'TB-DAL':44},submittedAt:null}}]);
      if(kind==='slate') await db.query("update public.gtl_leagues set state=jsonb_set(state,'{league,deadline}','\"2099-10-10T00:15:00Z\"') where id=$1",[a]);
    });
    await assert.rejects(()=>f.apply(),new RegExp(kind==='conflict'?'GTL_WEEKLY_BACKFILL_CONFLICT':kind==='unmapped'?'GTL_UNMAPPED_LEGACY_ENTRY':'GTL_SLATE_CONFLICT'));
    assert.equal((await f.db.query("select to_regclass('public.gtl_weekly_ballots') name")).rows[0].name,null);
  });
});

test('weekly provider errors expose only safe known messages',()=>{
  assert.equal(providerWeeklyError('GTL_WEEKLY_CONFLICT').status,409);
  // M-02 (redesign stage 18): a change to a locked-in guess is a 409 with the final copy, and its code reaches the client.
  assert.deepEqual([providerWeeklyError('GTL_BALLOT_LOCKED').status,providerWeeklyError('GTL_BALLOT_LOCKED').message,providerWeeklyError('GTL_BALLOT_LOCKED').code],[409,'Sent picks are final.','GTL_BALLOT_LOCKED']);
  assert.equal(providerWeeklyError('GTL_WEEKLY_CONFLICT').code,undefined,'no other weekly code goes out');
  assert.equal(providerWeeklyError('database SECRET private pick -9.5').message,'Weekly storage request failed.');
});

test('database clock enforces prediction deadline and matchup kickoff even without the engine', {skip},async t=>{
  const f=await fixture(t,async({db})=>{
    const rows=(await db.query('select id,state from public.gtl_leagues')).rows;
    for (const row of rows) {
      row.state.league.deadline='2000-01-01T00:00:00Z';
      for(const g of row.state.games) g.kickoff='2000-01-01T00:00:00Z';
      await db.query('update public.gtl_leagues set state=$2 where id=$1',[row.id,row.state]);
    }
  });
  await f.apply();
  await assert.rejects(()=>f.ballot(2,f.b,'guess_total',0,{}),/GTL_PREDICTION_CLOSED/);
  await assert.rejects(()=>f.selection(1,f.b,0,{gameId:'TB-DAL',market:'spread',side:'home',line:-3,odds:-110,source:'Synthetic fixture',quotedAt:new Date().toISOString()}),/GTL_SELECTION_CLOSED/);
  assert.equal((await f.read(2,f.b)).revision,0);
});

test('backfill preserves exact selection quotes and original audit while canonical practice follows to standard games', {skip},async t=>{
  const historic={market:'spread',side:'away',line:3,odds:120,source:'Historical synthetic fixture',quotedAt:'2026-10-08T15:00:00Z',selectedAt:'2026-10-08T15:01:00Z',gameId:'TB-DAL',id:'original-selection',verification:'Original verification label'};
  const event={id:'original-audit',player:'sean',mode:'betting_challenge',type:'selection_recorded',timestamp:historic.selectedAt,after:historic};
  const f=await fixture(t,async({db})=>{
    await db.query("update public.gtl_leagues set state=jsonb_set(jsonb_set(state,'{bets}',$1),'{audit}',$2) where id='sean-troy-luke'",[{sean:{'TB-DAL':historic}},[event]]);
  });
  await f.apply();
  assert.deepEqual((await f.read(1,f.b)).state.bets[player(1)]['TB-DAL'],historic);
  const raw=(await f.db.query('select selection,audit from public.gtl_weekly_selections')).rows[0];
  assert.deepEqual(raw.selection,historic); assert.deepEqual(raw.audit,[event]);
  await assert.rejects(()=>f.selection(1,f.b,0,{...historic,line:-5}),/GTL_SELECTION_INVALID/);
  const full=Object.fromEntries(f.original.games.map(g=>[g.id,45]));
  await f.ballot(1,f.practice,'guess_total',0,full,true);
  const game=f.original.games.find(g=>g.id!=='TB-DAL');
  const bet={gameId:game.id,market:'total',side:'over',line:45,odds:-110,source:'Synthetic fixture',quotedAt:new Date(Date.now()-60000).toISOString()};
  await f.selection(1,f.b,1,bet);
  assert.equal((await f.read(1,f.b)).selectionPractice,true);
  assert.equal((await f.db.query('select origin_practice from public.gtl_weekly_selections where game_id=$1',[game.id])).rows[0].origin_practice,true);
});

test('ghost and inactive memberships cannot reveal or mutate canonical entries', {skip},async t=>{
  const f=await fixture(t);await f.apply();
  await f.db.query('insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,$2,$3,$4)',[id(6),f.b,player(6),'player']);
  await assert.rejects(()=>f.read(6,f.b),/GTL_FORBIDDEN/);
  await assert.rejects(()=>f.ballot(6,f.b,'guess_total',0,{}),/GTL_FORBIDDEN/);
  await f.db.query('update public.gtl_memberships set active=false where user_id=$1 and league_id=$2',[id(1),f.b]);
  await assert.rejects(()=>f.read(1,f.b),/GTL_FORBIDDEN/);
  await assert.rejects(()=>f.ballot(1,f.b,'guess_total',0,{}),/GTL_FORBIDDEN/);
  const remaining=await f.read(2,f.b);
  assert.equal(remaining.state.league.roster.some(p=>p.id===player(1)),false);
  assert.equal(remaining.state.ballots[player(1)],undefined);
});


test('explicit weekly ruling accepts prior spread exposure without changing ballots or other modes', {skip}, async t=>{
  const f=await fixture(t); await f.apply();
  await f.join(1,3,f.a);
  const full=value=>Object.fromEntries(f.original.games.map(g=>[g.id,value]));
  await f.ballot(3,f.practice,'guess_spread',0,full(-8.5),true);
  await f.ballot(3,f.practice,'guess_total',1,full(44.5),true);
  const before=(await f.db.query('select * from public.gtl_weekly_ballots order by user_id,mode')).rows;
  await f.db.query(`insert into public.gtl_weekly_eligibility_rulings(user_id,season,week,mode,eligible,reason,approved_by,context_league_id,evidence) values($1,2026,5,'guess_spread',true,'Commissioner accepts known prior exposure for this week competition',$2,$3,'{"priorExposureAccepted":true}')`,[id(3),id(1),f.a]);
  const saved=await f.read(3,f.a);
  assert.equal(saved.originPractice.guess_spread,true);
  assert.equal(saved.eligibility[player(3)].guess_spread,true);
  assert.equal(saved.eligibility[player(3)].guess_total,false);
  const handler=createCloudHandler({
    authenticate:async()=>({id:id(3),email:'ruling-test@example.invalid',emailConfirmed:true}),
    storage:{membership:async(user,league)=>(await f.db.query('select player_id,active from public.gtl_memberships where user_id=$1 and league_id=$2',[user,league])).rows[0]},
    weekly:{load:(u,l)=>f.rpc('gtl_read_weekly_state',[u,l])},
  });
  const view=async(league,mode='guess_spread')=>(await handler(new Request(`https://test.invalid/state?league=${league}&mode=${mode}`,{headers:{Authorization:'Bearer fixture'}}))).json();
  const accepted=await view(f.a);
  assert.equal(accepted.officialEligible,true);
  assert.equal(accepted.statuses.guess_spread.originPractice,true);
  assert.equal(accepted.statuses.guess_spread.officialEligible,true);
  assert.equal(accepted.eligibilityRuling.eligible,true);
  assert.match(accepted.officialStatus,/benchmark pending/);
  assert.equal(accepted.standings.find(p=>p.id===player(3)).officialEligible,true);
  assert.equal((await view(f.practice)).officialEligible,false);
  assert.equal((await view(f.a,'guess_total')).officialEligible,false);
  assert.equal((await view(f.a,'guess_total')).eligibilityRuling,null);
  assert.deepEqual((await f.db.query('select * from public.gtl_weekly_ballots order by user_id,mode')).rows,before);
  await assert.rejects(()=>f.ballot(3,f.a,'guess_spread',2,full(-9)),/GTL_BALLOT_LOCKED/);
  for(const role of ['anon','authenticated','service_role']) {
    await assert.rejects(()=>f.as(role,'update public.gtl_weekly_eligibility_rulings set eligible=false'),/permission denied/);
    await assert.rejects(()=>f.as(role,'delete from public.gtl_weekly_eligibility_rulings'),/permission denied/);
  }
  for(const role of ['anon','authenticated']) await assert.rejects(()=>f.as(role,'select * from public.gtl_weekly_eligibility_rulings'),/permission denied/);
});
