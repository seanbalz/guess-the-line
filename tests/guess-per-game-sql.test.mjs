import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ALL, ROLLBACK_DIR, migrationSql } from './migrations.mjs';
import { createCommunityWorld, ACCOUNTS, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { serviceSql, storeLines } from './helpers/guess-week.mjs';
const skip = pgliteAvailable ? false : 'PGlite unavailable; no hosted tests';
const M07='20261015190710_gtl_guess_write_window.sql';
const id=who=>ACCOUNTS[who].id;
async function ballot(world,who,mode='guess_spread') {
  return (await world.db.query('select ballot,audit from public.gtl_weekly_ballots where user_id=$1 and mode=$2',[id(who),mode])).rows[0];
}
async function save(world,who,picks,{mode='guess_spread',submit=false,lockIn=[],requestId=randomUUID()}={}) {
  const sql=serviceSql(world.db),{season,week}=world.state.league;
  const revision=(await world.db.query('select revision from public.gtl_personal_versions where user_id=$1',[id(who)])).rows[0]?.revision??0;
  const weeklyRevision=(await world.db.query('select revision from public.gtl_weekly_versions where user_id=$1 and season=$2 and week=$3',[id(who),season,week])).rows[0]?.revision??0;
  const body={season,week,picks,mode,submit,lockIn,requestId,revision,weeklyRevision};
  return {result:await sql('gtl_mutate_personal',{p_user:id(who),p_action:'personal/ballot',p_body:body}),body};
}
async function direct(world,who,change,mode='guess_spread') {
  return world.db.transaction(async tx=>{await tx.exec('set local role service_role');await tx.query(`update public.gtl_weekly_ballots set ballot=${change} where user_id=$1 and mode=$2`,[id(who),mode]);});
}
async function lines(world) {
  await storeLines(world.db,world.state,Object.fromEntries(['spread','total'].map(m=>[m,Object.fromEntries(world.state.games.map(g=>[g.id,m==='spread'?-3:45]))])));
}
test('M-07: partial independent locks score immediately, shared standings wait for kickoff, and other-player details obey per-game reveal', {skip},async t=>{
  const w=await createCommunityWorld({migrations:ALL,games:3,troyBallots:false,optionalRpc:true});t.after(()=>w.db.close());
  const sql=serviceSql(w.db),[a,b]=w.state.games,{season,week}=w.state.league;await lines(w);
  const out=await save(w,'luke',{[a.id]:-4,[b.id]:-8},{lockIn:[a.id]});
  assert.equal(out.result.scoringReceipt.weekPoints,8);assert.equal(out.result.scoringReceipt.weekScored,1);
  assert.equal(out.result.scoringReceipt.satOut,false);
  assert.equal(out.result.scoringReceipt.standingsPoints,null);assert.equal(out.result.scoringReceipt.awaitingKickoffPoints,8);
  assert.deepEqual(out.result.scoringReceipt.games.map(x=>x.gameId),[a.id]);
  assert.equal((await ballot(w,'luke')).ballot.submittedAt,null);
  const me=await sql('gtl_read_community_history',{p_user:id('luke'),p_season:season,p_now:new Date().toISOString()});
  const own=me.weeks[0].entries.find(x=>x.userId===id('luke'));
  assert.equal(own.weekPoints,8);assert.equal(own.scoreTiming,'immediate');assert.equal(own.picks.find(x=>x.gameId===a.id).lockedIn,true);
  const mine=await sql('gtl_read_lines',{p_user:id('luke'),p_season:season,p_week:week});
  assert.equal(mine.games[0].mine.spread.points,8);assert.equal(mine.games[0].mine.total.points,null);
  const hiddenLines=await sql('gtl_read_lines',{p_user:id('sean'),p_season:season,p_week:week});
  assert.deepEqual(hiddenLines.games[0].spread,{visible:false});
  const community=await sql('gtl_read_community',{p_user:id('sean')});
  const board=community.standings.find(x=>x.userId===id('luke')&&x.mode==='guess_spread');
  assert.equal(board.weekPoints,null);assert.equal(board.weekScored,0);
  const args={p_user:id('sean'),p_season:season,p_week:week,p_mode:'guess_spread',p_game:null,p_target:null,p_now:new Date().toISOString()};
  const hidden=await sql('gtl_read_guess_picks',args);
  assert.equal(hidden.games[0].rows.find(x=>x.userId===id('luke')).points,null);
  await save(w,'sean',{[a.id]:-5},{lockIn:[a.id]});
  const shown=await sql('gtl_read_guess_picks',args),luke=shown.games[0].rows.find(x=>x.userId===id('luke'));
  assert.equal(luke.points,8);assert.equal(luke.error,1);assert.equal(luke.rank,null);assert.equal(luke.closest,false);
  assert.equal(shown.games[1].rows.find(x=>x.userId===id('luke')).pick,null,'another player draft stays hidden');
  const after=await sql('gtl_read_community',{p_user:id('sean'),p_now:new Date(Date.parse(a.kickoff)+1).toISOString()});
  assert.equal(after.standings.find(x=>x.userId===id('luke')&&x.mode==='guess_spread').weekPoints,8);
  const total=await save(w,'luke',{[a.id]:44},{mode:'guess_total',lockIn:[a.id]});assert.equal(total.result.scoringReceipt.weekPoints,8);
});

test('M-07: both writers and trigger reject editing/removing locks and forged timestamps/references/late markers; receipts replay exactly', {skip},async t=>{
  const w=await createCommunityWorld({migrations:ALL,games:2,troyBallots:false});t.after(()=>w.db.close());await lines(w);
  const [a,b]=w.state.games,sql=serviceSql(w.db),{season,week}=w.state.league;
  const first=await save(w,'luke',{[a.id]:-4},{lockIn:[a.id]});
  const snapshot=await ballot(w,'luke');
  await assert.rejects(save(w,'luke',{[a.id]:-5},{lockIn:[a.id]}),/GTL_BALLOT_LOCKED/);
  await assert.rejects(save(w,'luke',{[b.id]:2}),/GTL_BALLOT_LOCKED/);
  for(const mutation of [`jsonb_set(ballot,'{picks,${a.id}}','-5')`,`jsonb_set(ballot,'{lockedAt,${a.id}}','"2000-01-01T00:00:00Z"')`,
    `jsonb_set(ballot,'{scoringReferences,${a.id},value}','-8')`,`ballot||'{"late":{"deadline":"2000-01-01T00:00:00Z","minutes":1}}'::jsonb`,
    `ballot||jsonb_build_object('updatedAt',clock_timestamp()-interval '1 day','lockedAt',jsonb_build_object('${a.id}',clock_timestamp()-interval '1 day'))`]) {
    await assert.rejects(direct(w,'luke',mutation),/GTL_BALLOT_LOCKED|GTL_SUBMISSION_ODDS_REQUIRED/);
  }
  assert.deepEqual(await ballot(w,'luke'),snapshot);
  assert.deepEqual(await sql('gtl_mutate_personal',{p_user:id('luke'),p_action:'personal/ballot',p_body:first.body}),first.result);
  const rev=(await w.db.query('select revision from public.gtl_weekly_versions where user_id=$1',[id('luke')])).rows[0].revision;
  await assert.rejects(sql('gtl_save_weekly_ballot',{p_user:id('luke'),p_league:'sean-troy-luke',p_mode:'guess_spread',p_revision:rev,p_picks:{[a.id]:-7,[b.id]:1},p_submit:true}),/GTL_BALLOT_LOCKED/);
  // Draft-only direct writes must no longer bypass the trigger's clock and kickoff checks.
  await assert.rejects(direct(w,'luke',`jsonb_set(ballot,'{picks,${b.id}}','1')`),/GTL_SUBMISSION_ODDS_REQUIRED/);
  const updated=await save(w,'luke',{[a.id]:-4,[b.id]:2});assert.equal(updated.result.scoringReceipt.weekPoints,8);
  assert.deepEqual((await ballot(w,'luke')).ballot.scoringReferences[a.id],snapshot.ballot.scoringReferences[a.id]);
});

test('M-07: after deadline open games accept drafts/locks; started drafts are preserved and never count; per-game Late survives later saves', {skip},async t=>{
  const now=Date.now();const w=await createCommunityWorld({migrations:ALL,games:3,troyBallots:false,optionalRpc:true,groupScreens:true,prepare:s=>{
    s.league.deadline=new Date(now-3600000).toISOString();s.games.forEach((g,i)=>g.kickoff=new Date(now+(i===0?-1800000:i*3600000)).toISOString());
  }});t.after(()=>w.db.close());const [a,b,c]=w.state.games,{season,week}=w.state.league,sql=serviceSql(w.db);
  await w.db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing',[id('luke'),season,week]);
  await w.db.exec('alter table public.gtl_weekly_ballots disable trigger user');
  await w.db.query('insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,$2,$3,$4,$5)',[id('luke'),season,week,'guess_spread',{picks:{[a.id]:-2},submittedAt:null,updatedAt:new Date(now-7200000).toISOString()}]);
  await w.db.exec('alter table public.gtl_weekly_ballots enable trigger user');await lines(w);
  await assert.rejects(save(w,'luke',{[a.id]:-3,[b.id]:-3}),/GTL_GAME_CLOSED/);
  await assert.rejects(save(w,'luke',{[a.id]:-2},{lockIn:[a.id]}),/GTL_GAME_CLOSED/);
  await save(w,'luke',{[b.id]:-4},{lockIn:[b.id]});
  let row=(await ballot(w,'luke')).ballot;assert.equal(row.picks[a.id],-2);assert.deepEqual(row.closedAtKickoff,[a.id]);assert.equal(row.lockedLate[b.id].minutes,60);
  await assert.rejects(save(w,'luke',{[a.id]:-2,[b.id]:-4},{submit:true}),/GTL_BALLOT_INCOMPLETE/);
  const sent=await save(w,'luke',{[b.id]:-4,[c.id]:-3},{submit:true});
  assert.equal(sent.result.scoringReceipt.weekScored,2);assert.equal(sent.result.scoringReceipt.weekPoints,18);
  row=(await ballot(w,'luke')).ballot;assert.ok(row.submittedAt);assert.equal(row.picks[a.id],-2);
  assert.equal(await sql('gtl_guess_locked_in',{p_user:id('luke'),p_season:season,p_week:week,p_mode:'guess_spread',p_game:a.id}),false);
  const group=(await w.api('sean','state?mode=guess_total')).body;
  const groupSave=await w.api('sean','ballot?mode=guess_total',{revision:group.revision,picks:{[b.id]:44,[c.id]:45},submit:true});
  assert.equal(groupSave.status,200,JSON.stringify(groupSave.body));
  const history=await sql('gtl_read_community_history',{p_user:id('luke'),p_season:season});
  const kept=history.weeks[0].entries.find(x=>x.userId===id('luke')).picks.find(x=>x.gameId===a.id);assert.equal(kept.guess,-2);assert.equal(kept.points,null);
});

test('M-07: sat-out partial locks keep pending receipts and resolve legitimately; resolution cannot alter a pick or resolve a post-kickoff capture', {skip},async t=>{
  const w=await createCommunityWorld({migrations:ALL,games:2,troyBallots:false});t.after(()=>w.db.close());const [a]=w.state.games,{season,week}=w.state.league,sql=serviceSql(w.db);
  const pending=await save(w,'luke',{[a.id]:-4},{lockIn:[a.id]});assert.equal(pending.result.scoringReceipt.weekPoints,null);
  assert.equal(pending.result.scoringReceipt.games[0].reference.status,'pending');
  await sql('gtl_sit_out_week',{p_user:id('luke'),p_season:season,p_week:week,p_mode:'guess_spread'});
  await assert.rejects(save(w,'luke',{[a.id]:-4}),/GTL_COMMUNITY_SAT_OUT/);
  await lines(w);
  // storeLines captures one second before now: move it past the actual lock for an eligible D-27 resolution.
  await w.db.query(`update public.gtl_market_snapshots set created_at=clock_timestamp(),payload=replace(payload::text,$1,$2)::jsonb`,[
    (await w.db.query('select payload from public.gtl_market_snapshots limit 1')).rows[0].payload.fetchedAt,new Date().toISOString()]);
  assert.equal(await sql('gtl_resolve_pending_references',{p_season:season,p_week:week}),1);
  const receipt=await sql('gtl_guess_score_receipt',{p_user:id('luke'),p_season:season,p_week:week,p_mode:'guess_spread',p_now:new Date().toISOString()});
  assert.equal(receipt.weekPoints,8);assert.equal(await sql('gtl_resolve_pending_references',{p_season:season,p_week:week}),0);
  assert.equal(receipt.satOut,true);
  const otherMarket=await sql('gtl_guess_score_receipt',{p_user:id('luke'),p_season:season,p_week:week,p_mode:'guess_total',p_now:new Date().toISOString()});
  assert.equal(otherMarket.satOut,false,'sit-out is specific to this player, week and market');
  assert.equal(await sql('gtl_resolution_before_kickoff',{p_season:season,p_week:week,p_game:a.id,p_ref:{capturedAt:a.kickoff,observedAt:a.kickoff}}),false);
  const history=await sql('gtl_read_community_history',{p_user:id('luke'),p_season:season});
  const entry=history.weeks[0].entries.find(x=>x.userId===id('luke'));assert.equal(entry.status,'sat_out');assert.equal(entry.weekPoints,8);
});

test('M-07: migration is rerunnable, service-only, and rollback restores deadline rules without rewriting ballots', {skip},async t=>{
  const w=await createCommunityWorld({migrations:ALL,games:2,troyBallots:false});t.after(()=>w.db.close());const sql=serviceSql(w.db),[a]=w.state.games;
  await lines(w);await save(w,'luke',{[a.id]:-4},{lockIn:[a.id]});const before=await ballot(w,'luke');
  await w.db.exec(migrationSql(M07));assert.deepEqual(await ballot(w,'luke'),before);
  assert.equal((await sql('gtl_live_rules',{})).perGameScoring,true);
  for(const role of ['anon','authenticated'])assert.equal((await w.db.query('select has_function_privilege($1,$2,$3) ok',[role,'public.gtl_guess_score_receipt(uuid,integer,integer,text,timestamptz)','execute'])).rows[0].ok,false);
  await w.db.exec(fs.readFileSync(`${ROLLBACK_DIR}/${M07}`,'utf8'));
  assert.equal((await sql('gtl_live_rules',{})).lateWindow,'deadline');assert.deepEqual(await ballot(w,'luke'),before);
});

test('M-07: a pending per-game lock remains pending when the first qualifying capture is after kickoff', {skip},async t=>{
  const now=Date.now(),saved=new Date(now-7200000).toISOString();
  const w=await createCommunityWorld({migrations:ALL,games:2,troyBallots:false,prepare:s=>{
    s.league.deadline=new Date(now-3600000).toISOString();s.games[0].kickoff=s.league.deadline;s.games[1].kickoff=new Date(now+3600000).toISOString();
  }});t.after(()=>w.db.close());const [a]=w.state.games,{season,week}=w.state.league,sql=serviceSql(w.db);
  const pending=await sql('gtl_pending_reference',{p_saved:saved});
  const held={picks:{[a.id]:-4},submittedAt:null,updatedAt:saved,lockedAt:{[a.id]:saved},scoringReferences:{[a.id]:pending},guessRule:'per-game-v1'};
  await w.db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing',[id('luke'),season,week]);
  await w.db.exec('alter table public.gtl_weekly_ballots disable trigger user');
  await w.db.query('insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,$2,$3,$4,$5)',[id('luke'),season,week,'guess_spread',held]);
  await w.db.exec('alter table public.gtl_weekly_ballots enable trigger user');await lines(w);
  const later=await sql('gtl_resolve_pending_reference',{p_season:season,p_week:week,p_mode:'guess_spread',p_game_id:a.id,p_pending:pending});
  assert.equal(later,null,'the existing three-book validator also rejects captures at or after kickoff');
  assert.equal(await sql('gtl_resolve_pending_references',{p_season:season,p_week:week}),0);
  assert.deepEqual((await ballot(w,'luke')).ballot,held);
  const receipt=await sql('gtl_guess_score_receipt',{p_user:id('luke'),p_season:season,p_week:week,p_mode:'guess_spread',p_now:new Date().toISOString()});
  assert.equal(receipt.weekPoints,null);assert.equal(receipt.games[0].reference.status,'pending');
});
