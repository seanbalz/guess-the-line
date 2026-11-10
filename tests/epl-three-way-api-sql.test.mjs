// The pending three-way migration behind the real HTTP handler, adapter and market-aware collector on disposable PGlite.
// The provider is a fake; no hosted project or network is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRELUDE } from './migrations.mjs';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { createEplMoneylineCollector } from '../cloud/epl-moneyline-collector.mjs';
const { PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js');
const id = n => `00000000-0000-4000-8000-00000000000${n}`, OWNER = '473955676301815808', OTHER = '719658248843632640';
const at = ms => new Date(ms).toISOString();

async function setup(t) {
  const db = new PGlite(); t.after(() => db.close()); await db.exec(PRELUDE);
  for (const file of ['20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261028190000_gtl_epl_pick_a_team.sql',
    '20261029060000_gtl_epl_open_access.sql', '20261029150000_gtl_epl_moneyline.sql']) await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(`create table public.gtl_odds_budget(provider text primary key,conservative_remaining integer,paused boolean default false,
    observed_remaining integer,observed_used integer,observed_last integer,observed_at timestamptz,updated_at timestamptz);
    insert into public.gtl_odds_budget(provider,conservative_remaining) values('the-odds-api',100);
    grant select,update on public.gtl_odds_budget to service_role;`);
  for (const file of ['20261029165947_gtl_epl_moneyline_collector.sql', '20261110100000_gtl_epl_three_way_moneyline.sql']) await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  const kick = at(Date.now() + 86400_000);
  await db.query('insert into auth.users(id) values($1),($2),($3)', [id(1), id(2), id(3)]);
  await db.query('update public.gtl_epl_managers set user_id=$1 where owner_id=$2', [id(1), OWNER]); await db.query('update public.gtl_epl_managers set user_id=$1 where owner_id=$2', [id(2), OTHER]);
  await db.query("insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order) values(2026,12,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '7 days',$1,$2)", [kick, [OWNER, OTHER]]);
  await db.query("insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values('e1',2026,12,'ARS','CHE',$1),('e2',2026,12,'LIV','EVE',$1)", [kick]);
  const detail = { season: 2026, week: 12, dnbAvailable: true, events: ['e1', 'e2'].map(eventId => ({ eventId, books: { draftkings: { ARS: -130, CHE: 110 }, fanduel: { ARS: -140, CHE: 120 } } })) };
  await db.query("insert into public.gtl_epl_job_runs(job,slot_start,capability_hash,status,detail) values('dnb-check',clock_timestamp(),repeat('a',64),'succeeded',$1)", [detail]);
  await db.exec("insert into public.gtl_epl_jobs_schedule(job,enabled) values('moneyline',true)");
  const asService = async (name, body) => (await db.transaction(async tx => { await tx.exec('set local role service_role');
    return tx.query(`select public.${name}(${Object.keys(body).map((key, i) => `${key}=>$${i + 1}`).join(',')}) as value`, Object.values(body)); })).rows[0].value;
  const rpcCalls = [], provider = [];
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url), name = u.pathname.split('/').at(-1);
    if (u.pathname.includes('/rpc/')) {
      rpcCalls.push(name);
      try { return Response.json(await asService(name, JSON.parse(options.body))); }
      catch (e) { const absent = e.code === '42883' && e.message.includes(`function public.${name}(`); return Response.json({ code: absent ? 'PGRST202' : e.code, message: e.message }, { status: absent ? 404 : 400 }); }
    }
    if (name === 'gtl_epl_weeks') return Response.json((await db.query('select season,week from public.gtl_epl_weeks order by season desc,week desc limit 38')).rows);
    if (name === 'gtl_epl_fixtures') return Response.json((await db.query('select event_id,season,week,home,away from public.gtl_epl_fixtures where event_id=$1', [u.searchParams.get('event_id').slice(3)])).rows);
    throw new Error(`Unexpected private read ${name}`);
  };
  // The fake provider answers one complete two-way and three-way read for the stored fixture.
  const collector = createEplMoneylineCollector({ markets: true, rpc: asService, drawNoBet: async args => {
    provider.push(args); const observed = Date.now();
    return { quota: { remaining: 97, used: 403, last: 2 }, events: [{ eventId: 'e1', available: true, home: 'ARS', away: 'CHE', commenceTime: kick, observedAt: at(observed), responseSha256: 'd'.repeat(64),
      books: { draftkings: { ARS: -150, CHE: 130 }, fanduel: { ARS: -140, CHE: 120 } }, bookObservedAt: { draftkings: at(observed - 1000), fanduel: at(observed - 1000) },
      threeWayBooks: { draftkings: { home: -120, draw: 260, away: 300 }, fanduel: { home: -110, draw: 250, away: 320 }, betmgm: { home: -125, draw: 270, away: 310 } },
      threeWayBookObservedAt: { draftkings: at(observed - 1000), fanduel: at(observed - 1000), betmgm: at(observed - 2000) } }] };
  } });
  const adapter = createSupabaseAdapter({ url: 'https://fixture.supabase.co', anonKey: 'fixture', serviceRoleKey: 'fixture', fetchImpl, eplMoneylineRefreshForLock: args => collector.refreshForLock(args) });
  const handler = createCloudHandler({ epl: adapter.epl, authenticate: async token => ({ id: id(Number(token)), email: 'fixture@example.test', emailConfirmed: true }), clock: () => Date.now() });
  const call = async (route, body = {}, user = 1) => { const response = await handler(new Request(`https://fixture.test/epl/${route}`, { method: 'POST', headers: { authorization: `Bearer ${user}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })); return { status: response.status, body: await response.json() }; };
  const remaining = async () => (await db.query('select conservative_remaining n from public.gtl_odds_budget')).rows[0].n;
  return { db, call, rpcCalls, provider, remaining };
}

test('HTTP three-way lock: capability-gated entry, one shared read with both markets, first-after reference and combined leaderboard', async t => {
  const f = await setup(t);
  const read = await f.call('guess/read');
  assert.equal(read.status, 200); assert.deepEqual(read.body.markets, ['draw_no_bet', 'three_way']); assert.equal(read.body.available, true);
  assert.equal((await f.call('guess/save', { eventId: 'e1', market: 'three_way', outcome: 'draw', price: 230, lock: false })).body.state, 'draft');
  assert.deepEqual(f.provider, [], 'a draft buys nothing');
  const locked = await f.call('guess/save', { eventId: 'e1', market: 'three_way', outcome: 'draw', price: 240, lock: true });
  assert.equal(locked.status, 200); assert.equal(locked.body.status, 'locked');
  assert.deepEqual(f.provider, [{ eventIds: ['e1'], observations: true, threeWay: true }]);
  assert.equal(await f.remaining(), 97, 'two reserved credits, then the provider header reconciles');
  assert.equal(locked.body.referencePrice, 260); assert.equal(locked.body.referenceSource, 'first-after'); assert.equal(locked.body.distance, 20); assert.equal(locked.body.state, 'scored');
  const again = await f.call('guess/save', { eventId: 'e1', club: 'ARS', price: -130, lock: true });
  assert.equal(again.status, 409); assert.equal(again.body.code, 'GTL_EPL_GUESS_LOCKED'); assert.equal(again.body.guess.market, 'three_way');
  // A legacy two-way body from an older client still saves.
  const legacy = await f.call('guess/save', { eventId: 'e2', club: 'LIV', price: -150, lock: false }, 2);
  assert.equal(legacy.status, 200); assert.equal(legacy.body.market, 'draw_no_bet'); assert.equal(legacy.body.outcome, 'home');
  assert.deepEqual((await f.call('guess/read', {}, 2)).body.guesses.map(g => [g.eventId, g.ownerId]), [['e2', OTHER]], 'the other manager sees no unrevealed guess');
  await f.db.exec("update public.gtl_epl_fixtures set commence_time=clock_timestamp()-interval '1 minute'");
  const board = await f.call('guess/leaderboard');
  assert.deepEqual(board.body.rows.map(r => [r.ownerId, r.average, r.guessed]), [[OWNER, 20, 1]]);
});

test('HTTP EPL Bets: own locked guesses against stored same-market odds; opening the screen buys nothing', async t => {
  const f = await setup(t);
  await f.call('guess/save', { eventId: 'e1', market: 'three_way', outcome: 'away', price: 280, lock: true });
  await f.call('guess/save', { eventId: 'e1', market: 'draw_no_bet', outcome: 'home', price: -170, lock: true }, 2);
  const credits = await f.remaining(), provider = f.provider.length, attempts = (await f.db.query('select count(*)::int n from public.gtl_epl_moneyline_attempts')).rows[0].n;
  const before = f.rpcCalls.length;
  const bets = await f.call('bets/read');
  assert.equal(bets.status, 200); assert.equal(bets.body.available, true); assert.equal(bets.body.ownerId, OWNER);
  assert.deepEqual(bets.body.items.map(i => [i.market, i.outcome, i.price, i.latestPrice, i.gap]), [['three_way', 'away', 280, 310, 30]]);
  assert.deepEqual(f.rpcCalls.slice(before), ['gtl_epl_bet_recommendations']);
  assert.equal(f.provider.length, provider); assert.equal(await f.remaining(), credits);
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_epl_moneyline_attempts')).rows[0].n, attempts);
  const other = await f.call('bets/read', {}, 2);
  assert.deepEqual(other.body.items.map(i => [i.market, i.outcome, i.gap]), [['draw_no_bet', 'home', 25]], 'each account sees only its own guesses');
  const viewer = await f.call('bets/read', {}, 3);
  assert.deepEqual([viewer.body.ownerId, viewer.body.items], [null, []]);
  assert.equal((await f.call('bets/read', { season: 2026, week: 12, ownerId: OTHER })).status, 400);
});
