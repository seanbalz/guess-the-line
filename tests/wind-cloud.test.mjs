// The /wind/read route (D-34) through the real handler with an in-memory stand-in for the three RPCs
// (tests/wind-sql.test.mjs runs the real SQL) and the real Open-Meteo provider over a builder-backed
// fetch. Offline: nothing contacts Open-Meteo or the hosted project.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { WIND_ATTRIBUTION, WIND_DAILY_CAP, WIND_LICENSE_NOTE, WIND_METHODS, WIND_TIERS, handleWind, planWindRefresh, providerWindError, windTtlMinutes } from '../cloud/wind.mjs';
import { WIND_MAX_LOCATIONS, createOpenMeteoProvider } from '../cloud/open-meteo.mjs';
import { venueFor, windVenue } from '../shared/wind-venues.mjs';
import { privateResponse } from '../scripts/check-cloud-boundary.mjs';
import { forecastFetch } from './fixtures/open-meteo/build.mjs';

const week6 = JSON.parse(fs.readFileSync(new URL('../shared/trends/2026-week-06.json', import.meta.url), 'utf8'));
const USER = '00000000-0000-4000-8000-000000000001';
const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-15T00:15:00.000Z'); // 24 h before Thursday night; Monday night is exactly 120 h out.
const iso = ms => new Date(ms).toISOString();
const kickoffOf = id => Date.parse(week6.games.find(g => g.id === id).kickoff);
const SLATES = {
  '2026:6': week6.games.map(g => ({ id: g.id, away: g.away, home: g.home, kickoff: Date.parse(g.kickoff) / 1000 })),
  '2026:7': [{ id: 'PIT-NO', away: 'PIT', home: 'NO', kickoff: Date.parse('2026-10-25T13:30:00Z') / 1000 }, { id: 'NYG-DEN', away: 'NYG', home: 'DEN', kickoff: Date.parse('2026-10-25T20:05:00Z') / 1000 }],
};
const forbidden = new Proxy({}, { get: () => () => { throw new Error('The wind route must not touch league, ballot, scoring or community services.'); } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

/** An in-memory stand-in for the three wind RPCs with the SQL's rules (lease, spacing, TTL re-check). */
function memoryService({ clock, member = true, failBegin = false, failFinish = false, provider = null } = {}) {
  const attempts = [], outcomes = new Map(), forecasts = [], calls = [];
  const ttl = lead => windTtlMinutes(lead);
  const rpc = async (name, args) => {
    calls.push([name, structuredClone(args)]);
    const now = clock();
    if (name !== 'gtl_finish_wind_fetch' && !member) throw providerWindError('GTL_COMMUNITY_MEMBER');
    if (name === 'gtl_read_wind_forecasts') {
      const games = SLATES[`${args.p_season}:${args.p_week}`];
      if (!games) return { season: args.p_season, week: args.p_week, now: iso(now), published: false, games: [], latest: {} };
      const latest = {};
      for (const game of games) {
        const rows = forecasts.filter(f => f.season === args.p_season && f.week === args.p_week && f.gameId === game.id && Date.parse(f.kickoff) === game.kickoff * 1000);
        if (rows.length) latest[game.id] = rows.at(-1);
      }
      return { season: args.p_season, week: args.p_week, now: iso(now), published: true, games, latest, lastAttempt: null, budget: { usedToday: 0, cap: 200 } };
    }
    if (name === 'gtl_begin_wind_fetch') {
      if (failBegin) throw new Error('connection reset');
      for (const a of attempts) if (a.leaseUntil <= now && !outcomes.has(a.id)) outcomes.set(a.id, { status: 'failed', errorCode: 'WIND_LEASE_EXPIRED' });
      if (attempts.some(a => a.leaseUntil > now && !outcomes.has(a.id))) return { started: false, reason: 'busy' };
      if (attempts.some(a => a.startedAt > now - 60_000)) return { started: false, reason: 'cooldown' };
      const due = args.p_games.filter(g => {
        const kick = Date.parse(g.kickoff), t = ttl(kick - now);
        if (t === null) return false;
        const newest = forecasts.filter(f => f.gameId === g.gameId && f.kickoff === iso(kick)).at(-1);
        return !newest || now - Date.parse(newest.fetchedAt) >= t * 60_000;
      });
      if (!due.length) return { started: false, reason: 'not_due' };
      const attempt = { id: args.p_request, lease: crypto.randomUUID(), leaseUntil: now + 20_000, startedAt: now, games: due, season: args.p_season, week: args.p_week };
      attempts.push(attempt);
      return { started: true, requestId: attempt.id, lease: attempt.lease, leaseUntil: iso(attempt.leaseUntil), games: due, locations: due.length };
    }
    if (name === 'gtl_finish_wind_fetch') {
      if (failFinish) throw providerWindError('GTL_WIND_LEASE');
      const attempt = attempts.find(a => a.id === args.p_request);
      if (!attempt || attempt.lease !== args.p_lease) throw providerWindError('GTL_WIND_LEASE');
      if (outcomes.has(attempt.id)) return { ...outcomes.get(attempt.id), replay: true };
      if (args.p_status === 'failed') { outcomes.set(attempt.id, { status: 'failed', errorCode: args.p_error, http: args.p_http }); return { status: 'failed', stored: 0 }; }
      for (const row of args.p_rows) {
        forecasts.push({ ...row, season: attempt.season, week: attempt.week, fetchedAt: iso(now), model: 'best_match', source: 'Open-Meteo forecast API', licenseNote: WIND_LICENSE_NOTE });
      }
      outcomes.set(attempt.id, { status: 'succeeded', stored: args.p_rows.length });
      return { status: 'succeeded', stored: args.p_rows.length };
    }
    throw new Error(`Unexpected RPC ${name}`);
  };
  return { rpc, provider, calls, attempts, outcomes, forecasts };
}

function world({ start = NOW, fetchOptions, pick, ...options } = {}) {
  let now = start;
  const fake = forecastFetch(pick, fetchOptions);
  const service = memoryService({ clock: () => now, provider: createOpenMeteoProvider({ fetchImpl: fake.fetchImpl }), ...options });
  const user = { id: USER, emailConfirmed: true, email: 'luke@example.invalid' };
  const handler = createCloudHandler({ authenticate: async token => (token === 'token' ? user : null), storage: forbidden, weekly: forbidden, lobby: forbidden,
    social: forbidden, community: forbidden, officials: forbidden, odds: forbidden, personal: forbidden, results: forbidden, virtual: forbidden, wind: service });
  const post = (body = { season: 2026, week: 6 }, { auth = 'Bearer token', query = '', method = 'POST' } = {}) => handler(new Request(`https://fixture.invalid/functions/v1/gtl-api/wind/read${query}`, {
    method, headers: { ...(auth ? { authorization: auth } : {}), ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }));
  return { service, fake, handler, post, user, set: ms => { now = ms; }, now: () => now };
}

test('planner tiers: 120 h + 1 s is not yet, 120 h is 6 h, 72 h is 3 h, 18 h is 1 h, kickoff is never; ages just under and over each TTL', () => {
  assert.deepEqual(WIND_TIERS.map(t => [t.maxLeadH, t.ttlMin]), [[18, 60], [72, 180], [120, 360]]);
  const plan = (leadMs, ageMs = null) => planWindRefresh({ season: 2026, week: 6, now: NOW,
    games: [{ id: 'SEA-DEN', kickoff: NOW + leadMs }],
    latest: ageMs === null ? {} : { 'SEA-DEN': { fetchedAt: iso(NOW - ageMs) } } }).length === 1;
  assert.equal(plan(120 * HOUR + 1000), false);
  assert.equal(plan(120 * HOUR), true);
  assert.equal(plan(0), false);
  assert.equal(plan(-60_000), false);
  for (const [lead, ttlMin] of [[120 * HOUR, 360], [72 * HOUR + 1, 360], [72 * HOUR, 180], [18 * HOUR + 1, 180], [18 * HOUR, 60], [60_000, 60]]) {
    assert.equal(windTtlMinutes(lead), ttlMin, `${lead}`);
    assert.equal(plan(lead, ttlMin * 60_000 - 1), false, `just under ${ttlMin} min`);
    assert.equal(plan(lead, ttlMin * 60_000), true, `at ${ttlMin} min`);
  }
  // Domes are never planned; SoFi's canopy is (D-45); the venue comes from the server mirror, never the request.
  const all = planWindRefresh({ season: 2026, week: 6, now: NOW, latest: {}, games: SLATES['2026:6'].map(g => ({ id: g.id, kickoff: g.kickoff * 1000 })) });
  assert.equal(all.length, 13);
  assert.ok(!all.some(g => g.gameId === 'BUF-LV'), 'the Las Vegas dome');
  assert.deepEqual(all.filter(g => g.gameId === 'ARI-LAR').map(g => [g.venueId, g.latitude, g.longitude]), [['LAX01', 33.953, -118.339]]);
  assert.deepEqual(all.slice(0, 2).map(g => [g.gameId, g.venueId, g.latitude, g.longitude]), [['SEA-DEN', 'DEN00', 39.744, -105.02], ['HOU-JAX', 'LON00', 51.556, -0.28]]);
  assert.deepEqual(all.map(g => g.kickoff), [...all.map(g => g.kickoff)].sort(), 'kickoff order');
});

/**
 * The busiest UTC day's Open-Meteo calls (locations) with a reader every minute: every game is refreshed the moment
 * the real planner calls it due, and each request counts its distinct locations, as gtl_begin_wind_fetch does. The
 * 60 s spacing is ignored (it can only lower the count) and so is the cap, which the SQL applies (wind-sql.test.mjs).
 */
function busiestDay(slates, from, to) {
  const latest = new Map(), perDay = new Map();
  let widest = 0;
  for (let now = from; now < to; now += 60_000) {
    for (const [week, games] of slates) {
      const due = planWindRefresh({ season: 2026, week, now, games, latest: Object.fromEntries([...latest].filter(([key]) => key.startsWith(`${week}:`)).map(([key, at]) => [key.slice(key.indexOf(':') + 1), { fetchedAt: iso(at) }])) });
      if (!due.length) continue;
      const places = new Set(due.map(g => `${g.latitude},${g.longitude}`));
      widest = Math.max(widest, places.size);
      for (const g of due) latest.set(`${week}:${g.gameId}`, now);
      const day = iso(now).slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + places.size);
    }
  }
  const [day, calls] = [...perDay].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return { day, calls, widest };
}

test('D-45 cap math: the busiest day for Week 6 is 196 calls (178 before SoFi joined), under the 200 cap; a heavy slate needs the SQL cap', () => {
  assert.equal(WIND_DAILY_CAP, 200);
  const from = Date.parse('2026-10-11T00:00:00Z'), to = Date.parse('2026-10-21T00:00:00Z');
  const week6 = SLATES['2026:6'].map(g => ({ id: g.id, kickoff: g.kickoff * 1000 }));
  const week6Peak = busiestDay([[6, week6]], from, to);
  assert.deepEqual([week6Peak.day, week6Peak.calls], ['2026-10-18', 196]);
  assert.ok(week6Peak.calls <= WIND_DAILY_CAP);
  const before = busiestDay([[6, week6.filter(g => g.id !== 'ARI-LAR')]], from, to);
  assert.deepEqual([before.day, before.calls], ['2026-10-18', 178], 'D-34 coverage, for comparison');
  // A heavy 16-game slate with no dome (open, canopy and retractable stadiums; a no-dome slate was possible before D-45
  // too) at October's UTC kickoff times: TNF, a 13:30 morning game, 9 early, 3 late, SNF and MNF. Uncapped it would need
  // 248 calls on Sunday, so the SQL cap trims the request that would pass 200 (nearest kickoff first) and refuses the
  // rest of that UTC day.
  const pairs = ['SEA-DEN', 'HOU-CLE', 'CAR-PHI', 'MIA-ATL', 'NO-NYG', 'NYJ-NE', 'TEN-TB', 'ARI-IND', 'LAC-LAR', 'DAL-KC', 'WAS-GB', 'CIN-SF',
    'JAX-BAL', 'LV-BUF', 'MIN-CHI', 'DET-PIT'];
  const heavy = ['2026-10-23T00:15:00Z', '2026-10-25T13:30:00Z', ...Array(9).fill('2026-10-25T17:00:00Z'), '2026-10-25T20:05:00Z', '2026-10-25T20:05:00Z', '2026-10-25T20:25:00Z',
    '2026-10-26T00:20:00Z', '2026-10-27T00:15:00Z'].map((text, i) => ({ id: pairs[i], kickoff: Date.parse(text) }));
  const venues = heavy.map(g => venueFor(2026, 7, g.id));
  assert.ok(venues.every(windVenue) && new Set(venues.map(v => v.id)).size === 16, 'sixteen fetched stadiums');
  const peak = busiestDay([[7, heavy]], Date.parse('2026-10-17T00:00:00Z'), Date.parse('2026-10-28T00:00:00Z'));
  assert.deepEqual([peak.day, peak.calls], ['2026-10-25', 248]);
  assert.ok(peak.calls > WIND_DAILY_CAP && peak.widest <= WIND_MAX_LOCATIONS, 'one request never carries more than 16 locations');
});

test('a read fetches the due games once, stores them, and the next read is served from storage', async () => {
  const w = world({ pick: point => (point.latitude === 39.744 ? { values: () => ({ wind_speed_10m: 14.2, wind_gusts_10m: 27.5, wind_direction_10m: 247, temperature_2m: 49.3, precipitation_probability: 25 }) } : {}) });
  const response = await w.post();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.refresh.outcome, 'fetched');
  assert.equal(w.fake.calls.length, 1, 'one Open-Meteo request for the whole week');
  const sent = new URL(w.fake.calls[0].url).searchParams.get('latitude').split(',');
  assert.equal(sent.length, 13);
  assert.ok(sent.includes('33.953') && !sent.includes('36.091'), 'SoFi is sent; the Las Vegas dome never is');
  assert.deepEqual(body.attribution, { ...WIND_ATTRIBUTION });
  assert.equal(body.asOf, iso(NOW));
  assert.equal(Object.keys(body.games).length, 14);
  assert.deepEqual([body.games['BUF-LV'].status, body.games['BUF-LV'].wind, body.games['BUF-LV'].venue.type], ['indoor', null, 'dome']);
  assert.deepEqual([body.games['ARI-LAR'].status, body.games['ARI-LAR'].venue.type, body.games['ARI-LAR'].wind.windMph], ['forecast', 'canopy', 8]);
  const den = body.games['SEA-DEN'];
  assert.equal(den.status, 'forecast');
  assert.deepEqual(den.venue, { id: 'DEN00', name: 'Empower Field at Mile High', city: 'Denver', country: 'USA', type: 'outdoor' });
  assert.deepEqual([den.wind.windMph, den.wind.gustMph, den.wind.directionDeg, den.wind.temperatureF, den.wind.precipitationProbability], [14.2, 27.5, 247, 49.3, 25]);
  assert.deepEqual([den.wind.forecastHour, den.wind.gustHour, den.wind.fetchedAt, den.wind.model, den.wind.source], ['2026-10-16T00:00:00.000Z', '2026-10-16T01:00:00.000Z', iso(NOW), 'best_match', 'Open-Meteo forecast API']);
  assert.ok(den.wind.sourceUrl.startsWith('https://api.open-meteo.com/v1/forecast?latitude='));
  assert.equal(body.games['HOU-JAX'].venue.name, 'Wembley Stadium');
  // The next read, a minute later, finds nothing due and makes no request.
  w.set(NOW + 60_000);
  const again = await (await w.post()).json();
  assert.equal(again.refresh.outcome, 'not_due');
  assert.equal(w.fake.calls.length, 1);
  assert.equal(again.games['SEA-DEN'].wind.windMph, 14.2);
  // Three hours on, Thursday night (now 21 h out, TTL 3 h) is due again; the weekend games (6 h TTL) are not.
  w.set(NOW + 3 * HOUR);
  const later = await (await w.post()).json();
  assert.equal(later.refresh.outcome, 'fetched');
  assert.equal(w.fake.calls.length, 2);
  assert.equal(new URL(w.fake.calls[1].url).searchParams.get('latitude'), '39.744');
});

test('two concurrent reads make exactly one Open-Meteo request; the other is served what is stored', async () => {
  const gate = deferred();
  const w = world();
  const inner = w.service.provider.forecast;
  w.service.provider = { forecast: async games => { await gate.promise; return inner(games); } };
  const first = w.post(), second = w.post();
  await new Promise(resolve => setTimeout(resolve, 20));
  gate.resolve();
  const bodies = await Promise.all([first, second].map(async p => (await p).json()));
  assert.deepEqual(bodies.map(b => b.refresh.outcome).sort(), ['busy', 'fetched']);
  assert.equal(w.fake.calls.length, 1);
  assert.equal(w.service.attempts.length, 1);
});

test('every provider failure is a 200 with the stored snapshot; finish records only the fixed code', async t => {
  const cases = [
    ['WIND_RATE_LIMIT_DAILY', 429, '{"error":true,"reason":"Daily API request limit exceeded. Please try again tomorrow."}', 'application/json'],
    ['WIND_RATE_LIMIT', 429, '{"error":true,"reason":"Minutely API request limit exceeded. Please try again in one minute."}', 'application/json'],
    ['WIND_HTTP', 400, '{"error":true,"reason":"Cannot initialize WeatherVariable from invalid String value secret"}', 'application/json'],
    ['WIND_UNAVAILABLE', 503, '{"error":true,"reason":"The service is overloaded"}', 'application/json'],
    ['WIND_PAYLOAD', 200, 'not json', 'text/plain'],
    ['WIND_UNITS', 200, null, 'application/json'],
  ];
  for (const [code, status, text, type] of cases) await t.test(code, async () => {
    const w = world();
    await w.post(); // Stores a snapshot first.
    w.set(NOW + 3 * HOUR);
    const original = w.fake.fetchImpl;
    w.service.provider = createOpenMeteoProvider({ fetchImpl: async (url, init) => {
      if (code === 'WIND_UNITS') { const r = await original(url, init); return new Response((await r.text()).replaceAll('"mp/h"', '"km/h"'), { status: 200, headers: { 'content-type': type } }); }
      return new Response(text, { status, headers: { 'content-type': type } });
    } });
    const response = await w.post(), raw = await response.text(), body = JSON.parse(raw);
    assert.equal(response.status, 200);
    assert.equal(body.refresh.outcome, 'failed');
    assert.equal(body.games['SEA-DEN'].wind.windMph, 8, 'the earlier snapshot is still served');
    const finish = w.service.calls.filter(([name]) => name === 'gtl_finish_wind_fetch').at(-1)[1];
    assert.deepEqual([finish.p_status, finish.p_error, finish.p_rows], ['failed', code, null]);
    assert.equal(finish.p_http, status === 200 ? 200 : status);
    assert.doesNotMatch(raw, /reason|Daily API|Minutely|overloaded|secret|km\/h/);
  });
  await t.test('a timeout', async () => {
    const w = world();
    w.service.provider = createOpenMeteoProvider({ timeoutMs: 20, fetchImpl: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))) });
    const body = await (await w.post()).json();
    assert.equal(body.refresh.outcome, 'failed');
    assert.equal(w.service.calls.at(-2)[1].p_error, 'WIND_TIMEOUT');
    assert.equal(body.games['SEA-DEN'].status, 'none');
  });
});

