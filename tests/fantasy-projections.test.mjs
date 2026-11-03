// Contracts for the offline projection backtest (item 64): no week-w-or-later data reaches a week-w projection; the two
// baselines are exactly today's functions; shrinkage and opponent factors respect their limits; byes and thin histories
// give no projection; bootstrap intervals are reproducible. Small synthetic fixtures only, never downloaded data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatePace } from '../shared/fantasy-build.mjs';
import { buildFantasyReview } from '../shared/fantasy-review.mjs';
import {
  buildWeekContext, opponentFactor, pace11, pairedBootstrap, points, projectWeek, scaleStats, seasonAverage,
  shrinkRate, spearman, usage, usageOpp,
} from '../shared/fantasy-projections.mjs';

const SEASON = 2026, TEAMS = ['KC', 'BUF', 'DAL', 'PHI'], POSITIONS = ['QB', 'RB', 'WR', 'TE'];
// Weeks 1-6, two games a week; DAL and PHI are on bye in Week 5.
const pairs = week => week === 5 ? [['KC', 'BUF']] : week % 2 ? [['KC', 'BUF'], ['DAL', 'PHI']] : [['KC', 'DAL'], ['BUF', 'PHI']];
const schedule = [1, 2, 3, 4, 5, 6].flatMap(week => pairs(week).map(([away, home]) => ({
  game_id: `${SEASON}_0${week}_${away}_${home}`, season: String(SEASON), game_type: 'REG', week: String(week), away_team: away, home_team: home,
})));
const opponentOf = (team, week) => pairs(week).flatMap(([a, h]) => (a === team ? [h] : h === team ? [a] : []))[0];
const raw = (id, team, position, week, over = {}) => ({
  player_id: id, player_display_name: `Fixture ${id}`, position, team, opponent_team: opponentOf(team, week), season: String(SEASON), season_type: 'REG', week: String(week),
  passing_yards: '0', passing_tds: '0', passing_interceptions: '0', rushing_yards: '0', rushing_tds: '0', receptions: '0', receiving_yards: '0', receiving_tds: '0',
  fumbles_lost_total: '0', passing_2pt_conversions: '0', rushing_2pt_conversions: '0', receiving_2pt_conversions: '0', special_teams_tds: '0',
  targets: '0', carries: '0', attempts: '0', ...over,
});
// Distinct, deterministic lines per team, position and week, so league and defense aggregates are not degenerate.
const line = (position, t, w) => ({
  QB: { attempts: 28 + t + w, passing_yards: 200 + 13 * t + 7 * w, passing_tds: (t + w) % 3, passing_interceptions: w % 2, carries: 3, rushing_yards: 10 + t },
  RB: { carries: 14 + ((t + w) % 4), rushing_yards: 55 + 9 * t + w, rushing_tds: w % 2, targets: 3, receptions: 2 + (t % 2), receiving_yards: 12 + w },
  WR: { targets: 7 + ((t * w) % 5), receptions: 4 + (w % 3), receiving_yards: 50 + 11 * t + 3 * w, receiving_tds: (t + w) % 2 },
  TE: { targets: 4 + (w % 3), receptions: 3 + (t % 2), receiving_yards: 30 + 5 * w, receiving_tds: w % 3 === 0 ? 1 : 0, fumbles_lost_total: w === 2 ? 1 : 0 },
})[position];
const asText = stats => Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, String(value)]));
const rows = TEAMS.flatMap((team, t) => POSITIONS.flatMap(position => [1, 2, 3, 4, 5, 6]
  .filter(week => opponentOf(team, week))
  .map(week => raw(`${team}-${position}`, team, position, week, asText(line(position, t, week))))));
const SETTINGS = { usage: { halfLife: 3, kEff: 25, kTd: 100 }, usageOpp: { halfLife: 3, kEff: 25, kTd: 100, kOpp: 4 } };
const project = (week, data = rows, games = schedule) => projectWeek(buildWeekContext({ rows: data, schedule: games, season: SEASON, week }), SETTINGS);

