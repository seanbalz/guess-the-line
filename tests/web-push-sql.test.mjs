import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { handlePush, providerPushError } from '../cloud/push.mjs';
import { createPushReminderHandler } from '../cloud/push-reminders.mjs';
import { b64uEncode } from '../cloud/web-push.mjs';

// Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MIGRATIONS = [
  '20261008164249_gtl_private_cloud_state.sql',
  '20261008174007_gtl_profiles_private_games_invites.sql',
  '20261008182836_gtl_canonical_weekly_entries.sql',
  '20261008185738_gtl_manual_odds_collection.sql',
  '20261008192528_gtl_scoped_spread_benchmark.sql',
  '20261008200926_gtl_twelve_hour_odds_refresh.sql',
  '20261009005145_gtl_social_bet_tracker.sql',
  '20261009120000_gtl_community_feed.sql',
  '20261009130000_gtl_league_interest.sql',
  '20261009140000_gtl_d23_data_rule.sql',
  '20261009150000_gtl_auto_open_week.sql',
  '20261013030000_gtl_web_push_reminders.sql',
];
const SEAN = 30, TROY = 1, BEN = 2, NEW = 3, AMY = 4;
const TABLES = ['gtl_push_subscriptions', 'gtl_push_reminders_sent', 'gtl_push_reminder_schedule', 'gtl_push_reminder_runs'];
const FUNCTIONS = ['gtl_push_subscribe(uuid,text,text,text)', 'gtl_push_unsubscribe(uuid,text)', 'gtl_push_status(uuid,text)', 'gtl_dispatch_push_reminders()',
  'gtl_claim_push_reminders(text,uuid)', 'gtl_mark_push_reminder(uuid,uuid,uuid,integer,integer,text[])', 'gtl_record_push_delivery(uuid,uuid,text,text)', 'gtl_complete_push_reminders(uuid,uuid,text,integer,integer)'];
const endpoint = n => `https://fcm.googleapis.com/fcm/send/device-${n}`;

async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  for (const file of MIGRATIONS) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file === MIGRATIONS[0]) {
      await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', seed()]);
      for (const n of [SEAN, TROY, BEN, NEW, AMY]) await db.query('insert into auth.users values($1)', [id(n)]);
      await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner')", [id(SEAN)]);
    }
    if (file === MIGRATIONS[1]) await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Sean'),($2,'Troy'),($3,'Ben'),($4,'Amy')", [id(SEAN), id(TROY), id(BEN), id(AMY)]);
  }
  // Local-only pg_net double, as in the week-open tests.
  await db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';");
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const rpc = async (name, args) => (await as('service_role', `select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value;
  const service = { rpc: async (name, args) => { try { return await rpc(name, args); } catch (error) { throw providerPushError(error.message); } } };
  return { db, as, rpc, service };
}
// PostgREST answers a call to a function the applied migrations lack with 404/PGRST202; PGlite's error for it gets the same code (P-02 is not in this file's list).
const missingAsPostgrest = rpc => (name, args) => rpc(name, args).catch(error => { throw /function .* does not exist/.test(error.message) ? Object.assign(error, { code: 'PGRST202' }) : error; });
async function deviceKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { p256dh: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), auth: b64uEncode(crypto.getRandomValues(new Uint8Array(16))) };
}

test('push tables and RPCs are service-only, invoker and append-only where they must be', { skip }, async t => {
  const f = await fixture(t);
  for (const table of TABLES) {
    assert.equal((await f.db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true, table);
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(() => f.as(role, `select * from public.${table}`), /permission denied/);
      await assert.rejects(() => f.as(role, `delete from public.${table}`), /permission denied/);
    }
  }
  for (const role of ['anon', 'authenticated']) for (const signature of FUNCTIONS) {
    assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${signature}`);
  }
  assert.equal((await f.db.query("select has_function_privilege('service_role','public.gtl_dispatch_push_reminders()','EXECUTE') ok")).rows[0].ok, false, 'only cron (postgres) dispatches');
  const flags = (await f.db.query("select prosecdef from pg_proc where proname like 'gtl_%push%'")).rows;
  assert.equal(flags.length, 8); assert(flags.every(row => row.prosecdef === false), 'every function is security invoker');
  const grants = async table => (await f.db.query("select privilege_type from information_schema.role_table_grants where table_name=$1 and grantee='service_role' order by 1", [table])).rows.map(r => r.privilege_type);
  assert.deepEqual(await grants('gtl_push_reminders_sent'), ['INSERT', 'SELECT'], 'the sent log has no update or delete');
  assert.deepEqual(await grants('gtl_push_reminder_schedule'), ['SELECT'], 'service callers cannot enable the schedule');
  await assert.rejects(() => f.as('service_role', "update public.gtl_push_reminder_runs set capability_hash=repeat('f',64)"), /permission denied/);
});

