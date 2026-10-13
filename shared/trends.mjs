// Situational trends for Guess The Line: pure core (parse, normalize, leakage-safe
// features, preset evaluation, statistics, quality score, tier gates, week assembly).
// No fs, no network, no clock, no randomness: the same inputs give the same bytes in
// Node, Deno and the browser. Trends are reference only; nothing here changes scoring.
// Public game data only (nflverse schedule file); no player or user data ever enters.
import { appCode, easternToUtc } from './nfl-schedule.mjs';

export const WEEK_SCHEMA_VERSION = 1;
export const TRENDS_SOURCE = Object.freeze({
  url: 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  credit: 'Data: nflverse; schedules maintained by Lee Sharpe (CC BY 4.0), modified',
  modified: 'Column subset, values trimmed, corrections in shared/trends-corrections.json, aggregated into trend records.',
  caveat: 'NFL data belongs to its respective owners; the CC BY license does not extend to upstream rights such as the odds columns, whose book is not documented.',
});
export const LINE_SOURCE = 'nflverse schedule file: last recorded line (book not documented)';
export const PERIODS = Object.freeze({ warmupFirst: 1999, firstSeason: 2002, discoveryLast: 2017, confirmationFirst: 2018 });
export const BREAK_EVEN = 110 / 210;
export const MIN_TRAIN = 20;
export const Z95 = 1.959964;

/** The 36 schedule columns the trends engine reads (the frozen history keeps exactly these). */
export const HISTORY_COLUMNS = Object.freeze([
  'game_id', 'season', 'game_type', 'week', 'gameday', 'weekday', 'gametime', 'away_team', 'away_score',
  'home_team', 'home_score', 'location', 'overtime', 'away_rest', 'home_rest', 'away_moneyline',
  'home_moneyline', 'spread_line', 'away_spread_odds', 'home_spread_odds', 'total_line', 'under_odds',
  'over_odds', 'div_game', 'roof', 'surface', 'temp', 'wind', 'away_qb_id', 'home_qb_id', 'away_qb_name',
  'home_qb_name', 'away_coach', 'home_coach', 'referee', 'stadium_id',
]);
/** Fields that would reveal or hint at an unplayed game's hidden line or game-day facts. */
export const REDACTED_COLUMNS = Object.freeze([
  'away_moneyline', 'home_moneyline', 'spread_line', 'away_spread_odds', 'home_spread_odds', 'total_line',
  'under_odds', 'over_odds', 'temp', 'wind', 'referee',
]);

const FRANCHISE_OF = { OAK: 'LV', SD: 'LAC', STL: 'LA' };
export const franchise = code => FRANCHISE_OF[code] ?? code;

export class TrendsPendingError extends Error {
  constructor(games) {
    super(`Earlier games have no final score yet: ${games.join(', ')}. Rerun after the finals, or pass allowPending.`);
    this.name = 'TrendsPendingError';
    this.games = games;
  }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
const cell = value => {
  let v = value ?? '';
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v.trim();
};

/** Parse the nflverse schedule CSV (or a frozen copy): skips '#' lines, '""' and 'NA' read as blank. */
export function parseCsvRows(text, { required = HISTORY_COLUMNS } = {}) {
  const lines = text.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
  if (!lines.length) throw new Error('Schedule file is empty.');
  const names = lines[0].split(',').map(cell);
  for (const column of required) if (!names.includes(column)) throw new Error(`Schedule file is missing the ${column} column.`);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    if (cells.length !== names.length) throw new Error(`Schedule row ${i + 1} has ${cells.length} cells; the header has ${names.length}.`);
    const row = {};
    for (let c = 0; c < names.length; c++) {
      const v = cell(cells[c]);
      row[names[c]] = v === 'NA' ? '' : v;
    }
    rows.push(row);
  }
  return { columns: names, rows };
}

export const rowPlayed = row => row.home_score !== '' && row.away_score !== '';

/**
 * Write rows as a compact CSV with '#' header lines. Unplayed rows can be redacted so a
 * committed file never carries a current line, odds, weather or referee assignment.
 */
