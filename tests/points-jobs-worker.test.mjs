import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ALL } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { POINTS_JOBS_RPCS, SOURCE_LIMITS, createPointsJobsAdapter, createPointsJobsHandler, createPointsSources, runPointsJobs } from '../cloud/points-jobs.mjs';
import { NFLVERSE, POINTS_RULES, draftSlate, pointsOpensAt, scheduleGames } from '../shared/points-jobs.mjs';
import { fantasySeason } from '../shared/fantasy-refresh.mjs';

// P-03 Task C (D-56): the gtl-points-jobs worker. Unit contracts run on stubs; the end-to-end runs use local PGlite with
// ALL migrations, the real adapter through a fetchImpl stub that executes each RPC as service_role, the net.http_post
// outbox double (tests/week-open.test.mjs) for the one-run capability, a stubbed Track 1 snapshot (the committed Week 6
// snapshot, relabelled and moved by whole weeks to real time) and small nflverse CSV fixtures served through the real
// fetchText. Players, guesses and House values are fictional sentinels. Nothing connects to a hosted service.
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const HOUR = 3_600_000, DAY = 24 * HOUR, WEEK = 7 * DAY, MIB = 1024 * 1024;
const ENDPOINT = 'https://example.supabase.co/functions/v1/gtl-points-jobs';
const SERVICE_KEY = 'fixture-service-role-key';
const SEASON = fantasySeason(Date.now());
const LAST_MODIFIED = 'Mon, 26 Oct 2026 04:46:00 GMT';
const pad = n => String(n).padStart(2, '0');
const sha = text => createHash('sha256').update(text).digest('hex');
const iso = value => new Date(value).toISOString();
const hex64 = /[0-9a-f]{64}/;

// ---- fixtures ----
const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const eastern = instant => { const p = Object.fromEntries(ET.formatToParts(new Date(instant)).map(x => [x.type, x.value])); return [`${p.year}-${p.month}-${p.day}`, `${p.hour}:${p.minute}`]; };
const GAME_HEADER = 'game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location';
const gameRow = (gameId, week, kickoff, away, home) => { const [day, time] = eastern(kickoff); return [gameId, SEASON, 'REG', week, day, 'Sunday', time, away, '', home, '', 'Home'].join(','); };
const NFL_CODE = { LAR: 'LA' };
const nfl = code => NFL_CODE[code] ?? code;

const BASE = JSON.parse(readFileSync(new URL('../shared/fantasy/2026-week-06.json', import.meta.url), 'utf8'));
const BASE_FIRST = Math.min(...BASE.players.filter(p => p.weekly?.kickoff).map(p => Date.parse(p.weekly.kickoff)));
/** The committed Week 6 snapshot as week `week` of SEASON (stats through `through`), every kickoff moved by whole weeks so
 *  the first one is at least `ahead` from now, with the matching games.csv rows and Track 1 index entry. */
function snapshotFor({ week, through = week - 1, ahead = 8 * DAY }) {
  const shift = Math.ceil((Date.now() + ahead - BASE_FIRST) / WEEK) * WEEK;
  const players = BASE.players.map(p => ({ ...p, weekly: { ...p.weekly, kickoff: p.weekly?.kickoff ? iso(Date.parse(p.weekly.kickoff) + shift) : null } }));
  const snapshot = { ...BASE, season: SEASON, week, statsThroughWeek: through, players };
  const games = new Map();
  for (const p of players) {
    const m = /^(vs|@) ([A-Z]{2,3})$/.exec(p.weekly.opponent ?? '');
    if (!m || !p.weekly.kickoff) continue;
    const [away, home] = m[1] === 'vs' ? [m[2], p.team] : [p.team, m[2]];
    games.set(`${away}-${home}`, gameRow(`${SEASON}_${pad(week)}_${nfl(away)}_${nfl(home)}`, week, Date.parse(p.weekly.kickoff), nfl(away), nfl(home)));
  }
  const text = JSON.stringify(snapshot);
  const entry = { week, file: `${SEASON}-week-${pad(week)}.${sha(text).slice(0, 8)}.json`, sha256: sha(text), bytes: text.length, generatedAt: snapshot.generatedAt, statsThroughWeek: through };
  return { snapshot, entry, gamesCsv: [GAME_HEADER, ...games.values()].join('\n') };
}
function fantasyStub(result) {
  const calls = [];
  return { calls, async week(args) { calls.push(args); if (result instanceof Error) throw result; return result; } };
}
const fantasyError = status => Object.assign(new Error('Fixture fantasy refusal.'), { status });
const fantasyFor = fx => fantasyStub({ index: { schemaVersion: 1, season: SEASON, snapshots: [fx.entry], reviews: [] }, snapshot: fx.snapshot, review: null, source: { retrievedAt: iso(Date.now()), stale: false } });

/** GitHub as nflverse serves it: the release URL redirects to a signed release-assets URL, which serves the file. */
function github(files, { fail = [] } = {}) {
  const calls = [];
  const fetchImpl = async url => {
    const target = new URL(url); calls.push(target.origin + target.pathname);
    const name = target.pathname.split('/').at(-1);
    if (target.origin === 'https://github.com') return new Response(null, { status: 302, headers: { location: `https://release-assets.githubusercontent.com/github-production-release-asset/${name}?sp=r&sig=fixture-signature` } });
    if (fail.includes(name)) return new Response('unavailable', { status: 503 });
    if (!Object.hasOwn(files, name)) return new Response('missing', { status: 404 });
    return new Response(files[name], { headers: { 'last-modified': LAST_MODIFIED } });
  };
  return { calls, fetchImpl, fetchText: createPointsSources({ fetchImpl }).fetchText };
}

// nflverse CSV fixtures (real column order for the columns used; headshot_url is quoted and holds a comma).
const STAT_COLS = ['player_id', 'player_name', 'player_display_name', 'position', 'headshot_url', 'season', 'week', 'season_type', 'game_id', 'team', 'opponent_team', 'attempts', 'passing_yards', 'passing_tds', 'passing_interceptions', 'passing_2pt_conversions', 'carries', 'rushing_yards', 'rushing_tds', 'rushing_2pt_conversions', 'receptions', 'targets', 'receiving_yards', 'receiving_tds', 'receiving_2pt_conversions', 'special_teams_tds', 'fumbles_lost_total', 'fg_made_0_19', 'fg_made_20_29', 'fg_made_30_39', 'fg_made_40_49', 'fg_made_50_59', 'fg_made_60_', 'fg_missed', 'fg_blocked', 'pat_made', 'pat_missed', 'pat_blocked'];
const statRow = o => STAT_COLS.map(c => (c === 'headshot_url' ? '"https://x.test/a,b.png"' : (o[c] ?? '0'))).join(',');
const SNAP_HEADER = 'game_id,pfr_game_id,season,game_type,week,player,pfr_player_id,position,team,opponent,offense_snaps,offense_pct,defense_snaps,defense_pct,st_snaps,st_pct';
const ROSTER_HEADER = 'season,team,position,status,full_name,gsis_id,pfr_id,week,game_type';
const FILES = { stats: `stats_player_week_${SEASON}.csv`, snaps: `snap_counts_${SEASON}.csv`, rosters: `roster_weekly_${SEASON}.csv`, games: 'games.csv' };

