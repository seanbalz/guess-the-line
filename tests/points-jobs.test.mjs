import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NFLVERSE, POINTS_RULES, actualsPayload, draftSlate, linesFor, playedEvidence, pointsOpensAt, rosterFacts, scheduleGames, slatePlayers, weekSnaps, weekStats, weekStatsRows } from '../shared/points-jobs.mjs';
import { slateProblem } from '../shared/points-slate.mjs';

// D-56 / P-03 pure job logic: snapshot -> draft slate, nflverse CSVs -> actuals payload. Fixture CSVs copy the real
// column order for the columns used (headshot_url is quoted and holds a comma). Players are fictional.

const SNAPSHOT_PATH = new URL('../shared/fantasy/2026-week-06.json', import.meta.url);
const snapshotText = readFileSync(SNAPSHOT_PATH, 'utf8');
const snapshot = JSON.parse(snapshotText);
const sha = createHash('sha256').update(snapshotText).digest('hex');

// Games built from the snapshot itself (nflverse ids, app codes, the snapshot's kickoffs).
const GAMES = (() => {
  const seen = new Map();
  for (const p of snapshot.players) {
    const id = /^(vs|@) ([A-Z]{2,3})$/.exec(p.weekly.opponent ?? '');
    if (!id || !p.weekly.kickoff) continue;
    const [away, home] = id[1] === 'vs' ? [id[2], p.team] : [p.team, id[2]];
    seen.set(`${away}-${home}`, { gameId: `2026_06_${away}_${home}`, week: 6, away, home, kickoff: p.weekly.kickoff });
  }
  return [...seen.values()];
})();
const BEFORE = Date.parse('2026-10-13T20:00:00Z');

const GAME_COLS = 'game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location';
const gamesCsv = [GAME_COLS,
  '2026_06_SEA_DEN,2026,REG,6,2026-10-15,Thursday,20:15,SEA,14,DEN,17,Home',
  '2026_06_LA_SF,2026,REG,6,2026-10-18,Sunday,16:25,LA,,SF,,Home',
  '2026_06_HOU_JAX,2026,REG,6,2026-10-18,Sunday,09:30,HOU,34,JAX,31,Neutral',
  '2026_P1_AAA_BBB,2026,PRE,1,2026-08-10,Monday,20:00,AAA,,BBB,,Home',
  '2025_06_SEA_DEN,2025,REG,6,2025-10-12,Sunday,13:00,SEA,,DEN,,Home',
  '2026_09_DAL_GB,2026,REG,9,2026-11-08,Sunday,13:00,DAL,,GB,,Home'].join('\n');

test('contract: the rules version is pinned to Full PPR with 4-point passing touchdowns', () => {
  assert.deepEqual(POINTS_RULES, { format: 'ppr', passingTds: 4, version: 'ppr4-v1' });
  assert.ok(Object.isFrozen(POINTS_RULES));
  assert.equal(NFLVERSE.stats(2026), 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv');
  assert.equal(NFLVERSE.snaps(2026), 'https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2026.csv');
  assert.equal(NFLVERSE.rosters(2026), 'https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_2026.csv');
  assert.equal(NFLVERSE.games(), 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv');
});

test('contract: a week opens Tuesday 12:00 PM Pacific, in daylight and standard time', () => {
  assert.equal(pointsOpensAt('2026-10-30T00:15:00Z'), '2026-10-27T19:00:00.000Z'); // TNF Oct 29 (PDT)
  assert.equal(pointsOpensAt('2026-11-06T01:15:00Z'), '2026-11-03T20:00:00.000Z'); // TNF Nov 5 (PST)
  assert.equal(pointsOpensAt('2026-10-16T00:15:00Z'), '2026-10-13T19:00:00.000Z'); // Week 6
});

test('contract: scheduleGames keeps this season REG games only, maps LA to LAR and converts Eastern to UTC', () => {
  const games = scheduleGames(gamesCsv, { season: 2026 });
  assert.deepEqual(games.map(g => g.gameId), ['2026_06_SEA_DEN', '2026_06_LA_SF', '2026_06_HOU_JAX', '2026_09_DAL_GB']);
  assert.deepEqual(games[0], { gameId: '2026_06_SEA_DEN', week: 6, away: 'SEA', home: 'DEN', kickoff: '2026-10-16T00:15:00.000Z' });
  assert.equal(games[1].away, 'LAR');
  assert.equal(games[1].gameId, '2026_06_LA_SF'); // the nflverse id is kept verbatim
  assert.equal(games[1].kickoff, '2026-10-18T20:25:00.000Z');
  assert.equal(games[3].week, 9);
});

test('contract: the LA game keeps its nflverse game_id and joins a LAR snapshot player', () => {
  const csv = `${GAME_COLS}
2026_06_SEA_LA,2026,REG,6,2026-10-18,Sunday,16:25,SEA,,LA,,Home`;
  const games = scheduleGames(csv, { season: 2026 });
  assert.deepEqual([games[0].away, games[0].home], ['SEA', 'LAR']);
  const stats = { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 5, receivingYards: 50, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0 };
  const player = { id: 'la-wr', name: 'La Wr', team: 'LAR', position: 'WR', status: 'Active', weekly: { status: 'scheduled', opponent: 'vs SEA', kickoff: '2026-10-18T20:25:00.000Z', stats } };
  const rows = slatePlayers({ players: [player] }, { season: 2026, week: 6, games });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].gameKey, '2026_06_SEA_LA');
});

