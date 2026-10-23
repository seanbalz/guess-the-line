import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planReminders, reminderPayload, pointsReminderPayload, pacificClock, createPushReminderHandler, createPushReminderAdapter } from '../cloud/push-reminders.mjs';
import { handlePush, providerPushError, PUSH_METHODS } from '../cloud/push.mjs';
import { b64uDecode, b64uEncode, encryptPayload, importVapid, validPushEndpoint, vapidAuthorization, sendWebPush } from '../cloud/web-push.mjs';
import { createCloudHandler } from '../cloud/handler.mjs';
import { weekOpenAt } from '../shared/nfl-schedule.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const HOUR = 3_600_000;
// Week 6, 2026: TNF kickoff Thursday October 15, 5:15 PM PDT.
const DEADLINE = '2026-10-16T00:15:00.000Z';
const week = { season: 2026, week: 6, deadline: DEADLINE, openAt: weekOpenAt(DEADLINE) };
const sub = n => ({ endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`, p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) });
const player = (n, extra = {}) => ({ userId: id(n), submitted: [], satOut: [], reminded: [], subscriptions: [sub(n)], ...extra });
const inWindow = Date.parse(DEADLINE) - 90 * 60_000;
// gtl_complete_push_reminders as 20261013030000 writes it: a null reason succeeded, a safe no-op reason skipped, a named failure
// failed, anything else is refused (GTL_SCHEDULE_RUN).
const COMPLETION_STATUS = { no_week: 'skipped', not_open: 'skipped', closed: 'skipped', not_due_yet: 'skipped', nothing_due: 'skipped', vapid_unavailable: 'failed', send_failed: 'failed' };
const completes = args => {
  const status = args.p_reason === null ? 'succeeded' : COMPLETION_STATUS[args.p_reason];
  if (!status || !Number.isInteger(args.p_sent) || !Number.isInteger(args.p_failed)) throw Object.assign(new Error('GTL_SCHEDULE_RUN'), { code: 'GTL_SCHEDULE_RUN' });
  return { runId: args.p_run, status, reason: args.p_reason, sent: args.p_sent, failed: args.p_failed };
};

test('due-player selection: incomplete, submitted, sat out, already reminded, no device', () => {
  const plan = planReminders({ week, players: [
    player(1),
    player(2, { submitted: ['guess_spread'] }),
    player(3, { satOut: ['guess_total'] }),
    player(4, { submitted: ['guess_spread'], satOut: ['guess_total'] }),
    player(5, { reminded: ['guess_spread', 'guess_total'] }),
    player(6, { reminded: ['guess_spread'] }),
    player(7, { subscriptions: [] }),
    player(8, { submitted: ['guess_spread', 'guess_total'] }),
  ] }, inWindow);
  assert.equal(plan.reason, null);
  assert.deepEqual(plan.due.map(p => [p.userId, p.modes]), [
    [id(1), ['guess_spread', 'guess_total']], [id(2), ['guess_total']], [id(3), ['guess_spread']], [id(6), ['guess_total']],
  ]);
  assert.equal(plan.week, 6); assert.equal(plan.deadline, DEADLINE);
});

test('due-player selection: no week, not open, more than two hours out, closed, nothing due', () => {
  const players = [player(1)];
  assert.equal(planReminders({ week: null, players }, inWindow).reason, 'no_week');
  assert.equal(planReminders({ week: { ...week, deadline: 'soon' }, players }, inWindow).reason, 'no_week');
  // A week whose Monday 00:00 PT open is still ahead is never reminded, even inside its last two hours (an early fallback slate is not open).
  assert.equal(planReminders({ week: { ...week, openAt: new Date(inWindow + HOUR).toISOString() }, players }, inWindow).reason, 'not_open');
  assert.equal(planReminders({ week, players }, Date.parse(DEADLINE) - 2 * HOUR - 1).reason, 'not_due_yet');
  assert.equal(planReminders({ week, players }, Date.parse(DEADLINE) - 2 * HOUR).reason, null, 'exactly two hours before is due');
  assert.equal(planReminders({ week, players }, Date.parse(DEADLINE)).reason, 'closed');
  assert.equal(planReminders({ week, players }, Date.parse(DEADLINE) + HOUR).reason, 'closed');
  assert.equal(planReminders({ week, players: [player(1, { submitted: ['guess_spread', 'guess_total'] })] }, inWindow).reason, 'nothing_due');
  assert.equal(planReminders({ week, players: [] }, inWindow).reason, 'nothing_due');
  // The open time falls back to the shared D-24 helper when the claim omits it.
  assert.equal(planReminders({ week: { season: 2026, week: 6, deadline: DEADLINE }, players }, inWindow).reason, null);
});

test('payload names the week, due time and modes only (D-39: "due", not "lock"): no pick, line, player or link', () => {
  assert.equal(pacificClock(DEADLINE), '5:15 PM');
  assert.equal(pacificClock('2026-11-13T01:15:00Z'), '5:15 PM', 'PST');
  const one = reminderPayload({ season: 2026, week: 6, deadline: DEADLINE, modes: ['guess_spread'] });
  assert.deepEqual(one, { title: 'Guess The Line', body: 'Week 6 picks are due 5:15 PM PT. Spread still open.', tag: 'gtl-deadline-2026-6' });
  assert.equal(reminderPayload({ season: 2026, week: 6, deadline: DEADLINE, modes: ['guess_total', 'guess_spread'] }).body, 'Week 6 picks are due 5:15 PM PT. Spread and Total still open.');
  assert.equal(reminderPayload({ season: 2026, week: 6, deadline: DEADLINE, modes: ['guess_total'] }).body, 'Week 6 picks are due 5:15 PM PT. Total still open.');
  assert.throws(() => reminderPayload({ season: 2026, week: 6, deadline: DEADLINE, modes: [] }));
  // Every field is fixed text plus the week, the due time and mode names: nothing else can carry a pick, a line or a player.
  for (const payload of [one, reminderPayload({ season: 2026, week: 18, deadline: '2027-01-09T21:30:00Z', modes: ['guess_spread', 'guess_total'] })]) {
    assert.deepEqual(Object.keys(payload), ['title', 'body', 'tag']);
    assert.match(payload.body, /^Week \d{1,2} picks are due \d{1,2}:\d{2} [AP]M PT\. (?:Spread|Total|Spread and Total) still open\.$/);
    assert.doesNotMatch(payload.body, /lock/i, 'D-39: the reminder says "due", never "lock"');
    assert.match(payload.tag, /^gtl-deadline-\d{4}-\d{1,2}$/);
    assert.doesNotMatch(JSON.stringify(payload), /[+−]\d|\d\.5|over|under|http|@/i, 'no signed number, half point, side, URL or address');
  }
});

test('push endpoint validation: https on a known push service only', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/abc:def', 'https://updates.push.services.mozilla.com/wpush/v2/gAAA', 'https://web.push.apple.com/QGx1', 'https://wns2-par02p.notify.windows.com/w/?token=abc']) assert.equal(validPushEndpoint(ok), true, ok);
  for (const bad of ['http://fcm.googleapis.com/fcm/send/abc', 'https://evil.example.com/fcm/send/abcdefgh', 'https://fcm.googleapis.com.evil.com/x/abcdef', 'https://user:pw@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc', `https://fcm.googleapis.com/${'a'.repeat(1100)}`, 'https://fcm.googleapis.com/fcm/send/abc#x', 'https://onmrgvcehkflfaizvedl.supabase.co/rest/v1/x', null, 42]) assert.equal(validPushEndpoint(bad), false, String(bad));
});

