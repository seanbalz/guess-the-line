// Public NFL-statistics fixtures only. These exercise the snapshot builder without downloads or GTL accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAM_NAMES } from '../shared/nfl-schedule.mjs';
import { buildFantasySnapshot, completedWeeks, estimatePace, normalizePlayerStats, parseFantasyCsv } from '../shared/fantasy-build.mjs';
import { buildRankings, scoreStats, validateFantasySnapshot } from '../shared/fantasy-rankings.mjs';

const TEAMS = Object.keys(TEAM_NAMES);
const SEASON = 2026, WEEK = 6, GENERATED = '2026-10-15T12:00:00Z';
const playerId = team => `fixture-${team}`;
const rawStats = (team, week, overrides = {}) => ({
  player_id: playerId(team), player_display_name: `Fixture ${team}`, position: 'RB', recent_team: team,
  team, opponent_team: TEAMS[TEAMS.indexOf(team) ^ 1],
  game_id: `fixture-${SEASON}-${week}-${TEAMS[TEAMS.indexOf(team) & ~1]}-${TEAMS[(TEAMS.indexOf(team) & ~1) + 1]}`,
  season: String(SEASON), season_type: 'REG', week: String(week),
  passing_yards: '0', passing_tds: '0', passing_interceptions: '0', rushing_yards: String(week * 10), rushing_tds: '0',
  receptions: '0', receiving_yards: '0', receiving_tds: '0', fumbles_lost_total: '0',
  sack_fumbles_lost: '0', rushing_fumbles_lost: '0', receiving_fumbles_lost: '0',
  passing_2pt_conversions: '0', rushing_2pt_conversions: '0', receiving_2pt_conversions: '0', special_teams_tds: '0',
  targets: '0', carries: '10', attempts: '0', ...overrides,
});
const roster = (team, week, overrides = {}) => ({
  gsis_id: playerId(team), full_name: `Fixture ${team}`, team, position: 'RB', status: 'ACT',
  season: String(SEASON), game_type: 'REG', week: String(week), ...overrides,
});

// Every team plays 17 games in 17 different weeks. ARI/ATL move their Week 6 fixture to Week 18,
// so their absence from the weekly roster source is a real bye, not missing schedule coverage.
function fixture() {
  const schedule = [];
  for (let week = 1; week <= 17; week++) for (let pair = 0; pair < TEAMS.length; pair += 2) {
    const scheduledWeek = week === WEEK && pair === 0 ? 18 : week;
    schedule.push({
      game_id: `fixture-${SEASON}-${scheduledWeek}-${TEAMS[pair]}-${TEAMS[pair + 1]}`,
      season: String(SEASON), game_type: 'REG', week: String(scheduledWeek),
      away_team: TEAMS[pair], home_team: TEAMS[pair + 1],
      gameday: new Date(Date.UTC(2026, 8, 10 + (scheduledWeek - 1) * 7)).toISOString().slice(0, 10), gametime: '20:15',
    });
  }
  return {
    season: SEASON, week: WEEK, generatedAt: GENERATED, schedule,
    // Non-fantasy coverage rows keep full game/team evidence even when an offensive player has few appearances.
    stats: TEAMS.flatMap(team => [1, 2, 3, 4, 5].flatMap(week => [rawStats(team, week), rawStats(team, week, { player_id: `coverage-${team}`, position: 'CB' })])),
    rosters: TEAMS.map((team, index) => roster(team, index < 2 ? WEEK - 1 : WEEK)), injuries: [],
    sources: [{
      name: 'Fixture stats_player', url: 'https://example.test/stats', license: 'Synthetic test fixture',
      licenseUrl: 'https://example.test/license', retrievedAt: '2026-10-15T11:00:00Z', updatedAt: '2026-10-14T12:00:00Z', sha256: 'b'.repeat(64),
    }],
  };
}
const find = (snapshot, team) => snapshot.players.find(player => player.id === playerId(team));

test('CSV preserves quoted commas/newlines and escaped quotes while blank/NA cells remain missing', () => {
  const csv = '\uFEFFname,position,rushing_yards,receiving_yards\r\n"Smith, Jr.",RB,,NA\r\n"A ""Quoted""\nName",WR,12,0\r\n';
  const rows = parseFantasyCsv(csv, ['name', 'position', 'rushing_yards']);
  assert.equal(rows[0].name, 'Smith, Jr.');
  assert.equal(rows[0].rushing_yards, '');
  assert.equal(rows[0].receiving_yards, '');
  assert.equal(rows[1].name, 'A "Quoted"\nName');
  assert.equal(normalizePlayerStats(rows[0]).rushingYards, null);
  assert.equal(normalizePlayerStats(rows[1]).rushingYards, 12);
  assert.equal(normalizePlayerStats(rows[1]).receivingYards, 0);
  assert.throws(() => parseFantasyCsv('name,name\na,b'), /duplicate CSV columns/);
  assert.throws(() => parseFantasyCsv('name\na', ['position']), /Missing/);
  assert.throws(() => parseFantasyCsv('name,position\n"Unclosed,RB'), /Unclosed/);
  assert.throws(() => parseFantasyCsv('name,position\na,RB,extra'), /Malformed/);
});

