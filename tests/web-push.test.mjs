import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planReminders, reminderPayload, pacificClock, createPushReminderHandler } from '../cloud/push-reminders.mjs';
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

test('payload names the week, lock time and modes only: no pick, line, player or link', () => {
  assert.equal(pacificClock(DEADLINE), '5:15 PM');
  assert.equal(pacificClock('2026-11-13T01:15:00Z'), '5:15 PM', 'PST');
  const one = reminderPayload({ season: 2026, week: 6, deadline: DEADLINE, modes: ['guess_spread'] });
  assert.deepEqual(one, { title: 'Guess The Line', body: 'Week 6 picks lock at 5:15 PM PT. Spread still due.', tag: 'gtl-deadline-2026-6' });
  assert.equal(reminderPayload({ season: 2026, week: 6, deadline: DEADLINE, modes: ['guess_total', 'guess_spread'] }).body, 'Week 6 picks lock at 5:15 PM PT. Spread and Total still due.');
  assert.equal(reminderPayload({ season: 2026, week: 6, deadline: DEADLINE, modes: ['guess_total'] }).body, 'Week 6 picks lock at 5:15 PM PT. Total still due.');
  assert.throws(() => reminderPayload({ season: 2026, week: 6, deadline: DEADLINE, modes: [] }));
  // Every field is fixed text plus the week, the lock time and mode names: nothing else can carry a pick, a line or a player.
  for (const payload of [one, reminderPayload({ season: 2026, week: 18, deadline: '2027-01-09T21:30:00Z', modes: ['guess_spread', 'guess_total'] })]) {
    assert.deepEqual(Object.keys(payload), ['title', 'body', 'tag']);
    assert.match(payload.body, /^Week \d{1,2} picks lock at \d{1,2}:\d{2} [AP]M PT\. (?:Spread|Total|Spread and Total) still due\.$/);
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

test('reminder worker: claim, mark before send, encrypted spoiler-free payload, stale endpoints removed, counts recorded', async () => {
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
    if (name === 'gtl_record_push_delivery') return { outcome: args.p_outcome };
    if (name === 'gtl_complete_push_reminders') return { runId: args.p_run, status: args.p_reason ? 'failed' : 'succeeded', reason: args.p_reason, sent: args.p_sent, failed: args.p_failed };
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
  assert.equal(delivered.find(d => d.url === endpoints[0]).payload.body, 'Week 6 picks lock at 5:15 PM PT. Spread still due.');
  assert.equal(delivered.find(d => d.url === endpoints[2]).payload.body, 'Week 6 picks lock at 5:15 PM PT. Spread and Total still due.');

  // A second run in the same window sends nothing: the marks already exist.
  delivered.length = 0; calls.length = 0;
  assert.deepEqual(await (await request('a'.repeat(64))).json(), { runId: id(900), status: 'succeeded', reason: null, sent: 0, failed: 0 });
  assert.equal(delivered.length, 0);
});

test('reminder worker: skips outside the window and fails closed without VAPID secrets', async () => {
  const completes = [];
  const service = { rpc: async (name, args) => {
    if (name === 'gtl_claim_push_reminders') return { replay: false, runId: id(900), claim: id(901), week, players: [player(1)] };
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
