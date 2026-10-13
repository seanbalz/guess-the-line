// Server-only Open-Meteo forecast adapter for the kickoff wind forecast (D-34). The hosted gtl-api
// Edge Function is the only caller; the browser never contacts Open-Meteo. One multi-location GET
// per refresh, no key, no retry. It never throws: it returns rows or one fixed error code, and never
// stores or forwards Open-Meteo's `reason` text, the URL of a failure, or a fetch exception message.
// Schema checked 2026-10-13 against the open-meteo source (JsonWriter.swift, ForecastapiQuery.swift,
// OutputformatTests.swift, the SDK Unit.swift) and the docs source; no live response was captured.
// https://open-meteo.com/en/docs · https://github.com/open-meteo/open-meteo
export const OPEN_METEO_FORECAST = 'https://api.open-meteo.com/v1/forecast';
export const WIND_HOURLY = Object.freeze(['wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'temperature_2m', 'precipitation_probability', 'precipitation']);
export const WIND_MAX_LOCATIONS = 16;
export const WIND_MAX_BODY = 512 * 1024;
const MAX_ERROR_BODY = 4096;
const HOUR = 3_600_000;
export const WIND_ERROR_CODES = Object.freeze(['WIND_TIMEOUT', 'WIND_RATE_LIMIT_DAILY', 'WIND_RATE_LIMIT', 'WIND_HTTP', 'WIND_UNAVAILABLE',
  'WIND_BODY_LIMIT', 'WIND_PAYLOAD', 'WIND_UNITS', 'WIND_LEASE_EXPIRED']);
/** HTTP statuses that may be stored with a failed attempt; any other status is stored as null. */
export const WIND_HTTP_STATUSES = Object.freeze([200, 400, 429, 500, 502, 503, 504]);
// Compared in memory only. It is never stored, logged or returned.
const DAILY_LIMIT_REASON = 'Daily API request limit exceeded. Please try again tomorrow.';
// Units Open-Meteo writes for the GTL query (the SDK writes miles per hour as "mp/h"). Anything else is a unit trap.
const UNITS = Object.freeze({
  wind_speed_10m: ['mp/h', 'mph'], wind_gusts_10m: ['mp/h', 'mph'], wind_direction_10m: ['°'], temperature_2m: ['°F'],
  precipitation_probability: ['%'], precipitation: ['inch'],
});
// Range and decimals of each variable as Open-Meteo writes it (SDK significant digits): mph 1, °F 1, % 0, ° 0, inch 3.
const VALUES = Object.freeze({
  wind_speed_10m: [0, 200, 1], wind_gusts_10m: [0, 250, 1], wind_direction_10m: [0, 360, 0], temperature_2m: [-60, 140, 1],
  precipitation_probability: [0, 100, 0], precipitation: [0, 20, 3],
});
const TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00$/;
const GAME_ID = /^[A-Z]{2,3}-[A-Z]{2,3}$/;
const VENUE_ID = /^[A-Z]{3}[0-9]{2}$/;

class WindProviderError extends Error {
  constructor(code) { super(code); this.name = 'WindProviderError'; this.code = code; }
}
const fail = code => { throw new WindProviderError(code); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);

export const floorHourUTC = ms => Math.floor(ms / HOUR) * HOUR;
/** The nearest model hour; a :30 kickoff rounds to the later hour, which is nearer to play. */
export const roundHalfUpHourUTC = ms => Math.floor((ms + HOUR / 2) / HOUR) * HOUR;
/** "2026-10-16T00:00" in UTC, never local time. */
export const hourText = ms => `${new Date(ms).toISOString().slice(0, 13)}:00`;
/** Parses Open-Meteo's offset-less hour with Date.UTC (Date.parse would read it as local time). */
export function parseHour(text) {
  const m = typeof text === 'string' ? TIME.exec(text) : null;
  if (!m) return NaN;
  const [y, mo, d, h] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d, h);
  return hourText(ms) === text ? ms : NaN;
}
/** Sustained wind, direction and temperature: the nearest hour. Gusts and precipitation: the hour that contains kickoff (Open-Meteo reports the preceding hour). */
export const kickoffHours = kickoff => ({ forecastHour: roundHalfUpHourUTC(kickoff), gustHour: floorHourUTC(kickoff) + HOUR });
const coord = value => value.toFixed(3);
const kickoffMs = value => (typeof value === 'number' ? value : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ? Date.parse(value) : NaN);

/**
 * The single request for a set of due games: locations sorted by kickoff then venue id, a shared
 * venue sent once, at most 16 locations, and one UTC hour window from the earliest kickoff's hour to
 * the hour after the latest kickoff's hour (end_hour is inclusive). The query string is assembled from
 * fixed tokens because URLSearchParams would percent-encode ',' and ':'.
 */
export function windRequest(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > WIND_MAX_LOCATIONS) fail('WIND_PAYLOAD');
  const ids = new Set();
  const games = input.map(game => {
    const kickoff = kickoffMs(game?.kickoff);
    if (!record(game) || typeof game.gameId !== 'string' || !GAME_ID.test(game.gameId) || ids.has(game.gameId)
      || typeof game.venueId !== 'string' || !VENUE_ID.test(game.venueId)
      || !finite(game.latitude) || Math.abs(game.latitude) > 90 || !finite(game.longitude) || Math.abs(game.longitude) > 180
      || !Number.isFinite(kickoff)) fail('WIND_PAYLOAD');
    ids.add(game.gameId);
    return { gameId: game.gameId, venueId: game.venueId, latitude: Number(coord(game.latitude)), longitude: Number(coord(game.longitude)), kickoff };
  }).sort((a, b) => a.kickoff - b.kickoff || (a.venueId < b.venueId ? -1 : a.venueId > b.venueId ? 1 : 0) || (a.gameId < b.gameId ? -1 : 1));
  const locations = [], index = new Map();
  for (const game of games) {
    const key = `${coord(game.latitude)},${coord(game.longitude)}`;
    if (!index.has(key)) { index.set(key, locations.length); locations.push({ venueId: game.venueId, latitude: game.latitude, longitude: game.longitude }); }
    game.location = index.get(key);
  }
  if (locations.length > WIND_MAX_LOCATIONS) fail('WIND_PAYLOAD');
  const start = floorHourUTC(Math.min(...games.map(g => g.kickoff)));
  const end = floorHourUTC(Math.max(...games.map(g => g.kickoff))) + HOUR;
  const url = `${OPEN_METEO_FORECAST}?latitude=${locations.map(l => coord(l.latitude)).join(',')}&longitude=${locations.map(l => coord(l.longitude)).join(',')}`
    + `&hourly=${WIND_HOURLY.join(',')}&wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=GMT`
    + `&start_hour=${hourText(start)}&end_hour=${hourText(end)}`;
  return { url, games, locations, start, end, hours: (end - start) / HOUR + 1 };
}