const gid = (week, away, home) => `${SEASON}_${pad(week)}_${away}_${home}`;
const SLATE_6 = [
  { slot: 'QB', playerId: '00-0000601', name: 'Fixture Passer Six', team: 'SEA', position: 'QB', gameKey: gid(6, 'SEA', 'DEN') }, // stats: scored 18
  { slot: 'RB', playerId: '00-0000602', name: 'Fixture Runner Six', team: 'KC', position: 'RB', gameKey: gid(6, 'KC', 'LV') }, // roster INA: void inactive
  { slot: 'WR', playerId: '00-0000603', name: 'Fixture Catcher Six', team: 'BUF', position: 'WR', gameKey: gid(6, 'BUF', 'NYJ') }, // game moved to week 7 (new id): void postponed
  { slot: 'TE', playerId: '00-0000604', name: 'Fixture End Six', team: 'DAL', position: 'TE', gameKey: gid(6, 'DAL', 'PHI') }, // no evidence: pending
  { slot: 'FLEX', playerId: '00-0000605', name: 'Fixture Flex Six', team: 'MIA', position: 'WR', gameKey: gid(6, 'MIA', 'NE') }, // stats: scored 20
];
const SLATE_5 = [
  { slot: 'QB', playerId: '00-0000501', name: 'Fixture Passer Five', team: 'SEA', position: 'QB', gameKey: gid(5, 'SEA', 'ARI') }, // 24
  { slot: 'RB', playerId: '00-0000502', name: 'Fixture Runner Five', team: 'KC', position: 'RB', gameKey: gid(5, 'KC', 'DEN') }, // 19
  { slot: 'WR', playerId: '00-0000503', name: 'Fixture Catcher Five', team: 'BUF', position: 'WR', gameKey: gid(5, 'BUF', 'MIA') }, // 8.5
  { slot: 'TE', playerId: '00-0000504', name: 'Fixture End Five', team: 'DAL', position: 'TE', gameKey: gid(5, 'DAL', 'NYG') }, // snaps, no stats row: 0
  { slot: 'FLEX', playerId: '00-0000505', name: 'Fixture Flex Five', team: 'LAR', position: 'RB', gameKey: gid(5, 'SF', 'LA') }, // zero snaps: void
];
// Sentinels that must never leave the database through the worker: House values and locked guesses.
const HOUSE = { QB: 23.4, RB: 14.6, WR: 17.2, TE: 9.8, FLEX: 12.3 };
const GUESS = 57;
const statsCsv = [STAT_COLS.join(','),
  statRow({ player_id: '00-0000601', player_display_name: 'Fixture Passer Six', position: 'QB', season: SEASON, week: '6', season_type: 'REG', game_id: gid(6, 'SEA', 'DEN'), team: 'SEA', passing_yards: '250', passing_tds: '2' }),
  statRow({ player_id: '00-0000605', player_display_name: 'Fixture Flex Six', position: 'WR', season: SEASON, week: '6', season_type: 'REG', game_id: gid(6, 'MIA', 'NE'), team: 'MIA', receptions: '6', receiving_yards: '80', receiving_tds: '1' }),
  statRow({ player_id: '00-0000501', player_display_name: 'Fixture Passer Five', position: 'QB', season: SEASON, week: '5', season_type: 'REG', game_id: gid(5, 'SEA', 'ARI'), team: 'SEA', passing_yards: '300', passing_tds: '3' }),
  statRow({ player_id: '00-0000502', player_display_name: 'Fixture Runner Five', position: 'RB', season: SEASON, week: '5', season_type: 'REG', game_id: gid(5, 'KC', 'DEN'), team: 'KC', rushing_yards: '100', rushing_tds: '1', receptions: '2', receiving_yards: '10' }),
  statRow({ player_id: '00-0000503', player_display_name: 'Fixture Catcher Five', position: 'WR', season: SEASON, week: '5', season_type: 'REG', game_id: gid(5, 'BUF', 'MIA'), team: 'BUF', receptions: '4', receiving_yards: '45' }),
  // Not on a slate: proves the TE's week 5 game is in the stats file, so his snaps without a stats row score 0.
  statRow({ player_id: '00-0000599', player_display_name: 'Fixture Other Passer', position: 'QB', season: SEASON, week: '5', season_type: 'REG', game_id: gid(5, 'DAL', 'NYG'), team: 'DAL', passing_yards: '200' }),
  statRow({ player_id: '00-0000701', player_display_name: 'Fixture Later', position: 'WR', season: SEASON, week: '7', season_type: 'REG', game_id: gid(7, 'SEA', 'LA'), team: 'SEA', receptions: '3' }),
].join('\n');
const snapsCsv = [SNAP_HEADER,
  `${gid(5, 'DAL', 'NYG')},x,${SEASON},REG,5,Fixture End Five,EnFi00,TE,DAL,NYG,30,0.5,0,0,2,0.1`,
  `${gid(5, 'SF', 'LA')},y,${SEASON},REG,5,Fixture Flex Five,FlFi00,RB,LA,SF,0,0,0,0,0,0`].join('\n');
const rostersCsv = [ROSTER_HEADER,
  `${SEASON},KC,RB,INA,Fixture Runner Six,00-0000602,RuSi00,6,REG`,
  `${SEASON},DAL,TE,ACT,Fixture End Five,00-0000504,EnFi00,5,REG`,
  `${SEASON},LA,RB,ACT,Fixture Flex Five,00-0000505,FlFi00,5,REG`].join('\n');
const KICK_6 = Date.now() - 4 * DAY, KICK_5 = Date.now() - 11 * DAY;
const withKickoffs = (slots, first) => slots.map((s, i) => ({ ...s, kickoff: iso(first + i * HOUR) }));
// As nflverse lists a moved game (real games.csv: 2020 DEN at NE, first Week 5, exists only as 2020_06_DEN_NE): BUF at NYJ
// left week 6 and is listed only under its new week 7 id, a week later. The slate keeps the week 6 id it was drawn with.
const gamesCsv = [GAME_HEADER,
  ...withKickoffs(SLATE_6, KICK_6).map(s => {
    const [, , away, home] = s.gameKey.split('_');
    return s.gameKey === gid(6, 'BUF', 'NYJ') ? gameRow(gid(7, away, home), 7, Date.parse(s.kickoff) + WEEK, away, home) : gameRow(s.gameKey, 6, Date.parse(s.kickoff), away, home);
  }),
  ...withKickoffs(SLATE_5, KICK_5).map(s => { const [, , away, home] = s.gameKey.split('_'); return gameRow(s.gameKey, 5, Date.parse(s.kickoff), away, home); }),
].join('\n');
const ACTUAL_FILES = { [FILES.stats]: statsCsv, [FILES.snaps]: snapsCsv, [FILES.rosters]: rostersCsv, [FILES.games]: gamesCsv };

/** Captures console output for the test (the worker's logs must carry counts only, and test output stays clean). */
function quiet(t) {
  const lines = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) t.mock.method(console, method, (...args) => { lines.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); });
  return lines;
}
function assertCountsOnly(lines, extra = []) {
  for (const line of lines) {
    for (const needle of ['Fixture', 'http', SERVICE_KEY, 'sig=', String(HOUSE.QB), ...extra]) assert.equal(line.includes(needle), false, `log line carries ${needle}: ${line}`);
    assert.equal(hex64.test(line), false, `log line carries a hash or token: ${line}`);
  }
}

