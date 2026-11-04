// Public NFL-statistics fixtures only. These exercise the snapshot builder without downloads or GTL accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAM_NAMES } from '../shared/nfl-schedule.mjs';
import { FANTASY_METHOD, USAGE_SETTINGS, buildFantasySnapshot, completedWeeks, estimatePace, normalizePlayerStats, parseFantasyCsv } from '../shared/fantasy-build.mjs';
import { buildRankings, scoreStats, validateFantasySnapshot } from '../shared/fantasy-rankings.mjs';
import { countsTowardLeague, leagueRates, usage } from '../shared/fantasy-usage.mjs';

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
const round = value => Math.round(value * 1e6) / 1e6;
const roundStats = stats => Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, round(value)]));
// The league rates the backtest would build from the same input: every prior regular-season appearance this season.
const leagueFrom = stats => leagueRates(stats.filter(row => row.season === String(SEASON) && row.season_type === 'REG' && Number(row.week) < WEEK)
  .flatMap(row => { const line = normalizePlayerStats(row); return countsTowardLeague(row.position, line) ? [{ position: row.position, stats: line }] : []; }));
const usageFor = (player, league) => roundStats(usage(player.history, { week: WEEK, position: player.position, league, ...USAGE_SETTINGS }));

// One position per team (QB, RB, WR, TE in turn) with lines that vary by team and week, so league rates, shrinkage and
// recency weighting all move the estimate. With bench, eight non-rostered receivers also appear in Weeks 1-5.
function variedFixture({ bench = true } = {}) {
  const input = fixture(), slots = ['QB', 'RB', 'WR', 'TE'], text = line => Object.fromEntries(Object.entries(line).map(([key, value]) => [key, String(value)]));
  const lineFor = (position, t, w) => ({
    QB: { attempts: 28 + (t % 7) + w, passing_yards: 190 + 11 * (t % 5) + 6 * w, passing_tds: (t + w) % 3, passing_interceptions: w % 2, carries: 3, rushing_yards: 9 + (t % 4) },
    RB: { carries: 12 + ((t + w) % 5), rushing_yards: 50 + 7 * (t % 6) + 2 * w, rushing_tds: (t * w) % 2, targets: 3, receptions: 2 + (t % 2), receiving_yards: 14 + w },
    WR: { targets: 6 + ((t * w) % 5), receptions: 4 + (w % 3), receiving_yards: 48 + 9 * (t % 4) + 3 * w, receiving_tds: (t + w) % 2 },
    TE: { targets: 4 + ((t + w) % 3), receptions: 3 + (t % 2), receiving_yards: 30 + 4 * (t % 3) + w, receiving_tds: w === 4 ? 1 : 0 },
  })[position];
  for (const row of input.stats.filter(row => row.player_id.startsWith('fixture-'))) {
    const t = TEAMS.indexOf(row.team), position = slots[t % 4];
    Object.assign(row, { position, rushing_yards: '0', carries: '0' }, text(lineFor(position, t, Number(row.week))));
  }
  for (const row of input.rosters) row.position = slots[TEAMS.indexOf(row.team) % 4];
  if (bench) for (const team of TEAMS.slice(0, 8)) for (const week of [1, 2, 3, 4, 5]) input.stats.push(rawStats(team, week, {
    player_id: `bench-${team}`, position: 'WR', rushing_yards: '0', carries: '0', targets: '5', receptions: '5', receiving_yards: '90', receiving_tds: '1',
  }));
  return input;
}

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

test('skill positions use usage with the tuned settings; kickers use pace', () => {
  // D-76: the settings the Board item 64 backtest chose on 2024 alone. Changing them needs a new backtest.
  assert.deepEqual({ ...USAGE_SETTINGS }, { halfLife: 4, kEff: 25, kTd: 50 });
  assert.ok(Object.isFrozen(USAGE_SETTINGS));
  // Pace 1.1 stays exported for kickers and the backtest: 60% of the latest three appearances plus 40% of all of them.
  const data = [10, 20, 30, 40, 50].map((yards, index) => ({ week: index + 1, rushingYards: yards, receptions: 2 }));
  assert.deepEqual(estimatePace(data), { rushingYards: 36, receptions: 2 });
  assert.equal(estimatePace(data.slice(0, 1)), null);
  assert.equal(estimatePace([]), null);
  assert.equal(estimatePace([{ week: 1, rushingYards: 0 }, { week: 2, rushingYards: 0 }]).rushingYards, 0);
  data[0].rushingYards = null;
  assert.equal(estimatePace(data).rushingYards, null, 'an unknown prior value cannot become a zero or vanish');

  const input = fixture(), kickerTeam = 'SEA';
  for (const row of input.stats.filter(row => row.player_id === playerId(kickerTeam))) Object.assign(row, {
    position: 'K', fg_made_0_19: '0', fg_made_20_29: '1', fg_made_30_39: String(Number(row.week) % 2), fg_made_40_49: row.week === '5' ? '2' : '0',
    fg_made_50_59: '0', fg_made_60_: '0', pat_made: row.week, fg_missed: '0', fg_blocked: '0', pat_missed: '0', pat_blocked: '0',
  });
  input.rosters.find(row => row.team === kickerTeam).position = 'K';
  const snapshot = buildFantasySnapshot(input), kicker = find(snapshot, kickerTeam), back = find(snapshot, 'DEN');
  assert.deepEqual(kicker.weekly.stats, estimatePace(kicker.history), 'the backtest did not cover kickers, so they keep pace 1.1');
  assert.equal(kicker.weekly.stats.extraPoints, 3.6, '0.6 × 4 (Weeks 3-5) + 0.4 × 3 (Weeks 1-5)');
  // Each fixture back has 10 carries a week at 3.0 yards a carry, the RB league rate: usage gives 30 where pace gave 36.
  assert.deepEqual(back.weekly.stats, usageFor(back, leagueFrom(input.stats)));
  assert.equal(back.weekly.stats.rushingYards, 30);
  assert.notDeepEqual(back.weekly.stats, estimatePace(back.history));
});