function checkValue(value, [min, max, decimals]) {
  if (value === null) return true;
  if (!finite(value) || value < min || value > max) return false;
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/**
 * Validates one Open-Meteo response body for a request built by windRequest. Results are matched to
 * locations strictly by index; coordinates must be within 0.5° of the requested point (the model grid
 * cell may be a few km away); units, the UTC offset and the hourly time axis must be exact. Key order
 * is never relied on and unknown keys are ignored. Throws WIND_PAYLOAD or WIND_UNITS.
 */
export function parseForecast(body, request) {
  if (record(body) && body.error === true) fail('WIND_PAYLOAD');
  const results = record(body) && request.locations.length === 1 ? [body] : body;
  if (!Array.isArray(results) || results.length !== request.locations.length) fail('WIND_PAYLOAD');
  return results.map((result, i) => {
    const want = request.locations[i];
    if (!record(result) || result.error === true) fail('WIND_PAYLOAD');
    if (i === 0 ? Object.hasOwn(result, 'location_id') : Object.hasOwn(result, 'location_id') && result.location_id !== i) fail('WIND_PAYLOAD');
    if (!finite(result.latitude) || !finite(result.longitude) || Math.abs(result.latitude - want.latitude) > 0.5 || Math.abs(result.longitude - want.longitude) > 0.5) fail('WIND_PAYLOAD');
    if (result.utc_offset_seconds !== 0 || !finite(result.generationtime_ms) || result.generationtime_ms < 0) fail('WIND_PAYLOAD');
    if (Object.hasOwn(result, 'elevation') && !finite(result.elevation)) fail('WIND_PAYLOAD');
    const units = result.hourly_units, hourly = result.hourly;
    if (!record(units) || !record(hourly) || units.time !== 'iso8601') fail('WIND_PAYLOAD');
    for (const [name, allowed] of Object.entries(UNITS)) if (!allowed.includes(units[name])) fail('WIND_UNITS');
    const time = hourly.time;
    if (!Array.isArray(time) || time.length !== request.hours) fail('WIND_PAYLOAD');
    for (let t = 0; t < time.length; t++) if (parseHour(time[t]) !== request.start + t * HOUR) fail('WIND_PAYLOAD');
    const series = {};
    for (const [name, rule] of Object.entries(VALUES)) {
      const values = hourly[name];
      if (!Array.isArray(values) || values.length !== time.length || !values.every(value => checkValue(value, rule))) fail('WIND_PAYLOAD');
      series[name] = values;
    }
    return { gridLatitude: result.latitude, gridLongitude: result.longitude, elevationM: Object.hasOwn(result, 'elevation') ? result.elevation : null,
      generationMs: result.generationtime_ms, series };
  });
}

/**
 * Kickoff-hour rows for every requested game. A game whose sustained wind is null at its kickoff
 * row stores nothing (it is reported in `skipped`); a null gust, temperature or chance stays null.
 */
export function selectKickoffRows(parsed, request) {
  const rows = [], skipped = [];
  for (const game of request.games) {
    const at = parsed[game.location], { forecastHour, gustHour } = kickoffHours(game.kickoff);
    const w = (forecastHour - request.start) / HOUR, g = (gustHour - request.start) / HOUR;
    const pick = (name, i) => at.series[name][i] ?? null;
    const windMph = pick('wind_speed_10m', w);
    if (windMph === null) { skipped.push(game.gameId); continue; }
    rows.push({
      gameId: game.gameId, venueId: game.venueId, latitude: game.latitude, longitude: game.longitude,
      gridLatitude: at.gridLatitude, gridLongitude: at.gridLongitude, elevationM: at.elevationM,
      kickoff: new Date(game.kickoff).toISOString(), forecastHour: new Date(forecastHour).toISOString(), gustHour: new Date(gustHour).toISOString(),
      windMph, gustMph: pick('wind_gusts_10m', g), directionDeg: pick('wind_direction_10m', w), temperatureF: pick('temperature_2m', w),
      precipitationProbability: pick('precipitation_probability', g), precipitationIn: pick('precipitation', g), generationMs: at.generationMs,
    });
  }
  return { rows, skipped };
}

/** odds-provider's bounded reader: content-length precheck, a streamed byte cap, JSON content type and a fatal UTF-8 decoder. */
async function boundedJson(response, maxBytes) {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes)) {
    await response.body?.cancel().catch(() => {}); fail('WIND_BODY_LIMIT');
  }
  if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    await response.body?.cancel().catch(() => {}); fail('WIND_PAYLOAD');
  }
  const reader = response.body?.getReader();
  if (!reader) fail('WIND_PAYLOAD');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel().catch(() => {}); fail('WIND_BODY_LIMIT'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return fail('WIND_PAYLOAD'); }
}

