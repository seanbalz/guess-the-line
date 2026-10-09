import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { createWeekOpenAdapter, createWeekOpenHandler, planWeekOpen } from '../cloud/week-open.mjs';
import { handlePersonal, providerPersonalError } from '../cloud/personal.mjs';
import { providerWeeklyError } from '../cloud/weekly.mjs';
import { listWeeks, nextWeek, pacificToUtc, weekOpenAt } from '../shared/nfl-schedule.mjs';

let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite absent; no hosted database tests.';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = value => new Date(value).toISOString();
const token = 'a'.repeat(64); // Synthetic fixture, never a deployed credential.
const MIGRATIONS = ['20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql',
  '20261008185738_gtl_manual_odds_collection.sql', '20261008200926_gtl_twelve_hour_odds_refresh.sql', '20261009005145_gtl_social_bet_tracker.sql',
  '20261009120000_gtl_community_feed.sql', '20261009130000_gtl_league_interest.sql', '20261009140000_gtl_d23_data_rule.sql', '20261009150000_gtl_auto_open_week.sql'];

/** One nflverse row at a UTC instant, written in the file's Eastern wall-clock columns. */
function row(season, week, instant, away, home) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(instant)).map(x => [x.type, x.value]));
  return `${season},REG,${week},${p.year}-${p.month}-${p.day},${p.hour}:${p.minute},${away},${home},Home`;
}
const HEADER = 'season,game_type,week,gameday,gametime,away_team,home_team,location';
const DAY = 86_400_000;
// Thursday 5:15 PM PT kickoffs: Week 6 (PDT), Week 10 (PST) and the DST-transition week.
const csv = [HEADER,
  row(2026, 6, Date.parse('2026-10-16T00:15:00Z'), 'SEA', 'DEN'), row(2026, 6, Date.parse('2026-10-18T20:05:00Z'), 'ARI', 'LA'),
  row(2026, 9, Date.parse('2026-11-06T01:15:00Z'), 'KC', 'BUF'), row(2026, 9, Date.parse('2026-11-08T18:00:00Z'), 'GB', 'MIN'),
  row(2026, 10, Date.parse('2026-11-13T01:15:00Z'), 'DAL', 'NYG'),
  `2026,POST,19,2027-01-10,13:00,SEA,DEN,Home`, `2025,REG,6,2025-10-17,20:15,SEA,DEN,Home`].join('\n');

test('open time is Monday 00:00 Pacific of the deadline week across PDT, PST and the DST change', () => {
  assert.equal(weekOpenAt('2026-10-16T00:15:00Z'), '2026-10-12T07:00:00.000Z', 'PDT: Thursday 5:15 PM PT TNF opens Monday 00:00 PDT = 07:00 UTC');
  assert.equal(weekOpenAt('2026-11-13T01:15:00Z'), '2026-11-09T08:00:00.000Z', 'PST: Monday 00:00 PST = 08:00 UTC');
  assert.equal(weekOpenAt('2026-11-06T01:15:00Z'), '2026-11-02T08:00:00.000Z', 'the Monday after clocks fall back is already PST');
  assert.equal(weekOpenAt('2026-10-12T07:00:00Z'), '2026-10-12T07:00:00.000Z', 'a Monday-midnight deadline opens that same instant');
  assert.equal(weekOpenAt('2026-10-12T06:59:59Z'), '2026-10-05T07:00:00.000Z', 'one second earlier is still Sunday in Pacific time');
  assert.equal(weekOpenAt('2026-09-13T20:00:00Z'), '2026-09-07T07:00:00.000Z', 'a Sunday-only week opens the Monday before');
  assert.equal(pacificToUtc('2026-03-08', '03:00'), '2026-03-08T10:00:00.000Z', 'spring-forward morning uses the PDT offset');
  assert.throws(() => weekOpenAt('nope'), /Invalid deadline/);
});

