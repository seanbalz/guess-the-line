import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FILTERS, POSITION_OPTIONS, buildRankings, formatFantasyNumber, normalizeFantasyFilters, playerTrendHighlights,
  scoreStats, scoringRules, validateFantasySnapshot,
} from '../shared/fantasy-rankings.mjs';

const NOW = '2026-10-20T12:00:00Z';
const options = { now: NOW };
const offense = overrides => ({
  passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0,
  receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0,
  specialTeamsTds: 0, targets: 0, carries: 0, passingAttempts: 0, ...overrides,
});
const kicker = overrides => ({ fieldGoals0to39: 0, fieldGoals40to49: 0, fieldGoals50plus: 0, extraPoints: 0, fieldGoalsMissed: 0, extraPointsMissed: 0, ...overrides });
const player = (id, overrides = {}) => ({
  id, name: `Player ${id}`, team: 'SEA', position: 'RB', sampleGames: 5,
  weekly: { stats: offense({ rushingYards: 100 }), opponent: 'DEN', kickoff: '2026-10-25T20:00:00Z', status: 'scheduled' },
  restOfSeason: { stats: offense({ rushingYards: 1000 }), games: 10 }, history: [], ...overrides,
});
const snapshot = players => ({
  schemaVersion: 1, season: 2026, week: 7, statsThroughWeek: 6,
  asOf: '2026-10-20T10:00:00Z', generatedAt: '2026-10-20T11:00:00Z',
  sources: [{ name: 'Synthetic test source', url: 'https://example.test/stats', license: 'Test fixture', licenseUrl: 'https://example.test/license', retrievedAt: '2026-10-20T09:00:00Z', updatedAt: null, sha256: 'a'.repeat(64) }],
  method: { name: 'Test baseline', version: '1', description: 'Synthetic fixtures, not NFL rankings.' }, players,
});
const build = (players, filters = {}) => buildRankings(snapshot(players), filters, options);
const weekly = (stats, overrides = {}) => ({ stats, opponent: 'DEN', kickoff: '2026-10-25T20:00:00Z', status: 'scheduled', ...overrides });
const history = (values, key = 'targets') => values.map((value, index) => ({ week: index + 1, ...offense({ [key]: value }) }));

test('scoring presets reorder a receiving player; passing TD choice is independent', () => {
  const runner = player('runner', { weekly: weekly(offense({ rushingYards: 100 })) });
  const receiver = player('receiver', { position: 'WR', weekly: weekly(offense({ receivingYards: 70, receptions: 8 })) });
  assert.deepEqual(build([runner, receiver], { scoring: 'standard' }).rows.map(row => [row.id, row.points]), [['runner', 10], ['receiver', 7]]);
  assert.deepEqual(build([runner, receiver], { scoring: 'half-ppr' }).rows.map(row => [row.id, row.points]), [['receiver', 11], ['runner', 10]]);
  assert.deepEqual(build([runner, receiver], { scoring: 'ppr' }).rows.map(row => [row.id, row.points]), [['receiver', 15], ['runner', 10]]);
  const qb = player('qb', { position: 'QB', weekly: weekly(offense({ passingYards: 100, passingTds: 2, interceptions: 1 })) });
  assert.equal(build([qb], { passingTds: 4 }).rows[0].points, 10);
  assert.equal(build([qb], { passingTds: 6 }).rows[0].points, 14);
});

test('offensive scoring includes losses, two-point conversions, returns, and negative yards', () => {
  assert.equal(scoreStats(offense({ passingYards: 250, passingTds: 2, interceptions: 1, rushingYards: -10, rushingTds: 1, receptions: 2, receivingYards: 20, receivingTds: 1, fumblesLost: 1, twoPointConversions: 1, specialTeamsTds: 1 })), 37);
  assert.equal(scoreStats(offense()), 0, 'known zero is a valid score');
  assert.equal(scoreStats(offense({ rushingYards: -5 })), -0.5);
  for (const field of scoringRules().offense) {
    const missing = offense(); delete missing[field.key];
    assert.equal(scoreStats(missing), null, `${field.key} cannot be invented`);
    assert.equal(scoreStats(offense({ [field.key]: null })), null, field.key);
  }
  assert.equal(scoreStats(offense({ receptions: -1 })), null);
  assert.equal(scoreStats(offense({ rushingYards: Infinity })), null);
  assert.equal(scoreStats(offense(), { passingTds: 5 }), null);
  assert.equal(scoreStats(offense(), { scoring: 'unknown' }), null);
});