test('contract: a game with no date or time is left out, never invented', () => {
  const csv = `${GAME_COLS}\n2026_20_AAA_BBB,2026,REG,20,,,,AAA,,BBB,,Home`;
  assert.deepEqual(scheduleGames(csv, { season: 2026 }), []);
});

test('contract: draftSlate on the committed Week 6 snapshot is deterministic and well-formed', () => {
  const args = { snapshot, snapshotFile: 'shared/fantasy/2026-week-06.json', snapshotSha256: sha, season: 2026, week: 6, games: GAMES, now: BEFORE };
  const a = draftSlate(args), b = draftSlate(args);
  assert.equal(a.ok, true, a.reason);
  assert.deepEqual(a, b);
  const { slate } = a;
  assert.deepEqual(slate.slots.map(s => s.slot), ['QB', 'RB', 'WR', 'TE', 'FLEX']);
  assert.equal(slateProblem(slate.slots), null);
  for (const s of slate.slots) {
    assert.match(s.gameKey, /^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/);
    assert.ok(GAMES.some(g => g.gameId === s.gameKey));
    const source = snapshot.players.find(p => p.id === s.playerId);
    assert.equal(s.team, source.team);
    assert.equal(s.kickoff, source.weekly.kickoff);
  }
  assert.equal(slate.opensAt, '2026-10-13T19:00:00.000Z');
  assert.deepEqual(slate.scoringRules, POINTS_RULES);
  assert.deepEqual(Object.keys(slate.house), ['QB', 'RB', 'WR', 'TE', 'FLEX']);
  for (const s of slate.slots) {
    const row = slatePlayers(snapshot, { season: 2026, week: 6, games: GAMES }).find(p => p.id === s.playerId);
    assert.equal(slate.house[s.slot], row.estimate);
    assert.ok(Number.isFinite(row.estimate));
  }
  assert.deepEqual(slate.provenance, { snapshotFile: 'shared/fantasy/2026-week-06.json', sha256: sha, generatedAt: snapshot.generatedAt,
    statsThroughWeek: 5, selectionVersion: 'points-slate-v1', seed: '2026-06-points-slate-v1' });
});

test('failure: a stale snapshot, a missing schedule or a started week fails closed', () => {
  const base = { snapshot, snapshotFile: 'f', snapshotSha256: sha, season: 2026, week: 6, games: GAMES, now: BEFORE };
  assert.deepEqual(draftSlate({ ...base, week: 7 }), { ok: false, reason: 'stale_snapshot' });
  assert.deepEqual(draftSlate({ ...base, season: 2025 }), { ok: false, reason: 'stale_snapshot' });
  assert.deepEqual(draftSlate({ ...base, snapshot: { ...snapshot, statsThroughWeek: 4 } }), { ok: false, reason: 'stale_snapshot' });
  assert.deepEqual(draftSlate({ ...base, games: [] }), { ok: false, reason: 'no_games' });
  assert.deepEqual(draftSlate({ ...base, games: GAMES.map(g => ({ ...g, week: 7 })) }), { ok: false, reason: 'no_games' });
  const first = Math.min(...GAMES.map(g => Date.parse(g.kickoff)));
  assert.equal(draftSlate({ ...base, now: first }).reason, 'kicked_off');
  assert.equal(draftSlate({ ...base, now: first - 1 }).ok, true);
});

test('failure: the builder reasons pass through, and a player without a scheduled game is left out', () => {
  assert.equal(draftSlate({ snapshot, snapshotFile: 'f', snapshotSha256: sha, season: 2026, week: 6, games: [GAMES[0]], now: BEFORE }).ok, false);
  const rows = slatePlayers(snapshot, { season: 2026, week: 6, games: [GAMES[0]] });
  assert.ok(rows.length > 0 && rows.length < snapshot.players.length);
  assert.ok(rows.every(r => r.gameKey === GAMES[0].gameId));
});