// ---- end-to-end world ----
const NET_DOUBLE = "create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';";
async function jobsWorld(t) {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world;
  await db.exec(NET_DOUBLE);
  await db.query("insert into public.gtl_points_job_schedule(id,enabled,endpoint) values('nfl-points',true,$1)", [ENDPOINT]);
  const sql = async (name, args) => (await db.transaction(async tx => {
    await tx.exec('set local role service_role');
    return tx.query(`select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) value`, Object.values(args));
  })).rows[0].value;
  const rpcCalls = [];
  const service = createPointsJobsAdapter({ url: 'https://example.supabase.co', serviceRoleKey: SERVICE_KEY, fetchImpl: async (url, options) => {
    const name = new URL(url).pathname.split('/').at(-1); rpcCalls.push(name);
    try { return Response.json(await sql(name, JSON.parse(options.body))); }
    catch (error) { return Response.json({ message: error.message }, { status: 400 }); }
  } });
  const capability = async runId => (await db.query("select headers->>'Authorization' a from net.outbox where body->>'runId'=$1 order by id desc limit 1", [runId])).rows[0].a.slice(7);
  const post = (handler, { token, body, method = 'POST', url = ENDPOINT, type = 'application/json' } = {}) => handler(new Request(url, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': type }, ...(method === 'POST' ? { body } : {}) }));
  const read = async response => { const text = await response.text(); return { status: response.status, text, body: JSON.parse(text) }; };
  /** Dispatch one run (one per clock hour, so earlier runs are cleared first) and post it to the handler. */
  const run = async (sources, { clock = Date.now } = {}) => {
    await db.exec('delete from public.gtl_points_job_runs');
    const { runId } = (await db.query('select public.gtl_dispatch_points_jobs() value')).rows[0].value;
    const token = await capability(runId);
    const handler = createPointsJobsHandler({ service, sources, clock });
    return { runId, token, handler, ...(await read(await post(handler, { token, body: JSON.stringify({ runId }) }))) };
  };
  const rows = async (query, args = []) => (await db.query(query, args)).rows;
  const slateRow = async week => (await rows('select * from public.gtl_points_slates where season=$1 and week=$2', [SEASON, week]))[0];
  return { world, db, sql, service, rpcCalls, capability, post, read, run, rows, slateRow };
}

// ---- unit: adapter, sources, handler ----
test('contract: the adapter reaches only the six Points job RPCs, never follows a redirect, and passes through only known codes', async () => {
  assert.deepEqual([...POINTS_JOBS_RPCS], ['gtl_claim_points_jobs', 'gtl_complete_points_jobs', 'gtl_points_jobs_state', 'gtl_points_publish_slate', 'gtl_points_load_actuals', 'gtl_points_finalize']);
  const seen = [];
  let reply = { message: 'GTL_POINTS_TOO_LATE', detail: 'private detail' };
  const service = createPointsJobsAdapter({ url: 'https://example.supabase.co', serviceRoleKey: SERVICE_KEY, fetchImpl: async (url, options) => { seen.push({ url: String(url), options }); return Response.json(reply, { status: 400 }); } });
  for (const name of POINTS_JOBS_RPCS) await assert.rejects(() => service.rpc(name, { p_season: 2026 }), error => error.code === 'GTL_POINTS_TOO_LATE' && !error.message.includes('private'));
  assert.equal(seen.length, 6);
  for (const { url, options } of seen) {
    assert.match(url, /^https:\/\/example\.supabase\.co\/rest\/v1\/rpc\/gtl_[a-z_]+$/);
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.apikey, SERVICE_KEY); assert.equal(options.headers.Authorization, `Bearer ${SERVICE_KEY}`);
    assert.deepEqual(JSON.parse(options.body), { p_season: 2026 });
  }
  for (const name of ['gtl_dispatch_points_jobs', 'gtl_points_read', 'gtl_points_lock_in', 'gtl_claim_week_open', 'gtl_points_slot_outcomes'])
    await assert.rejects(() => service.rpc(name, {}), /Invalid Points jobs operation/, name);
  assert.equal(seen.length, 6, 'a refused name never reaches the network');
  for (const code of ['GTL_SCHEDULE_AUTH', 'GTL_SCHEDULE_RUN', 'GTL_SCHEDULE_EXPIRED', 'GTL_POINTS_NOT_OPEN', 'GTL_POINTS_SLATE_FIXED', 'GTL_POINTS_INVALID']) {
    reply = { message: code }; await assert.rejects(() => service.rpc('gtl_points_finalize', {}), error => error.code === code, code);
  }
  for (const message of [`relation secret.table ${SERVICE_KEY}`, undefined]) {
    reply = { message }; await assert.rejects(() => service.rpc('gtl_points_finalize', {}), error => error.code === 'UNAVAILABLE' && !error.message.includes(SERVICE_KEY));
  }
  const ok = createPointsJobsAdapter({ url: 'https://example.supabase.co', serviceRoleKey: SERVICE_KEY, fetchImpl: async () => Response.json({ final: true }) });
  assert.deepEqual(await ok.rpc('gtl_points_finalize', { p_season: 2026, p_week: 5 }), { final: true });
  for (const url of ['http://example.supabase.co', 'https://example.supabase.co/rest', 'https://u:p@example.supabase.co', 'https://example.supabase.co/?x=1', 'https://example.supabase.co/#h'])
    assert.throws(() => createPointsJobsAdapter({ url, serviceRoleKey: SERVICE_KEY }), /Invalid Points jobs configuration/, url);
  assert.throws(() => createPointsJobsAdapter({ url: 'https://example.supabase.co', serviceRoleKey: '' }), /Invalid Points jobs configuration/);
});

test('contract: the source caps are the design caps, with the weekly-roster cap sized for a full season', () => {
  // Design caps: stats 16 MiB / 30 s; snaps and games 8 MiB / 20 s; roster 24 MiB / 30 s. The real 2026 weekly-roster file
  // was 5.74 MB through Week 7 (about 0.8 MB a week), so 8 MiB would refuse it from about Week 10.
  assert.deepEqual(SOURCE_LIMITS, { stats: { maxBytes: 16 * MIB, timeoutMs: 30_000 }, snaps: { maxBytes: 8 * MIB, timeoutMs: 20_000 },
    rosters: { maxBytes: 24 * MIB, timeoutMs: 30_000 }, games: { maxBytes: 8 * MIB, timeoutMs: 20_000 } });
  assert.ok(Object.isFrozen(SOURCE_LIMITS) && Object.values(SOURCE_LIMITS).every(Object.isFrozen));
});

test('contract: fetchText returns the text, SHA-256, size, Last-Modified, retrieval time and release tag through GitHub release redirects', async () => {
  const body = 'player_id,week\n00-0000001,7\n';
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('https://github.com/')) return new Response(null, { status: 302, headers: { location: 'https://objects.githubusercontent.com/asset?sig=fixture' } });
    return new Response(body, { headers: { 'last-modified': LAST_MODIFIED } });
  };
  const sources = createPointsSources({ fetchImpl, clock: () => Date.parse('2026-10-27T12:00:00Z') });
  assert.equal(typeof sources.fantasy.week, 'function', 'Track 1 fantasy service');
  const file = await sources.fetchText(NFLVERSE.stats(2026), SOURCE_LIMITS.stats);
  assert.deepEqual(file, { url: NFLVERSE.stats(2026), text: body, sha256: sha(body), bytes: Buffer.byteLength(body), publishedAt: '2026-10-26T04:46:00.000Z', retrievedAt: '2026-10-27T12:00:00.000Z', release: 'stats_player' });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ options }) => options.redirect === 'manual' && options.credentials === 'omit' && options.signal instanceof AbortSignal));
  const noDate = createPointsSources({ fetchImpl: async () => new Response(body) });
  assert.equal((await noDate.fetchText(NFLVERSE.games(), SOURCE_LIMITS.games)).publishedAt, null, 'no Last-Modified: null, never invented');
  assert.equal((await noDate.fetchText(NFLVERSE.rosters(2026), SOURCE_LIMITS.rosters)).release, 'weekly_rosters');
  assert.equal((await noDate.fetchText(NFLVERSE.snaps(2026), SOURCE_LIMITS.snaps)).release, 'snap_counts');
});

test('failure: fetchText refuses other hosts, plain-http redirects, missing or failed files, oversize bodies, bad UTF-8 and slow sources', async () => {
  const via = location => createPointsSources({ fetchImpl: async url => (String(url).startsWith('https://github.com/')
    ? new Response(null, { status: 302, headers: { location } }) : new Response('x')) });
  await assert.rejects(() => via('https://evil.example/asset').fetchText(NFLVERSE.stats(2026), SOURCE_LIMITS.stats), /Redirect refused/);
  await assert.rejects(() => via('http://release-assets.githubusercontent.com/asset').fetchText(NFLVERSE.stats(2026), SOURCE_LIMITS.stats), /Redirect refused/);
  const any = createPointsSources({ fetchImpl: async () => new Response('x') });
  for (const url of ['https://evil.example/nflverse/nflverse-data/releases/download/stats_player/x.csv', 'http://github.com/nflverse/nflverse-data/releases/download/stats_player/x.csv',
    'https://github.com/other/repo/releases/download/stats_player/x.csv', `${NFLVERSE.stats(2026)}?token=1`])
    await assert.rejects(() => any.fetchText(url, SOURCE_LIMITS.stats), /Source refused/, url);
  for (const status of [404, 500, 503]) await assert.rejects(() => createPointsSources({ fetchImpl: async () => new Response('no', { status }) }).fetchText(NFLVERSE.games(), SOURCE_LIMITS.games), /unavailable|missing/i, String(status));
  await assert.rejects(() => createPointsSources({ fetchImpl: async () => new Response('12345', { headers: { 'content-length': '5' } }) }).fetchText(NFLVERSE.games(), { maxBytes: 4, timeoutMs: 1000 }), /Too large/);
  const stream = () => new ReadableStream({ start(controller) { for (let i = 0; i < 4; i += 1) controller.enqueue(new Uint8Array(3)); controller.close(); } });
  await assert.rejects(() => createPointsSources({ fetchImpl: async () => new Response(stream()) }).fetchText(NFLVERSE.games(), { maxBytes: 10, timeoutMs: 1000 }), /Too large/, 'the cap holds while reading, without a length header');
  await assert.rejects(() => createPointsSources({ fetchImpl: async () => new Response(new Uint8Array([0x61, 0xff, 0x62])) }).fetchText(NFLVERSE.games(), SOURCE_LIMITS.games), /./);
  const slow = createPointsSources({ fetchImpl: (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))) });
  await assert.rejects(() => slow.fetchText(NFLVERSE.games(), { maxBytes: 100, timeoutMs: 30 }), /./, 'the timeout aborts the fetch');
});

/**
 * An in-memory stand-in for the six RPCs, recording calls. `slates` is the stored state, or a function of the state read's
 * number (1, 2, ...) to change it between reads; `fail[name]` is an error code, or a function of the arguments returning one.
 */
function memoryService({ slates = [], fail = {}, finalize = () => ({ final: false, reason: 'not_yet' }) } = {}) {
  const calls = [];
  const loads = new Map();
  let reads = 0;
  return { calls, loads, async rpc(name, args) {
    calls.push([name, args]);
    const code = typeof fail[name] === 'function' ? fail[name](args) : fail[name];
    if (code) { const error = new Error('fixture'); error.code = code; throw error; }
    if (name === 'gtl_points_jobs_state') { reads += 1; return { season: args.p_season, slates: typeof slates === 'function' ? slates(reads) : slates }; }
    if (name === 'gtl_points_load_actuals') {
      const key = `${args.p_payload.week}:${args.p_payload.source?.sha256}`;
      if (args.p_payload.status === 'failed') return { loadId: 'x', status: 'failed', replayed: false };
      if (loads.has(key)) return { loadId: 'x', status: 'saved', replayed: true };
      loads.set(key, args.p_payload);
      return { loadId: 'x', status: 'saved', replayed: false, rowsTotal: args.p_payload.players.length, rowsSaved: args.p_payload.players.length, rowsSkipped: 0, partial: args.p_payload.coverage.partial };
    }
    if (name === 'gtl_points_finalize') return { season: args.p_season, week: args.p_week, ...finalize(args) };
    if (name === 'gtl_points_publish_slate') return { status: args.p_action === 'publish' ? 'published' : 'draft' };
    throw new Error(`unexpected ${name}`);
  } };
}
const stateSlate = (week, slots, first, { status = 'published', final = false, finalizeAt = Date.now() + 2 * DAY, rulesVersion = 'ppr4-v1' } = {}) => ({
  week, status, final, opensAt: iso(first - 3 * DAY), finalizeAt: iso(finalizeAt), firstKickoff: iso(first), rulesVersion, slots: withKickoffs(slots, first) });
