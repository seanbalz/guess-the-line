// The D-34 wind migration on disposable PGlite: grants, RLS, invoker functions, single flight,
// spacing, backoff, the daily cap, row checks, append-only storage and isolation from every scoring
// table. Never connects to the hosted project and never contacts Open-Meteo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { WIND_LICENSE_NOTE, handleWind, providerWindError } from '../cloud/wind.mjs';
import { createOpenMeteoProvider } from '../cloud/open-meteo.mjs';
import { forecastFetch } from './fixtures/open-meteo/build.mjs';

// Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const WIND = '20261013020000_gtl_wind_forecasts.sql';
const MIGRATIONS = [
  '20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql',
  '20261008185738_gtl_manual_odds_collection.sql', '20261008192528_gtl_scoped_spread_benchmark.sql', '20261008200926_gtl_twelve_hour_odds_refresh.sql',
  '20261009005145_gtl_social_bet_tracker.sql', '20261009120000_gtl_community_feed.sql', '20261009130000_gtl_league_interest.sql',
  '20261009140000_gtl_d23_data_rule.sql', '20261009150000_gtl_auto_open_week.sql', '20261012234500_gtl_game_officials.sql', WIND,
];
const SEAN = 30, TROY = 1, REMOVED = 2, STRANGER = 3;
const HOUR = 3600;
const TABLES = ['gtl_wind_fetches', 'gtl_wind_fetch_outcomes', 'gtl_wind_forecasts'];
const FUNCTIONS = ['gtl_begin_wind_fetch', 'gtl_finish_wind_fetch', 'gtl_read_wind_forecasts'];
// Week 6 venue points from shared/wind-venues.mjs (the SQL never sees the venue table).
const VENUES = { 'SEA-DEN': ['DEN00', 39.744, -105.02], 'PIT-TB': ['TAM00', 27.976, -82.503], 'NYJ-NE': ['BOS00', 42.091, -71.264], 'HOU-JAX': ['LON00', 51.556, -0.28],
  'LAC-KC': ['KAN00', 39.049, -94.484], 'DAL-GB': ['GNB00', 44.501, -88.062], 'WAS-SF': ['SFO01', 37.403, -121.97], 'BAL-CLE': ['CLE00', 41.506, -81.7],
  'CAR-PHI': ['PHI00', 39.901, -75.168], 'NO-NYG': ['NYC01', 40.813, -74.074], 'ARI-LAR': ['LAX01', 33.953, -118.339] };

/** Wind rows anchored to the UTC day must never straddle midnight: wait out the first and last two minutes of a UTC day. */
async function awayFromMidnight() {
  const seconds = () => Math.floor(Date.now() / 1000) % 86400;
  while (seconds() < 120 || seconds() > 86400 - 120) await new Promise(resolve => setTimeout(resolve, 1000));
}

