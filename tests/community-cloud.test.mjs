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
    community: { rpc: async (name, args) => { calls.push([name, args]); return feed; } },
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
  assert.deepEqual(body.picksDue, { state: 'urgent', opensAt: '2026-10-12T07:00:00.000Z', deadline: '2026-10-16T00:15:00Z', week: 6, modes: [{ mode: 'guess_total', submitted: false, filled: 3, games: 14 }] });
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
  // D-24: not due before Monday 00:00 PT of game week; the open time is reported for the notice.
  const early = picksDue(feed, at('2026-10-12T06:59:59Z'));
  assert.deepEqual([early.state, early.opensAt, early.week, early.modes.length], ['not_open', '2026-10-12T07:00:00.000Z', 6, 1]);
  assert.equal(picksDue(feed, at('2026-10-12T07:00:00Z')).state, 'due');
  assert.equal(picksDue({ ...feed, week: { ...feed.week, deadline: '2026-12-11T01:15:00Z' } }, at('2026-12-07T07:30:00Z')).state, 'not_open', 'PST: Monday 00:00 PT is 08:00 UTC');
  assert.equal(picksDue({ ...feed, week: { ...feed.week, deadline: '2026-12-11T01:15:00Z' } }, at('2026-12-07T08:00:00Z')).state, 'due');
});

test('commissioner week-open status route is validated and never passes a token', async () => {
  const calls = [];
  const status = { configured: true, enabled: true, season: 2026, utcCrons: ['0 7 * * 1', '0 8 * * 1'], lastRunAt: '2026-10-12T07:00:01Z', lastStatus: 'succeeded', lastReason: null, currentWeek: { season: 2026, week: 6, openAt: '2026-10-12T07:00:00+00:00', deadline: '2026-10-16T00:15:00+00:00' }, capability_hash: 'x' };
  const app = createCloudHandler({ authenticate: async () => ({ id: USER, emailConfirmed: true, email: 'ben@example.invalid' }), storage: forbidden, weekly: forbidden, lobby: forbidden, social: forbidden,
    community: { rpc: async (name, args) => { calls.push([name, args]); return status; } } });
  const send = body => app(new Request('https://fixture.invalid/community/week-open', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const response = await send({});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(calls, [['gtl_read_week_open_schedule', { p_user: USER }]]);
  assert.deepEqual(body, { configured: true, enabled: true, season: 2026, timeZone: 'America/Los_Angeles', localTime: '00:00', weekday: 'Monday', utcCrons: ['0 7 * * 1', '0 8 * * 1'],
    lastRunAt: '2026-10-12T07:00:01Z', lastFinishedAt: null, lastStatus: 'succeeded', lastReason: null, currentWeek: { season: 2026, week: 6, openAt: '2026-10-12T07:00:00+00:00', deadline: '2026-10-16T00:15:00+00:00' } });
  assert.equal((await send({ extra: 1 })).status, 400);
});
