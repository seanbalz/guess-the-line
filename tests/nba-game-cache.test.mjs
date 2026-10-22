import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRELUDE } from './migrations.mjs';
import { createNbaGamesCache, createNbaGamesService } from '../cloud/nba-games.mjs';
const { PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js');
const file = '20261021223100_gtl_nba_game_cache.sql';
async function setup(t) {
  assert.ok(fs.existsSync(`supabase/migrations/${file}`), 'NBA game cache migration exists');
  const db = new PGlite(); t.after(() => db.close()); await db.exec(PRELUDE);
  await db.exec(fs.readFileSync('supabase/migrations/20261021201054_gtl_private_nba_storage.sql', 'utf8'));
  await db.exec('alter default privileges grant all on tables to anon,authenticated,service_role;');
  await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  const read = async (date = '2026-10-21', refresh = true) => (await db.query('select public.gtl_nba_claim_games($1,$2) result', [date, refresh])).rows[0].result;
  const publish = async (token, games = [], date = '2026-10-21') => (await db.query('select public.gtl_nba_finish_games($1,$2,$3) result', [date, token, games])).rows[0].result;
  const expire = () => db.exec("update nba_private.game_provider set cooldown_until=now()-interval '1 second',lease_until=now()-interval '1 second';");
  return { db, read, publish, expire };
}
test('global claim limits independent instances/dates, TTL survives reloads, and only current live holder publishes', async t => {
  const { db, read, publish, expire } = await setup(t);
  const first = await read(); assert.ok(first.leaseToken); assert.equal(first.games, null);
  const limits = (await db.query('select extract(epoch from cooldown_until-leased_at)::int cooldown,extract(epoch from lease_until-leased_at)::int lease from nba_private.game_provider')).rows[0];
  assert.deepEqual(limits, { cooldown: 35, lease: 15 });
  assert.equal((await read()).leaseToken, null); assert.equal((await read('2026-10-22')).leaseToken, null);
  assert.equal(await publish(first.leaseToken, [], '2026-10-22'), false);
  assert.equal(await publish(first.leaseToken), true);
  assert.equal((await read()).leaseToken, null); assert.deepEqual((await read()).games, []);
  await expire(); assert.equal((await read()).leaseToken, null, 'TTL remains despite cooldown expiry');
  await db.exec("update nba_private.game_cache set observed_at=now()-interval '6 minutes'");
  const second = await read(); assert.ok(second.leaseToken);
  await expire(); const third = await read(); assert.ok(third.leaseToken); assert.notEqual(second.leaseToken, third.leaseToken);
  assert.equal(await publish(second.leaseToken), false); assert.equal(await publish(third.leaseToken), true);
});
test('failures retain complete snapshots, read-only configuration takes no lease, rollback retains rows and stops RPCs', async t => {
  const { db, read, publish, expire } = await setup(t);
  assert.equal((await read('2026-10-21', false)).leaseToken, null);
  let lease = await read(); await publish(lease.leaseToken);
  const original = (await read()).observedAt;
  await db.exec("update nba_private.game_cache set observed_at=now()-interval '6 minutes'"); await expire();
  lease = await read(); assert.equal(await publish(lease.leaseToken, null), false);
  assert.deepEqual((await read()).games, []); assert.notEqual((await read()).observedAt, original);
  assert.equal((await read()).leaseToken, null, 'failure retains global cooldown');
  await db.exec(fs.readFileSync(`supabase/rollback/${file}`, 'utf8'));
  assert.equal((await db.query('select count(*)::int n from nba_private.game_cache')).rows[0].n, 1);
  await db.exec('set role service_role'); await assert.rejects(read(), /permission denied/);
});
test('cache RPCs use fixed definer paths and grant no client/table access despite default grants', async t => {
  const { db, read, publish } = await setup(t);
  const signatures = ['gtl_nba_claim_games(date,boolean)', 'gtl_nba_finish_games(date,uuid,jsonb)'];
  for (const signature of signatures) {
    const row = (await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [`public.${signature}`])).rows[0];
    assert.deepEqual(row, { prosecdef: true, proconfig: ['search_path=pg_catalog'] });
    for (const role of ['anon', 'authenticated', 'service_role']) assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') allowed', [role, `public.${signature}`])).rows[0].allowed, role === 'service_role');
  }
  for (const role of ['anon', 'authenticated', 'service_role']) for (const table of ['game_cache', 'game_provider']) {
    assert.equal((await db.query('select has_table_privilege($1,$2,\'select,insert,update,delete\') allowed', [role, `nba_private.${table}`])).rows[0].allowed, false);
  }
  await assert.rejects(read(null), /GTL_NBA_INVALID/);
  const lease = await read(); await assert.rejects(publish(lease.leaseToken, {}), /GTL_NBA_INVALID/);
  assert.equal((await read()).leaseToken, null);
});

test('newer cache observations cannot be replaced or reported as a successful stale publication', async t => {
  const { db, read, publish } = await setup(t);
  const lease = await read();
  await db.query("insert into nba_private.game_cache values ('2026-10-21','[]',now()+interval '1 minute')");
  assert.equal(await publish(lease.leaseToken), false);
  assert.ok(Date.parse((await read()).observedAt) > Date.parse(lease.leasedAt));
});

test('independent service instances share a real SQL lease and cached empty slate without duplicate provider calls', async t => {
  const { db } = await setup(t); let calls = 0;
  const rpc = async (name, params) => (await db.query(`select public.${name}(${Object.keys(params).map((_, i) => `$${i + 1}`).join(',')}) result`, Object.values(params))).rows[0].result;
  const options = { apiKey: 'synthetic-key', cache: createNbaGamesCache({ rpc }), fetchImpl: async () => {
    calls++; return Response.json({ data: [], meta: { next_cursor: null } });
  } };
  const request = { date: '2026-10-21', timeZone: 'America/Los_Angeles' };
  const [first, other] = await Promise.all([createNbaGamesService(options).read(request), createNbaGamesService(options).read(request)]);
  assert.equal(calls, 1); assert.equal(first.unavailable, false); assert.deepEqual(first.games, []);
  assert.equal(other.unavailable, true, 'concurrent caller cannot claim an unobserved empty slate is successful');
  const cached = await createNbaGamesService(options).read(request);
  assert.equal(cached.unavailable, false); assert.equal(cached.stale, false); assert.equal(calls, 1);
  assert.ok(!JSON.stringify(cached).includes('leaseToken'));
});