test('kicker scoring uses verified field bands and no offense fields; D/ST stays unavailable', () => {
  const stats = kicker({ fieldGoals0to39: 1, fieldGoals40to49: 1, fieldGoals50plus: 1, extraPoints: 3, fieldGoalsMissed: 1, extraPointsMissed: 1 });
  assert.equal(scoreStats(stats, { position: 'K' }), 13);
  assert.equal(scoreStats(stats, { position: 'K', scoring: 'standard', passingTds: 6 }), 13);
  assert.equal(scoreStats({ ...stats, fieldGoalsMissed: null }, { position: 'K' }), null);
  assert.equal(scoreStats(offense(), { position: 'DST' }), null);
  const result = build([player('k', { position: 'K', weekly: weekly(stats) })], { position: 'K' });
  assert.equal(result.rows[0].points, 13);
  assert.ok(POSITION_OPTIONS.some(option => option.value === 'DST'));
  assert.match(build([], { position: 'DST' }).summary.note, /unavailable/);
});

test('overall, positional and FLEX ranks share displayed ties and survive other filters', () => {
  const players = [
    player('qb', { position: 'QB', weekly: weekly(offense({ passingYards: 500 })) }),
    player('a', { name: 'Alpha Runner', weekly: weekly(offense({ rushingYards: 100.4 })) }),
    player('b', { team: 'DEN', weekly: weekly(offense({ rushingYards: 100.1 })) }),
    player('wr', { position: 'WR', weekly: weekly(offense({ receivingYards: 80 })) }),
    player('te', { position: 'TE', weekly: weekly(offense({ receivingYards: 70 })) }),
  ];
  const result = build(players);
  assert.deepEqual(result.rows.map(row => [row.id, row.rank, row.positionRank]), [['qb', 1, 1], ['a', 2, 1], ['b', 2, 1], ['wr', 4, 1], ['te', 5, 1]]);
  assert.ok(result.rows[1].points > result.rows[2].points, 'exact points order matching displayed tenths');
  assert.deepEqual(build(players, { position: 'FLEX' }).rows.map(row => [row.id, row.rank, row.overallRank]), [['a', 1, 2], ['b', 1, 2], ['wr', 3, 4], ['te', 4, 5]]);
  const filtered = build(players, { team: 'DEN', search: 'player B' });
  assert.deepEqual(filtered.rows.map(row => [row.id, row.rank]), [['b', 2]]);
  assert.equal(filtered.eligible, 5);
  assert.deepEqual(filtered.teams, ['DEN', 'SEA']);
  assert.equal(build(players, { position: 'RB', team: 'DEN' }).rows[0].rank, 1);
  assert.deepEqual(build(players.reverse()).rows.map(row => row.id), ['qb', 'a', 'b', 'wr', 'te'], 'input order never breaks ties');
});

test('half-tenth formatting matches the shared rank for weekly and ROS totals', () => {
  // Real snapshot boundaries such as 7.35 otherwise become 7.3 with raw .toFixed(1), while
  // the ranking engine groups them at 7.4. Fractional receptions model estimated statistics.
  for (const scope of ['weekly', 'ros']) for (const [boundary, displayed] of [[5.35, '5.4'], [7.35, '7.4'], [174.85, '174.9']]) {
    const players = [['higher', boundary + 0.01], ['boundary', boundary], ['lower', boundary - 0.01]].map(([id, receptions]) => player(id, {
      weekly: weekly(offense({ receptions })), restOfSeason: { stats: offense({ receptions }), games: 12 },
    }));
    const result = build(players, { scope });
    assert.deepEqual(result.rows.map(row => [row.id, row.rank]), [['higher', 1], ['boundary', 1], ['lower', 3]], `${scope} ${boundary}`);
    assert.deepEqual(result.rows.slice(0, 2).map(row => formatFantasyNumber(row.points)), [displayed, displayed]);
    assert.notEqual(formatFantasyNumber(result.rows[2].points), displayed);
    assert.equal(build(players, { scope, search: 'boundary' }).rows[0].rank, 1);
  }
});