test('a begin or finish RPC failure still answers 200 with the stored data', async () => {
  for (const failure of [{ failBegin: true }, { failFinish: true }]) {
    const w = world(failure);
    const response = await w.post();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.refresh.outcome, 'unavailable');
    assert.equal(body.games['SEA-DEN'].status, 'none');
    assert.deepEqual([body.games['BUF-LV'].status, body.games['ARI-LAR'].status], ['indoor', 'none']);
  }
});

test('Monday night is still refreshed after the next week is published, and only due games are sent', async () => {
  const mnf = kickoffOf('WAS-SF');
  const w = world({ start: mnf - 10 * HOUR });
  assert.ok(SLATES['2026:7'], 'Week 7 is published (D-24 opens it Monday 07:00 UTC)');
  const body = await (await w.post()).json();
  assert.equal(body.refresh.outcome, 'fetched');
  assert.equal(w.fake.calls.length, 1);
  assert.equal(new URL(w.fake.calls[0].url).searchParams.get('latitude'), '37.403', 'Levi’s Stadium only; every other Week 6 game has kicked off');
  assert.equal(body.games['WAS-SF'].status, 'forecast');
  assert.equal(body.games['SEA-DEN'].status, 'none');
  // Week 7 is read on its own; its games are still more than 120 h out on Monday.
  const seven = await (await w.post({ season: 2026, week: 7 })).json();
  assert.equal(seven.refresh.outcome, 'not_due');
  assert.deepEqual([seven.games['PIT-NO'].venue.id, seven.games['PIT-NO'].status, seven.games['NYG-DEN'].status], ['PAR00', 'not_yet', 'not_yet']);
  // Once a Week 7 game is due, a read within a minute of the last request is spaced (cooldown) and served what is stored.
  const thursday = world({ start: Date.parse('2026-10-21T12:00:00Z') });
  await thursday.post({ season: 2026, week: 7 });
  thursday.set(Date.parse('2026-10-21T12:00:30Z'));
  thursday.service.forecasts.length = 0;
  assert.equal((await (await thursday.post({ season: 2026, week: 7 })).json()).refresh.outcome, 'cooldown');
  assert.equal(thursday.fake.calls.length, 1);
});

