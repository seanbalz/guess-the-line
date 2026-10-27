import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ALL, migrationSql } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { serviceSql } from './helpers/guess-week.mjs';
import { createWeekOpenAdapter, createWeekOpenHandler } from '../cloud/week-open.mjs';
import { weekOpenAt } from '../shared/nfl-schedule.mjs';

// M-23 (20261026133000_gtl_kickoff_posts.sql, redesign build plan stage 63): kickoff posts. Contracts: publishing a week
// writes one `kickoff` post per time slot, dated at its kickoff, as the week's publisher, with no pick or line in it; a
// rerun writes nothing; no reader lists a kickoff post, and no comment lands on one, before its kickoff; an error in the
// trigger never aborts the publish and leaves one audit row; the one-time backfill writes the current week's posts once and
// matches the read-only dry run; the real D-24 week-open job writes them too. Local PGlite only, fixture values only.
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const M23 = ALL.find(file => file.startsWith('20261026133000_'));
const DRY_RUN = fs.readFileSync(new URL('../supabase/admin/kickoff_posts_dry_run.sql', import.meta.url), 'utf8');
const epoch = iso => Date.parse(iso) / 1000;
// Week 9 across the Nov 1, 2026 clock change: TNF Thu Oct 29 5:15 PM PDT; Sunday 10:00 AM PST (two games), 1:05 PM PST and
// 5:20 PM PST (Monday 01:20 UTC).
const WEEK9 = [
  ['KC', 'BUF', '2026-10-30T00:15:00Z'], ['GB', 'MIN', '2026-11-01T18:00:00Z'], ['NYJ', 'MIA', '2026-11-01T18:00:00Z'],
  ['SEA', 'LA', '2026-11-01T21:05:00Z'], ['DAL', 'PHI', '2026-11-02T01:20:00Z'],
];
const NAMES = { KC: 'Kansas City Chiefs', BUF: 'Buffalo Bills', GB: 'Green Bay Packers', MIN: 'Minnesota Vikings', NYJ: 'New York Jets', MIA: 'Miami Dolphins',
  SEA: 'Seattle Seahawks', LA: 'Los Angeles Rams', DAL: 'Dallas Cowboys', PHI: 'Philadelphia Eagles' };
const games = rows => rows.map(([awayCode, homeCode, kickoff]) => ({ id: `${awayCode}-${homeCode}`, awayCode, homeCode, away: NAMES[awayCode], home: NAMES[homeCode],
  matchup: `${NAMES[awayCode]} @ ${NAMES[homeCode]}`, kickoff }));
const SLOTS = [
  { kickoff: '2026-10-30T00:15:00Z', games: ['KC-BUF'] },
  { kickoff: '2026-11-01T18:00:00Z', games: ['GB-MIN', 'NYJ-MIA'] },
  { kickoff: '2026-11-01T21:05:00Z', games: ['SEA-LA'] },
  { kickoff: '2026-11-02T01:20:00Z', games: ['DAL-PHI'] },
];

async function fixture(t, options = {}) {
  let now = null;
  const world = await createCommunityWorld({ migrations: ALL, troyBallots: false, clock: () => now ?? Date.now(), ...options });
  t.after(() => world.db.close());
  const call = serviceSql(world.db);
  const publish = (week, rows, user = ACCOUNTS.sean.id) => call('gtl_publish_week', { p_user: user, p_season: 2026, p_week: week, p_games: JSON.stringify(games(rows)),
    p_deadline: rows.map(r => r[2]).sort()[0], p_source: 'https://example.invalid/fixture-schedule' });
  const kickoffs = async week => (await world.db.query("select actor_id,season,week,payload,dedupe_key,created_at from public.gtl_feed_posts where kind='kickoff' and season=2026 and week=$1 order by created_at", [week])).rows;
  return { ...world, call, publish, kickoffs, at: value => { now = value; } };
}
const shape = rows => rows.map(r => ({ actor: r.actor_id, kickoff: new Date(r.created_at).toISOString(), payloadKickoff: new Date(r.payload.kickoff).toISOString(), games: r.payload.games, key: r.dedupe_key, keys: Object.keys(r.payload).sort() }));
const expected = (week, actor = ACCOUNTS.sean.id) => SLOTS.map(s => ({ actor, kickoff: new Date(s.kickoff).toISOString(), payloadKickoff: new Date(s.kickoff).toISOString(), games: s.games,
  key: `kickoff:2026:${week}:${epoch(s.kickoff)}`, keys: ['games', 'kickoff'] }));

