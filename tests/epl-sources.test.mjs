// EPL jobs worker sources (plan 2026-10-28-epl-pick-a-team.md, Task 5): Sleeper snapshots, The Odds API EPL h2h odds and
// scores, and the Odds API name -> club code map. Every request goes to a fake fetch; nothing touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EPL_CLUBS, EPL_CLUB_CODES, clubFromOddsName } from '../shared/epl-clubs.mjs';
import { ESPN_ABBR, EplSourceError, fetchEplOdds, fetchEplScores, fetchSleeperSnapshot, medianAmerican, SLEEPER_LEAGUE } from '../cloud/epl-sources.mjs';
import { readQuota } from '../cloud/odds-provider.mjs';

const KEY = 'test-odds-key-123';
const sha = text => createHash('sha256').update(text).digest('hex');
const quotaHeaders = (remaining = 400, used = 100, last = 1) => ({ 'content-type': 'application/json', 'x-requests-remaining': String(remaining), 'x-requests-used': String(used), 'x-requests-last': String(last) });

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, options = {}) => {
    const u = new URL(url);
    calls.push({ url: u, options });
    const route = routes.find(r => r.match(u));
    if (!route) return new Response('{"message":"not found"}', { status: 404 });
    const body = typeof route.body === 'string' ? route.body : JSON.stringify(route.body);
    return new Response(body, { status: route.status ?? 200, headers: route.headers ?? { 'content-type': 'application/json' } });
  };
  return { impl, calls };
}

test('EPL_CLUBS lists the 20 clubs of Task 6 with their ESPN ids', () => {
  assert.equal(EPL_CLUBS.length, 20);
  assert.deepEqual(Object.fromEntries(EPL_CLUBS.map(c => [c.code, c.espnId])), {
    BOU: 349, ARS: 359, AVL: 362, BRE: 337, BHA: 331, CHE: 363, COV: 388, CRY: 384, EVE: 368, FUL: 370,
    HUL: 306, IPS: 373, LEE: 357, LIV: 364, MNC: 382, MUN: 360, NEW: 361, NFO: 393, SUN: 366, TOT: 367 });
  assert.equal(new Set(EPL_CLUB_CODES).size, 20);
  assert.ok(Object.isFrozen(EPL_CLUBS) && EPL_CLUBS.every(c => Object.isFrozen(c) && Object.isFrozen(c.oddsApiNames) && c.oddsApiNames.length >= 1));
});

test('Odds API team names map to club codes; unknown and prototype names do not', () => {
  assert.equal(clubFromOddsName('Tottenham Hotspur'), 'TOT');
  assert.equal(ESPN_ABBR['Tottenham Hotspur'], 'TOT');
  assert.equal(clubFromOddsName('Manchester United'), 'MUN');
  assert.equal(clubFromOddsName('Manchester City'), 'MNC');
  assert.equal(clubFromOddsName('Brighton and Hove Albion'), 'BHA');
  assert.equal(clubFromOddsName('Nottingham Forest'), 'NFO');
  assert.equal(clubFromOddsName(' Arsenal '), 'ARS');
  for (const name of ['Wolverhampton Wanderers', 'constructor', '__proto__', '', null, 7]) assert.equal(clubFromOddsName(name), null, String(name));
  assert.equal(ESPN_ABBR.constructor, undefined, 'null prototype');
  assert.equal(Object.keys(ESPN_ABBR).length >= 20, true);
  assert.deepEqual(new Set(Object.values(ESPN_ABBR)), new Set(EPL_CLUB_CODES));
});

test('readQuota is exported from the NFL odds provider and reads the three quota headers', () => {
  assert.deepEqual(readQuota(new Headers(quotaHeaders(51, 449, 1))), { remaining: 51, used: 449, last: 1 });
  assert.deepEqual(readQuota(new Headers({})), { remaining: null, used: null, last: null });
});

test('medianAmerican takes the median implied probability across books', () => {
  assert.equal(medianAmerican([-150]), -150);
  assert.equal(medianAmerican([-150, -110, -200]), -150);
  assert.equal(medianAmerican([+120, +130, +110]), 120);
  assert.equal(medianAmerican([-110, +110]), 100, 'an even count averages the two middle probabilities');
  assert.equal(medianAmerican([]), null);
});

