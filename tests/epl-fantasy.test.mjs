// Contract: fantasy points are computed from Sleeper raw stat counts times the league's position-prefixed
// scoring_settings (pos_<gk|d|m|f>_<stat>); a starter with no projection row is null ("No projection"), never NaN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playerPoints, positionOf, teamProjection, winChance, seasonHigh, topScorers, beatProjection } from '../shared/epl-fantasy.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/epl-fantasy-mw.json', import.meta.url), 'utf8'));

test('playerPoints multiplies raw stats by the position-prefixed scoring keys', () => {
  assert.equal(playerPoints({ g: 1, sot: 2, min: 90 }, 'f', { pos_f_g: 9, pos_f_sot: 2, pos_f_min: 0 }), 13);
});

test('playerPoints ignores unknown stat keys, other positions and pre-prefixed stat copies', () => {
  const scoring = { pos_f_g: 9, pos_m_g: 7 };
  assert.equal(playerPoints({ g: 1, xg: 0.4, pos_f_g: 1, pts_std: 19.5 }, 'f', scoring), 9);
  assert.equal(playerPoints({ g: 1 }, 'm', scoring), 7);
  assert.equal(playerPoints({ constructor: 1, g: 'x', sot: NaN }, 'f', { pos_f_sot: 2 }), 0);
});

test('playerPoints rounds to 2 dp and is 0 for empty input', () => {
  assert.equal(playerPoints({ clr: 3, sv: 0.333 }, 'gk', { pos_gk_clr: 0.25, pos_gk_sv: 2 }), 1.42);
  assert.equal(playerPoints(undefined, 'd', {}), 0);
  assert.equal(playerPoints({ g: 1 }, null, { pos_f_g: 9 }), 0);
});

test('playerPoints reproduces Sleeper projection totals for the fixture players at their stored position', () => {
  for (const [id, stats] of Object.entries(fixture.projections)) {
    const pos = positionOf(fixture.players[id]);
    assert.equal(playerPoints(stats, pos, fixture.scoring), stats.pts_std, id);
  }
});

test('positionOf uses the first fantasy position, or the scored position when the snapshot stores one', () => {
  assert.equal(positionOf({ fantasy_positions: ['F', 'M'] }), 'f');
  assert.equal(positionOf({ fantasy_positions: ['GK'] }), 'gk');
  assert.equal(positionOf({ fantasy_positions: ['D', 'M'] }), 'd');
  assert.equal(positionOf({ fantasy_positions: ['F', 'M'], position: 'M' }), 'm');
  assert.equal(positionOf({ fantasy_positions: ['TEAM'] }), null);
  assert.equal(positionOf({ fantasy_positions: [] }), null);
  assert.equal(positionOf({}), null);
  assert.equal(positionOf(null), null);
});

test('teamProjection marks a starter with no projection null and leaves it out of the total', () => {
  const starters = [...Object.keys(fixture.projections), '9999'];
  const players = { ...fixture.players, 9999: { fantasy_positions: ['M'] } };
  const out = teamProjection(starters, fixture.projections, players, fixture.scoring);
  assert.deepEqual(out.rows, [
    { playerId: '1005', points: 2.78 },
    { playerId: '1008', points: 3.94 },
    { playerId: '1716', points: 9.84 },
    { playerId: '9999', points: null },
  ]);
  assert.equal(out.total, 16.56);
  assert.ok(!Number.isNaN(out.total));
});

test('teamProjection scores a player at the position stored in that week\'s snapshot', () => {
  const stats = fixture.projections['1716'];
  const asM = teamProjection(['1716'], fixture.projections, { 1716: { fantasy_positions: ['M'] } }, fixture.scoring);
  const asF = teamProjection(['1716'], fixture.projections, { 1716: { fantasy_positions: ['F'] } }, fixture.scoring);
  assert.equal(asM.total, 9.84);
  assert.equal(asF.total, playerPoints(stats, 'f', fixture.scoring));
  assert.notEqual(asF.total, asM.total);
});

test('teamProjection with no position or empty inputs is null rows and a zero total', () => {
  assert.deepEqual(teamProjection(['1005'], fixture.projections, {}, fixture.scoring), { total: 0, rows: [{ playerId: '1005', points: null }] });
  assert.deepEqual(teamProjection(undefined, undefined, undefined, undefined), { total: 0, rows: [] });
});

test('winChance is the normal probability of A outscoring B with independent sigma-18 scores', () => {
  assert.equal(winChance(104.2, 98.6), 0.587);
  assert.equal(winChance(98.6, 104.2), 0.413);
  assert.equal(winChance(77.7, 77.7), 0.5);
  assert.equal(winChance(0, 0), 0.5);
  assert.equal(winChance(110, 90, 10), 0.921);
  assert.equal(winChance(300, 0), 1);
  assert.equal(winChance(0, 300), 0);
  assert.equal(winChance(null, 90), null);
  assert.equal(winChance(100, 90, 0), 1);
});

test('seasonHigh returns the highest weekly score, the earliest on a tie, or null', () => {
  assert.equal(seasonHigh([]), null);
  assert.equal(seasonHigh(undefined), null);
  const weeks = [
    { week: 1, ownerId: 'a', points: 90 },
    { week: 2, ownerId: 'b', points: 120.5 },
    { week: 3, ownerId: 'a', points: null },
    { week: 4, ownerId: 'c', points: 120.5 },
  ];
  assert.deepEqual(seasonHigh(weeks), { week: 2, ownerId: 'b', points: 120.5 });
  assert.equal(seasonHigh([{ week: 1, ownerId: 'a', points: null }]), null);
});

test('topScorers keeps each owner\'s highest-scoring player and skips null points', () => {
  const rows = [
    { ownerId: 'a', playerId: '1', points: 4 },
    { ownerId: 'a', playerId: '2', points: 11.5 },
    { ownerId: 'b', playerId: '3', points: null },
    { ownerId: 'b', playerId: '4', points: 2 },
    { ownerId: 'a', playerId: '5', points: 11.5 },
    { ownerId: 'c', playerId: '6', points: null },
  ];
  const out = topScorers(rows);
  assert.deepEqual({ ...out }, { a: { playerId: '2', points: 11.5 }, b: { playerId: '4', points: 2 } });
  assert.equal(topScorers([{ ownerId: 'constructor', playerId: '7', points: 1 }]).constructor.playerId, '7');
});

test('beatProjection is actual minus projected to 2 dp', () => {
  assert.equal(beatProjection(104.3, 98.6), 5.7);
  assert.equal(beatProjection(90, 98.61), -8.61);
  assert.equal(beatProjection(50, 50), 0);
});