test('subscribe, move, limit, status and unsubscribe through the gtl-api handler', { skip }, async t => {
  const f = await fixture(t), keys = await deviceKeys(), publicKey = `B${'Q'.repeat(86)}`;
  const call = (n, route, body) => handlePush({ route, body, user: { id: id(n) }, service: f.service, publicKey });
  await assert.rejects(() => call(NEW, '/push/subscribe', { endpoint: endpoint(1), keys }), error => error.status === 403, 'no profile, no community, no reminders');
  assert.deepEqual(await call(TROY, '/push/subscribe', { endpoint: endpoint(1), keys }), { subscribed: true, devices: 1 });
  assert.deepEqual(await call(TROY, '/push/subscribe', { endpoint: endpoint(1), keys }), { subscribed: true, devices: 1 }, 'idempotent');
  assert.deepEqual(await call(TROY, '/push/status', { endpoint: endpoint(1) }), { configured: true, publicKey, subscribed: true, devices: 1 });
  assert.deepEqual(await call(BEN, '/push/status', { endpoint: endpoint(1) }), { configured: true, publicKey, subscribed: false, devices: 0 });
  // The same browser signing in as someone else moves the device; it is never shared.
  assert.deepEqual(await call(BEN, '/push/subscribe', { endpoint: endpoint(1), keys }), { subscribed: true, devices: 1 });
  assert.equal((await call(TROY, '/push/status', {})).devices, 0);
  for (let n = 2; n <= 10; n++) await call(BEN, '/push/subscribe', { endpoint: endpoint(n), keys });
  await assert.rejects(() => call(BEN, '/push/subscribe', { endpoint: endpoint(11), keys }), error => error.status === 409, 'ten devices at most');
  // The database repeats the host and key checks for any other writer.
  await assert.rejects(() => f.rpc('gtl_push_subscribe', { p_user: id(TROY), p_endpoint: 'https://collector.example.com/fcm/send/x', p_p256dh: keys.p256dh, p_auth: keys.auth }), /GTL_PUSH_INVALID/);
  await assert.rejects(() => f.rpc('gtl_push_subscribe', { p_user: id(TROY), p_endpoint: endpoint(20), p_p256dh: 'B', p_auth: keys.auth }), /GTL_PUSH_INVALID/);
  assert.deepEqual(await call(BEN, '/push/unsubscribe', { endpoint: endpoint(10) }), { subscribed: false, removed: true, devices: 9 });
  assert.deepEqual(await call(TROY, '/push/unsubscribe', { endpoint: endpoint(9) }), { subscribed: false, removed: false, devices: 0 }, 'cannot remove another player’s device');
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_push_subscriptions where endpoint=$1', [endpoint(10)])).rows[0].n, 0, 'turning off deletes the row');
});

