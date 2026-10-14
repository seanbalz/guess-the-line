// Stadium coordinates for the kickoff wind forecast (D-34). A pure ESM mirror of the venue table
// in shared/nfl-venues.json (cloud/ never imports JSON, as with shared/referees.mjs), limited to
// the 2026 home stadiums and the 2026 neutral sites. tests/wind-venues.test.mjs keeps every value
// equal to the venue table, the 2026 homes equal to its teams list and the neutral sites equal to
// the season file (with shared/trends-corrections.json venueOverrides applied), and checks every
// committed week file. Coordinates always come from here, never from the browser or the schedule
// file. Public geographic facts only. Extend SEASONS each season (a test enforces coverage).

/** Venue table values: name, city, country, lat, lon, IANA time zone and roof type. */
export const WIND_STADIUMS = Object.freeze({
  ATL97: Object.freeze({ name: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA', lat: 33.755, lon: -84.401, tz: 'America/New_York', type: 'retractable' }),
  BAL00: Object.freeze({ name: 'M&T Bank Stadium', city: 'Baltimore', country: 'USA', lat: 39.278, lon: -76.623, tz: 'America/New_York', type: 'outdoor' }),
  BOS00: Object.freeze({ name: 'Gillette Stadium', city: 'Foxborough', country: 'USA', lat: 42.091, lon: -71.264, tz: 'America/New_York', type: 'outdoor' }),
  BUF00: Object.freeze({ name: 'Highmark Stadium (Orchard Park)', city: 'Orchard Park', country: 'USA', lat: 42.774, lon: -78.787, tz: 'America/New_York', type: 'outdoor' }),
  CAR00: Object.freeze({ name: 'Bank of America Stadium', city: 'Charlotte', country: 'USA', lat: 35.226, lon: -80.853, tz: 'America/New_York', type: 'outdoor' }),
  CHI98: Object.freeze({ name: 'Soldier Field', city: 'Chicago', country: 'USA', lat: 41.862, lon: -87.617, tz: 'America/Chicago', type: 'outdoor' }),
  CIN00: Object.freeze({ name: 'Paycor Stadium', city: 'Cincinnati', country: 'USA', lat: 39.095, lon: -84.516, tz: 'America/New_York', type: 'outdoor' }),
  CLE00: Object.freeze({ name: 'Huntington Bank Field', city: 'Cleveland', country: 'USA', lat: 41.506, lon: -81.7, tz: 'America/New_York', type: 'outdoor' }),
  DAL00: Object.freeze({ name: 'AT&T Stadium', city: 'Arlington', country: 'USA', lat: 32.748, lon: -97.093, tz: 'America/Chicago', type: 'retractable' }),
  DEN00: Object.freeze({ name: 'Empower Field at Mile High', city: 'Denver', country: 'USA', lat: 39.744, lon: -105.02, tz: 'America/Denver', type: 'outdoor' }),
  DET00: Object.freeze({ name: 'Ford Field', city: 'Detroit', country: 'USA', lat: 42.34, lon: -83.046, tz: 'America/Detroit', type: 'dome' }),
  GNB00: Object.freeze({ name: 'Lambeau Field', city: 'Green Bay', country: 'USA', lat: 44.501, lon: -88.062, tz: 'America/Chicago', type: 'outdoor' }),
  HOU00: Object.freeze({ name: 'NRG Stadium', city: 'Houston', country: 'USA', lat: 29.685, lon: -95.411, tz: 'America/Chicago', type: 'retractable' }),
  IND00: Object.freeze({ name: 'Lucas Oil Stadium', city: 'Indianapolis', country: 'USA', lat: 39.76, lon: -86.164, tz: 'America/Indiana/Indianapolis', type: 'retractable' }),
  JAX00: Object.freeze({ name: 'EverBank Stadium', city: 'Jacksonville', country: 'USA', lat: 30.324, lon: -81.637, tz: 'America/New_York', type: 'outdoor' }),
  KAN00: Object.freeze({ name: 'GEHA Field at Arrowhead Stadium', city: 'Kansas City', country: 'USA', lat: 39.049, lon: -94.484, tz: 'America/Chicago', type: 'outdoor' }),
  LAX01: Object.freeze({ name: 'SoFi Stadium', city: 'Inglewood', country: 'USA', lat: 33.953, lon: -118.339, tz: 'America/Los_Angeles', type: 'canopy' }),
  LON00: Object.freeze({ name: 'Wembley Stadium', city: 'London', country: 'GBR', lat: 51.556, lon: -0.28, tz: 'Europe/London', type: 'outdoor' }),
  LON02: Object.freeze({ name: 'Tottenham Hotspur Stadium', city: 'London', country: 'GBR', lat: 51.604, lon: -0.066, tz: 'Europe/London', type: 'outdoor' }),
  MAD01: Object.freeze({ name: 'Santiago Bernabeu', city: 'Madrid', country: 'ESP', lat: 40.453, lon: -3.688, tz: 'Europe/Madrid', type: 'retractable' }),
  MEL00: Object.freeze({ name: 'Melbourne Cricket Ground', city: 'Melbourne', country: 'AUS', lat: -37.82, lon: 144.983, tz: 'Australia/Melbourne', type: 'outdoor' }),
  MEX00: Object.freeze({ name: 'Estadio Azteca (Estadio Banorte)', city: 'Mexico City', country: 'MEX', lat: 19.303, lon: -99.15, tz: 'America/Mexico_City', type: 'outdoor' }),
  MIA00: Object.freeze({ name: 'Hard Rock Stadium', city: 'Miami Gardens', country: 'USA', lat: 25.958, lon: -80.239, tz: 'America/New_York', type: 'outdoor' }),
  MIN01: Object.freeze({ name: 'U.S. Bank Stadium', city: 'Minneapolis', country: 'USA', lat: 44.974, lon: -93.258, tz: 'America/Chicago', type: 'dome' }),
  MUN01: Object.freeze({ name: 'Allianz Arena (FC Bayern Munich Stadium)', city: 'Munich', country: 'DEU', lat: 48.219, lon: 11.625, tz: 'Europe/Berlin', type: 'outdoor' }),
  NAS00: Object.freeze({ name: 'Nissan Stadium', city: 'Nashville', country: 'USA', lat: 36.166, lon: -86.771, tz: 'America/Chicago', type: 'outdoor' }),
  NOR00: Object.freeze({ name: 'Caesars Superdome', city: 'New Orleans', country: 'USA', lat: 29.951, lon: -90.081, tz: 'America/Chicago', type: 'dome' }),
  NYC01: Object.freeze({ name: 'MetLife Stadium', city: 'East Rutherford', country: 'USA', lat: 40.813, lon: -74.074, tz: 'America/New_York', type: 'outdoor' }),
  PAR00: Object.freeze({ name: 'Stade de France', city: 'Saint-Denis', country: 'FRA', lat: 48.924, lon: 2.36, tz: 'Europe/Paris', type: 'outdoor' }),
  PHI00: Object.freeze({ name: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA', lat: 39.901, lon: -75.168, tz: 'America/New_York', type: 'outdoor' }),
  PHO00: Object.freeze({ name: 'State Farm Stadium', city: 'Glendale', country: 'USA', lat: 33.528, lon: -112.263, tz: 'America/Phoenix', type: 'retractable' }),
  PIT00: Object.freeze({ name: 'Acrisure Stadium', city: 'Pittsburgh', country: 'USA', lat: 40.447, lon: -80.016, tz: 'America/New_York', type: 'outdoor' }),
  RIO00: Object.freeze({ name: 'Maracana Stadium', city: 'Rio de Janeiro', country: 'BRA', lat: -22.912, lon: -43.23, tz: 'America/Sao_Paulo', type: 'outdoor' }),
  SEA00: Object.freeze({ name: 'Lumen Field', city: 'Seattle', country: 'USA', lat: 47.595, lon: -122.332, tz: 'America/Los_Angeles', type: 'outdoor' }),
  SFO01: Object.freeze({ name: "Levi's Stadium", city: 'Santa Clara', country: 'USA', lat: 37.403, lon: -121.97, tz: 'America/Los_Angeles', type: 'outdoor' }),
  TAM00: Object.freeze({ name: 'Raymond James Stadium', city: 'Tampa', country: 'USA', lat: 27.976, lon: -82.503, tz: 'America/New_York', type: 'outdoor' }),
  VEG00: Object.freeze({ name: 'Allegiant Stadium', city: 'Las Vegas', country: 'USA', lat: 36.091, lon: -115.184, tz: 'America/Los_Angeles', type: 'dome' }),
  WAS00: Object.freeze({ name: 'Northwest Stadium (FedExField)', city: 'Landover', country: 'USA', lat: 38.908, lon: -76.864, tz: 'America/New_York', type: 'outdoor' }),
});

/**
 * Per season: each team's designated home stadium by app code (the Rams are LAR, not nflverse's LA;
 * the Rams and Chargers share SoFi Stadium, the Giants and Jets MetLife Stadium) and the neutral-site
 * games keyed "week:AWAY-HOME" (PHI-JAX in Week 5 is Tottenham through the venueOverrides correction).
 */
export const SEASONS = Object.freeze({
  2026: Object.freeze({
    homes: Object.freeze({
      ARI: 'PHO00', ATL: 'ATL97', BAL: 'BAL00', BUF: 'BUF00', CAR: 'CAR00', CHI: 'CHI98', CIN: 'CIN00', CLE: 'CLE00',
      DAL: 'DAL00', DEN: 'DEN00', DET: 'DET00', GB: 'GNB00', HOU: 'HOU00', IND: 'IND00', JAX: 'JAX00', KC: 'KAN00',
      LAC: 'LAX01', LAR: 'LAX01', LV: 'VEG00', MIA: 'MIA00', MIN: 'MIN01', NE: 'BOS00', NO: 'NOR00', NYG: 'NYC01',
      NYJ: 'NYC01', PHI: 'PHI00', PIT: 'PIT00', SEA: 'SEA00', SF: 'SFO01', TB: 'TAM00', TEN: 'NAS00', WAS: 'WAS00',
    }),
    neutral: Object.freeze({
      '1:SF-LAR': 'MEL00', '3:BAL-DAL': 'RIO00', '4:IND-WAS': 'LON02', '5:PHI-JAX': 'LON02', '6:HOU-JAX': 'LON00',
      '7:PIT-NO': 'PAR00', '9:CIN-ATL': 'MAD01', '10:NE-DET': 'MUN01', '11:MIN-SF': 'MEX00',
    }),
  }),
});

const GAME = /^([A-Z]{2,3})-([A-Z]{2,3})$/;
/**
 * Venue types whose kickoff weather is fetched (D-45): open stadiums, SoFi's canopy (covered, open-sided) and
 * retractable roofs (the forecast is the outside weather; the team decides the roof on game day). Domes never.
 */
export const WIND_VENUE_TYPES = Object.freeze(['outdoor', 'canopy', 'retractable']);

/**
 * The stadium for a published game, or null for an unknown season, week or team. Returns
 * { id, name, city, country, lat, lon, tz, type, neutral, international }.
 */
export function venueFor(season, week, gameId) {
  const table = Number.isInteger(season) ? SEASONS[season] : null;
  const match = typeof gameId === 'string' ? GAME.exec(gameId) : null;
  if (!table || !match || !Number.isInteger(week) || week < 1 || week > 25) return null;
  const neutral = table.neutral[`${week}:${gameId}`];
  const id = neutral ?? table.homes[match[2]];
  const stadium = id ? WIND_STADIUMS[id] : null;
  if (!stadium || !table.homes[match[1]]) return null;
  return { id, ...stadium, neutral: Boolean(neutral), international: stadium.country !== 'USA' };
}

/** True when this venue's kickoff weather is fetched: outdoor, canopy or retractable. Domes and unknown venues are never fetched. */
export const windVenue = venue => Boolean(venue) && WIND_VENUE_TYPES.includes(venue.type);