test('subscribe, status and unsubscribe validation and size limits', async () => {
  const calls = [], user = { id: id(1) };
  const service = { rpc: async (name, args) => { calls.push([name, args]); return name === 'gtl_push_status' ? { subscribed: true, devices: 1 } : name === 'gtl_push_subscribe' ? { subscribed: true, devices: 2 } : { removed: true, devices: 0 }; } };
  const publicKey = `B${'Q'.repeat(86)}`;
  const keys = { p256dh: `B${'x'.repeat(86)}`, auth: 'y'.repeat(22) };
  const endpoint = 'https://fcm.googleapis.com/fcm/send/device-1';
  assert.deepEqual(Object.keys(PUSH_METHODS).sort(), ['/push/status', '/push/subscribe', '/push/unsubscribe']);
  assert.deepEqual(await handlePush({ route: '/push/status', body: {}, user, service, publicKey }), { configured: true, publicKey, subscribed: true, devices: 1 });
  assert.deepEqual(calls.pop(), ['gtl_push_status', { p_user: id(1), p_endpoint: null }]);
  assert.deepEqual(await handlePush({ route: '/push/status', body: {}, user, service, publicKey: undefined }), { configured: false, publicKey: null, subscribed: true, devices: 1 });
  assert.deepEqual(await handlePush({ route: '/push/subscribe', body: { endpoint, expirationTime: null, keys }, user, service, publicKey }), { subscribed: true, devices: 2 });
  assert.deepEqual(calls.pop(), ['gtl_push_subscribe', { p_user: id(1), p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth }]);
  assert.deepEqual(await handlePush({ route: '/push/unsubscribe', body: { endpoint }, user, service, publicKey }), { subscribed: false, removed: true, devices: 0 });
  const rejects = async (route, body, status = 400, key = publicKey) => {
    const before = calls.length;
    await assert.rejects(() => handlePush({ route, body, user, service, publicKey: key }), error => error.status === status);
    assert.equal(calls.length, before, 'nothing reaches the database');
  };
  await rejects('/push/subscribe', { endpoint: 'http://fcm.googleapis.com/fcm/send/x', keys });
  await rejects('/push/subscribe', { endpoint: 'https://collector.example.com/fcm/send/x', keys });
  await rejects('/push/subscribe', { endpoint: `https://fcm.googleapis.com/${'a'.repeat(1100)}`, keys });
  await rejects('/push/subscribe', { endpoint, keys: { ...keys, p256dh: 'short' } });
  await rejects('/push/subscribe', { endpoint, keys: { ...keys, auth: 'z'.repeat(40) } });
  await rejects('/push/subscribe', { endpoint, keys: { ...keys, extra: 1 } });
  await rejects('/push/subscribe', { endpoint, keys, userId: id(2) });
  await rejects('/push/subscribe', { endpoint, keys, expirationTime: 'never' });
  await rejects('/push/subscribe', { endpoint, keys }, 503, null);
  await rejects('/push/unsubscribe', { endpoint: 'javascript:alert(1)' });
  await rejects('/push/unsubscribe', {});
  await rejects('/push/status', { endpoint: 'https://example.com/x/abcdefghijklmnopqrstuv' });
  await assert.rejects(() => handlePush({ route: '/push/status', body: {}, user: { id: 'not-a-uuid' }, service, publicKey }), error => error.status === 401);
  assert.equal(providerPushError('GTL_PUSH_LIMIT').status, 409);
  assert.equal(providerPushError('GTL_COMMUNITY_MEMBER').status, 403);
  assert.equal(providerPushError('anything else').status, undefined, 'unknown provider errors stay generic (503 in the handler)');
});

