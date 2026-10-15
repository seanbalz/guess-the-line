import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ALL, NOT_HOSTED, version } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, id, pgliteAvailable, storeBookLines } from './cloud-browser/community-world.mjs';
import { serviceSql } from './helpers/guess-week.mjs';

const MIGRATION = '20261015190820_gtl_bets_read.sql';
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed.';
const USER = who => ACCOUNTS[who].id;

test('M-10 remains unapplied until the hosted gate and has its own Bets reader', () => {
  assert.ok(ALL.includes(MIGRATION));
  assert.ok(NOT_HOSTED.includes(version(MIGRATION)));
});

test('M-10 service-only table and functions deny browser roles', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: ALL, games: 1, troyBallots: false });
  t.after(() => world.db.close());
  const signatures = [
    'gtl_bets_context(uuid,integer,integer,text)',
    'gtl_read_bets(uuid,integer,integer,text,timestamptz)',
    'gtl_read_bets_market(uuid,text,text,integer,integer,timestamptz)',
  ];
  for (const signature of signatures) {
    assert.equal((await world.db.query('select has_function_privilege($1,$2,$3) ok',
      ['service_role', `public.${signature}`, 'EXECUTE'])).rows[0].ok, true);
    for (const role of ['anon', 'authenticated'])
      assert.equal((await world.db.query('select has_function_privilege($1,$2,$3) ok',
        [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${signature}`);
  }
  assert.equal((await world.db.query("select relrowsecurity from pg_class where oid='public.gtl_bet_versions'::regclass")).rows[0].relrowsecurity, true);
  for (const role of ['anon', 'authenticated'])
    assert.equal((await world.db.query('select has_table_privilege($1,$2,$3) ok',
      [role, 'public.gtl_bet_versions', 'SELECT'])).rows[0].ok, false);
});

test('community account-week Bets read, group reuse, qualification, and game/market line lock', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const { db, state } = world, sql = serviceSql(db), { season, week } = state.league, game = state.games[0].id;
  const now = new Date().toISOString();
  const spread = Object.fromEntries(state.games.map(g => [g.id, -13.5]));
  const total = Object.fromEntries(state.games.map(g => [g.id, 51.5]));
  await storeBookLines(world, { spread, total });
  await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing', [USER('troy'), season, week]);
  const selection = { gameId: game, market: 'spread', side: 'home', line: -13.5, odds: -110, units: 1.5,
    source: 'DraftKings', quotedAt: now, selectedAt: now, riskDollars: 150 };
  await db.query('insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection) values($1,$2,$3,$4,$5,$6)',
    [USER('troy'), season, week, game, 'spread', selection]);
  await db.query("update public.gtl_virtual_units_picks set status='win',result=$1 where user_id=$2 and game_id=$3",
    [{ netUnits: 1.36 }, USER('troy'), game]);
  const read = (who, league = null) => sql('gtl_read_bets', { p_user: USER(who), p_season: season, p_week: week, p_league: league, p_now: now });

  const closed = await read('luke');
  assert.equal(closed.bets.length, 1);
  assert.deepEqual(closed.bets[0].selection, { side: 'home', units: 1.5 },
    'friend side and units are visible but the saved line and price are closed');
  assert.equal(closed.bets[0].status, null, 'a settled outcome stays closed with its line');
  assert.equal(closed.bets[0].result, null);
  assert.equal(closed.bets[0].createdAt, null);
  assert.equal(closed.bets[0].updatedAt, null);
  assert.equal(closed.markets[game].spread.visible, false);
  assert.equal(closed.markets[game].total.visible, false);
  const closedApi = await world.api('luke', 'bets/read', {});
  assert.equal(closedApi.status, 200);
  assert.equal(JSON.stringify(closedApi.body).includes('-13.5'), false, 'the closed opponent line is absent from the API');
  assert.deepEqual(closed.faces[game], [USER('troy')]);
  assert.deepEqual(closed.qualification.find(row => row.userId === USER('troy')).units, 1.5);
  assert.deepEqual(closed.qualification.find(row => row.userId === USER('troy')).qualified, false);
  assert.equal((await read('troy')).bets[0].selection.line, -13.5, 'owner always sees saved terms');
  const afterKickoff = await sql('gtl_read_bets', { p_user: USER('luke'), p_season: season, p_week: week,
    p_league: null, p_now: new Date(Date.parse(state.games[0].kickoff) + 1000).toISOString() });
  assert.equal(afterKickoff.bets[0].selection.line, -13.5, 'kickoff opens this game without a Guess lock-in');
  assert.equal(afterKickoff.bets[0].status, 'win');
  assert.equal(afterKickoff.markets[game].total.visible, true, 'kickoff opens the other market of this game too');

  const second = structuredClone(state);
  second.league.id = 'second-group';
  await db.query('insert into public.gtl_leagues(id,state,created_by) values($1,$2,$3)', ['second-group', second, USER('sean')]);
  await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'second-group',$2,'player')",
    [USER('troy'), `u_${USER('troy').replaceAll('-', '')}`]);
  assert.equal((await read('luke', 'sean-troy-luke')).bets.length, 1);
  assert.equal((await read('luke', 'second-group')).bets.length, 1, 'same account bet appears in both group filters');

  const newcomer = id(4);
  await db.query('insert into auth.users values($1)', [newcomer]);
  await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [newcomer, 'New Fixture']);
  const communityOnly = await sql('gtl_read_bets', { p_user: newcomer, p_season: null, p_week: null, p_league: null, p_now: now });
  assert.equal(communityOnly.published, true);
  assert.equal(communityOnly.roster.length, 4);
  await assert.rejects(sql('gtl_read_bets', { p_user: id(5), p_season: null, p_week: null, p_league: null, p_now: now }), /GTL_COMMUNITY_MEMBER/);

  const market = args => sql('gtl_read_bets_market', { p_user: USER('luke'), p_game: game, p_market: 'spread', p_season: season, p_week: week, p_now: now, ...args });
  assert.deepEqual(Object.keys(await market()).sort(), ['visible', 'season', 'week', 'gameId', 'market'].sort(),
    'closed market has only scope and visible flag');
  await db.query("insert into public.gtl_weekly_optouts(user_id,season,week,mode) values($1,$2,$3,'guess_spread')", [USER('luke'), season, week]);
  const opened = await read('luke');
  assert.equal(opened.bets[0].selection.line, -13.5);
  assert.equal(opened.markets[game].spread.visible, true);
  assert.ok(opened.markets[game].spread.quotes.length >= 6, 'retained named-book quotes are available');
  assert.equal(opened.markets[game].total.visible, false, 'opening Spread does not reveal Total');
  const api = await world.api('luke', 'bets/read', {});
  assert.equal(api.status, 200, JSON.stringify(api.body));
  assert.equal(api.body.bets[0].selection.line, -13.5);
  assert.equal(api.body.markets[game].total.visible, false);
  assert.equal(api.body.markets[game].spread.offers.home.book, 'betmgm', 'stable best-offer tie break');
  const nextSpread = Object.fromEntries(state.games.map(g => [g.id, -12.5]));
  await storeBookLines(world, { spread: nextSpread, total }, { capturedAt: Date.now() - 20_000 });
  const updated = await world.api('luke', 'bets/read', {});
  assert.equal(updated.status, 200);
  assert.equal(updated.body.markets[game].spread.offers.home.line, -12.5,
    'the button follows the newest retained named-book quote');
  assert.equal(updated.body.bets[0].selection.line, -13.5,
    'a placed pick keeps its exact saved line until the owner edits it');
  const signature = (await db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
  for (let n = 0; n < 21; n += 1) {
    const key = randomUUID();
    const captured = new Date(Date.now() - 19_000 + n * 500).toISOString();
    await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,$4,$5,$6)",
      [key, USER('sean'), randomUUID(), season, week, signature]);
    await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,$2,$3,$4,$5,$6)',
      [key, season, week, signature, { games: [] }, captured]);
  }
  const afterOmissions = await world.api('luke', 'bets/read', {});
  assert.equal(afterOmissions.status, 200);
  assert.equal(afterOmissions.body.markets[game].spread.offers.home.line, -12.5,
    '21 newer incomplete saves do not make the last valid named-book quote unavailable');
});