test('contract: report status is the first status segment when Out, Doubtful or Questionable', () => {
  const game = { gameId: '2026_06_AAA_BBB', week: 6, away: 'AAA', home: 'BBB', kickoff: '2026-10-18T17:00:00.000Z' };
  const stats = { passingYards: 200, passingTds: 1, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0 };
  const mk = (id, status) => ({ id, name: id, team: 'AAA', position: 'QB', status, weekly: { status: 'scheduled', opponent: '@ BBB', kickoff: game.kickoff, stats } });
  const rows = slatePlayers({ players: [mk('a', 'Out · Did Not Participate in Practice · active roster as of Week 6'), mk('b', 'Questionable · Limited'), mk('c', 'Game availability not confirmed · active')] }, { season: 2026, week: 6, games: [game] });
  assert.deepEqual(rows.map(r => r.reportStatus), ['Out', 'Questionable', '']);
  assert.equal(rows[0].estimate, 12); // 200 yards at 0.04 + one 4-point touchdown
});

// ---- nflverse fixtures ----
const STAT_COLS = ['player_id', 'player_name', 'player_display_name', 'position', 'headshot_url', 'season', 'week', 'season_type', 'game_id', 'team', 'opponent_team', 'attempts', 'passing_yards', 'passing_tds', 'passing_interceptions', 'passing_2pt_conversions', 'carries', 'rushing_yards', 'rushing_tds', 'rushing_2pt_conversions', 'receptions', 'targets', 'receiving_yards', 'receiving_tds', 'receiving_2pt_conversions', 'special_teams_tds', 'fumbles_lost_total', 'fg_made_0_19', 'fg_made_20_29', 'fg_made_30_39', 'fg_made_40_49', 'fg_made_50_59', 'fg_made_60_', 'fg_missed', 'fg_blocked', 'pat_made', 'pat_missed', 'pat_blocked'];
const statRow = o => STAT_COLS.map(c => (c === 'headshot_url' ? '"https://x.test/a,b.png"' : (o[c] ?? '0'))).join(',');
const statsCsv = [STAT_COLS.join(','),
  statRow({ player_id: '00-0000001', player_name: 'A.Wr', player_display_name: 'Al Wr', position: 'WR', season: '2026', week: '7', season_type: 'REG', game_id: '2026_07_SEA_LA', team: 'LA', opponent_team: 'SEA', receptions: '5', targets: '8', receiving_yards: '66', receiving_tds: '1' }),
  statRow({ player_id: '00-0000002', player_name: 'B.Rb', player_display_name: 'Bo Rb', position: 'RB', season: '2026', week: '6', season_type: 'REG', game_id: '2026_06_SEA_DEN', team: 'SEA', opponent_team: 'DEN', rushing_yards: '80' }),
  statRow({ player_id: '00-0000003', player_name: 'C.Qb', player_display_name: 'Cy Qb', position: 'QB', season: '2026', week: '7', season_type: 'REG', game_id: '2026_07_SEA_LA', team: 'SEA', opponent_team: 'LA', passing_yards: '250', passing_tds: '2', passing_interceptions: '1', rushing_yards: '10' }),
  statRow({ player_id: '00-0000004', player_name: 'D.K', player_display_name: 'Dee K', position: 'K', season: '2026', week: '7', season_type: 'REG', game_id: '2026_07_SEA_LA', team: 'SEA', opponent_team: 'LA', fg_made_20_29: '1', fg_made_40_49: '1', pat_made: '2' }),
  statRow({ player_id: '00-0000005', player_name: 'E.Wr', player_display_name: 'Ed Wr', position: 'WR', season: '2026', week: '7', season_type: 'POST', game_id: '2026_07_SEA_LA', team: 'SEA' }),
  statRow({ player_id: '00-0000006', player_name: 'F.Ol', player_display_name: 'Fy Ol', position: 'OL', season: '2026', week: '7', season_type: 'REG', game_id: '2026_07_SEA_LA', team: 'SEA' }),
].join('\n');

test('contract: weekStatsRows keeps the week, maps LA to LAR and scores Full PPR 4-point to one decimal', () => {
  const rows = weekStatsRows(statsCsv, { season: 2026, week: 7 });
  assert.deepEqual(rows.map(r => r.playerId), ['00-0000001', '00-0000003', '00-0000004']);
  const wr = rows[0];
  assert.deepEqual({ ...wr, stats: undefined }, { playerId: '00-0000001', name: 'Al Wr', team: 'LAR', position: 'WR', gameKey: '2026_07_SEA_LA', stats: undefined, points: 17.6 }); // 5 + 6.6 + 6
  assert.equal(rows[1].points, 17); // 250*.04 + 2*4 - 2 + 1 (rushing 10 yards)
  assert.equal(rows[2].points, 3 + 4 + 2 + 0); // K: 3-pt FG, 4-pt FG, two extra points
});

