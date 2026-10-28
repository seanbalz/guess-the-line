import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTeamRecords, formatRecord, matchupFacts, parseScheduleCsv, teamSeason } from '../shared/team-records.mjs';

const csv = `game_id,season,game_type,week,gameday,away_team,away_score,home_team,home_score,location,result
2026_01_SEA_DEN,2026,REG,1,2026-09-10,SEA,20,DEN,27,Home,7
2026_02_DEN_KC,2026,REG,2,2026-09-17,DEN,24,KC,24,Home,0
2026_03_SEA_JAX,2026,REG,3,2026-09-24,SEA,31,JAX,10,Neutral,-21
2026_04_DEN_SEA,2026,REG,4,2026-10-01,DEN,13,SEA,17,Home,4
2026_05_SEA_KC,2026,REG,5,2026-10-08,SEA,,KC,,Home,
2025_22_SEA_DEN,2025,POST,22,2026-01-20,SEA,30,DEN,0,Home,-30`;

test('computes overall, home and road records from finals only', () => {
  const r = computeTeamRecords(parseScheduleCsv(csv), 2026, 5);
  assert.equal(r.finals, 4);
  assert.deepEqual(r.teams.SEA, { overall: { w: 2, l: 1, t: 0 }, home: { w: 1, l: 0, t: 0 }, road: { w: 0, l: 1, t: 0 } });
  assert.deepEqual(r.teams.DEN, { overall: { w: 1, l: 1, t: 1 }, home: { w: 1, l: 0, t: 0 }, road: { w: 0, l: 1, t: 1 } });
  assert.deepEqual(r.teams.JAX.home, { w: 0, l: 0, t: 0 }, 'neutral site is not a home game');
  assert.deepEqual(r.teams.KC.overall, { w: 0, l: 0, t: 1 }, 'unplayed game is ignored; postseason excluded');
});

test('respects the through-week cutoff', () => {
  assert.deepEqual(computeTeamRecords(parseScheduleCsv(csv), 2026, 2).teams.SEA.overall, { w: 0, l: 1, t: 0 });
});

test('formats facts without tips', () => {
  const r = computeTeamRecords(parseScheduleCsv(csv), 2026, 5);
  assert.equal(formatRecord({ w: 3, l: 2, t: 0 }), '3-2');
  assert.equal(formatRecord({ w: 1, l: 1, t: 1 }), '1-1-1');
  assert.deepEqual(matchupFacts(r, 'SEA', 'DEN'), { away: 'SEA 2-1 · Road 0-1', home: 'DEN 1-1-1 · Home 1-0', as_of: 'as of Week 5' });
  assert.deepEqual(matchupFacts(r, 'SEA', 'JAX', { neutral: true }), { away: 'SEA 2-1', home: 'JAX 0-1', as_of: 'as of Week 5' });
  assert.equal(matchupFacts(r, 'SEA', 'XYZ').home, 'XYZ record unavailable');
});

test('rejects a file missing required columns', () => {
  assert.throws(() => parseScheduleCsv('game_id,season\n1,2026'), /missing/);
});

// D-62: teamSeason, the model behind POST /lines/teams. The fixture carries every market column the real nflverse file
// has, each with an unusual value no score, week or time can equal, so the market contract below can look for them.
const MARKETS = { spread_line: '13.75', total_line: '61.25', away_moneyline: '-175', home_moneyline: '155', away_spread_odds: '-104', home_spread_odds: '-116', over_odds: '-113', under_odds: '-107' };
const seasonCsv = [
  `game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location,result,total,${Object.keys(MARKETS).join(',')}`,
  // Out of week order on purpose: games come back ordered by week.
  '2026_02_DEN_SEA,2026,REG,2,2026-09-20,Sunday,16:25,DEN,20,SEA,20,Home,0,40',
  '2026_01_SEA_DEN,2026,REG,1,2026-09-13,Sunday,16:05,SEA,24,DEN,17,Home,-7,41',
  '2026_03_SEA_LA,2026,REG,3,2026-09-27,Sunday,09:30,SEA,10,LA,27,Neutral,17,37',
  '2026_04_LA_DEN,2026,REG,4,2026-10-04,Sunday,13:00,LA,31,DEN,3,Home,-28,34',
  '2026_05_DEN_SEA,2026,REG,5,2026-10-11,Sunday,20:20,DEN,,SEA,,Home,,',
  '2026_05_XYZ_LA,2026,REG,5,2026-10-11,Sunday,13:00,XYZ,9,LA,0,Home,-9,9',
  '2025_01_SEA_DEN,2025,REG,1,2025-09-07,Sunday,16:05,SEA,0,DEN,50,Home,50,50',
  '2026_19_SEA_DEN,2026,POST,19,2027-01-10,Sunday,16:30,SEA,40,DEN,0,Home,-40,40',
  '2027_20_SEA_DEN,2027,POST,20,2028-01-17,Sunday,16:30,SEA,40,DEN,0,Home,-40,40',
].map((line, i) => (i ? `${line},${Object.values(MARKETS).join(',')}` : line)).join('\n');
const seasonRows = parseScheduleCsv(seasonCsv);
const g = (week, gameId, opponent, home, neutral, kickoff, pf, pa, result) => ({ week, gameId, opponent, home, neutral, kickoff, final: pf !== null, pf, pa, result });