test('gtl-api push routes require a verified sign-in and confirmed email', async () => {
  const handler = createCloudHandler({ authenticate: async token => (token === 'good' ? { id: id(1), email: 'fixture@example.test', emailConfirmed: true } : null),
    push: { rpc: async () => ({ subscribed: false, devices: 0 }) }, pushPublicKey: `B${'Q'.repeat(86)}` });
  const call = (headers, body = {}) => handler(new Request('https://x.supabase.co/functions/v1/gtl-api/push/status', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
  assert.equal((await call({})).status, 401);
  assert.equal((await call({ authorization: 'Bearer bad' })).status, 401);
  const ok = await call({ authorization: 'Bearer good' });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).configured, true);
  const get = await handler(new Request('https://x.supabase.co/functions/v1/gtl-api/push/status', { headers: { authorization: 'Bearer good' } }));
  assert.equal(get.status, 405);
});

// ---- Receiving side of RFC 8291, written from the RFC for the test only. ----
async function subscriber() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, subscription: { p256dh: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), auth: b64uEncode(auth) } };
}
async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}
async function decrypt(body, { pair, subscription }) {
  const salt = body.slice(0, 16), rs = new DataView(body.buffer, body.byteOffset).getUint32(16), idlen = body[20], asPublic = body.slice(21, 21 + idlen), cipher = body.slice(21 + idlen);
  assert.equal(rs, 4096); assert.equal(idlen, 65);
  const uaPublic = b64uDecode(subscription.p256dh);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, pair.privateKey, 256));
  const info = new Uint8Array([...new TextEncoder().encode('WebPush: info\0'), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(b64uDecode(subscription.auth), shared, info, 32);
  const cek = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cipher));
  let end = plain.length - 1; while (plain[end] === 0) end--;
  assert.equal(plain[end], 2, 'last-record delimiter');
  return new TextDecoder().decode(plain.slice(0, end));
}
async function vapidPair() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { verify: pair.publicKey, publicKey: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), privateKey: jwk.d, subject: 'mailto:reminders@example.test' };
}

test('aes128gcm encryption round-trips through an independent RFC 8291 receiver', async () => {
  const device = await subscriber();
  for (const text of ['{}', JSON.stringify(reminderPayload({ season: 2026, week: 6, deadline: DEADLINE, modes: ['guess_spread'] }))]) {
    const body = await encryptPayload(text, device.subscription);
    assert.equal(await decrypt(body, device), text);
  }
  await assert.rejects(() => encryptPayload('x'.repeat(3001), device.subscription), /too large/);
  await assert.rejects(() => encryptPayload('{}', { p256dh: b64uEncode(new Uint8Array(65)), auth: b64uEncode(new Uint8Array(16)) }));
});

test('VAPID header: ES256 JWT for the push service origin, 12-hour expiry, verifiable with the public key', async () => {
  const keys = await vapidPair(), vapid = await importVapid(keys), now = Date.parse('2026-10-15T22:30:00Z');
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', vapid, now);
  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.equal(k, keys.publicKey);
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64uDecode(h))), { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64uDecode(c))), { aud: 'https://fcm.googleapis.com', exp: now / 1000 + 12 * 3600, sub: keys.subject });
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.verify, b64uDecode(s), new TextEncoder().encode(`${h}.${c}`)), true);
  for (const bad of [{ ...keys, subject: 'reminders@example.test' }, { ...keys, privateKey: 'abc' }, { ...keys, publicKey: undefined }, {}]) await assert.rejects(() => importVapid(bad));
});

