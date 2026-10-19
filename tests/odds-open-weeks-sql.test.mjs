import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ALL, HOSTED, PRELUDE, migrationSql } from './migrations.mjs';
import { catalog, readMigrations } from '../scripts/migration-functions.mjs';
import { seed } from '../server/store.mjs';
import { createOddsProvider } from '../cloud/odds-provider.mjs';
import { createScheduledRefreshAdapter, createScheduledRefreshHandler } from '../cloud/odds-refresh.mjs';
import { handleOddsCollection } from '../cloud/odds-collection.mjs';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
// Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';

// Stage 22 of docs/REDESIGN_BUILD_PLAN.md, M-05 (D-39: "Keep collecting games that haven't started", same calls, no
// extra credits). After the next week opens on Monday, the collector keeps the previous week's games that have not
// kicked off. Every migration runs in order (ALL, which has M-05; HOSTED where a test compares with the schema players
// have today). The scheduled worker, the gtl-api handler and the real provider adapter run in process; the provider is
// a local double of The Odds API V4, so every request it would receive is counted. Every line is synthetic and no
// request leaves this process.
const M05 = '20261014221500_gtl_odds_open_weeks.sql';
const M02 = '20261015030000_gtl_sent_picks_final.sql';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = n => new Date(n).toISOString();
const MINUTE = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const COMMISSIONER = 1, TWO = 2, THREE = 3;
const USERS = [COMMISSIONER, TWO, THREE];
const NAMES = { [COMMISSIONER]: 'Commissioner', [TWO]: 'Player Two', [THREE]: 'Player Three' };
const SOURCE = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';
const BOOKS = ['draftkings', 'fanduel', 'betmgm'];
const TEAMS = { SEA: 'Seattle Seahawks', DEN: 'Denver Broncos', ARI: 'Arizona Cardinals', LAR: 'Los Angeles Rams', BUF: 'Buffalo Bills', MIA: 'Miami Dolphins', NE: 'New England Patriots', NYJ: 'New York Jets', BAL: 'Baltimore Ravens', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', PIT: 'Pittsburgh Steelers', HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', TEN: 'Tennessee Titans', KC: 'Kansas City Chiefs', LV: 'Las Vegas Raiders', LAC: 'Los Angeles Chargers', DAL: 'Dallas Cowboys', NYG: 'New York Giants', PHI: 'Philadelphia Eagles', WAS: 'Washington Commanders', CHI: 'Chicago Bears', DET: 'Detroit Lions', GB: 'Green Bay Packers', MIN: 'Minnesota Vikings', ATL: 'Atlanta Falcons' };
const CODES = Object.keys(TEAMS);
const game = (away, home, kickoff) => ({ id: `${away}-${home}`, away: TEAMS[away], home: TEAMS[home], awayCode: away, homeCode: home, matchup: `${TEAMS[away]} @ ${TEAMS[home]}`, kickoff: iso(kickoff) });
// Synthetic half-point lines nothing else in a row can equal: the Monday game and every other game.
const MONDAY_LINE = { spread: -6.5, total: 47.5 }, OTHER_LINE = { spread: -3.5, total: 44.5 };

// D-24 opens a week at Monday 00:00 PT of its deadline's week, so this week's deadline stays inside the current Pacific
// week whatever day the suite runs (as tests/submission-line-at-guess-sql.test.mjs does).
function pacificWeekLeft(now) {
  const part = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(now).map(p => [p.type, p.value]));
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(part.weekday);
  return 7 * DAY - (((day * 24 + Number(part.hour)) * 60 + Number(part.minute)) * 60 + Number(part.second)) * 1000;
}
// Last week (Week 6): thirteen games played four days ago and the Monday night game at `monday`. This week (Week 7):
// the deadline game, then the rest at least three days after the Monday game, so no team plays twice within two days.
// Both Monday teams play again this week, as on a real schedule.
function slates(now, monday) {
  const first = now + Math.max(5 * MINUTE, Math.min(3 * DAY, pacificWeekLeft(now) - 2 * HOUR));
  const later = Math.max(first, monday) + 3 * DAY, last = [], next = [];
  for (let i = 0; i < 14; i++) last.push(game(CODES[2 * i], CODES[2 * i + 1], i < 13 ? now - 4 * DAY + i * HOUR : monday));
  for (let i = 0; i < 14; i++) next.push(game(CODES[2 * i + 1], CODES[(2 * i + 2) % 28], i === 0 ? first : later + i * HOUR));
  return { last: { games: last, deadline: last[0].kickoff }, next: { games: next, deadline: next[0].kickoff }, mondayGame: last[13] };
}

