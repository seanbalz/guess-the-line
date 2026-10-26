import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ALL, HOSTED } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { sendBallot, serviceSql, storeLines } from './helpers/guess-week.mjs';
import { assertNoLeak, leakScan, lineSecrets, pickSecrets } from './helpers/leak-scan.mjs';

// M-22 (20261026132000_gtl_league_feed.sql, redesign build plan stage 62): the league feed reader, comments, reactors and
// result sharing. Contracts: no embed gives a viewer a line or another member's hidden pick (the leak scan, before and after
// the viewer locks in); a shared result shows its guess and points only once that game and market is open to the viewer;
// a group's posts reach its members only, and the Community reader never lists them; keyset paging returns every post once
// when posts share a timestamp; comments are accepted only on a post visible now; one share per result and league;
// existing routes answer as before while M-22 is missing. Local PGlite only, fixture values only.
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
// Unusual half points (tests/helpers/leak-scan.mjs): nothing else in a reply can equal them.
const LINES = { spread: [-11.5, 13.5], total: [58.5, 31.5] };
const TROY = { spread: [-6.5, 2.5], total: [37.5, 61.5] };
const LUKE = { spread: [-1.5, 4.5] };
const ZED = '00000000-0000-4000-8000-000000000009';

async function fixture(t, options = {}) {
  const world = await createCommunityWorld({ migrations: ALL, troyBallots: false, ...options });
  t.after(() => world.db.close());
  const { db, state } = world, ids = state.games.map(g => g.id), call = serviceSql(db);
  const map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  const read = async (account, route, body = {}) => {
    const reply = await world.api(account, route, body);
    assert.equal(reply.status, 200, `${route}: ${JSON.stringify(reply.body)}`);
    return reply.body;
  };
  const addZed = async () => {
    await db.query('insert into auth.users values($1)', [ZED]);
    await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Zed Fixture')", [ZED]);
  };
  const post = async (kind, { actor = ACCOUNTS.sean.id, at = new Date(Date.now() - 60_000).toISOString(), league = null, payload = {}, key = `${kind}:${randomUUID()}`, season = state.league.season, week = state.league.week, mode = null } = {}) =>
    (await db.query('insert into public.gtl_feed_posts(actor_id,kind,season,week,mode,payload,dedupe_key,created_at,league_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id',
      [actor, kind, season, week, mode, payload, key, at, league])).rows[0].id;
  return { ...world, ids, map, read, call, addZed, post };
}

