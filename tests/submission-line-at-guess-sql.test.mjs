import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { OddsProviderError } from '../cloud/odds-provider.mjs';
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';

// October 12, 2026 rulings (D-27): a player can submit or edit any time before the deadline; each changed guess is
// scored against the newest stored line at its save, whatever its age, or, when no line is stored yet, the first
// line collected after it, whenever its books last updated. Every repository migration runs in order (the two
// hosted-extension files excepted) and requests go through the real gtl-api handler and Supabase adapter, whose REST
// calls are answered by this in-process PGlite database. The odds provider is a stub: nothing here contacts a hosted project or a
// provider, and every quote is synthetic.
const NEW = '20261012230000_gtl_submit_with_line_at_guess.sql';
const FILES = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && !/scheduler_extension/.test(f)).sort();
const BEFORE = FILES.filter(f => f < NEW), AFTER = FILES.filter(f => f > NEW);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = n => new Date(n).toISOString();
const MINUTE = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const SEAN = 1, STEVEN = 2, TROY = 3, LUKE = 4, BEN = 5;
const NAMES = { [SEAN]: 'Fistathon', [STEVEN]: 'Sthomas', [TROY]: 'Troy', [LUKE]: 'Luke', [BEN]: 'Ben' };
const SOURCE = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';
const PENDING_REASON = 'No line was stored yet when this guess was saved. The first line collected after it becomes its reference.';
const TEAMS = { SEA: 'Seattle Seahawks', DEN: 'Denver Broncos', ARI: 'Arizona Cardinals', LAR: 'Los Angeles Rams', BUF: 'Buffalo Bills', MIA: 'Miami Dolphins', NE: 'New England Patriots', NYJ: 'New York Jets', BAL: 'Baltimore Ravens', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', PIT: 'Pittsburgh Steelers', HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', TEN: 'Tennessee Titans', KC: 'Kansas City Chiefs', LV: 'Las Vegas Raiders', LAC: 'Los Angeles Chargers', DAL: 'Dallas Cowboys', NYG: 'New York Giants', PHI: 'Philadelphia Eagles', WAS: 'Washington Commanders', CHI: 'Chicago Bears', DET: 'Detroit Lions', GB: 'Green Bay Packers', MIN: 'Minnesota Vikings', ATL: 'Atlanta Falcons' };

// D-24 opens a week at Monday 00:00 PT of its deadline's week, so the test deadline stays inside the current Pacific
// week whatever day the suite runs (two hours of margin for a DST change, at least five minutes late on a Sunday).
function pacificWeekLeft(now) {
  const part = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(now).map(p => [p.type, p.value]));
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(part.weekday);
  return 7 * DAY - (((day * 24 + Number(part.hour)) * 60 + Number(part.minute)) * 60 + Number(part.second)) * 1000;
}
function slate(now = Date.now(), first = now + Math.max(5 * MINUTE, Math.min(3 * DAY, pacificWeekLeft(now) - 2 * HOUR))) {
  const codes = Object.keys(TEAMS), games = [];
  for (let i = 0; i < 14; i++) {
    const away = codes[2 * i], home = codes[2 * i + 1];
    games.push({ id: `${away}-${home}`, away: TEAMS[away], home: TEAMS[home], awayCode: away, homeCode: home, matchup: `${TEAMS[away]} @ ${TEAMS[home]}`, kickoff: iso(i === 0 ? first : first + DAY + i * HOUR) });
  }
  return { games, deadline: iso(first) };
}
// One three-book collection. lag is how long before the collection every book last updated (D-17 allows five minutes);
// observed sets one book's last update to an exact instant instead.
function payload(games, { captured = Date.now(), lag = 30_000, spread = -3.5, total = 45, markets = ['spread', 'total'], observed = {} } = {}) {
  return { provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt: iso(captured), quota: { remaining: 478, used: 22, last: 2 },
    games: games.map((g, i) => ({ gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `event${i}`, matchStatus: 'matched',
      markets: Object.fromEntries(['spread', 'total'].map(m => [m, { quotes: !markets.includes(m) ? [] : ['draftkings', 'fanduel', 'betmgm'].map(book => {
        const line = m === 'spread' ? spread : total;
        return { provider: 'the-odds-api', providerEventId: `event${i}`, market: m, book, value: line, collectedAt: iso(captured), providerObservedAt: iso(observed[book] ?? captured - lag), timeBasis: 'provider_market_last_update',
          outcomes: m === 'spread' ? { home: { line, odds: -110 }, away: { line: -line, odds: -110 } } : { over: { line, odds: -110 }, under: { line, odds: -110 } } };
      }) }])) })) };
}
// The provider's answer right after the Monday open: every event is listed, no book has posted a line yet.
const noLines = games => ({ provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt: iso(Date.now()), quota: { remaining: 478, used: 22, last: 2 },
  games: games.map(g => ({ gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, matchStatus: 'event_missing', markets: { spread: { quotes: [] }, total: { quotes: [] } } })) });