async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  for (const file of MIGRATIONS) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file === MIGRATIONS[0]) {
      await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', seed()]);
      for (const n of [SEAN, TROY, REMOVED, STRANGER]) await db.query('insert into auth.users values($1)', [id(n)]);
      await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner'),($2,'sean-troy-luke','troy','player')", [id(SEAN), id(TROY)]);
    }
    if (file === MIGRATIONS[1]) await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Sean'),($2,'Troy'),($3,'Removed')", [id(SEAN), id(TROY), id(REMOVED)]);
    if (file === '20261009120000_gtl_community_feed.sql') await db.query('insert into public.gtl_community_removals(user_id,removed_by) values($1,$2)', [id(REMOVED), id(SEAN)]);
  }
  // Week 6 with kickoffs relative to now (whole seconds, as published slates store them).
  const base = Math.floor(Date.now() / 1000);
  const leads = { 'SEA-DEN': 10, 'PIT-TB': 20, 'NYJ-NE': 30, 'HOU-JAX': 40, 'LAC-KC': 50, 'DAL-GB': 60, 'WAS-SF': 70, 'BAL-CLE': 100, 'CAR-PHI': 130, 'NO-NYG': -1, 'ARI-LAR': 20 };
  const kickoffs = Object.fromEntries(Object.entries(leads).map(([game, h]) => [game, base + h * HOUR]));
  const slate = (season, week, games) => db.query('insert into public.gtl_weekly_slates values($1,$2,$3)', [season, week,
    { season, week, deadline: Math.min(...games.map(([, k]) => k)), games: games.map(([gid, k]) => ({ id: gid, away: gid.split('-')[0], home: gid.split('-')[1], kickoff: k })) }]);
  await slate(2026, 6, Object.entries(kickoffs));
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const rpc = (name, params, { timezone } = {}) => db.transaction(async tx => {
    await tx.exec('set local role service_role');
    if (timezone) await tx.exec(`set local timezone to '${timezone}'`);
    return (await tx.query(`select public.${name}(${params.map((_, i) => `$${i + 1}`).join(',')}) value`, params)).rows[0].value;
  });
  const service = { rpc: async (name, args) => { try { return await rpc(name, Object.values(args)); } catch (error) { throw providerWindError(error.message); } } };
  const game = (gid, overrides = {}) => { const [venueId, latitude, longitude] = VENUES[gid]; return { gameId: gid, venueId, latitude, longitude, kickoff: new Date(kickoffs[gid] * 1000).toISOString(), ...overrides }; };
  let request = 1000;
  const begin = (games, { user = TROY, week = 6, req = id(++request) } = {}) => rpc('gtl_begin_wind_fetch', [id(user), req, 2026, week, JSON.stringify(games)]);
  const rowFor = (g, overrides = {}) => {
    const kick = Date.parse(g.kickoff), forecast = Math.floor((kick + 1800e3) / 3600e3) * 3600e3, gust = Math.floor(kick / 3600e3) * 3600e3 + 3600e3;
    return { gameId: g.gameId, venueId: g.venueId, latitude: g.latitude, longitude: g.longitude, gridLatitude: g.latitude + 0.012, gridLongitude: g.longitude - 0.012,
      elevationM: 180.0, kickoff: g.kickoff, forecastHour: new Date(forecast).toISOString(), gustHour: new Date(gust).toISOString(), windMph: 14.2, gustMph: 27.5,
      directionDeg: 247, temperatureF: 49.3, precipitationProbability: 25, precipitationIn: 0.004, generationMs: 0.65,
      sourceUrl: 'https://api.open-meteo.com/v1/forecast?latitude=39.744&longitude=-105.020', ...overrides };
  };
  const finish = (started, status, { error = null, http = null, rows, lease = started.lease, timezone } = {}) => rpc('gtl_finish_wind_fetch',
    [started.requestId, lease, status, error, http, rows === undefined ? (status === 'succeeded' ? JSON.stringify(started.games.map(g => rowFor(g))) : null) : rows === null ? null : JSON.stringify(rows)], { timezone });
  /** Moves every wind timestamp back, as if that many seconds had passed (superuser only; the service role has no update grant). */
  const age = async seconds => {
    await db.query(`update public.gtl_wind_fetches set started_at = started_at - make_interval(secs => $1), lease_until = lease_until - make_interval(secs => $1)`, [seconds]);
    await db.query('update public.gtl_wind_fetch_outcomes set finished_at = finished_at - make_interval(secs => $1)', [seconds]);
    await db.query('update public.gtl_wind_forecasts set fetched_at = fetched_at - make_interval(secs => $1)', [seconds]);
  };
  const clear = () => db.exec('delete from public.gtl_wind_forecasts; delete from public.gtl_wind_fetch_outcomes; delete from public.gtl_wind_fetches;');
  const count = async table => (await db.query(`select count(*)::int n from public.${table}`)).rows[0].n;
  /** An attempt row written directly (superuser): `at` is an SQL timestamptz expression; it has an outcome and an expired lease. */
  const pastAttempt = async (at, { locations = 1, status = 'succeeded', error = null } = {}) => {
    const rid = id(++request);
    await db.query(`insert into public.gtl_wind_fetches(id,season,week,started_at,lease_token,lease_until,locations,games,window_start,window_end)
      values($1,2026,6,${at},gen_random_uuid(),${at} + interval '20 seconds',$2,$3,${at},${at} + interval '1 hour')`, [rid, locations, JSON.stringify([game('SEA-DEN')])]);
    await db.query(`insert into public.gtl_wind_fetch_outcomes(fetch_id,finished_at,status,error_code,http_status,stored) values($1,${at} + interval '5 seconds',$2,$3,null,0)`, [rid, status, error]);
    return rid;
  };
  return { db, as, rpc, service, game, begin, finish, rowFor, age, clear, count, pastAttempt, kickoffs, slate, base };
}