const fileSources = (files, { fantasy = fantasyStub(fantasyError(404)), fail = [] } = {}) => ({ fantasy, fetchText: github(files, { fail }).fetchText });

test('contract: runPointsJobs isolates each step; a refused loader, an unknown rules version or a failed finalize is recorded and later steps still run', async () => {
  const slates = [stateSlate(6, SLATE_6, KICK_6, { finalizeAt: Date.now() - HOUR }), stateSlate(5, SLATE_5, KICK_5, { rulesVersion: 'ppr4-v9', finalizeAt: Date.now() - HOUR })];
  // The slate step throws on a malformed snapshot; actuals and finalize still run.
  const broken = fantasyStub({ index: { snapshots: [] }, snapshot: Object.defineProperty({}, 'week', { get() { throw new Error('boom'); } }), review: null });
  const refused = memoryService({ slates, fail: { gtl_points_load_actuals: 'GTL_POINTS_INVALID' }, finalize: () => { throw Object.assign(new Error('x'), { code: 'UNAVAILABLE' }); } });
  const out = await runPointsJobs({ service: refused, sources: fileSources(ACTUAL_FILES, { fantasy: broken }), now: Date.now() });
  assert.equal(out.reason, 'worker_error', 'the unexpected slate error and the finalize refusal rank above the loader refusal');
  assert.deepEqual(out.summary.slate, { action: 'skipped', reason: 'error' });
  assert.deepEqual(out.summary.actuals, [{ week: 5, status: 'skipped', rowsSaved: 0, partial: null, reason: 'rules_version' }, { week: 6, status: 'refused', rowsSaved: 0, partial: true }]);
  assert.deepEqual(out.summary.finalize, [{ week: 5, final: false, reason: 'refused' }, { week: 6, final: false, reason: 'refused' }]);
  assert.deepEqual(out.summary.errors, ['slate']);
  assert.equal(refused.calls.filter(([name, args]) => name === 'gtl_points_load_actuals' && args.p_payload.week === 5).length, 0, 'points are never written under a rules version the worker cannot reproduce');

  const loaderOnly = memoryService({ slates: [slates[0]], fail: { gtl_points_load_actuals: 'GTL_POINTS_INVALID' } });
  assert.equal((await runPointsJobs({ service: loaderOnly, sources: fileSources(ACTUAL_FILES), now: Date.now() })).reason, 'load_failed');

  const noState = memoryService({ fail: { gtl_points_jobs_state: 'UNAVAILABLE' } });
  const blind = await runPointsJobs({ service: noState, sources: fileSources(ACTUAL_FILES), now: Date.now() });
  assert.deepEqual(blind, { reason: 'worker_error', summary: { season: SEASON, slate: { action: 'skipped', reason: 'state_unavailable' }, actuals: [], finalize: [] } });
  assert.deepEqual(noState.calls.map(([name]) => name), ['gtl_points_jobs_state'], 'without the stored state nothing is drafted over a slate it cannot see');
});

test('contract: only the newest two published weeks under way and not FINAL load actuals; finalize covers every week past its FINAL time', async () => {
  const now = Date.now();
  const slates = [stateSlate(3, SLATE_5, now - 25 * DAY, { finalizeAt: now - 18 * DAY }), stateSlate(4, SLATE_5, now - 18 * DAY, { final: true, finalizeAt: now - 9 * DAY }),
    stateSlate(5, SLATE_5, KICK_5, { finalizeAt: now - HOUR }), stateSlate(6, SLATE_6, KICK_6), stateSlate(7, SLATE_6, now + 2 * DAY), stateSlate(8, SLATE_6, now + 9 * DAY, { status: 'draft' })];
  const service = memoryService({ slates, finalize: ({ p_week }) => (p_week === 5 ? { final: true, replayed: false } : { final: false, reason: 'pending_stats' }) });
  const out = await runPointsJobs({ service, sources: fileSources(ACTUAL_FILES), now });
  assert.deepEqual(out.summary.actuals.map(a => a.week), [5, 6], 'week 3 is older than the newest two; 4 is FINAL; 7 has not kicked off');
  assert.deepEqual(out.summary.finalize, [{ week: 3, final: false, reason: 'pending_stats' }, { week: 5, final: true }], 'every week past its FINAL time, not just the newest two');
  assert.equal(out.reason, null);
  const payload = service.calls.find(([name, args]) => name === 'gtl_points_load_actuals' && args.p_payload.week === 5)[1].p_payload;
  assert.deepEqual(Object.keys(payload).sort(), ['coverage', 'players', 'season', 'source', 'week']);
  assert.deepEqual(payload.source, { url: NFLVERSE.stats(SEASON), release: 'stats_player', publishedAt: '2026-10-26T04:46:00.000Z', retrievedAt: payload.source.retrievedAt, sha256: sha(statsCsv) });
  assert.deepEqual(payload.coverage, { rows: 4, rowsWithoutNameOrTeam: 0, slatePlayersWithoutStats: 2, snapsSha256: sha(snapsCsv), rosterSha256: sha(rostersCsv), gamesSha256: sha(gamesCsv), partial: false });
  const te = payload.players.find(p => p.playerId === '00-0000504');
  assert.deepEqual([te.played, te.playedBasis, te.points], [true, 'snaps', { 'ppr4-v1': 0 }], 'snaps and no stats row once his game is in the file: played and scored 0');
  assert.equal(service.calls.filter(([name]) => name === 'gtl_points_publish_slate').length, 0);
});

test('contract: a slate player with snaps but no stats row stays pending while his game is missing from the stats file', async () => {
  const lagging = statsCsv.split('\n').filter(line => !line.includes('00-0000599')).join('\n');
  const service = memoryService({ slates: [stateSlate(5, SLATE_5, KICK_5)] });
  const out = await runPointsJobs({ service, sources: fileSources({ ...ACTUAL_FILES, [FILES.stats]: lagging }), now: Date.now() });
  const te = service.calls.find(([name]) => name === 'gtl_points_load_actuals')[1].p_payload.players.find(p => p.playerId === '00-0000504');
  assert.deepEqual([te.played, te.playedBasis, te.points], [true, 'snaps', {}], 'missing is never 0');
  assert.deepEqual(out.summary.actuals, [{ week: 5, status: 'saved', rowsSaved: 5, partial: true }]);
});

test('contract: a slate player with snaps whose only stats row is at a non-scoring position (FB) stays pending, never 0', async () => {
  // The real stats file lists FB, CB, LB and other positions; a row at any of them is a stats row for that player.
  const asFullback = `${statsCsv}\n${statRow({ player_id: '00-0000504', player_display_name: 'Fixture End Five', position: 'FB', season: SEASON, week: '5', season_type: 'REG', game_id: gid(5, 'DAL', 'NYG'), team: 'DAL', receptions: '2', receiving_yards: '15', receiving_tds: '1' })}`;
  const service = memoryService({ slates: [stateSlate(5, SLATE_5, KICK_5)] });
  const out = await runPointsJobs({ service, sources: fileSources({ ...ACTUAL_FILES, [FILES.stats]: asFullback }), now: Date.now() });
  const payload = service.calls.find(([name]) => name === 'gtl_points_load_actuals')[1].p_payload;
  const te = payload.players.find(p => p.playerId === '00-0000504');
  assert.deepEqual([te.played, te.playedBasis, te.points], [true, 'snaps', {}], 'he recorded stats the scored rows do not carry: never scored 0');
  assert.equal(payload.players.filter(p => p.playerId === '00-0000504').length, 1);
  assert.deepEqual(out.summary.actuals, [{ week: 5, status: 'saved', rowsSaved: 6, partial: true }], 'the week stays partial, so FINAL waits for the commissioner');
});

test('failure: a due week with no rows yet in a season file (no snap counts for it) still loads; it is not a failed load', async () => {
  const service = memoryService({ slates: [stateSlate(6, SLATE_6, KICK_6)] });
  const out = await runPointsJobs({ service, sources: fileSources(ACTUAL_FILES), now: Date.now() });
  assert.deepEqual(out, { reason: null, summary: { season: SEASON, slate: { action: 'skipped', reason: 'no_fresh_snapshot' }, actuals: [{ week: 6, status: 'saved', rowsSaved: 5, partial: true }], finalize: [] } });
  assert.equal(service.calls.filter(([name, args]) => name === 'gtl_points_load_actuals' && args.p_payload.status === 'failed').length, 0);
});