async function fixture(t, { legacy } = {}) {
  const db = new PGlite(); t.after(() => db.close());
  const users = [SEAN, STEVEN, TROY, LUKE, BEN];
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;');
  for (const file of BEFORE) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file === BEFORE[0]) {
      await db.query("insert into public.gtl_leagues(id,state) values('sean-troy-luke',$1)", [seed()]);
      for (const n of users) await db.query('insert into auth.users values($1)', [id(n)]);
      await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner')", [id(SEAN)]);
    }
    if (file === BEFORE[1]) for (const n of users) await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [id(n), NAMES[n]]);
  }
  await db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';");
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const rpc = async (name, args) => (await as('service_role', `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value;
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  await db.query("insert into public.gtl_odds_schedule(id,enabled,endpoint,authorized_by,season,week,slate_signature) select 'nfl-12h',true,'https://example.supabase.co/functions/v1/gtl-odds-refresh',$1,season,week,signature from public.gtl_weekly_slates where week=5", [id(SEAN)]);
  await db.exec("update public.gtl_odds_budget set conservative_remaining=480,observed_remaining=480,last_successful_preflight_at=now()-interval '1 hour',last_collection_at=now()-interval '20 minutes'");
  const week6 = slate();
  await rpc('gtl_publish_week', [id(SEAN), 2026, 6, JSON.stringify(week6.games), week6.deadline, SOURCE]);
  const signature = (await q('select signature from public.gtl_weekly_slates where week=6'))[0].signature;
  let serial = 800;
  // A stored collection, inserted the way both finish RPCs store one (created_at is when it was stored).
  const snapshot = async (data, { week = 6, sig = signature, createdAt = data.fetchedAt } = {}) => {
    const key = id(++serial);
    await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,$4,$4::timestamptz+interval '90 seconds',2,2026,$5,$6)", [key, id(SEAN), id(serial + 1000), data.fetchedAt, week, sig]);
    await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,2026,$2,$3,$4,$5)', [key, week, sig, data, createdAt]);
    return key;
  };
  if (legacy) await legacy({ db, q, rpc, week6, signature, snapshot });
  await db.exec(fs.readFileSync(`supabase/migrations/${NEW}`, 'utf8'));
  for (const file of AFTER) await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));

  // The production wiring of supabase/functions/gtl-api/index.ts: createCloudHandler({ ...adapter, oddsProvider }).
  const log = [];
  const provider = { calls: 0, mode: 'lines', line: {}, async collect({ games }) {
    provider.calls++;
    if (provider.mode === 'fail') throw new OddsProviderError('ODDS_UNAVAILABLE');
    return provider.mode === 'none' ? noLines(games) : payload(games, provider.line);
  } };
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path === '/auth/v1/user') {
      const who = Number(/^Bearer token-(\d)$/.exec(options.headers?.Authorization || '')?.[1]);
      return users.includes(who) ? Response.json({ id: id(who), role: 'authenticated', email: `player${who}@example.invalid`, email_confirmed_at: '2026-10-01T00:00:00Z' }) : Response.json({}, { status: 401 });
    }
    const name = /^\/rest\/v1\/rpc\/(gtl_[a-z_]+)$/.exec(path)?.[1];
    if (!name) return Response.json({ message: 'unexpected request' }, { status: 404 });
    const args = JSON.parse(options.body), keys = Object.keys(args);
    try {
      const result = await as('service_role', `select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')}) value`,
        keys.map(key => args[key] !== null && typeof args[key] === 'object' ? JSON.stringify(args[key]) : args[key]));
      log.push({ name, args, outcome: 'ok', value: result.rows[0].value });
      return Response.json(result.rows[0].value);
    } catch (error) {
      log.push({ name, args, outcome: error.message });
      return Response.json({ message: error.message }, { status: 400 });
    }
  };
  const handle = createCloudHandler({ ...createSupabaseAdapter({ url: 'https://line-at-guess.example.invalid', anonKey: 'fixture-anon', serviceRoleKey: 'fixture-service', fetchImpl }), oddsProvider: provider });
  const call = async (who, route, body) => {
    const response = await handle(new Request(`https://line-at-guess.example.invalid/functions/v1/gtl-api${route}`, { method: 'POST',
      headers: { authorization: `Bearer token-${who}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  const read = async (who, week = 6) => (await call(who, '/personal/read', { season: 2026, week })).body;
  // The Community Picks and Solo submit: POST /personal/ballot with the client's own request ID and revisions.
  const submit = async (who, picks, { mode = 'guess_spread', week = 6, requestId = crypto.randomUUID(), extra = {} } = {}) => {
    const view = await read(who, week);
    const request = { season: 2026, week, mode, weeklyRevision: view.weeklyRevision, picks, submit: true, requestId, revision: view.revision, ...extra };
    return { ...await call(who, '/personal/ballot', request), request };
  };
  const ballot = async (who, mode = 'guess_spread', week = 6) => (await q('select ballot,audit from public.gtl_weekly_ballots where user_id=$1 and season=2026 and week=$2 and mode=$3', [id(who), week, mode]))[0];
  const revision = async (who, week = 6) => (await q('select revision from public.gtl_weekly_versions where user_id=$1 and season=2026 and week=$2', [id(who), week]))[0]?.revision;
  const count = async table => (await q(`select count(*)::int n from public.${table}`))[0].n;
  const budget = async () => (await q('select * from public.gtl_odds_budget'))[0];
  const outcomes = name => log.filter(entry => entry.name === name).map(entry => entry.outcome);
  const standing = async (who, mode = 'guess_spread') => (await rpc('gtl_read_community', [id(who), null, 30, null])).standings.find(s => s.userId === id(who) && s.mode === mode);
  const picks = (value = -3, games = week6.games) => Object.fromEntries(games.map(g => [g.id, value]));
  // A collection attempt that failed `ago` ms ago: it stored no line but holds the shared collect cooldown.
  const failedAttempt = async ago => {
    const key = id(++serial);
    await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,finished_at,reserved_credits,season,week,slate_signature,error_code) values($1,$2,'collect','failed',$3,clock_timestamp()-$4::interval,clock_timestamp()-$4::interval+interval '90 seconds',clock_timestamp()-$4::interval,2,2026,6,$5,'ODDS_UNAVAILABLE')", [key, id(SEAN), id(serial + 1000), `${ago} milliseconds`, signature]);
    await db.query("update public.gtl_odds_budget set last_collection_at=clock_timestamp()-$1::interval", [`${ago} milliseconds`]);
  };
  // Simulated time on the shared cooldown clock only (no sleep, no provider call, no quota change).
  const cooldownPassed = () => db.exec("update public.gtl_odds_budget set last_collection_at=clock_timestamp()-interval '6 minutes'");
  // Sean's manual collection through the real begin and finish RPCs.
  const collect = async (request, line) => {
    const job = await rpc('gtl_begin_odds_collection', [id(SEAN), request, 'collect']);
    return rpc('gtl_finish_odds_collection', [id(SEAN), request, job.lease, payload(job.games, typeof line === 'function' ? line() : line), { remaining: 470, used: 30, last: 2 }, null]);
  };
  return { db, q, rpc, as, week6, signature, snapshot, provider, log, call, read, submit, ballot, revision, count, budget, outcomes, standing, picks, failedAttempt, cooldownPassed, collect };
}

// Lines collected after `savedAt` (the instant of a pending save) whose every book observation is at or after it.
const afterSave = (savedAt, extra = {}) => () => { const captured = Math.max(Date.now(), Date.parse(savedAt) + 2); return { captured, lag: Math.min(15_000, captured - Date.parse(savedAt) - 1), ...extra }; };
const ageOf = ref => Math.floor((Date.parse(ref.savedAt) - Date.parse(ref.observedAt)) / 1000);
const pendingRef = savedAt => ({ status: 'pending', basis: 'first_line_after_submission', value: null, savedAt, source: null, sourceUrl: null, snapshotId: null,
  capturedAt: null, observedAt: null, ageSeconds: null, officialVerified: false, reason: PENDING_REASON });

test('1. Steven: an 8-minute-old line with the refresh cooldown active saves, scored against that line with its observedAt and age', { skip }, async t => {
  const f = await fixture(t);
  const captured = Date.now() - 8 * MINUTE, lag = 30_000;
  const line = await f.snapshot(payload(f.week6.games, { captured, lag }));
  // A later refresh two minutes ago failed and stored nothing: the cooldown is active and the newest stored line is the
  // 8-minute-old one. Before this change the same state answered GTL_SUBMISSION_REFRESH_COOLDOWN (HTTP 429).
  await f.failedAttempt(2 * MINUTE);
  const budget = await f.budget(), collections = await f.count('gtl_odds_collections');
  const res = await f.submit(STEVEN, f.picks(-3));
  assert.equal(res.status, 200, JSON.stringify(res.body)); assert.equal(res.body.saved, true);
  // The refresh was still tried, once, and the cooldown refused it before any provider request or reservation.
  assert.deepEqual(f.outcomes('gtl_preflight_submission'), ['ok']);
  assert.deepEqual(f.outcomes('gtl_begin_submission_odds_collection'), ['GTL_ODDS_COOLDOWN']);
  assert.equal(f.provider.calls, 0); assert.deepEqual(await f.budget(), budget); assert.equal(await f.count('gtl_odds_collections'), collections);
  const { ballot, audit } = await f.ballot(STEVEN);
  assert.equal(audit.length, 1); assert.equal(audit[0].type, 'ballot_submitted'); assert.equal(ballot.submittedAt, ballot.updatedAt);
  for (const game of f.week6.games) {
    const ref = ballot.scoringReferences[game.id];
    assert.equal(ref.status, 'available'); assert.equal(ref.basis, 'line_at_guess'); assert.equal(ref.value, -3.5); assert.equal(ref.snapshotId, line);
    assert.equal(Date.parse(ref.capturedAt), captured); assert.equal(Date.parse(ref.observedAt), captured - lag); assert.equal(ref.savedAt, ballot.updatedAt);
    assert.equal(ref.ageSeconds, ageOf(ref)); assert.ok(ref.ageSeconds >= 8 * 60 + 30 && ref.ageSeconds < 8 * 60 + 90, String(ref.ageSeconds));
    assert.equal(ref.reason, null); assert.equal(ref.quotes.length, 3);
  }
  // The account read the Community and Solo screens use returns exactly that saved line.
  assert.deepEqual((await f.read(STEVEN)).ballots.guess_spread.scoringReferences, ballot.scoringReferences);
  // Scored against it on the community leaderboard: |-3 - -3.5| = 0.5, 9 points for each of the 14 games.
  const row = await f.standing(STEVEN);
  assert.equal(Number(row.weekPoints), 14 * 9); assert.equal(Number(row.weekScored), 14);
});

test('2. daily cap, provider failure, budget guard, busy lease and cooldown: every submit and edit saves with the newest stored line', { skip }, async t => {
  const f = await fixture(t);
  await f.snapshot(payload(f.week6.games, { captured: Date.now() - 20 * MINUTE, spread: -3, total: 44 }));
  const newest = await f.snapshot(payload(f.week6.games, { captured: Date.now() - 12 * MINUTE, spread: -4.5, total: 47 }));
  const checkNewest = async (who, mode) => {
    const { ballot } = await f.ballot(who, mode);
    for (const game of f.week6.games) {
      const ref = ballot.scoringReferences[game.id];
      assert.equal(ref.status, 'available'); assert.equal(ref.basis, 'line_at_guess'); assert.equal(ref.snapshotId, newest);
      assert.equal(ref.value, mode === 'guess_total' ? 47 : -4.5); assert.equal(ref.ageSeconds, ageOf(ref)); assert.ok(ref.ageSeconds >= 12 * 60, String(ref.ageSeconds));
    }
    return ballot;
  };
  // Provider failure: the refresh reserves two credits, the provider fails, the lease is released, nothing is stored.
  f.provider.mode = 'fail';
  let res = await f.submit(TROY, f.picks(45), { mode: 'guess_total' });
  assert.equal(res.status, 200, JSON.stringify(res.body)); assert.equal(f.provider.calls, 1);
  const failed = f.log.find(entry => entry.name === 'gtl_finish_submission_odds_collection');
  assert.equal(failed.value.status, 'failed'); assert.equal(failed.value.errorCode, 'ODDS_UNAVAILABLE'); assert.equal(failed.value.snapshotId, null);
  assert.equal((await f.budget()).lease_token, null); assert.equal((await f.budget()).conservative_remaining, 478);
  await checkNewest(TROY, 'guess_total');
  // Daily cap: six more collections started today (UTC), the last one long enough ago to clear the cooldown.
  for (let n = 0; n < 6; n++) await f.failedAttempt(0);
  await f.cooldownPassed();
  res = await f.submit(STEVEN, f.picks(-3));
  assert.equal(res.status, 200, JSON.stringify(res.body)); assert.equal(f.outcomes('gtl_begin_submission_odds_collection').at(-1), 'GTL_ODDS_DAILY_LIMIT');
  const steven = await checkNewest(STEVEN, 'guess_spread');
  // Budget guard (paused), then a busy lease held by another collection.
  await f.db.exec('update public.gtl_odds_budget set paused=true');
  res = await f.submit(LUKE, f.picks(-5));
  assert.equal(res.status, 200, JSON.stringify(res.body)); assert.equal(f.outcomes('gtl_begin_submission_odds_collection').at(-1), 'GTL_ODDS_BUDGET');
  await checkNewest(LUKE, 'guess_spread');
  await f.db.exec("update public.gtl_odds_budget set paused=false,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'");
  res = await f.submit(BEN, f.picks(44.5), { mode: 'guess_total' });
  assert.equal(res.status, 200, JSON.stringify(res.body)); assert.equal(f.outcomes('gtl_begin_submission_odds_collection').at(-1), 'GTL_ODDS_BUSY');
  await checkNewest(BEN, 'guess_total');
  assert.equal(f.provider.calls, 1, 'only the provider-failure refresh reached the provider');
  // An edit under the cooldown: a newer stored line exists; only the changed guess takes it, with its own age.
  await f.db.exec('update public.gtl_odds_budget set lease_token=null,lease_until=null');
  const later = await f.snapshot(payload(f.week6.games, { captured: Date.now() - 7 * MINUTE, spread: -5 }));
  await f.failedAttempt(MINUTE);
  const changed = f.week6.games[3].id;
  res = await f.submit(STEVEN, { ...f.picks(-3), [changed]: -5 });
  assert.equal(res.status, 200, JSON.stringify(res.body)); assert.equal(f.outcomes('gtl_begin_submission_odds_collection').at(-1), 'GTL_ODDS_COOLDOWN');
  const edited = await f.ballot(STEVEN);
  assert.equal(edited.audit.at(-1).type, 'ballot_edited'); assert.deepEqual(edited.audit.at(-1).changedGameIds, [changed]);
  const ref = edited.ballot.scoringReferences[changed];
  assert.equal(ref.snapshotId, later); assert.equal(ref.value, -5); assert.equal(ref.savedAt, edited.ballot.updatedAt); assert.ok(ref.ageSeconds >= 7 * 60, String(ref.ageSeconds));
  for (const game of f.week6.games.filter(g => g.id !== changed)) assert.deepEqual(edited.ballot.scoringReferences[game.id], steven.scoringReferences[game.id]);
  assert.equal(edited.ballot.submittedAt, steven.submittedAt);
});

test('3. no line stored yet: the submit saves pending, and the first line collected after the save becomes its reference, also when a book last updated before the save', { skip }, async t => {
  const f = await fixture(t);
  // The Monday open: the refresh runs and succeeds, but no sportsbook has posted a Week 6 line, so nothing is stored.
  f.provider.mode = 'none';
  const res = await f.submit(STEVEN, f.picks(-3));
  assert.equal(res.status, 200, JSON.stringify(res.body)); assert.equal(f.provider.calls, 1);
  assert.equal(f.log.find(entry => entry.name === 'gtl_finish_submission_odds_collection').value.status, 'succeeded');
  assert.equal(await f.count('gtl_market_snapshots'), 0);
  const saved = await f.ballot(STEVEN), savedAt = saved.ballot.updatedAt, rev = await f.revision(STEVEN);
  for (const game of f.week6.games) assert.deepEqual(saved.ballot.scoringReferences[game.id], pendingRef(savedAt));
  assert.equal(Number((await f.standing(STEVEN)).weekScored), 0);
  // A collection fetched before the save but stored after it (commit order) was not collected after the save: never used.
  await f.snapshot(payload(f.week6.games, { captured: Date.parse(savedAt) - 10_000, lag: 30_000, spread: -9 }), { createdAt: iso(Date.now() + 5) });
  assert.equal(await f.rpc('gtl_resolve_pending_references', [2026, 6]), 0);
  assert.deepEqual(await f.ballot(STEVEN), saved);
  // The next real collection (Sean's manual collection; six minutes later on the shared cooldown clock) is collected after
  // the save; BetMGM's market last updated 30 seconds before the save, valid under D-17 (within five minutes of the
  // collection). It is the first line after submission: observation times are not compared with the save.
  await f.cooldownPassed();
  const early = Date.parse(savedAt) - 30_000;
  const done = await f.collect(id(700), () => ({ ...afterSave(savedAt)(), spread: -4, observed: { betmgm: early } }));
  assert.equal(done.status, 'succeeded');
  const after = await f.ballot(STEVEN);
  for (const game of f.week6.games) {
    const ref = after.ballot.scoringReferences[game.id];
    assert.equal(ref.status, 'available'); assert.equal(ref.basis, 'first_line_after_submission'); assert.equal(ref.value, -4); assert.equal(ref.snapshotId, id(700));
    assert.equal(ref.savedAt, savedAt); assert.ok(Date.parse(ref.capturedAt) > Date.parse(savedAt));
    assert.equal(Date.parse(ref.observedAt), early); assert.equal(Date.parse(ref.quotes.find(q => q.book === 'betmgm').observedAt), early);
    assert.equal(ref.ageSeconds, 30); assert.equal(ref.reason, null);
  }
  // Only the references changed: picks, submittedAt, updatedAt and the weekly revision stay; one audit event is added.
  assert.deepEqual(after.ballot.picks, saved.ballot.picks); assert.equal(after.ballot.submittedAt, saved.ballot.submittedAt); assert.equal(after.ballot.updatedAt, savedAt);
  assert.equal(await f.revision(STEVEN), rev);
  assert.equal(after.audit.length, saved.audit.length + 1); assert.equal(after.audit.at(-1).type, 'reference_resolved'); assert.equal(after.audit.at(-1).changedGameIds.length, 14);
  assert.deepEqual((await f.read(STEVEN)).ballots.guess_spread.scoringReferences, after.ballot.scoringReferences);
  // Scored against the first line after submission: |-3 - -4| = 1, 8 points for each game.
  assert.equal(Number((await f.standing(STEVEN)).weekPoints), 14 * 8);
  // Resolved once: a second run and a later collection change nothing.
  assert.equal(await f.rpc('gtl_resolve_pending_references', [2026, 6]), 0);
  await f.cooldownPassed();
  assert.equal((await f.collect(id(701), { spread: -6, lag: 0 })).status, 'succeeded');
  assert.deepEqual(await f.ballot(STEVEN), after);
});

test('4. a client-supplied reference or line value never reaches the saved reference; the server selects the stored line', { skip }, async t => {
  const f = await fixture(t);
  const line = await f.snapshot(payload(f.week6.games, { captured: Date.now() - 9 * MINUTE, spread: -3.5 }));
  f.provider.mode = 'fail';
  const now = iso(Date.now());
  const forged = { status: 'available', basis: 'line_at_guess', value: -3, source: 'The Odds API · 3-book median', sourceUrl: 'https://the-odds-api.com/', snapshotId: line, capturedAt: now, observedAt: now, savedAt: now, ageSeconds: 0 };
  // The API accepts no reference-shaped field and no non-number pick; nothing is stored or audited.
  for (const extra of [{ scoringReferences: { 'SEA-DEN': forged } }, { scoringReference: forged }, { referenceValue: -3 }, { line: -3 }, { observedAt: now }]) {
    assert.equal((await f.submit(STEVEN, f.picks(-3), { extra })).status, 400, JSON.stringify(extra));
  }
  assert.equal((await f.submit(STEVEN, { ...f.picks(-3), 'SEA-DEN': { value: -3, scoringReference: forged } })).status, 400);
  assert.equal(await f.ballot(STEVEN), undefined);
  assert.equal((await f.q('select count(*)::int n from public.gtl_personal_events where user_id=$1', [id(STEVEN)]))[0].n, 0);
  assert.equal(f.outcomes('gtl_mutate_personal').length, 0);
  // Below the API the save and preflight RPCs refuse a reference field too.
  const view = await f.read(STEVEN);
  const body = { season: 2026, week: 6, mode: 'guess_spread', weeklyRevision: view.weeklyRevision, picks: f.picks(-3), submit: true, requestId: crypto.randomUUID(), revision: view.revision };
  await assert.rejects(() => f.rpc('gtl_mutate_personal', [id(STEVEN), 'personal/ballot', { ...body, scoringReferences: { 'SEA-DEN': forged } }]), /GTL_PERSONAL_INVALID/);
  await assert.rejects(() => f.rpc('gtl_preflight_submission', [id(STEVEN), { season: 2026, week: 6, mode: 'guess_spread', revision: view.weeklyRevision, picks: f.picks(-3), submit: true, personalRevision: view.revision, requestId: crypto.randomUUID(), scoringReferences: {} }]), /GTL_PERSONAL_INVALID/);
  // A direct row write with a chosen value, an unknown snapshot, a forged pending reference or a claimed first line
  // after submission is refused by the trigger, which recomputes every changed reference from stored snapshots.
  const stamp = (await f.q('select clock_timestamp() t'))[0].t.toISOString();
  const template = (await f.q("select games from public.gtl_schedule_templates where season=2026 and week=6"))[0].games;
  const server = {};
  for (const game of template) server[game.id] = await f.rpc('gtl_reference_at_save', [2026, 6, f.signature, game, 'spread', stamp]);
  assert.ok(Object.values(server).every(ref => ref.snapshotId === line && ref.value === -3.5));
  const write = refs => f.as('service_role', "insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,audit,origin_practice,provenance) values($1,2026,6,'guess_spread',$2,'[]',false,'[]')",
    [id(STEVEN), { picks: f.picks(-3), submittedAt: stamp, updatedAt: stamp, scoringPolicy: 'submission-time', scoringReferences: refs }]);
  const g = 'SEA-DEN';
  for (const tampered of [{ ...server[g], value: -3 }, { ...server[g], snapshotId: id(999) }, { ...pendingRef(stamp), value: -3 }, { ...pendingRef(stamp), savedAt: iso(Date.parse(stamp) - 1000) },
    { ...server[g], basis: 'first_line_after_submission' }, { ...server[g], ageSeconds: 0 }]) {
    await assert.rejects(() => write({ ...server, [g]: tampered }), /GTL_SUBMISSION_ODDS_REQUIRED/);
  }
  assert.equal(await f.ballot(STEVEN), undefined);
  // The real submit stores the server's stored line (-3.5), not the value the client claimed (-3).
  const res = await f.submit(STEVEN, f.picks(-3));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { ballot } = await f.ballot(STEVEN);
  for (const game of f.week6.games) { assert.equal(ballot.scoringReferences[game.id].value, -3.5); assert.equal(ballot.scoringReferences[game.id].snapshotId, line); }
});

test('5. a line collected at or after a game\'s kickoff is never used for that game, at save or at resolution', { skip }, async t => {
  const f = await fixture(t);
  const g6 = f.week6.games[0], kickoff6 = Date.parse(g6.kickoff);
  const at = captured => f.rpc('gtl_line_from_snapshot', [payload([g6], { captured, lag: 1000 }), g6, 'spread']);
  assert.equal((await at(kickoff6 - 1000)).value, -3.5);
  assert.equal(await at(kickoff6), null); assert.equal(await at(kickoff6 + MINUTE), null);
  assert.equal(await f.rpc('gtl_submission_reference', [payload([g6], { captured: kickoff6 - 2000 }), g6, 'spread', iso(kickoff6)]), null);
  assert.equal(await f.rpc('gtl_reference_at_save', [2026, 6, f.signature, g6, 'spread', iso(kickoff6)]), null);
  // A real week whose first game (kickoff = deadline) starts three seconds from now; the others a day later.
  const now = Date.now(), week7 = slate(now, now + 3000), first = week7.games[0];
  await f.rpc('gtl_publish_week', [id(SEAN), 2026, 7, JSON.stringify(week7.games), week7.deadline, SOURCE]);
  const sig7 = (await f.q('select signature from public.gtl_weekly_slates where week=7'))[0].signature;
  f.provider.mode = 'none';
  const res = await f.submit(STEVEN, f.picks(-3, week7.games), { week: 7 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = await f.ballot(STEVEN, 'guess_spread', 7);
  assert.ok(Object.values(saved.ballot.scoringReferences).every(ref => ref.status === 'pending'));
  assert.ok(Date.now() < Date.parse(first.kickoff), 'the save ran before the first kickoff');
  while (Date.now() <= Date.parse(first.kickoff) + 100) await new Promise(resolve => setTimeout(resolve, 50));
  // After the first kickoff (the deadline) the ballot is closed: an edit is refused as before and nothing changes.
  const edit = await f.submit(STEVEN, { ...f.picks(-3, week7.games), [first.id]: -4 }, { week: 7 });
  assert.equal(edit.status, 400, JSON.stringify(edit.body)); assert.match(edit.body.error, /deadline has passed/);
  assert.deepEqual(await f.ballot(STEVEN, 'guess_spread', 7), saved);
  // A stored line collected after the first kickoff (as a defective collector could store it; the finish RPCs refuse
  // matched quotes at or after kickoff) resolves every game except the one that already started.
  const late = Date.now();
  const key = await f.snapshot(payload(week7.games, { captured: late, lag: 0, spread: -6 }), { week: 7, sig: sig7, createdAt: iso(late) });
  assert.equal(await f.rpc('gtl_resolve_pending_references', [2026, 7]), 13);
  const refs = (await f.ballot(STEVEN, 'guess_spread', 7)).ballot.scoringReferences;
  assert.deepEqual(refs[first.id], saved.ballot.scoringReferences[first.id]);
  for (const game of week7.games.slice(1)) {
    assert.equal(refs[game.id].basis, 'first_line_after_submission'); assert.equal(refs[game.id].snapshotId, key);
    assert.ok(Date.parse(refs[game.id].capturedAt) < Date.parse(game.kickoff));
  }
  // Writing that post-kickoff line into the first game's reference is refused.
  await assert.rejects(() => f.db.query("update public.gtl_weekly_ballots set ballot=jsonb_set(ballot,array['scoringReferences',$2],$3) where user_id=$1 and week=7",
    [id(STEVEN), first.id, { ...refs[week7.games[1].id] }]), /GTL_SUBMISSION_ODDS_REQUIRED/);
  assert.equal(await f.rpc('gtl_resolve_pending_references', [2026, 7]), 0);
});

test('6. replays stay idempotent: a retried submit returns its receipt and never re-anchors, reverts or spends again', { skip }, async t => {
  const f = await fixture(t);
  // Spread lines only: spread guesses take the 9-minute-old line, total guesses save pending.
  const line = await f.snapshot(payload(f.week6.games, { captured: Date.now() - 9 * MINUTE, markets: ['spread'] }));
  f.provider.mode = 'fail';
  const first = await f.submit(STEVEN, f.picks(-3));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const stored = await f.ballot(STEVEN), rev = await f.revision(STEVEN), begins = f.outcomes('gtl_begin_submission_odds_collection').length;
  const events = async who => (await f.q('select count(*)::int n from public.gtl_personal_events where user_id=$1', [id(who)]))[0].n;
  const stevenEvents = await events(STEVEN);
  assert.ok(Object.values(stored.ballot.scoringReferences).every(ref => ref.snapshotId === line));
  // A newer line arrives, then the same request is retried (a dropped response): the receipt answers, nothing moves.
  await f.snapshot(payload(f.week6.games, { captured: Date.now() - 6 * MINUTE, spread: -7, markets: ['spread'] }));
  const again = await f.call(STEVEN, '/personal/ballot', first.request);
  assert.equal(again.status, 200); assert.deepEqual(again.body, first.body);
  assert.deepEqual(await f.ballot(STEVEN), stored); assert.equal(await f.revision(STEVEN), rev); assert.equal(await events(STEVEN), stevenEvents);
  assert.equal(f.outcomes('gtl_begin_submission_odds_collection').length, begins, 'a replay never asks for a refresh');
  // The same request ID with different picks is a conflict, not a second save.
  const conflict = await f.call(STEVEN, '/personal/ballot', { ...first.request, picks: f.picks(-4) });
  assert.equal(conflict.status, 409); assert.deepEqual(await f.ballot(STEVEN), stored);
  // A pending total, resolved by a later collection: replaying its submission never writes pending back.
  const total = await f.submit(TROY, f.picks(45), { mode: 'guess_total' });
  assert.equal(total.status, 200, JSON.stringify(total.body));
  const pending = await f.ballot(TROY, 'guess_total');
  assert.ok(Object.values(pending.ballot.scoringReferences).every(ref => ref.status === 'pending'));
  await f.cooldownPassed();
  const job = await f.rpc('gtl_begin_odds_collection', [id(SEAN), id(700), 'collect']);
  const data = payload(job.games, afterSave(pending.ballot.updatedAt, { total: 46 })());
  assert.equal((await f.rpc('gtl_finish_odds_collection', [id(SEAN), id(700), job.lease, data, { remaining: 470, used: 30, last: 2 }, null])).status, 'succeeded');
  const resolved = await f.ballot(TROY, 'guess_total');
  assert.ok(Object.values(resolved.ballot.scoringReferences).every(ref => ref.basis === 'first_line_after_submission' && ref.value === 46));
  const retried = await f.call(TROY, '/personal/ballot', total.request);
  assert.equal(retried.status, 200); assert.deepEqual(retried.body, total.body); assert.deepEqual(await f.ballot(TROY, 'guess_total'), resolved);
  // Replaying the resolver or the finished collection does nothing more.
  const snapshots = await f.count('gtl_market_snapshots');
  assert.equal(await f.rpc('gtl_resolve_pending_references', [2026, 6]), 0);
  assert.equal((await f.rpc('gtl_finish_odds_collection', [id(SEAN), id(700), job.lease, data, { remaining: 470, used: 30, last: 2 }, null])).status, 'succeeded');
  assert.equal(await f.count('gtl_market_snapshots'), snapshots); assert.deepEqual(await f.ballot(TROY, 'guess_total'), resolved);
  // Re-applying the migration changes no function and no row.
  const dump = async () => (await f.q('select user_id,mode,ballot::text b,audit::text a from public.gtl_weekly_ballots order by user_id,mode')).map(Object.values);
  const before = await dump();
  await f.db.exec(fs.readFileSync(`supabase/migrations/${NEW}`, 'utf8'));
  assert.deepEqual(await dump(), before);
});

test('7. rows stored before this migration stay byte for byte; legacy stale and unavailable references stay unscored', { skip }, async t => {
  // Every row the earlier writers stored, as text: ballots (with audit and provenance), revisions and personal events.
  const dump = async (q, except = null) => ({
    ballots: (await q('select user_id::text u,season,week,mode,ballot::text b,audit::text a,provenance::text p,origin_practice o from public.gtl_weekly_ballots where user_id is distinct from $1 order by user_id,season,week,mode', [except])).map(Object.values),
    versions: (await q('select user_id::text u,season,week,revision from public.gtl_weekly_versions where user_id is distinct from $1 order by user_id,season,week', [except])).map(Object.values),
    events: (await q('select user_id::text u,revision,action,target,after_value::text v from public.gtl_personal_events where user_id is distinct from $1 order by user_id,revision', [except])).map(Object.values),
  });
  const refText = async (q, who) => Object.fromEntries((await q("select key,value::text v from public.gtl_weekly_ballots b,jsonb_each(b.ballot->'scoringReferences') where user_id=$1 and week=6 and mode='guess_spread'", [id(who)])).map(r => [r.key, r.v]));
  let legacy, lukeRefs;
  const f = await fixture(t, { legacy: async ({ db, q, rpc, week6, snapshot }) => {
    const save = async (who, mode, value) => {
      const p = await rpc('gtl_read_personal', [id(who), 2026, 6, null, false]);
      return rpc('gtl_mutate_personal', [id(who), 'personal/ballot', { season: 2026, week: 6, mode, weeklyRevision: p.weeklyRevision, picks: Object.fromEntries(week6.games.map(g => [g.id, value])), submit: true, requestId: crypto.randomUUID(), revision: p.revision }]);
    };
    // Written by the October 8 writers before the fresh-submission trigger existed (20261008224444/225401 era): the same
    // writer stores a 9-minute-old spread line as 'stale' and a missing total line as 'unavailable', both value null.
    await snapshot(payload(week6.games, { captured: Date.now() - 9 * MINUTE, markets: ['spread'] }));
    await db.exec('alter table public.gtl_weekly_ballots disable trigger gtl_fresh_submission_guard');
    await save(LUKE, 'guess_spread', -3);
    await save(BEN, 'guess_total', 45);
    await db.exec('alter table public.gtl_weekly_ballots enable trigger gtl_fresh_submission_guard');
    // Written through the guarded October 8 path: a line one minute old saved as 'available' (no basis, no age).
    await snapshot(payload(week6.games, { captured: Date.now() - MINUTE, lag: 20_000, markets: ['spread'] }));
    await save(TROY, 'guess_spread', -3);
    legacy = await dump(q); lukeRefs = await refText(q, LUKE);
  } });
  // The migration itself wrote nothing.
  assert.deepEqual(await dump(f.q), legacy);
  const old = async (who, mode, week = 6) => (await f.ballot(who, mode, week)).ballot;
  assert.ok(Object.values((await old(LUKE, 'guess_spread')).scoringReferences).every(ref => ref.status === 'stale' && ref.value === null));
  assert.ok(Object.values((await old(BEN, 'guess_total')).scoringReferences).every(ref => ref.status === 'unavailable' && ref.value === null));
  assert.ok(Object.values((await old(TROY, 'guess_spread')).scoringReferences).every(ref => ref.status === 'available' && !('basis' in ref) && !('ageSeconds' in ref)));
  // Sean's imported Week 5 spread ballot (the canonical weekly row copied from the league) predates D-16: no references.
  assert.equal((await old(SEAN, 'guess_spread', 5)).scoringReferences, undefined);
  // New activity around them: a pending total for Steven, a collection that resolves it, the resolver for both weeks.
  f.provider.mode = 'none';
  const res = await f.submit(STEVEN, f.picks(45), { mode: 'guess_total' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  await f.cooldownPassed();
  assert.equal((await f.collect(id(700), afterSave((await old(STEVEN, 'guess_total')).updatedAt))).status, 'succeeded');
  assert.ok(Object.values((await old(STEVEN, 'guess_total')).scoringReferences).every(ref => ref.basis === 'first_line_after_submission'));
  assert.equal(await f.rpc('gtl_resolve_pending_references', [2026, 5]), 0);
  assert.equal(await f.rpc('gtl_resolve_pending_references', [2026, 6]), 0);
  assert.deepEqual(await dump(f.q, id(STEVEN)), legacy, 'no stored row of another player changed');
  // Scoring is unchanged for them: the old 'available' line scores, 'stale' and 'unavailable' stay unscored.
  const standings = (await f.rpc('gtl_read_community', [id(SEAN), null, 30, null])).standings;
  const row = (who, mode) => standings.find(s => s.userId === id(who) && s.mode === mode);
  assert.equal(Number(row(TROY, 'guess_spread').weekScored), 14); assert.equal(Number(row(TROY, 'guess_spread').weekPoints), 14 * 9);
  assert.equal(Number(row(LUKE, 'guess_spread').weekScored), 0); assert.equal(Number(row(BEN, 'guess_total').weekScored), 0);
  // An edit of the stale ballot re-anchors only the changed guess; the 13 unchanged references keep their bytes.
  f.provider.mode = 'fail';
  const changed = f.week6.games[0].id;
  const edit = await f.submit(LUKE, { ...f.picks(-3), [changed]: -4 });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  const after = await refText(f.q, LUKE);
  assert.equal(JSON.parse(after[changed]).basis, 'line_at_guess'); assert.equal(JSON.parse(after[changed]).status, 'available');
  for (const game of f.week6.games.slice(1)) assert.equal(after[game.id], lukeRefs[game.id]);
});

test('claim and status read share one resolver: a lagging schedule row reads slate_changed in both', { skip }, async t => {
  const f = await fixture(t);
  await f.db.exec("update public.gtl_odds_schedule set season=s.season,week=s.week,slate_signature=s.signature from public.gtl_weekly_slates s where s.week=5");
  const meta = await f.rpc('gtl_read_odds_schedule', [id(SEAN), 'sean-troy-luke']);
  assert.equal(meta.slateStatus, 'unavailable'); assert.equal(meta.pauseReason, 'slate_changed'); assert.equal(meta.operationalStatus, 'blocked');
  assert.equal(await f.rpc('gtl_odds_schedule_slate', [2026, 5, (await f.q('select signature from public.gtl_weekly_slates where week=5'))[0].signature]), null);
  await f.db.exec("update public.gtl_odds_schedule set season=s.season,week=s.week,slate_signature=s.signature from public.gtl_weekly_slates s where s.week=6");
  assert.equal((await f.rpc('gtl_read_odds_schedule', [id(SEAN), 'sean-troy-luke'])).operationalStatus, 'active');
  assert.equal((await f.rpc('gtl_odds_schedule_slate', [2026, 6, f.signature])).signature.week, 6);
});

test('migration is idempotent, service-only and security invoker', { skip }, async t => {
  const f = await fixture(t);
  const sigs = ['gtl_line_from_snapshot(jsonb,jsonb,text)', 'gtl_submission_reference(jsonb,jsonb,text,timestamptz)', 'gtl_pending_reference(timestamptz)', 'gtl_reference_at_save(integer,integer,jsonb,jsonb,text,timestamptz)',
    'gtl_resolve_pending_reference(integer,integer,text,text,jsonb)', 'gtl_resolve_pending_references(integer,integer)', 'gtl_preflight_submission(uuid,jsonb)', 'gtl_guard_fresh_submission()',
    'gtl_save_weekly_ballot(uuid,text,text,bigint,jsonb,boolean)', 'gtl_mutate_personal(uuid,text,jsonb)', 'gtl_finish_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text)',
    'gtl_finish_submission_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text)', 'gtl_odds_schedule_slate(integer,integer,jsonb)', 'gtl_claim_odds_refresh(text,uuid)', 'gtl_read_odds_schedule(uuid,text)'];
  const defs = async () => Promise.all(sigs.map(async s => (await f.q('select pg_get_functiondef($1::regprocedure) d', [`public.${s}`]))[0].d));
  const before = await defs();
  await f.db.exec(fs.readFileSync(`supabase/migrations/${NEW}`, 'utf8'));
  assert.deepEqual(await defs(), before);
  for (const s of sigs) {
    for (const role of ['anon', 'authenticated']) assert.equal((await f.q('select has_function_privilege($1,$2,$3) ok', [role, `public.${s}`, 'EXECUTE']))[0].ok, false, s);
    assert.equal((await f.q('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${s}`, 'EXECUTE']))[0].ok, true, s);
  }
  assert.equal((await f.q("select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname like 'gtl_%' and prosecdef"))[0].n, 0);
});