test('wind forecasts: service-only, insert-only tables and invoker functions', { skip }, async t => {
  const f = await fixture(t);
  for (const table of TABLES) {
    assert.equal((await f.db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true, table);
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(() => f.as(role, `select * from public.${table}`), /permission denied/, `${role} select ${table}`);
      await assert.rejects(() => f.as(role, `insert into public.${table} default values`), /permission denied/, `${role} insert ${table}`);
    }
    await assert.rejects(() => f.as('service_role', `delete from public.${table}`), /permission denied/, `service_role delete ${table}`);
  }
  await assert.rejects(() => f.as('service_role', 'update public.gtl_wind_fetches set lease_until = now()'), /permission denied/);
  await assert.rejects(() => f.as('service_role', "update public.gtl_wind_fetch_outcomes set status = 'failed'"), /permission denied/);
  await assert.rejects(() => f.as('service_role', 'update public.gtl_wind_forecasts set wind_mph = 0'), /permission denied/);
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(() => f.as(role, 'select public.gtl_read_wind_forecasts($1,2026,6)', [id(TROY)]), /permission denied/);
    await assert.rejects(() => f.as(role, "select public.gtl_begin_wind_fetch($1,$1,2026,6,'[]')", [id(TROY)]), /permission denied/);
    await assert.rejects(() => f.as(role, "select public.gtl_finish_wind_fetch($1,$1,'failed','WIND_HTTP',null,null)", [id(TROY)]), /permission denied/);
  }
  const flags = (await f.db.query('select proname,prosecdef,proconfig from pg_proc where proname = any($1) order by proname', [FUNCTIONS])).rows;
  assert.deepEqual(flags.map(r => [r.proname, r.prosecdef, r.proconfig]), FUNCTIONS.map(name => [name, false, ['search_path=""']]));
  const license = (await f.db.query("select pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.gtl_wind_forecasts'::regclass and pg_get_constraintdef(oid) like '%license_note%'")).rows[0].def;
  assert.ok(license.includes(WIND_LICENSE_NOTE), 'the SQL license note is the JS credit, character for character');
  assert.ok(!fs.readFileSync(`supabase/migrations/${WIND}`, 'utf8').includes('requested_by'), 'no member id is stored with an attempt');
  // The attempt's games column only takes the planned game objects.
  for (const games of ['[]', '[{"gameId":"SEA-DEN"}]', '["SEA-DEN"]', '{}']) {
    await assert.rejects(() => f.db.query(`insert into public.gtl_wind_fetches(id,season,week,started_at,lease_token,lease_until,locations,games,window_start,window_end)
      values(gen_random_uuid(),2026,6,now(),gen_random_uuid(),now() + interval '20 seconds',1,$1,now(),now() + interval '1 hour')`, [games]), /check constraint/, games);
  }
});

test('read: members only, any published week, the database clock, no user ids', { skip }, async t => {
  const f = await fixture(t);
  for (const user of [STRANGER, REMOVED]) await assert.rejects(() => f.rpc('gtl_read_wind_forecasts', [id(user), 2026, 6]), /GTL_COMMUNITY_MEMBER/);
  for (const [season, week] of [[1999, 6], [2026, 0], [2026, 26], [null, 6]]) await assert.rejects(() => f.rpc('gtl_read_wind_forecasts', [id(TROY), season, week]), /GTL_WIND_INVALID/);
  const none = await f.rpc('gtl_read_wind_forecasts', [id(TROY), 2026, 9]);
  assert.deepEqual([none.published, none.games, none.latest], [false, [], {}]);
  const read = await f.rpc('gtl_read_wind_forecasts', [id(TROY), 2026, 6]);
  assert.equal(read.published, true);
  assert.ok(Math.abs(Date.parse(read.now) - Date.now()) < 60_000);
  assert.deepEqual(read.games.find(g => g.id === 'SEA-DEN'), { id: 'SEA-DEN', away: 'SEA', home: 'DEN', kickoff: f.kickoffs['SEA-DEN'] });
  assert.deepEqual([read.lastAttempt, read.budget], [null, { usedToday: 0, cap: 200 }]);
  assert.ok(!('current' in read), 'every published week is eligible; there is no current-week flag');
  assert.doesNotMatch(JSON.stringify(read), /00000000-0000-4000-8000/);
});

