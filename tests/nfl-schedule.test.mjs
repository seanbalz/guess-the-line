import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSlate, easternToUtc } from '../shared/nfl-schedule.mjs';
import { computeTeamRecords, parseScheduleCsv } from '../shared/team-records.mjs';

const csv = `game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location
2026_06_SEA_DEN,2026,REG,6,2026-10-15,Thursday,20:15,SEA,,DEN,,Home
2026_06_HOU_JAX,2026,REG,6,2026-10-18,Sunday,09:30,HOU,,JAX,,Neutral
2026_06_ARI_LA,2026,REG,6,2026-10-18,Sunday,16:05,ARI,,LA,,Home
2026_09_SEA_LA,2026,REG,9,2026-11-08,Sunday,13:00,SEA,20,LA,17,Home
2026_06_X_Y,2026,POST,6,2026-10-18,Sunday,13:00,SEA,,DEN,,Home`;

test('ET to UTC honors daylight saving', () => {
  assert.equal(easternToUtc('2026-10-15', '20:15'), '2026-10-16T00:15:00.000Z');
  assert.equal(easternToUtc('2026-11-08', '13:00'), '2026-11-08T18:00:00.000Z');
});

test('builds a regular-season slate with app codes, names, neutral flag and TNF deadline', () => {
  const slate = buildSlate(csv, 2026, 6);
  assert.equal(slate.deadline, '2026-10-16T00:15:00.000Z');
  assert.deepEqual(slate.games.map(g => [g.id, g.neutral]), [['SEA-DEN', false], ['HOU-JAX', true], ['ARI-LAR', false]]);
  assert.equal(slate.games[2].matchup, 'Arizona Cardinals @ Los Angeles Rams');
  assert.throws(() => buildSlate(csv, 2026, 7), /No 2026 Week 7/);
});

test('team records use the same app codes', () => {
  assert.deepEqual(computeTeamRecords(parseScheduleCsv(csv), 2026, 9).teams.LAR.home, { w: 0, l: 1, t: 0 });
});
