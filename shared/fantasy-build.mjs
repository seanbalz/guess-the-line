// Public-statistics normalization. All output fields are allowlisted; no odds, images or GTL account data.
import { appCode, easternToUtc } from './nfl-schedule.mjs';
import { scoreStats, validateFantasySnapshot } from './fantasy-rankings.mjs';

export const FANTASY_METHOD = Object.freeze({
  name: 'GTL statistical pace', version: '1.0',
  description: 'For each statistic, 60% of the last three recorded appearances plus 40% of the season-to-date average, using only games before the selected week. At least two recorded appearances are required. Weekly estimates exclude byes, non-active rosters and reported Out or Doubtful players. Rest-of-season totals multiply that pace by scheduled regular-season games from the selected week through Week 18, assuming an active-roster player is available for all of them. No injury return date, depth-chart role or matchup adjustment is forecast. Overall means total fantasy points, not draft value. These are descriptive pace estimates, not published expert rankings.',
});
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
const missing = value => value == null || value === '' || value === 'NA';
const number = value => missing(value) ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const sum = (row, keys) => keys.every(key => number(row[key]) !== null) ? keys.reduce((total, key) => total + number(row[key]), 0) : null;
const round = value => Math.round(value * 1e6) / 1e6;

/** CSV with quoted commas/newlines and escaped quotes; missing numeric cells stay missing. */
export function parseFantasyCsv(text, required = []) {
  const records = []; let row = [], cell = '', quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (ch === ',' || ch === '\n' || ch === '\r')) {
      row.push(cell); cell = '';
      if (ch !== ',') { if (row.some(value => value !== '')) records.push(row); row = []; if (ch === '\r' && source[i + 1] === '\n') i++; }
    } else cell += ch;
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (cell || row.length) { row.push(cell); records.push(row); }
  const header = records.shift();
  if (!header || new Set(header).size !== header.length || required.some(key => !header.includes(key))) throw new Error('Missing or duplicate CSV columns.');
  return records.map((values, index) => {
    if (values.length !== header.length) throw new Error(`Malformed CSV row ${index + 2}.`);
    return Object.fromEntries(header.map((key, i) => [key, values[i].trim() === 'NA' ? '' : values[i].trim()]));
  });
}

export function normalizePlayerStats(row) {
  if (row.position === 'K') return {
    fieldGoals0to39: sum(row, ['fg_made_0_19', 'fg_made_20_29', 'fg_made_30_39']),
    fieldGoals40to49: number(row.fg_made_40_49), fieldGoals50plus: sum(row, ['fg_made_50_59', 'fg_made_60_']),
    extraPoints: number(row.pat_made), fieldGoalsMissed: sum(row, ['fg_missed', 'fg_blocked']), extraPointsMissed: sum(row, ['pat_missed', 'pat_blocked']),
  };
  return {
    passingYards: number(row.passing_yards), passingTds: number(row.passing_tds), interceptions: number(row.passing_interceptions),
    rushingYards: number(row.rushing_yards), rushingTds: number(row.rushing_tds), receptions: number(row.receptions),
    receivingYards: number(row.receiving_yards), receivingTds: number(row.receiving_tds),
    fumblesLost: number(row.fumbles_lost_total),
    twoPointConversions: sum(row, ['passing_2pt_conversions', 'rushing_2pt_conversions', 'receiving_2pt_conversions']),
    specialTeamsTds: number(row.special_teams_tds), targets: number(row.targets), carries: number(row.carries), passingAttempts: number(row.attempts),
  };
}

export function estimatePace(history) {
  if (history.length < 2) return null;
  const recent = history.slice(-3);
  return Object.fromEntries(Object.keys(history[0]).filter(key => key !== 'week').map(key => [key,
    history.some(row => typeof row[key] !== 'number' || !Number.isFinite(row[key])) ? null
      : round(0.6 * recent.reduce((total, row) => total + row[key], 0) / recent.length + 0.4 * history.reduce((total, row) => total + row[key], 0) / history.length),
  ]));
}

