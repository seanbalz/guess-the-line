import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeamSeasonProvider, TEAMS_FRESH_MS, TEAMS_RETRY_MS, TEAMS_STALE_MS } from '../cloud/team-season.mjs';
import { handleLines, LinesError, projectTeamSeason } from '../cloud/lines.mjs';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { NFLVERSE_SCHEDULE_URL } from '../shared/nfl-schedule.mjs';

// D-62: POST /lines/teams, team records live from the public nflverse schedule file. cloud/team-season.mjs caches the
// parsed file per isolate; cloud/lines.mjs validates the body and rebuilds the reply from fixed keys. Fixture data only:
// the market columns carry unusual values (13.75, 61.25, -175) that no score, week or time can equal.
const USER = { id: '00000000-0000-4000-8000-0000000000a1', is_anonymous: false };
const T0 = Date.parse('2026-10-27T18:00:00.000Z');
const CSV = `game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location,spread_line,total_line,away_moneyline
2026_01_SEA_DEN,2026,REG,1,2026-09-13,Sunday,16:05,SEA,24,DEN,17,Home,13.75,61.25,-175
2026_02_DEN_SEA,2026,REG,2,2026-09-20,Sunday,16:25,DEN,,SEA,,Home,13.75,61.25,-175
2025_01_SEA_DEN,2025,REG,1,2025-09-07,Sunday,16:05,SEA,0,DEN,50,Home,13.75,61.25,-175`;

/** A provider over a scripted loader: each load answers the next entry (a string, or an Error to throw). */
function scripted(answers, start = T0) {
  let now = start, loads = 0;
  const provider = createTeamSeasonProvider({ loadSchedule: async () => { loads++; const next = answers.shift(); if (next instanceof Error) throw next; return next; }, clock: () => now });
  return { provider, loads: () => loads, at: ms => { now = start + ms; } };
}

test('cache contract: one read of the file serves every request for 10 minutes; the next request after that reads it again', async () => {
  const { provider, loads, at } = scripted([CSV, CSV]);
  const [a, b] = await Promise.all([provider.read(), provider.read()]);
  assert.equal(loads(), 1, 'concurrent first reads share one fetch');
  at(TEAMS_FRESH_MS - 1);
  const c = await provider.read();
  assert.equal(loads(), 1, 'a cache hit within 10 minutes makes no second fetch');
  assert.equal(a.teams, c.teams, 'the season is computed once per fill, not per request');
  assert.deepEqual([a.stale, b.stale, c.stale, c.updatedAt], [false, false, false, new Date(T0).toISOString()]);
  at(TEAMS_FRESH_MS);
  const d = await provider.read();
  assert.equal(loads(), 2, 'refetched after 10 minutes');
  assert.notEqual(d.teams, a.teams);
  assert.equal(d.updatedAt, new Date(T0 + TEAMS_FRESH_MS).toISOString());
});

test('stale contract: a failed refill serves the last file under 24 hours old marked stale, retries after a minute, and else answers null', async () => {
  const { provider, loads, at } = scripted([CSV, new Error('network'), 'game_id,season\n1,2026', CSV]);
  await provider.read();
  at(TEAMS_FRESH_MS + 1);
  const stale = await provider.read();
  assert.deepEqual([stale.stale, stale.updatedAt, stale.teams.SEA.overall], [true, new Date(T0).toISOString(), { w: 1, l: 0, t: 0 }]);
  at(TEAMS_FRESH_MS + TEAMS_RETRY_MS);
  assert.equal((await provider.read()).stale, true);
  assert.equal(loads(), 2, 'no fetch during the retry minute');
  at(TEAMS_FRESH_MS + TEAMS_RETRY_MS + 2);
  assert.equal((await provider.read()).stale, true, 'a file missing a column is a failed refill too');
  assert.equal(loads(), 3);
  // A fresh success clears the stale mark.
  at(TEAMS_FRESH_MS + 2 * TEAMS_RETRY_MS + 3);
  assert.equal((await provider.read()).stale, false);
  const old = scripted([CSV, new Error('network')]);
  await old.provider.read();
  old.at(TEAMS_STALE_MS);
  assert.equal(await old.provider.read(), null, 'nothing under 24 hours old: no answer');
  for (const bad of [new Error('down'), 42, 'game_id,season,game_type,week,away_team,away_score,home_team,home_score,location\nx,2026,POST,19,SEA,1,DEN,0,Home']) {
    assert.equal(await scripted([bad]).provider.read(), null, `no cache: ${String(bad).slice(0, 20)}`);
  }
});

test('season contract: the default is the newest season in the file; a named season is its own', async () => {
  const { provider, loads } = scripted([CSV]);
  const [newest, last] = await Promise.all([provider.read(), provider.read({ season: 2025 })]);
  assert.deepEqual([newest.season, newest.throughWeek, newest.finals], [2026, 1, 1]);
  assert.deepEqual([last.season, last.teams.SEA.overall], [2025, { w: 0, l: 1, t: 0 }]);
  assert.equal(loads(), 1);
});