test('the leak scan finds no line and no hidden pick in any feed embed, comment list or reactor list; a viewer\'s lock-in opens exactly that market', { skip }, async t => {
  const f = await fixture(t);
  const { map } = f, { season, week } = f.state.league;
  await storeLines(f.db, f.state, { spread: map(LINES.spread), total: map(LINES.total) });
  await sendBallot(f, 'troy', 'guess_spread', map(TROY.spread));
  await sendBallot(f, 'troy', 'guess_total', map(TROY.total));
  // Troy shares a scored result in each market (his own locked-in, scored guesses).
  for (const mode of ['guess_spread', 'guess_total']) {
    const shared = await f.read('troy', 'league/share-result', { requestId: randomUUID(), season, week, mode, gameId: f.ids[0] });
    assert.equal(shared.replayed, false);
  }
  const posts = await f.read('troy', 'league/feed');
  const ballotPosts = posts.posts.filter(p => p.kind === 'ballot_submitted' && p.actorId === ACCOUNTS.troy.id);
  assert.equal(ballotPosts.length, 2);
  for (const p of ballotPosts) await f.read('troy', 'community/comment', { requestId: randomUUID(), postId: p.id, body: 'Locked early this week' });
  const secrets = (troyMarkets = ['spread', 'total'], lineMarkets = ['spread', 'total']) => [
    ...lineMarkets.flatMap(market => lineSecrets(map(LINES[market]), { market })),
    ...troyMarkets.flatMap(market => pickSecrets(map(TROY[market]), { market, owner: 'troy' })),
  ];
  const scan = async (account, secretList) => {
    const feed = await f.read(account, 'league/feed');
    assertNoLeak(feed, { viewer: ACCOUNTS[account].id, secrets: secretList }, '/league/feed');
    for (const p of feed.posts) {
      assertNoLeak(await f.read(account, 'league/comments', { postId: p.id }), { viewer: ACCOUNTS[account].id, secrets: secretList }, '/league/comments');
      assertNoLeak(await f.read(account, 'league/reactors', { postId: p.id }), { viewer: ACCOUNTS[account].id, secrets: secretList }, '/league/reactors');
    }
    return feed;
  };
  // Luke has locked in nothing: no line, no Troy pick, and both shared results are hidden.
  let feed = await scan('luke', secrets());
  const results = mode => feed.posts.find(p => p.kind === 'result_shared' && p.mode === mode);
  assert.deepEqual(results('guess_spread').embed, { gameId: f.ids[0], visible: false });
  assert.deepEqual(results('guess_total').embed, { gameId: f.ids[0], visible: false });
  const lukeBallot = feed.posts.find(p => p.kind === 'ballot_submitted' && p.mode === 'guess_spread');
  assert.deepEqual([lukeBallot.embed.picks, lukeBallot.embed.hiddenGames], [{}, [...f.ids].sort()]);
  // The scan is not vacuous: Troy's own feed carries his picks and his results, cleared only by the owner exemption.
  const own = await f.read('troy', 'league/feed');
  assert.ok(leakScan(own, { viewer: ACCOUNTS.luke.id, secrets: pickSecrets(map(TROY.spread), { market: 'spread', owner: 'troy' }) }).length >= 2);
  assert.deepEqual(leakScan(own, { viewer: ACCOUNTS.troy.id, secrets: secrets(['spread', 'total'], []) }), []);
  // Luke sends his Spread: Troy's Spread picks and Spread result open to him (pick and points); his Total stays hidden.
  await sendBallot(f, 'luke', 'guess_spread', map(LUKE.spread));
  feed = await scan('luke', secrets(['total'], ['total']));
  assert.equal(results('guess_spread').embed.visible, true);
  assert.equal(results('guess_spread').embed.pick, TROY.spread[0]);
  assert.equal(results('guess_spread').embed.points, Math.max(0, 10 - 2 * Math.abs(TROY.spread[0] - LINES.spread[0])));
  assert.deepEqual(results('guess_total').embed, { gameId: f.ids[0], visible: false });
  const troySpread = feed.posts.find(p => p.kind === 'ballot_submitted' && p.mode === 'guess_spread' && p.actorId === ACCOUNTS.troy.id);
  assert.deepEqual([troySpread.embed.picks, troySpread.embed.hiddenGames], [map(TROY.spread), []]);
  assert.deepEqual(troySpread.comments.map(c => c.body), ['Locked early this week']);
  assert.equal(troySpread.commentCount, 1);
});

