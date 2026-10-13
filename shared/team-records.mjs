// Plain team records from final scores only: overall W-L-T plus home and road splits.
// Plain records only; situational trends live in shared/trends.mjs. Neutral-site games count toward overall only.
import { appCode } from './nfl-schedule.mjs';
const CSV_COLUMNS = ['game_id', 'season', 'game_type', 'week', 'away_team', 'away_score', 'home_team', 'home_score', 'location'];

export function parseScheduleCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const names = header.split(',');
  const index = Object.fromEntries(CSV_COLUMNS.map(column => {
    const at = names.indexOf(column);
    if (at < 0) throw new Error(`Schedule file is missing the ${column} column.`);
    return [column, at];
  }));
  return lines.filter(Boolean).map(line => {
    const cells = line.split(',');
    const row = Object.fromEntries(CSV_COLUMNS.map(column => [column, cells[index[column]] ?? '']));
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