test('no lookahead: rows from week w on, and later schedule rows, never change a week-w projection', () => {
  const week = 4, before = project(week);
  assert.ok(before.get('KC-WR').usageOpp, 'fixture must produce real projections');
  // Poison everything a leak could carry: every stat, team, opponent and position, plus a player who first appears in week w.
  const poisoned = rows.map(row => Number(row.week) < week ? row : {
    ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, /^\d+$/.test(value) && !['season', 'week'].includes(key) ? String(Number(value) * 100 + 7) : value])),
    team: 'DAL', opponent_team: 'KC', position: 'QB',
  }).concat([week, week + 1].map(w => raw('intruder', 'KC', 'WR', w, { targets: '30', receptions: '25', receiving_yards: '400', receiving_tds: '4' })));
  const laterGames = schedule.map(game => Number(game.week) > week ? { ...game, home_team: 'KC', away_team: 'PHI' } : game);
  assert.deepEqual(project(week, poisoned, laterGames), before);
  // Control, so the guard cannot pass vacuously: one earlier row of another player (BUF WR at KC in Week 3) moves the
  // league WR rates and KC's WR points allowed, and with them other players' projections.
  const earlier = rows.map(row => row.player_id === 'BUF-WR' && row.week === '3' ? { ...row, targets: '20', receiving_yards: '20', receptions: '20' } : row);
  const contexts = [rows, earlier].map(data => buildWeekContext({ rows: data, schedule, season: SEASON, week }));
  assert.notEqual(contexts[1].league.WR.receivingYards, contexts[0].league.WR.receivingYards);
  assert.notEqual(contexts[1].defenses.teams.KC.allowed.WR, contexts[0].defenses.teams.KC.allowed.WR);
  const after = project(week, earlier);
  assert.notEqual(after.get('KC-WR').usage.receivingYards, before.get('KC-WR').usage.receivingYards);
  assert.notEqual(after.get('DAL-WR').usageOpp.receivingYards, before.get('DAL-WR').usageOpp.receivingYards);
});

test('seasonAverage reproduces the review baseline (averageStats) and pace11 is estimatePace exactly', () => {
  const zero = { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0, targets: 0, carries: 0, passingAttempts: 0 };
  const histories = {
    wr1: [1, 2, 3, 4].map(week => ({ week, ...zero, receptions: week + 2, receivingYards: 37 + week * 11, targets: week * 3 + 1, receivingTds: week % 3 === 0 ? 1 : 0 })),
    rb1: [1, 3, 4].map(week => ({ week, ...zero, rushingYards: 10 + week, carries: 7, fumblesLost: week === 3 ? 1 : 0, receivingYards: week === 4 ? null : 5 })),
  };
  const player = (id, team, position) => ({
    id, name: `Name ${id}`, team, position, sampleGames: histories[id].length, status: 'Fixture', restOfSeason: null, history: histories[id],
    weekly: { status: 'scheduled', opponent: team === 'AAA' ? '@ BBB' : 'vs AAA', kickoff: '2026-10-11T17:00:00.000Z', stats: { ...zero, receptions: 4 } },
  });
  const published = {
    schemaVersion: 1, season: 2026, week: 5, statsThroughWeek: 4, asOf: '2026-10-06T12:00:00Z', generatedAt: '2026-10-07T12:00:00Z',
    method: { name: 'Fixture', version: '1', description: 'Fixture pace.' },
    sources: [{ name: 'Fixture', url: 'https://example.test/s', license: 'CC BY 4.0', licenseUrl: 'https://example.test/l', retrievedAt: '2026-10-07T11:00:00Z', updatedAt: '2026-10-06T12:00:00Z', sha256: 'a'.repeat(64) }],
    players: [player('wr1', 'AAA', 'WR'), player('rb1', 'BBB', 'RB')],
  };
  const games = [{ game_id: '2026_05_AAA_BBB', season: '2026', game_type: 'REG', week: '5', away_team: 'AAA', home_team: 'BBB', gameday: '2026-10-11', gametime: '13:00' }];
  const actual = (id, team) => ({ ...raw(id, team, 'WR', 5), opponent_team: team === 'AAA' ? 'BBB' : 'AAA', game_id: '2026_05_AAA_BBB' });
  const review = buildFantasyReview({
    published, file: { name: 'fixture.json', sha256: 'd'.repeat(64) }, schedule: games, stats: [actual('wr1', 'AAA'), actual('rb1', 'BBB')],
    statsSource: { name: 'Fixture', url: 'https://example.test/s' }, generatedAt: '2026-10-14T11:05:00Z', freezeAt: Date.parse('2026-10-11T17:00:00Z'), final: false,
  });
  for (const { id, baseline } of review.players) {
    assert.deepEqual(seasonAverage(histories[id]), baseline);
    assert.deepEqual(pace11(histories[id]), estimatePace(histories[id]));
  }
  assert.equal(seasonAverage(histories.rb1).receivingYards, null, 'a missing stat stays missing, never zero');
  assert.equal(seasonAverage(histories.wr1).receivingYards, 64.5);
  // The backtest's projections come from the same functions on the same pre-week history.
  const context = buildWeekContext({ rows, schedule, season: SEASON, week: 5 });
  const projected = projectWeek(context, SETTINGS).get('KC-TE'), history = context.players.get('KC-TE').history;
  assert.deepEqual(history.map(row => row.week), [1, 2, 3, 4]);
  assert.deepEqual(projected.pace11, estimatePace(history));
  assert.deepEqual(projected.seasonAverage, seasonAverage(history));
});