test('publishing a week writes one kickoff post per time slot, dated at its kickoff, as the publisher; a rerun writes nothing', { skip }, async t => {
  const f = await fixture(t);
  assert.equal((await f.publish(9, WEEK9)).published, true);
  assert.deepEqual(shape(await f.kickoffs(9)), expected(9), 'four slots across the Nov 1 change: two games share 10:00 AM PST');
  // Nothing but the kickoff and its game ids: no pick, line or name.
  assert.doesNotMatch(JSON.stringify((await f.kickoffs(9)).map(r => r.payload)), /Chiefs|picks|line|-?\d+\.5/);
  // Republishing the same week is a no-op, and so is writing the posts again.
  assert.equal((await f.publish(9, WEEK9)).published, false);
  assert.equal(await f.call('gtl_write_kickoff_posts', { p_season: 2026, p_week: 9, p_actor: ACCOUNTS.sean.id }), 0);
  assert.equal((await f.kickoffs(9)).length, 4);
  // The slots helper says the same.
  const slots = await f.db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query('select kickoff,games from public.gtl_kickoff_slots(2026,9)')).rows; });
  assert.deepEqual(slots.map(s => ({ kickoff: new Date(s.kickoff).toISOString(), games: s.games })), SLOTS.map(s => ({ kickoff: new Date(s.kickoff).toISOString(), games: s.games })));
  // An unknown actor writes nothing; anon and authenticated may call neither function.
  assert.equal(await f.call('gtl_write_kickoff_posts', { p_season: 2026, p_week: 9, p_actor: randomUUID() }), 0);
  for (const fn of ['gtl_kickoff_slots(integer,integer)', 'gtl_write_kickoff_posts(integer,integer,uuid)', 'gtl_feed_on_slate()']) {
    const row = (await f.db.query(`select has_function_privilege('anon','public.${fn}','execute') anon, has_function_privilege('authenticated','public.${fn}','execute') auth`)).rows[0];
    assert.deepEqual(row, { anon: false, auth: false }, fn);
  }
});

test('no reader lists a kickoff post before its kickoff, and no comment lands on one; from its kickoff it shows with who is in', { skip }, async t => {
  const f = await fixture(t);
  await f.publish(9, WEEK9);
  const ids = (await f.db.query("select id,created_at from public.gtl_feed_posts where kind='kickoff' order by created_at")).rows;
  const feedAt = async iso => { f.at(Date.parse(iso)); return (await f.api('luke', 'league/feed', {})).body.posts.filter(p => p.kind === 'kickoff'); };
  assert.deepEqual(await feedAt('2026-10-29T23:59:59Z'), [], 'a second before TNF');
  assert.deepEqual((await feedAt('2026-10-30T00:15:00Z')).map(p => p.embed.games.map(g => g.gameId)), [['KC-BUF']], 'at TNF kickoff');
  assert.deepEqual((await feedAt('2026-11-01T18:30:00Z')).map(p => p.embed.games.map(g => g.gameId)), [['GB-MIN', 'NYJ-MIA'], ['KC-BUF']], 'Sunday morning');
  const shown = (await feedAt('2026-11-01T18:30:00Z'))[0];
  assert.deepEqual(shown.embed, { kickoff: shown.embed.kickoff, games: [{ gameId: 'GB-MIN', in: [], bets: 0 }, { gameId: 'NYJ-MIA', in: [], bets: 0 }] });
  assert.equal(Date.parse(shown.embed.kickoff), Date.parse('2026-11-01T18:00:00Z'));
  // The old reader never lists them (M-21 keeps the old app's kinds), at any time.
  f.at(Date.parse('2026-11-03T00:00:00Z'));
  assert.equal((await f.api('luke', 'community/read', {})).body.posts.some(p => p.kind === 'kickoff'), false);
  // Comments use the database clock (real time, before these kickoffs): every post is still in the future, so none lands.
  for (const { id } of ids) assert.equal((await f.api('luke', 'community/comment', { requestId: randomUUID(), postId: id, body: 'Early' })).status, 400);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_feed_comments')).rows[0].n, 0);
});

test('an error while writing kickoff posts never aborts the publish: the week opens and one audit row says why', { skip }, async t => {
  const f = await fixture(t);
  await f.db.exec("create or replace function public.gtl_write_kickoff_posts(p_season integer,p_week integer,p_actor uuid) returns integer language plpgsql security invoker set search_path='' as $$ begin raise exception 'GTL_FIXTURE_BOOM'; end $$;");
  assert.equal((await f.publish(9, WEEK9)).published, true);
  assert.equal((await f.db.query("select count(*)::int n from public.gtl_weekly_slates where season=2026 and week=9")).rows[0].n, 1);
  assert.equal((await f.db.query("select count(*)::int n from public.gtl_feed_posts where kind='week_published' and week=9")).rows[0].n, 1);
  assert.deepEqual(await f.kickoffs(9), []);
  assert.deepEqual((await f.db.query("select actor_id,event from public.gtl_access_audit where event like 'kickoff_posts_failed:%'")).rows, [{ actor_id: ACCOUNTS.sean.id, event: 'kickoff_posts_failed:2026:9:P0001' }]);
});