/**
 * forecast(games) → { ok: true, httpStatus: 200, url, rows, skipped } or { ok: false, errorCode, httpStatus, url }.
 * Its own fetch with Accept only: Supabase service headers never reach Open-Meteo.
 */
export function createOpenMeteoProvider({ fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 10000) throw new Error('Invalid wind provider configuration.');
  return {
    async forecast(games) {
      let request;
      try { request = windRequest(games); } catch { return { ok: false, errorCode: 'WIND_PAYLOAD', httpStatus: null, url: null }; }
      const controller = new AbortController(); let timer, status = null;
      try {
        return await Promise.race([
          (async () => {
            const response = await fetchImpl(request.url, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal });
            status = WIND_HTTP_STATUSES.includes(response.status) ? response.status : null;
            if (response.status !== 200) {
              let reason = null;
              if (response.status === 429) {
                try { const body = await boundedJson(response, MAX_ERROR_BODY); reason = record(body) ? body.reason : null; } catch { /* Only the fixed code below escapes. */ }
              } else await response.body?.cancel().catch(() => {});
              fail(response.status === 429 ? (reason === DAILY_LIMIT_REASON ? 'WIND_RATE_LIMIT_DAILY' : 'WIND_RATE_LIMIT')
                : response.status >= 400 && response.status < 500 ? 'WIND_HTTP' : 'WIND_UNAVAILABLE');
            }
            const parsed = parseForecast(await boundedJson(response, WIND_MAX_BODY), request);
            const { rows, skipped } = selectKickoffRows(parsed, request);
            return { ok: true, httpStatus: 200, url: request.url, rows, skipped };
          })(),
          new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new WindProviderError('WIND_TIMEOUT')); }, timeoutMs); }),
        ]);
      } catch (error) {
        // Never forward fetch exception messages, response bodies or causes; a redirect is a network error.
        const errorCode = error instanceof WindProviderError ? error.code : 'WIND_UNAVAILABLE';
        return { ok: false, errorCode, httpStatus: errorCode === 'WIND_TIMEOUT' ? null : status, url: request.url };
      } finally { clearTimeout(timer); }
    },
  };
}