test('sendWebPush maps 201 to ok, 404/410 to gone and anything else (or a timeout) to failed', async () => {
  const vapid = await importVapid(await vapidPair()), device = await subscriber();
  const subscription = { endpoint: 'https://web.push.apple.com/QGdevice', ...device.subscription };
  const seen = [];
  for (const [status, outcome] of [[201, 'ok'], [404, 'gone'], [410, 'gone'], [429, 'failed'], [500, 'failed']]) {
    const result = await sendWebPush({ subscription, payload: { title: 'Guess The Line', body: 'x', tag: 't' }, vapid, ttl: 5400,
      fetchImpl: async (url, init) => { seen.push(init.headers); return new Response(null, { status }); } });
    assert.equal(result.outcome, outcome, String(status));
  }
  assert.equal(seen[0].TTL, '5400'); assert.equal(seen[0]['Content-Encoding'], 'aes128gcm'); assert.equal(seen[0].Urgency, 'high');
  assert.equal((await sendWebPush({ subscription, payload: {}, vapid, ttl: 10, fetchImpl: async () => { throw new Error('timeout'); } })).outcome, 'failed');
  assert.equal((await sendWebPush({ subscription: { ...subscription, endpoint: 'https://evil.example.com/abcdefghijklmnopqrstuvwxyz' }, payload: {}, vapid, ttl: 10, fetchImpl: async () => { throw new Error('never called'); } })).outcome, 'gone');
});

test('reminder worker: claim, mark before send, encrypted spoiler-free payload, stale endpoints removed, counts recorded', async t => {
  t.mock.method(console, 'info', () => {}); // the worker's two count lines (asserted in the Points tests below)
  const keys = await vapidPair(), devices = [await subscriber(), await subscriber(), await subscriber()];
  const endpoints = ['https://fcm.googleapis.com/fcm/send/live', 'https://web.push.apple.com/QGgone', 'https://updates.push.services.mozilla.com/wpush/v2/err'];
  const calls = [], marked = new Set();
  // The claim carries extra private-looking fields to prove none reach the payload.
  const claim = { replay: false, runId: id(900), claim: id(901), week, players: [
    { userId: id(1), submitted: [], satOut: ['guess_total'], reminded: [], picks: { 'TB-DAL': -9.5 }, line: -7.5, subscriptions: [{ endpoint: endpoints[0], ...devices[0].subscription }, { endpoint: endpoints[1], ...devices[1].subscription }] },
    { userId: id(2), submitted: ['guess_spread', 'guess_total'], reminded: [], satOut: [], subscriptions: [{ endpoint: endpoints[2], ...devices[2].subscription }] },
    { userId: id(3), submitted: [], satOut: [], reminded: [], subscriptions: [{ endpoint: endpoints[2], ...devices[2].subscription }] },
  ] };
  const service = { rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === 'gtl_claim_push_reminders') return args.p_token === 'a'.repeat(64) ? claim : Promise.reject(Object.assign(new Error(), { code: 'GTL_SCHEDULE_AUTH' }));
    if (name === 'gtl_mark_push_reminder') { const fresh = args.p_modes.filter(m => !marked.has(`${args.p_user}:${m}`)); fresh.forEach(m => marked.add(`${args.p_user}:${m}`)); return { modes: fresh }; }
    if (name === 'gtl_points_reminder_candidates') return { players: [] };
    if (name === 'gtl_record_push_delivery') return { outcome: args.p_outcome };
    if (name === 'gtl_complete_push_reminders') return completes(args);
    throw new Error(name);
  } };
  const delivered = [];
  const fetchImpl = async (url, init) => {
    const device = devices[endpoints.indexOf(url)];
    delivered.push({ url, payload: JSON.parse(await decrypt(new Uint8Array(init.body), device)), headers: init.headers });
    return new Response(null, { status: url === endpoints[1] ? 410 : url === endpoints[2] ? 500 : 201 });
  };
  const handler = createPushReminderHandler({ service, vapid: keys, clock: () => inWindow, fetchImpl });
  const request = (token, body = { runId: id(900) }) => handler(new Request('https://x.supabase.co/functions/v1/gtl-push-reminders', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await request('b'.repeat(64))).status, 401);
  assert.equal((await handler(new Request('https://x.supabase.co/functions/v1/gtl-push-reminders', { method: 'POST' }))).status, 401);
  assert.equal((await request('a'.repeat(64), { runId: 'nope' })).status, 400);
  calls.length = 0;
  const response = await request('a'.repeat(64));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { runId: id(900), status: 'succeeded', reason: null, sent: 1, failed: 2 });
  const names = calls.map(([name]) => name);
  assert.deepEqual(names.slice(0, 2), ['gtl_claim_push_reminders', 'gtl_mark_push_reminder'], 'the reminder is recorded before any send');
  assert.deepEqual(calls.find(([name, a]) => name === 'gtl_mark_push_reminder' && a.p_user === id(1))[1].p_modes, ['guess_spread']);
  assert.equal(calls.some(([name, a]) => name === 'gtl_mark_push_reminder' && a.p_user === id(2)), false, 'a fully submitted player is never marked');
  assert.deepEqual(calls.filter(([name]) => name === 'gtl_record_push_delivery').map(([, a]) => [a.p_endpoint, a.p_outcome]).sort(),
    [[endpoints[0], 'ok'], [endpoints[1], 'gone'], [endpoints[2], 'failed']].sort());
  assert.equal(delivered.length, 3);
  for (const { payload, headers } of delivered) {
    assert.deepEqual(Object.keys(payload).sort(), ['body', 'tag', 'title']);
    assert.doesNotMatch(JSON.stringify(payload), /9\.5|7\.5|TB-DAL|http/);
    assert.match(headers.Authorization, /^vapid t=/);
    assert.equal(Number(headers.TTL), 5400, 'expires at the deadline');
  }
  assert.equal(delivered.find(d => d.url === endpoints[0]).payload.body, 'Week 6 picks are due 5:15 PM PT. Spread still open.');
  assert.equal(delivered.find(d => d.url === endpoints[2]).payload.body, 'Week 6 picks are due 5:15 PM PT. Spread and Total still open.');

  // A second run in the same window sends nothing: the marks already exist.
  delivered.length = 0; calls.length = 0;
  assert.deepEqual(await (await request('a'.repeat(64))).json(), { runId: id(900), status: 'succeeded', reason: null, sent: 0, failed: 0 });
  assert.equal(delivered.length, 0);
});

