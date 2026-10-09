import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTeamRecords, formatRecord, matchupFacts, parseScheduleCsv } from '../shared/team-records.mjs';

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
