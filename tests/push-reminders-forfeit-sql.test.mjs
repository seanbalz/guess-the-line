import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, id as fixtureId, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { handlePush, providerPushError } from '../cloud/push.mjs';
import { createPushReminderHandler } from '../cloud/push-reminders.mjs';
import { b64uEncode } from '../cloud/web-push.mjs';
import { weekOpenAt } from '../shared/nfl-schedule.mjs';
import { serviceSql } from './helpers/guess-week.mjs';

// Redesign build plan stage 19 (M-03): a skip or "See picks now" writes the same D-23 opt-out rows as the old "Sit out this
// week", so the D-28 deadline reminder (20261013030000_gtl_web_push_reminders.sql) never reminds a player about a market a
// forfeit sat out, and still reminds about one nobody sat out. The push file is in ALL, so this always runs where PGlite is
// installed. Real migrations, the real claim SQL and the real reminder worker with a fake push service; the reminder window
// uses the database's real clock, so the fixture week's deadline is 90 minutes from now. Fixture accounts and values only.
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const MODES = ['guess_spread', 'guess_total'];
const DANA = { id: fixtureId(4), name: 'Dana Fixture' };
const endpoint = who => `https://fcm.googleapis.com/fcm/send/device-${who}`;
async function deviceKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { p256dh: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), auth: b64uEncode(crypto.getRandomValues(new Uint8Array(16))) };
}
/** A deadline inside the reminder window (90 minutes from now) that stays in this Pacific week (D-24: weeks open Monday 00:00 PT). */
function windowDeadline(now) {
  const deadline = now + 90 * 60_000, opens = Date.parse(weekOpenAt(deadline));
  return opens <= now ? deadline : opens - 60_000 > now + 60_000 ? opens - 60_000 : null;
}

test('a forfeit\'s sit-outs stop the deadline reminder for those markets; a market nobody sat out is still reminded', { skip }, async t => {
  const started = Date.now(), deadlineAt = windowDeadline(started);
  if (deadlineAt === null) { t.skip('within two minutes of the Pacific week boundary; rerun'); return; }
  const world = await createCommunityWorld({ migrations: ALL, games: 3, troyBallots: false, deadline: new Date(deadlineAt).toISOString() });
  t.after(() => world.db.close());
  const { db, state } = world, { season, week } = state.league, sql = serviceSql(db);
  const uid = who => (who === 'dana' ? DANA.id : ACCOUNTS[who].id);
  await db.query('insert into auth.users values($1)', [DANA.id]);
  await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [DANA.id, DANA.name]);
  // Local-only pg_net double, as in tests/web-push-sql.test.mjs.
  await db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';");
  const publicKey = `B${'Q'.repeat(86)}`, devices = {};
  const service = { rpc: async (name, args) => { try { return await sql(name, args); } catch (error) { throw providerPushError(error.message); } } };
  for (const who of ['luke', 'troy', 'sean', 'dana']) {
    devices[who] = await deviceKeys();
    await handlePush({ route: '/push/subscribe', body: { endpoint: endpoint(who), keys: devices[who] }, user: { id: uid(who) }, service, publicKey });
  }
  // Dana sent Spread earlier (stored directly: this fixture tests the reminder, not the ballot path).
  await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3)', [DANA.id, season, week]);
  await db.transaction(async tx => {
    await tx.exec('set local session_replication_role = replica');
    await tx.query("insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,$2,$3,'guess_spread',$4)", [DANA.id, season, week, { picks: {}, submittedAt: new Date(started - 60_000).toISOString() }]);
  });
  const now = () => new Date().toISOString();
  // Troy skips (both markets). Luke sits out Spread the old way, then "See picks now" takes Total. Dana's reveal takes Total
  // only; her sent Spread keeps counting. Sean does nothing.
  assert.deepEqual((await sql('gtl_forfeit_guess_week', { p_user: uid('troy'), p_season: season, p_week: week, p_reason: 'skip', p_now: now() })).modes, MODES);
  await sql('gtl_sit_out_week', { p_user: uid('luke'), p_season: season, p_week: week, p_mode: 'guess_spread', p_now: now() });
  assert.deepEqual((await sql('gtl_forfeit_guess_week', { p_user: uid('luke'), p_season: season, p_week: week, p_reason: 'reveal', p_now: now() })).modes, ['guess_total']);
  assert.deepEqual((await sql('gtl_forfeit_guess_week', { p_user: uid('dana'), p_season: season, p_week: week, p_reason: 'reveal', p_now: now() })).modes, ['guess_total']);

  await db.query("insert into public.gtl_push_reminder_schedule(id,enabled,endpoint) values('deadline-2h',true,'https://example.supabase.co/functions/v1/gtl-push-reminders')");
  const queued = (await db.query('select public.gtl_dispatch_push_reminders() value')).rows[0].value;
  assert.equal(queued.status, 'queued', JSON.stringify(queued));
  const token = (await db.query("select headers->>'Authorization' auth from net.outbox order by id desc limit 1")).rows[0].auth.slice(7);
  const sends = [];
  const vapidPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const vapid = { publicKey: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', vapidPair.publicKey))), privateKey: (await crypto.subtle.exportKey('jwk', vapidPair.privateKey)).d, subject: 'mailto:reminders@example.test' };
  t.mock.method(console, 'info', () => {}); // the worker's per-pass count lines (P-02)
  const handler = createPushReminderHandler({ service: { rpc: sql }, vapid, fetchImpl: async url => { sends.push(String(url)); return new Response(null, { status: 201 }); } });
  const response = await handler(new Request('https://example.supabase.co/functions/v1/gtl-push-reminders', { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ runId: queued.runId }) }));
  assert.deepEqual(await response.json(), { runId: queued.runId, status: 'succeeded', reason: null, sent: 1, failed: 0 });
  assert.deepEqual(sends, [endpoint('sean')], 'only Sean, who sat nothing out and sent nothing');
  const reminded = (await db.query('select user_id,mode from public.gtl_push_reminders_sent order by user_id,mode')).rows.map(r => [r.user_id, r.mode]);
  assert.deepEqual(reminded, MODES.map(mode => [uid('sean'), mode]));
  // What the claim saw: each forfeit's markets as sat out, beside the old sit-out and Dana's sent Spread.
  const optOuts = async who => (await db.query('select mode from public.gtl_weekly_optouts where user_id=$1 and season=$2 and week=$3 order by mode', [uid(who), season, week])).rows.map(r => r.mode);
  assert.deepEqual([await optOuts('troy'), await optOuts('luke'), await optOuts('dana'), await optOuts('sean')], [MODES, MODES, ['guess_total'], []]);
});