test('reminder worker: skips outside the window and fails closed without VAPID secrets', async t => {
  t.mock.method(console, 'info', () => {});
  const completes = [];
  const service = { rpc: async (name, args) => {
    if (name === 'gtl_claim_push_reminders') return { replay: false, runId: id(900), claim: id(901), week, players: [player(1)] };
    if (name === 'gtl_points_reminder_candidates') return { players: [] };
    if (name === 'gtl_complete_push_reminders') { completes.push(args.p_reason); return { runId: args.p_run, status: 'skipped', reason: args.p_reason, sent: 0, failed: 0 }; }
    throw new Error(`unexpected ${name}`);
  } };
  const goodKeys = await vapidPair();
  const run = async (clock, vapid = goodKeys) => (await createPushReminderHandler({ service, vapid, clock: () => clock, fetchImpl: async () => { throw new Error('no send'); } })(
    new Request('https://x.supabase.co/functions/v1/gtl-push-reminders', { method: 'POST', headers: { authorization: `Bearer ${'a'.repeat(64)}`, 'content-type': 'application/json' }, body: JSON.stringify({ runId: id(900) }) }))).json();
  await run(Date.parse(DEADLINE) - 3 * HOUR); await run(Date.parse(DEADLINE) + 1); await run(Date.parse(week.openAt) - 1);
  await run(inWindow, { publicKey: '', privateKey: '', subject: '' });
  assert.deepEqual(completes, ['not_due_yet', 'closed', 'not_open', 'vapid_unavailable']);
  const replay = await createPushReminderHandler({ service: { rpc: async () => ({ replay: true, runId: id(900), status: 'succeeded', reason: null, sent: 3, failed: 0 }) }, vapid: {} })(
    new Request('https://x.supabase.co/functions/v1/gtl-push-reminders', { method: 'POST', headers: { authorization: `Bearer ${'a'.repeat(64)}`, 'content-type': 'application/json' }, body: JSON.stringify({ runId: id(900) }) }));
  assert.deepEqual(await replay.json(), { runId: id(900), status: 'succeeded', reason: null, sent: 3, failed: 0 });
});