export function writeCompactCsv(rows, { headerLines = [], columns = HISTORY_COLUMNS, redactUnplayed = false } = {}) {
  const out = headerLines.map(line => `# ${line}`);
  out.push(columns.join(','));
  for (const row of rows) {
    const played = rowPlayed(row);
    out.push(columns.map(column => {
      const v = redactUnplayed && !played && REDACTED_COLUMNS.includes(column) ? '' : (row[column] ?? '');
      if (/[",\n\r]/.test(v)) throw new Error(`Value for ${column} in ${row.game_id} cannot be written without quoting.`);
      return v;
    }).join(','));
  }
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Numbers, geography and time
// ---------------------------------------------------------------------------
const num = v => {
  if (v === undefined || v === null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? (Object.is(x, -0) ? 0 : x) : null;
};
export const round4 = x => {
  if (x === null || x === undefined || !Number.isFinite(x)) return x ?? null;
  const r = Math.round(x * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
};
const round1 = x => Math.round(x * 10) / 10;
const round2 = x => Math.round(x * 100) / 100;

export function kickHours(text) {
  const m = /^(\d{1,2}):(\d{2})/.exec(text ?? '');
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
}
export const fmtKick = hours => {
  if (hours === null) return null;
  const minutes = Math.round(hours * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

export function haversineMiles(a, b) {
  const rad = d => (d * Math.PI) / 180;
  const la1 = rad(a.lat), la2 = rad(b.lat), dla = rad(b.lat - a.lat), dlo = rad(b.lon - a.lon);
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

const formatters = new Map();
const offsets = new Map();
/** UTC offset (hours) of an IANA zone on a calendar date, daylight time included. */
export function utcOffsetHours(timeZone, date) {
  const key = `${timeZone}|${date}`;
  let value = offsets.get(key);
  if (value === undefined) {
    let fmt = formatters.get(timeZone);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      formatters.set(timeZone, fmt);
    }
    const instant = Date.parse(`${date}T17:00:00Z`);
    const p = Object.fromEntries(fmt.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    value = (Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - instant) / 3_600_000;
    offsets.set(key, value);
  }
  return value;
}
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------
const ROOF_OF_TYPE = { outdoor: 'outdoors', dome: 'dome', canopy: 'dome', retractable: '' };

/**
 * Normalize schedule rows into games. Corrections (venue, roof, kickoff, referee and QB
 * fixes) are applied here so the frozen CSV stays close to the source file.
 */
export function parseGamesCsv(text, { corrections, venues }) {
  const { rows } = parseCsvRows(text);
  return normalizeRows(rows, { corrections, venues });
}

export function normalizeRows(rows, { corrections, venues }) {
  const rules = corrections.rules ?? {};
  const london = new Set(corrections.kickoff?.london2130?.games ?? []);
  const londonTo = kickHours(corrections.kickoff?.london2130?.to ?? '09:30');
  const verifiedWeather = new Set(corrections.verifiedWeather ?? []);
  const aliases = corrections.refereeAliases ?? {};
  const qbMerge = Object.fromEntries(Object.entries(corrections.qbIdMerge ?? {}).map(([k, v]) => [k, v.to]));
  const grassSet = new Set(corrections.surfaceGroups?.grass ?? ['grass', 'dessograss']);
  const games = [];
  for (const r of rows) {
    const override = corrections.venueOverrides?.[r.game_id];
    const stadiumId = override ? override.stadium : r.stadium_id;
    const venue = venues.stadiums[stadiumId] ?? null;
    let roof = (r.roof ?? '').trim(), surface = (r.surface ?? '').replace(/"/g, '').trim().toLowerCase();
    let temp = num(r.temp), wind = num(r.wind);
    if (override && rules.derivedRoofForOverriddenVenues && venue) {
      roof = ROOF_OF_TYPE[venue.type] ?? '';
      surface = '';
    }
    if (override && rules.nullWeatherForOverriddenVenues && !verifiedWeather.has(r.game_id)) { temp = null; wind = null; }
    const roofFix = corrections.roofOverrides?.[stadiumId];
    if (roofFix) roof = roofFix.roof;
    let kick = london.has(r.game_id) ? londonTo : kickHours(r.gametime);
    let kickFixed = false;
    if (rules.kickoffTwelveHourFix !== false && kick !== null && kick < 11 && (!venue || venue.country === 'USA')) {
      kick += 12;
      kickFixed = true;
    }
    const ref = r.referee ? (aliases[r.referee] ?? r.referee) : null;
    const qbId = id => (id ? (qbMerge[id] ?? id) : null);
    const g = {
      id: r.game_id, season: Number(r.season), gameType: r.game_type, week: Number(r.week), date: r.gameday,
      weekday: r.weekday, kick, kickFixed, away: r.away_team, home: r.home_team,
      awayFr: franchise(r.away_team), homeFr: franchise(r.home_team),
      awayApp: appCode(r.away_team), homeApp: appCode(r.home_team),
      awayScore: num(r.away_score), homeScore: num(r.home_score),
      fileNeutral: r.location === 'Neutral', ot: r.overtime === '1',
      awayRestFile: num(r.away_rest), homeRestFile: num(r.home_rest),
      spread: num(r.spread_line), total: num(r.total_line),
      oddsHome: num(r.home_spread_odds), oddsAway: num(r.away_spread_odds), oddsOver: num(r.over_odds), oddsUnder: num(r.under_odds),
      mlHome: num(r.home_moneyline), mlAway: num(r.away_moneyline),
      div: r.div_game === '1', roof, surface, grass: surface ? grassSet.has(surface) : null, temp, wind,
      qb: [qbId(r.home_qb_id), qbId(r.away_qb_id)], qbName: [r.home_qb_name || null, r.away_qb_name || null],
      coach: [r.home_coach || null, r.away_coach || null], referee: ref,
      stadiumId, stadiumFile: r.stadium_id, overridden: Boolean(override), venue,
    };
    g.played = g.homeScore !== null && g.awayScore !== null;
    g.month = Number(g.date.slice(5, 7));
    g.day = Number(g.date.slice(8, 10));
    games.push(g);
  }
  games.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.kick ?? 0) - (b.kick ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return games;
}

/** Blank every line, odds, weather and referee field on unplayed games (hidden-line rule). */
export function redactUnplayed(games) {
  for (const g of games) {
    if (g.played) continue;
    g.spread = g.total = g.oddsHome = g.oddsAway = g.oddsOver = g.oddsUnder = g.mlHome = g.mlAway = null;
    g.temp = g.wind = null;
    g.referee = null;
  }
  return games;
}

// ---------------------------------------------------------------------------
// Atom catalogue. needs: which hidden or game-day input the atom reads
// ('spread', 'total', 'both' lines; 'weather' observed at kickoff; 'roof' decided on
// game day at retractable venues). state: reads results of earlier games, so a team
// with an unplayed earlier game is 'pending'. variant: robustness check only.
// ---------------------------------------------------------------------------
const GM = ['home_ats', 'fav_ats', 'total'];
const R_ONLY = ['home_ats', 'total'];
const T_ONLY = ['total'];
const TM = ['team_ats', 'total'];
export const ATOMS = {};
const atom = (name, kind, family, desc, { needs = null, state = false, markets, variant = false } = {}) => {
  ATOMS[name] = { name, kind, family, desc, needs, state, markets: markets ?? (kind === 'game' ? GM : TM), variant };
};
const g = (name, family, desc, opts) => atom(name, 'game', family, desc, opts);
const t = (name, family, desc, opts) => atom(name, 'team', family, desc, { state: true, ...opts });

g('g_all', 'baseline', 'All games');
g('g_home_fav', 'fav_venue', 'Home team favored', { needs: 'spread', markets: R_ONLY });
g('g_home_fav_1_3', 'fav_venue', 'Home team favored by 1 to 3', { needs: 'spread', markets: R_ONLY });
g('g_home_fav_35_65', 'fav_venue', 'Home team favored by 3.5 to 6.5', { needs: 'spread', markets: R_ONLY });
g('g_home_fav_7p', 'fav_venue', 'Home team favored by 7 or more', { needs: 'spread', markets: R_ONLY });
g('g_road_fav', 'fav_venue', 'Road team favored (home underdog)', { needs: 'spread', markets: R_ONLY });
g('g_road_fav_1_3', 'fav_venue', 'Road team favored by 1 to 3', { needs: 'spread', markets: R_ONLY });
g('g_road_fav_35_65', 'fav_venue', 'Road team favored by 3.5 to 6.5', { needs: 'spread', markets: R_ONLY });
g('g_road_fav_7p', 'fav_venue', 'Road team favored by 7 or more', { needs: 'spread', markets: R_ONLY });
g('g_pickem', 'spread_band', 'Spread of 1 point or less', { needs: 'spread', markets: R_ONLY });
g('g_s_15_25', 'spread_band', 'Spread 1.5 to 2.5', { needs: 'spread' });
g('g_s_3', 'spread_band', 'Spread exactly 3', { needs: 'spread' });
g('g_s_35_65', 'spread_band', 'Spread 3.5 to 6.5', { needs: 'spread' });
g('g_s_7', 'spread_band', 'Spread exactly 7', { needs: 'spread' });
g('g_s_75_95', 'spread_band', 'Spread 7.5 to 9.5', { needs: 'spread' });
g('g_s_10_135', 'spread_band', 'Spread 10 to 13.5', { needs: 'spread' });
g('g_s_14p', 'spread_band', 'Spread 14 or more', { needs: 'spread' });
g('g_s_10p', 'spread_band', 'Spread 10 or more (double-digit favorite)', { needs: 'spread' });
g('g_s_key', 'spread_key', 'Spread on a key number (3, 7, 10, 14)', { needs: 'spread' });
g('g_s_hook_above', 'spread_key', 'Spread a half point above a key number (3.5, 7.5, 10.5, 14.5)', { needs: 'spread' });
g('g_s_hook_below', 'spread_key', 'Spread a half point below a key number (2.5, 6.5, 9.5, 13.5)', { needs: 'spread' });
g('g_t_le37', 'total_band', 'Total 37 or lower', { needs: 'total' });
g('g_t_375_405', 'total_band', 'Total 37.5 to 40.5', { needs: 'total' });
g('g_t_41_435', 'total_band', 'Total 41 to 43.5', { needs: 'total' });
g('g_t_44_465', 'total_band', 'Total 44 to 46.5', { needs: 'total' });
g('g_t_47_505', 'total_band', 'Total 47 to 50.5', { needs: 'total' });
g('g_t_51p', 'total_band', 'Total 51 or higher', { needs: 'total' });
g('g_t_49p', 'total_band', 'Total 49 or higher', { needs: 'total' });
g('g_t_54p', 'total_band', 'Total 54 or higher', { needs: 'total' });
for (const k of [37, 41, 43, 44, 47, 51]) g(`g_t_key${k}`, 'total_key', `Total exactly ${k}`, { needs: 'total', markets: T_ONLY });
g('g_t_hook', 'total_key', 'Total ends in a half point (no push possible)', { needs: 'total', markets: T_ONLY });
g('g_div', 'division', 'Divisional game');
g('g_nondiv', 'division', 'Non-divisional game');
g('g_conf_nondiv', 'division', 'Same conference, not divisional');
g('g_interconf', 'division', 'AFC vs NFC (interconference) game');
g('g_interconf_afc_home', 'division', 'AFC home team vs NFC road team', { markets: R_ONLY });
g('g_interconf_nfc_home', 'division', 'NFC home team vs AFC road team', { markets: R_ONLY });
g('g_rematch', 'head_to_head', 'Second meeting of the same season', { state: true });
g('g_div_rematch', 'head_to_head', 'Second divisional meeting of the season', { state: true });
g('g_h2h_last_high', 'head_to_head', 'Last meeting (within 2 years) scored 10+ more than this total', { needs: 'total', state: true });
g('g_h2h_last_low', 'head_to_head', 'Last meeting (within 2 years) scored 10+ fewer than this total', { needs: 'total', state: true });
g('g_early', 'kickoff', 'Early kickoff (12:00-14:59 ET)');
g('g_late', 'kickoff', 'Late-afternoon kickoff (15:00-18:59 ET)');
g('g_prime', 'kickoff', 'Primetime kickoff (19:00 ET or later)');
g('g_morning', 'kickoff', 'Morning kickoff before 12:00 ET (international window)');
g('g_thu', 'kickoff', 'Thursday regular-season game');
g('g_thu_night', 'kickoff', 'Thursday night game (19:00 ET or later)');
g('g_snf', 'kickoff', 'Sunday night game');
g('g_mnf', 'kickoff', 'Monday night game');
g('g_sat', 'kickoff', 'Saturday game');
g('g_thanksgiving', 'kickoff', 'Thanksgiving Day game');
g('g_christmas', 'kickoff', 'Christmas Day game');
g('g_intl', 'site', 'International game (outside the USA)');
g('g_neutral', 'site', 'Neutral-site game (includes Super Bowls)');
g('g_altitude', 'site', 'Played at altitude (Denver, Mexico City)');
g('g_west_home_night_east', 'travel', 'West-coast home team hosts an Eastern team at 20:00 ET or later', { markets: R_ONLY });
g('g_week1', 'season_timing', 'Week 1');
g('g_w1_4', 'season_timing', 'Weeks 1-4');
g('g_w5_8', 'season_timing', 'Weeks 5-8');
g('g_w9_12', 'season_timing', 'Weeks 9-12');
g('g_w13p', 'season_timing', 'Regular-season week 13 or later');
g('g_dec', 'season_timing', 'December or later (incl. playoffs)');
g('g_after_deadline', 'season_timing', 'Regular-season week 9 or later (after the trade deadline)');
g('g_final_week', 'season_timing', 'Final regular-season week');
g('g_post', 'season_timing', 'Playoff game');
g('g_wildcard', 'season_timing', 'Wild-card round');
g('g_indoor', 'venue', 'Dome or closed roof', { needs: 'roof' });
g('g_outdoor', 'venue', 'Outdoors or open roof', { needs: 'roof' });
g('g_retract_open', 'venue', 'Retractable roof open', { needs: 'roof' });
g('g_grass', 'venue', 'Natural grass surface');
g('g_turf', 'venue', 'Artificial turf surface');
g('g_wind5', 'weather_observed', 'Observed wind 5+ mph', { needs: 'weather', variant: true });
g('g_wind10', 'weather_observed', 'Observed wind 10+ mph', { needs: 'weather' });
g('g_wind15', 'weather_observed', 'Observed wind 15+ mph', { needs: 'weather' });
g('g_wind20', 'weather_observed', 'Observed wind 20+ mph', { needs: 'weather' });
g('g_temp32', 'weather_observed', 'Observed temperature 32 F or below', { needs: 'weather' });
g('g_temp20', 'weather_observed', 'Observed temperature 20 F or below', { needs: 'weather' });
g('g_temp85', 'weather_observed', 'Observed temperature 85 F or above', { needs: 'weather' });
g('g_cold_windy', 'weather_observed', 'Observed 40 F or below with 10+ mph wind', { needs: 'weather' });
g('g_dog_tt_le17', 'total_vs_scoring', "Underdog's implied team total 17 or fewer ((total - spread) / 2)", { needs: 'both' });
g('g_fav_tt_ge28', 'total_vs_scoring', "Favorite's implied team total 28 or more ((total + spread) / 2)", { needs: 'both' });
g('g_fav_tt_ge27', 'total_vs_scoring', "Favorite's implied team total 27 or more", { needs: 'both', variant: true });
g('g_both_off_bye', 'rest', 'Both teams off a bye', { state: true });
g('g_both_short', 'rest', 'Both teams on 5 or fewer days of rest', { state: true });
g('g_totrev', 'form', "Both teams' games this season averaged a combined 6+ points over (or under) the closing total (4+ games each)", { state: true, markets: [] });

t('t_off_bye', 'rest', 'Team is coming off a bye (13+ days rest)', { state: false });
t('t_short_week', 'rest', 'Team on a short week (5 or fewer days rest)', { state: false });
t('t_thu_after_sun', 'rest', 'Thursday game after a Sunday game (4 days rest)', { state: false });
t('t_mini_bye', 'rest', 'Team had 9-12 days rest (off a Thursday game)', { state: false });
t('t_after_mnf', 'rest', 'Team played on Monday night last game');
t('t_after_tnf', 'rest', 'Team played on Thursday last game');
t('t_rest_adv3', 'rest', 'Team has 3+ more days of rest than the opponent', { state: false });
t('t_after_ot', 'rest', "Team's last game went to overtime");
t('t_after_intl', 'travel', "Team's last game was played abroad");
t('t_2nd_intl', 'travel', 'Second straight game abroad');
t('t_after_long_trip', 'travel', 'Team traveled 1,500+ miles for its last game');
t('t_road', 'travel', 'Team is traveling (venue 50+ miles from home)', { state: false });
t('t_trip_short', 'travel', 'Team traveled under 500 miles', { state: false });
t('t_trip_mid', 'travel', 'Team traveled 500-1,499 miles', { state: false });
t('t_trip_long', 'travel', 'Team traveled 1,500+ miles', { state: false });
t('t_trip_xc', 'travel', 'Team traveled 2,000+ miles (cross-country)', { state: false });
t('t_tz2', 'travel', 'Team crossed 2+ time zones', { state: false });
t('t_tz3', 'travel', 'Team crossed 3+ time zones', { state: false });
t('t_east_trip2', 'travel', 'Team traveled east across 2+ time zones', { state: false });
t('t_west_trip2', 'travel', 'Team traveled west across 2+ time zones', { state: false });
t('t_west_early', 'travel', 'West-coast team at a 1 PM ET kickoff in the Eastern or Central time zone', { state: false });
t('t_body_early', 'travel', "Kickoff before 11 AM on the team's home clock", { state: false });
t('t_east_at_west', 'travel', 'Eastern team playing in the Pacific time zone', { state: false });
t('t_altitude_visit', 'travel', 'Visiting team playing at altitude (Denver, Mexico City)', { state: false });
t('t_2nd_road', 'road_streak', 'Second straight road game');
t('t_3rd_road', 'road_streak', 'Third straight road game');
t('t_homecoming', 'road_streak', 'Home after two or more straight road games');
t('t_3rd_home', 'road_streak', 'Third straight home game');
t('t_2nd_long_trip', 'road_streak', 'Second straight 1,500+ mile trip');
t('t_off_win', 'previous_game', 'Team won its last game');
t('t_off_loss', 'previous_game', 'Team lost its last game');
t('t_off_blowout_win', 'previous_game', 'Team won its last game by 14+');
t('t_off_blowout_loss', 'previous_game', 'Team lost its last game by 14+');
t('t_off_close_win', 'previous_game', 'Team won its last game by 1-3');
t('t_off_close_loss', 'previous_game', 'Team lost its last game by 1-3');
t('t_off_upset_win', 'previous_game', 'Team won its last game outright as an underdog');
t('t_off_upset_loss', 'previous_game', 'Team lost its last game outright as a favorite');
t('t_off_big_upset_win', 'previous_game', 'Team won its last game as a 7+ point underdog');
t('t_off_big_upset_loss', 'previous_game', 'Team lost its last game as a 7+ point favorite');
t('t_off_cover', 'previous_game', 'Team covered the spread in its last game');
t('t_off_no_cover', 'previous_game', 'Team failed to cover in its last game');
t('t_off_big_cover', 'previous_game', 'Team beat the spread by 14+ in its last game');
t('t_off_big_miss', 'previous_game', 'Team missed the spread by 14+ in its last game');
t('t_off_over', 'previous_game', "Team's last game went over");
t('t_off_under', 'previous_game', "Team's last game went under");
t('t_off_big_over', 'previous_game', "Team's last game went over by 14+");
t('t_off_big_under', 'previous_game', "Team's last game went under by 14+");
t('t_off_scored35', 'previous_game', 'Team scored 35+ in its last game');
t('t_off_scored10', 'previous_game', 'Team scored 10 or fewer in its last game');
t('t_ats_season_hot', 'form', 'Covering 70%+ this season (5+ decided)');
t('t_ats_season_hot65', 'form', 'Covering 65%+ this season (5+ decided)', { variant: true });
t('t_ats_season_cold', 'form', 'Covering 30% or less this season (5+ decided)');
t('t_ats_season_cold35', 'form', 'Covering 35% or less this season (5+ decided)', { variant: true });
t('t_ats_margin_cold', 'form', 'Missing the spread by 6+ per game this season (4+ games)');
t('t_ats_margin_cold5', 'form', 'Missing the spread by 5+ per game this season (4+ games)', { variant: true });
t('t_good_def', 'strength', 'Allows 4+ points per game below league average (3+ games)');
t('t_mkt_down3', 'market', "Line is 3+ points worse for the team than its prior closing lines imply (market re-rated it down)", { needs: 'spread' });
t('t_new_coach', 'coach', 'Head coach in first season with the team', { state: false });
t('t_interim_coach', 'coach', "Head coach differs from the team's week-1 coach (interim)", { state: false });
t('t_veteran_coach', 'coach', 'Head coach in 8th+ season with the team', { state: false });
t('t_rookie_hc', 'coach', 'First-year NFL head coach', { state: false });
t('t_coach_ats_good', 'coach', "Head coach's prior career ATS 55%+ (50+ decided)");
t('t_coach_ats_bad', 'coach', "Head coach's prior career ATS 45% or less (50+ decided)");
t('t_qb_change', 'quarterback', 'Different starting QB than last game');
t('t_backup_qb', 'quarterback', "Starter is not the team's most frequent starter this season (2+ games)");
t('t_qb_debut', 'quarterback', "QB's first career start (since 1999)");
t('t_qb_return', 'quarterback', 'Primary starter returns after missing the last game');
t('t_qb_veteran', 'quarterback', 'QB has 100+ prior starts');
t('t_qb_green', 'quarterback', 'QB has 8 or fewer prior starts');
t('t_revenge', 'head_to_head', 'Lost the last meeting (within 400 days)');
t('t_revenge_blowout', 'head_to_head', 'Lost the last meeting by 14+ (within 400 days)');
t('t_rematch_lost', 'head_to_head', 'Lost the first meeting this season');
t('t_h2h_won3', 'head_to_head', 'Won the last 3 meetings (within 4 years)');
t('t_h2h_covered3', 'head_to_head', 'Covered the last 3 meetings (within 4 years)');
t('t_dome_team_outdoors', 'venue', 'Dome team playing outdoors', { needs: 'roof', state: false });
t('t_grass_on_turf', 'venue', 'Grass-field team on the road on turf', { state: false });
t('t_turf_on_grass', 'venue', 'Turf-field team on the road on grass', { state: false });

export const GAME_ATOMS = Object.keys(ATOMS).filter(k => ATOMS[k].kind === 'game');
export const TEAM_ATOMS = Object.keys(ATOMS).filter(k => ATOMS[k].kind === 'team');

// ---------------------------------------------------------------------------
// Features (port of the 2026-10-12 study's features.py, plus the corrections rules)
// Leakage rule: games are processed one calendar date at a time. A game's features use
// its schedule row plus results from strictly earlier dates; state is updated with a
// date's results only after every game on that date has its features. Observed weather
// is the one exception and is only ever shown for played games.
// ---------------------------------------------------------------------------
const mostCommon = map => {
  let best = null, bestN = -1;
  for (const [key, n] of map) if (n > bestN) { best = key; bestN = n; }
  return best;
};
const inc = (map, key, value) => {
  let inner = map.get(key);
  if (!inner) map.set(key, (inner = new Map()));
  inner.set(value, (inner.get(value) ?? 0) + 1);
};

class LeagueScoring {
  // Rolling league scoring mean: last 1,600 team scores, 21.0 until 100 are known.
  constructor() { this.buf = []; this.sum = 0; }
  push(x) { this.buf.push(x); this.sum += x; if (this.buf.length > 1600) this.sum -= this.buf.shift(); }
  mu() { return this.buf.length >= 100 ? this.sum / this.buf.length : 21.0; }
}

class MarketRatings {
  // Team ratings implied by prior closing spreads only (no results); fixed a priori.
  constructor() { this.m = new Map(); this.seen = new Map(); this.hfaHist = []; this.hfaSum = 0; }
  touch(fr, season) {
    const last = this.seen.get(fr);
    if (last !== undefined && last !== season) this.m.set(fr, (this.m.get(fr) ?? 0) * 0.8);
    this.seen.set(fr, season);
  }
  hfa() { return this.hfaHist.length >= 50 ? this.hfaSum / this.hfaHist.length : 2.5; }
  predict(h, a, neutral) { return (this.m.get(h) ?? 0) - (this.m.get(a) ?? 0) + (neutral ? 0 : this.hfa()); }
  update(h, a, neutral, spread) {
    const err = spread - this.predict(h, a, neutral);
    this.m.set(h, (this.m.get(h) ?? 0) + 0.25 * err);
    this.m.set(a, (this.m.get(a) ?? 0) - 0.25 * err);
    if (!neutral) {
      this.hfaHist.push(spread); this.hfaSum += spread;
      if (this.hfaHist.length > 500) this.hfaSum -= this.hfaHist.shift();
    }
  }
}

function seasonStats(log) {
  const s = { n: log.length, w: 0, pf: 0, pa: 0, cov: 0, covd: 0, ovr: 0, ovd: 0, cm: 0, cmn: 0, ouSum: 0, ouN: 0 };
  for (const e of log) {
    s.w += e.margin > 0 ? 1 : e.margin === 0 ? 0.5 : 0;
    s.pf += e.pf; s.pa += e.pa;
    if (e.cover !== null) {
      s.cm += e.cover; s.cmn++;
      if (e.cover !== 0) { s.covd++; if (e.cover > 0) s.cov++; }
    }
    if (e.ou !== null) {
      s.ouSum += e.ou; s.ouN++;
      if (e.ou !== 0) { s.ovd++; if (e.ou > 0) s.ovr++; }
    }
  }
  s.wpct = s.n ? s.w / s.n : null;
  s.pfg = s.n ? s.pf / s.n : null;
  s.pag = s.n ? s.pa / s.n : null;
  return s;
}

const lineFor = (g, side) => (g.spread === null ? null : side === 0 ? g.spread : -g.spread);
const SPREAD_ATOMS = ['g_home_fav', 'g_road_fav', 'g_home_fav_1_3', 'g_home_fav_35_65', 'g_home_fav_7p', 'g_road_fav_1_3',
  'g_road_fav_35_65', 'g_road_fav_7p', 'g_pickem', 'g_s_15_25', 'g_s_3', 'g_s_35_65', 'g_s_7', 'g_s_75_95', 'g_s_10_135',
  'g_s_14p', 'g_s_10p', 'g_s_key', 'g_s_hook_above', 'g_s_hook_below'];
const TOTAL_ATOMS = ['g_t_le37', 'g_t_375_405', 'g_t_41_435', 'g_t_44_465', 'g_t_47_505', 'g_t_51p', 'g_t_49p', 'g_t_54p',
  'g_t_key37', 'g_t_key41', 'g_t_key43', 'g_t_key44', 'g_t_key47', 'g_t_key51', 'g_t_hook'];
const conferenceOf = (venues, fr) => venues.teams[fr]?.conference ?? null;

/**
 * Build leakage-safe features for every game. Returns the games (date order) with
 * gf (game atoms), tf ([home, away] team atoms) and meta. Atom values are true, false,
 * null (input hidden or unknown: line, weather, roof) or 'pending' (an earlier game of
 * the team has no final yet, so a prior-result atom cannot be computed honestly).
 */
export function buildFeatures(games, { venues, corrections }) {
  const rules = corrections.rules ?? {};
  const noContest = new Set(Object.keys(corrections.noContest ?? {}));
  const all = games.filter(g => !noContest.has(g.id));
  const stadium = sid => venues.stadiums[sid] ?? null;

  // Season home stadium (most common designated-home stadium), dome and grass traits.
  const homeCount = new Map(), roofCount = new Map(), surfCount = new Map();
  for (const g of all) {
    if (g.fileNeutral) continue;
    const key = `${g.homeFr}|${g.season}`;
    inc(homeCount, key, g.stadiumId);
    inc(roofCount, key, g.roof);
    if (g.surface) inc(surfCount, key, g.surface);
  }
  const grassSet = new Set(corrections.surfaceGroups?.grass ?? ['grass', 'dessograss']);
  const infoCache = new Map();
  const seasonInfo = (fr, season) => {
    const key = `${fr}|${season}`;
    if (infoCache.has(key)) return infoCache.get(key);
    let info = null;
    if (homeCount.has(key)) {
      const sid = mostCommon(homeCount.get(key));
      const venue = stadium(sid);
      let indoor, grass;
      if (rules.teamTraitsFromVenueTable) {
        indoor = venue ? ['dome', 'retractable', 'canopy'].includes(venue.type) : false;
        const surf = surfCount.get(key);
        grass = surf ? grassSet.has(mostCommon(surf)) : (seasonInfo(fr, season - 1)?.grass ?? null);
      } else {
        indoor = ['dome', 'closed'].includes(mostCommon(roofCount.get(key)));
        const surf = surfCount.get(key);
        grass = surf ? grassSet.has(mostCommon(surf)) : false;
      }
      info = { sid, venue, indoor, grass };
    }
    infoCache.set(key, info);
    return info;
  };
  const homeInfo = (fr, season) => seasonInfo(fr, season) ?? seasonInfo(fr, season - 1);

  for (const g of all) {
    g.neutral = rules.neutralFromVenue ? homeInfo(g.homeFr, g.season)?.sid !== g.stadiumId : g.fileNeutral;
  }

  // Schedules per team-season (rest from schedule, pending check, final regular week).
  const sched = new Map();
  const lastRegWeek = new Map();
  for (const g of all) {
    for (const fr of [g.homeFr, g.awayFr]) {
      const key = `${fr}|${g.season}`;
      if (!sched.has(key)) sched.set(key, []);
      sched.get(key).push(g);
    }
    if (g.gameType === 'REG') lastRegWeek.set(g.season, Math.max(lastRegWeek.get(g.season) ?? 0, g.week));
  }
  const prevScheduled = new Map(); // `${id}|${fr}` -> previous scheduled game of fr this season
  const pendingBefore = new Map(); // `${id}|${fr}` -> earlier unplayed game ids
  for (const [key, list] of sched) {
    const fr = key.split('|')[0];
    const unplayed = [];
    for (let p = 0; p < list.length; p++) {
      const g = list[p];
      prevScheduled.set(`${g.id}|${fr}`, p > 0 ? list[p - 1] : null);
      const earlier = unplayed.filter(u => u.date < g.date).map(u => u.id);
      if (earlier.length) pendingBefore.set(`${g.id}|${fr}`, earlier);
      if (!g.played) unplayed.push(g);
    }
  }
  const restOf = (g, side) => {
    const fr = side === 0 ? g.homeFr : g.awayFr;
    if (!rules.restFromSchedule) return side === 0 ? g.homeRestFile : g.awayRestFile;
    const prev = prevScheduled.get(`${g.id}|${fr}`);
    return prev ? daysBetween(prev.date, g.date) : null;
  };

  const st = {
    logs: new Map(), meet: new Map(), qbStarts: new Map(), teamQbs: new Map(), coachAts: new Map(),
    coachFirstTeam: new Map(), coachFirstAny: new Map(), seasonCoach: new Map(),
    league: new LeagueScoring(), mkt: new MarketRatings(), mktN: new Map(),
  };
  const logsOf = (fr, season) => st.logs.get(`${fr}|${season}`) ?? [];
  const STATE_GAME = GAME_ATOMS.filter(k => ATOMS[k].state);
  const STATE_TEAM = TEAM_ATOMS.filter(k => ATOMS[k].state);

  const compute = g => {
    const season = g.season;
    const gf = {};
    for (const k of GAME_ATOMS) gf[k] = false;
    const tf = [{}, {}];
    for (const k of TEAM_ATOMS) { tf[0][k] = false; tf[1][k] = false; }
    const meta = { dist: [null, null], tz: [null, null], rest: [null, null], pending: [null, null] };
    const pre = [{}, {}];
    const s = g.spread, tl = g.total, k = g.kick, reg = g.gameType === 'REG', wd = g.weekday;
    const frs = [g.homeFr, g.awayFr];
    for (const fr of frs) st.mkt.touch(fr, season);
    const mkHome = st.mkt.predict(g.homeFr, g.awayFr, g.neutral);
    const mu = st.league.mu();
    const logs = frs.map(fr => logsOf(fr, season));
    const stats = logs.map(seasonStats);
    const hi = frs.map(fr => homeInfo(fr, season));
    const venue = g.venue;
    meta.leagueMu = mu;

    gf.g_all = true;
    if (s !== null) {
      const a = Math.abs(s);
      gf.g_home_fav = s > 0; gf.g_road_fav = s < 0;
      gf.g_home_fav_1_3 = s > 0 && s <= 3; gf.g_home_fav_35_65 = s >= 3.5 && s <= 6.5; gf.g_home_fav_7p = s >= 7;
      gf.g_road_fav_1_3 = s >= -3 && s < 0; gf.g_road_fav_35_65 = s >= -6.5 && s <= -3.5; gf.g_road_fav_7p = s <= -7;
      gf.g_pickem = a <= 1; gf.g_s_15_25 = a >= 1.5 && a <= 2.5; gf.g_s_3 = a === 3; gf.g_s_35_65 = a >= 3.5 && a <= 6.5;
      gf.g_s_7 = a === 7; gf.g_s_75_95 = a >= 7.5 && a <= 9.5; gf.g_s_10_135 = a >= 10 && a <= 13.5; gf.g_s_14p = a >= 14;
      gf.g_s_10p = a >= 10; gf.g_s_key = [3, 7, 10, 14].includes(a); gf.g_s_hook_above = [3.5, 7.5, 10.5, 14.5].includes(a);
      gf.g_s_hook_below = [2.5, 6.5, 9.5, 13.5].includes(a);
    } else for (const name of SPREAD_ATOMS) gf[name] = null;
    if (tl !== null) {
      gf.g_t_le37 = tl <= 37; gf.g_t_375_405 = tl >= 37.5 && tl <= 40.5; gf.g_t_41_435 = tl >= 41 && tl <= 43.5;
      gf.g_t_44_465 = tl >= 44 && tl <= 46.5; gf.g_t_47_505 = tl >= 47 && tl <= 50.5; gf.g_t_51p = tl >= 51;
      gf.g_t_49p = tl >= 49; gf.g_t_54p = tl >= 54;
      for (const kk of [37, 41, 43, 44, 47, 51]) gf[`g_t_key${kk}`] = tl === kk;
      gf.g_t_hook = (tl * 2) % 2 === 1;
    } else for (const name of TOTAL_ATOMS) gf[name] = null;
    if (s !== null && tl !== null) {
      gf.g_dog_tt_le17 = (tl - Math.abs(s)) / 2 <= 17;
      gf.g_fav_tt_ge28 = (tl + Math.abs(s)) / 2 >= 28;
      gf.g_fav_tt_ge27 = (tl + Math.abs(s)) / 2 >= 27;
    } else gf.g_dog_tt_le17 = gf.g_fav_tt_ge28 = gf.g_fav_tt_ge27 = null;
    const hc = conferenceOf(venues, g.homeFr), ac = conferenceOf(venues, g.awayFr);
    gf.g_div = g.div; gf.g_nondiv = !g.div; gf.g_conf_nondiv = hc === ac && !g.div; gf.g_interconf = hc !== ac;
    gf.g_interconf_afc_home = hc !== ac && hc === 'AFC'; gf.g_interconf_nfc_home = hc !== ac && hc === 'NFC';
    const meetKey = [g.homeFr, g.awayFr].sort().join('|');
    const meetings = st.meet.get(meetKey) ?? [];
    const sameSeason = meetings.filter(m => m.season === season);
    meta.lastMeetings = meetings.slice(-3);
    gf.g_rematch = sameSeason.length > 0;
    gf.g_div_rematch = sameSeason.length > 0 && g.div;
    if (tl === null) gf.g_h2h_last_high = gf.g_h2h_last_low = null;
    else if (meetings.length) {
      const lm = meetings[meetings.length - 1];
      if (daysBetween(lm.date, g.date) <= 730) { gf.g_h2h_last_high = lm.total - tl >= 10; gf.g_h2h_last_low = lm.total - tl <= -10; }
    }
    if (k !== null) { gf.g_early = k >= 12 && k < 15; gf.g_late = k >= 15 && k < 19; gf.g_prime = k >= 19; gf.g_morning = k < 12; }
    gf.g_thu = wd === 'Thursday' && reg;
    gf.g_thu_night = wd === 'Thursday' && k !== null && k >= 19;
    gf.g_snf = wd === 'Sunday' && k !== null && k >= 19;
    gf.g_mnf = wd === 'Monday';
    gf.g_sat = wd === 'Saturday';
    gf.g_thanksgiving = wd === 'Thursday' && g.month === 11 && g.day >= 22 && g.day <= 28;
    gf.g_christmas = g.month === 12 && g.day === 25;
    gf.g_intl = Boolean(venue && venue.country !== 'USA');
    gf.g_neutral = g.neutral;
    gf.g_altitude = Boolean(venue && venue.altitudeFt >= 4000);
    if (reg) {
      const w = g.week;
      gf.g_week1 = w === 1; gf.g_w1_4 = w <= 4; gf.g_w5_8 = w >= 5 && w <= 8; gf.g_w9_12 = w >= 9 && w <= 12;
      gf.g_w13p = w >= 13; gf.g_after_deadline = w >= 9; gf.g_final_week = w === lastRegWeek.get(season);
    }
    gf.g_dec = [12, 1, 2].includes(g.month);
    gf.g_post = !reg;
    gf.g_wildcard = g.gameType === 'WC';
    if (g.roof) {
      gf.g_indoor = ['dome', 'closed'].includes(g.roof);
      gf.g_outdoor = ['outdoors', 'open'].includes(g.roof);
      gf.g_retract_open = g.roof === 'open';
    } else gf.g_indoor = gf.g_outdoor = gf.g_retract_open = null;
    gf.g_grass = g.surface ? grassSet.has(g.surface) : false;
    gf.g_turf = g.surface ? !grassSet.has(g.surface) : false;
    if (g.wind !== null) {
      gf.g_wind5 = g.wind >= 5; gf.g_wind10 = g.wind >= 10; gf.g_wind15 = g.wind >= 15; gf.g_wind20 = g.wind >= 20;
    } else gf.g_wind5 = gf.g_wind10 = gf.g_wind15 = gf.g_wind20 = null;
    if (g.temp !== null) {
      gf.g_temp32 = g.temp <= 32; gf.g_temp20 = g.temp <= 20; gf.g_temp85 = g.temp >= 85;
      gf.g_cold_windy = g.temp <= 40 && (g.wind ?? 0) >= 10;
    } else gf.g_temp32 = gf.g_temp20 = gf.g_temp85 = gf.g_cold_windy = null;
    const [sh, sa] = stats;
    if (sh.ouN >= 4 && sa.ouN >= 4) {
      const x = sh.ouSum / sh.ouN + sa.ouSum / sa.ouN;
      meta.totrevX = x;
      gf.g_totrev = Math.abs(x) >= 6;
    }
    const rests = [restOf(g, 0), restOf(g, 1)];
    meta.rest = rests;
    gf.g_both_off_bye = [0, 1].every(j => logs[j].length && (rests[j] ?? 0) >= 13) && (!rules.excludePlayoffByes || reg);
    gf.g_both_short = [0, 1].every(j => logs[j].length && rests[j] !== null && rests[j] <= 5);
    if (hi[0]?.venue && hi[1]?.venue && k !== null && !g.neutral) {
      const homeWest = hi[0].venue.stdOffset === -8 || g.homeFr === 'ARI';
      gf.g_west_home_night_east = homeWest && hi[1].venue.stdOffset === -5 && k >= 20;
    }

    for (const side of [0, 1]) {
      const fr = frs[side], op = frs[1 - side], f = tf[side], log = logs[side];
      const sT = stats[side], sO = stats[1 - side];
      const prev = log.length ? log[log.length - 1] : null;
      const rest = rests[side], orest = rests[1 - side];
      const line = lineFor(g, side);
      const info = hi[side];
      let origin = info?.venue ?? null;
      if (rules.intlBackToBackTravel && prev?.intl && gf.g_intl && prev.venue) origin = prev.venue;
      let dist = null, tzd = null;
      if (origin && venue) {
        dist = haversineMiles(origin, venue);
        tzd = rules.tzFromIana ? utcOffsetHours(venue.tz, g.date) - utcOffsetHours(origin.tz, g.date) : venue.stdOffset - origin.stdOffset;
      }
      const road = (dist !== null && dist > 50) || (dist === null && side === 1);
      // Home and road streaks count games away from the team's own season home stadium, not this
      // week's travel: a team staying abroad for a second game is not traveling (road is false) but
      // is still away from home. Without a known home stadium, the designated road team or a neutral site.
      const away = rules.streakFromHomeStadium
        ? (info?.sid && g.stadiumId ? g.stadiumId !== info.sid : side === 1 || g.neutral)
        : road;
      meta.dist[side] = dist === null ? null : Math.round(dist);
      meta.tz[side] = tzd;
      pre[side] = { road, away, dist, intl: gf.g_intl, venue, oppWpct: sO.wpct, oppN: sO.n };
      f.t_road = road;
      if (dist !== null && road) {
        f.t_trip_short = dist < 500; f.t_trip_mid = dist >= 500 && dist < 1500; f.t_trip_long = dist >= 1500; f.t_trip_xc = dist >= 2000;
      }
      if (tzd !== null && road) {
        f.t_tz2 = Math.abs(tzd) >= 2; f.t_tz3 = Math.abs(tzd) >= 3; f.t_east_trip2 = tzd >= 2; f.t_west_trip2 = tzd <= -2;
      }
      if (info?.venue && venue && k !== null) {
        const homeStd = info.venue.stdOffset;
        const westTeam = homeStd === -8 || fr === 'ARI';
        const usCan = venue.country === 'USA' || venue.country === 'CAN';
        const eastOrCentral = rules.westEarlyIncludesCentral ? usCan && (venue.stdOffset === -5 || venue.stdOffset === -6) : venue.stdOffset === -5;
        f.t_west_early = road && westTeam && eastOrCentral && k < 14;
        const homeLocal = rules.tzFromIana ? k - utcOffsetHours('America/New_York', g.date) + utcOffsetHours(info.venue.tz, g.date) : k + homeStd + 5;
        f.t_body_early = road && homeLocal < 11;
        f.t_east_at_west = road && homeStd === -5 && venue.stdOffset === -8;
        f.t_altitude_visit = road && venue.altitudeFt >= 4000 && info.venue.altitudeFt < 4000;
      }
      if (prev !== null && rest !== null) {
        f.t_off_bye = rest >= 13 && (!rules.excludePlayoffByes || reg);
        f.t_short_week = rest <= 5;
        f.t_thu_after_sun = wd === 'Thursday' && rest <= 4;
        f.t_mini_bye = rest >= 9 && rest <= 12;
      }
      if (rest !== null && orest !== null) f.t_rest_adv3 = rest - orest >= 3;
      if (prev !== null) {
        f.t_after_mnf = rules.afterWeeknightByDays ? ['Monday', 'Tuesday', 'Wednesday'].includes(prev.weekday) : prev.weekday === 'Monday';
        f.t_after_tnf = rules.afterWeeknightByDays ? ['Thursday', 'Friday'].includes(prev.weekday) : prev.weekday === 'Thursday';
        f.t_after_ot = prev.ot;
        f.t_after_intl = prev.intl;
        f.t_2nd_intl = prev.intl && gf.g_intl;
        f.t_after_long_trip = prev.road && (prev.dist ?? 0) >= 1500;
        f.t_2nd_road = away && prev.away;
        f.t_2nd_long_trip = road && (dist ?? 0) >= 1500 && prev.road && (prev.dist ?? 0) >= 1500;
        if (log.length >= 2) {
          const p2 = log[log.length - 2];
          f.t_3rd_road = away && prev.away && p2.away;
          f.t_homecoming = !away && prev.away && p2.away;
          f.t_3rd_home = !away && !prev.away && !p2.away;
        }
        const m = prev.margin;
        f.t_off_win = m > 0; f.t_off_loss = m < 0; f.t_off_blowout_win = m >= 14; f.t_off_blowout_loss = m <= -14;
        f.t_off_close_win = m >= 1 && m <= 3; f.t_off_close_loss = m >= -3 && m <= -1;
        const pl = prev.line;
        if (pl !== null) {
          f.t_off_upset_win = pl < 0 && m > 0; f.t_off_upset_loss = pl > 0 && m < 0;
          f.t_off_big_upset_win = pl <= -7 && m > 0; f.t_off_big_upset_loss = pl >= 7 && m < 0;
        }
        const c = prev.cover;
        if (c !== null) { f.t_off_cover = c > 0; f.t_off_no_cover = c < 0; f.t_off_big_cover = c >= 14; f.t_off_big_miss = c <= -14; }
        const ou = prev.ou;
        if (ou !== null) { f.t_off_over = ou > 0; f.t_off_under = ou < 0; f.t_off_big_over = ou >= 14; f.t_off_big_under = ou <= -14; }
        f.t_off_scored35 = prev.pf >= 35; f.t_off_scored10 = prev.pf <= 10;
      }
      if (log.length >= 3 && sT.pfg !== null) f.t_good_def = sT.pag <= mu - 4;
      if (sT.covd >= 5) {
        const r = sT.cov / sT.covd;
        f.t_ats_season_hot = r >= 0.7; f.t_ats_season_hot65 = r >= 0.65; f.t_ats_season_cold = r <= 0.3; f.t_ats_season_cold35 = r <= 0.35;
      }
      if (sT.cmn >= 4) { const cm = sT.cm / sT.cmn; f.t_ats_margin_cold = cm <= -6; f.t_ats_margin_cold5 = cm <= -5; }
      meta[`ats${side}`] = { covered: sT.cov, decided: sT.covd, meanCover: sT.cmn ? sT.cm / sT.cmn : null, games: sT.cmn };
      if (line === null) f.t_mkt_down3 = null;
      else if ((st.mktN.get(fr) ?? 0) >= 4 && (st.mktN.get(op) ?? 0) >= 4 && prev !== null) {
        const mkT = side === 0 ? mkHome : -mkHome;
        f.t_mkt_down3 = line - mkT <= -3;
      }
      const coach = g.coach[side];
      if (coach) {
        const teamKey = `${fr}|${coach}`;
        if (!st.coachFirstTeam.has(teamKey)) st.coachFirstTeam.set(teamKey, season);
        if (!st.coachFirstAny.has(coach)) st.coachFirstAny.set(coach, season);
        const seasonKey = `${fr}|${season}`;
        if (!st.seasonCoach.has(seasonKey)) st.seasonCoach.set(seasonKey, coach);
        const firstT = st.coachFirstTeam.get(teamKey), firstA = st.coachFirstAny.get(coach);
        f.t_new_coach = firstT === season && season > 1999;
        f.t_interim_coach = st.seasonCoach.get(seasonKey) !== coach;
        f.t_veteran_coach = season - firstT >= 7;
        f.t_rookie_hc = firstA === season && season > 1999;
        const [cw, cl] = st.coachAts.get(coach) ?? [0, 0];
        if (cw + cl >= 50) { f.t_coach_ats_good = cw / (cw + cl) >= 0.55; f.t_coach_ats_bad = cw / (cw + cl) <= 0.45; }
      }
      const qb = g.qb[side];
      pre[side].qb = qb;
      if (qb) {
        const starts = st.qbStarts.get(qb) ?? 0;
        f.t_qb_debut = starts === 0; f.t_qb_veteran = starts >= 100; f.t_qb_green = starts <= 8;
        if (prev !== null && prev.qb) f.t_qb_change = prev.qb !== qb;
        const qc = st.teamQbs.get(`${fr}|${season}`);
        if (qc) {
          let totalStarts = 0;
          for (const v of qc.values()) totalStarts += v;
          if (totalStarts >= 2) {
            const primary = mostCommon(qc);
            f.t_backup_qb = qb !== primary;
            f.t_qb_return = qb === primary && prev !== null && prev.qb !== null && prev.qb !== qb;
          }
        }
      }
      if (meetings.length) {
        const lm = meetings[meetings.length - 1];
        if (daysBetween(lm.date, g.date) <= 400) { f.t_revenge = lm.margin[fr] < 0; f.t_revenge_blowout = lm.margin[fr] <= -14; }
        if (sameSeason.length) f.t_rematch_lost = sameSeason[0].margin[fr] < 0;
        const recent = meetings.slice(-3).filter(m => daysBetween(m.date, g.date) <= 1461);
        if (recent.length === 3) {
          f.t_h2h_won3 = recent.every(m => m.margin[fr] > 0);
          f.t_h2h_covered3 = recent.every(m => m.cover[fr] !== null && m.cover[fr] > 0);
        }
      }
      if (info) {
        if (g.roof) f.t_dome_team_outdoors = road && info.indoor && ['outdoors', 'open'].includes(g.roof);
        else f.t_dome_team_outdoors = road && info.indoor ? null : false;
        if (g.surface && info.grass !== null) {
          const isGrass = grassSet.has(g.surface);
          f.t_grass_on_turf = road && info.grass && !isGrass;
          f.t_turf_on_grass = road && !info.grass && isGrass;
        }
      }
      const waiting = pendingBefore.get(`${g.id}|${fr}`);
      if (waiting) {
        meta.pending[side] = waiting;
        for (const name of STATE_TEAM) f[name] = 'pending';
      }
    }
    if (meta.pending[0] || meta.pending[1]) for (const name of STATE_GAME) gf[name] = 'pending';
    g.gf = gf; g.tf = tf; g.meta = meta; g.pre = pre;
  };

  const update = g => {
    const season = g.season, hs = g.homeScore, as = g.awayScore;
    const result = hs - as, total = hs + as;
    const frs = [g.homeFr, g.awayFr];
    const margin = { [frs[0]]: result, [frs[1]]: -result };
    const cover = {};
    for (const side of [0, 1]) {
      const fr = frs[side], line = lineFor(g, side), m = margin[fr];
      const c = line === null ? null : m - line;
      cover[fr] = c;
      const pr = g.pre[side];
      const key = `${fr}|${season}`;
      if (!st.logs.has(key)) st.logs.set(key, []);
      st.logs.get(key).push({
        date: g.date, season, margin: m, pf: side === 0 ? hs : as, pa: side === 0 ? as : hs, line, cover: c,
        ou: g.total === null ? null : total - g.total, weekday: g.weekday, kick: g.kick, ot: g.ot,
        intl: pr.intl ?? false, road: pr.road ?? side === 1, away: pr.away ?? pr.road ?? side === 1, dist: pr.dist ?? null, venue: pr.venue ?? null, qb: pr.qb ?? null,
      });
      if (pr.qb) {
        st.qbStarts.set(pr.qb, (st.qbStarts.get(pr.qb) ?? 0) + 1);
        inc(st.teamQbs, key, pr.qb);
      }
      const coach = g.coach[side];
      if (coach && c) {
        const rec = st.coachAts.get(coach) ?? [0, 0];
        rec[c > 0 ? 0 : 1]++;
        st.coachAts.set(coach, rec);
      }
    }
    const meetKey = [...frs].sort().join('|');
    if (!st.meet.has(meetKey)) st.meet.set(meetKey, []);
    st.meet.get(meetKey).push({ date: g.date, season, margin, cover, total, tl: g.total, id: g.id, homeApp: g.homeApp, awayApp: g.awayApp,
      homeScore: hs, awayScore: as, spread: g.spread });
    st.league.push(hs); st.league.push(as);
    if (g.spread !== null) {
      st.mkt.update(g.homeFr, g.awayFr, g.neutral, g.spread);
      for (const fr of frs) st.mktN.set(fr, (st.mktN.get(fr) ?? 0) + 1);
    }
  };

  let i = 0;
  while (i < all.length) {
    let j = i;
    while (j < all.length && all[j].date === all[i].date) j++;
    for (let x = i; x < j; x++) compute(all[x]);
    for (let x = i; x < j; x++) if (all[x].played) update(all[x]);
    i = j;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------
export const W110 = 0.9091;
/** Profit per unit risked at American odds, rounded to 4 dp per pick; blank odds price at -110. */
export const payout = odds => (odds === null || odds === undefined ? W110 : round4(odds > 0 ? odds / 100 : 100 / Math.abs(odds)));
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

export function wilson(w, n, z = Z95) {
  if (!n) return null;
  const p = w / n, z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [round4(centre - half), round4(centre + half)];
}

const lgamma = x => {
  // Lanczos approximation (g = 7, n = 9); accurate to ~1e-13 for x > 0.
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const tt = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(tt) - tt + Math.log(a);
};
/** P(X >= k) for X ~ Binomial(n, p), exact summation (port of the study's binom_sf). */
export function binomSf(k, n, p) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  const q = 1 - p, lp = Math.log(p), lq = Math.log(q);
  const logpmf = j => lgamma(n + 1) - lgamma(j + 1) - lgamma(n - j + 1) + j * lp + (n - j) * lq;
  if (k > n * p) {
    let s = 0, j = k, pm = Math.exp(logpmf(k));
    while (j <= n) { s += pm; if (pm < 1e-18 * s) break; pm *= ((n - j) / (j + 1)) * (p / q); j++; }
    return Math.min(1, s);
  }
  let s = 0, j = k - 1, pm = Math.exp(logpmf(k - 1));
  while (j >= 0) { s += pm; if (pm < 1e-18 * s) break; pm *= (j / (n - j + 1)) * (q / p); j--; }
  return Math.max(0, 1 - s);
}
export function binomTwoSided(k, n) {
  if (n === 0) return 1;
  const hi = binomSf(k, n, 0.5), lo = 1 - binomSf(k + 1, n, 0.5);
  return Math.min(1, 2 * Math.min(hi, lo));
}
/** Benjamini-Hochberg q-values, same order as the input p-values. */
export function bh(pvals) {
  const m = pvals.length;
  const order = pvals.map((p, i) => i).sort((a, b) => pvals[a] - pvals[b] || a - b);
  const q = new Array(m).fill(1);
  let prev = 1;
  for (let rank = m; rank >= 1; rank--) {
    const i = order[rank - 1];
    prev = Math.min(prev, (pvals[i] * m) / rank);
    q[i] = prev;
  }
  return q;
}
export function jaccard(a, b) {
  const A = a instanceof Set ? a : new Set(a), B = b instanceof Set ? b : new Set(b);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// ---------------------------------------------------------------------------
// Markets and bet units
// ---------------------------------------------------------------------------
export const MARKETS = {
  home_ats: { label: 'ATS home vs road', sides: ['Home team ATS', 'Road team ATS'] },
  fav_ats: { label: 'ATS favorite vs underdog', sides: ['Favorite ATS', 'Underdog ATS'] },
  total: { label: 'Over/under', sides: ['Over', 'Under'] },
  total_rev: { label: 'Over/under', sides: ['Against the direction (Under after high-scoring starts, Over after low)', 'With the direction'] },
  team_ats: { label: 'ATS team with the trait vs its opponent', sides: ['Back the team ATS', 'Fade the team ATS'] },
  su: { label: 'Straight-up', sides: ['Team wins', 'Team loses'] },
};
const sign = x => (x > 0) - (x < 0);

/** Played games with both lines from the first evaluation season on (regular season and playoffs). */
export function evaluationGames(fgames, { firstSeason = PERIODS.firstSeason } = {}) {
  return fgames.filter(g => g.played && g.season >= firstSeason && g.spread !== null && g.total !== null);
}

const gameOutcome = (market, g) => {
  const hc = g.homeScore - g.awayScore - g.spread;
  const t = g.homeScore + g.awayScore - g.total;
  if (market === 'home_ats') return { res: sign(hc), resid: hc, oa: g.oddsHome, ob: g.oddsAway };
  if (market === 'fav_ats') {
    if (g.spread === 0) return null;
    return g.spread > 0 ? { res: sign(hc), resid: hc, oa: g.oddsHome, ob: g.oddsAway } : { res: -sign(hc), resid: -hc, oa: g.oddsAway, ob: g.oddsHome };
  }
  if (market === 'total') return { res: sign(t), resid: t, oa: g.oddsOver, ob: g.oddsUnder };
  if (market === 'total_rev') {
    const dir = g.meta.totrevX > 0 ? -1 : 1;
    return { res: dir * sign(t), resid: dir * t, oa: dir > 0 ? g.oddsOver : g.oddsUnder, ob: dir > 0 ? g.oddsUnder : g.oddsOver };
  }
  throw new Error(`Unknown game market ${market}`);
};
const rowOutcome = (market, g, side) => {
  if (market === 'team_ats') {
    const hc = g.homeScore - g.awayScore - g.spread;
    return side === 0 ? { res: sign(hc), resid: hc, oa: g.oddsHome, ob: g.oddsAway } : { res: -sign(hc), resid: -hc, oa: g.oddsAway, ob: g.oddsHome };
  }
  if (market === 'su') {
    const m = side === 0 ? g.homeScore - g.awayScore : g.awayScore - g.homeScore;
    return { res: sign(m), resid: m, oa: side === 0 ? g.mlHome : g.mlAway, ob: side === 0 ? g.mlAway : g.mlHome, ml: true };
  }
  throw new Error(`Unknown team market ${market}`);
};

const appOf = (g, side) => (side === 0 ? g.homeApp : g.awayApp);
const frOf = (g, side) => (side === 0 ? g.homeFr : g.awayFr);

/** Evaluate one atom on a game (game atoms) or a team row (row atoms). */
export function atomValue(atomId, g, side = null) {
  const at = atomId.indexOf(':');
  const kind = atomId.slice(0, at), val = atomId.slice(at + 1);
  switch (kind) {
    case 'g': return g.gf[val];
    case 'any': {
      const a = g.tf[0][val], b = g.tf[1][val];
      if (a === true || b === true) return true;
      if (a === 'pending' || b === 'pending') return 'pending';
      if (a === null || b === null) return null;
      return false;
    }
    case 't': return g.tf[side][val];
    case 'role':
      if (val === 'home') return side === 0;
      if (val === 'away') return side === 1;
      if (g.spread === null) return null;
      if (val === 'fav') return (g.spread > 0 && side === 0) || (g.spread < 0 && side === 1);
      if (val === 'dog') return (g.spread < 0 && side === 0) || (g.spread > 0 && side === 1);
      break;
    case 'ref': return g.referee === val;
    case 'coach': return g.coach[side] === val;
    case 'qb': return g.qb[side] === val;
    case 'team': return frOf(g, side) === val;
    case 'anycoach': return g.coach[0] === val || g.coach[1] === val;
    case 'anyqb': return g.qb[0] === val || g.qb[1] === val;
    case 'anyteam': return g.homeFr === val || g.awayFr === val;
    case 'venue': return val === 'home' ? side === 0 && !g.neutral : val === 'road' ? side === 1 && !g.neutral : side !== null && g.neutral;
    case 'hosts': return g.homeFr === val && !g.neutral;
    case 'visits': return g.awayFr === val && !g.neutral;
    case 'neutralteam': return g.neutral && (g.homeFr === val || g.awayFr === val);
    default: break;
  }
  throw new Error(`Unknown atom ${atomId}`);
}
export const isRowMarket = market => market === 'team_ats' || market === 'su';
const ENTITY_KINDS = new Set(['ref', 'coach', 'qb', 'team', 'anycoach', 'anyqb', 'anyteam', 'hosts', 'visits', 'neutralteam']);

/** Bet units of a preset over the evaluation games, in date order. */
export function betUnits(preset, pop, { rules = {} } = {}) {
  const units = [];
  const { market, atoms } = preset;
  for (const g of pop) {
    if (isRowMarket(market)) {
      const ok = [0, 1].map(side => atoms.every(a => atomValue(a, g, side) === true));
      if (ok[0] === ok[1]) continue; // neither, or both teams fit (dropped)
      const side = ok[0] ? 0 : 1;
      const o = rowOutcome(market, g, side);
      units.push({ g, side, id: `${g.id}:${frOf(g, side)}`, ...o });
    } else {
      if (market === 'home_ats' && rules.homeMarketExcludesNeutral && g.neutral) continue;
      if (!atoms.every(a => atomValue(a, g) === true)) continue;
      const o = gameOutcome(market, g);
      if (!o) continue;
      units.push({ g, side: null, id: g.id, ...o });
    }
  }
  return units;
}

// Per-season aggregation, side A = first market side.
function aggregate(units) {
  const agg = new Map();
  for (const u of units) {
    const s = u.g.season;
    let a = agg.get(s);
    if (!a) agg.set(s, (a = { wA: 0, lA: 0, p: 0, uA: 0, uB: 0, uA110: 0, uB110: 0, rs: 0, rss: 0, rn: 0 }));
    a.rs += u.resid; a.rss += u.resid * u.resid; a.rn++;
    if (u.res > 0) { a.wA++; a.uA += payout(u.oa); a.uB -= 1; a.uA110 += W110; a.uB110 -= 1; }
    else if (u.res < 0) { a.lA++; a.uA -= 1; a.uB += payout(u.ob); a.uA110 -= 1; a.uB110 += W110; }
    else a.p++;
  }
  return agg;
}
const sideView = (a, side) => (side === 'A'
  ? { w: a.wA, l: a.lA, p: a.p, u: a.uA, u110: a.uA110 }
  : { w: a.lA, l: a.wA, p: a.p, u: a.uB, u110: a.uB110 });
const residStats = (sm, ss, n, side) => {
  if (n < 2) return { pts: null, t: null };
  const mean = sm / n;
  const variance = Math.max(1e-9, (ss - n * mean * mean) / (n - 1));
  const tt = mean / Math.sqrt(variance / n);
  return side === 'B' ? { pts: -mean, t: -tt } : { pts: mean, t: tt };
};
function summarize(agg, first, last, side) {
  let W = 0, L = 0, P = 0, U = 0, U110 = 0, pos = 0, bet = 0, sm = 0, ss = 0, nr = 0;
  for (let s = first; s <= last; s++) {
    const a = agg.get(s);
    if (!a) continue;
    const v = sideView(a, side);
    if (v.w + v.l + v.p === 0) continue;
    W += v.w; L += v.l; P += v.p; U += v.u; U110 += v.u110;
    sm += a.rs; ss += a.rss; nr += a.rn;
    bet++;
    if (v.u > 0) pos++;
  }
  const n = W + L + P;
  return { W, L, P, n, hit: W + L ? W / (W + L) : null, units: U, roi: n ? U / n : null, roi110: n ? U110 / n : null,
    seasonsPos: pos, seasonsBet: bet, ...residStats(sm, ss, nr, side) };
}
/** Walk-forward: each season's side comes only from earlier seasons (20+ decided, ties skipped). */
function walkForward(agg, first, last, refSide = null) {
  let W = 0, L = 0, P = 0, U = 0, U110 = 0, pos = 0, bet = 0, osm = 0, oss = 0, onr = 0;
  const sides = [], per = [], sideOf = new Map();
  for (let s = first; s <= last; s++) {
    let tw = 0, tl = 0;
    for (let x = PERIODS.firstSeason; x < s; x++) { const a = agg.get(x); if (a) { tw += a.wA; tl += a.lA; } }
    if (tw + tl < MIN_TRAIN || tw === tl) continue;
    const side = tw > tl ? 'A' : 'B';
    sideOf.set(s, side);
    const a = agg.get(s);
    if (!a) continue;
    const v = sideView(a, side);
    if (v.w + v.l + v.p === 0) continue;
    sides.push(side);
    W += v.w; L += v.l; P += v.p; U += v.u; U110 += v.u110;
    const sg = side === 'A' ? 1 : -1;
    osm += sg * a.rs; oss += a.rss; onr += a.rn;
    bet++;
    if (v.u > 0) pos++;
    per.push([s, side, v.w, v.l, v.p, round2(v.u)]);
  }
  const counts = new Map();
  for (const x of sides) counts.set(x, (counts.get(x) ?? 0) + 1);
  const n = W + L + P;
  return {
    W, L, P, n, hit: W + L ? W / (W + L) : null, ...residStats(osm, oss, onr, 'A'),
    units: U, roi: n ? U / n : null, roi110: n ? U110 / n : null, seasonsPos: pos, seasonsBet: bet,
    p1: W + L ? binomSf(W, W + L, 0.5) : null,
    sideFlips: refSide ? sides.filter(x => x !== refSide).length : null,
    dominantSide: sides.length ? mostCommon(counts) : null, perSeason: per, sideOf,
  };
}

function betSeries(units, sideFor) {
  // Chronological results on the bet side: +1 win, -1 loss, 0 push.
  const out = [];
  for (const u of units) {
    const side = sideFor(u);
    if (!side) continue;
    out.push({ r: side === 'A' ? u.res : -u.res, odds: side === 'A' ? u.oa : u.ob, season: u.g.season, date: u.g.date });
  }
  return out;
}
function seriesRecord(series, { spark = false, oddsUnits = false } = {}) {
  let W = 0, L = 0, P = 0, units = 0, priced = 0, unitsPriced = 0;
  for (const b of series) {
    if (b.r > 0) { W++; units += W110; if (b.odds !== null) { priced++; unitsPriced += payout(b.odds); } }
    else if (b.r < 0) { L++; units -= 1; if (b.odds !== null) { priced++; unitsPriced -= 1; } }
    else { P++; if (b.odds !== null) priced++; }
  }
  const n = W + L + P;
  let streak = null;
  for (let i = series.length - 1; i >= 0; i--) {
    const r = series[i].r;
    if (r === 0) continue;
    if (!streak) streak = { result: r > 0 ? 'W' : 'L', length: 1 };
    else if ((r > 0 ? 'W' : 'L') === streak.result) streak.length++;
    else break;
  }
  const last10 = { W: 0, L: 0, P: 0 };
  for (const b of series.slice(-10)) { if (b.r > 0) last10.W++; else if (b.r < 0) last10.L++; else last10.P++; }
  const rec = { W, L, P, hit: W + L ? round4(W / (W + L)) : null, wilson95: wilson(W, W + L), units110: round4(units),
    roi110: n ? round4(units / n) : null, streak, last10 };
  if (oddsUnits) rec.fileOdds = { priced, units: round4(unitsPriced), roi: priced ? round4(unitsPriced / priced) : null };
  if (spark) {
    const cum = [0];
    let c = 0;
    for (const b of series) { c += b.r > 0 ? W110 : b.r < 0 ? -1 : 0; cum.push(c); }
    const idx = cum.length <= 48 ? cum.map((_, i) => i) : Array.from({ length: 48 }, (_, i) => Math.round((i * (cum.length - 1)) / 47));
    rec.spark = idx.map(i => round2(cum[i]));
    let minI = 0;
    for (let i = 1; i < cum.length; i++) if (cum[i] < cum[minI]) minI = i;
    rec.sparkLow = { units: round2(cum[minI]), season: minI ? series[minI - 1].season : null };
  }
  return rec;
}
const recOnly = r => ({ W: r.W, L: r.L, P: r.P });

/**
 * Evaluate a preset: neutral full-history split, discovery (2002-2017), walk-forward
 * confirmation (2018 through the last completed season), the honest walk-forward record
 * from 2003 on, and (for registered presets) the registered side's record.
 */
export function evaluatePreset(preset, ctx) {
  const { pop, rules = {}, throughSeason, currentSeason, lastFinalDate } = ctx;
  const units = ctx.units ?? betUnits(preset, pop, { rules });
  const agg = aggregate(units);
  const discA = summarize(agg, PERIODS.firstSeason, PERIODS.discoveryLast, 'A');
  const discSide = discA.W >= discA.L ? 'A' : 'B';
  const disc = { ...summarize(agg, PERIODS.firstSeason, PERIODS.discoveryLast, discSide), side: discSide };
  disc.p2 = binomTwoSided(disc.W, disc.W + disc.L);
  const oos = walkForward(agg, PERIODS.confirmationFirst, throughSeason, discSide);
  const wfAll = walkForward(agg, PERIODS.firstSeason + 1, currentSeason, discSide);
  const seasons = new Set(units.map(u => u.g.season));
  let aW = 0, aL = 0, aP = 0;
  for (const u of units) { if (u.res > 0) aW++; else if (u.res < 0) aL++; else aP++; }
  const decidedThrough = units.filter(u => u.res !== 0 && u.g.season <= throughSeason).length;
  const result = {
    units, betSet: units.map(u => u.id),
    split: { A: aW, B: aL, P: aP },
    games: units.length, seasons: seasons.size,
    firstSeason: units.length ? units[0].g.season : null, lastSeason: units.length ? units[units.length - 1].g.season : null,
    firstDate: units.length ? units[0].g.date : null, lastDate: units.length ? units[units.length - 1].g.date : null,
    decided: aW + aL, decidedThrough, disc, oos, wfAll,
  };
  const wfSide = u => wfAll.sideOf.get(u.g.season) ?? null;
  const wfFirst = wfAll.perSeason.length ? wfAll.perSeason[0][0] : null;
  result.wf = { from: wfFirst, ...seriesRecord(betSeries(units, wfSide)) };
  const seasonSide = preset.side ?? wfAll.sideOf.get(currentSeason) ?? null;
  result.seasonSide = seasonSide;
  if (preset.side) {
    result.reg = seriesRecord(betSeries(units, () => preset.side), { spark: true, oddsUnits: true });
  }
  const inSeason = units.filter(u => u.g.season === currentSeason);
  result.thisSeason = seasonSide ? recOnly(seriesRecord(betSeries(inSeason, () => seasonSide))) : null;
  const since = units.filter(u => u.g.date > lastFinalDate);
  result.sinceRegistered = seasonSide ? recOnly(seriesRecord(betSeries(since, () => seasonSide))) : null;
  return result;
}

// ---------------------------------------------------------------------------
// GTL trend quality score (exact port of the S1 score.py) and tier gates
// ---------------------------------------------------------------------------
export const K_FAMILY = {
  weather_observed: 5, form: 5, market: 5,
  previous_game: 2, site: 2, rest: 2, travel: 2, kickoff: 2, division: 2, fav_venue: 2, spread_key: 2, spread_band: 2,
  total_band: 2, total_key: 2, venue: 2, total_vs_scoring: 2, strength: 2, rating: 2, late_season: 2, road_streak: 2,
  quarterback: 2, season_timing: 2,
  spot: 0, head_to_head: 0, referee: 0, coach: 0, baseline: 0,
};
const K_ATOM = { g_w1_4: 5, g_week1: 5 };
export function kPrior(atoms) {
  const ks = [];
  for (const a of atoms) {
    const kind = a.slice(0, a.indexOf(':')), val = a.slice(a.indexOf(':') + 1);
    if (ENTITY_KINDS.has(kind)) return 0;
    if (kind === 'g' || kind === 't' || kind === 'any') ks.push(K_ATOM[val] ?? K_FAMILY[ATOMS[val].family] ?? 0);
  }
  return ks.length ? Math.min(...ks) : 0;
}

export const TIER_LABELS = {
  1: 'Strongest historical evidence (played games only)',
  2: 'Consistent in 2002-2017 and 2018-2025, not proven',
  3: 'No proven edge',
  anecdote: 'Anecdote',
};

/** Quality score 0-100. Raw formula and caps from S1; then the eligibility (39) and anecdote (15) caps. */
export function qualityScore(result, preset, { q = null, throughSeason, eligible = false } = {}) {
  const o = result.oos, i = result.disc;
  const n = o.W + o.L;
  const anecdote = result.decided < 30 || result.seasons < 3;
  if (n === 0) {
    return { score: 0, E: 0, M: 0, R: 0, C: 0, P: 0, Rc: 0, K: 0, pen: 0, cap: anecdote ? 15 : 35, n: 0, anecdote, noOos: true };
  }
  const hit = o.W / n;
  const zBe = (hit - BREAK_EVEN) / Math.sqrt((BREAK_EVEN * (1 - BREAK_EVEN)) / n);
  const E = 35 * clamp(zBe / 3);
  const M = q !== null && q !== undefined ? 10 * clamp((0.5 - q) / 0.4) : 0;
  let R = 0;
  const ni = i.W + i.L;
  if (ni >= 20 && o.dominantSide) {
    const wi = o.dominantSide === i.side ? i.W : i.L;
    R = 20 * clamp((wi / ni - 0.5) / Math.sqrt(0.25 / ni) / 2.5);
  }
  const share = o.seasonsBet ? o.seasonsPos / o.seasonsBet : 0;
  const C = 15 * clamp((share - 0.5) / 0.375);
  const P = 10 * clamp((o.pts ?? 0) / 1.5);
  const last3 = o.perSeason.filter(x => x[0] >= throughSeason - 2);
  const Rc = last3.length && last3.reduce((s, x) => s + x[5], 0) > 0 ? 5 : 0;
  const K = preset.K ?? kPrior(preset.atoms);
  const raw = E + M + R + C + P + Rc + K;
  let pen = 5 * Math.max(0, preset.atoms.length - 1);
  if (o.sideFlips >= 2) pen += 10;
  const posu = o.perSeason.map(x => x[5]).filter(u => u > 0);
  const posSum = posu.reduce((s, x) => s + x, 0);
  if (posu.length && posSum > 0 && Math.max(...posu) / posSum > 0.5 && o.perSeason.length >= 4) pen += 5;
  let cap = n < 60 ? 35 : n < 150 ? 69 : 100;
  if (!eligible) cap = Math.min(cap, 39);
  if (anecdote) cap = Math.min(cap, 15);
  const score = round1(Math.max(0, Math.min(cap, raw - pen)));
  return { score, raw: round1(raw - pen), E: round1(E), M: round1(M), R: round1(R), C: round1(C), P: round1(P), Rc, K, pen, cap, n, anecdote };
}

/**
 * Eligibility and tier gates. Eligibility ignores display timing (observed weather is
 * eligible for history and played games only). Tier 1 needs q <= 0.10 or the stored
 * permutation family-wise p (permMaxP, the max-score statistic) <= 0.05.
 */
export function gates(result, preset, { q = null, robustness = [] } = {}) {
  const o = result.oos;
  const n = o.W + o.L;
  const failed = [];
  const atoms = preset.atoms;
  if (atoms.length > 2) failed.push('more than 2 filters');
  if (atoms.some(a => ENTITY_KINDS.has(a.slice(0, a.indexOf(':'))))) failed.push('entity filter');
  if ((preset.K ?? kPrior(atoms)) < 2) failed.push('no mechanism prior (K < 2)');
  if (o.sideFlips === null || o.sideFlips > 1) failed.push('side changed in 2+ confirmation seasons');
  if (!n || o.W / n < BREAK_EVEN) failed.push('confirmation hit below 52.38%');
  if (!(o.roi110 > 0)) failed.push('confirmation ROI at -110 not positive');
  if (!((o.pts ?? 0) > 0)) failed.push('points versus the line not positive');
  const i = result.disc, ni = i.W + i.L;
  let R = 0;
  if (ni >= 20 && o.dominantSide) {
    const wi = o.dominantSide === i.side ? i.W : i.L;
    R = 20 * clamp((wi / ni - 0.5) / Math.sqrt(0.25 / ni) / 2.5);
  }
  if (R < 10) failed.push('no replication in 2002-2017 (R < 10)');
  if (preset.side && o.dominantSide && o.dominantSide !== preset.side) failed.push('confirmation side differs from the registered side');
  const robustFail = robustness.filter(v => !v.pass).map(v => v.id);
  if (robustFail.length) failed.push(`robustness: ${robustFail.join(', ')}`);
  const eligible = failed.length === 0;
  const share = o.seasonsBet ? o.seasonsPos / o.seasonsBet : 0;
  const tier2Checks = eligible && n >= 100 && o.seasonsBet >= 5 && share >= 0.6;
  const tier1Checks = eligible && n >= 300 && o.seasonsBet >= 6 && share >= 0.7
    && ((q !== null && q <= 0.1) || (preset.permMaxP !== undefined && preset.permMaxP !== null && preset.permMaxP <= 0.05));
  return { eligible, failed, tier2Checks, tier1Checks };
}

/** Robustness: a drop-one or loosen-one variant must bet the same side with hit >= 50% in 2002-2017 and in 2018-through. */
export function robustnessCheck(variantResult, side, throughSeason) {
  const agg = aggregate(variantResult.units);
  const d = summarize(agg, PERIODS.firstSeason, PERIODS.discoveryLast, side);
  const c = summarize(agg, PERIODS.confirmationFirst, throughSeason, side);
  const dSide = variantResult.disc.side;
  return { pass: dSide === side && (d.hit ?? 0) >= 0.5 && (c.hit ?? 0) >= 0.5,
    disc: { W: d.W, L: d.L, P: d.P }, conf: { W: c.W, L: c.L, P: c.P } };
}

/** '#' header lines for a committed CSV cut from the schedule file (attribution, source, input hash). */
export function sourceHeaderLines({ origin, sha256, bytes, retrieved, scope, redacted = false }) {
  return [
    `${TRENDS_SOURCE.credit}. License: ${TRENDS_SOURCE.licenseUrl}`,
    `Source: ${TRENDS_SOURCE.url}`,
    `Input: ${origin}; sha256 ${sha256}; ${bytes} bytes; retrieved ${retrieved}`,
    `Modified: ${scope}; column subset (${HISTORY_COLUMNS.length} of the schedule columns); '""' and NA cells written blank; values trimmed. Corrections are applied when read (shared/trends-corrections.json).`,
    ...(redacted ? ['Unplayed games: lines, odds, moneylines, weather and referee are blank (hidden-line rule).'] : []),
    TRENDS_SOURCE.caveat,
  ];
}

// ---------------------------------------------------------------------------
// Week assembly
// ---------------------------------------------------------------------------
/** Words a trend title, filter, note or copy string may never use (the copy guard). */
export const BANNED_COPY = Object.freeze(['lock', 'best bet', 'edge', 'guaranteed', 'sharp', 'value play', "can't lose"]);
/** Exact phrases allowed although they contain a banned word (a negation). */
export const ALLOWED_COPY = Object.freeze(['No proven edge', 'no proven edge']);
export function bannedCopy(text) {
  let t = String(text);
  for (const ok of ALLOWED_COPY) t = t.split(ok).join(' ');
  return BANNED_COPY.filter(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t));
}

export const COPY = Object.freeze({
  reference: 'Past results against nflverse lines. Reference only: not a betting recommendation, and trends never change GTL scoring.',
  evidence: 'In out-of-sample testing (2018-2025) only one trend beat chance: strong wind at kickoff (10+ mph) went Under, on played games. It needs observed wind, so it never applies to an upcoming game.',
  selection: 'Results 2018-2025 (period used to select this card)',
  prospective: 'Since registered Oct 12, 2026 (the only prospective record)',
  calibration: 'Not proven: on shuffled outcomes the same gate passes about as many trends (13.3 on average) as on real data (12).',
  tier3: 'No proven edge. Full-history records are shown both ways; the walk-forward record picks each season\'s side from earlier seasons only.',
  windConditional: 'Applies only if kickoff wind is 10+ mph; no forecast source',
  wind15Conditional: 'Applies only if kickoff wind is 15+ mph; no forecast source',
  weatherConditional: 'Applies only to observed kickoff weather; no forecast source',
  roofConditional: 'Applies only if the retractable roof is closed',
  qbProvisional: "Starting QBs for upcoming games are nflverse's expected starters (provisional).",
  scoring: 'Scores and tiers use completed seasons (through the last full season); this season appears as This season and Since registered.',
  stacked: 'Same side as another card; they are not independent confirmations.',
  bothFit: 'Both teams fit; not applied',
  lineSource: `Line source: ${LINE_SOURCE}`,
  credit: TRENDS_SOURCE.credit,
});

const r3 = x => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000);
export const SCHEMA_NOTES = Object.freeze({
  rows: 'rows[id]: compact Tier 3, entity and referee records. split = [side A, side B, pushes] over every game since 2002 (in-sample, shown both ways). wf = walk-forward record [W, L, P] from wfFrom on, each season\'s side chosen from earlier seasons only (streak and last10 on that record; units at -110 = W * 0.9091 - L). oos = the walk-forward record 2018 through the last full season (the score\'s evidence). side = this season\'s side (A or B, see markets) fixed from earlier seasons; season and since = this season and since registration on that side. registered = a registered side\'s full record. Sides: markets[market].sides.',
  conditional: 'games[].conditional[].note is a key of copy.',
  items: 'Context, gated and band items are row ids; "id@TEAM" binds a team trait to that team. gatedCards hold card references ({ card, team }) that unlock after the named ballot (spread, total or both).',
  omitted: 'A row without years spans 2002 through this season; a row without seasons has games in every season of its years; a row with wf but no wfFrom starts its walk-forward record in 2003. Referee rows carry no title: label them from the referees map (career, primetime, divisional, total band). A row without wf has no walk-forward bets yet (fewer than 20 decided games before each season). A missing season or since record is 0-0-0.',
  cards: 'cards[id]: Tier 1, Tier 2 and watch-list cards with a registered side. record = the registered side over every game since 2002 (in-sample). selection = walk-forward 2018 through the last full season, the period used to select the card. sinceRegistered = the only prospective record.',
  hiddenLines: 'No current-week line, odds, weather or referee is read: unplayed games are redacted before features are built. Line-dependent rows sit in gated lists and band tables for the client to unlock after the matching ballot.',
});
const atomNeeds = a => {
  const kind = a.slice(0, a.indexOf(':')), val = a.slice(a.indexOf(':') + 1);
  if (kind === 'role') return val === 'fav' || val === 'dog' ? 'spread' : null;
  if (kind === 'g' || kind === 't' || kind === 'any') return ATOMS[val]?.needs ?? null;
  return null;
};
/** Status of a set of atoms on one game (or team row): fires, no, pending, played_only, gated:*, conditional:roof. */
function combineStatus(atoms, valueOf) {
  let pending = false;
  const needs = new Set();
  for (const a of atoms) {
    const v = valueOf(a);
    if (v === false || v === undefined) return 'no';
    if (v === true) continue;
    if (v === 'pending') { pending = true; continue; }
    const need = atomNeeds(a);
    if (!need) return 'no';
    needs.add(need);
  }
  if (pending) return 'pending';
  if (!needs.size) return 'fires';
  if (needs.has('weather')) return 'played_only';
  const sp = needs.has('spread') || needs.has('both'), tt = needs.has('total') || needs.has('both');
  if (sp && tt) return 'gated:both';
  if (sp) return 'gated:spread';
  if (tt) return 'gated:total';
  return 'conditional:roof';
}
const pureLine = p => p.atoms.every(a => ['spread', 'total', 'both'].includes(atomNeeds(a)));

/** Applicable statuses of a preset for one game: [{ status, side }] (side null for game markets). */
function presetStatuses(p, g, rules) {
  if (isRowMarket(p.market)) {
    const st = [0, 1].map(side => combineStatus(p.atoms, a => atomValue(a, g, side)));
    if (st[0] === 'fires' && st[1] === 'fires') return [{ status: 'both_fit', side: null }];
    const f = st[0] === 'fires' ? 0 : st[1] === 'fires' ? 1 : null;
    if (f !== null) return [{ status: st[1 - f] === 'no' ? 'fires' : st[1 - f], side: f }];
    return [0, 1].filter(side => st[side] !== 'no').map(side => ({ status: st[side], side }));
  }
  if (p.market === 'home_ats' && rules.homeMarketExcludesNeutral && g.neutral) return [];
  const status = combineStatus(p.atoms, a => atomValue(a, g, null));
  return status === 'no' ? [] : [{ status, side: null }];
}

const recArr = r => [r.W, r.L, r.P];
const streakText = s => (s ? `${s.result}${s.length}` : null);
const sidesOf = p => (p.market === 'total_rev' ? ['With the rule', 'Against the rule'] : MARKETS[p.market].sides);
/** The concrete bet for a firing preset on a game, normalized for conflict and overlap checks. */
function betFor(p, g, side) {
  const s = p.side;
  if (p.market === 'team_ats') {
    const team = appOf(g, side), opp = appOf(g, 1 - side);
    const target = s === 'A' ? team : opp;
    return { key: `ats:${target}`, opposite: `ats:${s === 'A' ? opp : team}`, label: s === 'A' ? `Back ${team} ATS` : `Fade ${team} (${opp} ATS)`, team };
  }
  if (p.market === 'home_ats') {
    const target = s === 'A' ? g.homeApp : g.awayApp, other = s === 'A' ? g.awayApp : g.homeApp;
    return { key: `ats:${target}`, opposite: `ats:${other}`, label: `${target} ATS (${s === 'A' ? 'home' : 'road'} team)`, team: null };
  }
  if (p.market === 'fav_ats') return { key: `fav:${s}`, opposite: `fav:${s === 'A' ? 'B' : 'A'}`, label: s === 'A' ? 'Favorite ATS' : 'Underdog ATS', team: null };
  if (p.market === 'total') return { key: `total:${s}`, opposite: `total:${s === 'A' ? 'B' : 'A'}`, label: s === 'A' ? 'Over' : 'Under', team: null };
  const dir = (g.meta.totrevX ?? 0) > 0 ? 'Under' : 'Over';
  const bet = s === 'A' ? dir : dir === 'Under' ? 'Over' : 'Under';
  return { key: `total:${bet === 'Over' ? 'A' : 'B'}`, opposite: `total:${bet === 'Over' ? 'B' : 'A'}`, label: bet, team: null };
}
/** Historical bet set normalized to the team (or side) actually bet, for Jaccard overlap. */
function normalizedBetSet(p, r) {
  return new Set(r.units.map(u => {
    if (p.market === 'team_ats') return `${u.g.id}:${(u.side === 0) === (p.side === 'A') ? u.g.homeApp : u.g.awayApp}`;
    if (p.market === 'home_ats') return `${u.g.id}:${p.side === 'A' ? u.g.homeApp : u.g.awayApp}`;
    return `${u.g.id}:${p.side}`;
  }));
}

/**
 * Generate the committed week file for one regular-season week. Deterministic: the same
 * inputs give the same object (stable sorts, numbers rounded to 4 dp, no clock).
 */
export function generateWeek({ historyCsv, seasonCsv, season, week, registry, venues, corrections, referees = {}, allowPending = false, sources = {} }) {
  const rules = corrections.rules ?? {};
  const rows = [...parseCsvRows(historyCsv).rows, ...parseCsvRows(seasonCsv).rows];
  const games = redactUnplayed(normalizeRows(rows, { corrections, venues }));
  const fg = buildFeatures(games, { venues, corrections });
  const pop = evaluationGames(fg);
  const throughSeason = season - 1;
  const lastFinalDate = registry.lastFinalDate;
  const asOf = fg.filter(g => g.played).reduce((m, g) => (g.date > m ? g.date : m), '');
  const ctx = { pop, rules, throughSeason, currentSeason: season, lastFinalDate };
  const target = fg.filter(g => g.season === season && g.gameType === 'REG' && g.week === week)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.kick - b.kick || (a.id < b.id ? -1 : 1));
  if (!target.length) throw new Error(`No ${season} Week ${week} regular-season games in the season file.`);
  const pendingGames = new Set(), pendingTeams = [];
  for (const g of target) for (const side of [0, 1]) {
    const waiting = g.meta.pending[side];
    if (!waiting) continue;
    waiting.forEach(id => pendingGames.add(id));
    pendingTeams.push({ team: appOf(g, side), gameId: [...waiting].sort()[0] });
  }
  if (pendingGames.size && !allowPending) throw new TrendsPendingError([...pendingGames].sort());
  pendingTeams.sort((a, b) => (a.team < b.team ? -1 : 1));

  // Evaluate, score and gate every registry preset.
  const presets = registry.presets;
  const byId = new Map(presets.map(p => [p.id, p]));
  const results = new Map();
  const resultOf = p => {
    if (!results.has(p.id)) results.set(p.id, evaluatePreset(p, ctx));
    return results.get(p.id);
  };
  const graded = new Map();
  const grade = p => {
    if (graded.has(p.id)) return graded.get(p.id);
    const r = resultOf(p);
    const robustness = (p.robustness ?? []).map(atoms => {
      const vid = `${p.market}|${atoms.join('+')}`;
      const vp = byId.get(vid) ?? { id: vid, market: p.market, atoms };
      return { id: vid, ...robustnessCheck(resultOf(vp), p.side, throughSeason) };
    });
    const gate = gates(r, p, { q: p.q, robustness });
    const sc = qualityScore(r, p, { q: p.q, throughSeason, eligible: gate.eligible && p.tierCeiling < 3 });
    let tier = 3;
    if (p.tierCeiling <= 1 && gate.tier1Checks && sc.score >= 80) tier = 1;
    else if (p.tierCeiling <= 2 && gate.tier2Checks && sc.score >= 40) tier = 2;
    if (tier === 3 && sc.score > 39) { sc.score = 39; sc.cap = 39; }
    const label = sc.anecdote ? TIER_LABELS.anecdote : TIER_LABELS[tier];
    const out = { p, r, gate, robustness, sc, tier, label };
    graded.set(p.id, out);
    return out;
  };

  const cards = {}, rowsOut = {};
  const fullCard = p => {
    if (cards[p.id]) return p.id;
    const { r, gate, robustness, sc, tier, label } = grade(p);
    const sides = sidesOf(p);
    const card = {
      id: p.id, title: p.title, family: p.seanFamily, market: p.market,
      marketLabel: `NFL · ${p.market === 'total' || p.market === 'total_rev' ? 'Over/under' : 'ATS'} · ${p.sideLabel}`,
      sideRule: p.side, sideLabel: p.sideLabel, filters: p.filters, tier, label, watch: p.watch, anecdote: sc.anecdote,
      score: { score: sc.score, E: sc.E, M: sc.M, R: sc.R, C: sc.C, P: sc.P, Rc: sc.Rc, K: sc.K, pen: sc.pen, cap: sc.cap },
      q: r3(p.q), permMaxP: p.permMaxP ?? null,
      record: { ...r.reg },
      games: r.games, seasons: r.seasons, years: [r.firstSeason, r.lastSeason], firstDate: r.firstDate, lastDate: r.lastDate,
      split: { sides, rec: [r.split.A, r.split.B, r.split.P] },
      selection: { label: COPY.selection, rec: recArr(r.oos), hit: round4(r.oos.hit), roi110: round4(r.oos.roi110), pts: round4(r.oos.pts),
        seasonsPos: r.oos.seasonsPos, seasonsBet: r.oos.seasonsBet, perSeason: r.oos.perSeason },
      discovery: { rec: recArr(r.disc), side: r.disc.side, hit: round4(r.disc.hit) },
      thisSeason: r.thisSeason ? recArr(r.thisSeason) : null,
      sinceRegistered: { since: registry.registeredAt, rec: r.sinceRegistered ? recArr(r.sinceRegistered) : [0, 0, 0] },
      timing: p.timing, gate: p.gate,
      gates: { eligible: gate.eligible, failed: gate.failed, robustness: robustness.map(v => ({ id: v.id, pass: v.pass, disc: recArr(v.disc), conf: recArr(v.conf) })) },
    };
    delete card.record.fileOdds; // file-odds ROI stays hidden until the commissioner approves odds-derived records
    if (p.note) card.note = p.note;
    if (p.atoms.includes('g:g_indoor')) {
      const split = { fixedDome: [0, 0, 0], retractableClosed: [0, 0, 0] };
      for (const u of r.units) {
        const k = u.g.venue && u.g.venue.type === 'retractable' ? 'retractableClosed' : 'fixedDome';
        const res = p.side === 'A' ? u.res : -u.res;
        split[k][res > 0 ? 0 : res < 0 ? 1 : 2]++;
      }
      card.roofSplit = split;
    }
    if (p.splits) card.splits = p.splits.map(id => compactRow(byId.get(id)));
    cards[p.id] = card;
    return p.id;
  };
  const compactRow = (p, extra = {}) => {
    if (rowsOut[p.id]) return p.id;
    const { r, sc } = grade(p);
    const row = {
      title: p.title, market: p.market,
      split: [r.split.A, r.split.B, r.split.P], seasons: r.seasons, years: [r.firstSeason, r.lastSeason],
      wf: [r.wf.W, r.wf.L, r.wf.P], wfFrom: r.wf.from, streak: streakText(r.wf.streak), last10: [r.wf.last10.W, r.wf.last10.L, r.wf.last10.P],
      oos: recArr(r.oos), side: r.seasonSide, season: r.thisSeason ? recArr(r.thisSeason) : [0, 0, 0],
      since: r.sinceRegistered ? recArr(r.sinceRegistered) : [0, 0, 0], score: sc.score,
    };
    if (sc.anecdote) row.anecdote = true;
    if (p.market === 'su') { row.score = null; row.descriptive = true; } // straight-up records are descriptive; GTL scores spread and total only
    if (row.years[0] !== null && row.seasons === row.years[1] - row.years[0] + 1) delete row.seasons;
    if (row.years[0] === PERIODS.firstSeason && row.years[1] === ctx.currentSeason) delete row.years;
    if (p.family === 'referee') delete row.title;
    if (!r.wf.W && !r.wf.L && !r.wf.P) { delete row.wf; delete row.wfFrom; delete row.streak; delete row.last10; }
    else if (row.wfFrom === PERIODS.firstSeason + 1) delete row.wfFrom;
    if (!row.season.some(Boolean)) delete row.season;
    if (!row.since.some(Boolean)) delete row.since;
    if (p.side) row.registered = { side: p.side, rec: [r.reg.W, r.reg.L, r.reg.P] };
    if (p.gate !== 'none') row.gate = p.gate;
    if (p.timing !== 'pregame') row.timing = p.timing;
    if (p.watch) row.watch = true;
    Object.assign(row, extra);
    rowsOut[p.id] = row;
    return p.id;
  };
  const scoreOf = id => (cards[id]?.score.score ?? rowsOut[id]?.score ?? 0);

  // Entities (teams, coaches, quarterbacks) and referees use the same evaluation.
  const qbNames = new Map();
  for (const g of fg) for (const side of [0, 1]) {
    const id = g.qb[side];
    if (!id || !g.qbName[side]) continue;
    if (!qbNames.has(id)) qbNames.set(id, new Map());
    const m = qbNames.get(id);
    m.set(g.qbName[side], (m.get(g.qbName[side]) ?? 0) + 1);
  }
  const qbName = id => (qbNames.has(id) ? mostCommon(qbNames.get(id)) : id);
  const entity = (id, market, atoms, title, family, extra = {}) => {
    if (!byId.has(id)) {
      const p = { id, market, atoms, title, family: 'entity', seanFamily: family, tierCeiling: 3, watch: false, side: null, sideLabel: null,
        K: 0, q: null, timing: 'pregame', gate: atoms.some(a => atomNeeds(a)) ? 'spread' : 'none', filters: [] };
      byId.set(id, p);
    }
    return compactRow(byId.get(id), extra);
  };

  const refSeen = new Set();
  for (const g of fg) if (g.played && g.referee && g.season >= season - 2) refSeen.add(g.referee);
  const refereeOptions = [...refSeen].sort();
  const assigned = {};
  const REF_BANDS = ['g_t_le37', 'g_t_375_405', 'g_t_41_435', 'g_t_44_465', 'g_t_47_505', 'g_t_51p'];
  const refereesOut = {};
  for (const name of refereeOptions) {
    const q = id => registry.entityQ?.[id] ?? null;
    const mk = (market, extraAtoms, title) => {
      const id = `${market}|${['ref:' + name, ...extraAtoms].join('+')}`;
      if (!byId.has(id)) {
        byId.set(id, { id, market, atoms: [`ref:${name}`, ...extraAtoms], title, family: 'referee', seanFamily: 'referee', tierCeiling: 3,
          watch: false, side: null, sideLabel: null, K: 0, q: q(id), timing: 'pregame', gate: extraAtoms.some(a => atomNeeds(a)) ? 'total' : 'none', filters: [] });
      }
      return compactRow(byId.get(id));
    };
    refereesOut[name] = {
      total: mk('total', [], `Referee ${name}: over/under`),
      homeAts: mk('home_ats', [], `Referee ${name}: home vs road ATS`),
      primetime: { total: mk('total', ['g:g_prime'], `Referee ${name}, primetime: over/under`), homeAts: mk('home_ats', ['g:g_prime'], `Referee ${name}, primetime: home vs road ATS`) },
      divisional: { total: mk('total', ['g:g_div'], `Referee ${name}, divisional: over/under`), homeAts: mk('home_ats', ['g:g_div'], `Referee ${name}, divisional: home vs road ATS`) },
      totalBands: Object.fromEntries(REF_BANDS.map(b => [b, mk('total', [`g:${b}`], `Referee ${name}, ${ATOMS[b].desc.toLowerCase()}: over/under`)])),
    };
  }

  // Band tables: presets made only of line atoms, the same for every game, shown after the matching ballot.
  const bandTables = { spread: {}, total: {}, both: {} };
  for (const p of presets) {
    if (p.variant || p.tierCeiling < 3 || p.watch || isRowMarket(p.market) || !pureLine(p)) continue;
    (bandTables[p.gate][p.seanFamily] ??= []).push(compactRow(p));
  }
  const watchBands = presets.filter(p => p.watch && pureLine(p) && !isRowMarket(p.market)).map(p => fullCard(p));

  const familyOrder = registry.families.map(f => f.id);
  const outGames = [];
  for (const g of target) {
    const gameId = `${g.awayApp}-${g.homeApp}`;
    assigned[gameId] = referees[gameId] ?? null;
    const notes = [];
    const entry = {
      id: gameId, nflverseId: g.id, away: g.awayApp, home: g.homeApp, date: g.date, weekday: g.weekday,
      kickoff: easternToUtc(g.date, fmtKick(g.kick)), kickoffEt: fmtKick(g.kick), played: g.played,
    };
    const roof = g.roof || 'unknown';
    const windowOf = k => (k < 12 ? 'morning' : k < 15 ? 'early' : k < 19 ? 'late' : 'primetime');
    const day = g.gf.g_thu ? 'TNF' : g.gf.g_snf ? 'SNF' : g.gf.g_mnf ? 'MNF' : g.weekday;
    entry.flags = {
      window: windowOf(g.kick), day, thanksgiving: g.gf.g_thanksgiving, christmas: g.gf.g_christmas,
      divisional: g.div, interconference: g.gf.g_interconf,
      conferences: { [g.awayApp]: conferenceOf(venues, g.awayFr), [g.homeApp]: conferenceOf(venues, g.homeFr) },
      roof, surface: g.surface || null, international: g.gf.g_intl, neutral: g.neutral, altitude: g.gf.g_altitude,
      stadium: g.venue ? { id: g.stadiumId, name: g.venue.name, city: g.venue.city, country: g.venue.country, type: g.venue.type } : { id: g.stadiumId },
      travel: [1, 0].map(side => ({ team: appOf(g, side), miles: g.meta.dist[side], tz: g.meta.tz[side], traveling: g.tf[side].t_road === true })),
      rest: { [g.awayApp]: g.meta.rest[1], [g.homeApp]: g.meta.rest[0] },
    };
    entry.pending = [1, 0].filter(side => g.meta.pending[side]).map(side => appOf(g, side));
    if (g.venue?.type === 'retractable' && !g.roof) notes.push('Roof status unknown until game day (retractable roof)');
    if (g.gf.g_intl) notes.push(`International: ${g.venue.city} (${g.stadiumId}), ${fmtKick(g.kick)} ET`);
    if (g.neutral && !g.gf.g_intl) notes.push('Neutral site');
    for (const team of entry.pending) notes.push(`Previous game pending: ${team} (records update after the final)`);

    const conditional = [], tier2 = [], watch = [], pendingCards = [];
    const gated = { spread: [], total: [], both: [] }, gatedCards = { spread: [], total: [], both: [] };
    const ctxFam = new Map();
    const pushGated = (status, item) => gated[status.slice(6)].push(item);
    for (const p of presets) {
      if (p.variant) continue;
      if (p.tierCeiling >= 3 && !isRowMarket(p.market) && pureLine(p)) continue; // band tables (same for every game)
      const statuses = presetStatuses(p, g, rules);
      if (!statuses.length) continue;
      const { tier } = p.tierCeiling < 3 || p.watch ? grade(p) : { tier: 3 };
      for (const { status, side } of statuses) {
        const team = side === null ? null : appOf(g, side);
        if (status === 'both_fit') {
          if (tier < 3 || p.watch) notes.push(`${p.title}: ${COPY.bothFit}`);
          continue;
        }
        if (tier < 3 || p.watch) {
          const ref = { card: fullCard(p) };
          if (team) ref.team = team;
          if (status === 'fires') {
            const bet = betFor(p, g, side);
            const item = { ...ref, bet: bet.label, betKey: bet.key, opposite: bet.opposite };
            (tier < 3 ? tier2 : watch).push(item);
          } else if (status === 'played_only') {
            if (!g.played && (roof === 'outdoors' || roof === 'open' || roof === 'unknown')) {
              const note = p.atoms[0] === 'g:g_wind10' ? 'windConditional' : p.atoms[0] === 'g:g_wind15' ? 'wind15Conditional' : 'weatherConditional';
              conditional.push({ ...ref, status: 'forecast_unavailable', note });
            }
          } else if (status === 'pending') { if (!pendingCards.some(x => x.card === ref.card && x.team === ref.team)) pendingCards.push(ref); }
          else if (status === 'conditional:roof') conditional.push({ ...ref, status: 'conditional:roof', note: 'roofConditional' });
          else gatedCards[status.slice(6)].push({ ...ref, ...(g.roof ? {} : p.roofDependent ? { roofUnknown: true } : {}) });
          continue;
        }
        const fam = p.seanFamily;
        if (!ctxFam.has(fam)) ctxFam.set(fam, { items: [], gated: new Set(), played: false, pending: false, conditional: false });
        const bucket = ctxFam.get(fam);
        const item = team ? `${compactRow(p)}@${team}` : compactRow(p);
        if (status === 'fires') bucket.items.push(item);
        else if (status.startsWith('gated:')) { pushGated(status, item); bucket.gated.add(status.slice(6)); }
        else if (status === 'played_only') bucket.played = true;
        else if (status === 'pending') bucket.pending = true;
        else if (status === 'conditional:roof') bucket.conditional = true;
      }
    }
    // Tier 2: dedupe same-side overlapping cards, flag stacking and conflicts, keep up to 3 by score.
    tier2.sort((a, b) => scoreOf(b.card) - scoreOf(a.card) || (a.card < b.card ? -1 : 1));
    const kept = [];
    for (const item of tier2) {
      const p = byId.get(item.card);
      const twin = kept.find(k => {
        if (k.betKey !== item.betKey) return false;
        const kp = byId.get(k.card);
        if (kp.dedupGroup && kp.dedupGroup === p.dedupGroup) return true;
        return jaccard(normalizedBetSet(kp, grade(kp).r), normalizedBetSet(p, grade(p).r)) >= 0.5;
      });
      if (twin) { (twin.alternatives ??= []).push(item.card); continue; }
      const same = kept.find(k => k.betKey === item.betKey);
      if (same) {
        const a = normalizedBetSet(byId.get(same.card), grade(byId.get(same.card)).r), b = normalizedBetSet(p, grade(p).r);
        let overlap = 0;
        for (const x of b) if (a.has(x)) overlap++;
        item.stacked = { with: same.card, overlapGames: overlap, note: COPY.stacked };
      }
      kept.push(item);
    }
    for (const item of kept) item.conflict = kept.some(k => k !== item && k.betKey === item.opposite);
    entry.tier2 = kept.slice(0, 3).map(({ betKey, opposite, ...rest }) => rest);
    entry.watch = watch.sort((a, b) => scoreOf(b.card) - scoreOf(a.card) || (a.card < b.card ? -1 : 1)).map(({ betKey, opposite, ...rest }) => rest);
    entry.conditional = conditional;
    entry.pendingCards = pendingCards;

    // Context (no proven edge): Sean's families in his order; the lead is the first firing preset in registry order.
    const context = [{ family: 'referee', referee: assigned[gameId], status: assigned[gameId] ? 'assigned' : 'not_assigned' }];
    for (const fam of familyOrder) {
      if (fam === 'referee' || fam === 'teams') continue;
      const b = ctxFam.get(fam);
      if (!b) continue;
      const isOu = it => { const m = byId.get(it.split('@')[0]).market; return m === 'total' || m === 'total_rev'; };
      const lead = { ats: b.items.find(it => !isOu(it)) ?? null, ou: b.items.find(isOu) ?? null };
      const more = b.items.filter(it => it !== lead.ats && it !== lead.ou);
      const famEntry = { family: fam, lead, more };
      if (b.gated.size) famEntry.unlocks = [...b.gated].sort();
      if (b.played) famEntry.playedOnly = true;
      if (b.pending) famEntry.pending = true;
      if (b.conditional) famEntry.roofConditional = true;
      if (fam === 'quarterback') famEntry.provisional = true;
      if (b.items.length || famEntry.unlocks || famEntry.playedOnly || famEntry.pending || famEntry.roofConditional) context.push(famEntry);
    }
    entry.context = context;

    // Entities: each team in its venue role, its head coach and its expected starting QB; head to head.
    const teams = {}, coaches = {}, qbs = {};
    for (const side of [1, 0]) {
      const fr = frOf(g, side), app = appOf(g, side);
      const role = g.neutral ? 'neutral' : side === 0 ? 'home' : 'road';
      const where = role === 'home' ? 'at home' : role === 'road' ? 'on the road' : 'at neutral sites';
      const venueAtom = `venue:${role === 'road' ? 'road' : role}`;
      const ouAtom = role === 'home' ? `hosts:${fr}` : role === 'road' ? `visits:${fr}` : `neutralteam:${fr}`;
      teams[app] = {
        role,
        ats: entity(`team_ats|team:${fr}+${venueAtom}`, 'team_ats', [`team:${fr}`, venueAtom], `${app} ${where}: ATS`, 'teams'),
        ou: entity(`total|${ouAtom}`, 'total', [ouAtom], `${app} games ${where}: over/under`, 'teams'),
        su: entity(`su|team:${fr}+${venueAtom}`, 'su', [`team:${fr}`, venueAtom], `${app} ${where}: straight-up`, 'teams'),
      };
      gated.spread.push(`${entity(`team_ats|team:${fr}+role:fav`, 'team_ats', [`team:${fr}`, 'role:fav'], `${app} as the favorite: ATS`, 'teams')}@${app}`);
      gated.spread.push(`${entity(`team_ats|team:${fr}+role:dog`, 'team_ats', [`team:${fr}`, 'role:dog'], `${app} as the underdog: ATS`, 'teams')}@${app}`);
      const coach = g.coach[side];
      if (coach) {
        coaches[app] = { name: coach,
          ats: entity(`team_ats|coach:${coach}`, 'team_ats', [`coach:${coach}`], `Head coach ${coach}: ATS (career)`, 'coach'),
          ou: entity(`total|anycoach:${coach}`, 'total', [`anycoach:${coach}`], `Head coach ${coach}'s games: over/under (career)`, 'coach') };
      }
      const qb = g.qb[side];
      if (qb) {
        const name = qbName(qb);
        qbs[app] = { id: qb, name, provisional: true,
          ats: entity(`team_ats|qb:${qb}`, 'team_ats', [`qb:${qb}`], `QB ${name} starts: ATS (career)`, 'quarterback', { provisional: true }),
          ou: entity(`total|anyqb:${qb}`, 'total', [`anyqb:${qb}`], `QB ${name} starts: over/under (career)`, 'quarterback', { provisional: true }) };
      }
    }
    const h2h = g.meta.lastMeetings.filter(m => daysBetween(m.date, g.date) <= 1461).map(m => {
      const hc = m.spread === null ? null : m.homeScore - m.awayScore - m.spread;
      return { date: m.date, away: m.awayApp, home: m.homeApp, score: `${m.awayApp} ${m.awayScore}, ${m.homeApp} ${m.homeScore}`,
        ats: hc === null ? null : hc > 0 ? m.homeApp : hc < 0 ? m.awayApp : 'push',
        ou: m.tl === null ? null : m.total > m.tl ? 'over' : m.total < m.tl ? 'under' : 'push' };
    }).reverse();
    entry.entities = { teams, coaches, qbs, h2h };
    entry.gated = gated;
    entry.gatedCards = gatedCards;
    entry.notes = notes;
    outGames.push(entry);
  }

  const tierCounts = { tier1: 0, tier2: 0, watch: 0 };
  for (const c of Object.values(cards)) { if (c.watch) tierCounts.watch++; else if (c.tier === 1) tierCounts.tier1++; else if (c.tier === 2) tierCounts.tier2++; }
  return normalizeNumbers({
    schema: WEEK_SCHEMA_VERSION, season, week, asOf,
    pending: pendingTeams,
    source: { url: TRENDS_SOURCE.url, license: TRENDS_SOURCE.license, licenseUrl: TRENDS_SOURCE.licenseUrl, credit: TRENDS_SOURCE.credit,
      modified: TRENDS_SOURCE.modified, caveat: TRENDS_SOURCE.caveat, history: sources.history ?? null, season: sources.season ?? null },
    registry: { version: registry.version, registeredAt: registry.registeredAt, sha256: sources.registrySha256 ?? null },
    lineSource: LINE_SOURCE,
    scoring: { throughSeason, labels: TIER_LABELS, calibration: registry.calibration },
    copy: COPY,
    markets: Object.fromEntries(Object.entries(MARKETS).map(([k, v]) => [k, { label: v.label, sides: k === 'total_rev' ? ['With the rule', 'Against the rule'] : v.sides }])),
    schemaNotes: SCHEMA_NOTES,
    families: registry.families,
    tierCounts,
    refereeOptions, assignedReferees: assigned, referees: refereesOut,
    bandTables, watchBands,
    cards, rows: rowsOut,
    games: outGames,
  });
}

function normalizeNumbers(value) {
  if (typeof value === 'number') return round4(value);
  if (Array.isArray(value)) return value.map(normalizeNumbers);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = normalizeNumbers(v);
    return out;
  }
  return value;
}