test('target week is the one whose first game is next after now', () => {
  assert.deepEqual(listWeeks(csv, 2026), [{ week: 6, deadline: '2026-10-16T00:15:00.000Z' }, { week: 9, deadline: '2026-11-06T01:15:00.000Z' }, { week: 10, deadline: '2026-11-13T01:15:00.000Z' }]);
  assert.equal(nextWeek(csv, 2026, Date.parse('2026-10-12T07:00:00Z')).week, 6, 'Monday 00:00 PT before Week 6 TNF');
  assert.equal(nextWeek(csv, 2026, Date.parse('2026-10-16T00:15:00Z')).week, 9, 'at Week 6 kickoff the next first game is Week 9');
  assert.equal(nextWeek(csv, 2026, Date.parse('2027-01-01T00:00:00Z')), null);
  assert.deepEqual(planWeekOpen(csv, 2026, Date.parse('2026-10-12T06:59:00Z')), { reason: 'not_open_yet', week: 6, opensAt: '2026-10-12T07:00:00.000Z' }, 'the 07:00 UTC cron during PST or a manual early run never opens a week early');
  const plan = planWeekOpen(csv, 2026, Date.parse('2026-10-12T07:00:00Z'));
  assert.equal(plan.reason, null); assert.equal(plan.slate.week, 6); assert.deepEqual(plan.slate.games.map(g => g.id), ['SEA-DEN', 'ARI-LAR']);
  assert.equal(planWeekOpen(csv, 2026, Date.parse('2026-10-12T08:00:00Z')).slate.week, 6, 'the second DST cron just republishes (a no-op)');
  assert.deepEqual(planWeekOpen(csv, 2026, Date.parse('2027-06-01T00:00:00Z')), { reason: 'no_upcoming_week' });
  assert.deepEqual(planWeekOpen(csv, 2027, Date.parse('2026-10-12T07:00:00Z')), { reason: 'no_upcoming_week' });
});

