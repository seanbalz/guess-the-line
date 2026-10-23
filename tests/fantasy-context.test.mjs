// Contract: matchup context ranks what defenses allowed under the selected scoring; samples under two games stay unranked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchupTable, ordinal, opponentOf, gameIdFor, kickoffWindow, impliedTotals, lockSentence, describePlayerContext } from '../shared/fantasy-context.mjs';

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

const wr = { id: 'p', name: 'P', team: 'SEA', position: 'WR', weekly: { status: 'scheduled', opponent: '@ DEN', kickoff: '2026-10-25T20:25:00Z', stats: {} } };
const visible = (spread, total) => ({ id: 'SEA-DEN', spread: { visible: true, value: spread, capturedAt: '2026-10-25T13:15:00Z', bookCount: 3 }, total: { visible: true, value: total, capturedAt: '2026-10-25T13:15:00Z', bookCount: 3 } });

test('opponent and game id follow the lines id format (away-home)', () => {
  assert.deepEqual(opponentOf(wr), { opponent: 'DEN', home: false });
  assert.equal(gameIdFor(wr), 'SEA-DEN');
  assert.equal(gameIdFor({ ...wr, weekly: { ...wr.weekly, opponent: 'vs DEN' } }), 'DEN-SEA');
  assert.equal(opponentOf({ weekly: { opponent: null } }), null);
});

test('kickoff windows in Eastern time', () => {
  assert.deepEqual(['2026-10-23T00:15:00Z', '2026-10-25T13:30:00Z', '2026-10-25T17:00:00Z', '2026-10-25T20:25:00Z', '2026-10-26T00:20:00Z', '2026-10-27T00:15:00Z'].map(kickoffWindow),
    ['Thu night', 'International', 'Sun early', 'Sun late', 'Sun night', 'Mon night']);
  assert.equal(kickoffWindow('not a date'), null);
});

test('implied totals only when both markets are visible; signed home spread', () => {
  assert.deepEqual(impliedTotals(visible(-3, 47)), { home: 25, away: 22, capturedAt: '2026-10-25T13:15:00Z', bookCount: 3 });
  assert.deepEqual(impliedTotals({ spread: { visible: false }, total: { visible: true, value: 47 } }), { locked: ['spread'] });
  assert.deepEqual(impliedTotals({ spread: { visible: false }, total: { visible: false } }), { locked: ['spread', 'total'] });
  assert.deepEqual(impliedTotals({ spread: { visible: true, value: null }, total: { visible: true, value: 47 } }), { missing: true });
  assert.equal(lockSentence('SEA-DEN', ['spread', 'total']), 'Lock your SEA–DEN spread and total guesses to see the implied team total.');
  assert.equal(lockSentence('SEA-DEN', ['total']), 'Lock your SEA–DEN total guess to see the implied team total.');
});

test('player context: away team total, lock line, weather and matchup text', () => {
  const lines = { status: 'ready', games: new Map([['SEA-DEN', visible(-3, 47)]]) };
  const wind = { attribution: { text: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' },
    games: { 'SEA-DEN': { status: 'forecast', wind: { windMph: 14.2, gustMph: 22.4, precipitationProbability: 40 } } } };
  const matchups = { WR: { rows: new Map([['DEN', { recent: 24.06, recentRank: 3, recentGames: 4, season: 22, seasonRank: 5, seasonGames: 6 }]]) } };
  const context = describePlayerContext(wr, { matchups, lines, wind, scoringLabel: 'Half PPR' });
  assert.equal(context.pill, '@ DEN · Sun late · 22.0');
  assert.equal(context.implied.value, 22);
  assert.equal(context.matchup, 'DEN allows the 3rd-most Half PPR points to WRs · last 4 games (24.1 per game)');
  assert.equal(context.seasonMatchup, 'Season: 5th-most (22.0 per game, 6 games)');
  assert.equal(context.weather, 'Wind 14 mph, gusts 22 · Rain 40%');
  const locked = describePlayerContext(wr, { matchups, lines: { status: 'ready', games: new Map([['SEA-DEN', { spread: { visible: false }, total: { visible: false } }]]) }, wind: null, scoringLabel: 'PPR' });
  assert.equal(locked.pill, '@ DEN · Sun late');
  assert.equal(locked.lock, 'Lock your SEA–DEN spread and total guesses to see the implied team total.');
  assert.equal(locked.implied, null);
  assert.equal(describePlayerContext({ ...wr, weekly: { status: 'bye', opponent: null } }, {}), null);
});

test('a hidden market never yields a number: lineAtGuess on the viewer\'s own pick is not read', () => {
  const game = { id: 'SEA-DEN', spread: { visible: false }, total: { visible: false },
    mine: {
      spread: { lineAtGuess: { value: -3, status: 'ok', basis: 'consensus', label: 'Consensus', capturedAt: '2026-10-25T13:15:00Z', observedAt: '2026-10-25T13:10:00Z' } },
      total: { lineAtGuess: { value: 47, status: 'ok', basis: 'consensus', label: 'Consensus', capturedAt: '2026-10-25T13:15:00Z', observedAt: '2026-10-25T13:10:00Z' } },
    } };
  assert.deepEqual(impliedTotals(game), { locked: ['spread', 'total'] });
  const context = describePlayerContext(wr, { lines: { status: 'ready', games: new Map([['SEA-DEN', game]]) }, scoringLabel: 'PPR' });
  assert.equal(context.implied, null);
  assert.equal(context.pill, '@ DEN · Sun late', 'no implied total in the pill');
});