test('begin: strict games, refusals as reasons, single flight, spacing, the TTL re-check and the lease', { skip }, async t => {
  const f = await fixture(t);
  await t.test('every malformed or off-slate game list is GTL_WIND_INVALID and writes nothing', async () => {
    const den = f.game('SEA-DEN');
    const cases = {
      'unknown game': [{ ...den, gameId: 'SEA-SEA' }], 'kickoff mismatch': [{ ...den, kickoff: new Date(f.kickoffs['SEA-DEN'] * 1000 + 60_000).toISOString() }],
      'duplicate game': [den, den], 'latitude 91': [{ ...den, latitude: 91 }], 'longitude 181': [{ ...den, longitude: 181 }], 'four-decimal point': [{ ...den, latitude: 39.7441 }],
      'bad venue id': [{ ...den, venueId: 'DEN0' }], 'string latitude': [{ ...den, latitude: '39.744' }], 'extra key': [{ ...den, user: id(TROY) }],
      'missing key': [{ gameId: den.gameId, venueId: den.venueId, latitude: den.latitude, longitude: den.longitude }], 'lead over 120 h': [f.game('CAR-PHI')],
      'offset kickoff text': [{ ...den, kickoff: den.kickoff.replace('Z', '+00:00') }], 'empty list': [], 'one venue id, two points': [den, { ...f.game('PIT-TB'), venueId: 'DEN00' }],
      'more than 16 games': Array.from({ length: 17 }, () => den),
    };
    for (const [name, games] of Object.entries(cases)) await assert.rejects(() => f.begin(games), /GTL_WIND_INVALID/, name);
    await assert.rejects(() => f.begin([den], { week: 9 }), /GTL_WIND_INVALID/, 'an unpublished week');
    await assert.rejects(() => f.rpc('gtl_begin_wind_fetch', [id(TROY), id(1), 2026, 6, null]), /GTL_WIND_INVALID/);
    await assert.rejects(() => f.begin([den], { user: STRANGER }), /GTL_COMMUNITY_MEMBER/);
    await assert.rejects(() => f.begin([den], { user: REMOVED }), /GTL_COMMUNITY_MEMBER/);
    assert.equal(await f.count('gtl_wind_fetches'), 0);
  });
  await t.test('a game that has kicked off is dropped, not refused', async () => {
    assert.deepEqual(await f.begin([f.game('NO-NYG')]), { started: false, reason: 'not_due' });
    const started = await f.begin([f.game('NO-NYG'), f.game('SEA-DEN')]);
    assert.equal(started.started, true);
    assert.deepEqual(started.games.map(g => g.gameId), ['SEA-DEN']);
    await f.clear();
  });
  await t.test('busy while a lease is live, then cooldown for 60 s after any attempt', async () => {
    const first = await f.begin([f.game('SEA-DEN'), f.game('HOU-JAX')]);
    assert.deepEqual([first.started, first.locations, first.games.map(g => g.gameId)], [true, 2, ['SEA-DEN', 'HOU-JAX']]);
    assert.ok(Math.abs(Date.parse(first.leaseUntil) - Date.now() - 20_000) < 5_000, 'a 20 s lease');
    assert.deepEqual([first.windowStart, first.windowEnd].map(t => new Date(t).toISOString()),
      [new Date(Math.floor(f.kickoffs['SEA-DEN'] / 3600) * 3600e3).toISOString(), new Date(Math.floor(f.kickoffs['HOU-JAX'] / 3600) * 3600e3 + 3600e3).toISOString()]);
    assert.deepEqual(await f.begin([f.game('SEA-DEN')]), { started: false, reason: 'busy' });
    assert.deepEqual((await f.finish(first, 'succeeded')).stored, 2);
    assert.deepEqual(await f.begin([f.game('PIT-TB')]), { started: false, reason: 'cooldown' });
    await assert.rejects(() => f.begin([f.game('PIT-TB')], { req: first.requestId }), /GTL_WIND_INVALID/, 'a request id is used once');
    await f.age(61);
    const second = await f.begin([f.game('SEA-DEN'), f.game('PIT-TB')]);
    assert.deepEqual(second.games.map(g => g.gameId), ['PIT-TB'], 'SEA-DEN was fetched 61 s ago (TTL 1 h at 10 h)');
    await f.finish(second, 'succeeded');
    await f.clear();
  });
  await t.test('TTL by lead: 1 h within 18 h, 3 h within 72 h, 6 h within 120 h; not_due when nothing is left', async () => {
    const started = await f.begin(['SEA-DEN', 'HOU-JAX', 'BAL-CLE'].map(g => f.game(g)));
    await f.finish(started, 'succeeded');
    const all = ['SEA-DEN', 'HOU-JAX', 'BAL-CLE'].map(g => f.game(g));
    await f.age(59 * 60);
    assert.deepEqual(await f.begin(all), { started: false, reason: 'not_due' });
    await f.age(2 * 60);
    const hour = await f.begin(all);
    assert.deepEqual(hour.games.map(g => g.gameId), ['SEA-DEN']);
    await f.finish(hour, 'succeeded');
    await f.clear();
    await f.finish(await f.begin([f.game('HOU-JAX')]), 'succeeded');
    await f.age(3 * 3600 - 60);
    assert.deepEqual((await f.begin([f.game('HOU-JAX')])).reason, 'not_due', 'HOU-JAX at 40 h is not due before 3 h');
    await f.age(120);
    assert.deepEqual((await f.begin(all)).games.map(g => g.gameId), ['SEA-DEN', 'HOU-JAX', 'BAL-CLE']);
    await f.clear();
    await f.finish(await f.begin([f.game('BAL-CLE')]), 'succeeded');
    await f.age(6 * 3600 - 60);
    assert.equal((await f.begin([f.game('BAL-CLE')])).reason, 'not_due', 'BAL-CLE at 100 h is not due before 6 h');
    await f.age(120);
    assert.equal((await f.begin([f.game('BAL-CLE')])).started, true);
    await f.clear();
  });
  await t.test('an expired lease gets a WIND_LEASE_EXPIRED outcome on the next begin, and its finish replays that', async () => {
    const dead = await f.begin([f.game('SEA-DEN')]);
    await f.db.query("update public.gtl_wind_fetches set lease_until = now() - interval '1 second', started_at = now() - interval '2 minutes'");
    assert.deepEqual(await f.begin([f.game('SEA-DEN')]), { started: false, reason: 'backoff' }, 'a lease that expired without an outcome backs off 15 minutes');
    const outcome = (await f.db.query('select status,error_code,stored from public.gtl_wind_fetch_outcomes where fetch_id=$1', [dead.requestId])).rows[0];
    assert.deepEqual(outcome, { status: 'failed', error_code: 'WIND_LEASE_EXPIRED', stored: 0 });
    const replay = await f.finish(dead, 'succeeded');
    assert.deepEqual([replay.replay, replay.status, replay.errorCode], [true, 'failed', 'WIND_LEASE_EXPIRED']);
    assert.equal(await f.count('gtl_wind_forecasts'), 0);
    await f.clear();
    // A finish that arrives after the lease ran out stores nothing.
    const late = await f.begin([f.game('SEA-DEN')]);
    await f.db.query("update public.gtl_wind_fetches set lease_until = now() - interval '1 second', started_at = now() - interval '30 seconds'");
    assert.deepEqual(await f.finish(late, 'succeeded'), { status: 'failed', errorCode: 'WIND_LEASE_EXPIRED', stored: 0, replay: false });
    assert.equal(await f.count('gtl_wind_forecasts'), 0);
    await f.clear();
  });
  await t.test('a Monday-night game is still fetched after the next week is published (no current-week rule)', async () => {
    await f.slate(2026, 7, [['PIT-NO', f.base + 150 * HOUR]]);
    const started = await f.begin([f.game('SEA-DEN')]);
    assert.equal(started.started, true);
    await f.clear();
  });
});