test('service worker handles push and notification clicks only; CSP names worker-src self', async () => {
  const sw = fs.readFileSync('web/public/sw.js', 'utf8');
  const listeners = [...sw.matchAll(/addEventListener\('([a-z]+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(listeners, ['activate', 'install', 'notificationclick', 'push']);
  assert.doesNotMatch(sw.replace(/\/\/.*$/gm, ''), /\bfetch\b|caches\.|importScripts|indexedDB|localStorage/, 'no fetch handler, no caches, no storage');
  assert.match(sw, /new URL\('\/#picks', self\.location\.origin\)/, 'a click opens the app at #picks');
  const headers = fs.readFileSync('web/public/_headers', 'utf8');
  assert.match(headers, /Content-Security-Policy: default-src 'self'; script-src 'self'; worker-src 'self';/);
  assert.match(headers, /\/sw\.js\n {2}Cache-Control: no-cache/);
  const { createServer } = await import('../server/index.mjs');
  const server = createServer({}, { dist: '/nonexistent-gtl-dist' }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'; worker-src 'self';/);
  } finally { server.close(); }
});

// P-02 (D-56): the one weekly Points reminder, sent after the Spread/Total pass of the same run.
test('pointsReminderPayload: week, count and the next lock time only (singular and plural)', () => {
  const next = '2026-11-01T18:00:00Z';
  assert.deepEqual(pointsReminderPayload({ season: 2026, week: 8, open: 3, nextKickoff: next }),
    { title: 'Guess The Line', body: 'Week 8 Points: 3 players still open. Next locks 10:00 AM PT.', tag: 'gtl-points-2026-8' });
  assert.equal(pointsReminderPayload({ season: 2026, week: 8, open: 1, nextKickoff: next }).body, 'Week 8 Points: 1 player still open. Next locks 10:00 AM PT.');
});

const POINTS_NOW = Date.parse('2026-11-01T16:30:00Z');
const POINTS_ENDPOINTS = ['https://fcm.googleapis.com/fcm/send/points-a', 'https://fcm.googleapis.com/fcm/send/points-b'];
const REQUEST = () => new Request('https://x.supabase.co/functions/v1/gtl-push-reminders',
  { method: 'POST', headers: { authorization: `Bearer ${'a'.repeat(64)}`, 'content-type': 'application/json' }, body: JSON.stringify({ runId: id(900) }) });
// A player the database returns, plus sentinel fields the worker must never copy into a payload.
const pointsPlayer = (n, subscription, extra = {}) => ({ userId: id(n), season: 2026, week: 8, open: 3, nextKickoff: '2026-11-01T18:00:00Z', subscriptions: [subscription],
  name: 'SENTINEL_NAME', guess: 'SENTINEL_GUESS_57', score: 'SENTINEL_SCORE_38.4', ...extra });

test('reminder worker: after the Spread/Total pass it asks for Points candidates, marks first and sends the spoiler-free payload', async t => {
  t.mock.method(console, 'info', () => {});
  const keys = await vapidPair(), devices = [await subscriber(), await subscriber()], calls = [], delivered = [], marked = new Set();
  const service = { rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === 'gtl_claim_push_reminders') return { replay: false, runId: id(900), claim: id(901), week, players: [] };
    if (name === 'gtl_points_reminder_candidates') return { players: [pointsPlayer(1, { endpoint: POINTS_ENDPOINTS[0], ...devices[0].subscription }), pointsPlayer(2, { endpoint: POINTS_ENDPOINTS[1], ...devices[1].subscription }, { open: 1 })] };
    if (name === 'gtl_mark_points_reminder') { const fresh = !marked.has(args.p_user); marked.add(args.p_user); return { recorded: fresh }; }
    if (name === 'gtl_record_push_delivery') return { outcome: args.p_outcome };
    if (name === 'gtl_complete_push_reminders') return completes(args);
    throw new Error(`unexpected ${name}`);
  } };
  const fetchImpl = async (url, init) => { delivered.push({ url, payload: JSON.parse(await decrypt(new Uint8Array(init.body), devices[POINTS_ENDPOINTS.indexOf(url)])), ttl: init.headers.TTL }); return new Response(null, { status: 201 }); };
  const response = await createPushReminderHandler({ service, vapid: keys, clock: () => POINTS_NOW, fetchImpl })(REQUEST());
  assert.equal(response.status, 200);
  // The Spread/Total week has nothing due (it is far from its deadline); the Points pass still ran and sent.
  assert.deepEqual(await response.json(), { runId: id(900), status: 'succeeded', reason: null, sent: 2, failed: 0 });
  const names = calls.map(([name]) => name), withoutDelivery = names.filter(n => n !== 'gtl_record_push_delivery');
  assert.deepEqual(withoutDelivery, ['gtl_claim_push_reminders', 'gtl_points_reminder_candidates', 'gtl_mark_points_reminder', 'gtl_mark_points_reminder', 'gtl_complete_push_reminders']);
  assert(names.indexOf('gtl_mark_points_reminder') < names.indexOf('gtl_record_push_delivery'), 'the reminder is recorded before any send');
  assert.deepEqual(calls.find(([name]) => name === 'gtl_points_reminder_candidates')[1], { p_run: id(900), p_claim: id(901), p_now: new Date(POINTS_NOW).toISOString() });
  assert.deepEqual(calls.find(([name]) => name === 'gtl_mark_points_reminder')[1], { p_run: id(900), p_claim: id(901), p_user: id(1), p_season: 2026, p_week: 8 });
  assert.equal(delivered.length, 2);
  assert.equal(delivered[0].payload.body, 'Week 8 Points: 3 players still open. Next locks 10:00 AM PT.');
  assert.equal(delivered[1].payload.body, 'Week 8 Points: 1 player still open. Next locks 10:00 AM PT.');
  for (const { payload, ttl } of delivered) {
    assert.deepEqual(Object.keys(payload).sort(), ['body', 'tag', 'title']);
    assert.doesNotMatch(JSON.stringify(payload), /SENTINEL|57|38\.4/, 'no player name, guess or score');
    assert.equal(payload.tag, 'gtl-points-2026-8');
    assert.equal(Number(ttl), 5400, 'expires when the next slot locks (90 minutes away)');
  }
});

test('reminder worker: a Points reminder the database says is already recorded is not sent again', async t => {
  t.mock.method(console, 'info', () => {});
  const device = await subscriber();
  const service = { rpc: async (name, args) => {
    if (name === 'gtl_claim_push_reminders') return { replay: false, runId: id(900), claim: id(901), week, players: [] };
    if (name === 'gtl_points_reminder_candidates') return { players: [pointsPlayer(1, { endpoint: POINTS_ENDPOINTS[0], ...device.subscription })] };
    if (name === 'gtl_mark_points_reminder') return { recorded: false };
    if (name === 'gtl_complete_push_reminders') return completes(args);
    throw new Error(`unexpected ${name}`);
  } };
  const response = await createPushReminderHandler({ service, vapid: await vapidPair(), clock: () => POINTS_NOW, fetchImpl: async () => { throw new Error('no send'); } })(REQUEST());
  // Nothing sent and nothing failed: the run is a safe no-op with the Spread/Total reason (the week's deadline has passed).
  assert.deepEqual(await response.json(), { runId: id(900), status: 'skipped', reason: 'closed', sent: 0, failed: 0 });
});

test('reminder worker: when the Points RPC is missing (PGRST202) the Points pass is skipped with one warning and the Spread/Total pass still completes', async t => {
  const warn = t.mock.method(console, 'warn', () => {}); t.mock.method(console, 'info', () => {});
  const keys = await vapidPair(), device = await subscriber(), calls = [], delivered = [];
  const service = { rpc: async (name, args) => {
    calls.push(name);
    if (name === 'gtl_claim_push_reminders') return { replay: false, runId: id(900), claim: id(901), week, players: [player(1, { subscriptions: [{ endpoint: POINTS_ENDPOINTS[0], ...device.subscription }] })] };
    if (name === 'gtl_points_reminder_candidates') throw Object.assign(new Error(), { code: 'PGRST202' });
    if (name === 'gtl_mark_push_reminder') return { modes: args.p_modes };
    if (name === 'gtl_record_push_delivery') return { outcome: args.p_outcome };
    if (name === 'gtl_complete_push_reminders') return completes(args);
    throw new Error(`unexpected ${name}`);
  } };
  const fetchImpl = async (url, init) => { delivered.push(JSON.parse(await decrypt(new Uint8Array(init.body), device))); return new Response(null, { status: 201 }); };
  const response = await createPushReminderHandler({ service, vapid: keys, clock: () => inWindow, fetchImpl })(REQUEST());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { runId: id(900), status: 'succeeded', reason: null, sent: 1, failed: 0 });
  assert.equal(delivered.length, 1); assert.equal(delivered[0].body, 'Week 6 picks are due 5:15 PM PT. Spread and Total still open.');
  assert(calls.includes('gtl_points_reminder_candidates')); assert.equal(calls.at(-1), 'gtl_complete_push_reminders');
  assert.deepEqual(warn.mock.calls.map(call => call.arguments), [['Points reminders skipped: candidates function unavailable']], 'one line, no player data');
});

