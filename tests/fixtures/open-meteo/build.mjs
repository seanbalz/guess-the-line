// Schema-exact Open-Meteo forecast responses for tests (D-34). This container cannot reach
// api.open-meteo.com, so every test response is built here to the documented schema: the key order
// and number formatting of the server's JsonWriter (Sources/App/Helper/Writer/JsonWriter.swift) and
// the SDK's significant digits (mp/h 1, °F 1, ° 0, % 0, inch 3, elevation 1). JSON.stringify cannot
// print 195.0 or 0.000, hence the hand-written serializer. location_id is written only for index > 0.
// tests/open-meteo.test.mjs checks that this builder reproduces the two recorded fixtures byte for byte.
const HOUR = 3_600_000;
export const UNITS = Object.freeze({
  time: 'iso8601', wind_speed_10m: 'mp/h', wind_gusts_10m: 'mp/h', wind_direction_10m: '°', temperature_2m: '°F',
  precipitation_probability: '%', precipitation: 'inch',
});
export const DECIMALS = Object.freeze({ wind_speed_10m: 1, wind_gusts_10m: 1, wind_direction_10m: 0, temperature_2m: 1, precipitation_probability: 0, precipitation: 3 });
export const VARIABLES = Object.keys(DECIMALS);
const fixed = (value, decimals) => (value === null || value === undefined ? 'null' : Number(value).toFixed(decimals));
const hourText = ms => `${new Date(ms).toISOString().slice(0, 13)}:00`;

/** Default hourly values: steady 8.0 mph from the SW, gusts 15.0, 55.0 °F, 10%, no rain. */
export const calm = () => ({ wind_speed_10m: 8, wind_gusts_10m: 15, wind_direction_10m: 225, temperature_2m: 55, precipitation_probability: 10, precipitation: 0 });

/**
 * One location's JSON object text.
 * location: { latitude, longitude, elevation = 100, generationMs = 0.5, values: (hourIndex, isoHour) => partial values | array of partials,
 *             units: overrides for hourly_units, utcOffset = 0, extra: raw text appended after the hourly object }
 */
export function locationText(location, { start, hours, index = 0 }) {
  const { latitude, longitude, elevation = 100, generationMs = 0.5, values = calm, units = {}, utcOffset = 0, timezone = 'GMT' } = location;
  const time = Array.from({ length: hours }, (_, i) => hourText(start + i * HOUR));
  const rows = time.map((iso, i) => ({ ...calm(), ...(typeof values === 'function' ? values(i, iso) : values[i] || {}) }));
  const unitText = Object.entries({ ...UNITS, ...units }).filter(([, value]) => value !== undefined).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(',');
  const series = VARIABLES.map(name => `${JSON.stringify(name)}:[${rows.map(row => fixed(row[name], DECIMALS[name])).join(',')}]`).join(',');
  return `{"latitude":${latitude},"longitude":${longitude},"generationtime_ms":${generationMs},"utc_offset_seconds":${utcOffset},"timezone":${JSON.stringify(timezone)},"timezone_abbreviation":${JSON.stringify(timezone)}`
    + (elevation === null ? '' : `,"elevation":${fixed(elevation, 1)}`) + (index > 0 ? `,"location_id":${index}` : '')
    + `,"hourly_units":{${unitText}},"hourly":{"time":[${time.map(t => JSON.stringify(t)).join(',')}],${series}}}`;
}

/** The whole body: a bare object for one location, an array for several. */
export function buildForecast({ locations, start, hours }) {
  const parts = locations.map((location, index) => locationText(location, { start, hours, index }));
  return parts.length === 1 ? parts[0] : `[${parts.join(',')}]`;
}

/** Reads a request URL built by cloud/open-meteo.mjs: the points and the hour window. */
export function readRequest(url) {
  const query = new URL(url).searchParams;
  const lat = query.get('latitude').split(',').map(Number), lon = query.get('longitude').split(',').map(Number);
  const parse = text => Date.parse(`${text}:00Z`);
  const start = parse(query.get('start_hour')), end = parse(query.get('end_hour'));
  return { points: lat.map((latitude, i) => ({ latitude, longitude: lon[i] })), start, end, hours: (end - start) / HOUR + 1 };
}

/** A fetch stand-in that answers from the builder and records every call. pick(point, i) returns location overrides. */
export function forecastFetch(pick = () => ({}), { status = 200, contentType = 'application/json; charset=utf-8' } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const { points, start, hours } = readRequest(String(url));
    const body = buildForecast({ start, hours, locations: points.map((point, i) => ({ latitude: point.latitude + 0.004, longitude: point.longitude - 0.004, ...pick(point, i) })) });
    return new Response(body, { status, headers: { 'content-type': contentType } });
  };
  return { fetchImpl, calls };
}

/** The two recorded fixtures' inputs, so the builder can be checked against them byte for byte. */
export const RECORDED = Object.freeze({
  start: Date.UTC(2026, 9, 19, 17), hours: 4,
  highmark: { latitude: 42.76917, longitude: -78.78497, elevation: 195, generationMs: 0.6489753723144531,
    values: [
      { wind_speed_10m: 14.2, wind_gusts_10m: 27.5, wind_direction_10m: 247, temperature_2m: 48.6, precipitation_probability: 20, precipitation: 0 },
      { wind_speed_10m: 15.1, wind_gusts_10m: 29.1, wind_direction_10m: 251, temperature_2m: 49.3, precipitation_probability: 25, precipitation: 0.004 },
      { wind_speed_10m: 15.8, wind_gusts_10m: 30.4, wind_direction_10m: 254, temperature_2m: 49.8, precipitation_probability: 25, precipitation: 0 },
      { wind_speed_10m: 14.9, wind_gusts_10m: 28.9, wind_direction_10m: 256, temperature_2m: 49.1, precipitation_probability: 15, precipitation: 0 },
    ] },
  gillette: { latitude: 42.0857, longitude: -71.26276, elevation: 88, generationMs: 0.3420114517211914,
    values: [
      { wind_speed_10m: 8.3, wind_gusts_10m: 17.9, wind_direction_10m: 231, temperature_2m: 55.2, precipitation_probability: 5, precipitation: 0 },
      { wind_speed_10m: 8.9, wind_gusts_10m: 19.2, wind_direction_10m: 236, temperature_2m: 56.1, precipitation_probability: 5, precipitation: 0 },
      { wind_speed_10m: 9.4, wind_gusts_10m: 20.1, wind_direction_10m: 240, temperature_2m: 56.4, precipitation_probability: 10, precipitation: 0 },
      { wind_speed_10m: 8.7, wind_gusts_10m: 18.6, wind_direction_10m: 242, temperature_2m: 55.8, precipitation_probability: 10, precipitation: 0 },
    ] },
  singleGeneration: 0.5509853363037109,
});
