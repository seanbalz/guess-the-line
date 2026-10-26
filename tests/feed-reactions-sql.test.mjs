import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL, HOSTED, migrationSql } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { REACTIONS } from '../cloud/feed.mjs';

// M-21 (20261026131000_gtl_feed_reactions.sql, redesign build plan stage 61): append-only reactions. Contracts: each
// person's latest event is their one current reaction; an old like reads as a thumbs up; nothing is updated or deleted
// (an unlike or a take-back adds an event); a bad key, a hidden post, a future post or a removed member is refused; the
// old heart (/community/like and /community/read's likes) counts every current reaction; group-scoped posts never reach
// the Community reader; the off switch stops the new writer only. Local PGlite only, fixture accounts only.
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const M21 = ALL.find(file => file.startsWith('20261026131000_'));

async function world(t, options = {}) {
  const w = await createCommunityWorld({ migrations: ALL, ...options });
  t.after(() => w.db.close());
  const posts = (await w.db.query("select id from public.gtl_feed_posts where kind='ballot_submitted' order by mode")).rows.map(row => row.id);
  const events = async post => (await w.db.query('select user_id,reaction,source from public.gtl_feed_reaction_events where post_id=$1 order by seq', [post])).rows;
  const feedPost = async (account, post) => (await w.api(account, 'community/read', {})).body.posts.find(p => p.id === post);
  return { ...w, posts, events, feedPost };
}

test('M-21 sits after M-13 and before nothing it needs; it replaces exactly gtl_like_feed and gtl_read_community', () => {
  assert.ok(M21 && ALL.indexOf(M21) > ALL.findIndex(f => f.startsWith('20261026130000_')), 'after M-13 (league_id)');
  const sql = migrationSql(M21);
  assert.deepEqual([...sql.matchAll(/^-- replaces public\.(\w+) md5/gm)].map(m => m[1]), ['gtl_like_feed', 'gtl_read_community']);
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /\b(?:delete\s+from|update\s+public|truncate|drop\s+(?:table|function|index))\b/i, 'no row is deleted or updated, nothing is dropped');
});

test('one current reaction per person, changed by adding events; the same reaction twice adds nothing; a bad key is refused', { skip }, async t => {
  const w = await world(t);
  const [post] = w.posts;
  const react = (account, reaction) => w.api(account, 'league/react', { postId: post, reaction });
  let reply = await react('luke', 'fire');
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  assert.deepEqual(reply.body, { postId: post, counts: { fire: 1 }, total: 1, mine: 'fire', changed: true });
  reply = await react('luke', 'laughing');
  assert.deepEqual(reply.body, { postId: post, counts: { laughing: 1 }, total: 1, mine: 'laughing', changed: true }, 'the latest wins: one reaction, not two');
  reply = await react('luke', 'laughing');
  assert.deepEqual([reply.body.changed, reply.body.total], [false, 1], 'a replay changes nothing');
  reply = await react('sean', 'laughing');
  assert.deepEqual(reply.body, { postId: post, counts: { laughing: 2 }, total: 2, mine: 'laughing', changed: true });
  reply = await react('luke', null);
  assert.deepEqual(reply.body, { postId: post, counts: { laughing: 1 }, total: 1, mine: null, changed: true }, 'a take-back');
  assert.deepEqual((await w.events(post)).map(e => [e.user_id, e.reaction, e.source]), [
    [ACCOUNTS.luke.id, 'fire', 'react'], [ACCOUNTS.luke.id, 'laughing', 'react'], [ACCOUNTS.sean.id, 'laughing', 'react'], [ACCOUNTS.luke.id, null, 'react'],
  ], 'every change is kept; nothing is overwritten');
  for (const key of REACTIONS) assert.equal((await react('troy', key)).body.mine, key, key);
  for (const bad of ['heart', 'THUMBS_UP', '', 'thumbs up', '👍']) {
    const refused = await react('luke', bad);
    assert.equal(refused.status, 400, bad);
  }
  for (const body of [{ postId: post }, { postId: post, reaction: 'fire', extra: 1 }, { postId: 'not-a-uuid', reaction: 'fire' }]) assert.equal((await w.api('luke', 'league/react', body)).status, 400);
  // The database refuses on its own too (a key outside the six, or a direct update or delete).
  await assert.rejects(w.db.query("insert into public.gtl_feed_reaction_events(post_id,user_id,reaction,source) values($1,$2,'heart','react')", [post, ACCOUNTS.luke.id]), /check/);
});

