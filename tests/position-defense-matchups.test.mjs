import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPositionDefenseMatchups } from '../shared/position-defense-matchups.mjs';

const asOf = '2026-11-15T00:00:00Z';
const game = (defense, n, extra = {}) => ({ gameId: `${defense}-${n}`, defense, season: 2026,
  kickoff: `2026-10-${String(n).padStart(2, '0')}T18:00:00Z`, availableAt: `2026-10-${String(n + 1).padStart(2, '0')}T12:00:00Z`, complete: true, ...extra });
const row = (g, playerId, value, extra = {}) => ({ playerId, position: 'WR', opponent: g.defense,
  gameId: g.gameId, kickoff: g.kickoff, availableAt: g.availableAt, value, ...extra });
const calculate = (completedGames, rows, extra = {}) => buildPositionDefenseMatchups({ completedGames, rows, position: 'WR', season: 2026, asOf, ...extra });

test('ranks total stat allowed per defense game, not per player, with competition ties', () => {
  const games = ['A', 'B', 'C'].flatMap(d => [1, 2, 3].map(n => game(d, n)));
  const rows = games.flatMap(g => g.defense === 'A' ? [row(g, 'p1', 40), row(g, 'p2', 60)] : [row(g, 'p1', g.defense === 'B' ? 100 : 50)]);
  const before = JSON.stringify({ games, rows });
  const data = calculate(games, rows);
  assert.equal(data.status, 'available'); assert.equal(data.rankedDefenses, 3);
  assert.deepEqual(data.teams.map(t => [t.defense, t.meanAllowed, t.rank]), [['A', 100, 1], ['B', 100, 1], ['C', 50, 3]]);
  assert.equal(data.teams[0].sampleGames, 3); assert.equal(data.teams[0].playerAppearances, 6);
  assert.equal(JSON.stringify({ games, rows }), before);
});

test('true zeros require explicit complete coverage; unknown coverage never becomes zero', () => {
  const games = [game('A', 1), game('A', 2, { complete: false }), game('A', 3, { complete: undefined })];
  const [team] = calculate(games, []).teams;
  assert.equal(team.total, 0); assert.equal(team.meanAllowed, 0);
  assert.equal(team.sampleGames, 1); assert.equal(team.missingGames, 2); assert.equal(team.rank, null);
  assert.equal(team.status, 'insufficient-sample');
});

test('last5 selects calendar games before excluding incomplete observations', () => {
  const games = [1, 2, 3, 4, 5, 6].map(n => game('A', n, { complete: n !== 6 }));
  const data = calculate(games, games.map(g => row(g, 'p', 10)), { period: 'last5' });
  assert.equal(data.teams[0].sampleGames, 4); assert.equal(data.teams[0].selectedGames, 5);
  assert.equal(data.teams[0].total, 40); assert.equal(data.teams[0].missingGames, 1);
  assert.equal(data.teams[0].period.from, games[1].kickoff);
});

test('ignores future, other-season and unknown games, never infers player positions', () => {
  const valid = game('A', 1), wrongSeason = game('A', 2, { season: 2025 });
  const future = game('A', 3, { availableAt: '2026-12-01T00:00:00Z' });
  const games = [valid, wrongSeason, future];
  const data = calculate(games, [row(valid, 'p', 12), row(valid, 'rb', 80, { position: 'RB' }), row(wrongSeason, 'p', 800), row(future, 'p', 900)]);
  assert.equal(data.teams[0].total, 12); assert.equal(data.teams[0].selectedGames, 1);
  assert.equal(calculate([valid], [row(valid, 'p', 12, { position: null })]).teams[0].sampleGames, 0);
});

test('conflicting duplicates and malformed/future target rows invalidate a game; identical duplicates collapse', () => {
  const g = game('A', 1), r = row(g, 'p', 20);
  assert.equal(calculate([g], [r, { ...r }]).teams[0].total, 20);
  for (const invalid of [{ ...r, value: 30 }, { ...r, value: null }, { ...r, value: NaN },
    { ...r, availableAt: '2026-12-01T00:00:00Z' }, { ...r, kickoff: '2026-10-01T17:00:00Z' }]) {
    assert.equal(calculate([g], [r, invalid]).teams[0].sampleGames, 0);
  }
  assert.equal(calculate([g, { ...g, complete: false }], [r]).teams[0].sampleGames, 0);
  assert.equal(calculate([g], [r, { ...r, position: 'RB' }]).teams[0].sampleGames, 0);
});

test('invalid request fails closed and never creates a favorable label or forecast', () => {
  for (const change of [{ position: 'UNKNOWN' }, { season: null }, { period: 'best' }, { minGames: 1 }, { asOf: 'invalid' }]) {
    assert.deepEqual(calculate([], [], change).teams, []);
  }
  const g = game('A', 1);
  const result = calculate([g], [row(g, 'p', -2)]);
  assert.equal(result.teams[0].total, -2); // Signed stat losses are real, not censored.
  assert.equal(Object.hasOwn(result.teams[0], 'projection'), false);
  assert.equal(Object.hasOwn(result.teams[0], 'favorable'), false);
});
