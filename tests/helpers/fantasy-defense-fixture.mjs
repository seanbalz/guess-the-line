// A small, deterministic league for the defensive-matchup tests: four teams, three weeks of this season (2026) and of
// last season (2025), raw rows shaped like the nflverse CSV columns the build reads, and a Week 4 snapshot with
// matchups. BBB plays man and blitzes on every dropback; CCC plays zone and never blitzes; this season has FTN charting
// but no participation (as nflverse publishes it), so man/zone and personnel fall back to last season as estimates.
import { buildDefenseInsights } from '../../shared/fantasy-defense.mjs';

export const TEAMS = ['AAA', 'BBB', 'CCC', 'DDD'];
export const SEASON = 2026, WEEK = 4;
const PAIRS = [[['AAA', 'BBB'], ['CCC', 'DDD']], [['AAA', 'CCC'], ['BBB', 'DDD']], [['AAA', 'DDD'], ['BBB', 'CCC']], [['AAA', 'BBB'], ['CCC', 'DDD']]];
const ROOF = { AAA: 'dome', BBB: 'outdoors', CCC: 'outdoors', DDD: 'closed' };
const SURFACE = { AAA: 'fieldturf', BBB: 'grass', CCC: 'grass', DDD: 'fieldturf' };
export const PLAYERS = [
  { id: 'P-QB', name: 'Quinn Arm', position: 'QB' }, { id: 'P-RB', name: 'Rex Run', position: 'RB' },
  { id: 'P-WR', name: 'Will Wide', position: 'WR' }, { id: 'P-TE', name: 'Ty End', position: 'TE' },
];
const ids = team => PLAYERS.map(p => `${team}-${p.position}`);
const pid = (team, position) => (team === 'AAA' ? PLAYERS.find(p => p.position === position).id : `${team}-${position}`);

export function scheduleRows() {
  const rows = [];
  for (const season of [2025, 2026]) PAIRS.forEach((games, index) => games.forEach(([home, away]) => {
    const week = index + 1, played = season === 2025 || week < WEEK;
    rows.push({ game_id: `${season}_0${week}_${away}_${home}`, season: String(season), game_type: 'REG', week: String(week), home_team: home, away_team: away,
      gameday: `${season}-09-${10 + week * 7}`, gametime: '13:00', roof: ROOF[home], surface: SURFACE[home], stadium: `${home} Field`,
      spread_line: played ? String(home === 'AAA' ? 3 : -3) : '', home_score: played ? '24' : '', away_score: played ? '20' : '' });
  }));
  return rows;
}

/** About 60 plays per offense per game; BBB is the generous, blitz-heavy, man defense. */
function plays(season) {
  const out = [], ftn = [], participation = [];
  for (const game of scheduleRows().filter(row => Number(row.season) === season && (season === 2025 || Number(row.week) < WEEK))) {
    for (const [off, def] of [[game.home_team, game.away_team], [game.away_team, game.home_team]]) for (let i = 0; i < 60; i++) {
      const playId = String((off === game.home_team ? 0 : 1000) + i + 1), dropback = i % 5 < 3, receiverPos = ['WR', 'WR', 'TE', 'RB'][i % 4];
      const generous = def === 'BBB', complete = generous ? i % 3 !== 0 : i % 2 === 0, yards = complete ? (generous ? 14 : 8) : 0;
      out.push({ game_id: game.game_id, play_id: playId, season_type: 'REG', week: game.week, posteam: off, defteam: def, play_type: dropback ? 'pass' : 'run',
        qb_dropback: dropback ? '1' : '0', qb_scramble: '0', sack: dropback && i % 17 === 0 ? '1' : '0', qb_hit: dropback && i % 11 === 0 ? '1' : '0',
        pass_location: dropback ? ['left', 'middle', 'right'][i % 3] : '', air_yards: dropback ? String(i % 7 === 0 ? 25 : 6) : '',
        run_location: dropback ? '' : ['left', 'middle', 'right'][i % 3], run_gap: dropback || i % 3 === 1 ? '' : ['end', 'tackle', 'guard'][i % 3 === 0 ? 0 : 2],
        receiver_player_id: dropback ? pid(off, receiverPos) : '', rusher_player_id: dropback ? '' : pid(off, 'RB'), passer_player_id: dropback ? pid(off, 'QB') : '',
        complete_pass: complete && dropback ? '1' : '0', passing_yards: dropback ? String(yards) : '', receiving_yards: dropback ? String(yards) : '', rushing_yards: dropback ? '' : String(generous ? 6 : 3),
        pass_touchdown: dropback && complete && i % 10 === 0 ? '1' : '0', rush_touchdown: !dropback && i % 20 === 4 ? '1' : '0', interception: dropback && !complete && i % 13 === 0 ? '1' : '0',
        fumble_lost: '0', fumbled_1_player_id: '', yardline_100: String(i % 6 === 0 ? 15 : 50), wp: '0.5', half_seconds_remaining: '900', two_point_attempt: '0', no_huddle: i % 9 === 0 ? '1' : '0' });
      ftn.push({ nflverse_game_id: game.game_id, nflverse_play_id: playId, week: game.week, n_defense_box: String(dropback ? 6 : def === 'BBB' ? 8 : 6), n_blitzers: String(def === 'BBB' ? 1 : 0), n_pass_rushers: '4' });
      participation.push({ nflverse_game_id: game.game_id, play_id: playId, defense_personnel: def === 'BBB' ? '3 CB, 2 DT, 2 ILB, 2 OLB, 1 FS, 1 SS' : '2 CB, 2 DE, 2 DT, 3 LB, 1 FS, 1 SS',
        was_pressure: dropback && i % 4 === 0 ? 'TRUE' : 'FALSE', defense_man_zone_type: dropback ? (def === 'BBB' ? 'MAN_COVERAGE' : 'ZONE_COVERAGE') : '',
        defense_coverage_type: dropback ? (def === 'BBB' ? 'COVER_1' : 'COVER_3') : '', offense_players: ids(off).map(id => (off === 'AAA' ? pid(off, id.split('-')[1]) : id)).join(';') });
    }
  }
  return { pbp: out, ftn, participation };
}