// ---- unit: the slate step on the in-memory service ----
const callNames = calls => calls.map(([name, args]) => (name === 'gtl_points_publish_slate' ? `${name}:${args.p_action}` : name));
/** Week 9 from the committed snapshot: the snapshot fixture, its schedule, its first kickoff and fresh sources for a run. */
function week9() {
  const fx = snapshotFor({ week: 9 });
  const games = scheduleGames(fx.gamesCsv, { season: SEASON });
  const first = Math.min(...games.filter(g => g.week === 9).map(g => Date.parse(g.kickoff)));
  return { fx, games, first, sources: () => ({ fantasy: fantasyFor(fx), fetchText: github({ [FILES.games]: fx.gamesCsv }).fetchText }) };
}

test('contract: a due draft the server refuses to publish as not open or too late is a safe no-op; any other refusal is a worker error', async () => {
  const now = Date.now();
  const draft = stateSlate(9, SLATE_6, now + DAY, { status: 'draft' }); // opened two days ago, kicks off tomorrow
  for (const [code, reason, runReason] of [['GTL_POINTS_NOT_OPEN', 'not_open', 'nothing_due'], ['GTL_POINTS_TOO_LATE', 'kicked_off', 'nothing_due'],
    ['GTL_POINTS_FORBIDDEN', 'publish_refused', 'worker_error'], ['UNAVAILABLE', 'publish_refused', 'worker_error']]) {
    const fantasy = fantasyStub(fantasyError(404));
    const service = memoryService({ slates: [draft], fail: { gtl_points_publish_slate: code } });
    const out = await runPointsJobs({ service, sources: { fantasy, fetchText: github({}).fetchText }, now });
    assert.deepEqual(out.summary.slate, { week: 9, action: 'skipped', reason }, code);
    assert.equal(out.reason, runReason, code);
    assert.deepEqual(callNames(service.calls), ['gtl_points_jobs_state', 'gtl_points_publish_slate:publish'], code);
    assert.deepEqual(service.calls[1][1], { p_actor: null, p_action: 'publish', p_season: SEASON, p_week: 9, p_slate: null }, 'published by the scheduler, as stored');
    assert.equal(fantasy.calls.length, 0, 'publishing a stored draft reads no snapshot');
  }
});

test('contract: a scheduler draft refused because the week is fixed is kept; any other draft refusal is a worker error and nothing is published', async () => {
  const w = week9();
  for (const [code, slate, runReason] of [['GTL_POINTS_SLATE_FIXED', { week: 9, action: 'kept' }, 'nothing_due'],
    ['GTL_POINTS_SLATE_INVALID', { week: 9, action: 'skipped', reason: 'draft_refused' }, 'worker_error'], ['UNAVAILABLE', { week: 9, action: 'skipped', reason: 'draft_refused' }, 'worker_error']]) {
    const service = memoryService({ fail: { gtl_points_publish_slate: args => (args.p_action === 'draft' ? code : undefined) } });
    const out = await runPointsJobs({ service, sources: w.sources(), now: Date.now() });
    assert.deepEqual(out.summary.slate, slate, code);
    assert.equal(out.reason, runReason, code);
    assert.deepEqual(callNames(service.calls), ['gtl_points_jobs_state', 'gtl_points_jobs_state', 'gtl_points_publish_slate:draft'], code);
  }
});

test('contract: a stored draft past its first kickoff is never published or redrafted', async () => {
  const w = week9();
  const now = Date.now();
  const service = memoryService({ slates: [stateSlate(9, SLATE_6, now - HOUR, { status: 'draft' })] });
  const sources = w.sources();
  const out = await runPointsJobs({ service, sources, now });
  assert.deepEqual(out.summary.slate, { week: 9, action: 'skipped', reason: 'kicked_off' });
  assert.equal(out.reason, 'nothing_due');
  assert.deepEqual(callNames(service.calls), ['gtl_points_jobs_state'], 'no publish and no draft');
  assert.deepEqual(sources.fantasy.calls, [{ season: SEASON, week: null }]);
});

test('contract: a draft made after its open (a late snapshot) is published in the same run, before the first kickoff', async () => {
  const w = week9();
  const now = w.first - HOUR;
  const opensAt = pointsOpensAt(iso(w.first));
  assert.ok(Date.parse(opensAt) <= now, 'the Tuesday open has passed');
  const service = memoryService();
  const out = await runPointsJobs({ service, sources: w.sources(), now });
  assert.deepEqual(out.summary.slate, { week: 9, action: 'published' });
  assert.equal(out.reason, null);
  assert.deepEqual(callNames(service.calls), ['gtl_points_jobs_state', 'gtl_points_jobs_state', 'gtl_points_publish_slate:draft', 'gtl_points_publish_slate:publish']);
  const expected = draftSlate({ snapshot: w.fx.snapshot, snapshotFile: w.fx.entry.file, snapshotSha256: w.fx.entry.sha256, season: SEASON, week: 9, games: w.games, now });
  assert.equal(expected.slate.opensAt, opensAt);
  assert.deepEqual(service.calls[2][1], { p_actor: null, p_action: 'draft', p_season: SEASON, p_week: 9, p_slate: expected.slate });
  assert.deepEqual(service.calls[3][1], { p_actor: null, p_action: 'publish', p_season: SEASON, p_week: 9, p_slate: null });
  // Server time decides: a publish refused as not yet open leaves the new draft for the next run.
  const behind = memoryService({ fail: { gtl_points_publish_slate: args => (args.p_action === 'publish' ? 'GTL_POINTS_NOT_OPEN' : undefined) } });
  const drafted = await runPointsJobs({ service: behind, sources: w.sources(), now });
  assert.deepEqual(drafted.summary.slate, { week: 9, action: 'drafted', reason: 'not_open' });
  assert.equal(drafted.reason, null, 'the draft is a change');
  // At or after the first kickoff nothing is drafted at all.
  const late = memoryService();
  assert.deepEqual((await runPointsJobs({ service: late, sources: w.sources(), now: w.first })).summary.slate, { week: 9, action: 'skipped', reason: 'kicked_off' });
  assert.equal(late.calls.filter(([name]) => name === 'gtl_points_publish_slate').length, 0);
});

test('contract: the scheduler re-reads the stored slates just before it drafts, and keeps a slate stored meanwhile (the commissioner draft race)', async () => {
  const w = week9();
  const now = Date.now();
  // The commissioner drafts week 9 after the run's first state read and before its draft.
  const raced = memoryService({ slates: read => (read === 1 ? [] : [stateSlate(9, SLATE_6, w.first, { status: 'draft' })]) });
  const out = await runPointsJobs({ service: raced, sources: w.sources(), now });
  assert.deepEqual(out.summary.slate, { week: 9, action: 'kept' });
  assert.equal(out.reason, 'nothing_due');
  assert.deepEqual(callNames(raced.calls), ['gtl_points_jobs_state', 'gtl_points_jobs_state'], 'no draft is sent over the stored slate');
  const published = memoryService({ slates: read => (read === 1 ? [] : [stateSlate(9, SLATE_6, w.first)]) });
  assert.deepEqual((await runPointsJobs({ service: published, sources: w.sources(), now })).summary.slate, { week: 9, action: 'kept' });
  assert.equal(published.calls.filter(([name]) => name === 'gtl_points_publish_slate').length, 0);
  // The re-read is the last call before the draft.
  const clean = memoryService();
  assert.deepEqual((await runPointsJobs({ service: clean, sources: w.sources(), now })).summary.slate, { week: 9, action: 'drafted' });
  assert.deepEqual(callNames(clean.calls), ['gtl_points_jobs_state', 'gtl_points_jobs_state', 'gtl_points_publish_slate:draft']);
  // A re-read that fails or is malformed sends nothing: the worker never drafts over a slate it cannot see.
  let reads = 0;
  const down = memoryService({ fail: { gtl_points_jobs_state: () => ((reads += 1) > 1 ? 'UNAVAILABLE' : undefined) } });
  const malformed = memoryService({ slates: read => (read === 1 ? [] : null) });
  for (const service of [down, malformed]) {
    const blind = await runPointsJobs({ service, sources: w.sources(), now });
    assert.deepEqual(blind.summary.slate, { week: 9, action: 'skipped', reason: 'state_unavailable' });
    assert.equal(blind.reason, 'worker_error');
    assert.deepEqual(callNames(service.calls), ['gtl_points_jobs_state', 'gtl_points_jobs_state']);
  }
});