test('teamSeason contract: records, points and every game for one season, finals scored and the rest with kickoff only', () => {
  const s = teamSeason(seasonRows, { season: 2026 });
  assert.deepEqual(Object.keys(s), ['season', 'throughWeek', 'finals', 'teams']);
  assert.equal(s.season, 2026);
  assert.equal(s.finals, 4, 'four REG finals; the unplayed game, the unknown team, 2025 and both postseason rows count nothing');
  assert.equal(s.throughWeek, 4, 'the highest week with a final: Week 5 has none once the unknown-team row is skipped');
  assert.deepEqual(Object.keys(s.teams), ['DEN', 'LAR', 'SEA'], 'app codes (LA is LAR), and no team for an unknown code');
  assert.deepEqual(s.teams.SEA, {
    overall: { w: 1, l: 1, t: 1 }, home: { w: 0, l: 0, t: 1 }, road: { w: 1, l: 0, t: 0 }, pointsFor: 54, pointsAgainst: 64,
    games: [
      g(1, 'SEA-DEN', 'DEN', false, false, '2026-09-13T20:05:00.000Z', 24, 17, 'W'),
      g(2, 'DEN-SEA', 'DEN', true, false, '2026-09-20T20:25:00.000Z', 20, 20, 'T'),
      g(3, 'SEA-LAR', 'LAR', false, true, '2026-09-27T13:30:00.000Z', 10, 27, 'L'),
      { ...g(5, 'DEN-SEA', 'DEN', true, false, '2026-10-12T00:20:00.000Z', null, null, null), final: false },
    ],
  });
  assert.deepEqual(s.teams.DEN.overall, { w: 0, l: 2, t: 1 }, 'a tie counts for both sides');
  assert.deepEqual([s.teams.DEN.home, s.teams.DEN.road, s.teams.DEN.pointsFor, s.teams.DEN.pointsAgainst], [{ w: 0, l: 2, t: 0 }, { w: 0, l: 0, t: 1 }, 40, 75]);
  // Neutral site: the listed home team wins it, which counts overall only; LAR's other game is a road win.
  assert.deepEqual([s.teams.LAR.overall, s.teams.LAR.home, s.teams.LAR.road], [{ w: 2, l: 0, t: 0 }, { w: 0, l: 0, t: 0 }, { w: 1, l: 0, t: 0 }]);
  assert.deepEqual(s.teams.LAR.games.map(game => [game.week, game.gameId, game.home, game.neutral]), [[3, 'SEA-LAR', true, true], [4, 'LAR-DEN', false, false]]);
});

test('teamSeason contract: no market column reaches the rows or the output, for any game, final or not', () => {
  for (const row of seasonRows) assert.ok(Object.keys(row).every(key => !Object.hasOwn(MARKETS, key) && key !== 'total' && key !== 'result'), row.game_id);
  const keys = new Set(), numbers = new Set();
  const walk = value => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) { keys.add(key); walk(inner); }
    else if (typeof value === 'number') numbers.add(value);
  };
  walk(teamSeason(seasonRows));
  for (const key of keys) assert.doesNotMatch(key, /spread|total|line|moneyline|odds|price|book/i, key);
  for (const value of Object.values(MARKETS)) assert.ok(!numbers.has(Number(value)), `market value ${value} is not in the output`);
});

test('teamSeason contract: another season is its own, the default is the newest REG season, a season without rows is empty', () => {
  assert.deepEqual(teamSeason(seasonRows), teamSeason(seasonRows, { season: 2026 }), '2027 has only a postseason row');
  const last = teamSeason(seasonRows, { season: 2025 });
  assert.deepEqual([last.throughWeek, last.finals, last.teams.SEA.overall, last.teams.DEN.overall], [1, 1, { w: 0, l: 1, t: 0 }, { w: 1, l: 0, t: 0 }]);
  assert.deepEqual(teamSeason(seasonRows, { season: 2030 }), { season: 2030, throughWeek: 0, finals: 0, teams: {} });
  assert.deepEqual(teamSeason([]), { season: null, throughWeek: 0, finals: 0, teams: {} });
});

test('teamSeason agrees with computeTeamRecords, and a file without kickoff columns still parses with kickoff null', () => {
  const old = computeTeamRecords(parseScheduleCsv(csv), 2026, 25), now = teamSeason(parseScheduleCsv(csv), { season: 2026 });
  assert.equal(now.finals, old.finals);
  for (const [code, team] of Object.entries(old.teams)) {
    for (const split of ['overall', 'home', 'road']) assert.deepEqual(now.teams[code][split], team[split], `${code} ${split}`);
  }
  assert.ok(Object.values(now.teams).every(team => team.games.every(game => game.kickoff === null)));
});