test('no request for a dome-only, kicked-off or unpublished week, or without a provider', async () => {
  const after = world({ start: kickoffOf('WAS-SF') + HOUR });
  assert.equal((await (await after.post()).json()).refresh.outcome, 'not_due');
  assert.equal(after.fake.calls.length, 0);
  const unpublished = await (await world().post({ season: 2026, week: 8 })).json();
  assert.deepEqual([unpublished.published, unpublished.refresh.outcome, unpublished.games], [false, 'not_published', {}]);
  const readOnly = world();
  readOnly.service.provider = null;
  const body = await (await readOnly.post()).json();
  assert.equal(body.refresh.outcome, 'unavailable');
  assert.equal(readOnly.service.calls.filter(([name]) => name === 'gtl_begin_wind_fetch').length, 0);
  // A week whose games are all more than 120 h away is "not yet".
  const early = world({ start: kickoffOf('SEA-DEN') - 130 * HOUR });
  const far = await (await early.post()).json();
  assert.deepEqual([far.refresh.outcome, far.games['SEA-DEN'].status, early.fake.calls.length], ['not_due', 'not_yet', 0]);
});

test('route refusals: sign-in, email, body, method, query, membership and an unknown provider failure', async () => {
  const w = world();
  assert.equal((await w.post(undefined, { auth: null })).status, 401);
  assert.equal((await w.post(undefined, { auth: 'Bearer wrong' })).status, 401);
  const unconfirmed = createCloudHandler({ authenticate: async () => ({ id: USER, emailConfirmed: false, email: 'x@example.invalid' }), wind: w.service });
  assert.equal((await unconfirmed(new Request('https://fixture.invalid/functions/v1/gtl-api/wind/read', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: '{"season":2026,"week":6}' }))).status, 403);
  for (const body of [{ season: 2026, week: 6, gameId: 'SEA-DEN' }, { season: '2026', week: 6 }, { season: 2026, week: 26 }, { season: 2026 }, { season: 2026, week: 6, user: USER }]) {
    const response = await w.post(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).error, 'Check the season and week, then try again.');
  }
  assert.equal((await w.post(undefined, { method: 'GET' })).status, 405);
  assert.equal((await w.post(undefined, { query: '?league=sean-troy-luke' })).status, 400);
  const outsider = world({ member: false });
  const refused = await outsider.post();
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).error, 'Open My games and save your display name to join the community.');
  const broken = createCloudHandler({ authenticate: async () => w.user, wind: { rpc: async () => { throw providerWindError('GTL_SOMETHING_ELSE'); } } });
  const unknown = await broken(new Request('https://fixture.invalid/functions/v1/gtl-api/wind/read', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: '{"season":2026,"week":6}' }));
  assert.equal(unknown.status, 503);
  assert.equal((await unknown.json()).error, 'The saved data service is temporarily unavailable. Please try again.');
  const missing = createCloudHandler({ authenticate: async () => w.user });
  assert.equal((await missing(new Request('https://fixture.invalid/functions/v1/gtl-api/wind/read', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: '{"season":2026,"week":6}' }))).status, 503);
  await assert.rejects(() => handleWind({ route: '/wind/read', body: {}, user: { id: 'not-a-uuid' }, service: w.service }), error => error.status === 401);
  assert.deepEqual(WIND_METHODS, { '/wind/read': ['POST'] });
});