test('the one-time backfill writes the newest week\'s posts once, as its publisher, and matches the read-only dry run', { skip }, async t => {
  const f = await fixture(t, { migrations: ALL.filter(file => file !== M23) });
  await f.publish(9, WEEK9);
  const before = (await f.db.query(DRY_RUN)).rows;
  assert.deepEqual(before.map(r => ({ kickoff: new Date(r.kickoff).toISOString(), games: r.games, actor: r.actor_id, key: r.dedupe_key, exists: r.exists })),
    SLOTS.map(s => ({ kickoff: new Date(s.kickoff).toISOString(), games: s.games, actor: ACCOUNTS.sean.id, key: `kickoff:2026:9:${epoch(s.kickoff)}`, exists: false })));
  const counts = async () => (await f.db.query('select count(*)::int n from public.gtl_feed_posts')).rows[0].n;
  const total = await counts();
  await f.db.exec(migrationSql(M23));
  assert.deepEqual(shape(await f.kickoffs(9)), expected(9));
  assert.equal(await counts(), total + 4, 'exactly the dry run\'s posts');
  assert.ok((await f.db.query(DRY_RUN)).rows.every(r => r.exists), 'after the apply every row exists');
  await f.db.exec(migrationSql(M23));
  assert.equal(await counts(), total + 4, 'rerunning the file writes nothing');
  // Without a week_published post (a week whose slate was written another way) the founding league's commissioner is the actor.
  const g = await fixture(t, { migrations: ALL.filter(file => file !== M23) });
  await g.db.query('insert into public.gtl_weekly_slates(season,week,signature) values(2026,9,$1)', [{ season: 2026, week: 9, deadline: epoch(WEEK9[0][2]),
    games: games(WEEK9).map(x => ({ id: x.id, away: x.awayCode, home: x.homeCode, kickoff: epoch(x.kickoff) })) }]);
  await g.db.exec(migrationSql(M23));
  assert.deepEqual(shape(await g.kickoffs(9)), expected(9, ACCOUNTS.sean.id));
});

test('the D-24 week-open job (cloud/week-open.mjs) publishes the week and its kickoff posts as the schedule\'s commissioner', { skip }, async t => {
  const f = await fixture(t);
  const { db } = f;
  await db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';");
  await db.query("insert into public.gtl_week_open_schedule(id,enabled,endpoint,authorized_by,season) values('nfl-weekly',true,'https://example.supabase.co/functions/v1/gtl-week-open',$1,2026)", [ACCOUNTS.sean.id]);
  // A week that kicks off three days from now (Thursday-style deadline), with one later Sunday game; real clock, as the job uses.
  const deadline = Date.now() + 3 * 86_400_000, sunday = deadline + 3 * 86_400_000;
  const eastern = instant => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(instant)).map(x => [x.type, x.value]));
  const row = (instant, away, home) => { const p = eastern(instant); return `2026,REG,9,${p.year}-${p.month}-${p.day},${p.hour}:${p.minute},${away},${home},Home`; };
  const csv = ['season,game_type,week,gameday,gametime,away_team,home_team,location', row(deadline, 'KC', 'BUF'), row(sunday, 'SEA', 'LA')].join('\n');
  const rpc = async (name, args) => (await db.transaction(async tx => { await tx.exec('set local role service_role'); return tx.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args); })).rows[0].value;
  const service = { ...createWeekOpenAdapter({ url: 'https://example.supabase.co', serviceRoleKey: 'fixture', fetchImpl: async (url, options) => {
    try { return new Response(JSON.stringify(await rpc(new URL(url).pathname.split('/').at(-1), Object.values(JSON.parse(options.body))))); }
    catch (error) { return new Response(JSON.stringify({ message: error.message }), { status: 400 }); }
  } }), schedule: async () => csv };
  const run = (await db.query('select public.gtl_dispatch_week_open() value')).rows[0].value;
  assert.equal(run.status, 'queued');
  const token = (await db.query("select headers->>'Authorization' auth from net.outbox where body->>'runId'=$1", [run.runId])).rows[0].auth.slice(7);
  const response = await createWeekOpenHandler({ service, clock: () => Date.parse(weekOpenAt(new Date(deadline).toISOString())) })(new Request('https://example.supabase.co/functions/v1/gtl-week-open',
    { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ runId: run.runId }) }));
  const body = await response.json();
  assert.deepEqual([response.status, body.status, body.week], [200, 'succeeded', 9], JSON.stringify(body));
  const posts = await f.kickoffs(9);
  assert.equal(posts.length, 2, 'Thursday and Sunday');
  assert.ok(posts.every(p => p.actor_id === ACCOUNTS.sean.id));
  assert.deepEqual(posts.map(p => p.payload.games), [['KC-BUF'], ['SEA-LAR']]);
  assert.equal((await db.query("select count(*)::int n from public.gtl_week_open_runs where status='succeeded'")).rows[0].n, 1);
});