test('fantasy number formatting keeps known zero and masks invalid values', () => {
  assert.equal(formatFantasyNumber(0), '0.0');
  assert.equal(formatFantasyNumber(-0.04), '0.0');
  assert.equal(formatFantasyNumber(-1.26), '-1.3');
  assert.equal(formatFantasyNumber(12), '12.0');
  for (const value of [null, undefined, '', '7.35', NaN, Infinity, -Infinity]) assert.equal(formatFantasyNumber(value), '—');
});

test('byes, unknown matchups and missing estimates never rank as zero; true zero remains ranked', () => {
  const result = build([
    player('bye', { weekly: weekly(offense(), { status: 'bye', opponent: null, kickoff: null }) }),
    player('unknown', { weekly: weekly(offense(), { status: 'unknown', opponent: null, kickoff: null }) }),
    player('missing', { weekly: weekly(null) }), player('partial', { weekly: weekly(offense({ receptions: null })) }),
    player('no-games', { sampleGames: 0 }), player('zero', { weekly: weekly(offense()) }),
  ]);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.rows.map(row => [row.id, row.points]), [['zero', 0]]);
  assert.equal(result.total, 6);
  assert.equal(result.summary.byes, 1);
  assert.equal(result.summary.unavailable, 4);
});

test('ROS uses explicit remaining games and totals, including a player on this week’s bye', () => {
  const players = [
    player('bye', { weekly: weekly(null, { status: 'bye', opponent: null, kickoff: null }), restOfSeason: { stats: offense({ rushingYards: 600 }), games: 6 } }),
    player('more-games', { restOfSeason: { stats: offense({ rushingYards: 700 }), games: 10 } }),
    player('unknown-games', { restOfSeason: { stats: offense({ rushingYards: 1000 }), games: null } }),
    player('finished', { restOfSeason: { stats: offense(), games: 0 } }),
    player('missing', { restOfSeason: { stats: null, games: 8 } }),
  ];
  const result = build(players, { scope: 'ros' });
  assert.deepEqual(result.rows.map(row => [row.id, row.points, row.games, row.perGame]), [['more-games', 70, 10, 7], ['bye', 60, 6, 10]]);
  assert.equal(result.summary.unavailable, 3);
  assert.equal(result.summary.byes, 0);
});

test('strong usage highlights need sustained changes, absolute and relative thresholds, and prior samples', () => {
  const trend = values => playerTrendHighlights(player('p', { history: history(values) }), { week: 7 });
  assert.deepEqual(trend([4, 4, 4, 4, 8, 10]).map(item => [item.id, item.direction, item.recent, item.baseline, item.recentGames, item.baselineGames]), [['targets', 'up', 9, 4, 2, 4]]);
  assert.equal(trend([4, 4, 4, 4, 1, 15]).length, 0, 'one spike is not sustained');
  assert.equal(trend([10, 10, 10, 10, 12, 12]).length, 0, 'absolute threshold alone is insufficient');
  assert.equal(trend([1, 1, 1, 1, 2, 2]).length, 0, 'relative threshold alone is insufficient');
  assert.equal(trend([0, 0, 0, 0, 4, 5]).length, 0, 'zero baseline has no valid percentage comparison');
  assert.equal(trend([4, 8, 9]).length, 0, 'at least two earlier appearances are required');
  assert.equal(trend([8, 8, 8, 8, 4, 4])[0].direction, 'down');
  assert.match(trend([4, 4, 8, 8])[0].detail, /previous 2/);
});

