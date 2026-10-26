import test from 'node:test';
import assert from 'node:assert/strict';
import { FEED_METHODS, FeedError, REACTIONS, handleFeed, normalizeReactions, providerFeedError } from '../cloud/feed.mjs';
import { ROUTE_MODULES } from '../cloud/handler.mjs';

// cloud/feed.mjs (redesign build plan stages 61 to 65): the league feed routes. Contracts: a signed-in member only; each
// body is checked before any database call; the off switch refuses before the database; a reply is rebuilt from known keys
// only, so an unknown reaction, a negative count or an unexpected field never reaches the app; unmapped database codes
// become the generic error.
const USER = { id: '00000000-0000-4000-8000-00000000000b', is_anonymous: false };
const POST = '00000000-0000-4000-8000-0000000000aa';
const never = { rpc: async () => assert.fail('no database call') };

test('the feed routes are one module, wired once into the handler', () => {
  assert.equal(ROUTE_MODULES.feed, FEED_METHODS);
  assert.ok(Object.isFrozen(FEED_METHODS));
  for (const [route, methods] of Object.entries(FEED_METHODS)) { assert.match(route, /^\/league\//); assert.deepEqual(methods, ['POST']); }
  assert.deepEqual(REACTIONS, ['thumbs_up', 'fire', 'laughing', 'grimace', 'bullseye', 'clap']);
});

test('a signed-in member only, and only the module\'s own routes', async () => {
  for (const user of [null, {}, { id: 'not-a-uuid' }, { ...USER, is_anonymous: true }]) {
    await assert.rejects(handleFeed({ route: '/league/react', body: { postId: POST, reaction: 'fire' }, user, service: never }), error => error instanceof FeedError && error.status === 401);
  }
  await assert.rejects(handleFeed({ route: '/league/unknown', body: {}, user: USER, service: never }), error => error instanceof FeedError && error.status === 404 && error.message === 'Not found.');
});

test('POST /league/react: the body is checked first, the off switch refuses before the database, and the reply passes known keys only', async () => {
  for (const body of [null, [], {}, { postId: POST }, { postId: POST, reaction: 'heart' }, { postId: POST, reaction: 'fire', userId: USER.id }, { postId: 'x', reaction: 'fire' }, { postId: POST, reaction: undefined }]) {
    await assert.rejects(handleFeed({ route: '/league/react', body, user: USER, service: never }), error => error instanceof FeedError && error.status === 400, JSON.stringify(body));
  }
  await assert.rejects(handleFeed({ route: '/league/react', body: { postId: POST, reaction: 'fire' }, user: USER, service: never, featureOff: new Set(['reactions']) }),
    error => error instanceof FeedError && error.status === 503);
  const calls = [];
  const service = { rpc: async (name, args) => { calls.push([name, args]); return { postId: POST, counts: { fire: 2, heart: 9, clap: -1, laughing: 1.5 }, total: 99, mine: 'fire', changed: true, secret: 'x' }; } };
  const reply = await handleFeed({ route: '/league/react', body: { postId: POST, reaction: 'fire' }, user: USER, service, clock: () => Date.parse('2026-10-26T20:00:00Z') });
  assert.deepEqual(reply, { postId: POST, counts: { fire: 2 }, total: 2, mine: 'fire', changed: true });
  assert.deepEqual(calls, [['gtl_react_feed', { p_user: USER.id, p_post: POST, p_reaction: 'fire', p_now: '2026-10-26T20:00:00.000Z' }]]);
  // A take-back is null, and a reply for another post is refused.
  const back = await handleFeed({ route: '/league/react', body: { postId: POST, reaction: null }, user: USER, service: { rpc: async () => ({ postId: POST, counts: {}, total: 0, mine: null, changed: false }) } });
  assert.deepEqual(back, { postId: POST, counts: {}, total: 0, mine: null, changed: false });
  await assert.rejects(handleFeed({ route: '/league/react', body: { postId: POST, reaction: null }, user: USER, service: { rpc: async () => ({ postId: USER.id, counts: {}, changed: false }) } }), /Invalid reaction result/);
});

test('normalizeReactions keeps the six keys with whole positive counts; anything else reads as none', () => {
  assert.deepEqual(normalizeReactions(null), { counts: {}, total: 0, mine: null });
  assert.deepEqual(normalizeReactions({ counts: { thumbs_up: 3, bullseye: 0, '__proto__': 4, toString: 1 }, mine: 'toString' }), { counts: { thumbs_up: 3 }, total: 3, mine: null });
});

test('database codes map to plain messages; an unmapped code is the generic error and carries no detail', () => {
  assert.deepEqual([providerFeedError('GTL_COMMUNITY_INVALID').status, providerFeedError('GTL_COMMUNITY_MEMBER').status, providerFeedError('GTL_FEATURE_OFF').status], [400, 403, 503]);
  for (const message of [undefined, 'GTL_UNKNOWN', 'constructor', '__proto__', 'database secret detail']) {
    const error = providerFeedError(message);
    assert.ok(!(error instanceof FeedError));
    assert.equal(error.message, 'The league feed is unavailable.');
  }
});