const zeroStats = { passing_yards: '0', passing_tds: '0', passing_interceptions: '0', rushing_yards: '0', rushing_tds: '0', receptions: '0', receiving_yards: '0', receiving_tds: '0',
  fumbles_lost_total: '0', passing_2pt_conversions: '0', rushing_2pt_conversions: '0', receiving_2pt_conversions: '0', special_teams_tds: '0' };
/** Per-player weekly statistics rows (the stats_player columns the build reads), plus one BBB cornerback. */
export function statsRows(season) {
  const rows = [];
  for (const game of scheduleRows().filter(row => Number(row.season) === season && (season === 2025 || Number(row.week) < WEEK))) {
    for (const [team, opponent] of [[game.home_team, game.away_team], [game.away_team, game.home_team]]) {
      const big = opponent === 'BBB' ? 2 : 1;
      for (const position of ['QB', 'RB', 'WR', 'TE']) rows.push({ ...zeroStats, player_id: pid(team, position), player_display_name: `${team} ${position}`, position, position_group: position,
        season: String(season), season_type: 'REG', week: game.week, game_id: game.game_id, team, opponent_team: opponent,
        carries: position === 'RB' ? '20' : '0', targets: position === 'WR' ? '9' : position === 'TE' ? '5' : position === 'RB' ? '4' : '0',
        target_share: position === 'WR' ? '0.3' : position === 'TE' ? '0.18' : position === 'RB' ? '0.12' : '', air_yards_share: position === 'WR' ? '0.4' : '', receiving_air_yards: position === 'WR' ? '80' : '0', attempts: position === 'QB' ? '36' : '0',
        ...(position === 'QB' ? { passing_yards: String(220 * big), passing_tds: String(big) } : position === 'RB' ? { rushing_yards: String(70 * big), rushing_tds: '1' }
          : { receptions: String(5 * big), receiving_yards: String(60 * big), receiving_tds: position === 'WR' ? '1' : '0' }) });
      if (team === 'BBB') rows.push({ ...zeroStats, player_id: 'BBB-CB1', player_display_name: 'Cory Back', position: 'CB', position_group: 'DB', season: String(season), season_type: 'REG', week: game.week,
        game_id: game.game_id, team, opponent_team: opponent, def_tackles_solo: '4', def_tackle_assists: '1', def_pass_defended: '1', def_sacks: '0', def_qb_hits: '0', def_interceptions: '0' });
    }
  }
  return rows;
}