test('fantasy scoring trend follows chosen scoring preset and passing TD value', () => {
  const rows = [1, 2, 3, 4, 5, 6].map(week => ({ week, ...offense({ receivingYards: 50, receptions: week <= 4 ? 1 : 5 }) }));
  const p = player('receiver', { position: 'WR', history: rows });
  assert.equal(playerTrendHighlights(p, { week: 7, scoring: 'standard' }).length, 0);
  const result = playerTrendHighlights(p, { week: 7, scoring: 'ppr' });
  assert.equal(result[0].id, 'fantasy-points');
  assert.equal(result[0].recent, 10);
  assert.equal(result[0].baseline, 6);
  const q = player('qb', { position: 'QB', history: history([1, 1, 1, 1, 1.5, 1.5], 'passingTds') });
  assert.equal(playerTrendHighlights(q, { week: 7, passingTds: 4 }).length, 0);
  assert.equal(playerTrendHighlights(q, { week: 7, passingTds: 6 })[0].id, 'fantasy-points');
});

test('missing history values, later weeks and stats beyond coverage cannot create a trend', () => {
  const p = player('p', { history: history([4, 4, 4, 4, 8, 8, 100, 200]) });
  assert.equal(playerTrendHighlights(p, { week: 7 })[0].recent, 8, 'selected/future week is excluded');
  assert.equal(playerTrendHighlights(p, { week: 7, statsThroughWeek: 4 }).length, 0, 'coverage cutoff is respected');
  p.history[5].targets = null;
  assert.equal(playerTrendHighlights(p, { week: 7 }).length, 0, 'unknown latest value does not pull an older appearance forward');
});

test('workload highlights take priority, cap at two, and trends-only keeps original rank', () => {
  const p = player('trend', { history: [1, 2, 3, 4, 5, 6].map(week => ({ week, ...offense({ targets: week < 5 ? 4 : 8, carries: week < 5 ? 8 : 16, rushingYards: week < 5 ? 50 : 100 }) })) });
  assert.deepEqual(playerTrendHighlights(p, { week: 7 }).map(item => item.id), ['targets', 'carries']);
  const result = build([player('leader', { weekly: weekly(offense({ rushingYards: 200 })) }), p], { trendsOnly: true });
  assert.deepEqual(result.rows.map(row => [row.id, row.rank]), [['trend', 2]]);
  assert.equal(result.summary.rising, 1);
});

test('validation rejects invalid data and hostile attribution URLs without silently retaining rankings', () => {
  const clean = snapshot([player('p')]);
  assert.equal(validateFantasySnapshot(clean, options).valid, true);
  const mutations = [
    data => { data.schemaVersion = 99; }, data => { data.week = 19; }, data => { data.statsThroughWeek = 7; },
    data => { data.players.push(structuredClone(data.players[0])); },
    data => { data.players[0].weekly.stats.receptions = -1; },
    data => { data.players[0].weekly.stats.receivingYards = NaN; },
    data => { data.players[0].sampleGames = -1; },
    data => { data.players[0].restOfSeason.games = 1.5; },
    data => { data.players[0].history = [{ week: 1 }, { week: 1 }]; },
    data => { data.players[0].weekly.kickoff = null; },
    data => { data.asOf = '2026-10-21T00:00:00Z'; },
    data => { data.generatedAt = '2026-10-21T00:00:00Z'; },
    data => { data.sources[0].retrievedAt = '2026-10-21T00:00:00Z'; },
    data => { data.sources[0].url = 'javascript:alert(1)'; },
    data => { data.sources[0].licenseUrl = 'data:text/html,example'; },
    data => { data.sources[0].sha256 = 'missing'; },
  ];
  for (const mutate of mutations) {
    const data = structuredClone(clean); mutate(data);
    const validation = validateFantasySnapshot(data, options);
    assert.equal(validation.valid, false, mutate.toString());
    assert.ok(validation.errors.length);
    const result = buildRankings(data, {}, options);
    assert.equal(result.rows.length, 0);
    assert.match(result.error, /could not be verified/);
  }
});

test('malformed filter inputs resolve to explicit defaults; building does not mutate the snapshot', () => {
  assert.deepEqual(normalizeFantasyFilters({ scope: 'bad', scoring: 'bad', position: 'bad', passingTds: 7, search: null, trendsOnly: 'true' }), DEFAULT_FILTERS);
  const data = snapshot([player('b'), player('a')]), before = structuredClone(data);
  buildRankings(data, { search: '  player a  ' }, options);
  assert.deepEqual(data, before);
  assert.equal(build([], { search: 'no player' }).rows.length, 0);
});