test('a member\'s submission collection resolves another member\'s pending guesses in the same transaction', { skip }, async t => {
  const f = await fixture(t);
  f.provider.mode = 'none';
  assert.equal((await f.submit(TROY, f.picks(-7))).status, 200);
  const troySaved = (await f.ballot(TROY)).ballot.updatedAt;
  assert.ok(Object.values((await f.ballot(TROY)).ballot.scoringReferences).every(ref => ref.status === 'pending'));
  // Steven's submit six minutes later on the cooldown clock: his refresh stores a line, and it resolves Troy's guesses.
  await f.cooldownPassed();
  f.provider.mode = 'lines'; f.provider.line = afterSave(troySaved)();
  const res = await f.submit(STEVEN, f.picks(-3));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const stored = f.log.filter(entry => entry.name === 'gtl_finish_submission_odds_collection').at(-1).value;
  assert.equal(stored.status, 'succeeded'); assert.ok(stored.snapshotId);
  assert.ok(Object.values((await f.ballot(TROY)).ballot.scoringReferences).every(ref => ref.status === 'available' && ref.basis === 'first_line_after_submission' && ref.snapshotId === stored.snapshotId));
  assert.ok(Object.values((await f.ballot(STEVEN)).ballot.scoringReferences).every(ref => ref.basis === 'line_at_guess' && ref.snapshotId === stored.snapshotId && ref.ageSeconds < 60));
});