test('the build\'s weekly estimate is usage() on the same history, week and league rates, so it grades what the backtest measured', () => {
  const input = variedFixture(), snapshot = buildFantasySnapshot(input), league = leagueFrom(input.stats);
  assert.equal(validateFantasySnapshot(snapshot, { now: GENERATED }).valid, true);
  let checked = 0;
  for (const player of snapshot.players.filter(player => player.weekly.stats)) {
    const expected = usageFor(player, league);
    assert.deepEqual(player.weekly.stats, expected, player.id);
    assert.deepEqual(player.restOfSeason.stats, Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, round(value * player.restOfSeason.games)])), `${player.id}: rest of season is the weekly estimate × remaining games`);
    assert.notDeepEqual(player.weekly.stats, estimatePace(player.history), `${player.id}: not pace`);
    checked++;
  }
  assert.equal(checked, 30, 'every scheduled player is checked; ARI and ATL are on bye');
  assert.deepEqual(new Set(snapshot.players.filter(player => player.weekly.stats).map(player => player.position)), new Set(['QB', 'RB', 'WR', 'TE']));
  // League rates use every prior appearance, rostered or not: dropping the bench receivers changes a rostered WR.
  const receiver = TEAMS[2], withoutBench = buildFantasySnapshot(variedFixture({ bench: false }));
  assert.equal(find(snapshot, receiver).position, 'WR');
  assert.notDeepEqual(find(withoutBench, receiver).weekly.stats, find(snapshot, receiver).weekly.stats);
  assert.equal(snapshot.players.some(player => player.id.startsWith('bench-')), false, 'bench players are not on the active roster');
});

