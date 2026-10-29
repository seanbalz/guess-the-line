import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL, HOSTED, migrationSql } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';

// M-13 (20261026130000_gtl_feed_kinds.sql, redesign build plan stage 48): one kind-check swap to the final list and a
// nullable league_id. Contracts: every row written before it stays valid and unchanged; each new kind inserts; a post can
// name only a real league; the old reader and cloud/community.mjs normalize() ignore the new kinds; rerunning changes
// nothing. Local PGlite only, fixture accounts only.
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const M13 = ALL.find(file => file.startsWith('20261026130000_'));
// M-21, M-22, M-23, M-25, M-26, M-27, M-28 and D-61 odds were applied after M-13 on October 27, 2026, and D-59 on October 28;
// BEFORE_M13 is the hosted schema M-13 was applied to.
const AFTER_M13 = ['20261026131000_', '20261026132000_', '20261026133000_', '20261026220000_', '20261026230000_', '20261026231000_',
  '20261026233000_', '20261026234000_', '20261026235000_', '20261027160000_', '20261028120000_', '20261028181000_', '20261028190000_'];
const BEFORE_M13 = HOSTED.filter(file => file < M13);
const OLD_KINDS = ['joined', 'ballot_submitted', 'bet_posted', 'bet_settled', 'week_published', 'points_played', 'points_final'];
const NEW_KINDS = ['bet_shared', 'challenge_offered', 'challenge_matched', 'challenge_settled', 'kickoff', 'bets_week_settled',
  'badge_earned', 'streak_milestone', 'weekly_recap', 'result_shared', 'season_champion'];
const insert = (db, kind, key, extra = {}) => db.query('insert into public.gtl_feed_posts(actor_id,kind,payload,dedupe_key,created_at,league_id) values($1,$2,$3,$4,$5,$6)',
  [extra.actor ?? ACCOUNTS.troy.id, kind, extra.payload ?? {}, key, extra.at ?? '2026-10-20T18:00:00Z', extra.league ?? null]);
const insertOld = (db, kind, key) => db.query('insert into public.gtl_feed_posts(actor_id,kind,payload,dedupe_key,created_at) values($1,$2,$3,$4,$5)',
  [ACCOUNTS.troy.id, kind, kind === 'points_final' ? { winners: [{ userId: ACCOUNTS.troy.id, points: 30.5 }], house: null, max: 50 } : {}, key, '2026-10-20T18:00:00Z']);
const snapshot = async db => (await db.query('select id,actor_id,kind,season,week,mode,payload,dedupe_key,created_at from public.gtl_feed_posts order by dedupe_key')).rows;
const check = async db => (await db.query("select pg_get_constraintdef(oid) def, convalidated from pg_constraint where conrelid='public.gtl_feed_posts'::regclass and conname='gtl_feed_posts_kind_check'")).rows;

test('M-13 is the file the ledger names, after every file on main, and carries no function, trigger, grant or row change', () => {
  assert.ok(M13, 'the M-13 file is in the repo');
  // Hosted since October 27, 2026 (RELEASE_2026_10_27_FEED_MIGRATIONS.md); only the files applied after it sort later.
  assert.ok(HOSTED.every(file => file <= M13 || AFTER_M13.some(prefix => file.startsWith(prefix))), 'stamped after every file hosted before it');
  const sql = migrationSql(M13).replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sql, /\b(?:create|drop)\s+(?:or\s+replace\s+)?(?:function|trigger|table|index)\b/i);
  assert.doesNotMatch(sql, /\b(?:grant|revoke|insert|update|delete|truncate)\b/i);
  assert.equal((sql.match(/\balter table\b/gi) || []).length, 2, 'one kind-check swap and one column');
});