test('failure: a missing stat leaves points null (never zero) and a duplicate player row throws', () => {
  const broken = statsCsv.replace(/,66,/, ',NA,');
  assert.equal(weekStatsRows(broken, { season: 2026, week: 7 })[0].points, null);
  assert.throws(() => weekStatsRows(`${statsCsv}\n${statsCsv.split('\n')[1]}`, { season: 2026, week: 7 }), /Duplicate/);
});

test('contract: weekStats keeps the scored rows unchanged and lists every player id in the week at any position', () => {
  const week = weekStats(statsCsv, { season: 2026, week: 7 });
  assert.deepEqual(week.rows, weekStatsRows(statsCsv, { season: 2026, week: 7 }));
  // The OL row counts as a row for its player; the POST row and the week 6 row do not.
  assert.deepEqual([...week.playerIds].sort(), ['00-0000001', '00-0000003', '00-0000004', '00-0000006']);
  assert.deepEqual([...weekStats(statsCsv, { season: 2026, week: 6 }).playerIds], ['00-0000002']);
  assert.equal(weekStats(statsCsv, { season: 2026, week: 9 }).playerIds.size, 0);
});

const SNAP_HEADER = 'game_id,pfr_game_id,season,game_type,week,player,pfr_player_id,position,team,opponent,offense_snaps,offense_pct,defense_snaps,defense_pct,st_snaps,st_pct';
const snapsCsv = [SNAP_HEADER,
  '2026_07_SEA_LA,x,2026,REG,7,Al Wr,WrAl00,WR,SEA,LA,40,0.6,0,0,2,0.1',
  '2026_06_SEA_DEN,y,2026,REG,6,Al Wr,WrAl00,WR,SEA,DEN,50,0.7,0,0,0,0',
  '2026_07_SEA_LA,x,2026,REG,7,Zed Zero,ZeZe00,TE,SEA,LA,0,0,0,0,0,0'].join('\n');
const ROSTER_HEADER = 'season,team,position,status,full_name,gsis_id,pfr_id,week,game_type';
const rosterCsv = [ROSTER_HEADER,
  '2026,SEA,WR,ACT,Al Wr,00-0000001,WrAl00,7,REG',
  '2026,SEA,RB,INA,Bo Rb,00-0000002,RbBo00,7,REG',
  '2026,SEA,RB,ACT,Bo Rb,00-0000002,RbBo00,6,REG',
  '2026,SEA,TE,RES,Cy Te,00-0000003,,7,REG'].join('\n');

test('contract: snap counts add offense and special-teams snaps for the week only', () => {
  const snaps = weekSnaps(snapsCsv, { season: 2026, week: 7 });
  assert.equal(snaps.get('WrAl00'), 42);
  assert.equal(snaps.get('ZeZe00'), 0);
  assert.equal(snaps.size, 2);
});

test('contract: roster facts are the requested players for the week, with a null pfr id when blank', () => {
  const facts = rosterFacts(rosterCsv, { season: 2026, week: 7, playerIds: ['00-0000001', '00-0000002', '00-0000003', '00-0000009'] });
  assert.deepEqual(facts.get('00-0000002'), { pfrId: 'RbBo00', status: 'INA' });
  assert.deepEqual(facts.get('00-0000003'), { pfrId: null, status: 'RES' });
  assert.equal(facts.has('00-0000009'), false);
  assert.equal(facts.size, 3);
});

test('failure: conflicting duplicate roster rows for one player-week have no status; identical duplicates are fine', () => {
  const csv = [ROSTER_HEADER,
    '2026,SEA,WR,ACT,Al Wr,00-0000001,WrAl00,7,REG',
    '2026,SEA,WR,INA,Al Wr,00-0000001,WrAl00,7,REG',
    '2026,SEA,RB,INA,Bo Rb,00-0000002,RbBo00,7,REG',
    '2026,SEA,RB,INA,Bo Rb,00-0000002,RbBo00,7,REG'].join('\n');
  const facts = rosterFacts(csv, { season: 2026, week: 7, playerIds: ['00-0000001', '00-0000002'] });
  assert.deepEqual(facts.get('00-0000001'), { pfrId: 'WrAl00', status: null });
  assert.deepEqual(facts.get('00-0000002'), { pfrId: 'RbBo00', status: 'INA' });
  assert.deepEqual(playedEvidence({ hasStats: false, rosterStatus: facts.get('00-0000001').status }), { played: null, basis: 'unknown' });
});