function fakeService({ schedule = csv, published = true, claim = {}, fail } = {}) {
  const calls = [];
  return { calls, schedule: async () => { if (schedule instanceof Error) throw schedule; return schedule; }, rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === 'gtl_claim_week_open') {
      if (args.p_token !== token) { const e = new Error('auth'); e.code = 'GTL_SCHEDULE_AUTH'; throw e; }
      return { replay: false, runId: args.p_run, claim: id(5), actorId: id(1), season: 2026, ...claim };
    }
    if (name === 'gtl_publish_week') { if (fail) { const e = new Error('publish'); e.code = fail; throw e; } return { season: args.p_season, week: args.p_week, games: args.p_games.length, published }; }
    if (name === 'gtl_complete_week_open') return { runId: args.p_run, status: args.p_reason ? 'skipped' : 'succeeded', reason: args.p_reason };
    throw new Error(`unexpected ${name}`);
  } };
}
const request = (auth = token, body = JSON.stringify({ runId: id(9) })) => new Request('https://example.supabase.co/functions/v1/gtl-week-open', { method: 'POST', headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' }, body });

test('handler publishes the open week as the commissioner, no-ops on a republish and rejects bad tokens', async () => {
  const service = fakeService();
  const app = createWeekOpenHandler({ service, clock: () => Date.parse('2026-10-12T07:00:00Z') });
  let response = await app(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { runId: id(9), status: 'succeeded', reason: null, season: 2026, week: 6 });
  const publish = service.calls.find(([name]) => name === 'gtl_publish_week')[1];
  assert.equal(publish.p_user, id(1), 'published as the schedule\'s authorized commissioner');
  assert.deepEqual([publish.p_season, publish.p_week, publish.p_deadline, publish.p_games.map(g => g.id)], [2026, 6, '2026-10-16T00:15:00.000Z', ['SEA-DEN', 'ARI-LAR']]);
  assert.equal(Object.hasOwn(publish.p_games[0], 'neutral'), false);
  assert.match(publish.p_source, /^https:\/\/raw\.githubusercontent\.com\/nflverse\//);

  const again = fakeService({ published: false });
  response = await createWeekOpenHandler({ service: again, clock: () => Date.parse('2026-10-12T09:00:00Z') })(request());
  assert.deepEqual(await response.json(), { runId: id(9), status: 'skipped', reason: 'already_published' });

  const early = fakeService();
  response = await createWeekOpenHandler({ service: early, clock: () => Date.parse('2026-10-12T06:59:00Z') })(request());
  assert.deepEqual(await response.json(), { runId: id(9), status: 'skipped', reason: 'not_open_yet' });
  assert.equal(early.calls.some(([name]) => name === 'gtl_publish_week'), false);

  for (const [service2, reason] of [[fakeService({ schedule: new Error('down') }), 'schedule_unavailable'], [fakeService({ schedule: 'garbage' }), 'schedule_unavailable'],
    [fakeService({ fail: 'GTL_SLATE_CONFLICT' }), 'slate_conflict'], [fakeService({ fail: 'GTL_COMMUNITY_FORBIDDEN' }), 'commissioner_unavailable'], [fakeService({ fail: 'UNAVAILABLE' }), 'publish_failed']]) {
    response = await createWeekOpenHandler({ service: service2, clock: () => Date.parse('2026-10-12T07:00:00Z') })(request());
    assert.equal((await response.json()).reason, reason);
    assert.equal(service2.calls.at(-1)[0], 'gtl_complete_week_open', 'every claimed run is completed');
  }

  const rejected = fakeService();
  assert.equal((await createWeekOpenHandler({ service: rejected })(request('b'.repeat(64)))).status, 401);
  assert.equal((await createWeekOpenHandler({ service: rejected })(request('short'))).status, 401);
  assert.equal((await createWeekOpenHandler({ service: rejected })(request(token, JSON.stringify({ runId: id(9), season: 2027 })))).status, 400);
  assert.equal((await createWeekOpenHandler({ service: rejected })(new Request('https://example.supabase.co/functions/v1/gtl-week-open?x=1', { method: 'POST', headers: { authorization: `Bearer ${token}` } }))).status, 400);
  assert.equal((await createWeekOpenHandler({ service: rejected })(new Request('https://example.supabase.co/functions/v1/gtl-week-open', { method: 'GET', headers: { authorization: `Bearer ${token}` } }))).status, 405);
  assert.equal(rejected.calls.filter(([name]) => name !== 'gtl_claim_week_open').length, 0, 'nothing runs without a valid claim');
  const replay = { ...fakeService(), rpc: async () => ({ replay: true, runId: id(9), status: 'succeeded', reason: null }) };
  assert.deepEqual(await (await createWeekOpenHandler({ service: replay })(request())).json(), { runId: id(9), status: 'succeeded', reason: null });
  const broken = createWeekOpenHandler({ service: { schedule: async () => csv, rpc: async () => { throw new Error(`URL?secret=${token}`); } } });
  const result = await broken(request()); assert.equal(result.status, 503); assert.equal((await result.text()).includes(token), false);
});

test('adapter only reaches the three week-open RPCs and the public schedule, and scrubs provider errors', async () => {
  const seen = [];
  const service = createWeekOpenAdapter({ url: 'https://example.supabase.co', serviceRoleKey: 'private', fetchImpl: async (url, options) => {
    seen.push(String(url));
    if (String(url).startsWith('https://raw.githubusercontent.com/')) return new Response(csv);
    return new Response(JSON.stringify({ message: 'GTL_SLATE_CONFLICT', secret: token }), { status: 409 });
  } });
  assert.equal(await service.schedule(), csv);
  await assert.rejects(() => service.rpc('gtl_publish_week', {}), error => error.code === 'GTL_SLATE_CONFLICT' && !error.message.includes(token));
  await assert.rejects(() => service.rpc('gtl_dispatch_week_open', {}), /Invalid week open operation/);
  await assert.rejects(() => service.rpc('gtl_read_community', {}), /Invalid week open operation/);
  assert.equal(seen.filter(u => u.includes('/rest/v1/rpc/')).length, 1);
  assert.throws(() => createWeekOpenAdapter({ url: 'http://example.supabase.co', serviceRoleKey: 'x' }), /Invalid week open configuration/);
});

test('not-open errors name the week in the personal route and map on the group route', async () => {
  const service = { rpc: async () => { throw providerPersonalError('GTL_PREDICTION_NOT_OPEN'); } };
  const body = { requestId: id(7), revision: 0, season: 2026, week: 7, mode: 'guess_spread', weeklyRevision: 0, submit: false, picks: { 'SEA-DEN': -3 } };
  await assert.rejects(() => handlePersonal({ route: '/personal/ballot', body, user: { id: id(1) }, service }), error => error.status === 409 && error.code === 'GTL_PREDICTION_NOT_OPEN' && error.message === 'Week 7 picks open Monday 12:00 AM PT.');
  await assert.rejects(() => handlePersonal({ route: '/personal/ballot', body, user: { id: id(1) }, service, submitBallot: (payload, commit) => commit() }), /Week 7 picks open Monday 12:00 AM PT\./);
  await assert.rejects(() => handlePersonal({ route: '/personal/forecast', body: { requestId: id(7), revision: 0, season: 2026, week: 7, gameId: 'SEA-DEN', market: 'spread', value: -3 }, user: { id: id(1) }, service }), /This week’s picks open Monday 12:00 AM PT\./, 'other routes keep the generic message');
  const weekly = providerWeeklyError('GTL_PREDICTION_NOT_OPEN');
  assert.equal(weekly.status, 409); assert.match(weekly.message, /open Monday 12:00 AM PT/);
});

async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;');
  for (const file of MIGRATIONS) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file === MIGRATIONS[0]) {
      await db.query("insert into public.gtl_leagues(id,state) values('sean-troy-luke',$1)", [seed()]);
      await db.query('insert into auth.users values($1),($2)', [id(1), id(2)]);
      await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner')", [id(1)]);
    }
    if (file === MIGRATIONS[1]) await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Sean'),($2,'Troy')", [id(1), id(2)]);
  }
  // Local-only extension double, as in the odds-refresh tests: a readable queue holds only the one-run capability.
  await db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';grant usage on schema net to anon,authenticated;grant select on net.outbox to anon,authenticated;");
  await db.query("insert into public.gtl_week_open_schedule(id,enabled,endpoint,authorized_by,season) values('nfl-weekly',true,'https://example.supabase.co/functions/v1/gtl-week-open',$1,2026)", [id(1)]);
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const rpc = async (name, args) => (await as('service_role', `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value;
  const dispatch = async () => (await db.query('select public.gtl_dispatch_week_open() value')).rows[0].value;
  const capability = async runId => (await as('anon', "select headers->>'Authorization' auth from net.outbox where body->>'runId'=$1 order by id desc limit 1", [runId])).rows[0]?.auth.slice(7);
  const service = { ...createWeekOpenAdapter({ url: 'https://example.supabase.co', serviceRoleKey: 'fixture', fetchImpl: async (url, options) => {
    try { const value = await rpc(new URL(url).pathname.split('/').at(-1), Object.values(JSON.parse(options.body))); return new Response(JSON.stringify(value)); }
    catch (error) { return new Response(JSON.stringify({ message: error.message }), { status: 400 }); }
  } }) };
  // A real-clock slate: Week 6 TNF (Thursday ~5:15 PM PT) in a week whose Monday open is still ahead; Week 7 a week later.
  const now = Date.now(), monday = Date.parse(weekOpenAt(now + 10 * DAY)), deadline6 = monday + 3 * DAY + 17.25 * 3_600_000, deadline7 = deadline6 + 7 * DAY;
  assert(monday > now + 3 * DAY);
  service.schedule = async () => [HEADER, row(2026, 6, deadline6, 'SEA', 'DEN'), row(2026, 6, deadline6 + 3 * DAY, 'ARI', 'LA'), row(2026, 7, deadline7, 'KC', 'BUF')].join('\n');
  const request = async (runId, auth, clock) => {
    auth ??= await capability(runId) || token;
    const response = await createWeekOpenHandler({ service, clock })(new Request('https://example.supabase.co/functions/v1/gtl-week-open', { method: 'POST', headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' }, body: JSON.stringify({ runId }) }));
    return { status: response.status, data: await response.json() };
  };
  return { db, as, rpc, dispatch, capability, request, deadline6, deadline7 };
}

test('scheduler SQL: private dispatch, one-run token, publish through gtl_publish_week, and the ballot window guard', { skip }, async t => {
  const f = await fixture(t);
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['gtl_week_open_schedule', 'gtl_week_open_runs']) for (const query of [`select * from public.${table}`, `delete from public.${table}`, `update public.${table} set ${table === 'gtl_week_open_schedule' ? 'enabled=enabled' : 'status=status'}`]) await assert.rejects(() => f.as(role, query), /permission denied/);
    for (const signature of ['gtl_dispatch_week_open()', 'gtl_claim_week_open(text,uuid)', 'gtl_complete_week_open(uuid,uuid,text)', 'gtl_read_week_open_schedule(uuid)', 'gtl_week_open_at(integer,integer)']) assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false);
  }
  await assert.rejects(() => f.rpc('gtl_dispatch_week_open', []), /permission denied/);
  await assert.rejects(() => f.as('service_role', 'update public.gtl_week_open_schedule set enabled=false'), /permission denied/);
  await assert.rejects(() => f.as('service_role', "update public.gtl_week_open_runs set capability_hash=repeat('f',64)"), /permission denied/);
  const flags = (await f.db.query("select proname,prosecdef from pg_proc where proname like 'gtl_%week_open%' or proname='gtl_ballot_window_guard'")).rows;
  assert.equal(flags.length, 6); assert(flags.every(row => row.prosecdef === false), 'all functions are security invoker');

  // The SQL open time equals the shared JavaScript helper for PDT, PST and the DST week.
  for (const deadline of ['2026-10-16T00:15:00Z', '2026-11-13T01:15:00Z', '2026-11-06T01:15:00Z', '2026-10-12T07:00:00Z', '2026-10-12T06:59:59Z']) {
    await f.db.query("insert into public.gtl_weekly_slates(season,week,signature) values(2099,1,jsonb_build_object('deadline',extract(epoch from $1::timestamptz))) on conflict(season,week) do update set signature=excluded.signature", [deadline]);
    assert.equal(iso(await f.rpc('gtl_week_open_at', [2099, 1])), weekOpenAt(deadline), deadline);
  }
  await f.db.exec('delete from public.gtl_weekly_slates where season=2099');
  assert.equal(await f.rpc('gtl_week_open_at', [2099, 2]), null, 'no slate, no open time');

  const queued = await f.dispatch(); assert.equal(queued.status, 'queued');
  assert.deepEqual(Object.keys(queued).sort(), ['runId', 'status']);
  assert.deepEqual(await f.dispatch(), { status: 'already_dispatched' });
  assert.equal((await f.db.query('select count(*)::int n from net.outbox')).rows[0].n, 1);
  assert.equal((await f.request(queued.runId, 'b'.repeat(64))).status, 401);
  const runToken = await f.capability(queued.runId); assert.match(runToken, /^[0-9a-f]{64}$/);
  assert.notEqual((await f.db.query('select capability_hash from public.gtl_week_open_runs')).rows[0].capability_hash, runToken, 'only the hash is stored');
  assert.equal((await f.request(id(800), runToken)).status, 401, 'token cannot claim a different run');

  // Before the open: a safe skip, and the second DST cron's run is just a replay.
  const early = await f.request(queued.runId, runToken, () => Date.parse(weekOpenAt(f.deadline6)) - 1000);
  assert.deepEqual(early.data, { runId: queued.runId, status: 'skipped', reason: 'not_open_yet' });
  assert.deepEqual((await f.request(queued.runId, runToken)).data, { runId: queued.runId, status: 'skipped', reason: 'not_open_yet' }, 'replay returns the recorded result');
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_weekly_slates where week=6')).rows[0].n, 0);

  // At the open: published as Sean through gtl_publish_week, with the feed post and template.
  await f.db.exec('delete from public.gtl_week_open_runs');
  const open = await f.dispatch();
  const published = await f.request(open.runId, undefined, () => Date.parse(weekOpenAt(f.deadline6)));
  assert.deepEqual(published.data, { runId: open.runId, status: 'succeeded', reason: null, season: 2026, week: 6 });
  const slate = (await f.db.query('select signature from public.gtl_weekly_slates where season=2026 and week=6')).rows[0].signature;
  assert.equal(slate.games.length, 2);
  assert.equal((await f.db.query("select count(*)::int n from public.gtl_feed_posts where kind='week_published' and week=6 and actor_id=$1", [id(1)])).rows[0].n, 1);
  assert.equal((await f.db.query("select count(*)::int n from public.gtl_schedule_templates where id='nfl-2026-week-06'")).rows[0].n, 1);
  assert.equal((await f.db.query("select count(*)::int n from public.gtl_access_audit where event='publish_week:2026:6'")).rows[0].n, 1);

  // A later run in the same week is a no-op; the next week is not published until its own Monday.
  await f.db.exec('delete from public.gtl_week_open_runs');
  const again = await f.dispatch();
  assert.deepEqual((await f.request(again.runId, undefined, () => Date.parse(weekOpenAt(f.deadline6)) + 3_600_000)).data, { runId: again.runId, status: 'skipped', reason: 'already_published' });
  await f.db.exec('delete from public.gtl_week_open_runs');
  const week7 = await f.dispatch();
  assert.deepEqual((await f.request(week7.runId, undefined, () => f.deadline6 + 1)).data, { runId: week7.runId, status: 'skipped', reason: 'not_open_yet' });
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_weekly_slates where week=7')).rows[0].n, 0);

  // Ballot window: Week 6 is published but not open, so every ballot write path is refused until Monday 00:00 PT.
  const openAt = iso(await f.rpc('gtl_week_open_at', [2026, 6]));
  assert.equal(openAt, weekOpenAt(slate.deadline * 1000));
  assert(Date.parse(openAt) > Date.now());
  await f.db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,6)', [id(2)]);
  await assert.rejects(() => f.db.query("insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,2026,6,'guess_spread','{\"picks\":{}}')", [id(2)]), /GTL_PREDICTION_NOT_OPEN/);
  await assert.rejects(() => f.db.query("insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,2026,6,'guess_spread',$2)", [id(2), { picks: { 'SEA-DEN': -3, 'ARI-LAR': 2 }, submittedAt: new Date().toISOString() }]), /GTL_PREDICTION_NOT_OPEN/, 'reported as not open before any odds-reference check');
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_weekly_ballots where week=6')).rows[0].n, 0);
  const week5 = (await f.db.query('select season,week from public.gtl_weekly_slates where week=5')).rows[0];
  await f.db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing', [id(2), week5.season, week5.week]);
  await f.db.query("insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,$2,$3,'guess_spread','{\"picks\":{}}')", [id(2), week5.season, week5.week]);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_weekly_ballots where user_id=$1', [id(2)])).rows[0].n, 1, 'an open week still accepts ballots; deadline checks are unchanged');

  // Commissioner-only status, never a token or hash.
  const meta = await f.rpc('gtl_read_week_open_schedule', [id(1)]);
  assert.equal(meta.enabled, true); assert.equal(meta.configured, true); assert.equal(meta.season, 2026);
  assert.deepEqual([meta.timeZone, meta.localTime, meta.weekday, meta.utcCrons], ['America/Los_Angeles', '00:00', 'Monday', ['0 7 * * 1', '0 8 * * 1']]);
  assert.equal(meta.lastStatus, 'skipped'); assert.equal(meta.lastReason, 'not_open_yet');
  assert.deepEqual([meta.currentWeek.season, meta.currentWeek.week, iso(meta.currentWeek.openAt)], [2026, 6, openAt]);
  assert.equal(JSON.stringify(meta).includes(runToken), false); assert.equal(/[0-9a-f]{64}/.test(JSON.stringify(meta)), false);
  await assert.rejects(() => f.rpc('gtl_read_week_open_schedule', [id(2)]), /GTL_COMMUNITY_FORBIDDEN/);

  // Expiry, claim and completion guards.
  await f.db.exec('delete from public.gtl_week_open_runs'); const stale = await f.dispatch();
  await f.db.exec("update public.gtl_week_open_runs set created_at=now()-interval '6 minutes'");
  assert.equal((await f.request(stale.runId)).status, 401, 'a five-minute-old capability is refused before any replay');
  await f.db.exec('delete from public.gtl_week_open_runs'); const running = await f.dispatch(); const runningToken = await f.capability(running.runId);
  const claim = await f.rpc('gtl_claim_week_open', [runningToken, running.runId]);
  assert.equal(claim.actorId, id(1)); assert.equal(claim.season, 2026);
  assert.equal((await f.rpc('gtl_claim_week_open', [runningToken, running.runId])).replay, true);
  await assert.rejects(() => f.rpc('gtl_complete_week_open', [running.runId, id(77), null]), /GTL_SCHEDULE_RUN/);
  await assert.rejects(() => f.rpc('gtl_complete_week_open', [running.runId, claim.claim, 'made_up']), /GTL_SCHEDULE_RUN/);
  await f.db.exec("update public.gtl_week_open_runs set claimed_at=now()-interval '11 minutes'");
  await assert.rejects(() => f.rpc('gtl_complete_week_open', [running.runId, claim.claim, null]), /GTL_SCHEDULE_EXPIRED/);
  assert.equal((await f.rpc('gtl_read_week_open_schedule', [id(1)])).lastReason, 'worker_timeout');
  await f.db.exec("update public.gtl_week_open_runs set slot_start=slot_start-interval '1 hour',created_at=now(),claimed_at=null,status='queued',claim_token=null");
  assert.equal((await f.request(running.runId, runningToken)).status, 401, 'an hour-slot boundary invalidates the capability');
  // A revoked commissioner stops the scheduler safely.
  await f.db.exec("delete from public.gtl_week_open_runs;update public.gtl_memberships set active=false");
  const revoked = await f.dispatch();
  assert.deepEqual((await f.request(revoked.runId)).data, { runId: revoked.runId, status: 'skipped', reason: 'commissioner_unavailable' });
  await assert.rejects(() => f.rpc('gtl_read_week_open_schedule', [id(1)]), /GTL_COMMUNITY_FORBIDDEN/, 'a revoked commissioner cannot read the status either');
  await f.db.exec("update public.gtl_memberships set active=true;update public.gtl_week_open_schedule set enabled=false");
  assert.deepEqual(await f.dispatch(), { status: 'disabled' });
  assert.equal((await f.rpc('gtl_read_week_open_schedule', [id(1)])).enabled, false);
});