test('reminder worker: a Points failure other than a missing function counts as failed and never stops the run from completing', async t => {
  t.mock.method(console, 'info', () => {});
  const service = { rpc: async (name, args) => {
    if (name === 'gtl_claim_push_reminders') return { replay: false, runId: id(900), claim: id(901), week, players: [] };
    if (name === 'gtl_points_reminder_candidates') throw Object.assign(new Error(), { code: 'UNAVAILABLE' });
    if (name === 'gtl_complete_push_reminders') return completes(args);
    throw new Error(`unexpected ${name}`);
  } };
  const response = await createPushReminderHandler({ service, vapid: await vapidPair(), clock: () => POINTS_NOW, fetchImpl: async () => { throw new Error('no send'); } })(REQUEST());
  assert.deepEqual(await response.json(), { runId: id(900), status: 'failed', reason: 'send_failed', sent: 0, failed: 1 });
});

test('reminder worker: the Points pass asks for candidates first and needs VAPID keys only to send; bad keys then fail the run before any mark', async t => {
  t.mock.method(console, 'info', () => {});
  const device = await subscriber(), calls = [];
  let candidates = [];
  const service = { rpc: async (name, args) => {
    calls.push(name);
    if (name === 'gtl_claim_push_reminders') return { replay: false, runId: id(900), claim: id(901), week, players: [] };
    if (name === 'gtl_points_reminder_candidates') return { players: candidates };
    if (name === 'gtl_complete_push_reminders') return completes(args);
    throw new Error(`unexpected ${name}`);
  } };
  const run = async () => (await createPushReminderHandler({ service, vapid: { publicKey: '', privateKey: '', subject: '' }, clock: () => POINTS_NOW,
    fetchImpl: async () => { throw new Error('no send'); } })(REQUEST())).json();
  // Nobody to remind: no keys are needed, so the run is the safe Spread/Total no-op it would have been without the Points pass.
  assert.deepEqual(await run(), { runId: id(900), status: 'skipped', reason: 'closed', sent: 0, failed: 0 });
  candidates = [pointsPlayer(1, { endpoint: POINTS_ENDPOINTS[0], ...device.subscription })];
  calls.length = 0;
  assert.deepEqual(await run(), { runId: id(900), status: 'failed', reason: 'vapid_unavailable', sent: 0, failed: 0 });
  assert.deepEqual(calls, ['gtl_claim_push_reminders', 'gtl_points_reminder_candidates', 'gtl_complete_push_reminders'], 'no mark without keys, so the week\'s one reminder is not used up');
});