test('route contract: { } or { season } only, identity from sign-in; a bad season is 400; no records is 503', async () => {
  const calls = [];
  const service = { rpc: async () => assert.fail('no database call'), teams: { read: async options => { calls.push(options); return { season: 2026, teams: {} }; } } };
  const call = body => handleLines({ route: '/lines/teams', body, user: USER, service });
  await call({}); await call({ season: null }); await call({ season: 2025 });
  assert.deepEqual(calls, [{ season: null }, { season: null }, { season: 2025 }]);
  for (const body of [{ userId: USER.id }, { season: 2026, week: 7 }, { gameId: 'SEA-DEN' }, { now: '2026-10-01T00:00:00Z' }]) {
    await assert.rejects(call(body), e => e instanceof LinesError && e.status === 400 && e.message === 'Unexpected request field. Player identity comes from sign-in.', JSON.stringify(body));
  }
  for (const season of [1999, 2101, '2026', 2026.5, true, {}]) {
    await assert.rejects(call({ season }), e => e instanceof LinesError && e.status === 400 && e.message === 'Check the season, then try again.', JSON.stringify(season));
  }
  assert.equal(calls.length, 3, 'a refused body reads nothing');
  for (const teams of [{ read: async () => null }, undefined]) {
    await assert.rejects(handleLines({ route: '/lines/teams', body: {}, user: USER, service: { rpc: service.rpc, teams } }),
      e => e instanceof LinesError && e.status === 503 && e.message === 'Team records are not available right now.');
  }
  await assert.rejects(handleLines({ route: '/lines/teams', body: {}, user: USER, service, featureOff: new Set(['lines']) }), e => e.status === 503);
});

test('reply contract: rebuilt from fixed keys; no market, unknown team or score of an unfinished game survives, and the source is fixed', () => {
  const game = { week: 2, gameId: 'DEN-SEA', opponent: 'DEN', home: true, neutral: false, kickoff: '2026-09-20T20:25:00.000Z', final: false, pf: 20, pa: 17, result: 'W', spread_line: 13.75, total_line: 61.25, lineAtGuess: { value: 13.75 } };
  const reply = projectTeamSeason({
    season: 2026, throughWeek: 1, finals: 1, updatedAt: '2026-10-27T18:00:00.000Z', stale: 'yes', rows: ['raw'], source: { url: 'https://example.invalid/' },
    teams: {
      SEA: { overall: { w: 1, l: 0, t: 0, spread: 13.75 }, home: { w: 0, l: 0, t: 0 }, road: { w: 1, l: 0, t: 0 }, pointsFor: 24, pointsAgainst: 17, total_line: 61.25,
        games: [{ week: 1, gameId: 'SEA-DEN', opponent: 'DEN', home: false, neutral: false, kickoff: '2026-09-13T20:05:00.000Z', final: true, pf: 24, pa: 17, result: 'W', spread_line: 13.75 }, game, 'x'] },
      XYZ: { overall: { w: 9, l: 0, t: 0 } }, __proto__: { overall: {} },
    },
  });
  assert.deepEqual(Object.keys(reply), ['season', 'throughWeek', 'finals', 'updatedAt', 'stale', 'source', 'teams']);
  assert.deepEqual(reply.source, { name: 'nflverse nfldata', url: NFLVERSE_SCHEDULE_URL, credit: 'nflverse nfldata (Lee Sharpe); final scores only' });
  assert.equal(reply.stale, false, 'stale is exactly true or false');
  assert.deepEqual(Object.keys(reply.teams), ['SEA']);
  assert.deepEqual(Object.keys(reply.teams.SEA), ['overall', 'home', 'road', 'pointsFor', 'pointsAgainst', 'games']);
  assert.deepEqual(reply.teams.SEA.overall, { w: 1, l: 0, t: 0 });
  assert.deepEqual(reply.teams.SEA.games[1], { week: 2, gameId: 'DEN-SEA', opponent: 'DEN', home: true, neutral: false, kickoff: '2026-09-20T20:25:00.000Z', final: false, pf: null, pa: null, result: null });
  assert.equal(reply.teams.SEA.games.length, 2);
  assert.doesNotMatch(JSON.stringify(reply), /13\.75|61\.25|spread|total|line|"rows"|example\.invalid/);
});

test('through gtl-api: signed in only, the adapter reads the public file once, and the HTTP reply carries no market value', async () => {
  const fetched = [];
  const adapter = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'server-test-secret', clock: () => T0,
    fetchImpl: async (url, options) => { fetched.push([String(url), options.redirect]); return new Response(CSV, { status: 200 }); } });
  const authenticate = async token => (token === 'fixture-token' ? { ...USER, email: 'viewer@example.test', emailConfirmed: true } : null);
  const send = (handler, body, token = 'fixture-token', query = '') => handler(new Request(`https://fixture.invalid/functions/v1/gtl-api/lines/teams${query}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
  const handler = createCloudHandler({ authenticate, lines: adapter.lines, clock: () => T0 });
  for (const token of [null, 'invalid']) assert.equal((await send(handler, {}, token)).status, 401);
  assert.equal(fetched.length, 0, 'signed out reads nothing');
  const first = await send(handler, {}), second = await send(handler, { season: 2026 });
  assert.deepEqual([first.status, second.status], [200, 200]);
  const text = await first.text(), body = JSON.parse(text);
  assert.deepEqual(fetched, [[NFLVERSE_SCHEDULE_URL, 'error']], 'one fetch of the public file, redirects refused');
  assert.deepEqual([body.season, body.throughWeek, body.finals, body.stale, body.teams.SEA.overall, body.teams.DEN.games.length], [2026, 1, 1, false, { w: 1, l: 0, t: 0 }, 2]);
  assert.doesNotMatch(text, /13\.75|61\.25|-175|spread|total_line|moneyline/);
  assert.equal((await send(handler, {}, 'fixture-token', '?season=2026')).status, 400, 'group routes take no query parameters');
  const off = createCloudHandler({ authenticate, lines: adapter.lines, featureOff: 'lines' });
  assert.deepEqual(await (await send(off, {})).json(), { error: 'Lines are not available right now.' });
});