// The Odds API V4 as cloud/odds-provider.mjs calls it, answering from the games it is given: /events is free and lists
// every game in the requested window; /odds reports two credits (two markets, one region) however many event ids it
// names. `priced` decides which games have three books posted. Synthetic lines only.
function oddsApi(games, { priced = () => true } = {}) {
  const requests = []; let remaining = 480, used = 20;
  const event = g => ({ id: `evt_${g.id}`, sport_key: 'americanfootball_nfl', sport_title: 'NFL', home_team: g.home, away_team: g.away, commence_time: iso(Date.parse(g.kickoff)) });
  const reply = (data, last) => { remaining -= last; used += last; return Response.json(data, { headers: { 'x-requests-remaining': String(remaining), 'x-requests-used': String(used), 'x-requests-last': String(last) } }); };
  const fetchImpl = async url => {
    const u = new URL(url); requests.push(u);
    const all = games();
    if (u.pathname === '/v4/sports/americanfootball_nfl/events') {
      const from = Date.parse(u.searchParams.get('commenceTimeFrom')), to = Date.parse(u.searchParams.get('commenceTimeTo'));
      return reply(all.map(event).filter(e => Date.parse(e.commence_time) >= from && Date.parse(e.commence_time) <= to), 0);
    }
    const ids = u.searchParams.get('eventIds').split(','), stamp = iso(Date.now() - 30_000);
    return reply(all.filter(g => ids.includes(`evt_${g.id}`)).map(g => {
      const e = event(g), { spread, total } = g.line || OTHER_LINE;
      return { ...e, bookmakers: !priced(g) ? [] : BOOKS.map(key => ({ key, title: key, last_update: stamp, markets: [
        { key: 'spreads', last_update: stamp, outcomes: [{ name: g.home, price: -110, point: spread }, { name: g.away, price: -110, point: -spread }] },
        { key: 'totals', last_update: stamp, outcomes: [{ name: 'Over', price: -110, point: total }, { name: 'Under', price: -110, point: total }] }] })) };
    }), 2);
  };
  const of = name => requests.filter(u => u.pathname.endsWith(`/${name}`));
  return { requests, fetchImpl, of, provider: () => createOddsProvider({ apiKey: 'fixture-key-not-a-real-key', fetchImpl }) };
}