test('an old like reads as a thumbs up and its row is never deleted; the old heart counts any reaction and an unlike adds an event', { skip }, async t => {
  const w = await world(t);
  const [post, other] = w.posts;
  // A like saved before M-21 (the old body wrote straight into gtl_feed_likes).
  await w.db.query('insert into public.gtl_feed_likes(post_id,user_id,created_at) values($1,$2,$3)', [post, ACCOUNTS.sean.id, '2026-10-09T18:00:00Z']);
  let reply = await w.api('luke', 'league/react', { postId: post, reaction: 'fire' });
  assert.deepEqual(reply.body.counts, { thumbs_up: 1, fire: 1 }, 'Sean\'s old like is a thumbs up');
  // The old app: /community/read's likes counts both; likedByMe says the viewer has any reaction.
  assert.deepEqual([(await w.feedPost('luke', post)).likes, (await w.feedPost('luke', post)).likedByMe], [2, true]);
  assert.deepEqual([(await w.feedPost('troy', post)).likes, (await w.feedPost('troy', post)).likedByMe], [2, false]);
  // Liking with a fire already set keeps the fire (no event); unliking takes it back with a null event.
  reply = await w.api('luke', 'community/like', { postId: post, like: true });
  assert.deepEqual(reply.body, { likes: 2, likedByMe: true });
  assert.equal((await w.events(post)).length, 1, 'a like over a current reaction adds nothing');
  reply = await w.api('sean', 'community/like', { postId: post, like: false });
  assert.deepEqual(reply.body, { likes: 1, likedByMe: false });
  assert.equal((await w.db.query('select count(*)::int n from public.gtl_feed_likes where post_id=$1', [post])).rows[0].n, 1, 'the old like row stays');
  assert.deepEqual((await w.events(post)).at(-1), { user_id: ACCOUNTS.sean.id, reaction: null, source: 'like' });
  // A new like from someone with no reaction is a thumbs up event; it shows in the new summary.
  reply = await w.api('troy', 'community/like', { postId: other, like: true });
  assert.deepEqual(reply.body, { likes: 1, likedByMe: true });
  assert.deepEqual((await w.events(other)), [{ user_id: ACCOUNTS.troy.id, reaction: 'thumbs_up', source: 'like' }]);
  reply = await w.api('troy', 'league/react', { postId: other, reaction: 'thumbs_up' });
  assert.deepEqual([reply.body.changed, reply.body.counts], [false, { thumbs_up: 1 }]);
  // Nothing may update or delete: no grant for it, and the old like table lost its delete grant.
  const grants = (await w.db.query("select table_name,privilege_type from information_schema.role_table_grants where table_schema='public' and grantee='service_role' and table_name in ('gtl_feed_reaction_events','gtl_feed_likes') order by table_name,privilege_type")).rows;
  assert.deepEqual(grants.map(g => `${g.table_name}:${g.privilege_type}`), ['gtl_feed_likes:INSERT', 'gtl_feed_likes:SELECT', 'gtl_feed_reaction_events:INSERT', 'gtl_feed_reaction_events:SELECT']);
});