test('Monday-open rush: the next member\'s submission collection resolves a pending guess even when one book last updated before that save', { skip }, async t => {
  const f = await fixture(t);
  // Steven submits right after the open: no book has a line yet, so his refresh stores nothing and his guesses save pending.
  f.provider.mode = 'none';
  assert.equal((await f.submit(STEVEN, f.picks(-3))).status, 200);
  const pending = await f.ballot(STEVEN), stevenSaved = pending.ballot.updatedAt;
  assert.ok(Object.values(pending.ballot.scoringReferences).every(ref => ref.status === 'pending'));
  // Troy submits on the next cooldown slot. His refresh stores a qualifying three-book line collected after Steven's save,
  // in which BetMGM's market last updated 30 seconds before Steven's save (valid under D-17).
  await f.cooldownPassed();
  const early = Date.parse(stevenSaved) - 30_000;
  f.provider.mode = 'lines'; f.provider.line = { ...afterSave(stevenSaved)(), spread: -4, observed: { betmgm: early } };
  const res = await f.submit(TROY, f.picks(-7));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const stored = f.log.filter(entry => entry.name === 'gtl_finish_submission_odds_collection').at(-1).value;
  assert.equal(stored.status, 'succeeded'); assert.ok(stored.snapshotId);
  // That line, in the same transaction, becomes Steven's reference: not a later collection hours away.
  const steven = await f.ballot(STEVEN);
  for (const ref of Object.values(steven.ballot.scoringReferences)) {
    assert.equal(ref.status, 'available'); assert.equal(ref.basis, 'first_line_after_submission'); assert.equal(ref.snapshotId, stored.snapshotId);
    assert.equal(ref.value, -4); assert.equal(ref.savedAt, stevenSaved); assert.ok(Date.parse(ref.capturedAt) > Date.parse(stevenSaved));
    assert.equal(Date.parse(ref.observedAt), early); assert.equal(ref.ageSeconds, 30);
  }
  assert.equal(steven.audit.at(-1).type, 'reference_resolved');
  assert.ok(Object.values((await f.ballot(TROY)).ballot.scoringReferences).every(ref => ref.basis === 'line_at_guess' && ref.snapshotId === stored.snapshotId));
  const row = await f.standing(STEVEN);
  assert.equal(Number(row.weekScored), 14); assert.equal(Number(row.weekPoints), 14 * 8);
  // The scheduled run later in the day changes nothing.
  await f.cooldownPassed();
  assert.equal((await f.collect(id(701), { spread: -6, lag: 0 })).status, 'succeeded');
  assert.deepEqual(await f.ballot(STEVEN), steven);
});