test('contract: played evidence follows the design precedence', () => {
  const e = playedEvidence;
  assert.deepEqual(e({ hasStats: true, snapCount: 0, rosterStatus: 'INA', movedOutOfWeek: true }), { played: true, basis: 'stats' });
  assert.deepEqual(e({ hasStats: false, movedOutOfWeek: true, rosterStatus: 'INA' }), { played: false, basis: 'postponed' });
  assert.deepEqual(e({ hasStats: false, rosterStatus: 'INA', snapCount: 30 }), { played: false, basis: 'inactive' });
  assert.deepEqual(e({ hasStats: false, rosterStatus: 'RES' }), { played: false, basis: 'reserve' });
  assert.deepEqual(e({ hasStats: false, rosterStatus: 'SUS' }), { played: false, basis: 'reserve' });
  assert.deepEqual(e({ hasStats: false, rosterStatus: 'ACT', snapCount: 3 }), { played: true, basis: 'snaps' });
  assert.deepEqual(e({ hasStats: false, rosterStatus: 'ACT', snapCount: 0 }), { played: false, basis: 'no_snaps' });
  assert.deepEqual(e({ hasStats: false, rosterStatus: 'ACT' }), { played: null, basis: 'unknown' });
  assert.deepEqual(e({ hasStats: false }), { played: null, basis: 'unknown' });
});

const SOURCE = { url: NFLVERSE.stats(2026), release: 'stats_player', publishedAt: '2026-10-27T04:46:00Z', retrievedAt: '2026-10-27T12:00:00Z', sha256: 'a'.repeat(64) };
const slotsFor = ids => ids.map(([slot, playerId, gameKey, team = 'SEA', position = 'WR']) => ({ slot, playerId, name: `Name ${playerId}`, team, position, gameKey, kickoff: '2026-10-18T17:00:00.000Z' }));

test('contract: actualsPayload adds slate players without stats with the right evidence and passes the loader shape', () => {
  const { rows: statsRows, playerIds: statsPlayerIds } = weekStats(statsCsv, { season: 2026, week: 7 });
  // PM-1's game was moved to week 8: nflverse lists it only under its new id (the slot keeps the week 7 id).
  const slots = slotsFor([['QB', '00-0000003', '2026_07_SEA_LA', 'SEA', 'QB'], ['RB', 'PM-1', '2026_07_BUF_NYJ', 'BUF', 'RB'],
    ['WR', 'IN-1', '2026_07_SEA_LA'], ['TE', 'RS-1', '2026_07_SEA_LA', 'SEA', 'TE'], ['FLEX', 'SN-1', '2026_07_SEA_LA']]);
  const roster = new Map([['IN-1', { pfrId: null, status: 'INA' }], ['RS-1', { pfrId: null, status: 'RES' }], ['SN-1', { pfrId: 'WrAl00', status: 'ACT' }]]);
  const games = [{ gameId: '2026_08_BUF_NYJ', week: 8, away: 'BUF', home: 'NYJ', kickoff: '2026-10-25T17:00:00.000Z' }, { gameId: '2026_07_SEA_LA', week: 7, away: 'SEA', home: 'LAR', kickoff: '2026-10-18T17:00:00.000Z' }];
  const payload = actualsPayload({ season: 2026, week: 7, statsRows, statsPlayerIds, slots, snaps: weekSnaps(snapsCsv, { season: 2026, week: 7 }), roster, games, versions: ['ppr4-v1'], source: SOURCE, coverage: { snapsSha256: 'b'.repeat(64), partial: false } });
  assert.equal(payload.season, 2026);
  assert.equal(payload.week, 7);
  assert.deepEqual(payload.source, SOURCE);
  assert.deepEqual(payload.coverage, { rows: 3, rowsWithoutNameOrTeam: 0, slatePlayersWithoutStats: 4, snapsSha256: 'b'.repeat(64), partial: false });
  const byId = Object.fromEntries(payload.players.map(p => [p.playerId, p]));
  assert.equal(payload.players.length, 7);
  assert.deepEqual(byId['00-0000001'].points, { 'ppr4-v1': 17.6 });
  assert.equal(byId['00-0000001'].played, true);
  assert.equal(byId['00-0000001'].playedBasis, 'stats');
  assert.equal(byId['00-0000003'].playedBasis, 'stats'); // the slot's player has a stats row: no extra row
  assert.deepEqual([byId['PM-1'].played, byId['PM-1'].playedBasis], [false, 'postponed']);
  assert.deepEqual([byId['IN-1'].played, byId['IN-1'].playedBasis], [false, 'inactive']);
  assert.deepEqual([byId['RS-1'].played, byId['RS-1'].playedBasis], [false, 'reserve']);
  assert.deepEqual([byId['SN-1'].played, byId['SN-1'].playedBasis], [true, 'snaps']);
  assert.deepEqual(byId['SN-1'].points, { 'ppr4-v1': 0 }, 'snaps, no stats row, and his game is in the stats file: he played and scored 0');
  assert.deepEqual(byId['SN-1'].stats, {});
  // P-01 gtl_points_load_actuals row validation (migration lines 497-502).
  for (const p of payload.players) {
    assert.match(p.playerId, /^[0-9A-Za-z-]{1,40}$/);
    assert.ok(p.name.length >= 1 && p.name.length <= 80);
    assert.match(p.team, /^[A-Z]{2,3}$/);
    assert.match(p.position, /^[A-Z]{1,4}$/);
    assert.match(p.gameKey, /^[0-9A-Za-z_-]{1,40}$/);
    assert.equal(typeof p.stats, 'object');
    assert.ok(Object.values(p.points).every(v => typeof v === 'number'));
    assert.ok([true, false, null].includes(p.played));
    assert.ok(p.playedBasis.length <= 60);
  }
});

