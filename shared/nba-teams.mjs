// The 30 NBA teams for NBA-only display (milestone N1). `code` is the abbreviation BALLDONTLIE sends (the board's
// `home.abbreviation` / `away.abbreviation`), `name` the team's full name, `espn` the ESPN CDN logo path segment used
// once to fetch the self-hosted logo (docs/TEAM_LOGO_SOURCES.md#nba-team-logos). Kept apart from the NFL team table:
// thirteen codes (ATL CHI CLE DAL DEN DET HOU IND LAC MIA MIN PHI WAS) are also NFL codes and must never resolve to an
// NFL mark.
const team = (code, name, espn) => Object.freeze({ code, name, espn });

export const NBA_TEAMS = Object.freeze([
  team('ATL', 'Atlanta Hawks', 'atl'),
  team('BOS', 'Boston Celtics', 'bos'),
  team('BKN', 'Brooklyn Nets', 'bkn'),
  team('CHA', 'Charlotte Hornets', 'cha'),
  team('CHI', 'Chicago Bulls', 'chi'),
  team('CLE', 'Cleveland Cavaliers', 'cle'),
  team('DAL', 'Dallas Mavericks', 'dal'),
  team('DEN', 'Denver Nuggets', 'den'),
  team('DET', 'Detroit Pistons', 'det'),
  team('GSW', 'Golden State Warriors', 'gs'),
  team('HOU', 'Houston Rockets', 'hou'),
  team('IND', 'Indiana Pacers', 'ind'),
  team('LAC', 'LA Clippers', 'lac'),
  team('LAL', 'Los Angeles Lakers', 'lal'),
  team('MEM', 'Memphis Grizzlies', 'mem'),
  team('MIA', 'Miami Heat', 'mia'),
  team('MIL', 'Milwaukee Bucks', 'mil'),
  team('MIN', 'Minnesota Timberwolves', 'min'),
  team('NOP', 'New Orleans Pelicans', 'no'),
  team('NYK', 'New York Knicks', 'ny'),
  team('OKC', 'Oklahoma City Thunder', 'okc'),
  team('ORL', 'Orlando Magic', 'orl'),
  team('PHI', 'Philadelphia 76ers', 'phi'),
  team('PHX', 'Phoenix Suns', 'phx'),
  team('POR', 'Portland Trail Blazers', 'por'),
  team('SAC', 'Sacramento Kings', 'sac'),
  team('SAS', 'San Antonio Spurs', 'sa'),
  team('TOR', 'Toronto Raptors', 'tor'),
  team('UTA', 'Utah Jazz', 'utah'),
  team('WAS', 'Washington Wizards', 'wsh'),
]);

const byCode = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(NBA_TEAMS.map(entry => [entry.code, entry]))));

/** The NBA team for an NBA code (case and surrounding space ignored), or null. Never consults the NFL table. */
export function nbaTeam(code) {
  const key = typeof code === 'string' ? code.trim().toUpperCase() : '';
  return byCode[key] ?? null;
}

// Both providers (milestone N2, server only). BALLDONTLIE sends the code above as `abbreviation` and the name above as
// `full_name`. The Odds API (`basketball_nba`) sends each team's full name as `home_team` / `away_team`; it is the name above
// except where listed here. Assumed from the provider's published naming, not checked against a live response (N2 makes no
// provider call): a name that differs never links by a guess, it leaves the event unmatched and counted. Plain functions over a
// literal, so the web bundle, which imports this file for the board, drops all of it.
const ODDS_API_NAME_EXCEPTIONS = { LAC: 'Los Angeles Clippers' };

/** The Odds API `home_team` / `away_team` name for an NBA code, or null. */
export function nbaOddsApiName(code) {
  const entry = nbaTeam(code);
  return entry ? ODDS_API_NAME_EXCEPTIONS[entry.code] ?? entry.name : null;
}

/** The NBA team an Odds API `home_team` / `away_team` names (the exact name only), or null. */
export function nbaTeamFromOddsApi(name) {
  return typeof name === 'string' ? NBA_TEAMS.find(entry => nbaOddsApiName(entry.code) === name) ?? null : null;
}

/** The NBA team a BALLDONTLIE team record (`{abbreviation}`, as the board normalizes it) names, or null. */
export function nbaTeamFromBallDontLie(providerTeam) {
  return nbaTeam(providerTeam?.abbreviation);
}