test('backoff after failures and the daily cap, with rows anchored to the UTC day', { skip }, async t => {
  const f = await fixture(t);
  await awayFromMidnight();
  const den = [f.game('SEA-DEN')];
  await t.test('15 minutes after one failure', async () => {
    await f.pastAttempt("clock_timestamp() - interval '14 minutes'", { status: 'failed', error: 'WIND_HTTP' });
    assert.equal((await f.begin(den)).reason, 'backoff');
    await f.clear();
    await f.pastAttempt("clock_timestamp() - interval '16 minutes'", { status: 'failed', error: 'WIND_HTTP' });
    assert.equal((await f.begin(den)).started, true);
    await f.clear();
  });
  await t.test('60 minutes after two consecutive failures or any hourly rate limit', async () => {
    await f.pastAttempt("clock_timestamp() - interval '3 hours'", { status: 'failed', error: 'WIND_TIMEOUT' });
    await f.pastAttempt("clock_timestamp() - interval '30 minutes'", { status: 'failed', error: 'WIND_UNAVAILABLE' });
    assert.equal((await f.begin(den)).reason, 'backoff', 'two in a row');
    await f.clear();
    await f.pastAttempt("clock_timestamp() - interval '3 hours'", { status: 'failed', error: 'WIND_TIMEOUT' });
    await f.pastAttempt("clock_timestamp() - interval '61 minutes'", { status: 'failed', error: 'WIND_UNAVAILABLE' });
    assert.equal((await f.begin(den)).started, true, 'two in a row, 61 minutes ago');
    await f.clear();
  });
  await t.test('only failures since the last success count', async () => {
    await f.clear();
    await f.pastAttempt("clock_timestamp() - interval '3 hours'", { status: 'failed', error: 'WIND_TIMEOUT' });
    await f.pastAttempt("clock_timestamp() - interval '2 hours'");
    await f.pastAttempt("clock_timestamp() - interval '30 minutes'", { status: 'failed', error: 'WIND_UNAVAILABLE' });
    assert.equal((await f.begin(den)).started, true, 'one failure since the success, 30 minutes ago');
    await f.clear();
    await f.pastAttempt("clock_timestamp() - interval '45 minutes'", { status: 'failed', error: 'WIND_RATE_LIMIT' });
    assert.equal((await f.begin(den)).reason, 'backoff', 'an hourly rate limit waits 60 minutes');
    await f.clear();
    await f.pastAttempt("clock_timestamp() - interval '61 minutes'", { status: 'failed', error: 'WIND_RATE_LIMIT' });
    assert.equal((await f.begin(den)).started, true);
    await f.clear();
  });
  await t.test('until the next 00:00 UTC after the daily limit', async () => {
    await f.pastAttempt("date_trunc('day', clock_timestamp(), 'UTC') + interval '1 second'", { status: 'failed', error: 'WIND_RATE_LIMIT_DAILY' });
    assert.equal((await f.begin(den)).reason, 'backoff');
    await f.clear();
    await f.pastAttempt("date_trunc('day', clock_timestamp(), 'UTC') - interval '2 hours'", { status: 'failed', error: 'WIND_RATE_LIMIT_DAILY' });
    assert.equal((await f.begin(den)).started, true, 'yesterday\'s daily limit ended at midnight');
    await f.clear();
  });
  await t.test('200 calls per UTC day, failures included; a request is trimmed to the remaining calls, nearest kickoff first', async () => {
    const today = "date_trunc('day', clock_timestamp(), 'UTC') + interval '1 second'";
    for (let i = 0; i < 12; i++) await f.pastAttempt(today, { locations: 16, status: i % 3 ? 'succeeded' : 'failed', error: i % 3 ? null : 'WIND_TIMEOUT' });
    await f.pastAttempt(today, { locations: 3 }); // 195 used today
    await f.pastAttempt("date_trunc('day', clock_timestamp(), 'UTC') - interval '1 second'", { locations: 16 }); // yesterday: not counted
    const six = ['SEA-DEN', 'PIT-TB', 'NYJ-NE', 'HOU-JAX', 'LAC-KC', 'DAL-GB'].map(g => f.game(g));
    assert.equal((await f.rpc('gtl_read_wind_forecasts', [id(TROY), 2026, 6])).budget.usedToday, 195);
    const trimmed = await f.begin(six);
    assert.deepEqual([trimmed.started, trimmed.locations, trimmed.games.map(g => g.gameId)], [true, 5, ['SEA-DEN', 'PIT-TB', 'NYJ-NE', 'HOU-JAX', 'LAC-KC']]);
    await f.finish(trimmed, 'succeeded');
    // Past the 60 s spacing, still today: the day's rows were written at 00:00:01 UTC.
    await f.db.query("update public.gtl_wind_fetches set started_at = date_trunc('day', clock_timestamp(), 'UTC') + interval '2 seconds', lease_until = date_trunc('day', clock_timestamp(), 'UTC') + interval '22 seconds' where id = $1", [trimmed.requestId]);
    assert.equal((await f.rpc('gtl_read_wind_forecasts', [id(TROY), 2026, 6])).budget.usedToday, 200);
    assert.deepEqual(await f.begin([f.game('DAL-GB')]), { started: false, reason: 'budget' });
    await f.clear();
  });
});

