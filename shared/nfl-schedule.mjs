// Build a weekly slate from the public nflverse schedule file (scheduled ET times).
// Codes follow the app's conventions; nflverse uses LA for the Rams.
export const NFLVERSE_SCHEDULE_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
const CODE_ALIASES = { LA: 'LAR', JAC: 'JAX', WSH: 'WAS', OAK: 'LV', SD: 'LAC', STL: 'LAR' };
export const appCode = code => CODE_ALIASES[code] ?? code;
export const TEAM_NAMES = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills', CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', DAL: 'Dallas Cowboys', DEN: 'Denver Broncos',
  DET: 'Detroit Lions', GB: 'Green Bay Packers', HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs', LAC: 'Los Angeles Chargers', LAR: 'Los Angeles Rams', LV: 'Las Vegas Raiders', MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants', NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SEA: 'Seattle Seahawks', SF: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans', WAS: 'Washington Commanders',
};

/** Convert a wall-clock time in an IANA zone to a UTC ISO string, honoring DST. */
export function zoneToUtc(timeZone, date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error(`Invalid scheduled time ${date} ${time}.`);
  const naive = Date.parse(`${date}T${time}:00Z`);
  const offsetAt = instant => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`) - instant;
  };
  let utc = naive - offsetAt(naive);
  utc = naive - offsetAt(utc);
  return new Date(utc).toISOString();
}
/** Convert a wall-clock time in America/New_York to a UTC ISO string, honoring DST. */
export const easternToUtc = (date, time) => zoneToUtc('America/New_York', date, time);
export const pacificToUtc = (date, time) => zoneToUtc('America/Los_Angeles', date, time);

/** The Pacific calendar date (YYYY-MM-DD) and ISO weekday (1 = Monday) of an instant. */
export function pacificDate(instant) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .formatToParts(new Date(instant)).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1 };
}

/**
 * D-24: a week's picks open at 12:00 AM America/Los_Angeles on the Monday of game
 * week, i.e. the Monday at or before the deadline's Pacific date (three days before a
 * Thursday deadline). Matches public.gtl_week_open_at(); DST is handled by Intl.
 */
export function weekOpenAt(deadline) {
  const instant = typeof deadline === 'number' ? deadline : Date.parse(deadline);
  if (!Number.isFinite(instant)) throw new Error('Invalid deadline.');
  const { date, weekday } = pacificDate(instant);
  const monday = new Date(Date.parse(`${date}T00:00:00Z`) - (weekday - 1) * 86_400_000).toISOString().slice(0, 10);
  return pacificToUtc(monday, '00:00');
}

function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const names = header.split(',');
  const need = ['season', 'game_type', 'week', 'gameday', 'gametime', 'away_team', 'home_team', 'location'];
  for (const column of need) if (!names.includes(column)) throw new Error(`Schedule file is missing the ${column} column.`);
  return lines.filter(Boolean).map(line => { const cells = line.split(','); return Object.fromEntries(names.map((n, i) => [n, cells[i] ?? ''])); });
}

/** The slate for one regular-season week. The deadline is the earliest kickoff (Thursday Night Football). */
export function buildSlate(csvText, season, week) {
  const rows = parseCsv(csvText).filter(r => Number(r.season) === season && r.game_type === 'REG' && Number(r.week) === week);
  if (!rows.length) throw new Error(`No ${season} Week ${week} regular-season games in the schedule file.`);
  const games = rows.map(r => {
    const awayCode = appCode(r.away_team), homeCode = appCode(r.home_team);
    if (!TEAM_NAMES[awayCode] || !TEAM_NAMES[homeCode]) throw new Error(`Unknown team code ${r.away_team} or ${r.home_team}.`);
    const away = TEAM_NAMES[awayCode], home = TEAM_NAMES[homeCode];
    return { id: `${awayCode}-${homeCode}`, away, home, awayCode, homeCode, matchup: `${away} @ ${home}`,
      kickoff: easternToUtc(r.gameday, r.gametime), neutral: r.location === 'Neutral' };
  }).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id.localeCompare(b.id));
  if (new Set(games.map(g => g.id)).size !== games.length) throw new Error('Duplicate game in the schedule file.');
  const teams = games.flatMap(g => [g.awayCode, g.homeCode]);
  if (new Set(teams).size !== teams.length) throw new Error('A team appears twice in one week.');
  return { season, week, deadline: games[0].kickoff, games, source: NFLVERSE_SCHEDULE_URL };
}

/** Regular-season weeks in the file for one season with each week's earliest kickoff (its deadline), ascending by week. */
export function listWeeks(csvText, season) {
  const weeks = new Map();
  for (const r of parseCsv(csvText)) {
    if (Number(r.season) !== season || r.game_type !== 'REG') continue;
    const week = Number(r.week), kickoff = easternToUtc(r.gameday, r.gametime);
    if (!Number.isInteger(week) || week < 1) throw new Error(`Invalid week ${r.week} in the schedule file.`);
    if (!weeks.has(week) || Date.parse(kickoff) < Date.parse(weeks.get(week))) weeks.set(week, kickoff);
  }
  return [...weeks].sort((a, b) => a[0] - b[0]).map(([week, deadline]) => ({ week, deadline }));
}

/** The week whose first game (its deadline) is the next one after `now`, or null once the season is over. */
export function nextWeek(csvText, season, now) {
  return listWeeks(csvText, season).find(w => Date.parse(w.deadline) > now) ?? null;
}
