// M-12 / stage 42: Virtual Units weekly and season boards, on the real handler with every migration (ALL) on local
// PGlite. Contracts:
// - each roster player's SQL week totals equal shared/bets-qual.mjs `weekFromPicks` over the same rows (parity);
// - /bets/board ranks qualified players only, by ROI, then net units, then wins, with "T-n" ties and you marked;
// - a private league's roster filters the board; a player outside it cannot read it;
// - /bets/season lists every published week and ranks anyone qualified in at least one week; `who` keeps one
//   roster player and refuses anyone else; bad bodies are refused;
// - no reply carries a line, price or book; all three functions are service-role only;
// - before the apply, the hosted schema keeps /bets/read working and the new routes answer the generic 503.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL, HOSTED, NOT_HOSTED, version } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { serviceSql } from './helpers/guess-week.mjs';
import { weekFromPicks } from '../shared/bets-qual.mjs';

const MIGRATION = '20261026230000_gtl_bets_boards.sql';
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed.';
const USER = who => ACCOUNTS[who].id;
const FUNCTIONS = ['gtl_bets_week_rows(integer,integer,uuid[])', 'gtl_read_bets_board(uuid,integer,integer,text)', 'gtl_read_bets_season(uuid,integer,text,uuid)'];

test('M-12 is written and not applied yet', () => {
  assert.ok(ALL.includes(MIGRATION));
  assert.ok(NOT_HOSTED.includes(version(MIGRATION)), 'listed in NOT_HOSTED until Sean says "apply M-12"');
});