test('normalization preserves missing fields and uses total fumbles lost including returns', () => {
  const row = rawStats('SEA', 1, { fumbles_lost_total: '3', sack_fumbles_lost: '1', rushing_fumbles_lost: '1', receiving_fumbles_lost: '0', rushing_yards: '-4' });
  const normalized = normalizePlayerStats(row);
  assert.equal(normalized.fumblesLost, 3, 'return fumbles must not disappear from total fumbles lost');
  assert.equal(normalized.rushingYards, -4);
  assert.equal(scoreStats(normalized), -6.4);
  for (const rawKey of ['receptions', 'rushing_yards', 'fumbles_lost_total', 'special_teams_tds']) {
    const incomplete = { ...row }; delete incomplete[rawKey];
    assert.equal(scoreStats(normalizePlayerStats(incomplete)), null, rawKey);
  }
  assert.equal(normalizePlayerStats({ ...row, rushing_yards: 'not-a-number' }).rushingYards, null);
  assert.equal(normalizePlayerStats({ ...row, rushing_yards: 'Infinity' }).rushingYards, null);
});

test('kicker field bands include blocked misses once and fail closed on missing bands', () => {
  const row = {
    position: 'K', fg_made_0_19: '1', fg_made_20_29: '2', fg_made_30_39: '3', fg_made_40_49: '2', fg_made_50_59: '1', fg_made_60_: '1',
    pat_made: '4', fg_missed: '1', fg_blocked: '2', pat_missed: '1', pat_blocked: '1',
  };
  const normalized = normalizePlayerStats(row);
  assert.deepEqual(normalized, { fieldGoals0to39: 6, fieldGoals40to49: 2, fieldGoals50plus: 2, extraPoints: 4, fieldGoalsMissed: 3, extraPointsMissed: 2 });
  assert.equal(scoreStats(normalized, { position: 'K' }), 35);
  assert.equal(normalizePlayerStats({ ...row, fg_blocked: '' }).fieldGoalsMissed, null);
  const absentBand = { ...row }; delete absentBand.fg_made_60_;
  assert.equal(normalizePlayerStats(absentBand).fieldGoals50plus, null);
});

test('pace weights the latest three appearances at 60% and full observed season at 40%', () => {
  const data = [10, 20, 30, 40, 50].map((yards, index) => ({ week: index + 1, rushingYards: yards, receptions: 2 }));
  assert.deepEqual(estimatePace(data), { rushingYards: 36, receptions: 2 });
  assert.equal(estimatePace(data.slice(0, 1)), null);
  assert.equal(estimatePace([]), null);
  assert.equal(estimatePace([{ week: 1, rushingYards: 0 }, { week: 2, rushingYards: 0 }]).rushingYards, 0);
  data[0].rushingYards = null;
  assert.equal(estimatePace(data).rushingYards, null, 'an unknown prior value cannot become a zero or vanish');
});

test('snapshot uses prior regular-season appearances and ignores other-season/postseason rows', () => {
  const input = fixture();
  input.stats.push(rawStats('SEA', 1, { season: '2025', rushing_yards: '99999' }), rawStats('SEA', 1, { season_type: 'POST', rushing_yards: '99999' }));
  const snapshot = buildFantasySnapshot(input), sea = find(snapshot, 'SEA');
  assert.equal(sea.sampleGames, 5);
  assert.equal(sea.weekly.stats.rushingYards, 36);
  assert.deepEqual(sea.history.map(row => row.week), [1, 2, 3, 4, 5]);
  assert.equal(snapshot.statsThroughWeek, 5);
  assert.equal(snapshot.asOf, '2026-10-14T12:00:00Z');
  assert.equal(snapshot.players.length, 32);
});

test('partial selected-week statistics are ignored; later weeks and a completed selected week still fail closed', () => {
  const clean = buildFantasySnapshot(fixture());
  const partial = fixture(); partial.stats.push(rawStats('SEA', 6, { rushing_yards: '99999' }));
  assert.deepEqual(buildFantasySnapshot(partial).players, clean.players, 'a Thursday game never changes any estimate');
  const later = fixture(); later.stats.push(rawStats('SEA', 7, { rushing_yards: '99999' }));
  assert.throws(() => buildFantasySnapshot(later), /after the selected week; retrospective forecasts are not supported/);
  const complete = fixture();
  for (const team of TEAMS.slice(2)) complete.stats.push(rawStats(team, 6));
  assert.throws(() => buildFantasySnapshot(complete), /already complete; retrospective forecasts are not supported/);
});

