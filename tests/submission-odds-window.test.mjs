import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { createScheduledRefreshAdapter, createScheduledRefreshHandler } from '../cloud/odds-refresh.mjs';
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = n => new Date(n).toISOString();
// Every repo migration in order, except the two that only install hosted extensions (pg_cron, pg_net) and cannot
// load in PGlite, then the October 12 window file as the newest. Nothing here contacts the hosted project.
const WINDOW = '20261012213000_gtl_submission_odds_window.sql';
const MIGRATIONS = [
  '20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql',
  '20261008185715_gtl_weekly_eligibility_rulings.sql', '20261008185738_gtl_manual_odds_collection.sql', '20261008192528_gtl_scoped_spread_benchmark.sql',
  '20261008200926_gtl_twelve_hour_odds_refresh.sql', '20261008224444_gtl_personal_workspace.sql', '20261008224735_gtl_reviewed_quote_selections.sql',
  '20261008225401_gtl_submission_time_scoring.sql', '20261008225607_gtl_reviewed_final_results.sql', '20261008232055_gtl_fresh_submission_odds.sql',
  '20261008240000_gtl_virtual_units.sql', '20261009005145_gtl_social_bet_tracker.sql', '20261009120000_gtl_community_feed.sql',
  '20261009130000_gtl_league_interest.sql', '20261009140000_gtl_d23_data_rule.sql', '20261009150000_gtl_auto_open_week.sql',
  '20261009160000_gtl_ruled_ballot_import.sql', '20261009170000_gtl_virtual_units_settlement.sql', '20261009190000_gtl_virtual_units_save_isfinite.sql',
  WINDOW,
];
const SEAN = 1, STEVEN = 2;
const TEAMS = { SEA: 'Seattle Seahawks', DEN: 'Denver Broncos', ARI: 'Arizona Cardinals', LAR: 'Los Angeles Rams', BUF: 'Buffalo Bills', MIA: 'Miami Dolphins', NE: 'New England Patriots', NYJ: 'New York Jets', BAL: 'Baltimore Ravens', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', PIT: 'Pittsburgh Steelers', HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', TEN: 'Tennessee Titans', KC: 'Kansas City Chiefs', LV: 'Las Vegas Raiders', LAC: 'Los Angeles Chargers', DAL: 'Dallas Cowboys', NYG: 'New York Giants', PHI: 'Philadelphia Eagles', WAS: 'Washington Commanders', CHI: 'Chicago Bears', DET: 'Detroit Lions', GB: 'Green Bay Packers', MIN: 'Minnesota Vikings', ATL: 'Atlanta Falcons' };
// Week 6 as hosted: fourteen games (byes), Thursday night first. Kickoffs are relative to now so the slate stays
// upcoming ('future'); 'partial' puts Thursday's game in the past and 'complete' every game.
function weekSix(timing = 'future', now = Date.now()) {
  const codes = Object.keys(TEAMS), day = 86_400_000, games = [];
  for (let i = 0; i < 14; i++) {
    const away = codes[2 * i], home = codes[2 * i + 1];
    const ahead = i === 0 ? 3 * day : i < 12 ? 6 * day : i === 12 ? 6 * day + 7 * 3600_000 : 7 * day;
    const kickoff = iso(timing === 'complete' || timing === 'partial' && i === 0 ? now - 3600_000 - (14 - i) * 60_000 : now + ahead);
    games.push({ id: `${away}-${home}`, away: TEAMS[away], home: TEAMS[home], awayCode: away, homeCode: home, matchup: `${TEAMS[away]} @ ${TEAMS[home]}`, kickoff });
  }
  return { games, deadline: games[0].kickoff };
}
function payload(games, quotes = true, now = Date.now()) {
  const captured = iso(now), observed = iso(now - 30_000);
  return { provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt: captured, quota: { remaining: 478, used: 22, last: quotes ? 2 : 0 },
    games: games.map((g, i) => ({ gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `event${i}`, matchStatus: Date.parse(g.kickoff) > now ? 'matched' : 'kickoff_passed',
      // Same quote shape as cloud/odds-provider.mjs, so a scheduled snapshot also qualifies as a submission reference.
      markets: Object.fromEntries(['spread', 'total'].map(m => [m, { quotes: !quotes || Date.parse(g.kickoff) <= now ? [] : ['draftkings', 'fanduel', 'betmgm'].map(book => ({ provider: 'the-odds-api', providerEventId: `event${i}`, market: m, book, value: m === 'spread' ? -3.5 : 45, collectedAt: captured, providerObservedAt: observed, timeBasis: 'provider_market_last_update',
        outcomes: m === 'spread' ? { home: { line: -3.5, odds: -110 }, away: { line: 3.5, odds: -110 } } : { over: { line: 45, odds: -110 }, under: { line: 45, odds: -110 } } })) }])) })) };
}