test('a group\'s posts reach its members only; a group feed lists its own posts, system posts and its roster\'s Community posts', { skip }, async t => {
  const f = await fixture(t);
  await f.addZed();
  const created = await f.read('luke', 'leagues', { name: 'Fixture Crew', format: 'group', practice: false, requestId: randomUUID() });
  const crew = created.leagueId;
  const groupPost = await f.post('weekly_recap', { actor: ACCOUNTS.luke.id, league: crew });
  const lukePost = await f.post('joined', { actor: ACCOUNTS.luke.id, key: 'joined:fixture-luke' });
  const troyPost = await f.post('bet_posted', { actor: ACCOUNTS.troy.id, payload: { entryId: 'e1', action: 'create', line: -11.5 } });
  const kickoff = await f.post('kickoff', { payload: { kickoff: new Date().toISOString(), games: f.ids } });
  const community = (await f.read('luke', 'league/feed')).posts.map(p => p.id);
  assert.ok(!community.includes(groupPost), 'the Community feed never lists a group post');
  assert.ok([lukePost, troyPost, kickoff].every(id => community.includes(id)));
  const group = await f.read('luke', 'league/feed', { leagueId: crew });
  const ids = group.posts.map(p => p.id);
  assert.ok(ids.includes(groupPost) && ids.includes(lukePost) && ids.includes(kickoff), 'its own post, a roster member\'s post and the kickoff post');
  assert.ok(!ids.includes(troyPost), 'not the Community post of someone outside the group');
  assert.deepEqual(group.roster, [ACCOUNTS.luke.id]);
  assert.deepEqual(group.posts.find(p => p.id === troyPost), undefined);
  // A Bet Tracker post carries its entry id only: no line from its payload.
  assert.deepEqual((await f.read('luke', 'league/feed')).posts.find(p => p.id === troyPost).embed, { entryId: 'e1' });
  // Outsiders: Zed and Troy get 403 for the group feed and cannot comment or react on its post; the old reader omits it.
  for (const account of ['troy']) {
    assert.equal((await f.api(account, 'league/feed', { leagueId: crew })).status, 403);
    assert.equal((await f.api(account, 'community/comment', { requestId: randomUUID(), postId: groupPost, body: 'hi' })).status, 400);
    assert.equal((await f.api(account, 'league/comments', { postId: groupPost })).status, 400);
    assert.equal((await f.api(account, 'league/reactors', { postId: groupPost })).status, 400);
    assert.equal((await f.read(account, 'community/read', {})).posts.some(p => p.id === groupPost), false);
  }
  assert.deepEqual((await f.call('gtl_read_league_feed', { p_user: ZED, p_league: null, p_before_at: null, p_before_id: null, p_limit: 50, p_now: null })).posts.some(p => p.id === groupPost), false);
  await assert.rejects(f.call('gtl_read_league_feed', { p_user: ZED, p_league: crew, p_before_at: null, p_before_id: null, p_limit: 50, p_now: null }), /GTL_LEAGUE_MEMBER/);
  // A member comments on the group post; the comment shows in the group feed's preview.
  await f.read('luke', 'community/comment', { requestId: randomUUID(), postId: groupPost, body: 'Crew only' });
  assert.deepEqual((await f.read('luke', 'league/feed', { leagueId: crew })).posts.find(p => p.id === groupPost).comments.map(c => c.body), ['Crew only']);
});

test('keyset paging returns every post exactly once when posts share a timestamp; a post dated later shows only from its time', { skip }, async t => {
  const f = await fixture(t);
  const at = new Date(Date.now() - 3_600_000).toISOString();
  const same = [];
  for (let i = 0; i < 7; i++) same.push(await f.post('joined', { actor: ACCOUNTS.troy.id, at, key: `same:${i}` }));
  const future = await f.post('kickoff', { at: new Date(Date.now() + 3_600_000).toISOString(), payload: { kickoff: new Date(Date.now() + 3_600_000).toISOString(), games: [f.ids[0]] } });
  const seen = [];
  let before;
  for (let page = 0; page < 20; page++) {
    const reply = await f.read('luke', 'league/feed', { limit: 2, ...(before ? { before } : {}) });
    seen.push(...reply.posts.map(p => p.id));
    if (!reply.next) break;
    before = reply.next;
  }
  assert.equal(new Set(seen).size, seen.length, 'no post twice');
  for (const id of same) assert.ok(seen.includes(id), 'every post at the shared time');
  assert.ok(!seen.includes(future), 'a kickoff post before its kickoff');
  // Order: newest first, ties by id descending.
  const order = seen.filter(id => same.includes(id));
  assert.deepEqual(order, [...same].sort().reverse());
  // Before its time it takes no comment either.
  assert.equal((await f.api('luke', 'community/comment', { requestId: randomUUID(), postId: future, body: 'early' })).status, 400);
  for (const body of [{ limit: 0 }, { limit: 51 }, { before: { at } }, { before: { id: same[0] } }, { leagueId: 'nope' }, { extra: 1 }]) assert.equal((await f.api('luke', 'league/feed', body)).status, 400, JSON.stringify(body));
});