async function fixture(t, { files = ALL, monday = 2 * HOUR, now, priced } = {}) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  for (const [n, file] of files.entries()) {
    await db.exec(migrationSql(file));
    if (n === 0) {
      // The private league row the commissioner check reads (the repository's league file, as every SQL suite uses).
      await db.query("insert into public.gtl_leagues(id,state) values('sean-troy-luke',$1)", [seed()]);
      for (const u of USERS) await db.query('insert into auth.users values($1)', [id(u)]);
      await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner')", [id(COMMISSIONER)]);
    }
    if (n === 1) for (const u of USERS) await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [id(u), NAMES[u]]);
  }
  // Local-only extension double for the queue; no network, no hosted credential.
  await db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';");
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const log = [];
  const rpc = async (name, args = {}) => {
    const keys = Object.keys(args);
    try {
      const result = (await as('service_role', `select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')}) value`,
        keys.map(key => args[key] !== null && typeof args[key] === 'object' ? JSON.stringify(args[key]) : args[key]))).rows[0].value;
      log.push({ name, args, result }); return result;
    } catch (error) { log.push({ name, args, error: error.message }); throw error; }
  };
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  // Hosted shape: the schedule row enabled, the budget measured (480 credits, a free check an hour ago).
  await db.query("insert into public.gtl_odds_schedule(id,enabled,endpoint,authorized_by,season,week,slate_signature) select 'nfl-12h',true,'https://example.supabase.co/functions/v1/gtl-odds-refresh',$1,season,week,signature from public.gtl_weekly_slates where week=5", [id(COMMISSIONER)]);
  await db.exec("update public.gtl_odds_budget set conservative_remaining=480,observed_remaining=480,last_successful_preflight_at=now()-interval '1 hour',last_collection_at=now()-interval '20 minutes'");
  // Kickoffs are relative to `now` (two fixtures that compare share it), else to the moment the weeks are published.
  // `monday` is milliseconds after that: the Monday game kicks off then (negative: it already has).
  const base = now ?? Date.now(), week = slates(base, base + monday);
  week.mondayGame.line = MONDAY_LINE;
  const publish = (n, slate) => rpc('gtl_publish_week', { p_user: id(COMMISSIONER), p_season: 2026, p_week: n, p_games: slate.games, p_deadline: slate.deadline, p_source: SOURCE });
  assert.equal((await publish(6, week.last)).published, true);
  assert.equal((await publish(7, week.next)).published, true);
  const signature = async n => (await q('select signature from public.gtl_weekly_slates where season=2026 and week=$1', [n]))[0].signature;
  const api = oddsApi(() => [...week.last.games, ...week.next.games], { priced });
  // gtl-odds-refresh exactly as deployed: the scheduled adapter's REST calls are answered by this database.
  const rest = async (url, options = {}) => {
    const name = /^\/rest\/v1\/rpc\/(gtl_[a-z_]+)$/.exec(new URL(url).pathname)?.[1];
    if (!name) return Response.json({ message: 'unexpected request' }, { status: 404 });
    try { return Response.json(await rpc(name, JSON.parse(options.body))); }
    catch (error) { return Response.json({ message: error.message }, { status: 400 }); }
  };
  const worker = createScheduledRefreshHandler({ service: createScheduledRefreshAdapter({ url: 'https://example.supabase.co', serviceRoleKey: 'fixture', fetchImpl: rest }), provider: api.provider });
  const run = async () => {
    const queued = (await q('select public.gtl_dispatch_odds_refresh() value'))[0].value;
    assert.equal(queued.status, 'queued');
    const token = (await q("select headers->>'Authorization' auth from net.outbox where body->>'runId'=$1 order by id desc limit 1", [queued.runId]))[0].auth.slice(7);
    const response = await worker(new Request('https://example.supabase.co/functions/v1/gtl-odds-refresh', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ runId: queued.runId }) }));
    return { runId: queued.runId, status: response.status, data: await response.json() };
  };
  const claim = async () => {
    const queued = (await q('select public.gtl_dispatch_odds_refresh() value'))[0].value;
    const token = (await q("select headers->>'Authorization' auth from net.outbox where body->>'runId'=$1 order by id desc limit 1", [queued.runId]))[0].auth.slice(7);
    return rpc('gtl_claim_odds_refresh', { p_token: token, p_run: queued.runId });
  };
  const resetRuns = () => db.exec("delete from public.gtl_odds_refresh_runs;update public.gtl_odds_budget set last_collection_at=now()-interval '20 minutes'");
  const cooldownPassed = () => db.exec("update public.gtl_odds_budget set last_collection_at=clock_timestamp()-interval '6 minutes'");
  const budget = async () => (await q('select * from public.gtl_odds_budget'))[0];
  const collections = () => q("select id,operation,status,reserved_credits credits,season,week,diagnostics,started_at,expires_at,finished_at,slate_signature from public.gtl_odds_collections order by started_at,reserved_credits desc,id");
  const snapshots = () => q('select id,season,week,slate_signature,payload,created_at from public.gtl_market_snapshots order by created_at,week desc,id');
  const results = name => log.filter(entry => entry.name === name);

  // The gtl-api handler as deployed (supabase/functions/gtl-api/index.ts), its REST calls answered by this database.
  const fetchImpl = async (url, options = {}) => {
    if (new URL(url).pathname === '/auth/v1/user') {
      const who = Number(/^Bearer token-(\d)$/.exec(options.headers?.Authorization || '')?.[1]);
      return USERS.includes(who) ? Response.json({ id: id(who), role: 'authenticated', email: `player${who}@example.invalid`, email_confirmed_at: '2026-10-01T00:00:00Z' }) : Response.json({}, { status: 401 });
    }
    return rest(url, options);
  };
  const handle = createCloudHandler({ ...createSupabaseAdapter({ url: 'https://open-weeks.example.invalid', anonKey: 'fixture-anon', serviceRoleKey: 'fixture-service', fetchImpl }), oddsProvider: api.provider });
  const call = async (who, route, body) => {
    const response = await handle(new Request(`https://open-weeks.example.invalid/functions/v1/gtl-api${route}`, { method: 'POST',
      headers: { authorization: `Bearer token-${who}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  const save = async (who, n, picks, submit) => {
    const view = (await call(who, '/personal/read', { season: 2026, week: n })).body;
    return call(who, '/personal/ballot', { season: 2026, week: n, mode: 'guess_spread', weeklyRevision: view.weeklyRevision, picks, submit, requestId: crypto.randomUUID(), revision: view.revision });
  };
  return { db, as, rpc, q, log, results, week, signature, api, run, claim, resetRuns, cooldownPassed, budget, collections, snapshots, call, save };
}

const ids = games => games.map(g => g.gameId ?? g.id);

test('Monday after the next week opens: one scheduled run collects this week and the unstarted Monday game in the same two provider requests and stores each week its own snapshot', { skip }, async t => {
  const now = Date.now();
  // The same slates on the schema players have today (HOSTED, without M-05) and with M-05 (ALL).
  const before = await fixture(t, { files: HOSTED.filter(file => !file.startsWith('20261014221500')), now });
  const f = await fixture(t, { now });
  const old = await before.run(), result = await f.run();
  assert.deepEqual([old.status, old.data.status, old.data.reason], [200, 'succeeded', null]);
  assert.deepEqual([result.status, result.data.status, result.data.reason], [200, 'succeeded', null]);

  // Same calls: one free event check and one odds request, the same markets, region and books, one more event id.
  assert.deepEqual(f.api.requests.map(u => u.pathname), before.api.requests.map(u => u.pathname));
  assert.deepEqual(f.api.requests.map(u => u.pathname.split('/').at(-1)), ['events', 'odds']);
  const [odds, oldOdds] = [f.api.of('odds')[0], before.api.of('odds')[0]];
  for (const key of ['regions', 'markets', 'bookmakers', 'oddsFormat', 'dateFormat']) assert.equal(odds.searchParams.get(key), oldOdds.searchParams.get(key), key);
  assert.equal(odds.searchParams.get('markets'), 'spreads,totals'); assert.equal(odds.searchParams.get('regions'), 'us');
  assert.deepEqual(odds.searchParams.get('eventIds').split(','), [...oldOdds.searchParams.get('eventIds').split(','), `evt_${f.week.mondayGame.id}`]);
  // No extra credits: the measured budget moves by the same two credits.
  assert.equal((await before.budget()).conservative_remaining, 478); assert.equal((await f.budget()).conservative_remaining, 478);

  const [job, carried] = await f.collections();
  assert.deepEqual([job.operation, job.status, job.credits, job.week], ['collect', 'succeeded', 2, 7]);
  assert.deepEqual([carried.operation, carried.status, carried.credits, carried.week], ['collect', 'succeeded', 0, 6], 'a zero-credit record row for the carried snapshot');
  assert.deepEqual(carried.slate_signature, await f.signature(6));
  assert.equal(carried.diagnostics.carryoverOf, job.id); assert.equal(carried.started_at.getTime(), job.started_at.getTime());
  assert.deepEqual([carried.diagnostics.matchedEvents, carried.diagnostics.availableQuotes], [1, 6]);
  // The run's own counts stay this week's (14 games, 84 quotes), so 'succeeded' and 'partial' keep their meaning.
  const [oldJob] = await before.collections();
  assert.deepEqual([job.diagnostics.matchedEvents, job.diagnostics.availableQuotes], [14, 84]);
  assert.deepEqual([oldJob.diagnostics.matchedEvents, oldJob.diagnostics.availableQuotes], [14, 84]);
  assert.deepEqual(job.diagnostics.carryover, { season: 2026, week: 6, games: 1, snapshotId: carried.id, matchedEvents: 1, availableQuotes: 6 });
  assert.deepEqual(Object.keys(job.diagnostics).filter(k => k !== 'carryover').sort(), Object.keys(oldJob.diagnostics).sort());
  assert.deepEqual(await f.q('select status,reason from public.gtl_odds_refresh_runs'), [{ status: 'succeeded', reason: null }]);

  const [week7, week6] = await f.snapshots(), [oldWeek7] = await before.snapshots();
  assert.equal((await before.snapshots()).length, 1);
  assert.deepEqual([week7.id, week7.week, week6.id, week6.week], [job.id, 7, carried.id, 6]);
  assert.deepEqual(ids(week7.payload.games), ids(oldWeek7.payload.games), "this week's snapshot holds exactly this week's games, in the same order");
  assert.deepEqual(ids(week6.payload.games), [f.week.mondayGame.id]);
  assert.deepEqual(week6.slate_signature, await f.signature(6)); assert.equal(week6.created_at.getTime(), week7.created_at.getTime());
  for (const key of ['provider', 'sport', 'fetchedAt', 'officialVerified']) assert.deepEqual(week6.payload[key], week7.payload[key], key);
  // The Monday line, from three books, is a qualifying line of its own week.
  const slate6 = await f.rpc('gtl_published_slate', { p_season: 2026, p_week: 6 });
  const monday = slate6.games.find(g => g.id === f.week.mondayGame.id);
  const line = await f.rpc('gtl_line_from_snapshot', { p_payload: week6.payload, p_game: monday, p_market: 'spread' });
  assert.equal(line.value, MONDAY_LINE.spread); assert.equal(line.bookCount, 3);
  assert.equal((await f.rpc('gtl_line_from_snapshot', { p_payload: week6.payload, p_game: monday, p_market: 'total' })).value, MONDAY_LINE.total);
  // Collections that count toward the six a day: one.
  assert.equal((await f.q("select count(*)::int n from public.gtl_odds_collections where operation='collect' and reserved_credits=2"))[0].n, 1);
});

test('with no unstarted game from last week (Tuesday to Sunday) the collector is exactly as before: same games, requests, rows, payload and result keys', { skip }, async t => {
  const now = Date.now();
  const before = await fixture(t, { files: HOSTED.filter(file => !file.startsWith('20261014221500')), now, monday: -HOUR }), f = await fixture(t, { now, monday: -HOUR });
  assert.equal(await f.rpc('gtl_odds_carryover_slate', { p_at: iso(Date.now()) }), null);
  const old = await before.run(), result = await f.run();
  assert.deepEqual([result.status, result.data.status, result.data.reason], [old.status, old.data.status, old.data.reason]);
  assert.deepEqual(f.api.requests.map(String).map(u => u.replace(/apiKey=[^&]+/, '')), before.api.requests.map(String).map(u => u.replace(/apiKey=[^&]+/, '')), 'the same two provider requests, parameter for parameter');
  const [begin] = f.results('gtl_begin_odds_collection'), [oldBegin] = before.results('gtl_begin_odds_collection');
  assert.deepEqual(Object.keys(begin.result).sort(), Object.keys(oldBegin.result).sort());
  assert.deepEqual(begin.result.games, oldBegin.result.games);
  const [finish] = f.results('gtl_finish_odds_collection'), [oldFinish] = before.results('gtl_finish_odds_collection');
  assert.deepEqual(Object.keys(finish.result), Object.keys(oldFinish.result), 'no carryover key without a carried game');
  for (const key of ['status', 'matchedEvents', 'availableQuotes', 'quota', 'officialVerified', 'errorCode']) assert.deepEqual(finish.result[key], oldFinish.result[key], key);
  const rows = await f.collections(), oldRows = await before.collections();
  assert.equal(rows.length, 1); assert.equal(oldRows.length, 1);
  assert.deepEqual([rows[0].credits, rows[0].week, Object.keys(rows[0].diagnostics).sort()], [oldRows[0].credits, oldRows[0].week, Object.keys(oldRows[0].diagnostics).sort()]);
  // The stored payload is the adapter's own, byte for byte (jsonb text), exactly as the previous body stored it.
  const [snapshot] = await f.snapshots();
  assert.equal((await f.snapshots()).length, 1);
  assert.equal((await f.q('select payload::text t from public.gtl_market_snapshots'))[0].t, (await f.q('select $1::jsonb::text t', [JSON.stringify(finish.args.p_payload)]))[0].t);
  assert.deepEqual(ids(snapshot.payload.games).sort(), f.week.next.games.map(g => g.id).sort());
});

test('gtl_odds_carryover_slate: only the previous published week\'s games that have not kicked off, never an id or a team clash with the newest week, service-only', { skip }, async t => {
  const f = await fixture(t);
  const kickoff = Date.parse(f.week.mondayGame.kickoff);
  const at = async when => f.rpc('gtl_odds_carryover_slate', { p_at: when });
  const now = await at(iso(Date.now()));
  const slate6 = await f.rpc('gtl_published_slate', { p_season: 2026, p_week: 6 });
  assert.deepEqual(now, { season: 2026, week: 6, signature: await f.signature(6), games: slate6.games.filter(g => g.id === f.week.mondayGame.id) });
  assert.deepEqual(Object.keys(now.games[0]).sort(), ['away', 'home', 'id', 'kickoff'], 'the adapter shape of gtl_published_slate');
  assert.equal((await at(iso(kickoff - 1))).games.length, 1, 'a millisecond before kickoff it still rides along');
  assert.equal(await at(iso(kickoff)), null, 'from kickoff on it is never collected again');
  assert.equal((await at(iso(Date.now() - 5 * DAY))).games.length, 14, 'before the week started every game would ride along');
  for (const bad of [null, 'infinity', '-infinity']) assert.equal(await at(bad), null, String(bad));
  // A previous week without a matching template carries nothing (and never fails a collection).
  await f.db.exec("update public.gtl_schedule_templates set deadline=deadline+interval '1 hour' where week=6");
  assert.equal(await at(iso(Date.now())), null);
  await f.db.exec("update public.gtl_schedule_templates set deadline=deadline-interval '1 hour' where week=6");
  assert.equal((await at(iso(Date.now()))).games.length, 1);
  // Grants: service-only, like every gtl_ RPC.
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await f.q("select has_function_privilege($1,'public.gtl_odds_carryover_slate(timestamptz)','EXECUTE') ok", [role]))[0].ok, false, role);
    await assert.rejects(() => f.as(role, 'select public.gtl_odds_carryover_slate(now())'), /permission denied/);
  }
  // Week 8 published early makes Week 7 the previous week, with every game unstarted. A Week 8 game with a Week 7 id
  // (days later) and one with a Week 7 team inside two days leave those Week 7 games out; a team exactly two days
  // apart does not.
  const next = f.week.next.games;
  const w8 = [
    { ...next[3], kickoff: iso(Math.max(...next.map(g => Date.parse(g.kickoff))) + 3 * DAY) },
    game(next[5].homeCode, next[1].homeCode, Date.parse(next[5].kickoff) + 2 * DAY - 1),
    game(next[7].homeCode, next[2].homeCode, Date.parse(next[7].kickoff) + 2 * DAY),
  ];
  const deadline = iso(Math.min(...w8.map(g => Date.parse(g.kickoff))));
  assert.equal((await f.rpc('gtl_publish_week', { p_user: id(COMMISSIONER), p_season: 2026, p_week: 8, p_games: w8, p_deadline: deadline, p_source: SOURCE })).published, true);
  const carried = await at(iso(Date.now()));
  assert.equal(carried.week, 7);
  assert.deepEqual(carried.games.map(g => g.id).sort(), next.map(g => g.id).filter(x => x !== next[3].id && x !== next[5].id).sort());
});

// A collection payload in the adapter's shape (cloud/odds-provider.mjs normalize) for games as gtl_begin_odds_collection
// hands them out; a game kicked off at `captured` is listed as kickoff_passed without quotes, like the adapter does.
function payload(games, { captured = Date.now(), monday, priced = () => true } = {}) {
  const at = iso(captured), observed = iso(captured - 30_000);
  return { provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: at, selectedBooks: BOOKS, status: 'partial', officialVerified: false, quota: { remaining: 470, used: 30, last: 2 },
    games: games.map(g => {
      const open = Date.parse(g.kickoff) > captured, posted = open && priced(g), line = g.id === monday ? MONDAY_LINE : OTHER_LINE;
      return { gameId: g.id, home: g.home, away: g.away, kickoff: iso(Date.parse(g.kickoff)), providerEventId: open ? `evt_${g.id}` : null, matchStatus: open ? 'matched' : 'kickoff_passed',
        markets: Object.fromEntries(['spread', 'total'].map(m => [m, { status: posted ? 'available' : 'unavailable', unavailable: [], quotes: !posted ? [] : BOOKS.map(book => ({
          provider: 'the-odds-api', providerEventId: `evt_${g.id}`, book, market: m, value: line[m], collectedAt: at, providerObservedAt: observed, timeBasis: 'provider_market_last_update',
          outcomes: m === 'spread' ? { home: { line: line.spread, odds: -110 }, away: { line: -line.spread, odds: -110 } } : { over: { line: line.total, odds: -110 }, under: { line: line.total, odds: -110 } } })) }])) };
    }) };
}
const begin = (f, request) => f.rpc('gtl_begin_odds_collection', { p_user: id(COMMISSIONER), p_request: request, p_operation: 'collect' });
const finish = (f, job, data) => f.rpc('gtl_finish_odds_collection', { p_user: id(COMMISSIONER), p_request: job.requestId, p_lease: job.lease, p_payload: data, p_quota: { remaining: 470, used: 30, last: 2 }, p_error: null });

test('a carried game without books, a fault storing it, or a kickoff during the 90-second lease stores nothing for its week; a payload that drops it is refused as before', { skip }, async t => {
  await t.test('no books posted yet for the Monday game: the commissioner collection stores this week only', async t => {
    const f = await fixture(t, { priced: g => !g.line });
    // POST /odds/collect after the route's commissioner check: the same module the scheduled worker runs.
    const res = await handleOddsCollection({ route: '/odds/collect', body: { requestId: id(900) }, user: { id: id(COMMISSIONER) }, service: { rpc: f.rpc }, provider: f.api.provider });
    assert.deepEqual([res.status, res.snapshotId, res.matchedEvents, res.availableQuotes], ['succeeded', id(900), 14, 84]);
    assert.equal(f.api.of('odds').length, 1); assert.equal(f.api.of('odds')[0].searchParams.get('eventIds').split(',').length, 15);
    const rows = await f.collections();
    assert.equal(rows.length, 1, 'no record row without a carried line');
    assert.deepEqual(rows[0].diagnostics.carryover, { season: 2026, week: 6, games: 1, snapshotId: null, matchedEvents: 1, availableQuotes: 0 });
    assert.deepEqual((await f.snapshots()).map(s => [s.week, s.payload.games.length]), [[7, 14]]);
    // A payload that leaves the carried game out is refused like any payload that does not match the slate.
    await f.cooldownPassed();
    const job = await begin(f, id(901));
    assert.equal(job.games.length, 15); assert.equal(job.games.at(-1).id, f.week.mondayGame.id);
    await assert.rejects(() => finish(f, job, payload(job.games.slice(0, 14))), /GTL_ODDS_PAYLOAD/);
    assert.equal((await f.snapshots()).length, 1);
  });
  await t.test('a fault storing the carried snapshot stores nothing for last week and keeps this week\'s snapshot', async t => {
    const f = await fixture(t);
    // Test-only fault on this disposable database: any Week 6 snapshot insert fails.
    await f.db.exec("create function public.test_refuse_week_six() returns trigger language plpgsql as $$ begin if new.week=6 then raise exception 'test fault'; end if; return new; end $$;"
      + 'create trigger test_refuse_week_six before insert on public.gtl_market_snapshots for each row execute function public.test_refuse_week_six();');
    const res = await handleOddsCollection({ route: '/odds/collect', body: { requestId: id(920) }, user: { id: id(COMMISSIONER) }, service: { rpc: f.rpc }, provider: f.api.provider });
    assert.deepEqual([res.status, res.snapshotId, res.availableQuotes], ['succeeded', id(920), 84]);
    assert.deepEqual((await f.snapshots()).map(s => s.week), [7]);
    const rows = await f.collections();
    assert.deepEqual(rows.map(r => [r.week, r.credits]), [[7, 2]], 'the record row is rolled back with the carried snapshot');
    assert.deepEqual(rows[0].diagnostics.carryover, { season: 2026, week: 6, games: 1, snapshotId: null, matchedEvents: 1, availableQuotes: 6 });
  });
  await t.test('the Monday game kicks off during the lease: the job keeps the list it started with', async t => {
    const f = await fixture(t, { monday: 5000 });
    const kickoff = Date.parse(f.week.mondayGame.kickoff);
    assert.ok(kickoff - Date.now() > 1000, 'the fixture published the Monday game before its kickoff');
    const job = await begin(f, id(910));
    assert.equal(job.games.length, 15);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, kickoff - Date.now()) + 250));
    const done = await finish(f, job, payload(job.games, { monday: f.week.mondayGame.id }));
    assert.equal(done.status, 'succeeded'); assert.equal(done.availableQuotes, 84);
    assert.deepEqual(done.carryover, { season: 2026, week: 6, games: 1, snapshotId: null, matchedEvents: 0, availableQuotes: 0 });
    assert.deepEqual((await f.snapshots()).map(s => s.week), [7]);
    // From kickoff on the Monday game is never handed out again.
    await f.cooldownPassed();
    assert.equal((await begin(f, id(911))).games.length, 14);
  });
});

test('the carried line serves every reader of its week: a guess saved before any line resolves to it, and a save on Monday reads it', { skip }, async t => {
  const f = await fixture(t);
  const mondayId = f.week.mondayGame.id, sig6 = await f.signature(6);
  const monday = (await f.rpc('gtl_published_slate', { p_season: 2026, p_week: 6 })).games.find(g => g.id === mondayId);
  // A Week 6 spread ballot saved five days ago, before any line was stored, so every reference is pending (D-27), as the
  // save path wrote it then. Triggers are off for this fixture insert only; the collection's update below runs them all.
  const saved = iso(Date.now() - 5 * DAY);
  await f.db.exec('set session_replication_role = replica');
  await f.db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,6)', [id(TWO)]);
  await f.db.query(`insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) select $1,2026,6,'guess_spread',jsonb_build_object(
      'picks',(select jsonb_object_agg(g->>'id',-3) from jsonb_array_elements(s.signature->'games') g),'submittedAt',$2::text,'updatedAt',$2::text,
      'scoringReferences',(select jsonb_object_agg(g->>'id',public.gtl_pending_reference($2::timestamptz)) from jsonb_array_elements(s.signature->'games') g))
    from public.gtl_weekly_slates s where s.season=2026 and s.week=6`, [id(TWO), saved]);
  await f.db.exec('set session_replication_role = origin');
  const at = when => f.rpc('gtl_reference_at_save', { p_season: 2026, p_week: 6, p_signature: sig6, p_game: monday, p_market: 'spread', p_saved: when });
  assert.equal((await at(iso(Date.now()))).status, 'pending', 'before Monday\'s collection no Week 6 line exists');
  assert.equal((await f.run()).data.status, 'succeeded');
  const [, carried] = await f.collections();
  const { ballot, audit } = (await f.q("select ballot,audit from public.gtl_weekly_ballots where user_id=$1 and week=6", [id(TWO)]))[0];
  const ref = ballot.scoringReferences[mondayId];
  assert.deepEqual([ref.status, ref.basis, ref.value, ref.snapshotId, Date.parse(ref.savedAt)], ['available', 'first_line_after_submission', MONDAY_LINE.spread, carried.id, Date.parse(saved)]);
  for (const [gameId, other] of Object.entries(ballot.scoringReferences)) if (gameId !== mondayId) assert.equal(other.status, 'pending', `${gameId} kicked off long ago and stays pending`);
  assert.deepEqual(ballot.picks, Object.fromEntries(Object.keys(ballot.picks).map(k => [k, -3])), 'picks are never touched');
  assert.deepEqual([audit.at(-1).type, audit.at(-1).changedGameIds], ['reference_resolved', [mondayId]]);
  // A save on Monday reads the carried line, with its age; this week's references read this week's snapshot.
  const now = await at(iso(Date.now()));
  assert.deepEqual([now.status, now.basis, now.value, now.snapshotId], ['available', 'line_at_guess', MONDAY_LINE.spread, carried.id]);
  const week7 = (await f.rpc('gtl_published_slate', { p_season: 2026, p_week: 7 })).games[0];
  const [job] = await f.collections();
  assert.equal((await f.rpc('gtl_reference_at_save', { p_season: 2026, p_week: 7, p_signature: await f.signature(7), p_game: week7, p_market: 'total', p_saved: iso(Date.now()) })).snapshotId, job.id);
});

test('the October 12 slate_changed case stays green with M-05, also while a Monday game is unstarted: every skip happens before any provider request', { skip }, async t => {
  const f = await fixture(t);
  const league = await f.rpc('gtl_odds_commissioner', { p_user: id(COMMISSIONER) });
  assert.equal(league.week, 5, 'the group league still lags on Week 5');
  const slate = await f.rpc('gtl_odds_collection_slate', { p_user: id(COMMISSIONER) });
  assert.deepEqual([slate.week, slate.games.length], [7, 14], 'the collection slate resolver is unchanged: the newest week, its games only');
  assert.deepEqual(Object.keys(slate).sort(), Object.keys(league).sort());
  const published = await f.signature(7);
  const expectSkip = async (reason, label) => {
    const claim = await f.claim();
    assert.deepEqual({ replay: claim.replay, status: claim.status, reason: claim.reason }, { replay: true, status: 'skipped', reason }, label);
    assert.equal(f.api.requests.length, 0, label); assert.equal((await f.collections()).length, 0, label);
    await f.resetRuns();
  };
  // October 12: the schedule row lags on the week before the newest published week.
  await f.db.exec("update public.gtl_odds_schedule set season=s.season,week=s.week,slate_signature=s.signature from public.gtl_weekly_slates s where s.week=6");
  assert.equal((await f.rpc('gtl_read_odds_schedule', { p_user: id(COMMISSIONER), p_league: 'sean-troy-luke' })).pauseReason, 'slate_changed');
  await expectSkip('slate_changed', 'configuration still on last week');
  await f.db.query('update public.gtl_odds_schedule set season=2026,week=7,slate_signature=$1', [{ ...published, deadline: published.deadline + 3600 }]);
  await expectSkip('slate_changed', 'the same games with a different deadline');
  await f.db.query('update public.gtl_odds_schedule set season=2026,week=7,slate_signature=$1', [published]);
  await f.db.exec("update public.gtl_schedule_templates set deadline=deadline+interval '1 hour' where week=7");
  await expectSkip('slate_unavailable', 'no template matches the published signature');
  await f.db.exec("update public.gtl_schedule_templates set deadline=deadline-interval '1 hour' where week=7");
  await f.db.exec('update public.gtl_memberships set active=false');
  await expectSkip('commissioner_unavailable', 'revoked commissioner');
  await f.db.exec('update public.gtl_memberships set active=true');
  // Restored: the run goes through and carries the Monday game.
  const result = await f.run();
  assert.equal(result.data.status, 'succeeded');
  assert.deepEqual((await f.collections()).map(r => [r.week, r.credits]), [[7, 2], [6, 0]]);
  const meta = await f.rpc('gtl_read_odds_schedule', { p_user: id(COMMISSIONER), p_league: 'sean-troy-luke' });
  assert.deepEqual([meta.week, meta.slateStatus, meta.lastStatus, meta.pauseReason], [7, 'eligible', 'succeeded', null]);
});

const picks = (games, value) => Object.fromEntries(games.map(g => [g.id, value]));

test('50 draft saves on Monday start no collection: no provider request, no collection row, no credit', { skip }, async t => {
  const f = await fixture(t);
  const budget = await f.budget();
  for (let n = 0; n < 50; n++) {
    const res = await f.save(USERS[n % 3], 7, picks(f.week.next.games, n % 2 ? -3 : -2.5), false);
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  assert.equal(f.api.requests.length, 0);
  assert.equal(f.results('gtl_begin_submission_odds_collection').length, 0);
  assert.equal(f.results('gtl_begin_odds_collection').length, 0);
  assert.deepEqual(await f.collections(), []); assert.deepEqual(await f.snapshots(), []);
  assert.deepEqual(await f.budget(), budget);
  assert.deepEqual((await f.q("select count(*)::int n,count(*) filter (where coalesce(ballot->>'submittedAt','')<>'')::int sent from public.gtl_weekly_ballots where week=7"))[0], { n: 3, sent: 0 });
});

test("sends never pass six collections a UTC day: a late send for last week is refused before any request, and this week's sends share the six with the scheduled run; the carried record row never takes one", { skip }, async t => {
  // Books are posted for the Monday game only, so this week's guesses stay pending and every send asks for a refresh.
  // Twenty sends from three accounts re-send changed ballots (D-16 edits). M-02 (stage 18) makes a sent guess final, so
  // this case runs on every migration before it; the cap does not depend on M-02, which only leaves fewer sends to count.
  const f = await fixture(t, { files: ALL.filter(file => file < M02), priced: g => Boolean(g.line) });
  const late = await f.save(TWO, 6, picks(f.week.last.games, -3), true);
  assert.ok(late.status >= 400 && late.status < 500, JSON.stringify(late));
  assert.equal(f.api.requests.length, 0, 'a refused late send starts no collection');
  assert.equal(f.results('gtl_begin_submission_odds_collection').length, 0);
  assert.equal((await f.run()).data.status, 'skipped', 'the scheduled run: no line for this week yet (no_quotes), the Monday line stored');
  assert.deepEqual((await f.collections()).map(r => [r.week, r.credits]), [[7, 2], [6, 0]]);
  for (let n = 0; n < 20; n++) {
    await f.cooldownPassed();
    const res = await f.save(USERS[n % 3], 7, picks(f.week.next.games, n % 2 ? -3 : -2.5), true);
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
  const days = await f.q(`select (started_at at time zone 'UTC')::date::text d,count(*) filter (where reserved_credits=2)::int paid,count(*)::int rows
    from public.gtl_odds_collections where operation='collect' group by 1 order by 1`);
  for (const day of days) assert.ok(day.paid <= 6, JSON.stringify(day));
  const paid = days.reduce((n, day) => n + day.paid, 0);
  assert.equal(f.api.of('odds').length, paid, 'one two-credit provider request per counted collection, nothing else');
  assert.equal((await f.budget()).conservative_remaining, 480 - 2 * paid);
  assert.ok(f.results('gtl_begin_submission_odds_collection').some(r => r.error === 'GTL_ODDS_DAILY_LIMIT') || days.length > 1, 'the cap was reached');
  if (days.length === 1) assert.deepEqual([days[0].paid, days[0].rows], [6, 7], 'six counted collections and the zero-credit record row');
});

test('static: only the existing collector modules call the provider or the collection RPCs', () => {
  const PATTERN = /createOddsProvider|odds-provider\.mjs|api\.the-odds-api\.com|THE_ODDS_API_KEY|gtl_(?:begin|finish)_(?:submission_)?odds_collection|gtl_(?:claim|complete|dispatch)_odds_refresh/;
  const ALLOWED = [
    'cloud/odds-collection.mjs', 'cloud/odds-provider.mjs', 'cloud/odds-refresh.mjs', 'cloud/submission-collection.mjs',
    // Anonymous boundary probes with inert bodies: they must be denied.
    'scripts/boundary/guess.mjs', 'scripts/boundary/lines.mjs',
    // The two Edge functions that hand the adapter its key.
    'supabase/functions/gtl-api/index.ts', 'supabase/functions/gtl-odds-refresh/index.ts',
  ];
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!['node_modules', 'dist', '.temp'].includes(entry.name)) walk(file); continue; }
      if (/\.(?:mjs|cjs|js|jsx|ts|tsx|py)$/.test(entry.name) && PATTERN.test(fs.readFileSync(file, 'utf8'))) found.push(file.split(path.sep).join('/'));
    }
  };
  for (const dir of ['cloud', 'server', 'shared', 'web', 'src', 'scripts', 'supabase/functions', 'dashboard', 'model']) if (fs.existsSync(dir)) walk(dir);
  assert.deepEqual(found.sort(), [...ALLOWED].sort());
  // In SQL only the collection RPCs themselves and the scheduled refresh chain start or finish a collection: no other
  // function calls them.
  const { latest } = catalog(readMigrations());
  const callers = [...latest.values()].filter(fn => /gtl_(?:begin|finish)_(?:submission_)?odds_collection\s*\(/.test(fn.body)).map(fn => fn.name);
  assert.deepEqual(callers, []);
  // Only the adapter names the provider host.
  assert.deepEqual(found.filter(file => /api\.the-odds-api\.com/.test(fs.readFileSync(file, 'utf8'))), ['cloud/odds-provider.mjs']);
});

test('M-05 is idempotent, adds one function, and every function it writes is service-only and security invoker', { skip }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(PRELUDE);
  for (const file of ALL) await db.exec(migrationSql(file));
  const signatures = ['gtl_odds_carryover_slate(timestamptz)', 'gtl_begin_odds_collection(uuid,uuid,text)', 'gtl_finish_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text)', 'gtl_begin_submission_odds_collection(uuid,uuid,jsonb,text)'];
  const definitions = async () => Promise.all(signatures.map(async s => (await db.query('select pg_get_functiondef($1::regprocedure) d', [`public.${s}`])).rows[0].d));
  const before = await definitions();
  await db.exec(migrationSql(M05));
  assert.deepEqual(await definitions(), before);
  for (const s of signatures) {
    for (const role of ['anon', 'authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${s}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${s}`);
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${s}`, 'EXECUTE'])).rows[0].ok, true, s);
    assert.equal((await db.query('select prosecdef from pg_proc where oid=$1::regprocedure', [`public.${s}`])).rows[0].prosecdef, false, s);
  }
  // Additive only (D-23): no table, column, trigger or policy is created, altered or dropped.
  const sql = fs.readFileSync(path.join('supabase/migrations', M05), 'utf8').replace(/\$\$[\s\S]*?\$\$/g, '').replace(/--.*$/gm, '');
  assert.doesNotMatch(sql, /\b(?:drop|alter|truncate|delete|update|insert|create\s+(?:table|index|trigger|policy))\b/i);
  const own = catalog(readMigrations(ALL)).files.find(entry => entry.file === M05).functions;
  assert.deepEqual(own.map(fn => [fn.name, Boolean(fn.previous)]).sort(), [['gtl_begin_odds_collection', true], ['gtl_begin_submission_odds_collection', true], ['gtl_finish_odds_collection', true], ['gtl_odds_carryover_slate', false]]);
});