test('only a post the member may see now takes a reaction: not a group post of another league, not a post dated in the future, not as a removed member', { skip }, async t => {
  const w = await world(t);
  const [post] = w.posts;
  const at = new Date(Date.now() - 60_000).toISOString(), later = new Date(Date.now() + 3_600_000).toISOString();
  const group = (await w.db.query("insert into public.gtl_feed_posts(actor_id,kind,dedupe_key,created_at,league_id) values($1,'weekly_recap','recap:fixture',$2,'sean-troy-luke') returning id", [ACCOUNTS.sean.id, at])).rows[0].id;
  const future = (await w.db.query("insert into public.gtl_feed_posts(actor_id,kind,dedupe_key,created_at) values($1,'kickoff','kickoff:fixture',$2) returning id", [ACCOUNTS.sean.id, later])).rows[0].id;
  // Luke is a sean-troy-luke member; a fourth account in the Community only is not.
  await w.db.query('insert into auth.users values($1)', ['00000000-0000-4000-8000-000000000009']);
  await w.db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Zed Fixture')", ['00000000-0000-4000-8000-000000000009']);
  const as = async (userId, args) => {
    try { return await w.db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query('select public.gtl_react_feed($1,$2,$3,null) value', [userId, ...args])).rows[0].value; }); }
    catch (error) { return { error: error.message }; }
  };
  assert.equal((await as(ACCOUNTS.luke.id, [group, 'clap'])).mine, 'clap', 'a member of the post\'s league');
  assert.deepEqual(await as('00000000-0000-4000-8000-000000000009', [group, 'clap']), { error: 'GTL_COMMUNITY_INVALID' }, 'not a member of that league');
  assert.equal((await w.api('luke', 'league/react', { postId: future, reaction: 'fire' })).status, 400, 'a kickoff post before its kickoff');
  assert.equal((await w.api('luke', 'community/like', { postId: future, like: true })).status, 400, 'the old heart too');
  // The Community reader lists no group post, whoever reads it.
  for (const account of ['luke', 'troy', 'sean']) assert.equal((await w.api(account, 'community/read', {})).body.posts.some(p => p.id === group), false, account);
  // A removed member cannot react (D-23: their earlier reactions still count).
  assert.equal((await w.api('troy', 'league/react', { postId: post, reaction: 'grimace' })).status, 200);
  assert.equal((await w.api('sean', 'community/member', { userId: ACCOUNTS.troy.id, member: false })).status, 200);
  assert.equal((await w.api('troy', 'league/react', { postId: post, reaction: 'fire' })).status, 403);
  assert.deepEqual((await w.api('luke', 'league/react', { postId: post, reaction: null })).body.counts, { grimace: 1 }, 'a removed member\'s reaction still counts');
});

test('the old reader lists only the kinds the old app draws, so a page of 30 stays full and paging reaches every old post', { skip }, async t => {
  const w = await world(t, { troyBallots: false });
  const base = Date.now() - 10 * 3_600_000;
  // 40 old-kind posts, each followed by a post of a kind only the new feed draws (kickoff, result_shared).
  for (let i = 0; i < 40; i++) {
    await w.db.query("insert into public.gtl_feed_posts(actor_id,kind,dedupe_key,created_at) values($1,'joined',$2,$3)", [ACCOUNTS.troy.id, `old:${i}`, new Date(base + i * 60_000).toISOString()]);
    await w.db.query('insert into public.gtl_feed_posts(actor_id,kind,dedupe_key,created_at) values($1,$2,$3,$4)', [ACCOUNTS.sean.id, i % 2 ? 'kickoff' : 'result_shared', `new:${i}`, new Date(base + i * 60_000 + 1000).toISOString()]);
  }
  const first = await w.api('luke', 'community/read', {});
  assert.equal(first.body.posts.length, 30, 'a full page of posts the old app draws');
  const second = await w.api('luke', 'community/read', { before: first.body.posts.at(-1).createdAt });
  const seen = new Set([...first.body.posts, ...second.body.posts].map(p => p.id));
  const old = (await w.db.query("select id from public.gtl_feed_posts where kind in ('joined','ballot_submitted','bet_posted','bet_settled','week_published','points_played','points_final')")).rows;
  assert.deepEqual(old.filter(row => !seen.has(row.id)), [], 'two pages reach every old post');
  // The list is cloud/community.mjs's KINDS: the kinds normalize() keeps.
  const { readFileSync } = await import('node:fs');
  const kinds = readFileSync(new URL('../cloud/community.mjs', import.meta.url), 'utf8').match(/const KINDS = \[([^\]]*)\]/)[1].match(/'([a-z_]+)'/g).map(k => k.slice(1, -1));
  const listed = migrationSql(M21).match(/and f\.kind in \(([^)]*)\)/)[1].match(/'([a-z_]+)'/g).map(k => k.slice(1, -1));
  assert.deepEqual(listed.sort(), kinds.sort());
});

test('on the hosted schema (no M-21) /league/react answers 503 and /community/like works exactly as before', { skip }, async t => {
  const w = await createCommunityWorld({ migrations: HOSTED });
  t.after(() => w.db.close());
  const post = (await w.db.query("select id from public.gtl_feed_posts where kind='ballot_submitted' limit 1")).rows[0].id;
  const refused = await w.api('luke', 'league/react', { postId: post, reaction: 'fire' });
  assert.deepEqual([refused.status, refused.body.error], [503, 'Reactions are not available right now. Nothing was changed.']);
  assert.deepEqual((await w.api('luke', 'community/like', { postId: post, like: true })).body, { likes: 1, likedByMe: true });
  assert.deepEqual((await w.api('luke', 'community/like', { postId: post, like: false })).body, { likes: 0, likedByMe: false });
});