test('finish: lease, allowlisted failures, every row checked before anything is written, idempotent replay', { skip }, async t => {
  const f = await fixture(t);
  const start = async games => { await f.clear(); return f.begin(games.map(g => f.game(g))); };
  await t.test('a wrong or missing lease, or an unknown request, is GTL_WIND_LEASE', async () => {
    const s = await start(['SEA-DEN']);
    await assert.rejects(() => f.finish(s, 'failed', { error: 'WIND_HTTP', lease: id(5) }), /GTL_WIND_LEASE/);
    await assert.rejects(() => f.finish({ ...s, requestId: id(77) }, 'failed', { error: 'WIND_HTTP' }), /GTL_WIND_LEASE/);
    await assert.rejects(() => f.rpc('gtl_finish_wind_fetch', [s.requestId, null, 'failed', 'WIND_HTTP', null, null]), /GTL_WIND_LEASE/);
  });
  await t.test('failed: only the fixed codes, never rows; the HTTP status only from the allowlist', async () => {
    const s = await start(['SEA-DEN']);
    for (const error of ['WIND_LEASE_EXPIRED', 'BOGUS', null]) await assert.rejects(() => f.finish(s, 'failed', { error }), /GTL_WIND_INVALID/, String(error));
    await assert.rejects(() => f.finish(s, 'failed', { error: 'WIND_HTTP', rows: [] }), /GTL_WIND_INVALID/);
    await assert.rejects(() => f.finish(s, 'unknown'), /GTL_WIND_INVALID/);
    assert.deepEqual(await f.finish(s, 'failed', { error: 'WIND_HTTP', http: 418 }), { status: 'failed', errorCode: 'WIND_HTTP', stored: 0, replay: false });
    assert.deepEqual((await f.db.query('select status,error_code,http_status from public.gtl_wind_fetch_outcomes')).rows, [{ status: 'failed', error_code: 'WIND_HTTP', http_status: null }]);
    const again = await f.finish(s, 'succeeded');
    assert.deepEqual([again.replay, again.status], [true, 'failed']);
  });
  await t.test('succeeded rows are rejected whole for any bad row', async () => {
    const s = await start(['SEA-DEN', 'HOU-JAX']);
    const [den, lon] = s.games, good = [f.rowFor(den), f.rowFor(lon)];
    const bad = {
      'a game outside the attempt': [f.rowFor(den), f.rowFor(f.game('PIT-TB'))],
      'coordinates differ from the attempt': [f.rowFor(den, { latitude: 39.745 }), good[1]],
      'a grid cell 0.6° away': [f.rowFor(den, { gridLatitude: 40.344 }), good[1]],
      'a forecast hour that is not the nearest hour': [f.rowFor(den, { forecastHour: new Date(Date.parse(good[0].forecastHour) + 3600e3).toISOString() }), good[1]],
      'a gust hour that is not the containing hour': [f.rowFor(den, { gustHour: new Date(Date.parse(good[0].gustHour) - 3600e3).toISOString() }), good[1]],
      'wind 250': [f.rowFor(den, { windMph: 250 }), good[1]], 'two wind decimals': [f.rowFor(den, { windMph: 14.25 }), good[1]],
      'a negative gust': [f.rowFor(den, { gustMph: -1 }), good[1]], 'chance 101': [f.rowFor(den, { precipitationProbability: 101 }), good[1]],
      'direction 400': [f.rowFor(den, { directionDeg: 400 }), good[1]], 'temperature 141': [f.rowFor(den, { temperatureF: 141 }), good[1]],
      'a wrong source host': [f.rowFor(den, { sourceUrl: 'https://example.invalid/v1/forecast?x' }), f.rowFor(lon, { sourceUrl: 'https://example.invalid/v1/forecast?x' })],
      'two source URLs': [good[0], f.rowFor(lon, { sourceUrl: `${good[1].sourceUrl}&x=1` })],
      'a duplicate game': [good[0], good[0]], 'an extra key': [{ ...good[0], model: 'gfs' }, good[1]],
      'a missing key': [Object.fromEntries(Object.entries(good[0]).filter(([k]) => k !== 'elevationM')), good[1]],
      'a string wind': [{ ...good[0], windMph: '14.2' }, good[1]], 'a negative generation time': [f.rowFor(den, { generationMs: -1 }), good[1]],
      'a payload over 64 KB': Array.from({ length: 2 }, (_, i) => f.rowFor(s.games[i], { sourceUrl: `https://api.open-meteo.com/v1/forecast?${'x'.repeat(40_000)}` })),
    };
    for (const [name, rows] of Object.entries(bad)) await assert.rejects(() => f.finish(s, 'succeeded', { rows }), /GTL_WIND_INVALID/, name);
    assert.deepEqual([await f.count('gtl_wind_forecasts'), await f.count('gtl_wind_fetch_outcomes')], [0, 0], 'nothing was written');
    // Valid rows (with the session in a half-hour time zone) are stored with SQL's own constants.
    const done = await f.finish(s, 'succeeded', { rows: good, timezone: 'Asia/Kolkata' });
    assert.deepEqual(done, { status: 'succeeded', errorCode: null, stored: 2, skipped: 0, replay: false });
    const rows = (await f.db.query('select game_id,venue_id,wind_mph::float8 wind,gust_mph::float8 gust,model,source,license_note,fetched_at < kickoff ahead,forecast_hour,gust_hour,kickoff from public.gtl_wind_forecasts order by game_id')).rows;
    assert.deepEqual(rows.map(r => [r.game_id, r.venue_id, r.wind, r.gust, r.model, r.source, r.license_note, r.ahead]), [
      ['HOU-JAX', 'LON00', 14.2, 27.5, 'best_match', 'Open-Meteo forecast API', WIND_LICENSE_NOTE, true],
      ['SEA-DEN', 'DEN00', 14.2, 27.5, 'best_match', 'Open-Meteo forecast API', WIND_LICENSE_NOTE, true]]);
    for (const r of rows) {
      assert.equal(r.forecast_hour.getTime(), Math.floor((r.kickoff.getTime() + 1800e3) / 3600e3) * 3600e3);
      assert.equal(r.gust_hour.getTime(), Math.floor(r.kickoff.getTime() / 3600e3) * 3600e3 + 3600e3);
    }
    const replay = await f.finish(s, 'succeeded', { rows: good });
    assert.deepEqual([replay.replay, replay.stored], [true, 2]);
    assert.equal(await f.count('gtl_wind_forecasts'), 2, 'a replay writes nothing');
    // The hour checks hold whatever the session TimeZone is.
    await f.db.exec("set timezone to 'Asia/Kolkata'");
    assert.equal((await f.db.query("select count(*)::int n from public.gtl_wind_forecasts where forecast_hour = date_trunc('hour', kickoff + interval '30 minutes', 'UTC')")).rows[0].n, 2);
    await f.db.exec("set timezone to 'UTC'");
  });
  await t.test('a row whose game has kicked off by the finish is skipped and counted', async () => {
    await f.clear();
    const rid = id(4242), lease = id(4243);
    const past = { ...f.game('NO-NYG') };
    await f.db.query(`insert into public.gtl_wind_fetches(id,season,week,started_at,lease_token,lease_until,locations,games,window_start,window_end)
      values($1,2026,6,clock_timestamp(),$2,clock_timestamp() + interval '20 seconds',1,$3,date_trunc('hour', $4::timestamptz),date_trunc('hour', $4::timestamptz) + interval '1 hour')`, [rid, lease, JSON.stringify([past]), past.kickoff]);
    const done = await f.finish({ requestId: rid, lease, games: [past] }, 'succeeded');
    assert.deepEqual([done.stored, done.skipped], [0, 1]);
    assert.equal(await f.count('gtl_wind_forecasts'), 0);
  });
});

