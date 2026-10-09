import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { handleCommunity, providerCommunityError } from '../cloud/community.mjs';

// Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MIGRATIONS = [
  '20261008164249_gtl_private_cloud_state.sql',
  '20261008174007_gtl_profiles_private_games_invites.sql',
  '20261008182836_gtl_canonical_weekly_entries.sql',
  '20261008185738_gtl_manual_odds_collection.sql',
  '20261008192528_gtl_scoped_spread_benchmark.sql',
  '20261008200926_gtl_twelve_hour_odds_refresh.sql',
  '20261009005145_gtl_social_bet_tracker.sql',
  '20261009120000_gtl_community_feed.sql',
  '20261009130000_gtl_league_interest.sql',
];
const SEAN = 30, TROY = 1, BEN = 2, NEW = 3;

test('community feed migration: one community, automatic posts, gated picks, likes, comments, removal', { skip: PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.' }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  for (const file of MIGRATIONS) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file === MIGRATIONS[0]) {
      await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', seed()]);
      for (const n of [SEAN, TROY, BEN, NEW]) await db.query('insert into auth.users values($1)', [id(n)]);
      await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner')", [id(SEAN)]);
    }
    if (file === MIGRATIONS[1]) {
      await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Sean'),($2,'Troy')", [id(SEAN), id(TROY)]);
    }
  }
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const service = { rpc: async (name, args) => {
    const params = Object.values(args), placeholders = params.map((_, i) => `$${i + 1}`).join(',');
    try { return (await as('service_role', `select public.${name}(${placeholders}) value`, params)).rows[0].value; }
    catch (error) { throw providerCommunityError(error.message); }
  } };
  const user = n => ({ id: id(n), emailConfirmed: true, email: 'fixture@example.invalid' });
  const read = (n, now = Date.parse('2026-10-08T20:00:00Z'), body = {}) => handleCommunity({ route: '/community/read', body, user: user(n), service, clock: () => now });
  const slate = (await db.query('select season,week,signature from public.gtl_weekly_slates')).rows[0];
  const gameIds = slate.signature.games.map(g => g.id);
  const picks = value => Object.fromEntries(gameIds.map(g => [g, value]));
  const ballot = async (n, mode, submittedAt, value = -3, practice = false) => {
    await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing', [id(n), slate.season, slate.week]);
    await db.query(`insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,origin_practice) values($1,$2,$3,$4,$5,$6)
      on conflict(user_id,season,week,mode) do update set ballot=excluded.ballot`, [id(n), slate.season, slate.week, mode, { picks: picks(value), submittedAt }, practice]);
  };

  await t.test('browser roles cannot reach any table or RPC; functions are invoker', async () => {
    for (const table of ['gtl_community_removals', 'gtl_feed_posts', 'gtl_feed_likes', 'gtl_feed_comments']) {
      assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true);
      for (const role of ['anon', 'authenticated']) await assert.rejects(() => as(role, `select * from public.${table}`), /permission denied/);
    }
    for (const role of ['anon', 'authenticated']) await assert.rejects(() => as(role, 'select public.gtl_read_community($1,null,30,null)', [id(TROY)]), /permission denied/);
    const flags = (await db.query("select prosecdef from pg_proc where proname like 'gtl_%community%' or proname like 'gtl_%feed%'")).rows;
    assert(flags.length >= 7 && flags.every(row => row.prosecdef === false));
  });

  await t.test('existing and new profiles are members with joined posts; no profile means no access', async () => {
    await assert.rejects(() => read(BEN), error => error.status === 403);
    await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Ben')", [id(BEN)]);
    const feed = await read(BEN);
    assert.deepEqual(feed.members.map(m => m.displayName), ['Ben', 'Sean', 'Troy']);
    assert.equal(feed.posts.filter(p => p.kind === 'joined').length, 3);
    assert.equal(feed.admin, false);
    assert.equal((await read(SEAN)).admin, true);
  });

  await t.test('picks due counts both modes until submitted, then the urgent window', async () => {
    const feed = await read(BEN);
    assert.deepEqual(feed.due.map(d => [d.mode, d.submitted, d.filled, d.games]), [['guess_spread', false, 0, gameIds.length], ['guess_total', false, 0, gameIds.length]]);
    assert.equal(feed.picksDue.state, 'due');
    const deadline = Date.parse(feed.week.deadline);
    assert.equal((await read(BEN, deadline - 3_600_000)).picksDue.state, 'urgent');
    assert.equal((await read(BEN, deadline + 1)).picksDue.state, 'closed');
  });

  await t.test('submission posts appear once, carry picks only for viewers who submitted the same market', async () => {
    await ballot(TROY, 'guess_spread', null);
    assert.equal((await read(TROY)).posts.some(p => p.kind === 'ballot_submitted'), false, 'a draft does not post');
    await ballot(TROY, 'guess_spread', '2026-10-08T18:00:00Z', -3);
    await ballot(TROY, 'guess_spread', '2026-10-08T18:00:00Z', -4);
    await ballot(NEW, 'guess_spread', '2026-10-08T18:30:00Z', 0, true).catch(() => {});
    let posts = (await read(BEN)).posts.filter(p => p.kind === 'ballot_submitted');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].picksHidden, true); assert.equal(posts[0].picks, null);
    assert.deepEqual((await read(BEN)).submissions.map(s => [s.userId, s.mode]), [[id(TROY), 'guess_spread'], [id(SEAN), 'guess_spread']], 'Sean\'s migrated Week 5 spread ballot counts as submitted');
    assert.deepEqual((await read(TROY)).posts.find(p => p.kind === 'ballot_submitted').picks, picks(-4), 'own picks visible');
    await ballot(BEN, 'guess_total', '2026-10-08T19:00:00Z', 44);
    posts = (await read(BEN)).posts.filter(p => p.kind === 'ballot_submitted' && p.mode === 'guess_spread');
    assert.equal(posts[0].picksHidden, true, 'submitting a different market does not reveal spreads');
    await ballot(BEN, 'guess_spread', '2026-10-08T19:05:00Z', -2.5);
    posts = (await read(BEN)).posts.filter(p => p.kind === 'ballot_submitted' && p.actorId === id(TROY));
    assert.deepEqual(posts[0].picks, picks(-4));
    assert.equal((await read(BEN)).picksDue.state, 'done');
    const sean = (await read(SEAN)).posts.find(p => p.kind === 'ballot_submitted' && p.actorId === id(BEN) && p.mode === 'guess_total');
    assert.equal(sean.picksHidden, true, 'Sean has not submitted totals');
    const afterDeadline = (await read(SEAN, Date.parse((await read(SEAN)).week.deadline))).posts.find(p => p.id === sean.id);
    assert.deepEqual(afterDeadline.picks, picks(44), 'everyone sees every pick once the deadline passes');
  });

  let post;
  await t.test('standings share points from saved references, never picks', async () => {
    const refs = Object.fromEntries(gameIds.map((g, i) => [g, i === 0 ? { status: 'available', value: -3.5 } : { status: 'unavailable', value: null }]));
    await db.query(`update public.gtl_weekly_ballots set ballot=ballot||jsonb_build_object('scoringReferences',$1::jsonb) where user_id=$2 and mode='guess_spread'`, [refs, id(TROY)]);
    const feed = await read(BEN);
    const troy = feed.standings.find(x => x.userId === id(TROY) && x.mode === 'guess_spread');
    assert.deepEqual([troy.weekPoints, troy.weekScored, troy.seasonPoints, troy.weeksSubmitted], [9, 1, 9, 1], 'Troy -4 vs reference -3.5 scores 9; unavailable references are unscored');
    assert(feed.standings.every(x => Object.keys(x).every(k => ['userId', 'mode', 'weekPoints', 'weekScored', 'seasonPoints', 'seasonScored', 'weeksSubmitted'].includes(k))));
  });

  await t.test('likes toggle idempotently and comments replay safely', async () => {
    post = (await read(SEAN)).posts.find(p => p.kind === 'joined' && p.actorId === id(BEN));
    const like = body => handleCommunity({ route: '/community/like', body, user: user(SEAN), service });
    assert.deepEqual(await like({ postId: post.id, like: true }), { likes: 1, likedByMe: true });
    assert.deepEqual(await like({ postId: post.id, like: true }), { likes: 1, likedByMe: true });
    const comment = (body, n = SEAN) => handleCommunity({ route: '/community/comment', body, user: user(n), service });
    const first = await comment({ requestId: id(900), postId: post.id, body: '  Welcome Ben  ' });
    assert.equal((await comment({ requestId: id(900), postId: post.id, body: 'Welcome Ben' })).replayed, true);
    await assert.rejects(() => comment({ requestId: id(900), postId: post.id, body: 'Different' }), error => error.status === 409);
    await assert.rejects(() => comment({ requestId: id(901), postId: post.id, body: ' ' }), error => error.status === 400);
    await assert.rejects(() => comment({ requestId: id(902), postId: post.id, body: 'x'.repeat(501) }), error => error.status === 400);
    const seen = (await read(BEN)).posts.find(p => p.id === post.id);
    assert.equal(seen.likes, 1); assert.equal(seen.likedByMe, false);
    assert.deepEqual(seen.comments.map(c => [c.id, c.body]), [[first.id, 'Welcome Ben']]);
    assert.deepEqual(await like({ postId: post.id, like: false }), { likes: 0, likedByMe: false });
  });

  await t.test('only the commissioner removes members; removed members disappear and lose access', async () => {
    const member = (body, n) => handleCommunity({ route: '/community/member', body, user: user(n), service });
    await assert.rejects(() => member({ userId: id(BEN), member: false }, TROY), error => error.status === 403);
    await assert.rejects(() => member({ userId: id(SEAN), member: false }, SEAN), error => error.status === 400);
    assert.deepEqual(await member({ userId: id(BEN), member: false }, SEAN), { userId: id(BEN), member: false });
    await assert.rejects(() => read(BEN), error => error.status === 403);
    const feed = await read(TROY);
    assert.equal(feed.members.some(m => m.id === id(BEN)), false);
    assert.equal(feed.posts.some(p => p.actorId === id(BEN)), false);
    assert.equal(feed.submissions.some(s => s.userId === id(BEN)), false);
    await member({ userId: id(BEN), member: true }, SEAN);
    assert.equal((await read(TROY)).members.some(m => m.id === id(BEN)), true);
    assert.equal((await db.query("select count(*)::int n from public.gtl_access_audit where event like 'community_%'")).rows[0].n, 2);
  });

  await t.test('Bet Tracker creates and settlements post to the feed once', async () => {
    await db.query('insert into public.gtl_social_weeks(season,week) values($1,$2)', [slate.season, slate.week]);
    const commit = (request, revision, action) => db.query(`insert into public.gtl_social_commits(actor_id,request_id,season,week,revision,action,payload,event)
      values($1,$2,$3,$4,$5,$6,'{}',$7)`, [id(TROY), id(request), slate.season, slate.week, revision, action, { entryId: 'bet-1' }]);
    await commit(700, 1, 'create'); await commit(701, 2, 'include'); await commit(702, 3, 'settle');
    const bets = (await read(BEN)).posts.filter(p => p.kind.startsWith('bet_'));
    assert.deepEqual(bets.map(p => [p.kind, p.entryId]).sort(), [['bet_posted', 'bet-1'], ['bet_settled', 'bet-1']]);
  });

  await t.test('commissioner publishes a reviewed week once; it becomes the current slate with a feed post', async () => {
    const csv = `season,game_type,week,gameday,gametime,away_team,home_team,location
2026,REG,6,2026-10-15,20:15,SEA,DEN,Home
2026,REG,6,2026-10-18,16:05,ARI,LA,Home`;
    const scheduled = { ...service, schedule: async () => csv };
    await db.query("insert into public.gtl_odds_schedule(id,endpoint,authorized_by,season,week,slate_signature) select 'nfl-12h','https://abc123.supabase.co/functions/v1/gtl-odds-refresh',$1,season,week,signature from public.gtl_weekly_slates where week=5", [id(SEAN)]);
    const publish = (route, n, body = { season: 2026, week: 6 }) => handleCommunity({ route: `/community/${route}`, body, user: user(n), service: scheduled });
    await assert.rejects(() => publish('publish-preview', TROY), error => error.status === 403);
    const preview = await publish('publish-preview', SEAN);
    assert.deepEqual(preview.games.map(g => g.id), ['SEA-DEN', 'ARI-LAR']);
    assert.equal((await db.query('select count(*)::int n from public.gtl_weekly_slates where week=6')).rows[0].n, 0, 'preview writes nothing');
    assert.equal((await publish('publish', SEAN)).published, true);
    assert.equal((await publish('publish', SEAN)).published, false, 'identical republish is a no-op');
    const sig = (await db.query('select signature from public.gtl_weekly_slates where season=2026 and week=6')).rows[0].signature;
    const expected = (await db.query(`select public.gtl_weekly_slate(jsonb_build_object('league',jsonb_build_object('season',2026,'week',6,'deadline',$1::text),'games',$2::jsonb)) s`,
      [preview.deadline, JSON.stringify(preview.games)])).rows[0].s;
    assert.deepEqual(sig, expected, 'same signature shape as league slates');
    const changed = { ...service, schedule: async () => csv.replace('20:15', '20:20') };
    await assert.rejects(() => handleCommunity({ route: '/community/publish', body: { season: 2026, week: 6 }, user: user(SEAN), service: changed }), error => error.status === 409);
    await assert.rejects(() => publish('publish', SEAN, { season: 2026, week: 9 }), error => error.status === 422);
    const schedule = (await db.query("select season,week,slate_signature from public.gtl_odds_schedule")).rows[0];
    assert.deepEqual([schedule.season, schedule.week, schedule.slate_signature], [2026, 6, sig], 'collector moved to the new week');
    const feed = await read(BEN, Date.parse('2026-10-12T12:00:00Z'));
    assert.deepEqual([feed.week.week, feed.week.games], [6, 2]);
    assert.equal(feed.picksDue.state, 'due');
    assert.deepEqual(feed.due.map(d => d.filled), [0, 0]);
    const post = feed.posts.find(p => p.kind === 'week_published');
    assert.deepEqual([post.week, post.games], [6, 2]);
    const template = (await db.query("select games from public.gtl_schedule_templates where id='nfl-2026-week-06'")).rows[0].games;
    assert.equal(template[1].matchup, 'Arizona Cardinals @ Los Angeles Rams');
  });

  await t.test('pagination returns older posts before a timestamp', async () => {
    const all = (await read(TROY, undefined, { limit: 100 })).posts;
    const page = await read(TROY, undefined, { limit: 2 });
    assert.equal(page.posts.length, 2);
    const older = await read(TROY, undefined, { before: page.posts[1].createdAt, limit: 100 });
    assert(older.posts.every(p => Date.parse(p.createdAt) < Date.parse(page.posts[1].createdAt)));
    assert.equal(older.posts.length + 2 <= all.length, true);
  });

  await t.test('coming-soon league interest (D-22): service-only, idempotent toggles, counts exclude removed members', async () => {
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.gtl_league_interest'::regclass")).rows[0].relrowsecurity, true);
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(() => as(role, 'select * from public.gtl_league_interest'), /permission denied/);
      await assert.rejects(() => as(role, "select public.gtl_set_league_interest($1,'nba',true)", [id(TROY)]), /permission denied/);
    }
    assert.equal((await db.query("select prosecdef from pg_proc where proname='gtl_set_league_interest'")).rows[0].prosecdef, false);
    const interest = (body, n) => handleCommunity({ route: '/community/interest', body, user: user(n), service });
    const before = await read(TROY);
    assert.deepEqual(before.interests, []);
    assert.deepEqual(before.interestCounts, { nba: 0, mlb: 0, nhl: 0, cfb: 0, cbb: 0 });
    assert.deepEqual(await interest({ league: 'nba', notify: true }, TROY), { league: 'nba', notify: true, count: 1 });
    assert.deepEqual(await interest({ league: 'nba', notify: true }, TROY), { league: 'nba', notify: true, count: 1 }, 'repeat is idempotent');
    assert.deepEqual(await interest({ league: 'nba', notify: true }, BEN), { league: 'nba', notify: true, count: 2 });
    await interest({ league: 'cfb', notify: true }, TROY);
    await interest({ league: 'nhl', notify: false }, TROY);
    const feed = await read(TROY);
    assert.deepEqual(feed.interests, ['nba', 'cfb'], 'notify=false rows are not interests; order follows the league list');
    assert.deepEqual(feed.interestCounts, { nba: 2, mlb: 0, nhl: 0, cfb: 1, cbb: 0 });
    assert.deepEqual((await read(BEN)).interests, ['nba'], 'interests are per viewer');
    assert.deepEqual(await interest({ league: 'nba', notify: false }, TROY), { league: 'nba', notify: false, count: 1 });
    assert.deepEqual(await interest({ league: 'nba', notify: false }, TROY), { league: 'nba', notify: false, count: 1 });
    assert.deepEqual((await read(TROY)).interests, ['cfb']);
    assert.equal((await db.query("select count(*)::int n from public.gtl_league_interest where user_id=$1 and league='nba'", [id(TROY)])).rows[0].n, 1, 'one row per member and league');
    for (const body of [{ league: 'nfl', notify: true }, { league: 'NBA', notify: true }, { league: 'nba', notify: 'yes' }, { league: 'nba' }, { league: 'nba', notify: true, extra: 1 }]) {
      await assert.rejects(() => interest(body, TROY), error => error.status === 400);
    }
    await assert.rejects(() => service.rpc('gtl_set_league_interest', { p_user: id(TROY), p_league: 'xfl', p_notify: true }), error => error.status === 400, 'the database rejects an invalid league too');
    await assert.rejects(() => service.rpc('gtl_set_league_interest', { p_user: id(TROY), p_league: 'nba', p_notify: null }), error => error.status === 400);
    await assert.rejects(() => interest({ league: 'nba', notify: true }, NEW), error => error.status === 403, 'no profile, no community');
    await handleCommunity({ route: '/community/member', body: { userId: id(BEN), member: false }, user: user(SEAN), service });
    await assert.rejects(() => interest({ league: 'mlb', notify: true }, BEN), error => error.status === 403, 'removed members cannot toggle');
    assert.equal((await read(TROY)).interestCounts.nba, 0, 'removed members are not counted');
    await handleCommunity({ route: '/community/member', body: { userId: id(BEN), member: true }, user: user(SEAN), service });
    assert.equal((await read(TROY)).interestCounts.nba, 1, 'restored members count again');
  });
});