test('completedWeeks counts a week only when every scheduled game has both teams', () => {
  const input = fixture();
  assert.deepEqual([...completedWeeks(input)].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  input.stats = input.stats.filter(row => !(row.week === '5' && row.team === 'SEA'));
  assert.deepEqual([...completedWeeks(input)].sort((a, b) => a - b), [1, 2, 3, 4]);
});

test("bye teams retain their most recent roster; playing teams may use last week's roster, counted, never older", () => {
  const input = fixture();
  input.rosters.push(roster('ARI', 4, { full_name: 'Older name' }), roster('ARI', 7, { full_name: 'Future name' }));
  const snapshot = buildFantasySnapshot(input), bye = find(snapshot, 'ARI');
  assert.equal(bye.name, 'Fixture ARI', 'latest observed roster before the bye wins');
  assert.equal(bye.weekly.status, 'bye');
  assert.equal(bye.weekly.stats, null);
  assert.equal(bye.weekly.opponent, null);
  assert.equal(bye.restOfSeason.games, 12);
  assert.equal(bye.restOfSeason.stats.rushingYards, 432);
  const weekly = buildRankings(snapshot, {}, { now: GENERATED });
  assert.equal(weekly.rows.length, 30);
  assert.equal(weekly.rows.some(row => row.id === bye.id), false);
  const ros = buildRankings(snapshot, { scope: 'ros' }, { now: GENERATED });
  assert.equal(ros.rows.length, 32);
  assert.equal(ros.rows.find(row => row.id === bye.id).perGame, 3.6);
  assert.deepEqual(snapshot.rosterFallbackTeams, []);
  const lastWeek = fixture();
  lastWeek.rosters.find(row => row.team === 'SEA').week = '5';
  const fallback = buildFantasySnapshot(lastWeek);
  assert.deepEqual(fallback.rosterFallbackTeams, ['SEA'], "a playing team may use last week's roster and is counted");
  assert.match(find(fallback, 'SEA').status, /active roster as of Week 5/);
  const older = fixture();
  older.rosters.find(row => row.team === 'SEA').week = '4';
  assert.throws(() => buildFantasySnapshot(older), /roster coverage/i, 'a roster two weeks old is not treated as current');
});

test('Out and Doubtful suppress weekly estimates but retain conditional ROS pace; old reports are ignored', () => {
  const input = fixture();
  const injury = (team, report_status, week = WEEK) => ({ season: String(SEASON), week: String(week), season_type: 'REG', gsis_id: playerId(team), team, report_status, practice_status: 'Did Not Participate' });
  input.injuries = [injury('SEA', 'Out'), injury('DEN', 'Doubtful'), injury('GB', 'Questionable'), injury('PIT', 'Out', WEEK - 1)];
  const snapshot = buildFantasySnapshot(input);
  for (const team of ['SEA', 'DEN']) {
    const p = find(snapshot, team);
    assert.equal(p.weekly.status, 'scheduled');
    assert.equal(p.weekly.stats, null);
    assert.equal(p.restOfSeason.stats.rushingYards, 432);
    assert.match(p.status, /Out|Doubtful/);
  }
  assert.notEqual(find(snapshot, 'GB').weekly.stats, null);
  assert.notEqual(find(snapshot, 'PIT').weekly.stats, null);
  assert.match(snapshot.method.description, /assuming an active-roster player is available/);
  assert.match(snapshot.method.description, /No injury return date/);
});

test('non-active roster, fewer than two appearances, and missing required scoring stats never get invented estimates', () => {
  const input = fixture();
  input.rosters.find(row => row.team === 'SEA').status = 'RES';
  input.stats = input.stats.filter(row => row.player_id !== playerId('DEN') || row.week === '5');
  input.stats.find(row => row.player_id === playerId('GB') && row.week === '2').receptions = '';
  const snapshot = buildFantasySnapshot(input);
  assert.equal(find(snapshot, 'SEA'), undefined);
  for (const team of ['DEN', 'GB']) {
    assert.equal(find(snapshot, team).weekly.stats, null);
    assert.equal(find(snapshot, team).restOfSeason.stats, null);
  }
  assert.equal(find(snapshot, 'DEN').sampleGames, 1);
});

test('builder requires complete and unique 272-game/32-team coverage and previous-week stats', () => {
  const mutations = [
    input => { input.schedule.pop(); },
    input => { input.schedule[1] = { ...input.schedule[0] }; },
    input => { input.schedule[1].away_team = 'ARI'; },
    input => { input.stats = input.stats.filter(row => row.week !== '5'); },
    input => { input.stats.push({ ...input.stats[0] }); },
    input => { input.rosters.push({ ...input.rosters.find(row => row.team === 'SEA') }); },
  ];
  for (const mutate of mutations) {
    const input = fixture(); mutate(input);
    assert.throws(() => buildFantasySnapshot(input), undefined, mutate.toString());
  }
});

test('prior game coverage requires both team sides and correct game/opponent identities', () => {
  const incomplete = fixture();
  incomplete.stats = incomplete.stats.filter(row => !(row.team === 'SEA' && row.week === '2'));
  assert.throws(() => buildFantasySnapshot(incomplete), /Prior-game statistics coverage is incomplete/);
  const wrongOpponent = fixture();
  wrongOpponent.stats[0].opponent_team = 'SEA';
  assert.throws(() => buildFantasySnapshot(wrongOpponent), /game identity do not match/);
  const wrongWeek = fixture();
  wrongWeek.stats[0].week = '2';
  assert.throws(() => buildFantasySnapshot(wrongWeek), /game identity do not match/);
});

test('public player and stat output use a field allowlist; raw odds, identities, images and notes do not propagate', () => {
  const input = fixture(), secret = 'never-export-this-fixture-marker';
  for (const collection of [input.stats, input.rosters, input.injuries, input.schedule]) for (const row of collection) Object.assign(row, {
    email: secret, notes: secret, headshot_url: `https://example.test/${secret}`, spread_line: secret, total_line: secret, picks: [secret], scoringReferences: secret,
  });
  const snapshot = buildFantasySnapshot(input), sea = find(snapshot, 'SEA');
  assert.doesNotMatch(JSON.stringify(snapshot), new RegExp(secret));
  assert.deepEqual(Object.keys(sea).sort(), ['history', 'id', 'name', 'position', 'restOfSeason', 'sampleGames', 'status', 'team', 'weekly']);
  assert.deepEqual(Object.keys(sea.weekly).sort(), ['kickoff', 'opponent', 'stats', 'status']);
  assert.deepEqual(Object.keys(sea.restOfSeason).sort(), ['games', 'stats']);
  const scoringKeys = ['passingYards', 'passingTds', 'interceptions', 'rushingYards', 'rushingTds', 'receptions', 'receivingYards', 'receivingTds', 'fumblesLost', 'twoPointConversions', 'specialTeamsTds', 'targets', 'carries', 'passingAttempts'].sort();
  assert.deepEqual(Object.keys(sea.weekly.stats).sort(), scoringKeys);
  assert.deepEqual(Object.keys(sea.history[0]).sort(), [...scoringKeys, 'week'].sort());
});

test('matchups sum what each defense allowed by offensive position per prior game, as raw stats', () => {
  const input = fixture();
  input.stats.push(rawStats('SEA', 3, { player_id: 'fixture-SEA-wr', position: 'WR', receptions: '6', receiving_yards: '75', rushing_yards: '0', carries: '0' }));
  const snapshot = buildFantasySnapshot(input);
  assert.equal(snapshot.schemaVersion, 2);
  const opponent = TEAMS[TEAMS.indexOf('SEA') ^ 1];
  const game = snapshot.matchups[opponent].find(row => row.week === 3);
  assert.equal(game.opponent, 'SEA');
  assert.equal(game.allowed.WR.receptions, 6);
  assert.equal(game.allowed.WR.receivingYards, 75);
  assert.equal(game.allowed.RB.rushingYards, 30, 'the SEA fixture RB rushed 3 × 10 yards in Week 3');
  assert.equal(game.allowed.TE.receptions, 0);
  assert.ok(snapshot.matchups[opponent].every(row => row.week < 6));
  assert.ok(!('CB' in game.allowed), 'only QB, RB, WR and TE are aggregated');
  assert.equal(validateFantasySnapshot(snapshot, { now: GENERATED }).valid, true);
});

test('schema 1 snapshots stay valid and a schema 2 snapshot needs well-formed matchups', () => {
  const snapshot = buildFantasySnapshot(fixture());
  assert.equal(validateFantasySnapshot({ ...snapshot, schemaVersion: 1, matchups: undefined, rosterFallbackTeams: undefined }, { now: GENERATED }).valid, true);
  assert.equal(validateFantasySnapshot({ ...snapshot, matchups: null }, { now: GENERATED }).valid, false);
  const team = Object.keys(snapshot.matchups)[0];
  const broken = structuredClone(snapshot); broken.matchups[team][0].allowed.WR = null;
  assert.equal(validateFantasySnapshot(broken, { now: GENERATED }).valid, false);
  const future = structuredClone(snapshot); future.matchups[team][0].week = 6;
  assert.equal(validateFantasySnapshot(future, { now: GENERATED }).valid, false);
});
