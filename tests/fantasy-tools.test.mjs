// Contract: profiles, comparisons and opponent context come from the snapshot alone; missing stays null, byes are not
// zero games, every average carries its sample, and observed production never mixes with the pace estimate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playerWeeks, summarize, paceEstimate, playerProfile, comparePlayers, opponentAllowed, searchPlayers, teamWeeks, MAX_COMPARE } from '../shared/fantasy-tools.mjs';

const zero = { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0 };
const usage = { targets: 0, carries: 0, passingAttempts: 0 };
const wrWeek = (week, receptions, yards, targets) => ({ week, ...zero, ...usage, receptions, receivingYards: yards, targets });
const allowed = wrYards => ({ QB: zero, RB: zero, WR: { ...zero, receptions: 10, receivingYards: wrYards }, TE: zero });
const wr = {
  id: 'wr', name: 'Alpha Receiver', team: 'SEA', position: 'WR', sampleGames: 4, status: 'Active',
  weekly: { status: 'scheduled', opponent: '@ DEN', kickoff: '2026-10-25T20:25:00Z', stats: { ...zero, ...usage, receptions: 5, receivingYards: 60, targets: 8 } },
  restOfSeason: { games: 11, stats: { ...zero, ...usage, receptions: 55, receivingYards: 660, targets: 88 } },
  // Week 3 is SEA's bye; week 5 has a missing target count; week 6 is the selected (unplayed) week.
  history: [wrWeek(1, 4, 40, 6), wrWeek(2, 6, 80, 9), wrWeek(4, 2, 20, 4), { ...wrWeek(5, 8, 100, null), targets: null }],
};
const rb = { id: 'rb', name: 'Bravo Runner', team: 'DEN', position: 'RB', sampleGames: 2, status: 'Active',
  weekly: { status: 'bye', opponent: null, kickoff: null, stats: null }, restOfSeason: { games: 10, stats: null },
  history: [{ week: 4, ...zero, ...usage, carries: 15, rushingYards: 70 }, { week: 5, ...zero, ...usage, carries: 20, rushingYards: 110, rushingTds: 1 }] };
const qb = { id: 'qb', name: 'Charlie Passer', team: 'KC', position: 'QB', sampleGames: 0, status: 'Active', weekly: { status: 'scheduled', opponent: 'vs SEA', kickoff: '2026-10-25T20:25:00Z', stats: null }, restOfSeason: { games: 11, stats: null }, history: [] };
const games = (team, weeks) => weeks.map(([week, yards]) => ({ week, opponent: team, allowed: allowed(yards) }));
const snapshot = { season: 2026, week: 6, statsThroughWeek: 5, players: [wr, rb, qb], matchups: {
  DEN: games('X', [[1, 100], [2, 200], [3, 300], [4, 50], [5, 150]]),
  // SEA's offense faced these defenses in weeks 1, 2, 4 and 5 — no week 3 game, so week 3 is a bye.
  AAA: games('SEA', [[1, 0], [2, 0]]), BBB: games('SEA', [[4, 0], [5, 0]]),
} };
const ppr = { scoring: 'ppr', passingTds: 4 }, standard = { scoring: 'standard', passingTds: 4 };

test('weeks list every completed week; byes and missing stats are never zero', () => {
  assert.deepEqual([...teamWeeks(snapshot, 'SEA')].sort(), [1, 2, 4, 5]);
  const weeks = playerWeeks(snapshot, wr, ppr);
  assert.deepEqual(weeks.map(row => row.status), ['played', 'played', 'bye', 'played', 'played']);
  assert.equal(weeks[0].points, 8);
  assert.equal(weeks[2].points, null);
  assert.equal(weeks[2].usage.targets, null);
  assert.equal(weeks[4].usage.targets, null, 'a missing target count stays missing');
  assert.equal(weeks[4].usage.receptions, 8);
  assert.equal(weeks[4].points, 18, 'targets are usage, not a scoring stat');
  assert.equal(playerWeeks(snapshot, { ...wr, history: [{ ...wrWeek(1, 4, 40, 6), receivingTds: null }] }, ppr)[0].points, null, 'fantasy points need every scoring stat');
  const noMatchups = playerWeeks({ ...snapshot, matchups: undefined }, wr, ppr);
  assert.equal(noMatchups[2].status, 'none', 'without matchups a bye cannot be told apart from a missed game');
});

