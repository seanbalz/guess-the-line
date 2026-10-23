// Contract: a review grades exactly the published estimates against completed-week actuals; no-stats players are counted,
// never scored as zero; metrics depend on the selected scoring; the season-average baseline uses the same players.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFantasyReview, validateFantasyReview, summarizeReview } from '../shared/fantasy-review.mjs';

const zero = { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0, targets: 0, carries: 0, passingAttempts: 0 };
const s = over => ({ ...zero, ...over });
const player = (id, team, position, estimate, past) => ({
  id, name: `Name ${id}`, team, position, sampleGames: 4, status: 'Fixture',
  weekly: estimate ? { status: 'scheduled', opponent: team === 'AAA' ? '@ BBB' : 'vs AAA', kickoff: '2026-10-11T17:00:00.000Z', stats: estimate } : { status: 'bye', opponent: null, kickoff: null, stats: null },
  restOfSeason: null, history: [1, 2, 3, 4].map(week => ({ week, ...past })),
});
const published = {
  schemaVersion: 1, season: 2026, week: 5, statsThroughWeek: 4, asOf: '2026-10-06T12:00:00Z', generatedAt: '2026-10-07T12:00:00Z',
  method: { name: 'Fixture', version: '1', description: 'Fixture pace.' },
  sources: [{ name: 'Fixture', url: 'https://example.test/s', license: 'CC BY 4.0', licenseUrl: 'https://example.test/l', retrievedAt: '2026-10-07T11:00:00Z', updatedAt: '2026-10-06T12:00:00Z', sha256: 'a'.repeat(64) }],
  players: [
    player('wr1', 'AAA', 'WR', s({ receptions: 5, receivingYards: 70 }), s({ receptions: 4, receivingYards: 50 })),
    player('rb1', 'BBB', 'RB', s({ rushingYards: 60 }), s({ rushingYards: 40 })),
    player('dnp', 'AAA', 'WR', s({ receptions: 3, receivingYards: 30 }), s({ receptions: 3, receivingYards: 30 })),
    player('bye', 'CCC', 'WR', null, s({ receptions: 2 })),
  ],
};
const schedule = [{ game_id: '2026_05_AAA_BBB', season: '2026', game_type: 'REG', week: '5', away_team: 'AAA', home_team: 'BBB', gameday: '2026-10-11', gametime: '13:00' }];
const raw = (id, team, position, over = {}) => ({
  player_id: id, position, team, opponent_team: team === 'AAA' ? 'BBB' : 'AAA', game_id: '2026_05_AAA_BBB', season: '2026', season_type: 'REG', week: '5',
  passing_yards: '0', passing_tds: '0', passing_interceptions: '0', rushing_yards: '0', rushing_tds: '0', receptions: '0', receiving_yards: '0', receiving_tds: '0',
  fumbles_lost_total: '0', passing_2pt_conversions: '0', rushing_2pt_conversions: '0', receiving_2pt_conversions: '0', special_teams_tds: '0', targets: '0', carries: '0', attempts: '0', ...over,
});
const stats = [raw('wr1', 'AAA', 'WR', { receptions: '7', receiving_yards: '100' }), raw('rb1', 'BBB', 'RB', { rushing_yards: '20' }), raw('rookie', 'AAA', 'WR', { receptions: '1' })];
const statsSource = { name: 'nflverse stats_player_week_2026.csv', url: 'https://example.test/s', license: 'CC BY 4.0', licenseUrl: 'https://example.test/l', retrievedAt: '2026-10-14T11:00:00Z', updatedAt: '2026-10-14T05:00:00Z', sha256: 'c'.repeat(64) };
const review = (over = {}) => buildFantasyReview({ published, file: { name: '2026-week-05.abcdef12.json', sha256: 'd'.repeat(64) }, schedule, stats, statsSource,
  generatedAt: '2026-10-14T11:05:00Z', freezeAt: Date.parse('2026-10-11T17:00:00Z'), final: false, ...over });

test('grades published estimates; a bye is not graded; no stats row is counted, not zero', () => {
  const r = review();
  assert.equal(validateFantasyReview(r).valid, true);
  assert.deepEqual(r.players.map(p => p.id), ['dnp', 'rb1', 'wr1']);
  assert.equal(r.players.find(p => p.id === 'dnp').actual, null);
  assert.equal(r.status, 'PROVISIONAL');
  assert.equal(r.estimate.publishedBeforeFreeze, true);
  assert.equal(r.playedWithoutEstimate, 1);
  const ppr = summarizeReview(r, { scoring: 'ppr', passingTds: 4 });
  assert.equal(ppr.graded, 2);
  assert.equal(ppr.noStatsRow, 1);
  assert.equal(ppr.mae, 4.5);
  assert.equal(ppr.baselineMae, 5);
  assert.equal(ppr.within5, 1);
  assert.deepEqual(ppr.beatBaseline, ['WR']);
  assert.deepEqual(ppr.overs.map(o => o.id), ['rb1']);
  assert.deepEqual(ppr.unders.map(u => u.id), ['wr1']);
});

test('scoring format changes the miss sizes from the same pairs', () => {
  assert.equal(summarizeReview(review(), { scoring: 'standard', passingTds: 4 }).mae, 3.5);
});

test('FINAL is written out, an incomplete week refuses to grade, and invalid reviews fail validation', () => {
  assert.equal(review({ final: true }).status, 'FINAL');
  assert.throws(() => review({ stats: stats.filter(row => row.team !== 'BBB') }), /not complete/);
  assert.equal(validateFantasyReview({ ...review(), status: 'DONE' }).valid, false);
  assert.equal(validateFantasyReview({ ...review(), players: [{ id: 'x' }] }).valid, false);
});

test('the baseline is compared on the same players: a player without two prior games counts in mae only', () => {
  const newcomer = { ...player('new1', 'AAA', 'WR', s({ receptions: 2, receivingYards: 20 }), s({})), history: [{ week: 4, ...s({ receptions: 2, receivingYards: 20 }) }] };
  const r = review({ published: { ...published, players: [...published.players, newcomer] }, stats: [...stats, raw('new1', 'AAA', 'WR', { receptions: '2', receiving_yards: '20' })] });
  const ppr = summarizeReview(r, { scoring: 'ppr', passingTds: 4 });
  assert.equal(ppr.graded, 3);
  assert.equal(ppr.mae, 3);
  assert.equal(ppr.pairedMae, 4.5);
  assert.equal(ppr.baselineMae, 5);
  assert.equal(ppr.withoutBaseline, 1);
  assert.deepEqual(ppr.beatBaseline, ['WR']);
  const wr = ppr.byPosition.find(row => row.position === 'WR');
  assert.equal(wr.pairedMae, 5);
  assert.equal(wr.baselineMae, 8);
});