test('comments page newest first and read oldest first; reactors list one reaction per person', { skip }, async t => {
  const f = await fixture(t);
  const target = await f.post('week_published', { payload: { games: 2, deadline: f.state.league.deadline } });
  for (let i = 0; i < 5; i++) await f.read(i % 2 ? 'troy' : 'luke', 'community/comment', { requestId: randomUUID(), postId: target, body: `Comment ${i}` });
  const first = await f.read('sean', 'league/comments', { postId: target, limit: 3 });
  assert.equal(first.total, 5);
  assert.deepEqual(first.comments.map(c => c.body), ['Comment 2', 'Comment 3', 'Comment 4']);
  const rest = await f.read('sean', 'league/comments', { postId: target, limit: 3, before: first.next });
  assert.deepEqual(rest.comments.map(c => c.body), ['Comment 0', 'Comment 1']);
  assert.equal(rest.next, null);
  const feedPost = (await f.read('sean', 'league/feed')).posts.find(p => p.id === target);
  assert.deepEqual([feedPost.commentCount, feedPost.comments.map(c => c.body)], [5, ['Comment 3', 'Comment 4']], 'the newest two in the feed');
  assert.equal(feedPost.embed.games, 2);
  assert.equal(Date.parse(feedPost.embed.deadline), Date.parse(f.state.league.deadline));
  await f.read('luke', 'league/react', { postId: target, reaction: 'fire' });
  await f.read('troy', 'league/react', { postId: target, reaction: 'clap' });
  await f.read('luke', 'league/react', { postId: target, reaction: 'bullseye' });
  const reactors = await f.read('sean', 'league/reactors', { postId: target });
  assert.deepEqual(reactors.reactors.map(r => [r.userId, r.reaction]).sort(), [[ACCOUNTS.luke.id, 'bullseye'], [ACCOUNTS.troy.id, 'clap']].sort());
  assert.deepEqual((await f.read('sean', 'league/feed')).posts.find(p => p.id === target).reactions, { counts: { bullseye: 1, clap: 1 }, total: 2, mine: null });
});

test('share a result: only your own scored, locked-in guess; one post per result and league, replayable; a group share needs membership', { skip }, async t => {
  const f = await fixture(t);
  const { map } = f, { season, week } = f.state.league;
  const share = (account, body) => f.api(account, 'league/share-result', { requestId: randomUUID(), season, week, mode: 'guess_spread', gameId: f.ids[0], ...body });
  assert.deepEqual([(await share('troy', {})).status, (await share('troy', {})).body.error], [409, 'That result is not scored yet, so nothing was posted.'], 'nothing locked in');
  await storeLines(f.db, f.state, { spread: map(LINES.spread), total: map(LINES.total) });
  await sendBallot(f, 'troy', 'guess_spread', map(TROY.spread));
  const first = await share('troy', {});
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const again = await share('troy', {});
  assert.deepEqual(again.body, { postId: first.body.postId, replayed: true }, 'one post per result and league');
  assert.equal((await share('troy', { mode: 'guess_total' })).status, 409, 'the other market is not locked in');
  assert.equal((await share('luke', {})).status, 409, 'not your guess');
  assert.equal((await share('troy', { leagueId: `g_${'0'.repeat(32)}` })).status, 403, 'not a member of that league');
  const group = await share('troy', { leagueId: 'sean-troy-luke' });
  assert.equal(group.body.replayed, false, 'the same result in a group is its own post');
  const rows = (await f.db.query("select kind,league_id,payload->>'gameId' game from public.gtl_feed_posts where kind='result_shared' order by league_id nulls first")).rows;
  assert.deepEqual(rows, [{ kind: 'result_shared', league_id: null, game: f.ids[0] }, { kind: 'result_shared', league_id: 'sean-troy-luke', game: f.ids[0] }]);
  for (const body of [{ gameId: 'nope' }, { mode: 'guess_points' }, { requestId: 'x' }, { season: 1999 }]) assert.equal((await share('troy', body)).status, 400, JSON.stringify(body));
});