test('season and last-3-week averages carry their own sample sizes', () => {
  const summary = summarize(playerWeeks(snapshot, wr, ppr), 5);
  assert.equal(summary.season.games, 4);
  assert.deepEqual(summary.season.usage.targets, { value: 19 / 3, games: 3 });
  assert.deepEqual(summary.season.points, { value: (8 + 14 + 4 + 18) / 4, games: 4 });
  assert.equal(summary.recentFrom, 3);
  assert.equal(summary.recent.games, 2, 'weeks 3–5 contain a bye, so two games');
  assert.deepEqual(summary.recent.usage.receptions, { value: 5, games: 2 });
  assert.deepEqual(summary.recent.usage.targets, { value: 4, games: 1 });
  const empty = summarize(playerWeeks(snapshot, qb, ppr), 5);
  assert.deepEqual(empty.season.points, { value: null, games: 0 });
});

test('the pace estimate is separate from observed production and follows the scoring format', () => {
  const estimate = paceEstimate(wr, ppr);
  assert.equal(estimate.week.points, 11);
  assert.equal(estimate.week.usage.targets, 8);
  assert.deepEqual(estimate.restOfSeason, { points: 121, games: 11 });
  assert.equal(paceEstimate(wr, standard).week.points, 6);
  assert.equal(paceEstimate(rb, ppr).week, null);
  const profile = playerProfile(snapshot, 'wr', ppr);
  assert.equal(profile.weeks.length, 5);
  assert.equal(profile.byeKnown, true);
  assert.equal(playerProfile(snapshot, 'nobody', ppr), null);
});

test('comparisons use one format and one period, with sample sizes', () => {
  const season = comparePlayers(snapshot, ['wr', 'rb'], standard, 'season');
  assert.deepEqual(season.weeks, [1, 5]);
  assert.equal(season.rows[0].points, (4 + 8 + 2 + 10) / 4);
  assert.equal(season.rows[0].games, 4);
  assert.equal(season.rows[0].usageGames.targets, 3);
  assert.equal(season.rows[1].points, (7 + 17) / 2);
  assert.equal(season.rows[1].usage.carries, 17.5);
  assert.equal(season.rows[1].usage.targets, 0);
  const recent = comparePlayers(snapshot, ['wr', 'rb'], ppr, 'recent');
  assert.deepEqual(recent.weeks, [3, 5]);
  assert.equal(recent.rows[0].games, 2);
  assert.equal(recent.rows[0].usageGames.targets, 1);
  const week = comparePlayers(snapshot, ['wr', 'rb', 'qb'], ppr, 'week');
  assert.deepEqual(week.rows.map(row => [row.kind, row.status, row.points]), [['estimate', 'scheduled', 11], ['estimate', 'bye', null], ['estimate', 'scheduled', null]]);
  assert.equal(week.rows[2].usage.targets, null);
  assert.equal(comparePlayers(snapshot, ['wr', 'rb', 'qb', 'wr'], ppr).rows.length, MAX_COMPARE);
  assert.deepEqual(comparePlayers(snapshot, ['missing', 'rb'], ppr).rows.map(row => row.id), ['rb']);
});

test('opponent context is what that defense allowed, with samples and the league average; no matchups means none', () => {
  const context = opponentAllowed(snapshot, wr, ppr);
  assert.equal(context.defense, 'DEN');
  assert.equal(context.home, false);
  assert.deepEqual(context.games.map(game => game.points), [20, 30, 40, 15, 25]);
  assert.deepEqual(context.season, { value: 26, games: 5 });
  assert.deepEqual(context.recent, { value: 80 / 3, games: 3 });
  assert.equal(context.league.games, 9);
  assert.equal(opponentAllowed(snapshot, wr, standard).games[0].points, 10);
  assert.equal(opponentAllowed(snapshot, rb, ppr), null, 'bye week');
  assert.equal(opponentAllowed({ ...snapshot, matchups: undefined }, wr, ppr), null);
  assert.equal(opponentAllowed(snapshot, { ...wr, position: 'K' }, ppr), null);
  assert.deepEqual(opponentAllowed(snapshot, qb, ppr).games, [], 'a defense with no games has an empty, honest sample');
});

test('player search matches name, team or position and skips chosen players', () => {
  assert.deepEqual(searchPlayers(snapshot, 'den').map(p => p.id), ['rb']);
  assert.deepEqual(searchPlayers(snapshot, 'a', ['wr']).map(p => p.id), ['rb', 'qb']);
  assert.deepEqual(searchPlayers(snapshot, '  '), []);
});