test('shrinkage limits: no opportunities gives the league rate, huge opportunities give the player rate', () => {
  assert.equal(shrinkRate(0, 0, 0.62, 25), 0.62);
  assert.equal(shrinkRate(0, 0, 0.62, 0), 0.62, 'K = 0 with no opportunities still falls back to the league');
  assert.ok(Math.abs(shrinkRate(0.8e9, 1e9, 0.62, 100) - 0.8) < 1e-6);
  assert.equal(shrinkRate(20, 25, 0.6, 25), 0.7, 'n = K weighs player (0.8) and league (0.6) equally');
  // Through usage: a huge-volume receiver keeps his own catch rate even with the largest K_eff in the grid.
  const context = buildWeekContext({ rows, schedule, season: SEASON, week: 4 });
  const big = [1, 2, 3].map(week => ({ ...context.players.get('KC-WR').history[0], week, targets: 1e8, receptions: 0.9e8 }));
  const projected = usage(big, { week: 4, position: 'WR', league: context.league, halfLife: 3, kEff: 100, kTd: 400 });
  assert.ok(Math.abs(projected.receptions / projected.targets - 0.9) < 1e-6);
  assert.ok(Math.abs(context.league.WR.receptions - 0.9) > 0.1, 'the league rate differs, so the test can tell them apart');
});

test('opponent factor shrinks toward 1 by g / (g + K_opp) and is clamped to [0.8, 1.2]', () => {
  const defenses = { leaguePerGame: { QB: 16, RB: 20, WR: 32, TE: 10 }, teams: {
    SOFT: { games: 4, allowed: { QB: 64, RB: 80, WR: 4 * 40, TE: 40 } }, AWFUL: { games: 4, allowed: { QB: 64, RB: 80, WR: 4 * 80, TE: 40 } },
    STINGY: { games: 4, allowed: { QB: 64, RB: 80, WR: 4 * 8, TE: 40 } }, NEW: { games: 0, allowed: { QB: 0, RB: 0, WR: 0, TE: 0 } },
  } };
  const factor = (opponent, kOpp) => opponentFactor({ position: 'WR', opponent, defenses, kOpp });
  assert.equal(factor('SOFT', 4), 1.125, 'raw 1.25 at weight 4 / (4 + 4)');
  assert.equal(factor('SOFT', 0), 1.2, 'unshrunk 1.25 clamps to 1.2');
  assert.equal(factor('AWFUL', 4), 1.2);
  assert.equal(factor('STINGY', 2), 0.8);
  assert.equal(factor('NEW', 4), 1, 'no games played: no adjustment');
  assert.equal(factor('UNKNOWN', 4), 1);
  // usageOpp is usage scaled by that factor, so its points scale by the same factor.
  const context = buildWeekContext({ rows, schedule, season: SEASON, week: 4 }), history = context.players.get('KC-WR').history;
  const shared = { week: 4, position: 'WR', league: context.league, defenses, halfLife: 3, kEff: 25, kTd: 100, kOpp: 4 };
  const base = usage(history, shared), adjusted = usageOpp(history, { ...shared, opponent: 'SOFT' });
  assert.deepEqual(adjusted, scaleStats(base, 1.125));
  assert.ok(Math.abs(points(adjusted, 'WR') - 1.125 * points(base, 'WR')) < 1e-9);
});

