// Plain team records from final scores only: overall W-L-T plus home and road splits.
// Plain records only; situational trends live in shared/trends.mjs. Neutral-site games count toward overall only.
import { appCode, easternToUtc, TEAM_NAMES } from './nfl-schedule.mjs';
const CSV_COLUMNS = ['game_id', 'season', 'game_type', 'week', 'away_team', 'away_score', 'home_team', 'home_score', 'location'];
// Read when present, for teamSeason's kickoff; older callers' files without them still parse.
const KICKOFF_COLUMNS = ['gameday', 'gametime'];

/** Rows carry only the named columns: no market column (spread, total, moneylines, odds) is ever read from the file. */
export function parseScheduleCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const names = header.split(',');
  const index = Object.fromEntries(CSV_COLUMNS.map(column => {
    const at = names.indexOf(column);
    if (at < 0) throw new Error(`Schedule file is missing the ${column} column.`);
    return [column, at];
  }));
  const columns = [...CSV_COLUMNS, ...KICKOFF_COLUMNS.filter(column => names.includes(column))];
  for (const column of KICKOFF_COLUMNS) if (names.includes(column)) index[column] = names.indexOf(column);
  return lines.filter(Boolean).map(line => {
    const cells = line.split(',');
    const row = Object.fromEntries(columns.map(column => [column, cells[index[column]] ?? '']));
    return { ...row, away_team: appCode(row.away_team), home_team: appCode(row.home_team) };
  });
}

const blank = () => ({ w: 0, l: 0, t: 0 });
const add = (record, mine, theirs) => { if (mine > theirs) record.w++; else if (mine < theirs) record.l++; else record.t++; };

/**
 * Records for one regular season from finals in weeks before `throughWeek + 1`.
 * Rows without both scores are not final and are ignored.
 */
export function computeTeamRecords(rows, season, throughWeek) {
  const teams = {};
  const team = code => (teams[code] ??= { overall: blank(), home: blank(), road: blank() });
  let finals = 0;
  for (const row of rows) {
    if (Number(row.season) !== season || row.game_type !== 'REG' || Number(row.week) > throughWeek) continue;
    team(row.away_team); team(row.home_team);
    if (row.away_score === '' || row.home_score === '') continue;
    const away = Number(row.away_score), home = Number(row.home_score);
    if (!Number.isFinite(away) || !Number.isFinite(home)) continue;
    finals++;
    add(teams[row.away_team].overall, away, home);
    add(teams[row.home_team].overall, home, away);
    if (row.location !== 'Neutral') {
      add(teams[row.away_team].road, away, home);
      add(teams[row.home_team].home, home, away);
    }
  }
  return { season, through_week: throughWeek, finals, teams };
}

const score = value => (/^\d{1,3}$/.test(value) ? Number(value) : null);
const outcome = (mine, theirs) => (mine > theirs ? 'W' : mine < theirs ? 'L' : 'T');

/**
 * D-62: one regular season for every team that plays in it, current through every final in `rows` (parseScheduleCsv):
 * overall, home and road records (a neutral-site final counts toward overall only, as computeTeamRecords), points for
 * and against, and every game ordered by week, its score and result once final. `gameId` is the app's AWAY-HOME id.
 * Each output object is built from named keys, so no market (spread, total, moneyline, odds) can appear for any game:
 * a game's markets stay with the per-game gate (D-31, D-36). Postseason rows, another season's rows and rows naming an
 * unknown team count nothing. `season` defaults to the newest season with regular-season rows.
 */
export function teamSeason(rows, { season } = {}) {
  const regular = rows.filter(row => row.game_type === 'REG');
  const year = season ?? (regular.reduce((newest, row) => Math.max(newest, Number(row.season) || 0), 0) || null);
  const teams = {}, seen = new Set(), kickoffs = new Map();
  const team = code => (teams[code] ??= { overall: blank(), home: blank(), road: blank(), pointsFor: 0, pointsAgainst: 0, games: [] });
  // Many games share a date and time; Intl work runs once per distinct pair (Edge CPU).
  const kickoff = (date, time) => {
    const key = `${date} ${time}`;
    if (!kickoffs.has(key)) { let at = null; try { at = easternToUtc(date, time); } catch { /* Unknown time: null. */ } kickoffs.set(key, at); }
    return kickoffs.get(key);
  };
  let finals = 0, throughWeek = 0;
  for (const row of regular) {
    if (Number(row.season) !== year) continue;
    const week = Number(row.week), away = appCode(row.away_team), home = appCode(row.home_team);
    if (!Number.isInteger(week) || week < 1 || !Object.hasOwn(TEAM_NAMES, away) || !Object.hasOwn(TEAM_NAMES, home) || away === home) continue;
    const gameId = `${away}-${home}`;
    if (seen.has(`${week}:${gameId}`)) continue;
    seen.add(`${week}:${gameId}`);
    const awayScore = score(row.away_score), homeScore = score(row.home_score);
    const final = awayScore !== null && homeScore !== null, neutral = row.location === 'Neutral';
    const at = row.gameday && row.gametime ? kickoff(row.gameday, row.gametime) : null;
    for (const [code, opponent, isHome, pf, pa] of [[away, home, false, awayScore, homeScore], [home, away, true, homeScore, awayScore]]) {
      const entry = team(code);
      entry.games.push({ week, gameId, opponent, home: isHome, neutral, kickoff: at, final, pf: final ? pf : null, pa: final ? pa : null, result: final ? outcome(pf, pa) : null });
      if (!final) continue;
      add(entry.overall, pf, pa);
      if (!neutral) add(entry[isHome ? 'home' : 'road'], pf, pa);
      entry.pointsFor += pf; entry.pointsAgainst += pa;
    }
    if (final) { finals++; throughWeek = Math.max(throughWeek, week); }
  }
  for (const entry of Object.values(teams)) entry.games.sort((a, b) => a.week - b.week || (Date.parse(a.kickoff) || 0) - (Date.parse(b.kickoff) || 0));
  return { season: year, throughWeek, finals, teams: Object.fromEntries(Object.keys(teams).sort().map(code => [code, teams[code]])) };
}

export const formatRecord = ({ w, l, t }) => (t ? `${w}-${l}-${t}` : `${w}-${l}`);

/** One factual line per side, e.g. { away: "SEA 3-2 · Road 1-2", home: "DEN 4-1 · Home 2-0" }. */
export function matchupFacts(records, awayCode, homeCode, { neutral = false } = {}) {
  const line = (code, split, label) => {
    const team = records.teams[code];
    if (!team) return `${code} record unavailable`;
    return neutral ? `${code} ${formatRecord(team.overall)}` : `${code} ${formatRecord(team.overall)} · ${label} ${formatRecord(team[split])}`;
  };
  return { away: line(awayCode, 'road', 'Road'), home: line(homeCode, 'home', 'Home'), as_of: `as of Week ${records.through_week}` };
}