test('the response carries no user id, lease, attempt row or private key, and passes the boundary check\'s private-material pattern', async () => {
  const w = world();
  const raw = await (await w.post()).text();
  assert.doesNotMatch(raw, privateResponse);
  assert.doesNotMatch(raw, /"forecasts"\s*:|requested_by|lease|00000000-0000-4000-8000-000000000001|"user/);
  const body = JSON.parse(raw);
  assert.deepEqual(Object.keys(body).sort(), ['asOf', 'attribution', 'games', 'published', 'refresh', 'season', 'week']);
  assert.deepEqual(Object.keys(body.games['SEA-DEN']).sort(), ['kickoff', 'status', 'venue', 'wind']);
  // The begin RPC got the member's id and the server's venue points; nothing from the request body beyond season and week.
  const begin = w.service.calls.find(([name]) => name === 'gtl_begin_wind_fetch')[1];
  assert.equal(begin.p_user, USER);
  assert.deepEqual(Object.keys(begin.p_games[0]).sort(), ['gameId', 'kickoff', 'latitude', 'longitude', 'venueId']);
});

test('the adapter posts the RPCs with service headers, while the provider\'s Open-Meteo request carries none', async () => {
  const captured = [];
  const fake = forecastFetch();
  const adapter = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'anon', serviceRoleKey: 'service-secret', fetchImpl: async (url, init) => {
    captured.push({ url: String(url), init });
    if (String(url).startsWith('https://api.open-meteo.com/')) return fake.fetchImpl(url, init);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  await adapter.wind.rpc('gtl_read_wind_forecasts', { p_user: USER, p_season: 2026, p_week: 6 });
  assert.equal(captured[0].url, 'https://project.supabase.co/rest/v1/rpc/gtl_read_wind_forecasts');
  assert.equal(captured[0].init.headers.apikey, 'service-secret');
  const result = await adapter.wind.provider.forecast([{ gameId: 'SEA-DEN', venueId: 'DEN00', latitude: 39.744, longitude: -105.02, kickoff: '2026-10-16T00:15:00.000Z' }]);
  assert.equal(result.ok, true);
  const meteo = captured.find(c => c.url.startsWith('https://api.open-meteo.com/'));
  assert.deepEqual(meteo.init.headers, { Accept: 'application/json' });
  assert.doesNotMatch(JSON.stringify(meteo.init), /service-secret|apikey|Authorization/i);
  // Coded refusals map; anything else is the generic failure.
  const refusing = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'anon', serviceRoleKey: 'k', fetchImpl: async () => new Response(JSON.stringify({ message: 'GTL_COMMUNITY_MEMBER' }), { status: 400 }) });
  await assert.rejects(() => refusing.wind.rpc('gtl_read_wind_forecasts', {}), error => error.status === 403);
  const lease = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'anon', serviceRoleKey: 'k', fetchImpl: async () => new Response(JSON.stringify({ message: 'GTL_WIND_LEASE' }), { status: 400 }) });
  await assert.rejects(() => lease.wind.rpc('gtl_finish_wind_fetch', {}), error => error.code === 'GTL_WIND_LEASE' && !error.status && error.message === 'Wind forecasts are unavailable.');
});