test('performance bound: two weeks of actuals from full-season-size files are prepared in under 1,000 ms', async () => {
  const filler = Array.from({ length: 40 }, (_, i) => `x${i}`);
  const stats = [[...STAT_COLS, ...filler].join(',')];
  for (let week = 1; week <= 18; week += 1) for (let i = 0; i < 1120; i += 1) {
    stats.push([statRow({ player_id: `00-${String(week * 10000 + i).padStart(7, '0')}`, player_display_name: `P ${week} ${i}`, position: 'WR', season: SEASON, week: String(week), season_type: 'REG', game_id: gid(week, 'SEA', 'LA'), team: 'SEA', receptions: '3' }), ...filler.map(() => '0.123456')].join(','));
  }
  const rosterCols = 'season,team,position,depth_chart_position,jersey_number,status,full_name,first_name,last_name,birth_date,height,weight,college,gsis_id,espn_id,sportradar_id,yahoo_id,rotowire_id,pff_id,pfr_id,fantasy_data_id,sleeper_id,years_exp,headshot_url,ngs_position,week,game_type,status_description_abbr,football_name,esb_id,gsis_it_id,smart_id,entry_year,rookie_year,draft_club,draft_number';
  const roster = [rosterCols];
  for (let week = 1; week <= 18; week += 1) for (let i = 0; i < 2500; i += 1) {
    const gsis = `00-${String(900000 + i).padStart(7, '0')}`;
    roster.push(`${SEASON},SEA,WR,WR,${i % 99},ACT,Player Number ${i},Player,Number ${i},2000-01-01,6-1,200,Fixture University,${gsis},${4000000 + i},${'a'.repeat(36)},${30000 + i},${10000 + i},${50000 + i},PlNu${i},${20000 + i},${60000 + i},3,"https://static.example/headshots/${i},q_auto.png",WR,${week},REG,A01,Player,ESB${i},${'b'.repeat(20)},${'c'.repeat(32)},2022,2022,SEA,${i}`);
  }
  const snaps = [SNAP_HEADER];
  for (let week = 1; week <= 18; week += 1) for (let i = 0; i < 1500; i += 1) snaps.push(`${gid(week, 'SEA', 'LA')},x,${SEASON},REG,${week},Player ${i},PlNu${i},WR,SEA,LA,${i % 70},0.5,0,0,${i % 9},0.1`);
  const files = { [FILES.stats]: stats.join('\n'), [FILES.rosters]: roster.join('\n'), [FILES.snaps]: snaps.join('\n'), [FILES.games]: gamesCsv };
  assert.ok(files[FILES.stats].length > 8_000_000 && stats.length > 20_000, `stats fixture is ${files[FILES.stats].length} bytes`);
  assert.ok(files[FILES.rosters].length > 12_000_000, `roster fixture is ${files[FILES.rosters].length} bytes`);
  const prepared = Object.fromEntries(Object.entries(files).map(([name, text]) => [name, { text, sha256: sha(text) }]));
  const release = name => /\/download\/([^/]+)\//.exec(name)?.[1];
  const sources = { fantasy: fantasyStub(fantasyError(404)), fetchText: async url => { const name = url.split('/').at(-1); return { url, text: prepared[name].text, sha256: prepared[name].sha256, bytes: prepared[name].text.length, publishedAt: null, retrievedAt: iso(Date.now()), release: release(url) }; } };
  const players = week => SLATE_5.map((s, i) => ({ ...s, playerId: `00-${String(900000 + i * 7).padStart(7, '0')}`, gameKey: gid(week, 'SEA', 'LA') }));
  const service = memoryService({ slates: [stateSlate(9, players(9), Date.now() - 5 * DAY), stateSlate(10, players(10), Date.now() - DAY)] });
  const started = performance.now();
  const out = await runPointsJobs({ service, sources, now: Date.now() });
  const took = performance.now() - started;
  assert.deepEqual(out.summary.actuals.map(a => [a.week, a.status]), [[9, 'saved'], [10, 'saved']]);
  assert.equal(service.loads.size, 2);
  assert.ok(took < 1000, `took ${Math.round(took)} ms`);
});

test('contract: the handler accepts only POST with no query, a 64-hex bearer and a { runId } body, and its errors carry no secret', async t => {
  const logs = quiet(t);
  const runId = '00000000-0000-4000-8000-000000000009', token = 'a'.repeat(64);
  const calls = [];
  const service = { rpc: async (name, args) => { calls.push(name); if (name === 'gtl_claim_points_jobs') throw Object.assign(new Error(`URL?secret=${SERVICE_KEY}`), { code: args.p_token === token ? 'UNAVAILABLE' : 'GTL_SCHEDULE_AUTH' }); throw new Error('unexpected'); } };
  const sources = { fantasy: fantasyStub(fantasyError(404)), fetchText: async () => { throw new Error('never'); } };
  const handler = createPointsJobsHandler({ service, sources, bodyTimeoutMs: 200 });
  const send = (init, url = ENDPOINT) => handler(new Request(url, init));
  const json = { 'content-type': 'application/json' };
  const body = JSON.stringify({ runId });
  assert.equal((await send({ method: 'GET', headers: { authorization: `Bearer ${token}` } })).status, 405);
  assert.equal((await send({ method: 'POST', headers: { authorization: `Bearer ${token}`, ...json }, body }, `${ENDPOINT}?runId=${runId}`)).status, 400);
  for (const authorization of [undefined, 'Bearer short', `Bearer ${'A'.repeat(64)}`, `Basic ${token}`, token]) {
    const response = await send({ method: 'POST', headers: { ...(authorization ? { authorization } : {}), ...json }, body });
    assert.equal(response.status, 401, String(authorization));
  }
  for (const [headers, payload] of [[json, JSON.stringify({ runId, extra: 1 })], [json, '[]'], [json, 'not json'], [json, JSON.stringify({ runId: 'x' })], [{ 'content-type': 'text/plain' }, body], [json, 'x'.repeat(2000)]])
    assert.equal((await send({ method: 'POST', headers: { authorization: `Bearer ${token}`, ...headers }, body: payload })).status, 400, payload.slice(0, 40));
  assert.deepEqual(calls, [], 'nothing reaches the database before the request shape is valid');
  const wrong = await send({ method: 'POST', headers: { authorization: `Bearer ${'b'.repeat(64)}`, ...json }, body });
  assert.equal(wrong.status, 401);
  const down = await send({ method: 'POST', headers: { authorization: `Bearer ${token}`, ...json }, body });
  assert.equal(down.status, 503);
  const text = await down.text();
  for (const needle of [SERVICE_KEY, token, 'secret', 'http']) assert.equal(text.includes(needle), false, needle);
  assert.deepEqual(calls, ['gtl_claim_points_jobs', 'gtl_claim_points_jobs']);
  assert.equal(sources.fantasy.calls.length, 0);
  assertCountsOnly(logs, [token]);
});

test('contract: the handler always completes a claimed run with the step summary, even when a step fails unexpectedly', async t => {
  const logs = quiet(t);
  const runId = '00000000-0000-4000-8000-000000000009', token = 'c'.repeat(64), claim = '00000000-0000-4000-8000-000000000010';
  const calls = [];
  const service = { rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === 'gtl_claim_points_jobs') return { replay: false, runId, claim, now: iso(Date.now()) };
    if (name === 'gtl_points_jobs_state') return { season: SEASON, get slates() { throw new Error('boom'); } };
    if (name === 'gtl_complete_points_jobs') return { runId, status: args.p_reason ? 'failed' : 'succeeded', reason: args.p_reason };
    throw new Error(`unexpected ${name}`);
  } };
  const handler = createPointsJobsHandler({ service, sources: { fantasy: fantasyStub(fantasyError(404)), fetchText: async () => { throw new Error('never'); } } });
  const response = await handler(new Request(ENDPOINT, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ runId }) }));
  assert.equal(response.status, 200);
  const reply = await response.json();
  assert.equal(reply.status, 'failed'); assert.equal(reply.reason, 'worker_error');
  const complete = calls.find(([name]) => name === 'gtl_complete_points_jobs')[1];
  assert.deepEqual(Object.keys(complete), ['p_run', 'p_claim', 'p_reason', 'p_summary']);
  assert.equal(complete.p_run, runId); assert.equal(complete.p_claim, claim); assert.equal(complete.p_reason, 'worker_error');
  assert.ok(complete.p_summary && typeof complete.p_summary === 'object' && !Array.isArray(complete.p_summary));
  assert.ok(Buffer.byteLength(JSON.stringify(complete.p_summary)) < 4096, 'well under the 4 KB summary clamp');
  assert.ok(logs.length >= 1); assertCountsOnly(logs, [token]);
});

