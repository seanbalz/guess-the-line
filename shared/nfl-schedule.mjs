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

/** Convert a wall-clock time in America/New_York to a UTC ISO string, honoring DST. */
export function easternToUtc(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error(`Invalid scheduled time ${date} ${time}.`);
  const naive = Date.parse(`${date}T${time}:00Z`);
  const offsetAt = instant => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`) - instant;
  };
  let utc = naive - offsetAt(naive);
  utc = naive - offsetAt(utc);
  return new Date(utc).toISOString();
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