test('a kickoff post lists who is in per game (no number) and how many bets; a group feed counts its roster only', { skip }, async t => {
  const f = await fixture(t);
  const { map } = f;
  await storeLines(f.db, f.state, { spread: map(LINES.spread), total: map(LINES.total) });
  await sendBallot(f, 'troy', 'guess_spread', map(TROY.spread));
  const created = await f.read('luke', 'leagues', { name: 'Fixture Crew', format: 'group', practice: false, requestId: randomUUID() });
  const kickoff = await f.post('kickoff', { payload: { kickoff: f.state.games[0].kickoff, games: [f.ids[0], 'bad id'] } });
  const community = (await f.read('luke', 'league/feed')).posts.find(p => p.id === kickoff);
  assert.deepEqual(community.embed.games, [{ gameId: f.ids[0], in: [ACCOUNTS.troy.id], bets: 0 }]);
  assertNoLeak(community, { viewer: ACCOUNTS.luke.id, secrets: [...lineSecrets(map(LINES.spread), { market: 'spread' }), ...pickSecrets(map(TROY.spread), { market: 'spread', owner: 'troy' })] }, 'kickoff');
  const group = (await f.read('luke', 'league/feed', { leagueId: created.leagueId })).posts.find(p => p.id === kickoff);
  assert.deepEqual(group.embed.games, [{ gameId: f.ids[0], in: [], bets: 0 }], 'Troy is not in Luke\'s crew');
});

test('every M-22 function is service-only; on the hosted schema the new routes answer 503 and the old feed routes answer as before', { skip }, async t => {
  const f = await fixture(t);
  const fns = ['gtl_feed_league_access(uuid,text)', 'gtl_feed_in_league(text,uuid,text,text)', 'gtl_feed_embed(uuid,uuid,text,timestamptz)',
    'gtl_read_league_feed(uuid,text,timestamptz,uuid,integer,timestamptz)', 'gtl_read_post_comments(uuid,uuid,timestamptz,uuid,integer,timestamptz)',
    'gtl_read_post_reactors(uuid,uuid,timestamptz)', 'gtl_share_result(uuid,uuid,text,integer,integer,text,text,timestamptz)', 'gtl_comment_feed(uuid,uuid,uuid,text)'];
  for (const fn of fns) {
    const row = (await f.db.query(`select has_function_privilege('anon','public.${fn}','execute') anon, has_function_privilege('authenticated','public.${fn}','execute') auth, has_function_privilege('service_role','public.${fn}','execute') service`)).rows[0];
    assert.deepEqual(row, { anon: false, auth: false, service: true }, fn);
  }
  const hosted = await createCommunityWorld({ migrations: HOSTED });
  t.after(() => hosted.db.close());
  const post = (await hosted.db.query("select id from public.gtl_feed_posts where kind='ballot_submitted' limit 1")).rows[0].id;
  for (const [route, body] of [['league/feed', {}], ['league/comments', { postId: post }], ['league/reactors', { postId: post }],
    ['league/share-result', { requestId: randomUUID(), season: 2026, week: 5, mode: 'guess_spread', gameId: 'TB-DAL' }]]) {
    assert.equal((await hosted.api('luke', route, body)).status, 503, route);
  }
  assert.equal((await hosted.api('luke', 'community/read', {})).status, 200);
  const comment = await hosted.api('luke', 'community/comment', { requestId: randomUUID(), postId: post, body: 'Still works' });
  assert.equal(comment.status, 200);
});