const STATE = { week: 9, season: '2026' };
const ROSTERS = [{ roster_id: 1, owner_id: '865667912365666304', settings: { fpts: 500, fpts_decimal: 25 }, starters: [] }];
function sleeperRoutes() {
  const bodies = {
    '/v1/state/clubsoccer:epl': STATE,
    [`/v1/league/${SLEEPER_LEAGUE}`]: { league_id: SLEEPER_LEAGUE },
    [`/v1/league/${SLEEPER_LEAGUE}/users`]: [{ user_id: '865667912365666304', display_name: 'nemoheye' }],
    [`/v1/league/${SLEEPER_LEAGUE}/rosters`]: ROSTERS,
    '/stats/clubsoccer:epl/2026/9': [{ player_id: '1', stats: { pts: 3 } }],
    '/projections/clubsoccer:epl/2026/10': [{ player_id: '1', stats: { pts: 4 } }],
  };
  return Object.entries(bodies).map(([path, body]) => ({ match: u => u.origin === 'https://api.sleeper.app' && u.pathname === path, body }));
}

test('fetchSleeperSnapshot saves the same six Sleeper responses as snapshot.py, with a SHA-256 of each raw body', async () => {
  const { impl, calls } = fakeFetch(sleeperRoutes());
  const snap = await fetchSleeperSnapshot({ fetchImpl: impl, label: 'after-mw9', statsWeek: 9, projectionsWeek: 10, clock: () => Date.parse('2026-11-04T00:05:07.123Z') });
  assert.equal(snap.label, 'after-mw9');
  assert.equal(snap.capturedAt, '2026-11-04T00:05:07Z');
  assert.deepEqual(calls.map(c => c.url.pathname + c.url.search), [
    '/v1/state/clubsoccer:epl', `/v1/league/${SLEEPER_LEAGUE}`, `/v1/league/${SLEEPER_LEAGUE}/users`, `/v1/league/${SLEEPER_LEAGUE}/rosters`,
    '/stats/clubsoccer:epl/2026/9?season_type=regular', '/projections/clubsoccer:epl/2026/10?season_type=regular']);
  assert.ok(calls.every(c => c.options.redirect === 'error' && c.options.method === 'GET'));
  assert.deepEqual(Object.keys(snap.sha256), ['state', 'league', 'users', 'rosters', 'stats_mw9', 'projections_mw10']);
  assert.equal(snap.sha256.rosters, sha(JSON.stringify(ROSTERS)));
  const p = snap.payload;
  assert.deepEqual(Object.keys(p), ['capturedAt', 'label', 'source', 'leagueId', 'sources', 'state', 'league', 'users', 'rosters', 'stats_mw9', 'projections_mw10']);
  assert.equal(p.source, 'https://api.sleeper.app'); assert.equal(p.leagueId, SLEEPER_LEAGUE);
  assert.deepEqual(p.sources.stats_mw9, { path: '/stats/clubsoccer:epl/2026/9?season_type=regular', sha256: snap.sha256.stats_mw9 });
  assert.deepEqual(p.rosters, ROSTERS); assert.deepEqual(p.state, STATE);
});

test('fetchSleeperSnapshot refuses a bad label or week, and a failed or malformed response', async () => {
  const { impl } = fakeFetch(sleeperRoutes());
  await assert.rejects(fetchSleeperSnapshot({ fetchImpl: impl, label: 'Bad Label', statsWeek: 9, projectionsWeek: 10 }), /invalid/i);
  await assert.rejects(fetchSleeperSnapshot({ fetchImpl: impl, label: 'after-mw9', statsWeek: 0, projectionsWeek: 10 }), /invalid/i);
  const broken = fakeFetch(sleeperRoutes().map(r => r.match(new URL(`https://api.sleeper.app/v1/league/${SLEEPER_LEAGUE}/rosters`)) ? { ...r, body: { not: 'a list' } } : r));
  await assert.rejects(fetchSleeperSnapshot({ fetchImpl: broken.impl, label: 'after-mw9', statsWeek: 9, projectionsWeek: 10 }), err => err instanceof EplSourceError && err.code === 'EPL_SOURCE_PAYLOAD');
  const down = fakeFetch([]);
  await assert.rejects(fetchSleeperSnapshot({ fetchImpl: down.impl, label: 'after-mw9', statsWeek: 9, projectionsWeek: 10 }), err => err.code === 'EPL_SOURCE_UNAVAILABLE');
});

const outcome = (name, price) => ({ name, price });
const book = (key, home, away, homePrice, awayPrice, draw = 250) => ({ key, markets: [{ key: 'h2h', outcomes: [outcome(home, homePrice), outcome(away, awayPrice), outcome('Draw', draw)] }] });
const EVENTS = [
  { id: 'ev1', sport_key: 'soccer_epl', commence_time: '2026-10-31T12:30:00Z', home_team: 'Tottenham Hotspur', away_team: 'Chelsea',
    bookmakers: [book('draftkings', 'Tottenham Hotspur', 'Chelsea', -120, 300), book('fanduel', 'Tottenham Hotspur', 'Chelsea', -110, 290), book('betmgm', 'Tottenham Hotspur', 'Chelsea', -130, 310), book('bovada', 'Tottenham Hotspur', 'Chelsea', -500, 900)] },
  { id: 'ev2', sport_key: 'soccer_epl', commence_time: '2026-10-31T15:00:00Z', home_team: 'Wolverhampton Wanderers', away_team: 'Arsenal', bookmakers: [book('draftkings', 'Wolverhampton Wanderers', 'Arsenal', 400, -150)] },
];