test('reminder worker: a failure for one Points player keeps the counts already made, and the pass goes on to the next player', async t => {
  t.mock.method(console, 'info', () => {});
  const keys = await vapidPair(), devices = [await subscriber(), await subscriber(), await subscriber()], sends = [], marks = [];
  const endpoints = ['a', 'b', 'c'].map(n => `https://fcm.googleapis.com/fcm/send/points-${n}`);
  const unavailable = () => Object.assign(new Error(), { code: 'UNAVAILABLE' });
  const service = { rpc: async (name, args) => {
    if (name === 'gtl_claim_push_reminders') return { replay: false, runId: id(900), claim: id(901), week, players: [] };
    if (name === 'gtl_points_reminder_candidates') return { players: [1, 2, 3].map(n => pointsPlayer(n, { endpoint: endpoints[n - 1], ...devices[n - 1].subscription })) };
    // Player 2's mark fails, so nothing is sent to player 2.
    if (name === 'gtl_mark_points_reminder') { marks.push(args.p_user); if (args.p_user === id(2)) throw unavailable(); return { recorded: true }; }
    // Player 1's push is delivered and recording that outcome fails: the delivered push still counts as sent.
    if (name === 'gtl_record_push_delivery') { if (args.p_endpoint === endpoints[0]) throw unavailable(); return { outcome: args.p_outcome }; }
    if (name === 'gtl_complete_push_reminders') return completes(args);
    throw new Error(`unexpected ${name}`);
  } };
  const fetchImpl = async url => { sends.push(url); return new Response(null, { status: 201 }); };
  const response = await createPushReminderHandler({ service, vapid: keys, clock: () => POINTS_NOW, fetchImpl })(REQUEST());
  assert.deepEqual(await response.json(), { runId: id(900), status: 'succeeded', reason: null, sent: 2, failed: 1 });
  assert.deepEqual(marks, [id(1), id(2), id(3)], 'every player is tried');
  assert.deepEqual(sends.sort(), [endpoints[0], endpoints[2]].sort());
});

test('reminder worker: either pass failing every send fails the run, the other pass\'s sends never mask it, and each pass logs counts only', async t => {
  const info = t.mock.method(console, 'info', () => {});
  const keys = await vapidPair(), spreadDevice = await subscriber(), pointsDevice = await subscriber();
  const spreadEndpoint = 'https://fcm.googleapis.com/fcm/send/spread-a';
  const service = { rpc: async (name, args) => {
    if (name === 'gtl_claim_push_reminders') return { replay: false, runId: id(900), claim: id(901), week, players: [player(1, { subscriptions: [{ endpoint: spreadEndpoint, ...spreadDevice.subscription }] })] };
    if (name === 'gtl_mark_push_reminder') return { modes: args.p_modes };
    if (name === 'gtl_points_reminder_candidates') return { players: [pointsPlayer(2, { endpoint: POINTS_ENDPOINTS[0], ...pointsDevice.subscription })] };
    if (name === 'gtl_mark_points_reminder') return { recorded: true };
    if (name === 'gtl_record_push_delivery') return { outcome: args.p_outcome };
    if (name === 'gtl_complete_push_reminders') return completes(args);
    throw new Error(`unexpected ${name}`);
  } };
  const run = async refused => (await createPushReminderHandler({ service, vapid: keys, clock: () => inWindow,
    fetchImpl: async url => new Response(null, { status: url === refused ? 500 : 201 }) })(REQUEST())).json();
  // The push service refuses the Spread/Total push and accepts the Points push: the Spread/Total failure stands.
  assert.deepEqual(await run(spreadEndpoint), { runId: id(900), status: 'failed', reason: 'send_failed', sent: 1, failed: 1 });
  assert.deepEqual(info.mock.calls.map(call => call.arguments), [['Spread/Total reminders: 0 sent, 1 failed.'], ['Points reminders: 1 sent, 0 failed.']], 'counts only: no player, device or text');
  // And the other way round.
  assert.deepEqual(await run(POINTS_ENDPOINTS[0]), { runId: id(900), status: 'failed', reason: 'send_failed', sent: 1, failed: 1 });
  // Both passes delivering is the plain success it was before the Points pass.
  assert.deepEqual(await run(null), { runId: id(900), status: 'succeeded', reason: null, sent: 2, failed: 0 });
});

test('push adapter: both Points RPC names are allowed and a PostgREST 404 PGRST202 surfaces as the PGRST202 code', async () => {
  const seen = [];
  const adapter = createPushReminderAdapter({ url: 'https://abc.supabase.co', serviceRoleKey: 'k', fetchImpl: async url => {
    seen.push(String(url));
    return new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.gtl_points_reminder_candidates' }), { status: 404 });
  } });
  await assert.rejects(() => adapter.rpc('gtl_points_reminder_candidates', {}), error => error.code === 'PGRST202');
  await assert.rejects(() => adapter.rpc('gtl_mark_points_reminder', {}), error => error.code === 'PGRST202');
  assert.deepEqual(seen, ['https://abc.supabase.co/rest/v1/rpc/gtl_points_reminder_candidates', 'https://abc.supabase.co/rest/v1/rpc/gtl_mark_points_reminder']);
  await assert.rejects(() => adapter.rpc('gtl_something_else', {}), /Invalid reminder operation/);
});
