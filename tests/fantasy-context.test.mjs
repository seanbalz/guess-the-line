// Contract: matchup context ranks what defenses allowed under the selected scoring; samples under two games stay unranked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchupTable, ordinal } from '../shared/fantasy-context.mjs';

const zero = { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0 };
const allowed = (wr) => ({ QB: zero, RB: zero, WR: { ...zero, ...wr }, TE: zero });
const snapshot = { matchups: {
  AAA: [1, 2, 3, 4, 5].map(week => ({ week, opponent: 'X', allowed: allowed({ receptions: 10, receivingYards: 100 }) })),
  BBB: [1, 2, 3, 4, 5].map(week => ({ week, opponent: 'Y', allowed: allowed({ receptions: 0, receivingYards: 160 }) })),
  CCC: [1, 2, 3, 4, 5].map(week => ({ week, opponent: 'Z', allowed: allowed({ receptions: 10, receivingYards: 100 }) })),
  DDD: [{ week: 5, opponent: 'W', allowed: allowed({ receivingYards: 300 }) }],
} };

test('ranks run from most allowed, ties share a rank, and one game is not ranked', () => {
  const ppr = matchupTable(snapshot, 'WR', { scoring: 'ppr', passingTds: 4 });
  assert.equal(ppr.rows.get('AAA').recent, 20);
  assert.equal(ppr.rows.get('AAA').recentRank, 1);
  assert.equal(ppr.rows.get('CCC').recentRank, 1, 'equal displayed values share a rank');
  assert.equal(ppr.rows.get('BBB').recentRank, 3);
  assert.equal(ppr.rows.get('DDD').recent, null);
  assert.equal(ppr.rows.get('DDD').recentRank, null);
  assert.equal(ppr.rows.get('AAA').recentGames, 4);
  assert.equal(ppr.rows.get('AAA').seasonGames, 5);
});

test('scoring format changes the order (Standard puts the yardage defense first)', () => {
  const standard = matchupTable(snapshot, 'WR', { scoring: 'standard', passingTds: 4 });
  assert.equal(standard.rows.get('BBB').recentRank, 1);
  assert.equal(standard.rows.get('AAA').recentRank, 2);
});

test('kickers and schema 1 snapshots have no matchup table; ordinals read naturally', () => {
  assert.equal(matchupTable(snapshot, 'K', {}), null);
  assert.equal(matchupTable({}, 'WR', {}), null);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 32].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '32nd']);
});
