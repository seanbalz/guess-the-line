// Open-Meteo adapter for the kickoff wind forecast (D-34). Offline: every response is a recorded
// fixture or the schema-exact builder; nothing here contacts api.open-meteo.com.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  OPEN_METEO_FORECAST, createOpenMeteoProvider, kickoffHours, parseForecast, parseHour, selectKickoffRows, windRequest,
} from '../cloud/open-meteo.mjs';
import { easternToUtc } from '../shared/nfl-schedule.mjs';
import { venueFor } from '../shared/wind-venues.mjs';
import { RECORDED, UNITS, buildForecast, forecastFetch } from './fixtures/open-meteo/build.mjs';

const fixture = name => fs.readFileSync(new URL(`./fixtures/open-meteo/${name}`, import.meta.url), 'utf8');
const HOUR = 3_600_000;
const at = (gameId, venueId, kickoff) => { const v = venueFor(2026, 6, gameId); return { gameId, venueId: venueId ?? v.id, latitude: v?.lat, longitude: v?.lon, kickoff }; };
const point = (gameId, venueId, latitude, longitude, kickoff) => ({ gameId, venueId, latitude, longitude, kickoff });
const BUF = [42.774, -78.787], NE = [42.091, -71.264];
const codeOf = fn => { try { fn(); return 'ok'; } catch (error) { return error.code ?? error.message; } };
const json = (body, status = 200, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

// The recorded multi-location fixture: Highmark (17:00–20:00 UTC Oct 19) then Gillette, as one request.
const recordedRequest = (games = [point('NYJ-BUF', 'BUF00', ...BUF, '2026-10-19T17:00:00.000Z'), point('NYG-NE', 'BOS00', ...NE, '2026-10-19T19:00:00.000Z')]) => windRequest(games);

test('the builder reproduces both recorded fixtures byte for byte', () => {
  const multi = buildForecast({ start: RECORDED.start, hours: RECORDED.hours, locations: [RECORDED.highmark, RECORDED.gillette] });
  assert.equal(`${multi}\n`, fixture('forecast-multi-2loc.json'));
  const single = buildForecast({ start: RECORDED.start, hours: RECORDED.hours, locations: [{ ...RECORDED.highmark, generationMs: RECORDED.singleGeneration,
    values: RECORDED.highmark.values.map((v, i) => (i >= 2 ? { ...v, precipitation_probability: null } : v)) }] });
  assert.equal(`${single}\n`, fixture('forecast-single.json'));
});

test('recorded multi-location fixture: index matching, location_id at index 1, grid cells within 0.5°, kickoff and gust rows', () => {
  const request = recordedRequest([
    point('NYJ-BUF', 'BUF00', ...BUF, '2026-10-19T17:00:00.000Z'), point('MIA-BUF', 'BUF00', ...BUF, '2026-10-19T18:25:00.000Z'),
    point('KC-BUF', 'BUF00', ...BUF, '2026-10-19T18:30:00.000Z'), point('NYG-NE', 'BOS00', ...NE, '2026-10-19T19:00:00.000Z'),
  ]);
  assert.equal(request.locations.length, 2, 'Highmark is sent once for three games');
  assert.equal(request.hours, 4);
  const parsed = parseForecast(JSON.parse(fixture('forecast-multi-2loc.json')), request);
  assert.deepEqual(parsed.map(p => [p.gridLatitude, p.gridLongitude, p.elevationM]), [[42.76917, -78.78497, 195], [42.0857, -71.26276, 88]]);
  const { rows, skipped } = selectKickoffRows(parsed, request);
  assert.deepEqual(skipped, []);
  const row = id => rows.find(r => r.gameId === id);
  assert.deepEqual([row('NYJ-BUF').windMph, row('NYJ-BUF').gustMph, row('NYJ-BUF').forecastHour, row('NYJ-BUF').gustHour], [14.2, 29.1, '2026-10-19T17:00:00.000Z', '2026-10-19T18:00:00.000Z']);
  assert.deepEqual([row('NYJ-BUF').directionDeg, row('NYJ-BUF').temperatureF, row('NYJ-BUF').precipitationProbability, row('NYJ-BUF').precipitationIn], [247, 48.6, 25, 0.004]);
  assert.equal(row('MIA-BUF').windMph, 15.1, '18:25 kickoff: the 18:00 row (15+ band)');
  assert.equal(row('MIA-BUF').gustMph, 30.4, 'gusts from the hour that contains kickoff (the 19:00 row)');
  assert.equal(row('KC-BUF').windMph, 15.8, 'a :30 kickoff rounds to the later hour');
  assert.equal(row('KC-BUF').forecastHour, '2026-10-19T19:00:00.000Z');
  assert.deepEqual([row('NYG-NE').windMph, row('NYG-NE').gustMph, row('NYG-NE').gridLatitude], [9.4, 18.6, 42.0857]);
  assert.deepEqual([row('NYG-NE').latitude, row('NYG-NE').longitude], NE, 'rows carry the requested venue point');
});

test('single fixture: a bare object is accepted for one location and a null chance stays null', () => {
  const request = windRequest([point('NYJ-BUF', 'BUF00', ...BUF, '2026-10-19T18:30:00.000Z'), point('MIA-BUF', 'BUF00', ...BUF, '2026-10-19T17:00:00.000Z'),
    point('KC-BUF', 'BUF00', ...BUF, '2026-10-19T19:00:00.000Z')]);
  assert.deepEqual([request.locations.length, request.hours], [1, 4]);
  const parsed = parseForecast(JSON.parse(fixture('forecast-single.json')), request);
  const { rows } = selectKickoffRows(parsed, request);
  const late = rows.find(r => r.gameId === 'NYJ-BUF');
  assert.equal(late.windMph, 15.8);
  assert.equal(late.precipitationProbability, null, 'the 19:00 chance is null in the source');
  assert.equal(rows.find(r => r.gameId === 'MIA-BUF').precipitationProbability, 25);
  // A one-item array is the same answer.
  assert.equal(parseForecast([JSON.parse(fixture('forecast-single.json'))], request).length, 1);
});

test('shape rejections are WIND_PAYLOAD', async t => {
  const request = recordedRequest(), body = () => JSON.parse(fixture('forecast-multi-2loc.json'));
  const cases = {
    'a bare object for two locations': () => body()[0],
    'a one-item array for two locations': () => [body()[0]],
    'location_id mismatch': () => { const b = body(); b[1].location_id = 5; return b; },
    'location_id at index 0': () => { const b = body(); b[0].location_id = 0; return b; },
    'swapped order (coordinates mismatch)': () => body().reverse(),
    'utc_offset_seconds 3600': () => { const b = body(); b[0].utc_offset_seconds = 3600; return b; },
    'a time gap': () => { const b = body(); b[0].hourly.time[2] = '2026-10-19T20:00'; return b; },
    'a wrong start': () => { const b = body(); b[1].hourly.time = ['2026-10-19T16:00', '2026-10-19T17:00', '2026-10-19T18:00', '2026-10-19T19:00']; return b; },
    'a wrong length': () => { const b = body(); for (const k of Object.keys(b[0].hourly)) b[0].hourly[k].pop(); return b; },
    'a Z-suffixed time': () => { const b = body(); b[0].hourly.time[0] = '2026-10-19T17:00Z'; return b; },
    'arrays of unequal length': () => { const b = body(); b[1].hourly.wind_gusts_10m.pop(); return b; },
    'wind out of range': () => { const b = body(); b[0].hourly.wind_speed_10m[1] = 250; return b; },
    'a negative chance': () => { const b = body(); b[0].hourly.precipitation_probability[1] = -1; return b; },
    'a string value': () => { const b = body(); b[0].hourly.temperature_2m[0] = '48.6'; return b; },
    'more decimals than the source writes': () => { const b = body(); b[0].hourly.wind_speed_10m[0] = 14.25; return b; },
    'error:true with a 200': () => JSON.parse(fixture('error-400.json')),
    'a non-finite grid cell': () => { const b = body(); b[0].latitude = null; return b; },
    'a grid cell 0.6° away': () => { const b = body(); b[1].longitude += 0.6; return b; },
    'no hourly block': () => { const b = body(); delete b[0].hourly; return b; },
    'time units changed': () => { const b = body(); b[0].hourly_units.time = 'unixtime'; return b; },
  };
  for (const [name, make] of Object.entries(cases)) await t.test(name, () => assert.equal(codeOf(() => parseForecast(make(), request)), 'WIND_PAYLOAD'));
  await t.test('unknown extra keys and key order are ignored', () => {
    const b = body(); b[0].current_units = {}; b[1] = Object.fromEntries(Object.entries(b[1]).reverse());
    assert.equal(parseForecast(b, request).length, 2);
  });
});

test('unit traps are WIND_UNITS; "mph" is accepted as well as "mp/h"', async t => {
  const request = recordedRequest();
  const withUnits = units => JSON.parse(buildForecast({ start: RECORDED.start, hours: 4, locations: [{ ...RECORDED.highmark, units }, { ...RECORDED.gillette }] }));
  for (const [name, units] of Object.entries({ 'km/h wind': { wind_speed_10m: 'km/h' }, 'km/h gusts': { wind_gusts_10m: 'km/h' }, '°C': { temperature_2m: '°C' },
    'mm precipitation': { precipitation: 'mm' }, 'a missing unit key': { wind_direction_10m: undefined } })) {
    await t.test(name, () => assert.equal(codeOf(() => parseForecast(withUnits(units), request)), 'WIND_UNITS'));
  }
  await t.test('mph', () => assert.equal(parseForecast(withUnits({ wind_speed_10m: 'mph', wind_gusts_10m: 'mph' }), request).length, 2));
  assert.equal(UNITS.wind_speed_10m, 'mp/h', 'the builder writes what the SDK writes');
});

test('error responses map to fixed codes and never carry Open-Meteo\'s reason', async t => {
  const games = [at('SEA-DEN', null, '2026-10-16T00:15:00.000Z')];
  const run = response => createOpenMeteoProvider({ fetchImpl: async () => response }).forecast(games);
  await t.test('400 → WIND_HTTP', async () => {
    const result = await run(json(fixture('error-400.json'), 400));
    assert.deepEqual([result.ok, result.errorCode, result.httpStatus], [false, 'WIND_HTTP', 400]);
    assert.doesNotMatch(JSON.stringify(result), /Forecast days/);
  });
  await t.test('429 daily → WIND_RATE_LIMIT_DAILY', async () => {
    const result = await run(json(fixture('error-429-daily.json'), 429));
    assert.deepEqual([result.errorCode, result.httpStatus], ['WIND_RATE_LIMIT_DAILY', 429]);
    assert.doesNotMatch(JSON.stringify(result), /Daily API request limit/);
  });
  await t.test('429 hourly → WIND_RATE_LIMIT', async () => {
    const result = await run(json({ error: true, reason: 'Hourly API request limit exceeded. Please try again in the next hour.' }, 429));
    assert.equal(result.errorCode, 'WIND_RATE_LIMIT');
  });
  await t.test('429 with a huge or non-JSON body → WIND_RATE_LIMIT', async () => {
    assert.equal((await run(new Response('x'.repeat(10_000), { status: 429, headers: { 'content-type': 'application/json' } }))).errorCode, 'WIND_RATE_LIMIT');
  });
  await t.test('503 → WIND_UNAVAILABLE', async () => {
    const result = await run(json({ error: true, reason: 'The service is overloaded' }, 503));
    assert.deepEqual([result.errorCode, result.httpStatus], ['WIND_UNAVAILABLE', 503]);
    assert.doesNotMatch(JSON.stringify(result), /overloaded/);
  });
  await t.test('a status outside the allowlist is stored as null', async () => {
    const result = await run(json({}, 418));
    assert.deepEqual([result.errorCode, result.httpStatus], ['WIND_HTTP', null]);
  });
  await t.test('a 200 with error:true → WIND_PAYLOAD', async () => {
    assert.equal((await run(json(fixture('error-400.json')))).errorCode, 'WIND_PAYLOAD');
  });
});

test('transport: timeout, network errors, redirects, size caps, content type and broken bodies', async t => {
  const games = [at('SEA-DEN', null, '2026-10-16T00:15:00.000Z')];
  const good = () => buildForecast({ start: Date.UTC(2026, 9, 16, 0), hours: 2, locations: [{ latitude: 39.75, longitude: -105.02 }] });
  await t.test('a fetch that honours abort times out as WIND_TIMEOUT', async () => {
    const started = Date.now();
    const result = await createOpenMeteoProvider({ timeoutMs: 50, fetchImpl: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) }).forecast(games);
    assert.deepEqual([result.errorCode, result.httpStatus], ['WIND_TIMEOUT', null]);
    assert.ok(Date.now() - started < 2000);
  });
  await t.test('a TypeError is WIND_UNAVAILABLE with no message', async () => {
    const result = await createOpenMeteoProvider({ fetchImpl: async () => { throw new TypeError('getaddrinfo ENOTFOUND api.open-meteo.com secret-detail'); } }).forecast(games);
    assert.equal(result.errorCode, 'WIND_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(result), /ENOTFOUND|secret-detail/);
  });
  await t.test('a redirect rejection is WIND_UNAVAILABLE', async () => {
    const result = await createOpenMeteoProvider({ fetchImpl: async (url, init) => { assert.equal(init.redirect, 'error'); throw new TypeError('redirect mode is set to error'); } }).forecast(games);
    assert.equal(result.errorCode, 'WIND_UNAVAILABLE');
  });
  await t.test('content-length over 512 KiB is WIND_BODY_LIMIT and the body is cancelled', async () => {
    let cancelled = false;
    const body = new ReadableStream({ pull(c) { c.enqueue(new TextEncoder().encode('[')); }, cancel() { cancelled = true; } });
    const result = await createOpenMeteoProvider({ fetchImpl: async () => new Response(body, { headers: { 'content-type': 'application/json', 'content-length': '600000' } }) }).forecast(games);
    assert.equal(result.errorCode, 'WIND_BODY_LIMIT');
    assert.equal(cancelled, true);
  });
  await t.test('a streamed oversize body with no content-length is WIND_BODY_LIMIT', async () => {
    let sent = 0, cancelled = false;
    const body = new ReadableStream({ pull(c) { sent += 65536; c.enqueue(new Uint8Array(65536).fill(32)); if (sent > 4_000_000) c.close(); }, cancel() { cancelled = true; } });
    const result = await createOpenMeteoProvider({ fetchImpl: async () => new Response(body, { headers: { 'content-type': 'application/json' } }) }).forecast(games);
    assert.equal(result.errorCode, 'WIND_BODY_LIMIT');
    assert.ok(cancelled && sent < 1_000_000, 'reading stops at the cap');
  });
  for (const [name, response] of [
    ['text/plain', () => new Response(good(), { headers: { 'content-type': 'text/plain' } })],
    ['invalid UTF-8', () => new Response(new Uint8Array([0x7b, 0xff, 0x7d]), { headers: { 'content-type': 'application/json' } })],
    ['truncated JSON', () => json(good().slice(0, -20))],
    ['the "Unexpected error while streaming data" tail', () => json(`${good()}Unexpected error while streaming data`)],
  ]) await t.test(`${name} is WIND_PAYLOAD`, async () => {
    assert.equal((await createOpenMeteoProvider({ fetchImpl: async () => response() }).forecast(games)).errorCode, 'WIND_PAYLOAD');
  });
  await t.test('a good body is rows with the request URL', async () => {
    const result = await createOpenMeteoProvider({ fetchImpl: async () => json(good()) }).forecast(games);
    assert.equal(result.ok, true);
    assert.equal(result.rows[0].windMph, 8);
    assert.ok(result.url.startsWith(`${OPEN_METEO_FORECAST}?`));
  });
  assert.throws(() => createOpenMeteoProvider({ timeoutMs: 5 }), /Invalid wind provider/);
  assert.throws(() => createOpenMeteoProvider({ timeoutMs: 10001 }), /Invalid wind provider/);
});

test('request: the exact URL, Accept-only init, a shared venue sent once, at most 16 locations, the hour window', async () => {
  const games = [at('HOU-JAX', null, '2026-10-18T13:30:00.000Z'), at('SEA-DEN', null, '2026-10-16T00:15:00.000Z')];
  const { fetchImpl, calls } = forecastFetch();
  const result = await createOpenMeteoProvider({ fetchImpl }).forecast(games);
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.open-meteo.com/v1/forecast?latitude=39.744,51.556&longitude=-105.020,-0.280&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,precipitation_probability,precipitation&wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=GMT&start_hour=2026-10-16T00:00&end_hour=2026-10-18T14:00');
  const init = calls[0].init;
  assert.deepEqual(init.headers, { Accept: 'application/json' });
  assert.deepEqual([init.method, init.credentials, init.cache, init.redirect], ['GET', 'omit', 'no-store', 'error']);
  assert.ok(init.signal instanceof AbortSignal);
  assert.doesNotMatch(JSON.stringify(init.headers), /apikey|Authorization/i);
  assert.deepEqual(result.rows.map(r => r.gameId), ['SEA-DEN', 'HOU-JAX'], 'kickoff order');
  // MetLife hosts both New York teams: one location for two games.
  const shared = windRequest([point('NO-NYG', 'NYC01', 40.813, -74.074, '2026-10-18T17:00:00.000Z'), point('MIA-NYJ', 'NYC01', 40.813, -74.074, '2026-10-19T17:00:00.000Z')]);
  assert.equal(shared.locations.length, 1);
  assert.match(shared.url, /latitude=40\.813&longitude=-74\.074&/);
  assert.deepEqual([new Date(shared.start).toISOString(), new Date(shared.end).toISOString(), shared.hours], ['2026-10-18T17:00:00.000Z', '2026-10-19T18:00:00.000Z', 26]);
  const many = Array.from({ length: 17 }, (_, i) => point(`A${String.fromCharCode(65 + i)}-BB`, `V${String.fromCharCode(65 + i)}X00`.slice(0, 3) + '00', 30 + i, -90, '2026-10-18T17:00:00.000Z'));
  assert.equal(codeOf(() => windRequest(many)), 'WIND_PAYLOAD');
  const sixteen = many.slice(0, 16);
  assert.equal(windRequest(sixteen).locations.length, 16);
  const refused = await createOpenMeteoProvider({ fetchImpl: async () => { throw new Error('must not fetch'); } }).forecast(many);
  assert.deepEqual([refused.ok, refused.errorCode], [false, 'WIND_PAYLOAD']);
  for (const bad of [[], [{ ...games[0], kickoff: '2026-10-16 00:15' }], [{ ...games[0], latitude: 91 }], [games[0], games[0]]]) assert.equal(codeOf(() => windRequest(bad)), 'WIND_PAYLOAD');
});

const SELECTION = [
  ['SEA-DEN TNF', 'DEN00', 39.744, -105.02, '2026-10-16T00:15:00.000Z', '2026-10-16T00:00:00.000Z', '2026-10-16T01:00:00.000Z'],
  ['HOU-JAX at Wembley', 'LON00', 51.556, -0.28, '2026-10-18T13:30:00.000Z', '2026-10-18T14:00:00.000Z', '2026-10-18T14:00:00.000Z'],
  ['1 PM ET', 'CLE00', 41.506, -81.7, '2026-10-18T17:00:00.000Z', '2026-10-18T17:00:00.000Z', '2026-10-18T18:00:00.000Z'],
  ['4:05 PM ET', 'KAN00', 39.049, -94.484, '2026-10-18T20:05:00.000Z', '2026-10-18T20:00:00.000Z', '2026-10-18T21:00:00.000Z'],
  ['LAC-KC 4:25 PM ET', 'KAN00', 39.049, -94.484, '2026-10-18T20:25:00.000Z', '2026-10-18T20:00:00.000Z', '2026-10-18T21:00:00.000Z'],
  ['DAL-GB SNF across the UTC date', 'GNB00', 44.501, -88.062, '2026-10-19T00:20:00.000Z', '2026-10-19T00:00:00.000Z', '2026-10-19T01:00:00.000Z'],
  ['WAS-SF MNF', 'SFO01', 37.403, -121.97, '2026-10-20T00:15:00.000Z', '2026-10-20T00:00:00.000Z', '2026-10-20T01:00:00.000Z'],
  ['SF-LAR Week 1 at Melbourne', 'MEL00', -37.82, 144.983, '2026-09-11T00:35:00.000Z', '2026-09-11T01:00:00.000Z', '2026-09-11T01:00:00.000Z'],
  ['PIT-NO Week 7 at Stade de France, the day BST and CEST end', 'PAR00', 48.924, 2.36, '2026-10-25T13:30:00.000Z', '2026-10-25T14:00:00.000Z', '2026-10-25T14:00:00.000Z'],
];

function selectionResults() {
  const out = [];
  for (const [name, venue, lat, lon, kickoff] of SELECTION) {
    const request = windRequest([point('AA-BB', venue, lat, lon, kickoff)]);
    // Each hour's values identify the hour: wind = 0.1 × index, gusts = 100 + 0.1 × index.
    const body = JSON.parse(buildForecast({ start: request.start, hours: request.hours, locations: [{ latitude: lat, longitude: lon,
      values: i => ({ wind_speed_10m: i / 10, wind_gusts_10m: 100 + i / 10, precipitation_probability: i }) }] }));
    const { rows } = selectKickoffRows(parseForecast(body, request), request);
    out.push([name, rows[0].forecastHour, rows[0].gustHour, rows[0].windMph, rows[0].gustMph, rows[0].precipitationProbability, request.start]);
  }
  return out;
}

test('kickoff-hour selection: nearest hour for wind, the containing hour for gusts, every Week 6 kickoff, DST and UTC dates', () => {
  // 1 PM ET is 17:00 UTC on October 25 and 18:00 UTC on November 1, after US daylight time ends.
  assert.equal(easternToUtc('2026-10-25', '13:00'), '2026-10-25T17:00:00.000Z');
  assert.equal(easternToUtc('2026-11-01', '13:00'), '2026-11-01T18:00:00.000Z');
  for (const kickoff of ['2026-10-25T17:00:00.000Z', '2026-11-01T18:00:00.000Z']) {
    const hours = kickoffHours(Date.parse(kickoff));
    assert.equal(new Date(hours.forecastHour).toISOString(), kickoff);
    assert.equal(hours.gustHour - hours.forecastHour, HOUR);
  }
  for (const [name, , , , , wind, gust] of SELECTION) {
    const row = selectionResults().find(r => r[0] === name);
    assert.deepEqual([row[1], row[2]], [wind, gust], name);
    assert.equal(row[3], Math.round((Date.parse(wind) - row[6]) / HOUR) / 10, `${name}: wind from the forecast-hour row`);
    assert.equal(row[4], 100 + Math.round((Date.parse(gust) - row[6]) / HOUR) / 10, `${name}: gusts from the gust-hour row`);
    assert.equal(row[5], Math.round((Date.parse(gust) - row[6]) / HOUR), `${name}: chance from the gust-hour row`);
  }
  assert.equal(parseHour('2026-10-18T14:00'), Date.UTC(2026, 9, 18, 14));
  for (const bad of ['2026-10-18T14:30', '2026-10-18T14:00Z', '2026-02-30T00:00', '2026-10-18 14:00']) assert.ok(Number.isNaN(parseHour(bad)), bad);
});

test('selection is identical in every process time zone', () => {
  const before = process.env.TZ, baseline = selectionResults();
  try {
    for (const zone of ['America/Los_Angeles', 'Australia/Melbourne', 'Asia/Kolkata']) {
      process.env.TZ = zone;
      assert.notEqual(new Date(Date.UTC(2026, 9, 18, 12)).getHours(), Number.NaN);
      assert.deepEqual(selectionResults(), baseline, zone);
      assert.equal(windRequest([point('AA-BB', 'DEN00', 39.744, -105.02, '2026-10-16T00:15:00.000Z')]).url.match(/start_hour=([^&]+)/)[1], '2026-10-16T00:00');
    }
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
});

test('a null sustained wind at the kickoff row stores nothing for that game; a null gust stays null', () => {
  const request = windRequest([point('AA-BB', 'DEN00', 39.744, -105.02, '2026-10-16T00:15:00.000Z'), point('CC-DD', 'CLE00', 41.506, -81.7, '2026-10-16T01:00:00.000Z')]);
  const body = JSON.parse(buildForecast({ start: request.start, hours: request.hours, locations: [
    { latitude: 39.744, longitude: -105.02, values: i => (i === 0 ? { wind_speed_10m: null } : {}) },
    { latitude: 41.506, longitude: -81.7, values: () => ({ wind_gusts_10m: null, temperature_2m: null }) },
  ] }));
  const { rows, skipped } = selectKickoffRows(parseForecast(body, request), request);
  assert.deepEqual(skipped, ['AA-BB']);
  assert.deepEqual(rows.map(r => [r.gameId, r.gustMph, r.temperatureF]), [['CC-DD', null, null]]);
});