test('contract: a game moved to another week (nflverse gives it a new game_id) voids postponed; a reversed rematch, a cancelled game or an id still in the week never does', () => {
  // Real games.csv shape: 2020 DEN at NE, first set for Week 5, exists only as 2020_06_DEN_NE; PIT at TEN (Week 4) only as
  // 2020_07_PIT_TEN. The slate keeps the id it was drawn with, so the move shows as that id gone and the same away and home
  // teams (same orientation) in another week.
  const row = (id, week, day) => { const [, , away, home] = id.split('_'); return `${id},2026,REG,${week},${day},Sunday,13:00,${away},,${home},,Home`; };
  const games = (...rows) => scheduleGames([GAME_COLS, '2026_06_SEA_DEN,2026,REG,6,2026-10-15,Thursday,20:15,SEA,,DEN,,Home', ...rows].join('\n'), { season: 2026 });
  const evidence = (list, { slot = ['WR', 'BN-1', '2026_06_BUF_NYJ', 'BUF'], roster = new Map() } = {}) => {
    const [p] = actualsPayload({ season: 2026, week: 6, statsRows: [], slots: slotsFor([slot]), snaps: new Map(), roster, games: list, versions: ['ppr4-v1'], source: SOURCE, coverage: {} }).players;
    return [p.played, p.playedBasis, p.points];
  };
  assert.deepEqual(evidence(games(row('2026_07_BUF_NYJ', 7, '2026-10-25'))), [false, 'postponed', {}], 'BUF at NYJ moved from week 6 to week 7');
  assert.deepEqual(evidence(games(row('2026_07_BUF_NYJ', 7, '2026-10-25')), { roster: new Map([['BN-1', { pfrId: null, status: 'INA' }]]) }), [false, 'postponed', {}], 'postponed precedes the roster');
  assert.deepEqual(evidence(games(row('2026_08_SEA_LA', 8, '2026-11-08')), { slot: ['WR', 'LA-1', '2026_06_SEA_LA', 'LAR'] }), [false, 'postponed', {}], 'the nflverse LA code maps to LAR on both sides');
  // A division rematch has home and away reversed: a different game, so never a move.
  assert.deepEqual(evidence(games(row('2026_12_NYJ_BUF', 12, '2026-11-29'))), [null, 'unknown', {}], 'NYJ at BUF is not BUF at NYJ');
  // Cancelled, or not in the file at all: never postponed; it stays pending for the commissioner (fail closed).
  assert.deepEqual(evidence(games()), [null, 'unknown', {}], 'no BUF at NYJ game anywhere');
  assert.deepEqual(evidence([]), [null, 'unknown', {}], 'an empty schedule');
  // The id still in the week: nothing changes, even with a same-orientation game listed elsewhere.
  assert.deepEqual(evidence(games(row('2026_06_BUF_NYJ', 6, '2026-10-18'), row('2026_07_BUF_NYJ', 7, '2026-10-25'))), [null, 'unknown', {}]);
  // The id listed in another week (a shape nflverse never produces) is not a move by itself either.
  assert.deepEqual(evidence([{ gameId: '2026_06_BUF_NYJ', week: 7, away: 'BUF', home: 'NYJ', kickoff: '2026-10-25T17:00:00.000Z' }]), [null, 'unknown', {}]);
  // The same teams still in week 6 under another id: not a move.
  assert.deepEqual(evidence([{ gameId: '2026_06_BUF_NYJ_B', week: 6, away: 'BUF', home: 'NYJ', kickoff: '2026-10-18T17:00:00.000Z' },
    { gameId: '2026_07_BUF_NYJ', week: 7, away: 'BUF', home: 'NYJ', kickoff: '2026-10-25T17:00:00.000Z' }]), [null, 'unknown', {}]);
  // Another season's game, or a slot id that is not YYYY_WW_AWAY_HOME, is never a move.
  assert.deepEqual(evidence([{ gameId: '2025_07_BUF_NYJ', week: 7, away: 'BUF', home: 'NYJ', kickoff: '2025-10-26T17:00:00.000Z' }]), [null, 'unknown', {}]);
  assert.deepEqual(evidence(games(row('2026_07_BUF_NYJ', 7, '2026-10-25')), { slot: ['WR', 'BN-1', 'BUF-NYJ', 'BUF'] }), [null, 'unknown', {}]);
  assert.deepEqual(evidence(games(row('2026_07_BUF_NYJ', 7, '2026-10-25')), { slot: ['WR', 'BN-1', '2025_06_BUF_NYJ', 'BUF'] }), [null, 'unknown', {}]);
});

