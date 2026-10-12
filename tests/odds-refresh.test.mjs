import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { createCloudHandler } from '../cloud/handler.mjs';
import { createScheduledRefreshAdapter, createScheduledRefreshHandler } from '../cloud/odds-refresh.mjs';
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite absent; no hosted database tests.';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const token = 'a'.repeat(64); // Synthetic fixture, never a deployed credential.
// The October 12 window file replaces the scheduler's claim/complete/read RPCs and both collection begin RPCs; it
// also replaces gtl_begin_submission_odds_collection, whose row types need 20261008232055 and that file's own
// dependencies (185715, 224444, 225401). The fixture's Week 5 template matches the league slate, so the published
// slate resolves to the same fifteen games the earlier assertions expect.
const migrations = ['20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql', '20261008185715_gtl_weekly_eligibility_rulings.sql', '20261008185738_gtl_manual_odds_collection.sql', '20261008200926_gtl_twelve_hour_odds_refresh.sql', '20261008224444_gtl_personal_workspace.sql', '20261008225401_gtl_submission_time_scoring.sql', '20261008232055_gtl_fresh_submission_odds.sql', '20261012213000_gtl_submission_odds_window.sql'].map(f => fs.readFileSync(`supabase/migrations/${f}`, 'utf8'));
function payload(games, quotes = true) {
  const now = Date.now(), captured = new Date(now).toISOString(), observed = new Date(now - 30000).toISOString();
  return { provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt: captured, quota: { remaining: 498, used: 2, last: quotes ? 2 : 0 },
    games: games.map((g, i) => ({ gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `event${i}`, matchStatus: Date.parse(g.kickoff) > now ? 'matched' : 'kickoff_passed',
      markets: Object.fromEntries(['spread', 'total'].map(m => [m, { quotes: !quotes || Date.parse(g.kickoff) <= now ? [] : ['draftkings', 'fanduel', 'betmgm'].map(book => ({ provider: 'the-odds-api', providerEventId: `event${i}`, market: m, book, value: m === 'spread' ? -3.5 : 45, collectedAt: captured, providerObservedAt: observed })) }])) })) };
}
async function fixture(t, timing = 'future') {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;');
  await db.exec(migrations[0]);
  const original = seed(); original.games.forEach((g, i) => { g.kickoff = new Date(Date.now() + (timing === 'complete' || timing === 'partial' && i === 0 ? -3600000 : 86400000 + i * 3600000)).toISOString(); });
  original.league.deadline = original.games[0].kickoff;
  await db.query("insert into public.gtl_leagues(id,state) values('sean-troy-luke',$1)", [original]);
  await db.query('insert into auth.users values($1),($2)', [id(1), id(2)]);
  await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner')", [id(1)]);
  for (const sql of migrations.slice(1)) await db.exec(sql);
  // Local-only extension double. Deliberately readable queue models the hosted
  // default ACL concern; only a short-lived, one-run capability is placed here.
  await db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';revoke all on function net.http_post(text,jsonb,jsonb,integer) from public;grant usage on schema net to anon,authenticated;grant select,insert,update,delete on net.outbox to anon,authenticated;");
  await db.query("insert into public.gtl_odds_schedule(id,enabled,endpoint,authorized_by,season,week,slate_signature) select 'nfl-12h',true,'https://example.supabase.co/functions/v1/gtl-odds-refresh',$1,season,week,signature from public.gtl_weekly_slates", [id(1)]);
  await db.exec('update public.gtl_odds_budget set conservative_remaining=500,last_successful_preflight_at=now()');
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const rpc = async (name, args) => (await as('service_role', `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value;
  const dispatch = async () => (await db.query('select public.gtl_dispatch_odds_refresh() value')).rows[0].value;
  const capability = async runId => (await as('anon', "select headers->>'Authorization' auth from net.outbox where body->>'runId'=$1 order by id desc limit 1", [runId])).rows[0]?.auth.slice(7);
  const service = createScheduledRefreshAdapter({ url: 'https://example.supabase.co', serviceRoleKey: 'fixture', fetchImpl: async (url, options) => {
    try { const value = await rpc(new URL(url).pathname.split('/').at(-1), Object.values(JSON.parse(options.body))); return new Response(JSON.stringify(value)); }
    catch (error) { return new Response(JSON.stringify({ message: error.message }), { status: 400 }); }
  } });
  let calls = 0, preflights = 0;
  const provider = { preflight: async ({ games }) => { preflights++; return payload(games, false); }, collect: async ({ games }) => { calls++; return payload(games); } };
  const app = createScheduledRefreshHandler({ service, provider });
  const request = async (runId, auth, overrides = {}) => {
    auth ??= await capability(runId) || token;
    const response = await app(new Request('https://example.supabase.co/functions/v1/gtl-odds-refresh', { method: 'POST', headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' }, body: JSON.stringify({ runId, ...overrides }) }));
    return { status: response.status, data: await response.json() };
  };
  return { db, original, as, rpc, dispatch, capability, request, calls: () => calls, preflights: () => preflights };
}

test('scheduler SQL and HTTP enforce private dispatch, token authentication, slot replay and shared collection', { skip }, async t => {
  const f = await fixture(t), before = (await f.db.query('select state from public.gtl_leagues')).rows;
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['gtl_odds_schedule', 'gtl_odds_refresh_runs']) for (const query of [`select * from public.${table}`, `delete from public.${table}`, `insert into public.${table} default values`, `update public.${table} set ${table === 'gtl_odds_schedule' ? 'enabled=enabled' : 'status=status'}`]) await assert.rejects(() => f.as(role, query), /permission denied/);
    for (const signature of ['gtl_dispatch_odds_refresh()', 'gtl_claim_odds_refresh(text,uuid)', 'gtl_complete_odds_refresh(uuid,uuid,text)', 'gtl_read_odds_schedule(uuid,text)']) assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false);
  }
  await assert.rejects(() => f.rpc('gtl_dispatch_odds_refresh', []), /permission denied/);
  await assert.rejects(() => f.as('service_role', 'update public.gtl_odds_schedule set enabled=false'), /permission denied/);
  await assert.rejects(() => f.as('service_role', 'update public.gtl_odds_refresh_runs set slot_start=now()'), /permission denied/);
  await assert.rejects(() => f.as('service_role', "update public.gtl_odds_refresh_runs set capability_hash=repeat('f',64)"), /permission denied/);
  const queued = await f.dispatch(); assert.equal(queued.status, 'queued');
  assert.deepEqual(Object.keys(queued).sort(), ['runId', 'status']);
  assert.deepEqual(await f.dispatch(), { status: 'already_dispatched' });
  assert.equal((await f.db.query('select count(*) n from net.outbox')).rows[0].n, 1);
  assert.equal((await f.request(queued.runId, 'b'.repeat(64))).status, 401);
  assert.equal((await f.request(queued.runId, 'invalid')).status, 401);
  const runToken = await f.capability(queued.runId); assert.match(runToken, /^[0-9a-f]{64}$/);
  for (const override of [{ games: [] }, { actorId: id(2) }, { operation: 'preflight' }]) assert.equal((await f.request(queued.runId, runToken, override)).status, 400); assert.equal(f.calls(), 0);
  assert.equal((await f.request(id(800), runToken)).status, 401);
  const protectedRow = (await f.db.query('select capability_hash from public.gtl_odds_refresh_runs')).rows[0]; assert.notEqual(protectedRow.capability_hash, runToken);
  const success = await f.request(queued.runId); assert.equal(success.status, 200); assert.equal(success.data.status, 'succeeded'); assert.equal(f.calls(), 1); assert.equal(f.preflights(), 0);
  assert.equal((await f.request(queued.runId)).data.status, 'succeeded'); assert.equal(f.calls(), 1);
  await f.db.exec("update public.gtl_odds_refresh_runs set created_at=now()-interval '6 minutes'");
  const expiredReplay = await f.request(queued.runId); assert.equal(expiredReplay.status, 401); assert.equal(expiredReplay.data.status, undefined); assert.equal(f.calls(), 1);
  assert.equal((await f.db.query('select conservative_remaining from public.gtl_odds_budget')).rows[0].conservative_remaining, 498);
  assert.equal((await f.db.query('select count(*) n from public.gtl_market_snapshots')).rows[0].n, 1);
  assert.deepEqual((await f.db.query('select state from public.gtl_leagues')).rows, before);
  const meta = await f.rpc('gtl_read_odds_schedule', [id(1), 'sean-troy-luke']);
  assert.equal(meta.enabled, true); assert.equal(meta.lastStatus, 'succeeded'); assert.equal(meta.cadenceHours, 12); assert.equal(meta.slateStatus, 'eligible');
  assert.equal(meta.timeZone, 'UTC'); assert.deepEqual(meta.utcTimes, ['08:15', '20:15']);
  assert.equal(JSON.stringify(meta).includes(runToken), false); assert.equal(JSON.stringify(meta).includes(protectedRow.capability_hash), false);
  assert.equal(meta.capability_hash, undefined); assert.equal(meta.availableQuotes, undefined);
  await assert.rejects(() => f.rpc('gtl_read_odds_schedule', [id(2), 'sean-troy-luke']), /GTL_FORBIDDEN/);
  await f.db.exec('update public.gtl_odds_budget set paused=true');
  const paused = await f.rpc('gtl_read_odds_schedule', [id(1), 'sean-troy-luke']);
  assert.equal(paused.configured, true); assert.equal(paused.enabled, false); assert.equal(paused.pauseReason, 'budget_paused'); assert.equal(paused.nextRunAt, null);
});

test('scheduled partial upcoming slate continues after TNF and shared six/day limit includes manual attempts', { skip }, async t => {
  const f = await fixture(t, 'partial');
  // Five earlier manual attempts use the same global counter, regardless of success (the cap is six per UTC day
  // since the October 12 window migration; it was four). The daily limit counts collections started since
  // 00:00 UTC, so the attempts are clamped to the current UTC day: with a plain now()-1h the test failed every
  // day between 00:00 and 01:00 UTC, when the attempts fell on the previous day.
  await f.db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) select gen_random_uuid(),$1,'collect','failed',gen_random_uuid(),greatest(now()-interval '1 hour',date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),now(),2,season,week,signature from public.gtl_weekly_slates cross join generate_series(1,5)", [id(1)]);
  const queued = await f.dispatch(), result = await f.request(queued.runId);
  assert.equal(result.data.status, 'partial'); assert.equal(f.calls(), 1);
  const snapshot = (await f.db.query('select payload from public.gtl_market_snapshots')).rows[0].payload;
  assert.equal(snapshot.games.length, 15); assert.equal(snapshot.games[0].markets.spread.quotes.length, 0); assert.equal(snapshot.games[1].markets.spread.quotes.length, 3);
  await f.db.exec("update public.gtl_odds_budget set last_collection_at=now()-interval '20 minutes'");
  await assert.rejects(() => f.rpc('gtl_begin_odds_collection', [id(1), id(70), 'collect']), /GTL_ODDS_DAILY_LIMIT/);
  assert.equal((await f.rpc('gtl_read_odds_schedule', [id(1), 'sean-troy-luke'])).slateStatus, 'partial');
});

test('all-started or changed slate, revoked commissioner and unknown quota skip safely without paid calls', { skip }, async t => {
  const f = await fixture(t, 'complete'); const queued = await f.dispatch();
  assert.equal((await f.request(queued.runId)).data.reason, 'all_games_started'); assert.equal(f.calls(), 0); assert.equal(f.preflights(), 0);
  const ended = await f.rpc('gtl_read_odds_schedule', [id(1), 'sean-troy-luke']);
  assert.equal(ended.slateStatus, 'complete'); assert.equal(ended.enabled, false); assert.equal(ended.pauseReason, 'all_games_started');
  await f.db.exec("update public.gtl_odds_refresh_runs set status='queued',reason=null;update public.gtl_memberships set active=false");
  assert.equal((await f.request(queued.runId)).data.reason, 'commissioner_unavailable'); assert.equal(f.calls(), 0);
  await f.db.exec("update public.gtl_odds_refresh_runs set status='queued',reason=null;update public.gtl_memberships set active=true;update public.gtl_odds_schedule set slate_signature='{}'");
  assert.equal((await f.request(queued.runId)).data.reason, 'slate_changed'); assert.equal(f.calls(), 0);
  const changed = await f.rpc('gtl_read_odds_schedule', [id(1), 'sean-troy-luke']); assert.equal(changed.enabled, false); assert.equal(changed.pauseReason, 'slate_changed');
});

test('preflight renews only when needed; reserve protection and stale claim prevent extra collection', { skip }, async t => {
  const f = await fixture(t);
  await f.db.exec('update public.gtl_odds_budget set last_successful_preflight_at=null,conservative_remaining=null');
  const queued = await f.dispatch(); assert.equal((await f.request(queued.runId)).data.status, 'succeeded'); assert.equal(f.preflights(), 1); assert.equal(f.calls(), 1);
  // New run fixture in the same slot only after explicit admin reset; API cannot do this.
  await f.db.exec("delete from public.gtl_odds_refresh_runs;update public.gtl_odds_budget set conservative_remaining=51,last_collection_at=now()-interval '20 minutes'");
  const low = await f.dispatch(); assert.equal((await f.request(low.runId)).data.reason, 'budget_guard'); assert.equal(f.calls(), 1);
  await f.db.exec("delete from public.gtl_odds_refresh_runs;update public.gtl_odds_budget set conservative_remaining=500");
  const stale = await f.dispatch(); await f.db.exec("update public.gtl_odds_refresh_runs set created_at=now()-interval '6 minutes'");
  assert.equal((await f.request(stale.runId)).status, 401); assert.equal(f.calls(), 1);
  await f.db.exec('delete from public.gtl_odds_refresh_runs'); const running = await f.dispatch();
  const runningToken = await f.capability(running.runId);
  const claim = await f.rpc('gtl_claim_odds_refresh', [runningToken, running.runId]);
  assert.equal((await f.rpc('gtl_claim_odds_refresh', [runningToken, running.runId])).replay, true);
  await assert.rejects(() => f.rpc('gtl_complete_odds_refresh', [running.runId, id(77), null]), /GTL_SCHEDULE_RUN/);
  await f.db.exec("update public.gtl_odds_refresh_runs set claimed_at=now()-interval '11 minutes'");
  await assert.rejects(() => f.rpc('gtl_complete_odds_refresh', [running.runId, claim.claim, null]), /GTL_SCHEDULE_EXPIRED/);
  assert.equal((await f.rpc('gtl_read_odds_schedule', [id(1), 'sean-troy-luke'])).lastReason, 'worker_timeout');
  await f.db.exec("update public.gtl_odds_refresh_runs set slot_start=slot_start-interval '12 hours',created_at=now()");
  assert.equal((await f.request(running.runId, runningToken)).status, 401, 'slot boundary invalidates capability regardless of creation timestamp');
  const newer = await f.dispatch(); const newerToken = await f.capability(newer.runId);
  assert.notEqual(newerToken, runningToken);
  assert.equal((await f.request(newer.runId, runningToken)).status, 401, 'old capability cannot claim a different existing run');
  assert.equal((await f.request(running.runId, newerToken)).status, 401, 'new capability cannot claim old run');
  assert.equal(f.calls(), 1);
});

test('machine endpoint never invokes provider on invalid auth/replay and scrubs unknown failures', async () => {
  let providers = 0;
  const service = createScheduledRefreshAdapter({ url: 'https://example.supabase.co', serviceRoleKey: 'private', fetchImpl: async () => new Response(JSON.stringify({ message: 'GTL_SCHEDULE_AUTH', secret: token }), { status: 400 }) });
  const app = createScheduledRefreshHandler({ service, provider: () => { providers++; throw new Error(token); } });
  const request = (auth = token, content = JSON.stringify({ runId: id(1) })) => new Request('https://example.supabase.co/functions/v1/gtl-odds-refresh', { method: 'POST', headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' }, body: content });
  assert.equal((await app(request())).status, 401); assert.equal(providers, 0);
  assert.equal((await app(request(token, 'x'.repeat(1025)))).status, 400);
  const broken = createScheduledRefreshHandler({ service: { rpc: async () => { throw new Error(`URL?secret=${token}`); } }, provider: () => { providers++; } });
  const result = await broken(request()); assert.equal(result.status, 503); assert.equal((await result.text()).includes(token), false); assert.equal(providers, 0);
  let storageCalls = 0;
  const stalled = createScheduledRefreshHandler({ bodyTimeoutMs: 15, service: { rpc: async () => { storageCalls++; } }, provider: () => { providers++; } });
  const slowBody = new Request('https://example.supabase.co/functions/v1/gtl-odds-refresh', { method: 'POST', duplex: 'half', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: new ReadableStream({ start() {} }) });
  assert.equal((await stalled(slowBody)).status, 400); assert.equal(storageCalls, 0); assert.equal(providers, 0);
});

test('refresh metadata is attached only after the matching prediction mode reveals', async () => {
  const state = seed(); let reads = 0;
  const app = createCloudHandler({ clock: () => Date.parse('2026-10-08T20:00:00Z'), authenticate: async () => ({ id: id(1), email: 'fixture@example.test', emailConfirmed: true }),
    storage: { membership: async () => ({ active: true, player_id: 'sean' }) }, weekly: { load: async () => ({ state, revision: 0 }) },
    odds: { scheduleMetadata: async () => { reads++; return { enabled: true, cadenceHours: 12 }; } } });
  for (const mode of ['guess_total', 'betting_challenge', 'guess_spread']) {
    const result = await app(new Request(`https://api.test/gtl-api/state?mode=${mode}`, { headers: { authorization: 'Bearer valid' } }));
    const data = await result.json(); assert.equal(data.oddsSchedule?.enabled, mode === 'guess_spread' ? true : undefined);
  }
  assert.equal(reads, 1);
});