export function buildFantasySnapshot({ season, week, stats, rosters, injuries, schedule, sources, generatedAt }) {
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 18) throw new Error('Invalid fantasy season or week.');
  const games = schedule.filter(row => Number(row.season) === season && row.game_type === 'REG');
  // A complete season is required to distinguish a bye from a missing schedule row and count ROS games.
  if (games.length !== 272 || new Set(games.map(row => row.game_id)).size !== 272) throw new Error('A complete, unique 272-game regular-season schedule is required.');
  const teamGames = new Map();
  for (const game of games) for (const code of [game.home_team, game.away_team]) {
    const team = appCode(code); if (!teamGames.has(team)) teamGames.set(team, []); teamGames.get(team).push(game);
  }
  if (teamGames.size !== 32 || [...teamGames.values()].some(rows => rows.length !== 17 || new Set(rows.map(row => Number(row.week))).size !== 17)) throw new Error('Schedule team coverage is incomplete.');
  const seasonStats = stats.filter(row => Number(row.season) === season && row.season_type === 'REG');
  if (Math.max(0, ...seasonStats.map(row => Number(row.week))) !== week - 1) throw new Error('Source must end immediately before the selected week; retrospective forecasts are not supported.');
  const priorGames = new Map(games.filter(row => Number(row.week) < week).map(row => [row.game_id, row]));
  const seenTeams = new Map();
  for (const row of seasonStats) {
    const game = priorGames.get(row.game_id), team = appCode(row.team);
    if (!game || Number(row.week) !== Number(game.week) || ![appCode(game.home_team), appCode(game.away_team)].includes(team)
      || appCode(row.opponent_team) !== (team === appCode(game.home_team) ? appCode(game.away_team) : appCode(game.home_team))) throw new Error('Stats and schedule game identity do not match.');
    if (!seenTeams.has(row.game_id)) seenTeams.set(row.game_id, new Set());
    seenTeams.get(row.game_id).add(team);
  }
  if ([...priorGames.keys()].some(id => seenTeams.get(id)?.size !== 2)) throw new Error('Prior-game statistics coverage is incomplete.');
  const priorRosters = rosters.filter(row => Number(row.season) === season && Number(row.week) <= week && row.game_type === 'REG');
  // nflverse omits bye-team rows. Only those teams use their most recent prior roster.
  const rosterWeek = new Map([...teamGames].map(([team, rows]) => [team,
    rows.some(row => Number(row.week) === week) ? week : Math.max(0, ...priorRosters.filter(row => appCode(row.team) === team).map(row => Number(row.week))),
  ]));
  const selectedRosters = priorRosters.filter(row => Number(row.week) === rosterWeek.get(appCode(row.team)));
  if (new Set(selectedRosters.map(row => appCode(row.team))).size !== 32) throw new Error('Selected week roster coverage is incomplete.');
  const rosterById = new Map();
  for (const row of selectedRosters.filter(row => row.gsis_id && POSITIONS.has(row.position) && row.status === 'ACT')) {
    if (rosterById.has(row.gsis_id)) throw new Error(`Ambiguous active roster for ${row.gsis_id}.`);
    rosterById.set(row.gsis_id, row);
  }
  const historyById = new Map();
  const priorStats = seasonStats.filter(row => Number(row.week) >= 1 && POSITIONS.has(row.position));
  for (const row of priorStats) {
    if (!historyById.has(row.player_id)) historyById.set(row.player_id, []);
    const history = historyById.get(row.player_id);
    if (history.some(item => item.week === Number(row.week))) throw new Error(`Duplicate player-week ${row.player_id}.`);
    history.push({ week: Number(row.week), ...normalizePlayerStats(row) });
  }
  const statsThroughWeek = Math.max(0, ...priorStats.map(row => Number(row.week)));
  if (statsThroughWeek !== week - 1) throw new Error('Statistics do not cover the week immediately preceding the selected week.');
  const reports = injuries.filter(row => Number(row.season) === season && Number(row.week) === week && (row.season_type || row.game_type) === 'REG');
  const players = [...rosterById.entries()].map(([id, roster]) => {
    const team = appCode(roster.team), history = (historyById.get(id) || []).sort((a, b) => a.week - b.week);
    const teamSchedule = teamGames.get(team) || [];
    const game = teamSchedule.find(row => Number(row.week) === week);
    const report = reports.find(row => row.gsis_id === id && appCode(row.team) === team);
    const availability = [report?.report_status, report?.practice_status].filter(value => value && value !== 'NA').join(' · ') || 'Game availability not confirmed';
    const status = `${availability} · active roster as of Week ${roster.week}`;
    const unavailable = ['Out', 'Doubtful'].includes(report?.report_status);
    let kickoff = null;
    if (game?.gameday && game?.gametime) { try { kickoff = easternToUtc(game.gameday, game.gametime); } catch { /* Unknown schedule time remains unavailable. */ } }
    const pace = estimatePace(history);
    const validPace = scoreStats(pace, { position: roster.position }) !== null ? pace : null;
    const remaining = teamSchedule.filter(row => Number(row.week) >= week).length;
    return {
      id, name: roster.full_name, team, position: roster.position, sampleGames: history.length, status,
      weekly: {
        status: !game ? 'bye' : kickoff ? 'scheduled' : 'unknown',
        opponent: game ? `${appCode(game.home_team) === team ? 'vs' : '@'} ${appCode(appCode(game.home_team) === team ? game.away_team : game.home_team)}` : null,
        kickoff, stats: game && kickoff && !unavailable ? validPace : null,
      },
      restOfSeason: { games: remaining, stats: validPace && remaining > 0 ? Object.fromEntries(Object.entries(validPace).map(([key, value]) => [key, value === null ? null : round(value * remaining)])) : null },
      history,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const snapshot = {
    schemaVersion: 1, season, week, asOf: sources.find(source => source.name.includes('stats_player'))?.updatedAt || generatedAt,
    generatedAt, statsThroughWeek, method: FANTASY_METHOD, sources, players,
  };
  const validation = validateFantasySnapshot(snapshot, { now: Date.parse(generatedAt) });
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  return snapshot;
}
