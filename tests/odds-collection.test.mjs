import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { createCloudHandler } from '../cloud/handler.mjs';
import { handleOddsCollection, providerCollectionError } from '../cloud/odds-collection.mjs';
import { OddsProviderError } from '../cloud/odds-provider.mjs';
import { emptySocialState } from '../shared/social-bets.mjs';
let PGlite;
try { ({PGlite}=await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
// The October 12 window file replaces both collection begin RPCs (published-slate source, collect cooldown 5 minutes,
// six collections per UTC day) and the scheduler's claim, which declares the gtl_odds_schedule row type from
// 20261008200926; its submission begin RPC needs 20261008232055 and that file's dependencies (185715, 224444, 225401).
const migrations=['20261008164249_gtl_private_cloud_state.sql','20261008174007_gtl_profiles_private_games_invites.sql','20261008182836_gtl_canonical_weekly_entries.sql','20261008185715_gtl_weekly_eligibility_rulings.sql','20261008185738_gtl_manual_odds_collection.sql','20261008200926_gtl_twelve_hour_odds_refresh.sql','20261008224444_gtl_personal_workspace.sql','20261008225401_gtl_submission_time_scoring.sql','20261008232055_gtl_fresh_submission_odds.sql','20261012213000_gtl_submission_odds_window.sql'].map(f=>fs.readFileSync(`supabase/migrations/${f}`,'utf8'));
const skip=PGlite?false:'Optional local PGlite absent; no hosted database tests.';
const quota=(remaining=500,last=0)=>({remaining,used:500-remaining,last});
function payload(games,operation='preflight') {
  const now=new Date().toISOString(), observed=new Date(Date.now()-60000).toISOString();
  return {provider:'the-odds-api',sport:'americanfootball_nfl',officialVerified:false,fetchedAt:now,
    games:games.map((g,i)=>({gameId:g.id,home:g.home,away:g.away,kickoff:g.kickoff,providerEventId:`event_${i}`,matchStatus:'matched',
      ...(operation==='collect'?{markets:Object.fromEntries(['spread','total'].map(m=>[m,{status:'available',quotes:[{
        provider:'the-odds-api',providerEventId:`event_${i}`,book:'draftkings',source:'DraftKings',market:m,value:m==='spread'?-3.5:45,
        providerObservedAt:observed,collectedAt:now,timeBasis:'provider_market_last_update',tradability:'not_confirmed',
        outcomes:m==='spread'?{home:{line:-3.5,odds:-110},away:{line:3.5,odds:-110}}:{over:{line:45,odds:-110},under:{line:45,odds:-110}},
      }],unavailable:[]}]))}:{})})),
  };
}
async function fixture(t) {
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;');
  await db.exec(migrations[0]);
  const original=seed();original.league.deadline='2099-10-09T00:15:00Z';for(const g of original.games)g.kickoff=g.kickoff.replace('2026-','2099-');
  await db.query("insert into public.gtl_leagues(id,state) values('sean-troy-luke',$1)",[original]);
  await db.query('insert into auth.users values($1),($2),($3)',[id(1),id(2),id(3)]);
  await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner'),($2,'sean-troy-luke','troy','player')",[id(1),id(2)]);
  for(const sql of migrations.slice(1))await db.exec(sql);
  const as=(role,sql,args=[])=>db.transaction(async tx=>{await tx.exec(`set local role ${role}`);return tx.query(sql,args);});
  const rpc=async(name,args)=>(await as('service_role',`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value;
  const begin=(n,request,op)=>rpc('gtl_begin_odds_collection',[id(n),request,op]);
  const finish=(job,data,q=quota(),error=null,n=1)=>rpc('gtl_finish_odds_collection',[id(n),job.requestId,job.lease,data,q,error]);
  const resetTime=()=>db.exec("update public.gtl_odds_budget set last_collection_at=now()-interval '16 minutes',last_preflight_at=now()-interval '2 minutes'");
  return {db,as,rpc,begin,finish,resetTime,original};
}

test('stored provider snapshots are shared across matching canonical groups without sharing membership or accepting a changed slate', { skip }, async t => {
  const f = await fixture(t);
  const preflight = await f.begin(1, id(901), 'preflight');
  await f.finish(preflight, payload(preflight.games), quota());
  const collection = await f.begin(1, id(902), 'collect');
  const saved = await f.finish(collection, payload(collection.games, 'collect'), quota(498, 2));
  await f.rpc('gtl_save_profile', [id(3), 'Separate group host']);
  const group = await f.rpc('gtl_create_league', [id(3), 'Independent same-slate group', 'group', false, id(903)]);
  const leagueId = group.leagueId;
  assert.equal(typeof leagueId, 'string');
  const shared = await f.rpc('gtl_read_market_snapshot', [id(3), leagueId]);
  const original = await f.rpc('gtl_read_market_snapshot', [id(1), 'sean-troy-luke']);
  assert.equal(shared.id, saved.snapshotId); assert.deepEqual(shared, original);
  await assert.rejects(() => f.rpc('gtl_read_market_snapshot', [id(2), leagueId]), /GTL_FORBIDDEN/);
  const state = (await f.db.query('select state from public.gtl_leagues where id=$1', [leagueId])).rows[0].state;
  for (const mutate of [next => { next.league.week++; }, next => { next.games[0].id = 'wrong-event'; }, next => { next.games[0].homeCode = 'WRONG'; }, next => { next.games[0].awayCode = 'WRONG'; }, next => { next.games[0].kickoff = '2099-10-09T01:15:00Z'; }]) {
    const changed = structuredClone(state); mutate(changed);
    await f.db.query('update public.gtl_leagues set state=$1 where id=$2', [changed, leagueId]);
    await assert.rejects(() => f.rpc('gtl_read_market_snapshot', [id(3), leagueId]), /GTL_SLATE_CONFLICT/);
  }
  await f.db.query('update public.gtl_leagues set state=$1 where id=$2', [state, leagueId]);
  assert.deepEqual(await f.rpc('gtl_read_market_snapshot', [id(3), leagueId]), shared);
  assert.equal((await f.db.query('select count(*) n from public.gtl_market_snapshots')).rows[0].n, 1);
  assert.deepEqual((await f.db.query("select state from public.gtl_leagues where id='sean-troy-luke'")).rows[0].state, f.original);
});

test('manual collection SQL enforces authorization, private immutable snapshots, quota and replay', {skip},async t=>{
  const f=await fixture(t);
  await t.test('browser roles cannot CRUD tables or call any helper/RPC',async()=>{
    for(const table of ['gtl_odds_budget','gtl_odds_collections','gtl_market_snapshots']) {
      assert.equal((await f.db.query('select relrowsecurity from pg_class where oid=$1::regclass',[`public.${table}`])).rows[0].relrowsecurity,true);
      for(const role of ['anon','authenticated']) {
        for(const sql of [`select * from public.${table}`,`delete from public.${table}`,`insert into public.${table} default values`,`update public.${table} set ${table==='gtl_odds_budget'?'updated_at=updated_at':table==='gtl_odds_collections'?'status=status':'payload=payload'}`]) await assert.rejects(()=>f.as(role,sql),/permission denied/);
      }
    }
    for(const signature of ['gtl_odds_commissioner(uuid)','gtl_begin_odds_collection(uuid,uuid,text)','gtl_finish_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text)','gtl_read_market_snapshot(uuid,text)'])for(const role of ['anon','authenticated'])assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok',[role,`public.${signature}`,'EXECUTE'])).rows[0].ok,false);
    await assert.rejects(()=>f.begin(2,id(10),'preflight'),/GTL_ODDS_FORBIDDEN/);
    await f.rpc('gtl_save_profile',[id(3),'Independent host']);
    await f.rpc('gtl_create_league',[id(3),'Independent game','group',false,id(11)]);
    await assert.rejects(()=>f.begin(3,id(12),'preflight'),/GTL_ODDS_FORBIDDEN/);
  });
  await t.test('unmeasured or failed preflight cannot bootstrap quota; missing headers are not invented',async()=>{
    await assert.rejects(()=>f.begin(1,id(20),'collect'),/GTL_ODDS_PREFLIGHT_REQUIRED/);
    let job=await f.begin(1,id(21),'preflight');
    await f.finish(job,null,quota(),'ODDS_AUTH');
    await assert.rejects(()=>f.begin(1,id(22),'collect'),/GTL_ODDS_PREFLIGHT_REQUIRED/);
    await f.resetTime();job=await f.begin(1,id(23),'preflight');
    await f.finish(job,payload(job.games),{remaining:null,used:null,last:null});
    await assert.rejects(()=>f.begin(1,id(24),'collect'),/GTL_ODDS_PREFLIGHT_REQUIRED/);
    await f.resetTime();job=await f.begin(1,id(25),'preflight');
    await assert.rejects(()=>f.finish(job,payload(job.games),{remaining:'500'}),/GTL_ODDS_REQUEST/);
    const result=await f.finish(job,payload(job.games));assert.equal(result.matchedEvents,15);assert.equal(result.availableQuotes,0);
    assert.equal(JSON.stringify(result).includes('markets'),false);
  });
  let successful;
  await t.test('distributed lease excludes another caller and same request never triggers a duplicate collection',async()=>{
    const job=await f.begin(1,id(30),'collect');
    assert.equal(job.remainingCredits,500);assert.equal(job.reserveCredits,50);
    assert.equal((await f.db.query('select conservative_remaining from public.gtl_odds_budget')).rows[0].conservative_remaining,498);
    const retry=await f.begin(1,id(30),'collect');assert.equal(retry.replay,true);assert.equal(retry.status,'running');assert.equal(retry.games,undefined);
    await assert.rejects(()=>f.begin(1,id(31),'collect'),/GTL_ODDS_BUSY/);
    await assert.rejects(()=>f.begin(1,id(30),'preflight'),/GTL_ODDS_REQUEST_CONFLICT/);
    successful=await f.finish(job,payload(job.games,'collect'),quota(498,2));
    assert.equal(successful.status,'succeeded');assert.equal(successful.snapshotId,id(30));assert.equal(successful.availableQuotes,30);
    const replay=await f.begin(1,id(30),'collect');assert.deepEqual(replay.diagnostics,successful);
    assert.deepEqual(await f.finish(job,{malicious:'replacement'},quota()),successful);
    assert.equal((await f.db.query('select count(*) n from public.gtl_market_snapshots')).rows[0].n,1);
    await assert.rejects(()=>f.begin(1,id(32),'collect'),/GTL_ODDS_COOLDOWN/);
  });
  await t.test('snapshot reads require active membership and exact slate; service cannot rewrite snapshot',async()=>{
    const snapshot=await f.rpc('gtl_read_market_snapshot',[id(2),'sean-troy-luke']);
    assert.equal(snapshot.id,successful.snapshotId);assert.equal(snapshot.officialVerified,false);assert.equal(snapshot.payload.games[0].markets.spread.quotes[0].value,-3.5);
    for(let n=0;n<21;n++) {
      await f.db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) select $1,actor_id,'preflight','succeeded',$2,started_at,expires_at,0,season,week,slate_signature from public.gtl_odds_collections where id=$3",[id(200+n),id(300+n),successful.snapshotId]);
      await f.db.query("insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) select $1,season,week,slate_signature,payload,created_at-($2*interval '1 second') from public.gtl_market_snapshots where id=$3",[id(200+n),n+1,successful.snapshotId]);
    }
    const withHistory=await f.rpc('gtl_read_market_snapshot',[id(2),'sean-troy-luke']);
    assert.equal(withHistory.id,successful.snapshotId);assert.equal(withHistory.history.length,20);
    assert.equal(withHistory.history.at(-1).id,withHistory.id);
    await assert.rejects(()=>f.as('service_role',"update public.gtl_market_snapshots set payload='{}'"),/permission denied/);
    await assert.rejects(()=>f.rpc('gtl_read_market_snapshot',[id(3),'sean-troy-luke']),/GTL_FORBIDDEN/);
    await f.db.query("update public.gtl_memberships set active=false where user_id=$1 and league_id='sean-troy-luke'",[id(2)]);
    await assert.rejects(()=>f.rpc('gtl_read_market_snapshot',[id(2),'sean-troy-luke']),/GTL_FORBIDDEN/);
    const state=(await f.db.query("select state from public.gtl_leagues where id='sean-troy-luke'")).rows[0].state;
    assert.deepEqual(state,f.original);
  });
  await t.test('unknown network outcome consumes reservation; measured headers may lower but never restore credits',async()=>{
    await f.resetTime();const job=await f.begin(1,id(40),'collect');
    await f.finish(job,null,{remaining:null,used:null,last:null},'ODDS_TIMEOUT');
    assert.equal((await f.db.query('select conservative_remaining from public.gtl_odds_budget')).rows[0].conservative_remaining,496);
    await f.resetTime();const preflight=await f.begin(1,id(41),'preflight');
    await f.finish(preflight,payload(preflight.games),quota(500,0));
    assert.equal((await f.db.query('select conservative_remaining from public.gtl_odds_budget')).rows[0].conservative_remaining,496);
    await f.resetTime();const lowered=await f.begin(1,id(42),'preflight');
    await f.finish(lowered,payload(lowered.games),quota(490,0));
    assert.equal((await f.db.query('select conservative_remaining from public.gtl_odds_budget')).rows[0].conservative_remaining,490);
  });
  await t.test('expired holder cannot persist after takeover and UTC manual limit counts uncertain attempts',async()=>{
    await f.resetTime();const old=await f.begin(1,id(50),'collect');
    await f.db.exec("update public.gtl_odds_budget set lease_until=now()-interval '1 second';update public.gtl_odds_collections set expires_at=now()-interval '1 second' where status='running'");
    await f.resetTime();const next=await f.begin(1,id(51),'collect');
    assert.equal(next.remainingCredits,488);
    const expired=await f.finish(old,payload(old.games,'collect'),quota(488,2));assert.equal(expired.status,'failed');
    assert.equal((await f.db.query('select lease_token from public.gtl_odds_budget')).rows[0].lease_token,next.lease);
    await f.finish(next,null,{remaining:null,used:null,last:null},'ODDS_UNAVAILABLE');
    // Four collections so far; the cap is six per UTC day since the October 12 window migration (was four).
    await f.resetTime();const fifth=await f.begin(1,id(53),'collect');assert.equal(fifth.replay,false);
    await f.finish(fifth,null,{remaining:null,used:null,last:null},'ODDS_UNAVAILABLE');
    await f.resetTime();const sixth=await f.begin(1,id(54),'collect');assert.equal(sixth.replay,false);
    await f.finish(sixth,null,{remaining:null,used:null,last:null},'ODDS_UNAVAILABLE');
    await f.resetTime();await assert.rejects(()=>f.begin(1,id(52),'collect'),/GTL_ODDS_DAILY_LIMIT/);
    assert.equal((await f.db.query('select conservative_remaining from public.gtl_odds_budget')).rows[0].conservative_remaining,482);
  });
});

test('collector fails closed on reserve, unexpected cost and payload mismatches, persisting no false official snapshot',{skip},async t=>{
  const f=await fixture(t);let job=await f.begin(1,id(100),'preflight');await f.finish(job,payload(job.games),quota(51,0));
  await assert.rejects(()=>f.begin(1,id(101),'collect'),/GTL_ODDS_BUDGET/);
  // Isolated admin fixture restoration, never a production automatic refund.
  await f.db.exec('update public.gtl_odds_budget set conservative_remaining=500');
  job=await f.begin(1,id(102),'collect');
  const valid=payload(job.games,'collect');
  const official=structuredClone(valid);official.officialVerified=true;
  await assert.rejects(()=>f.finish(job,official,quota(498,2)),/GTL_ODDS_PAYLOAD/);
  const mismatch=structuredClone(valid);mismatch.games[0].home='Some Other Team';
  await assert.rejects(()=>f.finish(job,mismatch,quota(498,2)),/GTL_ODDS_PAYLOAD/);
  const late=structuredClone(valid);late.games[0].markets.spread.quotes[0].collectedAt=job.games[0].kickoff;
  await assert.rejects(()=>f.finish(job,late,quota(498,2)),/GTL_ODDS_PAYLOAD/);
  assert.equal((await f.db.query('select count(*) n from public.gtl_market_snapshots')).rows[0].n,0);
  assert.equal((await f.db.query('select conservative_remaining from public.gtl_odds_budget')).rows[0].conservative_remaining,498);
  const result=await f.finish(job,valid,quota(494,6));assert.equal(result.errorCode,'ODDS_QUOTA_COST');assert.equal(result.snapshotId,null);
  await f.resetTime();await assert.rejects(()=>f.begin(1,id(103),'collect'),/GTL_ODDS_BUDGET/);
});

function httpApp({member={active:true,player_id:'sean',role:'commissioner'},user={id:id(1),email:'owner@example.invalid',emailConfirmed:true},rpc,provider}={}) {
  const calls=[];
  const handler=createCloudHandler({authenticate:async()=>user,storage:{membership:async(uid,league)=>{calls.push(['member',uid,league]);return member;}},
    odds:{rpc:async(name,args)=>{calls.push([name,args]);return rpc?.(name,args);}},oddsProvider:provider});
  return {calls,request:async(path='/odds/collect',body={requestId:id(10)})=>{
    const response=await handler(new Request(`https://test.invalid${path}`,{method:'POST',headers:{Authorization:'Bearer test-token','Content-Type':'application/json'},body:JSON.stringify(body)}));
    return {status:response.status,data:await response.json()};
  }};
}
test('HTTP manual routes authorize original commissioner before provider calls and reject client scope/budget overrides',async()=>{
  for(const member of [null,{active:false,player_id:'sean',role:'commissioner'},{active:true,player_id:'u_any',role:'commissioner'},{active:true,player_id:'troy',role:'player'}]) {
    const app=httpApp({member});assert.equal((await app.request()).status,403);assert.equal(app.calls.length,1);
  }
  const app=httpApp({provider:{}});
  for(const body of [{requestId:id(10),remainingCredits:500},{requestId:id(10),games:[]},{requestId:id(10),player:'sean'},{requestId:'invalid'}])assert.equal((await app.request('/odds/collect',body)).status,400);
  assert.equal((await app.request('/odds/collect?league=sean-troy-luke')).status,400);
  assert.equal(app.calls.some(([name])=>name==='gtl_begin_odds_collection'),false);
  assert.equal((await httpApp({user:{id:id(1),email:'owner@example.invalid',emailConfirmed:false}}).request()).status,403);
});

test('manual HTTP result is counts only, replay does not fetch and provider failure never leaks credentials',async()=>{
  let fetches=0;
  const game=seed().games[0],secret='SECRET_ODDS_KEY';
  const provider={collect:async()=>{fetches++;return {...payload([game],'collect'),quota:quota(498,2)};}};
  const rpc=(name,args)=>name==='gtl_begin_odds_collection'?{replay:false,lease:id(99),games:[game],remainingCredits:500,reserveCredits:50}:{requestId:id(10),operation:'collect',status:'succeeded',snapshotId:id(10),matchedEvents:1,availableQuotes:2,quota:quota(498,2),payload:args.p_payload};
  const app=httpApp({provider,rpc}),result=await app.request();
  assert.equal(result.status,200);assert.equal(result.data.availableQuotes,2);assert.equal(result.data.officialVerified,false);assert.equal(result.data.payload,undefined);assert.equal(JSON.stringify(result.data).includes('-3.5'),false);
  const replay=httpApp({provider,rpc:()=>({replay:true,diagnostics:result.data})});await replay.request();assert.equal(fetches,1);
  let finished;
  const failed=httpApp({provider:{collect:async()=>{throw new Error(`https://provider.invalid?key=${secret}`);}},rpc:(name,args)=>name==='gtl_begin_odds_collection'?{lease:id(99),games:[game],remainingCredits:500,reserveCredits:50}:(finished=args,{requestId:id(10),operation:'collect',status:'failed',errorCode:args.p_error})});
  const error=await failed.request();assert.equal(error.data.errorCode,'ODDS_UNAVAILABLE');assert.equal(finished.p_payload,null);assert.deepEqual(finished.p_quota,{remaining:null,used:null,last:null});assert.equal(JSON.stringify(error).includes(secret),false);
  const storage=httpApp({provider,rpc:()=>{throw providerCollectionError('GTL_ODDS_DAILY_LIMIT');}});assert.equal((await storage.request()).status,429);
});

test('collection orchestration uses quota errors safely and free preflight without a credit budget',async()=>{
  const calls=[];
  const base={body:{requestId:id(1)},user:{id:id(1)},service:{rpc:async(name,args)=>{calls.push([name,args]);return name==='gtl_begin_odds_collection'?{lease:id(99),games:seed().games}:{requestId:id(1),operation:'preflight',status:'failed',errorCode:args.p_error,quota:args.p_quota};}}};
  const result=await handleOddsCollection({...base,route:'/odds/preflight',provider:{preflight:async({games,...rest})=>{assert.equal(games.length,15);assert.deepEqual(rest,{});throw new OddsProviderError('ODDS_RATE_LIMIT',quota(498,0));}}});
  assert.equal(result.errorCode,'ODDS_RATE_LIMIT');assert.equal(result.quota.remaining,498);assert.equal(calls.length,2);
});

test('market snapshot lookup occurs only after matching mode reveal; failure never blocks saved entries',async()=>{
  const state=seed(),calls=[],socialCalls=[];
  const make=(failing=false)=>createCloudHandler({
    authenticate:async()=>({id:id(1),email:'owner@example.invalid',emailConfirmed:true}),
    storage:{membership:async()=>({active:true,player_id:'sean',role:'commissioner'})},
    weekly:{load:async()=>({state,revision:0,leagueRevision:0})},
    social:{rpc:async(name,args)=>{
      socialCalls.push([name,args]);
      assert.equal(name,'gtl_read_social');
      return {season:state.league.season,week:state.league.week,profiles:[],following:[],
        availableWeeks:[{season:state.league.season,week:state.league.week}],
        weeks:[{season:state.league.season,week:state.league.week,games:state.games,revision:0,state:emptySocialState()}]};
    }},
    odds:{marketSnapshot:async(user,league)=>{calls.push([user,league]);if(failing)throw new Error('secret provider detail');return null;}},
  });
  const req=async(handler,path)=>{const response=await handler(new Request(`https://test.invalid${path}`,{headers:{Authorization:'Bearer test-token'}}));return {status:response.status,data:await response.json()};};
  for(const path of ['/state?mode=guess_total','/state?mode=betting_challenge','/export'])assert.equal((await req(make(),path)).status,200);
  assert.equal(calls.length,1, 'Challenge may load quotes for the already-submitted Spread mode');
  assert.deepEqual(socialCalls,[['gtl_read_social',{p_user:id(1),p_season:null,p_week:null,p_all:true}]],'Export reads all shared history without a market lookup');
  const revealed=await req(make(),'/state?mode=guess_spread');assert.equal(revealed.status,200);assert.equal(calls.length,2);assert.equal(revealed.data.marketFeed.status,'waiting');
  const failure=await req(make(true),'/state?mode=guess_spread');assert.equal(failure.status,200);assert.equal(failure.data.marketFeed.status,'unavailable');assert.equal(failure.data.games[0].prediction,-9.5);assert.equal(JSON.stringify(failure.data).includes('secret provider detail'),false);
});

test('successful submission immediately reveals only its own market and snapshot failure cannot undo save',async()=>{
  const now=Date.parse('2026-10-08T20:00:00Z');
  for(const failFeed of [false,true]) {
    let state=seed(),revision=0,reads=0,saves=0;
    const snapshot={id:id(30),createdAt:new Date(now).toISOString(),payload:payload(state.games,'collect')};
    snapshot.payload.fetchedAt = new Date(now).toISOString();
    for(const game of snapshot.payload.games)for(const market of Object.values(game.markets))for(const quote of market.quotes){quote.providerObservedAt=new Date(now-60000).toISOString();quote.collectedAt=new Date(now).toISOString();}
    const handler=createCloudHandler({clock:()=>now,
      authenticate:async()=>({id:id(1),email:'owner@example.invalid',emailConfirmed:true}),
      storage:{membership:async()=>({active:true,player_id:'sean',role:'commissioner'})},
      weekly:{load:async()=>({state:structuredClone(state),revision,leagueRevision:0}),saveBallot:async(_u,_l,mode,expected,picks,submit)=>{
        assert.equal(expected,revision);saves++;state.ballots.sean[mode]={picks:structuredClone(picks),submittedAt:submit?new Date(now).toISOString():null};return ++revision;
      }},
      // Source eligibility succeeds here; this case isolates post-save read failure.
      odds:{rpc:async name=>{assert.equal(name,'gtl_preflight_submission');return {requiresReferences:true,ready:true};},marketSnapshot:async()=>{assert.equal(saves,1);reads++;if(failFeed)throw new Error('SECRET provider URL');return snapshot;}},
    });
    const response=await handler(new Request('https://test.invalid/ballot?mode=guess_total',{method:'POST',headers:{Authorization:'Bearer test-token','Content-Type':'application/json'},body:JSON.stringify({revision:0,picks:Object.fromEntries(state.games.map(g=>[g.id,44])),submit:true})}));
    const data=await response.json();assert.equal(response.status,200);assert.equal(data.revealed,true);assert.equal(data.lockReason,null);assert.equal(data.revision,1);assert.equal(saves,1);assert.equal(reads,1);
    assert.equal(state.ballots.sean.guess_total.submittedAt,new Date(now).toISOString());
    assert(data.games.every(g=>g.market===null));assert.equal(JSON.stringify(data).includes('SECRET'),false);
    if(failFeed)assert.equal(data.marketFeed.status,'unavailable');
    else assert(data.games.every(g=>g.marketQuotes.length===1&&g.marketQuotes[0].value===45));
  }
});