test('M-13 keeps every earlier row valid and unchanged, then each new kind inserts; it is idempotent', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: BEFORE_M13, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world;
  for (const kind of OLD_KINDS) await insertOld(db, kind, `old:${kind}`);
  // Before M-13 a new kind is refused by the old check and there is no league_id column.
  await assert.rejects(db.query("insert into public.gtl_feed_posts(actor_id,kind,dedupe_key) values($1,'kickoff','before:kickoff')", [ACCOUNTS.troy.id]), /gtl_feed_posts_kind_check/);
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='gtl_feed_posts' and column_name='league_id'")).rows[0].n, 0);
  const before = await snapshot(db);
  assert.ok(before.length >= OLD_KINDS.length, 'one row of every old kind (and the backfilled joined posts)');
  await db.exec(migrationSql(M13));
  assert.deepEqual(await snapshot(db), before, 'no existing row changes');
  const [constraint] = await check(db);
  assert.equal(constraint.convalidated, true, 'the new check is validated against every existing row');
  for (const kind of [...OLD_KINDS, ...NEW_KINDS]) assert.match(constraint.def, new RegExp(`'${kind}'`), kind);
  assert.equal((constraint.def.match(/'[a-z_]+'::text/g) || []).length, OLD_KINDS.length + NEW_KINDS.length, 'the final list and nothing else');
  assert.deepEqual((await db.query('select distinct league_id from public.gtl_feed_posts')).rows, [{ league_id: null }], 'every existing post is a Community post');
  for (const kind of NEW_KINDS) await insert(db, kind, `new:${kind}`);
  await assert.rejects(insert(db, 'score_changed', 'new:unknown'), /gtl_feed_posts_kind_check/, 'a kind outside the final list is still refused');
  // Rerunning the file changes nothing.
  const once = await snapshot(db);
  await db.exec(migrationSql(M13));
  assert.deepEqual(await snapshot(db), once);
  assert.deepEqual((await check(db)).map(row => row.def), [constraint.def]);
  assert.equal((await db.query("select count(*)::int n from pg_constraint where conrelid='public.gtl_feed_posts'::regclass and contype='f' and conname like '%league%'")).rows[0].n, 1, 'one league foreign key');
});

test('league_id names a real league or the Community (null); the grants on posts stay select and insert for service_role only', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: ALL, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world;
  await insert(db, 'weekly_recap', 'recap:group', { league: 'sean-troy-luke' });
  await insert(db, 'kickoff', 'kickoff:community', { actor: ACCOUNTS.sean.id });
  await assert.rejects(insert(db, 'weekly_recap', 'recap:missing', { league: `g_${'f'.repeat(32)}` }), /foreign key/);
  assert.deepEqual((await db.query("select dedupe_key,league_id from public.gtl_feed_posts where dedupe_key in ('recap:group','kickoff:community') order by dedupe_key")).rows,
    [{ dedupe_key: 'kickoff:community', league_id: null }, { dedupe_key: 'recap:group', league_id: 'sean-troy-luke' }]);
  const grants = (await db.query("select grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='gtl_feed_posts' and grantee in ('anon','authenticated','service_role','public') order by grantee,privilege_type")).rows;
  assert.deepEqual(grants, [{ grantee: 'service_role', privilege_type: 'INSERT' }, { grantee: 'service_role', privilege_type: 'SELECT' }]);
});

test('the old reader and the old handler ignore every new kind; old posts read exactly as before', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: BEFORE_M13, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world;
  for (const kind of ['joined', 'week_published', 'bet_posted']) await insertOld(db, kind, `old:${kind}`);
  const before = await world.api('luke', 'community/read', {});
  assert.equal(before.status, 200, JSON.stringify(before.body));
  await db.exec(migrationSql(M13));
  for (const [i, kind] of NEW_KINDS.entries()) await insert(db, kind, `new:${kind}`, { at: new Date(Date.parse('2026-10-21T18:00:00Z') + i * 1000).toISOString(), payload: { line: 'Fixture −3.5', games: ['TB-DAL'] } });
  const after = await world.api('luke', 'community/read', {});
  assert.equal(after.status, 200, JSON.stringify(after.body));
  assert.deepEqual(after.body.posts, before.body.posts, '/community/read lists only the old posts, field for field');
  assert.equal(after.body.posts.some(post => NEW_KINDS.includes(post.kind)), false);
  // The reader itself returns them (it filters nothing by kind); the handler's normalize() is what drops them.
  const raw = await world.db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query('select public.gtl_read_community($1,null,100,null) value', [ACCOUNTS.luke.id])).rows[0].value; });
  assert.deepEqual(NEW_KINDS.filter(kind => raw.posts.some(post => post.kind === kind)).sort(), [...NEW_KINDS].sort());
});
