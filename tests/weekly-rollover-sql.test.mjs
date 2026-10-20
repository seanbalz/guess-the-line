import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';

// Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MIGRATIONS = [
  '20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql',
  '20261008185738_gtl_manual_odds_collection.sql', '20261008192528_gtl_scoped_spread_benchmark.sql', '20261008200926_gtl_twelve_hour_odds_refresh.sql',
  '20261008240000_gtl_virtual_units.sql', '20261009005145_gtl_social_bet_tracker.sql', '20261009120000_gtl_community_feed.sql',
  '20261009130000_gtl_league_interest.sql', '20261009140000_gtl_d23_data_rule.sql', '20261009150000_gtl_auto_open_week.sql',
  '20261009170000_gtl_virtual_units_settlement.sql',
];
const SEAN = 30, TROY = 1, LUKE = 2;

test('private groups follow opened published weeks without rewriting historical state', { skip: PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.' }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  const now = Date.now(), iso = value => new Date(value).toISOString();
  // Every game kicked off four hours ago except the fifth, which is still an hour away.
  const state = seed(); state.league.deadline = iso(now - 5 * 3600000);
  state.games.forEach((game, index) => { game.kickoff = iso(now - 4 * 3600000 + (index === 4 ? 5 * 3600000 : 0)); });
  for (const file of MIGRATIONS) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file === MIGRATIONS[0]) {
      await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state]);
      for (const n of [SEAN, TROY, LUKE]) await db.query('insert into auth.users values($1)', [id(n)]);
      await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner'),($2,'sean-troy-luke','troy','player'),($3,'sean-troy-luke','luke','player')", [id(SEAN), id(TROY), id(LUKE)]);
    }
  }
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });

  await db.query('insert into gtl_profiles(user_id,display_name) values($1,$2)',[id(SEAN),'Fixture']);
  await db.exec(fs.readFileSync('supabase/migrations/20261008225607_gtl_reviewed_final_results.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261020211737_gtl_group_settlement_results.sql','utf8'));
  await as('service_role','select gtl_settle_virtual_units(2026,5,$1)',[{source:'fixture finals',sourceUrl:'https://example.test/finals',games:[{gameId:state.games[0].id,status:'final',home:21,away:14}]}]);
  const finals=(await as('service_role','select gtl_read_reviewed_results($1,$2) x',[id(SEAN),'sean-troy-luke'])).rows[0].x;
  assert.equal(finals.games[state.games[0].id].reviewType,'settlement');
  assert.equal(finals.games[state.games[0].id].home,21);
  const before=(await db.query('select state from gtl_leagues')).rows[0].state;
  const games=state.games.map(g=>({...g,kickoff:iso(now+3600000)}));
  await as('service_role','select gtl_publish_week($1,2026,6,$2,$3,$4)',[id(SEAN),games,iso(now+3600000),'fixture schedule']);
  const migration='supabase/migrations/20261020211626_gtl_private_current_week.sql';
  if(fs.existsSync(migration)) await db.exec(fs.readFileSync(migration,'utf8'));
  const context=(await as('service_role','select gtl_weekly_context($1,$2) c',[id(SEAN),'sean-troy-luke'])).rows[0].c;
  assert.equal(context.week,6);
  const future=state.games.map(g=>({...g,kickoff:iso(now+14*86400000)}));
  await as('service_role','select gtl_publish_week($1,2026,7,$2,$3,$4)',[id(SEAN),future,iso(now+14*86400000),'future fixture']);
  assert.equal((await as('service_role','select gtl_weekly_context($1,$2) c',[id(SEAN),'sean-troy-luke'])).rows[0].c.week,6,'never advance to unopened week');
  assert.equal(context.state.league.actualKickoff,null);
  assert.deepEqual(context.state.league.roster,before.league.roster);
  assert.deepEqual((await db.query('select state from gtl_leagues')).rows[0].state,before);
  await db.exec(fs.readFileSync('supabase/migrations/20261020211656_gtl_results_refresh_schedule.sql','utf8'));
  assert.equal((await db.query('select gtl_dispatch_results_refresh() x')).rows[0].x.status,'disabled');
  await db.query("insert into gtl_results_refresh_schedule(id,enabled,endpoint,authorized_by,season) values('nfl-results',true,'https://fixture.supabase.co/functions/v1/gtl-results-refresh',$1,2026)",[id(SEAN)]);
  const token='a'.repeat(64);
  await db.query("insert into gtl_results_refresh_runs(id,schedule_id,slot_start,capability_hash) values($1,'nfl-results',date_bin(interval '30 minutes',clock_timestamp(),timestamptz '2000-01-01'),encode(sha256(convert_to($2,'UTF8')),'hex'))",[id(800),token]);
  await assert.rejects(()=>as('service_role','select gtl_claim_results_refresh($1,$2)',['b'.repeat(64),id(800)]),/GTL_SCHEDULE_AUTH/);
  const claim=(await as('service_role','select gtl_claim_results_refresh($1,$2) x',[token,id(800)])).rows[0].x;
  assert.deepEqual(claim.scopes,[{season:2026,week:5}]);
  assert.equal((await as('service_role','select gtl_claim_results_refresh($1,$2) x',[token,id(800)])).rows[0].x.replay,true);
  assert.equal((await as('service_role','select gtl_complete_results_refresh($1,$2,$3) x',[id(800),claim.claim,'settlement_failed'])).rows[0].x.status,'failed');
  for(const role of ['anon','authenticated']) {
   await assert.rejects(()=>as(role,'select * from gtl_results_refresh_runs'),/permission denied/);
   await assert.rejects(()=>as(role,'select gtl_claim_results_refresh($1,$2)',[token,id(800)]),/permission denied/);
  }
  await assert.rejects(()=>as('service_role','select gtl_dispatch_results_refresh()'),/permission denied/);
  await assert.rejects(()=>as('service_role','select gtl_weekly_context($1,$2)',[id(999),'sean-troy-luke']),/GTL_FORBIDDEN/);
});
