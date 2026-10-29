// The 20 Premier League clubs of the 2026-27 season (plan 2026-10-28-epl-pick-a-team.md, Ruling R2: created by Task 5, its
// first consumer; Task 6 adds the crests). `code` is the app's club code (the crest file name, stored in gtl_epl_fixtures,
// gtl_epl_prices and gtl_epl_picks), `espnId` the ESPN team id behind the crest, and `oddsApiNames` every team name The Odds
// API has been seen to use for the club. Pure data: no imports, no I/O. Promoted and relegated clubs change each season.
const club = (code, name, espnId, oddsApiNames) => Object.freeze({ code, name, espnId, oddsApiNames: Object.freeze(oddsApiNames) });

export const EPL_CLUBS = Object.freeze([
  club('BOU', 'Bournemouth', 349, ['Bournemouth', 'AFC Bournemouth']),
  club('ARS', 'Arsenal', 359, ['Arsenal']),
  club('AVL', 'Aston Villa', 362, ['Aston Villa']),
  club('BRE', 'Brentford', 337, ['Brentford']),
  club('BHA', 'Brighton', 331, ['Brighton and Hove Albion', 'Brighton & Hove Albion', 'Brighton']),
  club('CHE', 'Chelsea', 363, ['Chelsea']),
  club('COV', 'Coventry City', 388, ['Coventry City', 'Coventry']),
  club('CRY', 'Crystal Palace', 384, ['Crystal Palace']),
  club('EVE', 'Everton', 368, ['Everton']),
  club('FUL', 'Fulham', 370, ['Fulham']),
  club('HUL', 'Hull City', 306, ['Hull City', 'Hull']),
  club('IPS', 'Ipswich Town', 373, ['Ipswich Town', 'Ipswich']),
  club('LEE', 'Leeds United', 357, ['Leeds United', 'Leeds']),
  club('LIV', 'Liverpool', 364, ['Liverpool']),
  club('MNC', 'Manchester City', 382, ['Manchester City']),
  club('MUN', 'Manchester United', 360, ['Manchester United']),
  club('NEW', 'Newcastle United', 361, ['Newcastle United', 'Newcastle']),
  club('NFO', 'Nottingham Forest', 393, ['Nottingham Forest']),
  club('SUN', 'Sunderland', 366, ['Sunderland', 'Sunderland AFC']),
  club('TOT', 'Tottenham Hotspur', 367, ['Tottenham Hotspur', 'Tottenham']),
]);

export const EPL_CLUB_CODES = Object.freeze(EPL_CLUBS.map(c => c.code));

// Null prototype, lower-cased keys: an untrusted provider name such as "constructor" never resolves through Object.prototype.
const BY_ODDS_NAME = Object.freeze(Object.assign(Object.create(null),
  Object.fromEntries(EPL_CLUBS.flatMap(c => c.oddsApiNames.map(n => [n.toLowerCase(), c.code])))));

/** The club code for a team name from The Odds API, or null for a name that is not one of the 20 clubs. */
export function clubFromOddsName(name) {
  if (typeof name !== 'string') return null;
  return BY_ODDS_NAME[name.trim().toLowerCase()] ?? null;
}