test('a bye gives no opponent-adjusted projection', () => {
  const projected = project(5);
  assert.equal(projected.get('DAL-WR').opponent, null);
  assert.equal(projected.get('DAL-WR').usageOpp, null);
  assert.ok(projected.get('DAL-WR').usage, 'usage itself needs no opponent');
  assert.equal(projected.get('KC-WR').opponent, 'BUF');
  assert.ok(projected.get('KC-WR').usageOpp);
  const context = buildWeekContext({ rows, schedule, season: SEASON, week: 5 });
  assert.equal(usageOpp(context.players.get('KC-WR').history, { week: 5, position: 'WR', league: context.league, defenses: context.defenses, opponent: null, ...SETTINGS.usageOpp }), null);
});

test('fewer than two prior appearances gives null from every method', () => {
  const projected = project(2).get('KC-RB'), late = project(4, rows.concat(raw('rookie', 'KC', 'RB', 3, { carries: '12', rushing_yards: '60' }))).get('rookie');
  for (const entry of [projected, late]) {
    assert.deepEqual([entry.seasonAverage, entry.pace11, entry.usage, entry.usageOpp], [null, null, null, null]);
  }
  assert.equal(project(4).get('KC-RB').usage !== null, true, 'two prior appearances is enough');
  assert.equal(project(1).size, 0, 'Week 1 has no prior appearances at all');
});

test('bootstrap intervals are deterministic for a fixed seed and resample the stated unit', () => {
  const a = Array.from({ length: 200 }, (_, i) => (i * 37 % 11) + 0.5), b = Array.from({ length: 200 }, (_, i) => (i * 53 % 13));
  const clusters = a.map((_, i) => `p${i % 23}`);
  const first = pairedBootstrap(a, b, { iterations: 500, seed: 64 });
  assert.deepEqual(pairedBootstrap(a, b, { iterations: 500, seed: 64 }), first);
  assert.notDeepEqual(pairedBootstrap(a, b, { iterations: 500, seed: 65 }), first);
  assert.deepEqual(pairedBootstrap(a, b, { iterations: 500, seed: 64, clusters }), pairedBootstrap(a, b, { iterations: 500, seed: 64, clusters }));
  assert.ok(Math.abs(first.diff - (a.reduce((s, x) => s + x, 0) - b.reduce((s, x) => s + x, 0)) / a.length) < 1e-12);
  assert.ok(first.low < first.diff && first.diff < first.high);
  // A constant paired improvement has no sampling spread, under either resampling unit.
  const constant = pairedBootstrap(b.map(x => x + 0.25), b, { iterations: 200, seed: 1, clusters });
  assert.ok(Math.abs(constant.low - 0.25) < 1e-12 && Math.abs(constant.high - 0.25) < 1e-12);
  assert.equal(constant.resample, 'player');
  assert.throws(() => pairedBootstrap([1], [1, 2]));
});

test('Spearman uses average ranks for ties and is null without variation', () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1);
  assert.ok(Math.abs(spearman([1, 2, 2, 3], [1, 2, 3, 4]) - 0.9486832980505138) < 1e-12);
  assert.equal(spearman([1, 1, 1], [1, 2, 3]), null);
  assert.equal(spearman([1, 2], [1, 2]), null);
});