test('dispatch, claim, mark-once, delivery outcomes and completion with a real-clock window', { skip }, async t => {
  const f = await fixture(t), publicKey = `B${'Q'.repeat(86)}`;
  const now = Date.now(), deadline = new Date(now + 90 * 60_000);
  await f.db.query("insert into public.gtl_weekly_slates(season,week,signature) values(2026,20,jsonb_build_object('season',2026,'week',20,'deadline',extract(epoch from $1::timestamptz),'games','[]'::jsonb))", [deadline.toISOString()]);
  const devices = { [TROY]: await deviceKeys(), [BEN]: await deviceKeys(), [SEAN]: await deviceKeys(), [AMY]: await deviceKeys() };
  for (const n of [TROY, BEN, SEAN, AMY]) await handlePush({ route: '/push/subscribe', body: { endpoint: endpoint(n), keys: devices[n] }, user: { id: id(n) }, service: f.service, publicKey });
  // Troy: nothing submitted. Ben: Spread submitted, Total sat out. Sean: Spread draft only. Amy: removed from the community.
  for (const n of [BEN, SEAN]) await f.db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,20)', [id(n)]);
  await f.db.query("insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,2026,20,'guess_spread',$2)", [id(BEN), { picks: {}, submittedAt: new Date(now - 60_000).toISOString() }]);
  await f.db.query("insert into public.gtl_weekly_optouts(user_id,season,week,mode) values($1,2026,20,'guess_total')", [id(BEN)]);
  await f.db.query("insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,2026,20,'guess_spread',$2)", [id(SEAN), { picks: {} }]);
  await f.db.query('insert into public.gtl_community_removals(user_id,removed_by) values($1,$2)', [id(AMY), id(SEAN)]);

  const dispatch = async () => (await f.db.query('select public.gtl_dispatch_push_reminders() value')).rows[0].value;
  assert.deepEqual(await dispatch(), { status: 'disabled' }, 'no schedule row yet');
  await f.db.query("insert into public.gtl_push_reminder_schedule(id,enabled,endpoint) values('deadline-2h',false,'https://example.supabase.co/functions/v1/gtl-push-reminders')");
  assert.deepEqual(await dispatch(), { status: 'disabled' }, 'disabled by default');
  await f.db.query("update public.gtl_push_reminder_schedule set enabled=true");
  const queued = await dispatch();
  assert.equal(queued.status, 'queued');
  assert.deepEqual(await dispatch(), { status: 'already_dispatched' }, 'one run per 15-minute slot');
  const token = (await f.db.query("select headers->>'Authorization' auth from net.outbox order by id desc limit 1")).rows[0].auth.slice(7);
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.notEqual((await f.db.query('select capability_hash from public.gtl_push_reminder_runs')).rows[0].capability_hash, token, 'only the hash is stored');
  await assert.rejects(() => f.rpc('gtl_claim_push_reminders', { p_token: 'b'.repeat(64), p_run: queued.runId }), /GTL_SCHEDULE_AUTH/);

  // The real worker against the real SQL, with a fake push service.
  const sends = [];
  const vapidPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const vapid = { publicKey: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', vapidPair.publicKey))), privateKey: (await crypto.subtle.exportKey('jwk', vapidPair.privateKey)).d, subject: 'mailto:reminders@example.test' };
  const fetchImpl = async url => { sends.push(url); return new Response(null, { status: url === endpoint(SEAN) ? 410 : 201 }); };
  // This file's migration list has no Points functions, so the Points pass skips with its one warning (P-02); the counts go to info.
  const warn = t.mock.method(console, 'warn', () => {}); t.mock.method(console, 'info', () => {});
  const handler = createPushReminderHandler({ service: { rpc: missingAsPostgrest(f.rpc) }, vapid, fetchImpl, clock: () => now });
  const request = () => handler(new Request('https://example.supabase.co/functions/v1/gtl-push-reminders', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ runId: queued.runId }) }));
  const result = await (await request()).json();
  assert.deepEqual(result, { runId: queued.runId, status: 'succeeded', reason: null, sent: 1, failed: 1 });
  assert.deepEqual(warn.mock.calls.map(call => call.arguments), [['Points reminders skipped: candidates function unavailable']]);
  assert.deepEqual(sends.sort(), [endpoint(TROY), endpoint(SEAN)].sort(), 'Ben is done or sat out; Amy was removed');
  const sent = (await f.db.query("select user_id,mode from public.gtl_push_reminders_sent order by user_id,mode")).rows.map(r => [r.user_id, r.mode]);
  assert.deepEqual(sent, [[id(TROY), 'guess_spread'], [id(TROY), 'guess_total'], [id(SEAN), 'guess_spread'], [id(SEAN), 'guess_total']].sort());
  assert.equal((await f.db.query('select count(*)::int n from public.gtl_push_subscriptions where endpoint=$1', [endpoint(SEAN)])).rows[0].n, 0, 'a 410 removes the subscription');
  assert.ok((await f.db.query('select last_success_at from public.gtl_push_subscriptions where endpoint=$1', [endpoint(TROY)])).rows[0].last_success_at);
  assert.deepEqual(await (await request()).json(), result, 'a replayed capability returns the recorded result and sends nothing');
  assert.equal(sends.length, 2);
  await assert.rejects(() => f.as('service_role', 'delete from public.gtl_push_reminders_sent'), /permission denied/);

  // A later run in the same window: the sent log stops a second push.
  await f.db.exec('delete from public.gtl_push_reminder_runs');
  const again = await dispatch();
  const token2 = (await f.db.query("select headers->>'Authorization' auth from net.outbox order by id desc limit 1")).rows[0].auth.slice(7);
  const claim = await f.rpc('gtl_claim_push_reminders', { p_token: token2, p_run: again.runId });
  assert.equal(claim.replay, false);
  const troy = claim.players.find(p => p.userId === id(TROY));
  assert.deepEqual(troy.reminded, ['guess_spread', 'guess_total']);
  assert.deepEqual(Object.keys(troy).sort(), ['reminded', 'satOut', 'submitted', 'subscriptions', 'userId'], 'the claim carries no picks or lines');
  assert.equal(claim.players.some(p => p.userId === id(AMY)), false);
  assert.deepEqual(claim.players.find(p => p.userId === id(BEN)), { userId: id(BEN), submitted: ['guess_spread'], satOut: ['guess_total'], reminded: [], subscriptions: [{ endpoint: endpoint(BEN), ...devices[BEN] }] });
  assert.deepEqual(await f.rpc('gtl_mark_push_reminder', { p_run: again.runId, p_claim: claim.claim, p_user: id(TROY), p_season: 2026, p_week: 20, p_modes: ['guess_spread', 'guess_total'] }), { modes: [] });
  await assert.rejects(() => f.rpc('gtl_mark_push_reminder', { p_run: again.runId, p_claim: id(999), p_user: id(TROY), p_season: 2026, p_week: 20, p_modes: ['guess_spread'] }), /GTL_SCHEDULE_RUN/);
  await assert.rejects(() => f.rpc('gtl_mark_push_reminder', { p_run: again.runId, p_claim: claim.claim, p_user: id(TROY), p_season: 2026, p_week: 20, p_modes: ['challenge'] }), /GTL_SCHEDULE_RUN/);
  // Five failed deliveries in a row disable a device without deleting it.
  for (let i = 0; i < 5; i++) await f.rpc('gtl_record_push_delivery', { p_run: again.runId, p_claim: claim.claim, p_endpoint: endpoint(BEN), p_outcome: 'failed' });
  const ben = (await f.db.query('select failure_count,disabled_at from public.gtl_push_subscriptions where endpoint=$1', [endpoint(BEN)])).rows[0];
  assert.equal(ben.failure_count, 5); assert.ok(ben.disabled_at);
  assert.deepEqual(await f.rpc('gtl_complete_push_reminders', { p_run: again.runId, p_claim: claim.claim, p_reason: 'nothing_due', p_sent: 0, p_failed: 0 }), { runId: again.runId, status: 'skipped', reason: 'nothing_due', sent: 0, failed: 0 });
  await assert.rejects(() => f.rpc('gtl_record_push_delivery', { p_run: again.runId, p_claim: claim.claim, p_endpoint: endpoint(TROY), p_outcome: 'ok' }), /GTL_SCHEDULE_RUN/, 'a finished run cannot write');

  // Outside the window (deadline passed) the dispatcher writes nothing and calls nothing.
  await f.db.query("update public.gtl_weekly_slates set signature=jsonb_set(signature,'{deadline}',to_jsonb(extract(epoch from now()-interval '1 minute'))) where week=20");
  const outbox = (await f.db.query('select count(*)::int n from net.outbox')).rows[0].n;
  assert.deepEqual(await dispatch(), { status: 'not_due' });
  assert.equal((await f.db.query('select count(*)::int n from net.outbox')).rows[0].n, outbox);
});