test('append-only snapshots, the newest per game, isolation from scoring tables, and the route end to end', { skip }, async t => {
  const f = await fixture(t);
  const scoring = ['gtl_weekly_ballots', 'gtl_weekly_versions', 'gtl_access_audit', 'gtl_feed_posts', 'gtl_market_snapshots', 'gtl_weekly_slates'];
  const before = Object.fromEntries(await Promise.all(scoring.map(async table => [table, await f.count(table)])));
  const first = await f.begin([f.game('SEA-DEN')]);
  await f.finish(first, 'succeeded', { rows: [f.rowFor(first.games[0], { windMph: 9.6 })] });
  await f.age(2 * 3600);
  const second = await f.begin([f.game('SEA-DEN')]);
  await f.finish(second, 'succeeded', { rows: [f.rowFor(second.games[0], { windMph: 16.4 })] });
  assert.equal(await f.count('gtl_wind_forecasts'), 2, 'the earlier snapshot remains');
  const read = await f.rpc('gtl_read_wind_forecasts', [id(TROY), 2026, 6]);
  assert.equal(read.latest['SEA-DEN'].windMph, 16.4);
  assert.deepEqual(Object.keys(read.latest), ['SEA-DEN']);
  assert.equal(read.lastAttempt.status, 'succeeded');
  await f.clear();

  // The route over this database and a builder-backed Open-Meteo stand-in: one request, then reads from storage.
  const fake = forecastFetch(point => (point.latitude === 39.744 ? { values: () => ({ wind_speed_10m: 14.2, wind_gusts_10m: 27.5 }) } : {}));
  const service = { rpc: f.service.rpc, provider: createOpenMeteoProvider({ fetchImpl: fake.fetchImpl }) };
  const user = { id: id(TROY), emailConfirmed: true };
  const body = await handleWind({ route: '/wind/read', body: { season: 2026, week: 6 }, user, service });
  assert.equal(body.refresh.outcome, 'fetched');
  assert.equal(fake.calls.length, 1);
  const sent = new URL(fake.calls[0].url).searchParams.get('latitude').split(',');
  assert.equal(sent.length, 8, 'outdoor games within 120 h that have not kicked off: no canopy, no kicked-off game, nothing past 120 h');
  assert.deepEqual([body.games['SEA-DEN'].status, body.games['SEA-DEN'].wind.windMph, body.games['ARI-LAR'].status, body.games['CAR-PHI'].status, body.games['NO-NYG'].status],
    ['forecast', 14.2, 'indoor', 'not_yet', 'none']);
  const again = await handleWind({ route: '/wind/read', body: { season: 2026, week: 6 }, user, service });
  assert.ok(['not_due', 'cooldown'].includes(again.refresh.outcome));
  assert.equal(fake.calls.length, 1, 'the second read makes no request');
  assert.deepEqual([await f.count('gtl_wind_fetches'), await f.count('gtl_wind_forecasts')], [1, 8]);
  await assert.rejects(() => handleWind({ route: '/wind/read', body: { season: 2026, week: 6 }, user: { id: id(STRANGER) }, service }), error => error.status === 403);
  const after = Object.fromEntries(await Promise.all(scoring.map(async table => [table, await f.count(table)])));
  assert.deepEqual(after, before, 'no ballot, version, audit, feed, market or slate row was written');
});