test('contract: snaps and no stats row at any position scores 0 for every version once the stats file covers his game; until then, or with any stats row, he stays pending', () => {
  // FB-row: 00-0000007 played (snaps) and has a stats row as FB, which no scored row carries: not "no stats row", so never 0.
  const csv = `${statsCsv}\n${statRow({ player_id: '00-0000007', player_name: 'G.Fb', player_display_name: 'Gus Fb', position: 'FB', season: '2026', week: '7', season_type: 'REG', game_id: '2026_07_SEA_LA', team: 'SEA', opponent_team: 'LA', receptions: '1', receiving_yards: '9', receiving_tds: '1' })}`;
  const { rows: statsRows, playerIds: statsPlayerIds } = weekStats(csv, { season: 2026, week: 7 });
  assert.equal(statsRows.some(r => r.playerId === '00-0000007'), false, 'an FB row is not a scored row');
  const snaps = new Map([['SnCo00', 30], ['SnUn00', 30], ['FbGu00', 20]]);
  const roster = new Map([['SN-C', { pfrId: 'SnCo00', status: 'ACT' }], ['SN-U', { pfrId: 'SnUn00', status: 'ACT' }], ['00-0000007', { pfrId: 'FbGu00', status: 'ACT' }]]);
  const slots = slotsFor([['TE', 'SN-C', '2026_07_SEA_LA', 'SEA', 'TE'], ['WR', 'SN-U', '2026_07_DAL_NYG', 'DAL'], ['FLEX', '00-0000007', '2026_07_SEA_LA', 'SEA', 'TE']]);
  const build = extra => actualsPayload({ season: 2026, week: 7, statsRows, slots, snaps, roster, games: [], versions: ['ppr4-v1', 'ppr6-v1'], source: SOURCE, coverage: {}, ...extra });
  const byId = Object.fromEntries(build({ statsPlayerIds }).players.map(p => [p.playerId, [p.played, p.playedBasis, p.points]]));
  assert.deepEqual(byId['SN-C'], [true, 'snaps', { 'ppr4-v1': 0, 'ppr6-v1': 0 }], 'his game (2026_07_SEA_LA) is in the stats file');
  assert.deepEqual(byId['SN-U'], [true, 'snaps', {}], 'no stats row carries 2026_07_DAL_NYG yet: missing is never 0');
  assert.deepEqual(byId['00-0000007'], [true, 'snaps', {}], 'a stats row at another position without statsOffPosition: pending, never 0 (the worker passes statsOffPosition, which scores it at the slot position)');
  // Without the week's player ids the payload cannot show "no stats row", so nothing scores 0 (fail closed).
  assert.deepEqual(build({}).players.find(p => p.playerId === 'SN-C').points, {});
  // The scored rows are unchanged by the rule.
  assert.deepEqual(build({ statsPlayerIds }).players.slice(0, statsRows.length), build({}).players.slice(0, statsRows.length));
});

test('contract: stats rows with an empty name or team are counted in coverage so the loader gap is visible', () => {
  const statsRows = [
    { playerId: 'a', name: 'A', team: 'SEA', position: 'WR', gameKey: 'g', stats: {}, points: 1 },
    { playerId: 'b', name: '', team: 'SEA', position: 'WR', gameKey: 'g', stats: {}, points: 1 },
    { playerId: 'c', name: 'C', team: '', position: 'WR', gameKey: 'g', stats: {}, points: 1 }];
  const payload = actualsPayload({ season: 2026, week: 7, statsRows, slots: [], snaps: new Map(), roster: new Map(), games: [], versions: ['ppr4-v1'], source: SOURCE, coverage: {} });
  assert.equal(payload.coverage.rowsWithoutNameOrTeam, 2);
});

test('contract: no evidence stays unknown, a game absent from the schedule is never postponed, a null score has no points key', () => {
  const broken = statsCsv.replace(/,66,/, ',NA,');
  const statsRows = weekStatsRows(broken, { season: 2026, week: 7 });
  const slots = slotsFor([['WR', 'NO-1', '2026_07_NOT_IN']]);
  const payload = actualsPayload({ season: 2026, week: 7, statsRows, slots, snaps: new Map(), roster: new Map(), games: [], versions: ['ppr4-v1', 'ppr6-v1'], source: SOURCE, coverage: {} });
  const none = payload.players.find(p => p.playerId === 'NO-1');
  assert.deepEqual([none.played, none.playedBasis, none.points], [null, 'unknown', {}]);
  assert.deepEqual(payload.players.find(p => p.playerId === '00-0000001').points, {});
  assert.deepEqual(payload.players.find(p => p.playerId === '00-0000003').points, { 'ppr4-v1': 17, 'ppr6-v1': 17 });
});