test('contract: the Edge entry reads only the two Supabase variables and the function skips platform JWT checks like the other workers', () => {
  const entry = readFileSync(new URL('../supabase/functions/gtl-points-jobs/index.ts', import.meta.url), 'utf8');
  assert.match(entry, /from '\.\.\/\.\.\/\.\.\/cloud\/points-jobs\.mjs'/);
  assert.deepEqual([...entry.matchAll(/Deno\.env\.get\('([A-Z_]+)'\)/g)].map(m => m[1]).sort(), ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL']);
  assert.match(entry, /Deno\.serve\(createPointsJobsHandler\(\{ service, sources: createPointsSources\(\) \}\)\)/);
  const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  const block = config.split('[functions.gtl-points-jobs]')[1]?.split(/^\[/m)[0] ?? '';
  assert.match(block, /^verify_jwt = false$/m);
  assert.match(config.split('[functions.gtl-api]')[1].split(/^\[/m)[0], /^verify_jwt = true$/m, 'gtl-api keeps JWT verification');
});

// ---- end to end on PGlite ----
test('slate: with no slate the worker drafts the newest snapshot week with the Tuesday open, five slots, House and provenance, and does not publish before the open', { skip }, async t => {
  const f = await jobsWorld(t);
  const logs = quiet(t);
  const fx = snapshotFor({ week: 9 });
  const gh = github({ [FILES.games]: fx.gamesCsv });
  const sources = { fantasy: fantasyFor(fx), fetchText: gh.fetchText };
  const first = await f.run(sources);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { runId: first.runId, status: 'succeeded', reason: null, summary: { season: SEASON, slate: { week: 9, action: 'drafted' }, actuals: [], finalize: [] } });
  assert.deepEqual(sources.fantasy.calls, [{ season: SEASON, week: null }], 'the newest snapshot');
  const games = scheduleGames(fx.gamesCsv, { season: SEASON });
  const expected = draftSlate({ snapshot: fx.snapshot, snapshotFile: fx.entry.file, snapshotSha256: fx.entry.sha256, season: SEASON, week: 9, games, now: Date.now() });
  assert.equal(expected.ok, true, expected.reason);
  const row = await f.slateRow(9);
  assert.equal(row.status, 'draft'); assert.equal(row.published_at, null); assert.equal(row.created_by, null, 'drafted by the scheduler');
  assert.equal(iso(row.opens_at), pointsOpensAt(iso(Math.min(...games.filter(g => g.week === 9).map(g => Date.parse(g.kickoff))))));
  assert.equal(iso(row.opens_at), expected.slate.opensAt);
  assert.ok(Date.parse(row.opens_at) > Date.now(), 'the open is still ahead, so nothing is published');
  assert.deepEqual(row.slots, expected.slate.slots);
  assert.deepEqual(row.slots.map(s => s.slot), ['QB', 'RB', 'WR', 'TE', 'FLEX']);
  assert.deepEqual(row.house, expected.slate.house); assert.deepEqual(Object.keys(row.house).sort(), ['FLEX', 'QB', 'RB', 'TE', 'WR'], 'a House value for every slot (jsonb key order is not meaningful)');
  assert.deepEqual(row.provenance, { snapshotFile: fx.entry.file, sha256: fx.entry.sha256, generatedAt: BASE.generatedAt, statsThroughWeek: 8, selectionVersion: 'points-slate-v1', seed: `${SEASON}-09-points-slate-v1` });
  assert.deepEqual(row.scoring_rules, POINTS_RULES);
  assert.deepEqual(row.audit.map(e => [e.action, e.by]), [['draft', null]]);
  const text = first.text;
  for (const slot of row.slots) assert.equal(text.includes(slot.name), false, 'no player name in the reply');
  for (const value of Object.values(row.house)) assert.equal(text.includes(`:${value}`), false, 'no House value in the reply');

  const second = await f.run(sources);
  assert.deepEqual(second.body, { runId: second.runId, status: 'skipped', reason: 'nothing_due', summary: { season: SEASON, slate: { week: 9, action: 'kept' }, actuals: [], finalize: [] } });
  assert.equal((await f.slateRow(9)).audit.length, 1, 'a stored draft is never redrafted');

  // A stale snapshot (stats through week 8 for week 10) writes nothing and fetches nothing.
  const fetches = gh.calls.length;
  const stale = await f.run({ fantasy: fantasyFor(snapshotFor({ week: 10, through: 8 })), fetchText: gh.fetchText });
  assert.deepEqual(stale.body, { runId: stale.runId, status: 'skipped', reason: 'nothing_due', summary: { season: SEASON, slate: { week: 10, action: 'skipped', reason: 'no_fresh_snapshot' }, actuals: [], finalize: [] } });
  assert.equal(await f.slateRow(10), undefined); assert.equal(gh.calls.length, fetches);
  // Track 1 unavailable: nothing written, and the run is a failure to look at.
  const down = await f.run({ fantasy: fantasyStub(fantasyError(503)), fetchText: gh.fetchText });
  assert.deepEqual(down.body, { runId: down.runId, status: 'failed', reason: 'source_unavailable', summary: { season: SEASON, slate: { action: 'skipped', reason: 'no_fresh_snapshot' }, actuals: [], finalize: [] } });
  // The schedule unavailable: nothing written.
  const noGames = await f.run({ fantasy: fantasyFor(snapshotFor({ week: 10 })), fetchText: github({}).fetchText });
  assert.deepEqual(noGames.body.summary.slate, { week: 10, action: 'skipped', reason: 'schedule_unavailable' });
  assert.deepEqual([noGames.body.status, noGames.body.reason], ['failed', 'source_unavailable']);
  assert.equal(await f.slateRow(10), undefined);
  assert.equal((await f.rows('select count(*)::int n from public.gtl_points_slates')).at(0).n, 1);
  assertCountsOnly(logs);
});

test('slate: a commissioner draft is never replaced, and once its open has passed the scheduler publishes it unchanged (actor null), even with Track 1 down', { skip }, async t => {
  const f = await jobsWorld(t);
  const logs = quiet(t);
  const fx = snapshotFor({ week: 9 });
  const games = scheduleGames(fx.gamesCsv, { season: SEASON });
  const built = draftSlate({ snapshot: fx.snapshot, snapshotFile: fx.entry.file, snapshotSha256: fx.entry.sha256, season: SEASON, week: 9, games, now: Date.now() }).slate;
  const manual = { ...built, house: { QB: 11.1, RB: 11.1, WR: 11.1, TE: 11.1, FLEX: 11.1 }, provenance: { manual: true } };
  await f.sql('gtl_points_publish_slate', { p_actor: ACCOUNTS.sean.id, p_action: 'draft', p_season: SEASON, p_week: 9, p_slate: manual });
  const before = await f.slateRow(9);
  const sources = { fantasy: fantasyFor(fx), fetchText: github({ [FILES.games]: fx.gamesCsv }).fetchText };
  const kept = await f.run(sources);
  assert.deepEqual(kept.body, { runId: kept.runId, status: 'skipped', reason: 'nothing_due', summary: { season: SEASON, slate: { week: 9, action: 'kept' }, actuals: [], finalize: [] } });
  const after = await f.slateRow(9);
  for (const key of ['status', 'slots', 'house', 'provenance', 'opens_at', 'created_by', 'audit']) assert.deepEqual(after[key], before[key], key);

  // The commissioner moves the open into the past; the scheduler publishes the commissioner's slate as stored.
  await f.sql('gtl_points_publish_slate', { p_actor: ACCOUNTS.sean.id, p_action: 'draft', p_season: SEASON, p_week: 9, p_slate: { ...manual, opensAt: iso(Date.now() - 60_000) } });
  const down = { fantasy: fantasyStub(fantasyError(503)), fetchText: sources.fetchText };
  const published = await f.run(down);
  assert.deepEqual(published.body, { runId: published.runId, status: 'succeeded', reason: null, summary: { season: SEASON, slate: { week: 9, action: 'published' }, actuals: [], finalize: [] } });
  assert.equal(down.fantasy.calls.length, 0, 'publishing a stored draft reads no snapshot');
  const row = await f.slateRow(9);
  assert.equal(row.status, 'published'); assert.equal(row.published_by, null, 'published by the scheduler'); assert.ok(row.published_at);
  assert.deepEqual(row.house, manual.house); assert.deepEqual(row.provenance, { manual: true }); assert.deepEqual(row.slots, before.slots);
  assert.equal(row.created_by, ACCOUNTS.sean.id);
  assert.deepEqual(row.audit.map(e => [e.action, e.by]), [['draft', ACCOUNTS.sean.id], ['draft', ACCOUNTS.sean.id], ['publish', null]]);
  const again = await f.run(sources);
  assert.deepEqual(again.body.summary.slate, { week: 9, action: 'kept' }); assert.equal(again.body.reason, 'nothing_due');
  assertCountsOnly(logs, ['11.1']);
});

test('actuals and finalize: loads, voids, pending, scores, FINAL, replay of the same files and a recorded fetch failure that changes nothing', { skip }, async t => {
  const f = await jobsWorld(t);
  const logs = quiet(t);
  const insert = (week, slots, first) => f.db.query(`insert into public.gtl_points_slates(season,week,status,opens_at,finalize_at,scoring_rules,slots,house,provenance,published_at,audit)
    values($1,$2,'published',$3,$4,$5,$6,$7,$8,$3,'[]')`, [SEASON, week, iso(first - 3 * DAY), iso(Date.now() - HOUR), POINTS_RULES, JSON.stringify(withKickoffs(slots, first)), HOUSE, { fixture: true }]);
  await insert(5, SLATE_5, KICK_5); await insert(6, SLATE_6, KICK_6);
  await f.db.transaction(async tx => {
    await tx.exec('set local session_replication_role = replica');
    for (const week of [5, 6]) await tx.query("insert into public.gtl_points_guesses(user_id,season,week,slot,guess,locked_at) values($1,$2,$3,'QB',$4,$5)", [ACCOUNTS.luke.id, SEASON, week, GUESS, iso(Date.now() - 12 * DAY)]);
  });
  const gh = github(ACTUAL_FILES);
  const sources = { fantasy: fantasyStub(fantasyError(404)), fetchText: gh.fetchText };
  const first = await f.run(sources);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { runId: first.runId, status: 'succeeded', reason: null, summary: { season: SEASON, slate: { action: 'skipped', reason: 'no_fresh_snapshot' },
    actuals: [{ week: 5, status: 'saved', rowsSaved: 6, partial: false }, { week: 6, status: 'saved', rowsSaved: 5, partial: true }],
    finalize: [{ week: 5, final: true }, { week: 6, final: false, reason: 'pending_stats' }] } });
  const loads = await f.rows('select week,status,source_url,source_release,upstream_published_at,sha256,rows_saved,coverage from public.gtl_points_actual_loads order by week');
  assert.deepEqual(loads.map(l => [l.week, l.status, l.source_url, l.source_release, l.sha256, l.rows_saved]),
    [[5, 'saved', NFLVERSE.stats(SEASON), 'stats_player', sha(statsCsv), 6], [6, 'saved', NFLVERSE.stats(SEASON), 'stats_player', sha(statsCsv), 5]]);
  assert.equal(iso(loads[0].upstream_published_at), '2026-10-26T04:46:00.000Z');
  assert.deepEqual(loads[1].coverage, { rows: 2, rowsWithoutNameOrTeam: 0, slatePlayersWithoutStats: 3, snapsSha256: sha(snapsCsv), rosterSha256: sha(rostersCsv), gamesSha256: sha(gamesCsv), partial: true });
  const slots = async week => Object.fromEntries((await f.sql('gtl_points_read', { p_viewer: ACCOUNTS.luke.id, p_season: SEASON, p_week: week, p_group: null, p_now: null })).slots.map(s => [s.slot, [s.state, s.actual, s.voidReason]]));
  assert.equal(gamesCsv.includes(gid(6, 'BUF', 'NYJ')), false, 'the moved game is listed only under its new id, as nflverse does');
  assert.deepEqual(await slots(6), { QB: ['scored', 18, null], RB: ['void', null, 'inactive'], WR: ['void', null, 'postponed'], TE: ['pending', null, null], FLEX: ['scored', 20, null] });
  assert.deepEqual(await slots(5), { QB: ['scored', 24, null], RB: ['scored', 19, null], WR: ['scored', 8.5, null], TE: ['scored', 0, null], FLEX: ['void', null, 'no_snaps'] });
  assert.deepEqual((await f.rows('select week from public.gtl_points_week_final order by week')).map(r => r.week), [5], 'week 5 is FINAL; week 6 waits on its TE');
  assert.equal((await f.sql('gtl_points_read', { p_viewer: ACCOUNTS.luke.id, p_season: SEASON, p_week: 5, p_group: null, p_now: null })).result.status, 'FINAL');
  // Spoiler and privacy: no guess, name, House value, hash, URL or secret in the summary or the reply.
  const replyText = first.text.replace(first.runId, '');
  for (const needle of ['Fixture', String(GUESS), String(HOUSE.QB), String(HOUSE.TE), 'http', 'sig=', SERVICE_KEY, first.token, 'house', 'guess', 'name']) assert.equal(replyText.includes(needle), false, needle);
  assert.equal(hex64.test(replyText), false);
  const stored = (await f.rows('select summary from public.gtl_points_job_runs where id=$1', [first.runId]))[0].summary;
  assert.deepEqual(stored, first.body.summary, 'the stored summary is the reply summary');

  // The same files again: the loads replay, nothing new is written, week 6 still waits.
  const actualsBefore = await f.rows('select * from public.gtl_points_actuals order by week,player_id');
  const second = await f.run(sources);
  assert.deepEqual(second.body, { runId: second.runId, status: 'skipped', reason: 'nothing_due', summary: { season: SEASON, slate: { action: 'skipped', reason: 'no_fresh_snapshot' },
    actuals: [{ week: 6, status: 'replayed', rowsSaved: 0, partial: true }], finalize: [{ week: 6, final: false, reason: 'pending_stats' }] } });
  assert.equal((await f.rows("select count(*)::int n from public.gtl_points_actual_loads where status='saved'"))[0].n, 2, 'no second load');

  // A fetch failure: a failed load is recorded for the due week and nothing else changes.
  const readBefore = await f.sql('gtl_points_read', { p_viewer: ACCOUNTS.luke.id, p_season: SEASON, p_week: 6, p_group: null, p_now: null });
  const broken = github(ACTUAL_FILES, { fail: [FILES.stats] });
  const failed = await f.run({ fantasy: sources.fantasy, fetchText: broken.fetchText });
  assert.deepEqual(failed.body, { runId: failed.runId, status: 'failed', reason: 'source_unavailable', summary: { season: SEASON, slate: { action: 'skipped', reason: 'no_fresh_snapshot' },
    actuals: [{ week: 6, status: 'failed', rowsSaved: 0, partial: null }], finalize: [{ week: 6, final: false, reason: 'pending_stats' }] } });
  const failedLoad = (await f.rows("select week,source_url,source_release,sha256,error,rows_saved from public.gtl_points_actual_loads where status='failed'"));
  assert.deepEqual(failedLoad, [{ week: 6, source_url: NFLVERSE.stats(SEASON), source_release: 'stats_player', sha256: null, error: 'stats unavailable', rows_saved: 0 }]);
  assert.deepEqual(await f.rows('select * from public.gtl_points_actuals order by week,player_id'), actualsBefore, 'actuals unchanged');
  assert.deepEqual(await f.sql('gtl_points_read', { p_viewer: ACCOUNTS.luke.id, p_season: SEASON, p_week: 6, p_group: null, p_now: null }), readBefore, 'results unchanged');
  assert.equal(failed.text.includes('http'), false);

  // A replayed run returns the stored outcome without doing any work.
  const fetches = broken.calls.length, rpcs = f.rpcCalls.length;
  const replay = await f.read(await f.post(failed.handler, { token: failed.token, body: JSON.stringify({ runId: failed.runId }) }));
  assert.deepEqual(replay.body, { runId: failed.runId, status: 'failed', reason: 'source_unavailable' });
  assert.equal(broken.calls.length, fetches); assert.deepEqual(f.rpcCalls.slice(rpcs), ['gtl_claim_points_jobs']);
  assert.ok(logs.length >= 3, 'one counts line per completed run');
  assertCountsOnly(logs, [String(GUESS), String(HOUSE.TE), first.token]);
});

test('auth and nothing due: bad requests never claim, a wrong capability is refused by the claim, nothing due completes skipped, and a replay does no work', { skip }, async t => {
  const f = await jobsWorld(t);
  const logs = quiet(t);
  const { runId } = (await f.db.query('select public.gtl_dispatch_points_jobs() value')).rows[0].value;
  const token = await f.capability(runId);
  const fantasy = fantasyStub(fantasyError(404));
  const handler = createPointsJobsHandler({ service: f.service, sources: { fantasy, fetchText: async () => { throw new Error('never'); } } });
  const body = JSON.stringify({ runId });
  assert.equal((await f.post(handler, { body })).status, 401, 'no bearer');
  assert.equal((await f.post(handler, { token: 'short', body })).status, 401);
  assert.equal((await f.post(handler, { token, method: 'GET' })).status, 405);
  assert.equal((await f.post(handler, { token, body, url: `${ENDPOINT}?runId=${runId}` })).status, 400);
  assert.equal((await f.post(handler, { token, body: JSON.stringify({ runId, week: 6 }) })).status, 400);
  assert.equal((await f.post(handler, { token, body, type: 'text/plain' })).status, 400);
  assert.deepEqual(f.rpcCalls, [], 'no request reached the database');
  const wrong = await f.post(handler, { token: 'b'.repeat(64), body });
  assert.equal(wrong.status, 401); assert.equal((await wrong.text()).includes(token), false);
  assert.equal((await f.rows('select status from public.gtl_points_job_runs'))[0].status, 'queued', 'a refused claim changes nothing');

  const done = await f.read(await f.post(handler, { token, body }));
  assert.deepEqual(done.body, { runId, status: 'skipped', reason: 'nothing_due', summary: { season: SEASON, slate: { action: 'skipped', reason: 'no_fresh_snapshot' }, actuals: [], finalize: [] } });
  const run = (await f.rows('select status,reason,summary from public.gtl_points_job_runs'))[0];
  assert.deepEqual([run.status, run.reason, run.summary], ['skipped', 'nothing_due', done.body.summary]);
  const calls = fantasy.calls.length;
  const replay = await f.read(await f.post(handler, { token, body }));
  assert.deepEqual(replay.body, { runId, status: 'skipped', reason: 'nothing_due' });
  assert.equal(fantasy.calls.length, calls, 'a replay does no work');
  assertCountsOnly(logs, [token]);
});