async function fixture(t, timing = 'future') {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;');
  for (const file of MIGRATIONS) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file === MIGRATIONS[0]) {
      // The private group league stays on Week 5 (fifteen games): nothing in the repository advances it.
      await db.query("insert into public.gtl_leagues(id,state) values('sean-troy-luke',$1)", [seed()]);
      await db.query('insert into auth.users values($1),($2)', [id(SEAN), id(STEVEN)]);
      await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner')", [id(SEAN)]);
    }
    if (file === MIGRATIONS[1]) await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Fistathon'),($2,'Sthomas')", [id(SEAN), id(STEVEN)]);
  }
  // Local-only extension double for the queue; no network, no hosted credential.
  await db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';");
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const rpc = async (name, args) => (await as('service_role', `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value;
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  // Hosted shape before the Monday auto-open: the schedule row enabled and pointed at Week 5, the budget measured.
  await db.query("insert into public.gtl_odds_schedule(id,enabled,endpoint,authorized_by,season,week,slate_signature) select 'nfl-12h',true,'https://example.supabase.co/functions/v1/gtl-odds-refresh',$1,season,week,signature from public.gtl_weekly_slates where week=5", [id(SEAN)]);
  await db.exec("update public.gtl_odds_budget set conservative_remaining=480,observed_remaining=480,last_successful_preflight_at=now()-interval '1 hour',last_collection_at=now()-interval '20 minutes'");
  // Historical Week 5 collection and snapshot rows that must survive byte for byte.
  await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature,diagnostics) select $1,$2,'collect','succeeded',$3,'2026-10-11T20:15:02Z','2026-10-11T20:16:32Z',2,season,week,signature,'{\"matchedEvents\":12,\"availableQuotes\":72}' from public.gtl_weekly_slates where week=5", [id(500), id(SEAN), id(501)]);
  await db.query("insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) select $1,season,week,signature,'{\"games\":[]}','2026-10-11T20:15:02Z' from public.gtl_weekly_slates where week=5", [id(500)]);
  const history = async () => (await q(`select md5(coalesce((select string_agg(c::text,'|' order by c.id) from public.gtl_odds_collections c where week=5),'')) collections,
    md5(coalesce((select string_agg(s::text,'|' order by s.id) from public.gtl_market_snapshots s where week=5),'')) snapshots,
    (select md5(signature::text) from public.gtl_weekly_slates where week=5) slate,(select md5(state::text) from public.gtl_leagues where id='sean-troy-luke') league,
    (select md5(games::text||deadline::text) from public.gtl_schedule_templates where week=5) template`))[0];
  const week6 = weekSix(timing);
  const publish = () => rpc('gtl_publish_week', [id(SEAN), 2026, 6, JSON.stringify(week6.games), week6.deadline, 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv']);
  const dispatch = async () => (await q('select public.gtl_dispatch_odds_refresh() value'))[0].value;
  const capability = async runId => (await q("select headers->>'Authorization' auth from net.outbox where body->>'runId'=$1 order by id desc limit 1", [runId]))[0]?.auth.slice(7);
  const service = createScheduledRefreshAdapter({ url: 'https://example.supabase.co', serviceRoleKey: 'fixture', fetchImpl: async (url, options) => {
    try { const value = await rpc(new URL(url).pathname.split('/').at(-1), Object.values(JSON.parse(options.body))); return new Response(JSON.stringify(value)); }
    catch (error) { return new Response(JSON.stringify({ message: error.message }), { status: 400 }); }
  } });
  let calls = 0, seen = null, lastPayload = null;
  const provider = { preflight: async ({ games }) => { seen = games; return payload(games, false); }, collect: async ({ games }) => { calls++; seen = games; lastPayload = payload(games); return lastPayload; } };
  const app = createScheduledRefreshHandler({ service, provider });
  const run = async () => {
    const queued = await dispatch(); assert.equal(queued.status, 'queued');
    const response = await app(new Request('https://example.supabase.co/functions/v1/gtl-odds-refresh', { method: 'POST', headers: { authorization: `Bearer ${await capability(queued.runId)}`, 'content-type': 'application/json' }, body: JSON.stringify({ runId: queued.runId }) }));
    return { runId: queued.runId, status: response.status, data: await response.json() };
  };
  const claim = async () => { const queued = await dispatch(); return rpc('gtl_claim_odds_refresh', [await capability(queued.runId), queued.runId]); };
  const resetRuns = () => db.exec("delete from public.gtl_odds_refresh_runs;update public.gtl_odds_budget set last_collection_at=now()-interval '20 minutes'");
  // Steven's complete Week 6 ballot through the personal route, exactly the intent cloud/handler.mjs builds.
  const intent = (requestId, patch = {}) => ({ season: 2026, week: 6, mode: 'guess_spread', revision: 0, picks: Object.fromEntries(week6.games.map(g => [g.id, -3])), submit: true, personalRevision: 0, requestId, ...patch });
  const check = x => rpc('gtl_preflight_submission', [id(STEVEN), x]);
  const begin = (request, x = intent(request)) => rpc('gtl_begin_submission_odds_collection', [id(STEVEN), request, x, 'collect']);
  const finish = (job, data, { quota = { remaining: 478, used: 22, last: 2 }, error = null } = {}) => rpc('gtl_finish_submission_odds_collection', [id(STEVEN), job.requestId, job.lease, data, quota, error]);
  const budget = async () => (await q('select * from public.gtl_odds_budget'))[0];
  return { db, as, rpc, q, history, week6, publish, dispatch, capability, run, claim, resetRuns, intent, check, begin, finish, budget, calls: () => calls, seen: () => seen, lastPayload: () => lastPayload };
}

test('scheduled and manual collection follow the published Week 6 slate while the group league stays on Week 5', { skip }, async t => {
  const f = await fixture(t); const before = await f.history();
  assert.equal((await f.publish()).published, true);
  const cfg = (await f.q("select season,week,jsonb_array_length(slate_signature->'games') n from public.gtl_odds_schedule"))[0];
  assert.deepEqual(cfg, { season: 2026, week: 6, n: 14 }, 'gtl_publish_week re-points the schedule row');
  const league = await f.rpc('gtl_odds_commissioner', [id(SEAN)]);
  assert.equal(league.week, 5); assert.equal(league.games.length, 15, 'the league-context helper is unchanged and still lags');
  const slate = await f.rpc('gtl_odds_collection_slate', [id(SEAN)]);
  assert.equal(slate.season, 2026); assert.equal(slate.week, 6); assert.equal(slate.games.length, 14);
  assert.deepEqual(slate.games[0], { id: 'SEA-DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', kickoff: f.week6.games[0].kickoff });
  assert.deepEqual(slate.signature, (await f.q('select signature from public.gtl_weekly_slates where week=6'))[0].signature);
  assert.deepEqual(Object.keys(slate).sort(), Object.keys(league).sort());
  await assert.rejects(() => f.rpc('gtl_odds_collection_slate', [id(STEVEN)]), /GTL_ODDS_FORBIDDEN/);
  // The real worker, claim through completion, with a provider double.
  const result = await f.run();
  assert.equal(result.status, 200); assert.equal(result.data.status, 'succeeded'); assert.equal(result.data.reason, null);
  assert.equal(f.calls(), 1); assert.equal(f.seen().length, 14); assert.equal(f.seen()[0].home, 'Denver Broncos');
  const row = (await f.q("select week,operation,status,(diagnostics->>'matchedEvents')::int matched,(diagnostics->>'availableQuotes')::int quotes,slate_signature=(select signature from public.gtl_weekly_slates where week=6) week6 from public.gtl_odds_collections where week=6"))[0];
  assert.deepEqual(row, { week: 6, operation: 'collect', status: 'succeeded', matched: 14, quotes: 84, week6: true });
  assert.deepEqual(await f.q("select week,jsonb_array_length(payload->'games') n from public.gtl_market_snapshots where week=6"), [{ week: 6, n: 14 }]);
  assert.deepEqual(await f.q('select status,reason from public.gtl_odds_refresh_runs'), [{ status: 'succeeded', reason: null }]);
  assert.equal((await f.budget()).conservative_remaining, 478);
  // A replay of the same run answers from the run row without a second provider call.
  const replay = await f.rpc('gtl_claim_odds_refresh', [await f.capability(result.runId), result.runId]);
  assert.equal(replay.replay, true); assert.equal(replay.status, 'succeeded'); assert.equal(f.calls(), 1);
  const meta = await f.rpc('gtl_read_odds_schedule', [id(SEAN), 'sean-troy-luke']);
  assert.equal(meta.enabled, true); assert.equal(meta.operationalStatus, 'active'); assert.equal(meta.slateStatus, 'eligible');
  assert.equal(meta.pauseReason, null); assert.equal(meta.season, 2026); assert.equal(meta.week, 6); assert.equal(meta.lastStatus, 'succeeded');
  assert.equal(meta.referenceOnly, true); assert.deepEqual(meta.utcTimes, ['08:15', '20:15']);
  await assert.rejects(() => f.rpc('gtl_read_odds_schedule', [id(STEVEN), 'sean-troy-luke']), /GTL_FORBIDDEN/);
  // The manual commissioner path records Week 6 too.
  await f.db.exec("update public.gtl_odds_budget set last_collection_at=now()-interval '20 minutes'");
  const manual = await f.rpc('gtl_begin_odds_collection', [id(SEAN), id(700), 'collect']);
  assert.equal(manual.week, 6); assert.equal(manual.games.length, 14);
  const done = await f.rpc('gtl_finish_odds_collection', [id(SEAN), id(700), manual.lease, payload(manual.games), { remaining: 476, used: 24, last: 2 }, null]);
  assert.equal(done.status, 'succeeded'); assert.equal(done.availableQuotes, 84);
  assert.equal((await f.q('select count(*)::int n from public.gtl_odds_collections where week=6'))[0].n, 2);
  // Week 5 history is byte-identical and the group page still reads its own Week 5 snapshot.
  assert.deepEqual(await f.history(), before);
  assert.equal((await f.rpc('gtl_read_market_snapshot', [id(SEAN), 'sean-troy-luke'])).id, id(500));
});

test('the claim still skips safely for a changed signature, a lagging configuration, a missing template and a revoked commissioner', { skip }, async t => {
  const f = await fixture(t); await f.publish();
  const published = (await f.q('select signature from public.gtl_weekly_slates where week=6'))[0].signature;
  const expectSkip = async (reason, label) => {
    const claim = await f.claim();
    assert.deepEqual({ replay: claim.replay, status: claim.status, reason: claim.reason }, { replay: true, status: 'skipped', reason }, label);
    assert.equal(f.calls(), 0);
    assert.equal((await f.q("select count(*)::int n from public.gtl_odds_collections where week=6"))[0].n, 0);
  };
  await f.db.exec("update public.gtl_odds_schedule set slate_signature='{}'");
  await expectSkip('slate_changed', 'a signature that matches nothing');
  assert.equal((await f.rpc('gtl_read_odds_schedule', [id(SEAN), 'sean-troy-luke'])).pauseReason, 'slate_changed');
  await f.resetRuns();
  await f.db.query("update public.gtl_odds_schedule set slate_signature=jsonb_set($1::jsonb,'{deadline}',to_jsonb(($1::jsonb->>'deadline')::numeric+3600))", [published]);
  await expectSkip('slate_changed', 'the same games with a different deadline');
  await f.resetRuns();
  // The configuration lags the newest published week.
  await f.db.exec("update public.gtl_odds_schedule set season=s.season,week=s.week,slate_signature=s.signature from public.gtl_weekly_slates s where s.week=5");
  await expectSkip('slate_changed', 'configuration still on Week 5');
  await f.resetRuns();
  await f.db.query('update public.gtl_odds_schedule set season=2026,week=6,slate_signature=$1', [published]);
  await f.db.exec("update public.gtl_schedule_templates set deadline=deadline+interval '1 hour' where week=6");
  await expectSkip('slate_unavailable', 'no template matches the published signature');
  await f.db.exec("update public.gtl_schedule_templates set deadline=deadline-interval '1 hour' where week=6");
  await f.resetRuns();
  await f.db.exec('update public.gtl_memberships set active=false');
  await expectSkip('commissioner_unavailable', 'revoked commissioner');
  await assert.rejects(() => f.rpc('gtl_read_odds_schedule', [id(SEAN), 'sean-troy-luke']), /GTL_FORBIDDEN/, 'the inactive member cannot read');
});

test('a started fourteen-game slate skips or completes partially relative to its own game count, not fifteen', { skip }, async t => {
  await t.test('every game started', async t => {
    const f = await fixture(t, 'complete'); await f.publish();
    const claim = await f.claim();
    assert.equal(claim.reason, 'all_games_started'); assert.equal(f.calls(), 0);
    const meta = await f.rpc('gtl_read_odds_schedule', [id(SEAN), 'sean-troy-luke']);
    assert.equal(meta.slateStatus, 'complete'); assert.equal(meta.pauseReason, 'all_games_started'); assert.equal(meta.enabled, false);
  });
  await t.test('Thursday started, thirteen upcoming', async t => {
    const f = await fixture(t, 'partial'); await f.publish();
    const result = await f.run();
    assert.equal(result.data.status, 'partial'); assert.equal(f.calls(), 1);
    const snapshot = (await f.q('select payload from public.gtl_market_snapshots where week=6'))[0].payload;
    assert.equal(snapshot.games.length, 14); assert.equal(snapshot.games[0].markets.spread.quotes.length, 0); assert.equal(snapshot.games[1].markets.spread.quotes.length, 3);
    assert.deepEqual((await f.q("select (diagnostics->>'matchedEvents')::int matched,(diagnostics->>'availableQuotes')::int quotes from public.gtl_odds_collections where week=6"))[0], { matched: 13, quotes: 78 });
    assert.equal((await f.rpc('gtl_read_odds_schedule', [id(SEAN), 'sean-troy-luke'])).slateStatus, 'partial');
  });
});

test('six collections per UTC day are shared by the scheduled run, submission collections and manual requests', { skip }, async t => {
  const f = await fixture(t); await f.publish();
  const scheduled = await f.run(); assert.equal(scheduled.data.status, 'succeeded');
  // Steven's complete Week 6 ballot needs references; the scheduled snapshot is seconds old, so nothing is spent.
  assert.deepEqual(await f.check(f.intent(id(600))), { requiresReferences: true, ready: true });
  await assert.rejects(() => f.begin(id(600)), /GTL_ODDS_NOT_REQUIRED/);
  const age = async () => {
    // Age the latest scheduled quotes past the five-minute rule (test-only rewrite of synthetic timestamps) and
    // move the shared collection clock beyond the five-minute cooldown.
    const fresh = f.lastPayload(), captured = Date.parse(fresh.fetchedAt);
    await f.db.query('update public.gtl_market_snapshots set payload=replace(replace(payload::text,$1,$3),$2,$4)::jsonb,created_at=$3::timestamptz where week=6', [fresh.fetchedAt, iso(captured - 30_000), iso(Date.now() - 7 * 60_000), iso(Date.now() - 7 * 60_000 - 30_000)]);
    await f.db.exec("update public.gtl_odds_budget set last_collection_at=now()-interval '6 minutes'");
  };
  await age();
  assert.deepEqual(await f.check(f.intent(id(600))), { requiresReferences: true, ready: false });
  // One scheduled row plus five submission collections reach the cap of six; the fifth and sixth rows would have
  // been refused under the old cap of four.
  for (let n = 1; n <= 5; n++) {
    const job = await f.begin(id(600 + n)); assert.equal(job.replay, false); assert.equal(job.week, 6); assert.equal(job.games.length, 14);
    assert.equal((await f.finish(job, null, { quota: {}, error: 'ODDS_TIMEOUT' })).status, 'failed');
    await assert.rejects(() => f.begin(id(620 + n)), /GTL_ODDS_COOLDOWN/, 'a collection seconds old still holds the cooldown');
    await f.db.exec("update public.gtl_odds_budget set last_collection_at=now()-interval '6 minutes'");
  }
  const counts = (await f.q("select count(*)::int total,count(*) filter (where i.request_id is not null)::int submission from public.gtl_odds_collections c left join public.gtl_submission_odds_intents i on i.request_id=c.id where c.operation='collect' and c.started_at>=(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')"))[0];
  assert.deepEqual(counts, { total: 6, submission: 5 });
  const exhausted = await f.budget(); assert.equal(exhausted.conservative_remaining, 468);
  await assert.rejects(() => f.begin(id(630)), /GTL_ODDS_DAILY_LIMIT/);
  await assert.rejects(() => f.rpc('gtl_begin_odds_collection', [id(SEAN), id(631), 'collect']), /GTL_ODDS_DAILY_LIMIT/);
  assert.deepEqual(await f.budget(), exhausted, 'a refusal reserves nothing');
  assert.equal((await f.q('select count(*)::int n from public.gtl_market_snapshots where week=6'))[0].n, 1);
});

test('window migration is idempotent, service-only and leaves every function security invoker', { skip }, async t => {
  const f = await fixture(t);
  const signatures = ['gtl_published_slate(integer,integer)', 'gtl_odds_collection_slate(uuid)', 'gtl_begin_odds_collection(uuid,uuid,text)', 'gtl_finish_odds_collection(uuid,uuid,uuid,jsonb,jsonb,text)',
    'gtl_begin_submission_odds_collection(uuid,uuid,jsonb,text)', 'gtl_claim_odds_refresh(text,uuid)', 'gtl_complete_odds_refresh(uuid,uuid,text)', 'gtl_read_odds_schedule(uuid,text)'];
  const definitions = async () => Promise.all(signatures.map(async s => (await f.q('select pg_get_functiondef($1::regprocedure) d', [`public.${s}`]))[0].d));
  const before = await definitions();
  await f.db.exec(fs.readFileSync(`supabase/migrations/${WINDOW}`, 'utf8'));
  assert.deepEqual(await definitions(), before);
  for (const s of signatures) {
    for (const role of ['anon', 'authenticated']) assert.equal((await f.q('select has_function_privilege($1,$2,$3) ok', [role, `public.${s}`, 'EXECUTE']))[0].ok, false, s);
    assert.equal((await f.q('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${s}`, 'EXECUTE']))[0].ok, true, s);
  }
  assert.equal((await f.q("select has_function_privilege('service_role','public.gtl_dispatch_odds_refresh()','EXECUTE') ok"))[0].ok, false, 'dispatch stays admin-only');
  assert.equal((await f.q("select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname like 'gtl_%' and prosecdef"))[0].n, 0);
});