test('performance bound: a full-season-size stats file (20,000 rows, over 8 MB) yields one week in under 1,000 ms', () => {
  const filler = Array.from({ length: 120 }, (_, i) => `x${i}`);
  const lines = [[...STAT_COLS, ...filler].join(',')];
  for (let week = 1; week <= 18; week += 1) {
    for (let i = 0; i < 1120; i += 1) {
      lines.push([statRow({ player_id: `00-${String(week * 10000 + i).padStart(7, '0')}`, player_display_name: `P ${week} ${i}`, position: 'WR', season: '2026', week: String(week), season_type: 'REG', game_id: `2026_${String(week).padStart(2, '0')}_SEA_LA`, team: 'SEA', opponent_team: 'LA', receptions: '3' }), ...filler.map(() => '0.123456')].join(','));
    }
  }
  const text = lines.join('\n');
  assert.ok(text.length > 8_000_000, `fixture is ${text.length} bytes`);
  const started = performance.now();
  assert.equal(weekStatsRows(text, { season: 2026, week: 9 }).length, 1120);
  const took = performance.now() - started;
  assert.ok(took < 1000, `took ${Math.round(took)} ms`);
});

test('contract: linesFor keeps the header and only matching lines', () => {
  assert.equal(linesFor('h1,h2\na,1\nb,2\nc,1', ['1']), 'h1,h2\na,1\nc,1');
  assert.throws(() => linesFor('header only', ['x']), /no rows/);
});

test('contract: a slate player the stats file lists at FB scores his real Full PPR points under the slot position; a non-slate FB row stays out; a missing stat is pending, never 0', () => {
  const fb = (id, o = {}) => statRow({ player_id: id, player_name: 'X.Fb', player_display_name: `Fb ${id}`, position: 'FB', season: '2026', week: '7', season_type: 'REG', game_id: '2026_07_SEA_LA', team: 'LA', opponent_team: 'SEA', rushing_yards: '50', receptions: '2', receiving_yards: '15', ...o });
  const csv = `${statsCsv}\n${fb('FB-SLATE')}\n${fb('FB-OTHER')}\n${fb('FB-NA', { rushing_yards: 'NA' })}`;
  const { rows: statsRows, playerIds: statsPlayerIds, offPosition: statsOffPosition } = weekStats(csv, { season: 2026, week: 7 });
  assert.equal(statsRows.some(r => r.playerId.startsWith('FB-')), false, 'weekStatsRows output is unchanged');
  const slots = slotsFor([['RB', 'FB-SLATE', '2026_07_SEA_LA', 'LAR', 'RB'], ['TE', 'FB-NA', '2026_07_SEA_LA', 'LAR', 'TE']]);
  const payload = actualsPayload({ season: 2026, week: 7, statsRows, statsPlayerIds, statsOffPosition, slots, snaps: new Map(), roster: new Map(), games: [], versions: ['ppr4-v1', 'ppr6-v1'], source: SOURCE, coverage: {} });
  const byId = Object.fromEntries(payload.players.map(p => [p.playerId, p]));
  const row = byId['FB-SLATE'];
  assert.deepEqual([row.position, row.team, row.gameKey, row.played, row.playedBasis, row.points], ['RB', 'LAR', '2026_07_SEA_LA', true, 'stats', { 'ppr4-v1': 8.5, 'ppr6-v1': 8.5 }]); // 5 + 2 + 1.5
  assert.equal(byId['FB-OTHER'], undefined, 'not on the slate: excluded');
  const na = byId['FB-NA'];
  assert.deepEqual([na.position, na.played, na.playedBasis, na.points], ['TE', true, 'stats', {}]);
  assert.equal(payload.coverage.slatePlayersWithoutStats, 0);
  // A blank stats name (7 real off-position rows in 2026 Weeks 1–7) falls back to the slot's name, so the loader keeps the row.
  const blank = weekStats(`${statsCsv}\n${fb('FB-BLANK', { player_name: '', player_display_name: '' })}`, { season: 2026, week: 7 });
  const named = actualsPayload({ season: 2026, week: 7, statsRows: blank.rows, statsPlayerIds: blank.playerIds, statsOffPosition: blank.offPosition,
    slots: slotsFor([['RB', 'FB-BLANK', '2026_07_SEA_LA', 'LAR', 'RB']]), snaps: new Map(), roster: new Map(), games: [], versions: ['ppr4-v1'], source: SOURCE, coverage: {} });
  assert.equal(named.players.find(p => p.playerId === 'FB-BLANK').name, 'Name FB-BLANK');
});