/** Seeds two published weeks of Virtual Units picks: the open week and the one before it, on the same games. */
async function seed(world) {
  const { db, state } = world, { season, week } = state.league, [g0, g1] = state.games.map(g => g.id);
  const signature = (await db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
  await db.query('insert into public.gtl_weekly_slates(season,week,signature) values($1,$2,$3) on conflict do nothing', [season, week - 1, signature]);
  const now = new Date().toISOString();
  const rows = [
    // The open week. Troy: 3 picks, two settled (ROI from 2U risked). Sean: one 3U pick, qualified, nothing settled.
    // Luke: two picks and 2U, not qualified.
    ['troy', week, g0, 'spread', 1, 'win', 0.91], ['troy', week, g0, 'total', 1, 'loss', null], ['troy', week, g1, 'spread', 1, 'pending', null],
    ['sean', week, g1, 'total', 3, 'pending', null],
    ['luke', week, g0, 'spread', 1, 'win', 0.83], ['luke', week, g1, 'total', 1, 'void', null],
    // The week before: Luke qualifies (three picks, a voided one keeps its credit); Troy's single pick does not.
    ['luke', week - 1, g0, 'spread', 1, 'win', 1.2], ['luke', week - 1, g0, 'total', 1, 'push', 0], ['luke', week - 1, g1, 'spread', 0.5, 'void', null],
    ['troy', week - 1, g1, 'total', 2, 'loss', null],
  ];
  for (const [who, w, gameId, market, units, status, net] of rows) {
    await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing', [USER(who), season, w]);
    await db.query('insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection) values($1,$2,$3,$4,$5,$6)',
      [USER(who), season, w, gameId, market, { gameId, market, side: market === 'spread' ? 'home' : 'over', line: market === 'spread' ? -6.5 : 47.5, odds: -110, units, source: 'DraftKings', quotedAt: now, selectedAt: now }]);
    if (status !== 'pending') await db.query('update public.gtl_virtual_units_picks set status=$1,result=$2 where user_id=$3 and season=$4 and week=$5 and game_id=$6 and market=$7',
      [status, net === null ? null : { netUnits: net }, USER(who), season, w, gameId, market]);
  }
  return { season, week };
}

const noTerms = (reply, label) => assert.doesNotMatch(JSON.stringify(reply), /"(line|odds|source|book|quotedAt|selection)"|-6\.5|47\.5|DraftKings/, label);

test('board and season: parity, order, roster filter, who, refusals, no terms, service-only grants', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world, sql = serviceSql(db);
  const { season, week } = await seed(world);

  for (const signature of FUNCTIONS) {
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${signature}`, 'EXECUTE'])).rows[0].ok, true, signature);
    for (const role of ['anon', 'authenticated'])
      assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${signature}`);
  }

  // Parity: the SQL totals are the shared arithmetic over the same rows.
  const users = Object.values(ACCOUNTS).map(a => a.id);
  for (const w of [week, week - 1]) {
    const totals = await sql('gtl_bets_week_rows', { p_season: season, p_week: w, p_users: users });
    for (const row of totals) {
      const picks = (await db.query('select status,selection,result from public.gtl_virtual_units_picks where user_id=$1 and season=$2 and week=$3', [row.userId, season, w])).rows;
      const { roi, qualified, ...sums } = weekFromPicks(picks);
      const { userId, ...fromSql } = row;
      assert.deepEqual(Object.fromEntries(Object.entries(fromSql).map(([k, v]) => [k, Math.round(Number(v) * 100) / 100])), sums, `week ${w} ${userId}`);
    }
  }

  // The open week's board: Troy (3 picks, +0.91 −1 = −0.09 over 2U) and Sean (one 3U pick, ROI —); Luke is unqualified.
  const board = await world.api('luke', 'bets/board', {});
  assert.equal(board.status, 200, JSON.stringify(board.body));
  noTerms(board.body, '/bets/board');
  assert.deepEqual(board.body.board.map(row => [row.userId, row.rankLabel, row.netUnits, row.roi]), [[USER('troy'), '1', -0.09, -4.5], [USER('sean'), '2', 0, null]]);
  assert.deepEqual(board.body.unranked.map(row => [row.userId, row.you, row.qualified]), [[USER('luke'), true, false]]);
  assert.equal(board.body.week, week);
  assert.equal(board.body.roster.length, 3);

  // A private league's roster filters the board; a player outside it is refused.
  const other = structuredClone(world.state); other.league.id = 'second-group';
  await db.query('insert into public.gtl_leagues(id,state,created_by) values($1,$2,$3)', ['second-group', other, USER('sean')]);
  for (const [who, role] of [['sean', 'commissioner'], ['luke', 'player']])
    await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'second-group',$2,$3)", [USER(who), `u_${USER(who).replaceAll('-', '')}`, role]);
  const scoped = await world.api('luke', 'bets/board', { leagueId: 'second-group' });
  assert.equal(scoped.status, 200, JSON.stringify(scoped.body));
  assert.deepEqual(scoped.body.board.map(row => row.userId), [USER('sean')], 'Troy is not on this roster');
  assert.equal((await world.api('troy', 'bets/board', { leagueId: 'second-group' })).status, 400, 'outside the league');

  // The season: both weeks, and the season board (anyone qualified once; every week counts).
  const seasonReply = await world.api('luke', 'bets/season', {});
  assert.equal(seasonReply.status, 200, JSON.stringify(seasonReply.body));
  noTerms(seasonReply.body, '/bets/season');
  assert.deepEqual(seasonReply.body.weeks.map(w => w.week), [week - 1, week]);
  // Luke: +1.2 +0 +0.83 over 3U = +2.03, 67.67%; Troy: +0.91 −1 −2 over 4U = −2.09; Sean: nothing settled.
  assert.deepEqual(seasonReply.body.board.map(row => [row.userId, row.netUnits, row.roi, row.qualifiedWeeks]),
    [[USER('luke'), 2.03, 67.67, 1], [USER('troy'), -2.09, -52.25, 1], [USER('sean'), 0, null, 1]]);
  const troySeason = await world.api('luke', 'bets/season', { who: USER('troy') });
  assert.equal(troySeason.status, 200);
  assert.deepEqual(troySeason.body.weeks.map(w => w.rows.map(r => r.userId)), [[USER('troy')], [USER('troy')]]);
  assert.equal((await world.api('luke', 'bets/season', { who: '00000000-0000-4000-8000-000000000099' })).status, 400, 'who outside the roster');

  for (const [route, body] of [['bets/board', { season }], ['bets/board', { extra: 1 }], ['bets/season', { season: 1999 }], ['bets/season', { who: 'not-a-uuid' }], ['bets/season', { week }]])
    assert.equal((await world.api('luke', route, body)).status, 400, `${route} ${JSON.stringify(body)}`);
});

test('before the apply: /bets/read keeps working and the new routes answer the generic 503', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: HOSTED, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  assert.ok(!HOSTED.includes(MIGRATION));
  assert.equal((await world.api('luke', 'bets/read', {})).status, 200);
  for (const route of ['bets/board', 'bets/season']) {
    const reply = await world.api('luke', route, {});
    assert.equal(reply.status, 503, `${route}: ${JSON.stringify(reply.body)}`);
    assert.deepEqual(Object.keys(reply.body), ['error']);
  }
});
