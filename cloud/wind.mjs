// Kickoff wind forecast for the wind trend card (D-34, Sean's October 13, 2026 ruling: "go ahead
// with the wind forecast too"). Any signed-in community member reads a week's stored Open-Meteo
// snapshots; on a read the server refreshes the games that are due through a read-through cache with
// single flight, spacing, backoff and a daily cap enforced in SQL. Reference only: nothing here reads
// or writes ballots, picks, scores, deadlines, kickoff locks, sit-outs or the D-23 reveal.
// Separate from cloud/community.mjs and cloud/officials.mjs so their routes and tests stay untouched.
import { UUID_PATTERN } from './lobby.mjs';
import { venueFor, windVenue } from '../shared/wind-venues.mjs';
import { WIND_ERROR_CODES, WIND_MAX_LOCATIONS } from './open-meteo.mjs';

export class WindError extends Error {
  constructor(status, message) { super(message); this.name = 'WindError'; this.status = status; }
}
export const WIND_METHODS = Object.freeze({ '/wind/read': ['POST'] });
/** Refresh tiers by lead (kickoff minus the database clock). SQL enforces the same numbers; trends-view.mjs mirrors them. */
export const WIND_TIERS = Object.freeze([
  Object.freeze({ maxLeadH: 18, ttlMin: 60 }), Object.freeze({ maxLeadH: 72, ttlMin: 180 }), Object.freeze({ maxLeadH: 120, ttlMin: 360 }),
]);
export const WIND_HORIZON_H = 120;
/** Open-Meteo calls (locations) per UTC day across all attempts, failures included: 2% of the free 10,000. */
export const WIND_DAILY_CAP = 200;
/** One source of truth for the CC BY credit; the SQL license_note and trends-view.mjs are kept equal to it by tests. */
export const WIND_ATTRIBUTION = Object.freeze({
  text: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/', license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', changes: 'Kickoff-hour values selected by GTL; wind direction shown as compass points',
});
export const WIND_LICENSE_NOTE = `${WIND_ATTRIBUTION.text}, ${WIND_ATTRIBUTION.license} (${WIND_ATTRIBUTION.licenseUrl}); ${WIND_ATTRIBUTION.changes}`;
export const WIND_SOURCE = 'Open-Meteo forecast API';
export const WIND_SOURCE_PREFIX = 'https://api.open-meteo.com/v1/forecast?';
export const WIND_MODEL = 'best_match';
const REFUSALS = new Set(['busy', 'cooldown', 'backoff', 'not_due', 'budget']);
const ERRORS = {
  GTL_WIND_INVALID: [400, 'Check the season and week, then try again.'],
  GTL_COMMUNITY_MEMBER: [403, 'Open My games and save your display name to join the community.'],
};
/** Coded refusals become WindError; GTL_WIND_LEASE and anything else stay internal (the refresh path swallows them; a read turns them into the generic 503). */
export const providerWindError = message => {
  if (ERRORS[message]) return new WindError(...ERRORS[message]);
  const error = new Error('Wind forecasts are unavailable.');
  if (message === 'GTL_WIND_LEASE') error.code = message;
  return error;
};
const invalid = () => { throw providerWindError('GTL_WIND_INVALID'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const HOUR = 3_600_000;
const GAME_ID = /^[A-Z]{2,3}-[A-Z]{2,3}$/;
const iso = value => { const ms = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(ms) ? new Date(ms).toISOString() : null; };

/** TTL in minutes for a lead in ms: 1 h within 18 h, 3 h within 72 h, 6 h within 120 h; null at or after kickoff or beyond 120 h. */
export function windTtlMinutes(leadMs) {
  if (!finite(leadMs) || leadMs <= 0) return null;
  return WIND_TIERS.find(tier => leadMs <= tier.maxLeadH * HOUR)?.ttlMin ?? null;
}

/** The read RPC's answer, checked: { now, published, games: [{ id, kickoff }], latest: { [gameId]: row } }. */
export function parseWindRead(raw) {
  if (!record(raw) || typeof raw.published !== 'boolean' || !Number.isFinite(Date.parse(raw.now)) || !Array.isArray(raw.games) || !record(raw.latest)) throw new Error('Invalid wind forecasts.');
  const games = [];
  for (const game of raw.games) {
    if (!record(game) || typeof game.id !== 'string' || !GAME_ID.test(game.id)) continue;
    const kickoff = typeof game.kickoff === 'number' ? game.kickoff * 1000 : NaN;
    if (!Number.isFinite(kickoff)) continue;
    games.push({ id: game.id, kickoff: Math.round(kickoff) });
  }
  return { now: Date.parse(raw.now), published: raw.published, games, latest: raw.latest };
}

/**
 * Pure planner: the games to fetch now, from the read's slate, its newest snapshots and the database
 * clock. Each game maps to a venue from the server mirror (never from the client); domes, canopies and
 * unknown venues, kicked-off games and games more than 120 h out are skipped; a game is due when it
 * has no snapshot for this kickoff or its newest snapshot is at least the TTL for the current lead old.
 * Sorted by kickoff then venue; trimmed to 16 locations, nearest kickoff first.
 */
export function planWindRefresh({ season, week, games, latest, now }) {
  const due = [];
  for (const game of games) {
    const venue = venueFor(season, week, game.id);
    if (!windVenue(venue)) continue;
    const ttl = windTtlMinutes(game.kickoff - now);
    if (ttl === null) continue;
    const snapshot = latest?.[game.id];
    const fetched = record(snapshot) ? Date.parse(snapshot.fetchedAt) : NaN;
    if (Number.isFinite(fetched) && now - fetched < ttl * 60_000) continue;
    due.push({ gameId: game.id, venueId: venue.id, latitude: venue.lat, longitude: venue.lon, kickoff: new Date(game.kickoff).toISOString() });
  }
  due.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || (a.venueId < b.venueId ? -1 : a.venueId > b.venueId ? 1 : 0) || (a.gameId < b.gameId ? -1 : 1));
  const keep = [], places = new Set();
  for (const game of due) {
    const place = `${game.latitude.toFixed(3)},${game.longitude.toFixed(3)}`;
    if (!places.has(place) && places.size >= WIND_MAX_LOCATIONS) continue;
    places.add(place); keep.push(game);
  }
  return keep;
}

const number = (value, min, max, { nullable = true } = {}) => (value === null || value === undefined ? (nullable ? null : undefined)
  : finite(value) && value >= min && value <= max ? value : undefined);
/** One stored snapshot for the browser, or null when any field is out of shape. */
function snapshotView(row, kickoff) {
  if (!record(row)) return null;
  const fields = {
    windMph: number(row.windMph, 0, 200, { nullable: false }), gustMph: number(row.gustMph, 0, 250), directionDeg: number(row.directionDeg, 0, 360),
    temperatureF: number(row.temperatureF, -60, 140), precipitationProbability: number(row.precipitationProbability, 0, 100), precipitationIn: number(row.precipitationIn, 0, 20),
    gridLatitude: number(row.gridLatitude, -90, 90, { nullable: false }), gridLongitude: number(row.gridLongitude, -180, 180, { nullable: false }),
    elevationM: number(row.elevationM, -1000, 10000),
  };
  if (Object.values(fields).some(value => value === undefined)) return null;
  const forecastHour = iso(row.forecastHour), gustHour = iso(row.gustHour), fetchedAt = iso(row.fetchedAt), at = iso(row.kickoff);
  if (!forecastHour || !gustHour || !fetchedAt || at !== new Date(kickoff).toISOString() || Date.parse(fetchedAt) >= kickoff) return null;
  if (row.model !== WIND_MODEL || row.source !== WIND_SOURCE || typeof row.sourceUrl !== 'string' || !row.sourceUrl.startsWith(WIND_SOURCE_PREFIX) || row.sourceUrl.length > 2048) return null;
  return { ...fields, forecastHour, gustHour, fetchedAt, model: WIND_MODEL, source: WIND_SOURCE, sourceUrl: row.sourceUrl };
}

/** The response: strict like officials normalizeRead. No user ids, leases or attempt rows ever leave the server. */
export function normalizeWindRead(read, season, week, outcome) {
  const games = {};
  for (const game of [...read.games].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const venue = venueFor(season, week, game.id);
    const wind = windVenue(venue) ? snapshotView(read.latest[game.id], game.kickoff) : null;
    const status = !venue ? 'unknown_venue' : !windVenue(venue) ? 'indoor' : wind ? 'forecast' : game.kickoff - read.now > WIND_HORIZON_H * HOUR ? 'not_yet' : 'none';
    games[game.id] = {
      kickoff: new Date(game.kickoff).toISOString(),
      venue: venue ? { id: venue.id, name: venue.name, city: venue.city, country: venue.country, type: venue.type } : null,
      status, wind,
    };
  }
  return { season, week, asOf: new Date(read.now).toISOString(), published: read.published, refresh: { outcome }, attribution: { ...WIND_ATTRIBUTION }, games };
}

const rpcRow = (row, url) => ({
  gameId: row.gameId, venueId: row.venueId, latitude: row.latitude, longitude: row.longitude, gridLatitude: row.gridLatitude, gridLongitude: row.gridLongitude,
  elevationM: row.elevationM, kickoff: row.kickoff, forecastHour: row.forecastHour, gustHour: row.gustHour, windMph: row.windMph, gustMph: row.gustMph,
  directionDeg: row.directionDeg, temperatureF: row.temperatureF, precipitationProbability: row.precipitationProbability, precipitationIn: row.precipitationIn,
  generationMs: row.generationMs, sourceUrl: url,
});

/** Begin, fetch once, finish. Returns the refresh outcome; never throws past the caller's catch. */
async function refresh({ service, user, season, week, due, uuid }) {
  const requestId = uuid();
  const begun = await service.rpc('gtl_begin_wind_fetch', { p_user: user.id, p_request: requestId, p_season: season, p_week: week, p_games: due });
  if (!record(begun) || begun.started !== true) return REFUSALS.has(begun?.reason) ? begun.reason : 'unavailable';
  if (begun.requestId !== requestId || !UUID_PATTERN.test(begun.lease || '') || !Array.isArray(begun.games) || !begun.games.length) throw new Error('Invalid wind fetch lease.');
  const planned = new Map(due.map(game => [game.gameId, game]));
  if (!begun.games.every(game => record(game) && planned.has(game.gameId))) throw new Error('Invalid wind fetch lease.');
  let result;
  try { result = await service.provider.forecast(begun.games); } catch { result = { ok: false, errorCode: 'WIND_UNAVAILABLE', httpStatus: null }; }
  const finish = result?.ok === true
    ? { p_status: 'succeeded', p_error: null, p_http: 200, p_rows: result.rows.map(row => rpcRow(row, result.url)) }
    : { p_status: 'failed', p_error: WIND_ERROR_CODES.includes(result?.errorCode) && result.errorCode !== 'WIND_LEASE_EXPIRED' ? result.errorCode : 'WIND_UNAVAILABLE', p_http: Number.isInteger(result?.httpStatus) ? result.httpStatus : null, p_rows: null };
  await service.rpc('gtl_finish_wind_fetch', { p_request: requestId, p_lease: begun.lease, ...finish });
  return result?.ok === true ? 'fetched' : 'failed';
}

/**
 * POST /wind/read { season, week } → { season, week, asOf, published, refresh: { outcome }, attribution,
 *   games: { [gameId]: { kickoff, venue, status, wind } } }
 * Any week returns its stored snapshots; due games of any published week within 120 h of kickoff are
 * refreshed first (Monday night's game is still refreshed after the next week publishes on Monday).
 * A refresh failure never turns the read into an error.
 */
export async function handleWind({ route, body = {}, user, service, uuid = () => crypto.randomUUID() }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new WindError(401, 'Sign in to continue.');
  if (!service?.rpc) throw new Error('Wind forecasts are not configured.');
  if (!Object.hasOwn(WIND_METHODS, route)) invalid();
  if (!record(body) || Object.keys(body).some(key => !['season', 'week'].includes(key))) invalid();
  if (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200 || !Number.isInteger(body.week) || body.week < 1 || body.week > 25) invalid();
  const { season, week } = body;
  const readRpc = () => service.rpc('gtl_read_wind_forecasts', { p_user: user.id, p_season: season, p_week: week });
  let read = parseWindRead(await readRpc()), outcome = 'none';
  if (!read.published) outcome = 'not_published';
  else {
    const due = planWindRefresh({ season, week, games: read.games, latest: read.latest, now: read.now });
    if (!due.length) outcome = 'not_due';
    else if (typeof service.provider?.forecast !== 'function') outcome = 'unavailable';
    else {
      try { outcome = await refresh({ service, user, season, week, due, uuid }); } catch { outcome = 'unavailable'; }
      if (outcome === 'fetched' || outcome === 'failed') {
        try { read = parseWindRead(await readRpc()); } catch { /* Keep the first read: the member still sees what was stored. */ }
      }
    }
  }
  return normalizeWindRead(read, season, week, outcome);
}