test('fetchEplOdds asks for EPL h2h from the three books, maps names to codes and takes the median per club', async () => {
  const { impl, calls } = fakeFetch([{ match: u => u.pathname === '/v4/sports/soccer_epl/odds', body: EVENTS, headers: quotaHeaders(399, 101, 1) }]);
  const result = await fetchEplOdds({ apiKey: KEY, fetchImpl: impl });
  assert.equal(calls.length, 1);
  const u = calls[0].url;
  assert.equal(u.origin, 'https://api.the-odds-api.com');
  assert.deepEqual(Object.fromEntries(u.searchParams), { regions: 'us', markets: 'h2h', bookmakers: 'draftkings,fanduel,betmgm', oddsFormat: 'american', apiKey: KEY });
  assert.equal(calls[0].options.redirect, 'error');
  assert.deepEqual(result.quota, { remaining: 399, used: 101, last: 1 });
  assert.deepEqual(result.events, [{ eventId: 'ev1', home: 'TOT', away: 'CHE', commenceTime: '2026-10-31T12:30:00.000Z', h2h: { TOT: -120, CHE: 300 } }]);
  assert.equal(result.unknown, 1, 'an event with a club outside the 20 is left out and counted');
});

test('fetchEplOdds raises a coded error that keeps the quota, never the key or provider text', async () => {
  const { impl } = fakeFetch([{ match: () => true, status: 401, body: { message: `bad key ${KEY}` }, headers: quotaHeaders(10, 490, 0) }]);
  await assert.rejects(fetchEplOdds({ apiKey: KEY, fetchImpl: impl }), err => {
    assert.ok(err instanceof EplSourceError); assert.equal(err.code, 'EPL_SOURCE_AUTH');
    assert.deepEqual(err.quota, { remaining: 10, used: 490, last: 0 });
    assert.ok(!String(err.message).includes(KEY));
    return true;
  });
  await assert.rejects(fetchEplOdds({ apiKey: '', fetchImpl: impl }), err => err.code === 'EPL_SOURCE_CONFIG');
  const bad = fakeFetch([{ match: () => true, body: { not: 'an array' }, headers: quotaHeaders() }]);
  await assert.rejects(fetchEplOdds({ apiKey: KEY, fetchImpl: bad.impl }), err => err.code === 'EPL_SOURCE_PAYLOAD');
});

test('fetchEplScores reads completed results for the last three days (2 credits) and reports the quota', async () => {
  const scores = [
    { id: 'ev1', sport_key: 'soccer_epl', commence_time: '2026-10-31T12:30:00Z', completed: true, home_team: 'Tottenham Hotspur', away_team: 'Chelsea', scores: [{ name: 'Tottenham Hotspur', score: '3' }, { name: 'Chelsea', score: '1' }] },
    { id: 'ev3', sport_key: 'soccer_epl', commence_time: '2026-11-02T20:00:00Z', completed: false, home_team: 'Liverpool', away_team: 'Everton', scores: null },
    { id: 'ev4', sport_key: 'soccer_epl', commence_time: '2026-11-01T14:00:00Z', completed: true, home_team: 'Wolverhampton Wanderers', away_team: 'Fulham', scores: [{ name: 'Fulham', score: '1' }] },
  ];
  const { impl, calls } = fakeFetch([{ match: u => u.pathname === '/v4/sports/soccer_epl/scores', body: scores, headers: quotaHeaders(397, 103, 2) }]);
  let seen;
  const rows = await fetchEplScores({ apiKey: KEY, fetchImpl: impl, daysFrom: 3, onQuota: q => { seen = q; } });
  assert.deepEqual(Object.fromEntries(calls[0].url.searchParams), { daysFrom: '3', apiKey: KEY });
  assert.deepEqual(seen, { remaining: 397, used: 103, last: 2 });
  assert.deepEqual(rows, [
    { eventId: 'ev1', completed: true, home: 'TOT', away: 'CHE', homeGoals: 3, awayGoals: 1, commenceTime: '2026-10-31T12:30:00.000Z' },
    { eventId: 'ev3', completed: false, home: 'LIV', away: 'EVE', homeGoals: null, awayGoals: null, commenceTime: '2026-11-02T20:00:00.000Z' },
  ]);
  await assert.rejects(fetchEplScores({ apiKey: KEY, fetchImpl: impl, daysFrom: 4 }), err => err.code === 'EPL_SOURCE_CONFIG');
});