export const injuryRows = () => [
  { season: '2026', season_type: 'REG', game_type: 'REG', team: 'BBB', week: String(WEEK), gsis_id: 'BBB-CB1', position: 'CB', full_name: 'Cory Back', report_primary_injury: 'Hamstring', report_status: 'Out', practice_status: 'Did Not Participate In Practice' },
  { season: '2026', season_type: 'REG', game_type: 'REG', team: 'BBB', week: String(WEEK), gsis_id: 'BBB-LB9', position: 'LB', full_name: 'Lee Backer', report_primary_injury: 'Knee', report_status: 'Questionable', practice_status: 'Limited' },
  { season: '2026', season_type: 'REG', game_type: 'REG', team: 'AAA', week: String(WEEK), gsis_id: 'P-WR', position: 'WR', full_name: 'Will Wide', report_primary_injury: 'Toe', report_status: 'Questionable', practice_status: 'Limited' },
];

const SOURCE = { name: 'nflverse play_by_play_2026.csv.gz', url: 'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2026.csv.gz', license: 'CC BY 4.0',
  licenseUrl: 'https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md', attribution: 'nflverse', retrievedAt: '2026-09-30T12:00:00.000Z', updatedAt: '2026-09-30T10:00:00Z', sha256: 'a'.repeat(64) };
const FTN_SOURCE = { ...SOURCE, name: 'nflverse ftn_charting_2026.csv', url: 'https://github.com/nflverse/nflverse-data/releases/download/ftn_charting/ftn_charting_2026.csv', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', attribution: 'FTN Data via nflverse', sha256: 'b'.repeat(64) };

const kickoff = '2026-10-01T17:00:00.000Z';
/** Snapshot players: AAA's four plus each other team's QB/RB/WR/TE (as the build would list them), and a kicker. */
export function snapshotPlayers() {
  const opponent = { AAA: 'vs BBB', BBB: '@ AAA', CCC: 'vs DDD', DDD: '@ CCC' };
  const players = TEAMS.flatMap(team => PLAYERS.map(p => ({ id: pid(team, p.position), name: team === 'AAA' ? p.name : `${team} ${p.position}`, team, position: p.position })));
  players.push({ id: 'P-K', name: 'Kip Kick', team: 'AAA', position: 'K' });
  return players.map(p => ({ ...p, sampleGames: 3, status: 'Game availability not confirmed', history: [],
    weekly: { status: 'scheduled', opponent: opponent[p.team], kickoff, stats: null }, restOfSeason: { games: 14, stats: null } }));
}

const zero = { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0 };
function matchups() {
  const out = {};
  for (const game of scheduleRows().filter(row => row.season === '2026' && Number(row.week) < WEEK)) for (const [defense, offense] of [[game.home_team, game.away_team], [game.away_team, game.home_team]]) {
    const big = defense === 'BBB' ? 2 : 1;
    (out[defense] ??= []).push({ week: Number(game.week), opponent: offense, allowed: {
      QB: { ...zero, passingYards: 220 * big, passingTds: big }, RB: { ...zero, rushingYards: 70 * big, rushingTds: 1, receptions: 2, receivingYards: 15 },
      WR: { ...zero, receptions: 10 * big, receivingYards: 120 * big, receivingTds: 1 }, TE: { ...zero, receptions: 5 * big, receivingYards: 60 * big } } });
  }
  return out;
}

/** Raw inputs for buildDefenseInsights, so tests can drop or change any one of them. */
export function defenseInputs({ currentParticipation = false, priorParticipation = true } = {}) {
  const now = plays(2026), before = plays(2025);
  return {
    season: SEASON, week: WEEK, players: snapshotPlayers(), schedule: scheduleRows(), injuries: injuryRows(), generatedAt: '2026-09-30T12:00:00.000Z', sources: [SOURCE, FTN_SOURCE],
    current: { pbp: now.pbp, ftn: now.ftn, participation: currentParticipation ? now.participation : null, stats: statsRows(2026) },
    prior: { pbp: before.pbp, ftn: before.ftn, participation: priorParticipation ? before.participation : null, stats: statsRows(2025) },
  };
}

/** A Week 4 schema-2 snapshot with matchups and, unless `defense: false`, the built insights. */
export function defenseSnapshot({ defense = true, ...options } = {}) {
  const snapshot = { schemaVersion: 2, season: SEASON, week: WEEK, asOf: '2026-09-30T10:00:00Z', generatedAt: '2026-09-30T12:00:00.000Z', statsThroughWeek: WEEK - 1,
    rosterFallbackTeams: [], matchups: matchups(), method: { name: 'GTL usage', version: '2.0', description: 'Usage estimates.' },
    sources: [{ ...SOURCE, name: 'nflverse stats_player_week_2026.csv' }], players: snapshotPlayers() };
  return defense ? { ...snapshot, defense: buildDefenseInsights(defenseInputs(options)) } : snapshot;
}