test('snapshot uses prior regular-season appearances and ignores other-season/postseason rows', () => {
  const input = fixture();
  input.stats.push(rawStats('SEA', 1, { season: '2025', rushing_yards: '99999' }), rawStats('SEA', 1, { season_type: 'POST', rushing_yards: '99999' }));
  const snapshot = buildFantasySnapshot(input), sea = find(snapshot, 'SEA');
  assert.equal(sea.sampleGames, 5);
  assert.equal(sea.weekly.stats.rushingYards, 30, '10 carries × 3.0 yards; the 99999-yard rows never enter');
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
  assert.equal(bye.restOfSeason.stats.rushingYards, 360, 'a bye keeps rest of season: 30 a game × 12 games');
  const weekly = buildRankings(snapshot, {}, { now: GENERATED });
  assert.equal(weekly.rows.length, 30);
  assert.equal(weekly.rows.some(row => row.id === bye.id), false);
  const ros = buildRankings(snapshot, { scope: 'ros' }, { now: GENERATED });
  assert.equal(ros.rows.length, 32);
  assert.equal(ros.rows.find(row => row.id === bye.id).perGame, 3);
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

test('a team on bye last week may use the roster from its last game, counted, never older', () => {
  // The third and fourth teams move their Week 5 game to Week 18, so Week 5 is their bye and nflverse has no Week 5 roster
  // for them (as with HOU, NO, NYG and SF before Week 9 of 2026). Their latest roster is from Week 4, their last game.
  const [, , away, home] = TEAMS;
  const byeLastWeek = rosterWeek => {
    const input = fixture();
    const game = input.schedule.find(row => row.week === '5' && row.away_team === away);
    Object.assign(game, { week: '18', game_id: `fixture-${SEASON}-18-${away}-${home}` });
    input.stats = input.stats.filter(row => !([away, home].includes(row.team) && row.week === '5'));
    for (const row of input.rosters) if ([away, home].includes(row.team)) row.week = String(rosterWeek);
    return input;
  };
  const snapshot = buildFantasySnapshot(byeLastWeek(4));
  assert.deepEqual(snapshot.rosterFallbackTeams, [away, home].sort(), 'a roster from before this week is counted');
  assert.match(find(snapshot, away).status, /active roster as of Week 4/);
  assert.equal(find(snapshot, away).weekly.status === 'bye', false, 'the team plays this week');
  assert.throws(() => buildFantasySnapshot(byeLastWeek(3)), /roster coverage/i, 'a roster older than the last game still fails closed');
});

test('Out and Doubtful suppress weekly estimates but retain the conditional ROS estimate; old reports are ignored', () => {
  const input = fixture();
  const injury = (team, report_status, week = WEEK) => ({ season: String(SEASON), week: String(week), season_type: 'REG', gsis_id: playerId(team), team, report_status, practice_status: 'Did Not Participate' });
  input.injuries = [injury('SEA', 'Out'), injury('DEN', 'Doubtful'), injury('GB', 'Questionable'), injury('PIT', 'Out', WEEK - 1)];
  const snapshot = buildFantasySnapshot(input);
  for (const team of ['SEA', 'DEN']) {
    const p = find(snapshot, team);
    assert.equal(p.weekly.status, 'scheduled');
    assert.equal(p.weekly.stats, null);
    assert.equal(p.restOfSeason.stats.rushingYards, 360, 'the conditional rest-of-season estimate stays: 30 × 12 games');
    assert.match(p.status, /Out|Doubtful/);
  }
  assert.notEqual(find(snapshot, 'GB').weekly.stats, null);
  assert.notEqual(find(snapshot, 'PIT').weekly.stats, null);
  assert.match(snapshot.method.description, /assuming an active-roster player is available/);
  assert.match(snapshot.method.description, /No injury return date/);
});

test('snapshots carry method GTL usage 2.0, which validation accepts, and its description names what it does and does not do', () => {
  const snapshot = buildFantasySnapshot(fixture());
  assert.deepEqual(snapshot.method, FANTASY_METHOD);
  assert.equal(snapshot.method.name, 'GTL usage');
  assert.equal(snapshot.method.version, '2.0');
  assert.ok(Object.isFrozen(FANTASY_METHOD));
  assert.equal(validateFantasySnapshot(snapshot, { now: GENERATED }).valid, true);
  for (const phrase of [/expected targets, carries and pass attempts/, /recent weeks counting more/, /pulled toward the position average/,
    /touchdown rates are pulled harder/, /Kickers, and any player with incomplete usage stats, use the earlier pace method/,
    /at least two appearances are required/, /No injury return date, depth-chart role or matchup adjustment/]) assert.match(snapshot.method.description, phrase);
  const words = snapshot.method.description.split(/\s+/).length;
  assert.ok(words >= 100 && words <= 120, `fine print stays about 100-120 words (${words})`);
});

test('a skill player with an unknown usage stat falls back to pace instead of losing his estimate; under two appearances is still null', () => {
  const input = fixture();
  input.stats.find(row => row.player_id === playerId('GB') && row.week === '2').targets = '';
  input.stats = input.stats.filter(row => row.player_id !== playerId('DEN') || row.week === '5');
  input.stats.find(row => row.player_id === playerId('DEN')).targets = '';
  const snapshot = buildFantasySnapshot(input), gb = find(snapshot, 'GB'), sea = find(snapshot, 'SEA');
  assert.equal(gb.history.find(row => row.week === 2).targets, null);
  assert.equal(usage(gb.history, { week: WEEK, position: 'RB', league: leagueFrom(input.stats), ...USAGE_SETTINGS }), null, 'usage() cannot use this history');
  assert.deepEqual(gb.weekly.stats, estimatePace(gb.history), 'the estimate is pace 1.1');
  assert.equal(gb.weekly.stats.rushingYards, 36, 'pace, not usage (30)');
  assert.equal(gb.weekly.stats.targets, null, 'the unknown stat stays unknown, never zero');
  assert.equal(gb.restOfSeason.stats.rushingYards, round(36 * gb.restOfSeason.games));
  assert.equal(gb.restOfSeason.stats.targets, null);
  // Complete histories still use usage. The incomplete GB and DEN rows leave the league rates, so SEA is not exactly 30.
  assert.deepEqual(sea.weekly.stats, usageFor(sea, leagueFrom(input.stats)), 'complete histories still use usage');
  assert.equal(find(snapshot, 'DEN').sampleGames, 1);
  assert.equal(find(snapshot, 'DEN').weekly.stats, null, 'one appearance still gives no estimate');
  assert.equal(find(snapshot, 'DEN').restOfSeason.stats, null);
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
