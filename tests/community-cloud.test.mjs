import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudHandler } from '../cloud/handler.mjs';
import { picksDue } from '../cloud/community.mjs';

const USER = '00000000-0000-4000-8000-000000000001';
const forbidden = new Proxy({}, { get: () => () => { throw new Error('Community routes must not touch league, ballot or lobby services.'); } });
const feed = { viewer: USER, admin: false, members: [{ id: USER, displayName: 'Ben' }], week: { season: 2026, week: 6, deadline: '2026-10-16T00:15:00Z', games: 14 },
  due: [{ mode: 'guess_spread', submitted: true, filled: 14, games: 14 }, { mode: 'guess_total', submitted: false, filled: 3, games: 14 }],
  submissions: [], posts: [{ id: '00000000-0000-4000-8000-000000000009', actorId: USER, kind: 'ballot_submitted', mode: 'guess_spread', createdAt: '2026-10-14T00:00:00Z', likes: 0, likedByMe: false, comments: [], picksHidden: true, picks: { 'SEA-DEN': -3 }, payload: {} }] };

function handler(calls) {
  return createCloudHandler({
    authenticate: async () => ({ id: USER, emailConfirmed: true, email: 'ben@example.invalid' }),
    storage: forbidden, weekly: forbidden, lobby: forbidden, social: forbidden,
    community: { rpc: async (name, args) => { calls.push([name, args]); return name === 'gtl_sit_out_week' ? { satOut: true, replayed: false } : feed; } },
    clock: () => Date.parse('2026-10-15T23:00:00Z'),
  });
}

test('community read is isolated from league services, passes request time and never leaks hidden picks', async () => {
  const calls = [];
  const response = await handler(calls)(new Request('https://fixture.invalid/community/read', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(calls[0][0], 'gtl_read_community');
  assert.equal(calls[0][1].p_now, '2026-10-15T23:00:00.000Z');
  assert.equal(body.posts[0].picks, null, 'hidden picks are stripped even if the provider returned them');
  assert.deepEqual(body.picksDue, { state: 'urgent', deadline: '2026-10-16T00:15:00Z', week: 6, modes: [{ mode: 'guess_total', submitted: false, satOut: false, filled: 3, games: 14 }] });
  assert.deepEqual(body.optOuts, []);
  assert.deepEqual(body.members, [{ id: USER, displayName: 'Ben', removed: false }]);
});

test('D-23 sit-out route validates strictly, passes the request time and returns the final opt-out', async () => {
  const calls = [];
  const send = (body, auth = 'Bearer token') => handler(calls)(new Request('https://fixture.invalid/community/sit-out', { method: 'POST', headers: { ...(auth ? { authorization: auth } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  for (const body of [{}, { season: 2026, week: 6 }, { season: 2026, week: 6, mode: 'betting_challenge' }, { season: '2026', week: 6, mode: 'guess_total' }, { season: 2026, week: 0, mode: 'guess_total' },
    { season: 2026, week: 6, mode: 'guess_total', userId: USER }]) assert.equal((await send(body)).status, 400, JSON.stringify(body));
  assert.equal((await send({ season: 2026, week: 6, mode: 'guess_total' }, null)).status, 401);
  assert.equal(calls.length, 0, 'invalid requests never reach the database');
  const response = await send({ season: 2026, week: 6, mode: 'guess_total' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { season: 2026, week: 6, mode: 'guess_total', satOut: true, replayed: false });
  assert.deepEqual(calls, [['gtl_sit_out_week', { p_user: USER, p_season: 2026, p_week: 6, p_mode: 'guess_total', p_now: '2026-10-15T23:00:00.000Z' }]]);
});

test('community routes reject unknown fields and unauthenticated requests', async () => {
  const send = (path, body, auth = 'Bearer token') => handler([])(new Request(`https://fixture.invalid${path}`, { method: 'POST', headers: { ...(auth ? { authorization: auth } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await send('/community/read', { extra: 1 })).status, 400);
  assert.equal((await send('/community/like', { postId: 'nope', like: true })).status, 400);
  assert.equal((await send('/community/read', {}, null)).status, 401);
});

test('picks-due states', () => {
  const at = iso => Date.parse(iso);
  assert.equal(picksDue({ week: null }, 0).state, 'none');
  assert.equal(picksDue({ ...feed, due: feed.due.map(d => ({ ...d, submitted: true })) }, 0).state, 'done');
  assert.equal(picksDue(feed, at('2026-10-14T00:00:00Z')).state, 'due');
  assert.equal(picksDue(feed, at('2026-10-16T00:15:00Z')).state, 'closed');
  const satOut = { ...feed, due: feed.due.map(d => (d.mode === 'guess_total' ? { ...d, satOut: true } : d)) };
  assert.equal(picksDue(satOut, at('2026-10-14T00:00:00Z')).state, 'done', 'a sat-out mode is never due');
  const both = { ...feed, due: feed.due.map(d => ({ ...d, submitted: false, satOut: d.mode === 'guess_total' })) };
  assert.deepEqual(picksDue(both, at('2026-10-14T00:00:00Z')).modes.map(d => d.mode), ['guess_spread']);
});

test('community interest route validates strictly and normalizes interests (D-22)', async () => {
  const calls = [];
  const app = createCloudHandler({
    authenticate: async () => ({ id: USER, emailConfirmed: true, email: 'ben@example.invalid' }),
    storage: forbidden, weekly: forbidden, lobby: forbidden, social: forbidden,
    community: { rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'gtl_set_league_interest') return { league: args.p_league, notify: args.p_notify, count: 4 };
      return { ...feed, interests: ['nhl', 'nfl', 'nba', 7], interestCounts: { nba: 2, nhl: '1', nfl: 9, mlb: -3 } };
    } },
    clock: () => Date.parse('2026-10-15T23:00:00Z'),
  });
  const send = (path, body, auth = 'Bearer token') => app(new Request(`https://fixture.invalid${path}`, { method: 'POST', headers: { ...(auth ? { authorization: auth } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  for (const body of [{}, { league: 'nba' }, { notify: true }, { league: 'nfl', notify: true }, { league: 'NBA', notify: true }, { league: 'nba', notify: 1 }, { league: 'nba', notify: true, extra: 1 }, ['nba', true]]) {
    assert.equal((await send('/community/interest', body)).status, 400, JSON.stringify(body));
  }
  assert.equal(calls.length, 0, 'invalid bodies never reach the database');
  assert.equal((await send('/community/interest', { league: 'nba', notify: true }, null)).status, 401);
  const ok = await send('/community/interest', { league: 'cbb', notify: true });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { league: 'cbb', notify: true, count: 4 });
  assert.deepEqual(calls.at(-1), ['gtl_set_league_interest', { p_user: USER, p_league: 'cbb', p_notify: true }]);
  const read = await (await send('/community/read', {})).json();
  assert.deepEqual(read.interests, ['nba', 'nhl'], 'unknown and live leagues are dropped');
  assert.deepEqual(read.interestCounts, { nba: 2, mlb: 0, nhl: 1, cfb: 0, cbb: 0 });
});
