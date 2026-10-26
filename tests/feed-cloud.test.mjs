import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FEED_KINDS, FEED_METHODS, FeedError, REACTIONS, handleFeed, normalizeReactions, providerFeedError } from '../cloud/feed.mjs';
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

test('the feed knows exactly the kinds M-13 allows', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261026130000_gtl_feed_kinds.sql', import.meta.url), 'utf8').replace(/--[^\n]*/g, '');
  const listed = [...sql.match(/check \(kind in \(([^)]*)\)\)/)[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepEqual([...FEED_KINDS].sort(), listed.sort());
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

const VIEWER = USER.id, OTHER = '00000000-0000-4000-8000-0000000000cc';
const post = (kind, embed, extra = {}) => ({ id: POST, actorId: OTHER, kind, season: 2026, week: 8, mode: kind === 'ballot_submitted' || kind === 'result_shared' ? 'guess_spread' : null,
  leagueId: null, createdAt: '2026-10-26T18:00:00Z', reactions: { counts: { fire: 1 }, total: 1, mine: null }, commentCount: 0, comments: [], embed, ...extra });
const feedReply = posts => ({ viewer: VIEWER, leagueId: null, now: '2026-10-26T20:00:00Z', members: [{ id: OTHER, displayName: 'Avery Fixture' }], roster: null, posts });
const readFeed = (raw, body = {}) => handleFeed({ route: '/league/feed', body, user: USER, service: { rpc: async () => raw } });

test('POST /league/feed: a second gate on every embed; unknown kinds and raw payloads never pass', async () => {
  const reply = await readFeed(feedReply([
    post('ballot_submitted', { picks: { 'SEA-DEN': -2.5, 'KC-LV': 3.5, junk: 1 }, hiddenGames: ['KC-LV'], late: { minutes: 12, deadline: '2026-10-22T00:15:00Z' }, line: -3.5 }),
    post('result_shared', { gameId: 'SEA-DEN', visible: false, pick: -2.5, points: 9 }),
    post('result_shared', { gameId: 'SEA-DEN', visible: true, pick: -2.5, points: 9, line: -3 }),
    post('kickoff', { kickoff: '2026-10-26T17:00:00Z', games: [{ gameId: 'SEA-DEN', in: [OTHER, 'not-a-uuid'], bets: 3, lines: [-3] }, { gameId: 'bad' }] }),
    post('bet_posted', { entryId: 'e1', line: -3.5, legs: [{ line: -3.5 }] }),
    post('challenge_offered', { line: -3.5, units: 2 }),
    post('score_changed', { line: -3.5 }),
  ]));
  const [ballot, hidden, shown, kickoff, slip, challenge] = reply.posts;
  assert.equal(reply.posts.length, 6, 'an unknown kind is dropped');
  assert.deepEqual(ballot.embed, { picks: { 'SEA-DEN': -2.5 }, hiddenGames: ['KC-LV'], late: { deadline: '2026-10-22T00:15:00Z', minutes: 12 } }, 'a number under a withheld game never passes');
  assert.deepEqual(hidden.embed, { gameId: 'SEA-DEN', visible: false }, 'a hidden result carries no guess or points');
  assert.deepEqual(shown.embed, { gameId: 'SEA-DEN', visible: true, pick: -2.5, points: 9 });
  assert.deepEqual(kickoff.embed, { kickoff: '2026-10-26T17:00:00Z', games: [{ gameId: 'SEA-DEN', in: [OTHER], bets: 3 }] });
  assert.deepEqual(slip.embed, { entryId: 'e1' });
  assert.deepEqual(challenge.embed, {}, 'a kind whose embed is not built yet passes nothing from its payload');
  assert.deepEqual(ballot.reactions, { counts: { fire: 1 }, total: 1, mine: null });
  assert.equal(reply.next, null);
  // A reply for another viewer or league is refused; a full page carries the cursor for the next one.
  await assert.rejects(readFeed({ ...feedReply([]), viewer: OTHER }), /Invalid league feed/);
  await assert.rejects(readFeed({ ...feedReply([]), leagueId: 'sean-troy-luke' }), /Invalid league feed/);
  const full = await readFeed(feedReply([post('joined', {})]), { limit: 1 });
  assert.deepEqual(full.next, { at: '2026-10-26T18:00:00Z', id: POST });
});

test('the feed routes check every body first, and GTL_FEATURE_OFF=feed stops them before the database', async () => {
  for (const [route, body] of [['/league/feed', { limit: 0 }], ['/league/feed', { leagueId: 'g_x' }], ['/league/feed', { before: { at: 'x', id: POST } }], ['/league/feed', { viewer: OTHER }],
    ['/league/comments', {}], ['/league/comments', { postId: POST, limit: 101 }], ['/league/reactors', { postId: 'x' }],
    ['/league/share-result', { requestId: POST, season: 2026, week: 8, mode: 'guess_spread', gameId: 'sea-den' }],
    ['/league/share-result', { requestId: POST, season: 2026, week: 8, mode: 'guess_points', gameId: 'SEA-DEN' }],
    ['/league/share-result', { requestId: POST, season: 2026, week: 8, mode: 'guess_spread', gameId: 'SEA-DEN', userId: OTHER }]]) {
    await assert.rejects(handleFeed({ route, body, user: USER, service: never }), error => error instanceof FeedError && error.status === 400, `${route} ${JSON.stringify(body)}`);
  }
  for (const [route, body] of [['/league/feed', {}], ['/league/comments', { postId: POST }], ['/league/reactors', { postId: POST }],
    ['/league/share-result', { requestId: POST, season: 2026, week: 8, mode: 'guess_spread', gameId: 'SEA-DEN' }]]) {
    await assert.rejects(handleFeed({ route, body, user: USER, service: never, featureOff: new Set(['feed']) }), error => error instanceof FeedError && error.status === 503, route);
  }
  // The reactions switch leaves the readers alone, and the feed switch leaves reactions alone.
  const calls = [];
  const service = { rpc: async name => { calls.push(name); return name === 'gtl_react_feed' ? { postId: POST, counts: {}, mine: null, changed: false } : feedReply([]); } };
  await handleFeed({ route: '/league/feed', body: {}, user: USER, service, featureOff: new Set(['reactions']) });
  await handleFeed({ route: '/league/react', body: { postId: POST, reaction: null }, user: USER, service, featureOff: new Set(['feed']) });
  assert.deepEqual(calls, ['gtl_read_league_feed', 'gtl_react_feed']);
});

test('comments, reactors and share-result rebuild their replies from known keys', async () => {
  const comments = await handleFeed({ route: '/league/comments', body: { postId: POST, limit: 2 }, user: USER, service: { rpc: async (name, args) => {
    assert.deepEqual([name, args.p_limit, args.p_before_at], ['gtl_read_post_comments', 2, null]);
    return { postId: POST, total: 3, comments: [{ id: OTHER, userId: OTHER, body: 'One', createdAt: '2026-10-26T18:00:00Z', secret: 1 }, { id: 'x', userId: OTHER, body: 'bad id', createdAt: '2026-10-26T18:01:00Z' }] };
  } } });
  assert.deepEqual(comments, { postId: POST, total: 3, comments: [{ id: OTHER, userId: OTHER, body: 'One', createdAt: '2026-10-26T18:00:00Z' }], next: { at: '2026-10-26T18:00:00Z', id: OTHER } });
  const reactors = await handleFeed({ route: '/league/reactors', body: { postId: POST }, user: USER, service: { rpc: async () => ({ postId: POST, reactors: [
    { userId: OTHER, reaction: 'fire', reactedAt: '2026-10-26T18:00:00Z', email: 'x@example.invalid' }, { userId: OTHER, reaction: 'heart', reactedAt: '2026-10-26T18:00:00Z' }] }) } });
  assert.deepEqual(reactors, { postId: POST, reactors: [{ userId: OTHER, reaction: 'fire', reactedAt: '2026-10-26T18:00:00Z' }] });
  const shared = await handleFeed({ route: '/league/share-result', body: { requestId: POST, leagueId: 'sean-troy-luke', season: 2026, week: 8, mode: 'guess_total', gameId: 'SEA-DEN' }, user: USER,
    service: { rpc: async (name, args) => { assert.equal(name, 'gtl_share_result'); assert.equal(args.p_league, 'sean-troy-luke'); return { postId: POST, replayed: false, extra: 1 }; } } });
  assert.deepEqual(shared, { postId: POST, replayed: false });
  assert.deepEqual([providerFeedError('GTL_LEAGUE_MEMBER').status, providerFeedError('GTL_RESULT_UNAVAILABLE').status], [403, 409]);
});
