import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALL } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { serviceSql } from './helpers/guess-week.mjs';
import { waitOutSlotEdge } from './helpers/slot-edge.mjs';
import { OPS_ALERT_TTL_S, createOpsAlertAdapter, createOpsAlertHandler, familyName, opsAlertPayload, pacificWhen } from '../cloud/ops-alerts.mjs';
import { b64uDecode, b64uEncode } from '../cloud/web-push.mjs';

// Item 22 (docs/OPS_ALERTS.md), M-38: the gtl-ops-alerts worker (cloud/ops-alerts.mjs). The push text, the request guards and
// the send, record and mark rules run against a fake service and a fake push service that decrypts what it receives; the last
// test runs the real handler and adapter against the real migrations on local PGlite. Fixture ids and devices only.
const MIGRATION = new URL('../supabase/migrations/20261103190000_gtl_ops_alerts.sql', import.meta.url);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const RUN = id(900), CLAIM = id(901), TOKEN = 'a'.repeat(64);
const ENDPOINT = 'https://abc.supabase.co/functions/v1/gtl-ops-alerts';
const MINUTE = 60_000;
// Tuesday November 3, 2026: 2:35 PM PST, and 3:00 PM the same afternoon.
const AT = '2026-11-03T22:35:00.000Z', NOW = '2026-11-03T23:00:00.000Z';
// gtl_complete_ops_alerts as M-38 writes it: a null reason succeeded, each named reason skipped or failed, anything else refused.
const COMPLETION = Object.fromEntries([...fs.readFileSync(MIGRATION, 'utf8').matchAll(/when p_reason in \(([^)]*)\) then '([a-z]+)'/g)]
  .flatMap(([, reasons, status]) => reasons.split(',').map(reason => [reason.trim().slice(1, -1), status])));

// ---- Receiving side of RFC 8291, for the test only (as tests/web-push.test.mjs has it). ----
async function device(endpoint) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { pair, subscription: { endpoint, p256dh: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), auth: b64uEncode(crypto.getRandomValues(new Uint8Array(16))) } };
}
async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}
async function decrypt(body, { pair, subscription }) {
  const salt = body.slice(0, 16), idlen = body[20], asPublic = body.slice(21, 21 + idlen), cipher = body.slice(21 + idlen);
  const uaPublic = b64uDecode(subscription.p256dh);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, pair.privateKey, 256));
  const ikm = await hkdf(b64uDecode(subscription.auth), shared, new Uint8Array([...new TextEncoder().encode('WebPush: info\0'), ...uaPublic, ...asPublic]), 32);
  const cek = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cipher));
  let end = plain.length - 1; while (plain[end] === 0) end--;
  assert.equal(plain[end], 2, 'last-record delimiter');
  return new TextDecoder().decode(plain.slice(0, end));
}
async function vapidPair() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { publicKey: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), privateKey: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d, subject: 'mailto:ops@example.test' };
}
const KEYS = await vapidPair();
const PHONE = await device('https://fcm.googleapis.com/fcm/send/ops-fixture-phone');
const LAPTOP = await device('https://updates.push.services.mozilla.com/wpush/v2/ops-fixture-laptop');

const note = (incidentId, extra) => ({ incidentId, phase: 'opened', family: null, season: null, week: null, at: AT, ...extra });
const RESULTS_FAILED = note(7, { key: 'failed:results', kind: 'failed', family: 'results' });
const WEEK10_OPEN = note(8, { key: 'points-open:2026-10', kind: 'points-open', season: 2026, week: 10, phase: 'cleared' });
const ODDS_QUIET = note(9, { key: 'quiet:odds', kind: 'quiet', family: 'odds' });

const request = ({ token = TOKEN, body = { runId: RUN }, method = 'POST', url = ENDPOINT, type = 'application/json' } = {}) =>
  new Request(url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(type ? { 'content-type': type } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
const refused = code => Object.assign(new Error(code), { code });
/** The worker's four functions as M-38 answers them, with every call kept. `overrides` replaces one by name. */
function fakeService({ notifications = [RESULTS_FAILED], subscriptions = [PHONE.subscription], now = NOW, overrides = {} } = {}) {
  const calls = [];
  return { calls, rpc: async (name, args) => {
    calls.push([name, args]);
    if (overrides[name]) return overrides[name](args);
    if (name === 'gtl_claim_ops_alerts') {
      if (args.p_token !== TOKEN) throw refused('GTL_SCHEDULE_AUTH');
      return { replay: false, runId: RUN, claim: CLAIM, status: 'running', now, notifications, subscriptions };
    }
    if (name === 'gtl_record_ops_delivery') return { outcome: args.p_outcome };
    if (name === 'gtl_mark_ops_notification') return { recorded: true };
    if (name === 'gtl_complete_ops_alerts') {
      const status = args.p_reason === null ? 'succeeded' : COMPLETION[args.p_reason];
      if (!status || !Number.isInteger(args.p_sent) || !Number.isInteger(args.p_failed) || args.p_sent < 0 || args.p_failed < 0) throw refused('GTL_SCHEDULE_RUN');
      return { runId: args.p_run, status, reason: args.p_reason, sent: args.p_sent, failed: args.p_failed };
    }
    throw new Error(`unexpected ${name}`);
  } };
}
/** A push service for the given devices: decrypts each push, answers each endpoint's queued statuses in turn (201 after). */
function pushService(devices, answers = {}) {
  const delivered = [], queue = Object.fromEntries(Object.entries(answers).map(([url, list]) => [url, [...list]]));
  return { delivered, fetchImpl: async (url, init) => {
    const target = devices.find(d => d.subscription.endpoint === url);
    delivered.push({ url, payload: JSON.parse(await decrypt(new Uint8Array(init.body), target)), headers: init.headers });
    return new Response(null, { status: queue[url]?.shift() ?? 201 });
  } };
}
async function run({ service, devices = [PHONE], answers, vapid = KEYS, clock = () => Date.parse(NOW) } = {}) {
  const push = pushService(devices, answers);
  const response = await createOpsAlertHandler({ service, vapid, clock, fetchImpl: push.fetchImpl })(request());
  return { status: response.status, body: await response.json(), delivered: push.delivered };
}
const named = (calls, name) => calls.filter(([n]) => n === name).map(([, args]) => args);
const sorted = pairs => pairs.map(pair => pair.join(' ')).sort();

test('push text: every kind in both phases is exactly the plan\'s table, with its own title and the tag gtl-ops-<key> for both', () => {
  const rows = [
    [{ key: 'failed:results', kind: 'failed', family: 'results' }, 'The results refresh failed at 2:35 PM PT.', 'The results refresh is working again.'],
    [{ key: 'quiet:results', kind: 'quiet', family: 'results' }, 'The results refresh has not run since 2:35 PM PT.', 'The results refresh is running again.'],
    [{ key: 'points-open:2026-10', kind: 'points-open', season: 2026, week: 10 }, 'Points Week 10 is not open. It was due 2:35 PM PT.', 'Points Week 10 is open now.'],
    [{ key: 'points-final:2026-9', kind: 'points-final', season: 2026, week: 9 }, 'Points Week 9 is not FINAL. It was due 2:35 PM PT.', 'Points Week 9 is FINAL now.'],
    [{ key: 'week-open:2026-10', kind: 'week-open', season: 2026, week: 10 }, 'Week 10 Spread and Total is not open. It was due 2:35 PM PT.', 'Week 10 Spread and Total is open now.'],
    [{ key: 'test:1793745300', kind: 'test' }, 'Test alert: this phone gets GTL ops alerts.', 'Test alert cleared.'],
  ];
  for (const [fields, opened, cleared] of rows) {
    const tag = `gtl-ops-${fields.key}`;
    assert.deepEqual(opsAlertPayload(note(1, fields), NOW), { title: 'GTL ops alert', body: opened, tag }, `${fields.kind} opened`);
    assert.deepEqual(opsAlertPayload(note(1, { ...fields, phase: 'cleared' }), NOW), { title: 'GTL ops alert cleared', body: cleared, tag }, `${fields.kind} cleared`);
  }
  // The design's own examples (docs/OPS_ALERTS.md): Week 10 due Monday November 9, 12:00 AM PST, read the same morning.
  assert.equal(opsAlertPayload(note(1, { key: 'points-open:2026-10', kind: 'points-open', season: 2026, week: 10, at: '2026-11-09T08:00:00Z' }), '2026-11-09T10:00:00Z').body,
    'Points Week 10 is not open. It was due 12:00 AM PT.');
  // The service worker shows at most 64 tag characters: the longest family M-38 allows still fits whole.
  assert.equal(opsAlertPayload(note(1, { key: `quiet:epl:${'z'.repeat(20)}`, kind: 'quiet', family: `epl:${'z'.repeat(20)}` }), NOW).tag.length <= 64, true);
});

test('family names: each job family as the plan names it, an EPL job by its own name, and the body starts with a capital in both phases', () => {
  const names = { results: 'the results refresh', odds: 'the odds refresh', points: 'the Points jobs', week_open: 'the week-open job',
    features: 'the league features job', push: 'the reminder job', 'epl:snapshot': 'the EPL snapshot job', 'epl:dnb-check': 'the EPL dnb-check job' };
  for (const [family, name] of Object.entries(names)) assert.equal(familyName(family), name, family);
  const bodies = Object.keys(names).map(family => [opsAlertPayload(note(1, { key: `failed:${family}`, kind: 'failed', family }), NOW).body,
    opsAlertPayload(note(1, { key: `quiet:${family}`, kind: 'quiet', family, phase: 'cleared' }), NOW).body]);
  assert.deepEqual(bodies, [
    ['The results refresh failed at 2:35 PM PT.', 'The results refresh is running again.'],
    ['The odds refresh failed at 2:35 PM PT.', 'The odds refresh is running again.'],
    ['The Points jobs failed at 2:35 PM PT.', 'The Points jobs is running again.'],
    ['The week-open job failed at 2:35 PM PT.', 'The week-open job is running again.'],
    ['The league features job failed at 2:35 PM PT.', 'The league features job is running again.'],
    ['The reminder job failed at 2:35 PM PT.', 'The reminder job is running again.'],
    ['The EPL snapshot job failed at 2:35 PM PT.', 'The EPL snapshot job is running again.'],
    ['The EPL dnb-check job failed at 2:35 PM PT.', 'The EPL dnb-check job is running again.'],
  ]);
});

test('pacificWhen: the clock alone on the same Pacific calendar day as now, the weekday before it otherwise, judged in Pacific days across both DST changes', () => {
  assert.equal(pacificWhen(AT, NOW), '2:35 PM PT');
  // Fall back, Sunday November 1, 2026 (2:00 AM PDT becomes 1:00 AM PST). Both 1:30 AMs are that Sunday, and so is 11:30 PM PST,
  // although it is Monday in UTC.
  assert.equal(pacificWhen('2026-11-01T08:30:00Z', '2026-11-02T07:30:00Z'), '1:30 AM PT', 'PDT 1:30 AM, same Pacific day, next UTC day');
  assert.equal(pacificWhen('2026-11-01T09:30:00Z', '2026-11-02T07:30:00Z'), '1:30 AM PT', 'PST 1:30 AM');
  assert.equal(pacificWhen('2026-11-01T06:30:00Z', '2026-11-01T09:30:00Z'), 'Sat 11:30 PM PT', 'the Pacific day before, the same UTC day');
  // Spring forward, Sunday March 8, 2026 (2:00 AM PST becomes 3:00 AM PDT).
  assert.equal(pacificWhen('2026-03-08T07:59:00Z', '2026-03-08T10:30:00Z'), 'Sat 11:59 PM PT');
  assert.equal(pacificWhen('2026-03-08T08:00:00Z', '2026-03-08T10:30:00Z'), '12:00 AM PT');
  // A Points week due Monday 12:00 AM PST, read on Tuesday; and a week ago today is a different day, so it names the day.
  assert.equal(pacificWhen('2026-11-02T08:00:00Z', '2026-11-03T16:55:57.510Z'), 'Mon 12:00 AM PT');
  assert.equal(pacificWhen('2026-10-27T21:35:00Z', NOW), 'Tue 2:35 PM PT');
  assert.equal(pacificWhen(Date.parse(AT), new Date(NOW)), '2:35 PM PT', 'milliseconds and dates work too');
  for (const [at, now] of [[null, NOW], [undefined, NOW], ['soon', NOW], [AT, undefined], [AT, 'later'], [{}, NOW]]) assert.throws(() => pacificWhen(at, now), /needs a time/, String(at));
});

test('no made-up text: an unknown kind, phase or family, a missing week or time, or a key that is not its kind\'s throws', () => {
  const bad = [
    null, {},
    note(1, { key: 'mystery:x', kind: 'mystery' }),
    note(1, { key: 'toString:x', kind: 'toString' }),
    note(1, { key: 'failed:results', kind: 'failed', family: 'results', phase: 'both' }),
    note(1, { key: 'failed:results', kind: 'failed', family: 'results', phase: undefined }),
    ...['billing', null, undefined, 'epl:', 'epl:Snapshot', `epl:${'a'.repeat(21)}`, 'toString', 'constructor'].flatMap(family => [
      note(1, { key: `failed:${family}`, kind: 'failed', family }), note(1, { key: `quiet:${family}`, kind: 'quiet', family, phase: 'cleared' })]),
    ...[null, undefined, 0, 19, 9.5, '10'].flatMap(week => ['points-open', 'points-final', 'week-open'].map(kind => note(1, { key: `${kind}:2026-${week}`, kind, season: 2026, week }))),
    note(1, { key: 'points-open:2026-10', kind: 'points-open', season: 2026, week: 10, at: null }),
    note(1, { key: 'failed:results', kind: 'failed', family: 'results', at: 'yesterday' }),
    note(1, { key: 'quiet:results', kind: 'failed', family: 'results' }),
    note(1, { key: undefined, kind: 'test' }),
  ];
  for (const notification of bad) assert.throws(() => opsAlertPayload(notification, NOW), Error, JSON.stringify(notification));
  assert.throws(() => opsAlertPayload(RESULTS_FAILED, undefined), /needs a time/, 'an alert that names a time needs now');
  assert.deepEqual(opsAlertPayload({ ...WEEK10_OPEN, at: null }, undefined), { title: 'GTL ops alert cleared', body: 'Points Week 10 is open now.', tag: 'gtl-ops-points-open:2026-10' },
    'a recovery names no time');
});

test('a machine-only endpoint: POST, no query, a 64-hex one-run token and a { runId } JSON body, or nothing is called and nothing is sent', async () => {
  const s = fakeService(), push = pushService([PHONE]);
  const handler = createOpsAlertHandler({ service: s, vapid: KEYS, fetchImpl: push.fetchImpl });
  const cases = [
    [{ method: 'GET' }, 405], [{ url: `${ENDPOINT}?run=1` }, 400],
    [{ token: null }, 401], [{ token: 'short' }, 401], [{ token: 'A'.repeat(64) }, 401], [{ token: `${TOKEN}0` }, 401],
    [{ body: { runId: RUN, extra: 1 } }, 400], [{ body: { runId: 'not-a-run' } }, 400], [{ body: [RUN] }, 400], [{ type: 'text/plain' }, 400],
    [{ body: { runId: RUN, pad: 'x'.repeat(2000) } }, 400],
  ];
  for (const [options, status] of cases) assert.equal((await handler(request(options))).status, status, JSON.stringify(options));
  const basic = await handler(new Request(ENDPOINT, { method: 'POST', headers: { authorization: `Basic ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ runId: RUN }) }));
  assert.equal(basic.status, 401);
  assert.deepEqual([s.calls, push.delivered], [[], []]);
});

test('a replayed or self-skipped run returns only its stored safe summary and sends, records or marks nothing', async () => {
  for (const stored of [{ status: 'skipped', reason: 'nothing_owed', sent: 0, failed: 0 }, { status: 'skipped', reason: 'no_subscriptions', sent: 0, failed: 0 },
    { status: 'succeeded', reason: null, sent: 2, failed: 1 }, { status: 'running', reason: null, sent: 0, failed: 0 }]) {
    const s = fakeService({ overrides: { gtl_claim_ops_alerts: () => ({ replay: true, runId: RUN, ...stored, claim: CLAIM, notifications: [RESULTS_FAILED], subscriptions: [PHONE.subscription] }) } });
    const result = await run({ service: s });
    assert.deepEqual([result.status, result.body], [200, { runId: RUN, ...stored }], stored.reason);
    assert.deepEqual(s.calls.map(([name]) => name), ['gtl_claim_ops_alerts']);
    assert.deepEqual(result.delivered, []);
  }
});

test('missing or invalid VAPID secrets: the run completes failed/vapid_unavailable before any send, delivery record or mark', async () => {
  for (const vapid of [undefined, null, {}, { publicKey: '', privateKey: '', subject: '' }, { ...KEYS, subject: 'ops@example.test' }, { ...KEYS, privateKey: 'abc' }]) {
    const s = fakeService({ notifications: [RESULTS_FAILED, ODDS_QUIET] });
    const push = pushService([PHONE]);
    const response = await createOpsAlertHandler({ service: s, vapid, fetchImpl: push.fetchImpl })(request());
    assert.deepEqual([response.status, await response.json()], [200, { runId: RUN, status: 'failed', reason: 'vapid_unavailable', sent: 0, failed: 0 }], JSON.stringify(vapid));
    assert.deepEqual(s.calls.map(([name]) => name), ['gtl_claim_ops_alerts', 'gtl_complete_ops_alerts']);
    assert.deepEqual(push.delivered, []);
  }
});

test('an alert is marked pushed only after a device accepted it; one no device accepted stays owed, and a run that delivered nothing completes send_failed', async t => {
  t.mock.method(console, 'info', () => {});
  // One device: the first alert is accepted, the second refused (500), and the device gets nothing more this run.
  const s = fakeService({ notifications: [RESULTS_FAILED, WEEK10_OPEN, ODDS_QUIET] });
  const mixed = await run({ service: s, answers: { [PHONE.subscription.endpoint]: [201, 500] } });
  assert.deepEqual(mixed.body, { runId: RUN, status: 'succeeded', reason: null, sent: 1, failed: 1 });
  assert.deepEqual(s.calls.map(([name]) => name), ['gtl_claim_ops_alerts', 'gtl_record_ops_delivery', 'gtl_mark_ops_notification', 'gtl_record_ops_delivery', 'gtl_complete_ops_alerts'],
    'each mark follows its delivery; the refused alert is never marked; the third waits for the next run');
  assert.deepEqual(named(s.calls, 'gtl_mark_ops_notification'), [{ p_run: RUN, p_claim: CLAIM, p_incident: 7, p_phase: 'opened' }]);
  assert.deepEqual(named(s.calls, 'gtl_record_ops_delivery').map(a => a.p_outcome), ['ok', 'failed']);
  assert.deepEqual(named(s.calls, 'gtl_complete_ops_alerts'), [{ p_run: RUN, p_claim: CLAIM, p_reason: null, p_sent: 1, p_failed: 1 }]);
  // Every device refuses: nothing is marked and the run is a failure to look at.
  for (const status of [500, 429, 400]) {
    const none = fakeService({ notifications: [RESULTS_FAILED, WEEK10_OPEN] });
    const failed = await run({ service: none, answers: { [PHONE.subscription.endpoint]: [status] } });
    assert.deepEqual(failed.body, { runId: RUN, status: 'failed', reason: 'send_failed', sent: 0, failed: 1 }, String(status));
    assert.deepEqual(named(none.calls, 'gtl_mark_ops_notification'), []);
    assert.equal(failed.delivered.length, 1, 'a refusing device is tried once per run');
  }
  // Two devices: one acceptance is enough to mark the alert, and the refusing device is not tried again this run.
  const two = fakeService({ notifications: [RESULTS_FAILED, WEEK10_OPEN], subscriptions: [PHONE.subscription, LAPTOP.subscription] });
  const either = await run({ service: two, devices: [PHONE, LAPTOP], answers: { [PHONE.subscription.endpoint]: [500] } });
  assert.deepEqual(either.body, { runId: RUN, status: 'succeeded', reason: null, sent: 2, failed: 1 });
  assert.deepEqual(named(two.calls, 'gtl_mark_ops_notification').map(a => [a.p_incident, a.p_phase]), [[7, 'opened'], [8, 'cleared']]);
  // Devices of one alert are sent to in parallel, so their order is free; the alerts go out one after another.
  assert.deepEqual(sorted(either.delivered.map(d => [d.url, d.payload.tag])), sorted([[PHONE.subscription.endpoint, 'gtl-ops-failed:results'],
    [LAPTOP.subscription.endpoint, 'gtl-ops-failed:results'], [LAPTOP.subscription.endpoint, 'gtl-ops-points-open:2026-10']]));
  assert.equal(either.delivered.at(-1).payload.tag, 'gtl-ops-points-open:2026-10');
});

test('an expired device (404/410, or an endpoint off the push hosts) is recorded as gone, for the database to retire it, and gets nothing more this run', async t => {
  t.mock.method(console, 'info', () => {});
  const stray = { endpoint: 'https://collector.example.com/push/ops-fixture-stray', p256dh: PHONE.subscription.p256dh, auth: PHONE.subscription.auth };
  const s = fakeService({ notifications: [RESULTS_FAILED, ODDS_QUIET], subscriptions: [PHONE.subscription, LAPTOP.subscription, stray] });
  const result = await run({ service: s, devices: [PHONE, LAPTOP], answers: { [PHONE.subscription.endpoint]: [410] } });
  assert.deepEqual(result.body, { runId: RUN, status: 'succeeded', reason: null, sent: 2, failed: 2 });
  const records = named(s.calls, 'gtl_record_ops_delivery').map(a => [a.p_endpoint, a.p_outcome]);
  assert.deepEqual(sorted(records.slice(0, 3)), sorted([[PHONE.subscription.endpoint, 'gone'], [LAPTOP.subscription.endpoint, 'ok'], [stray.endpoint, 'gone']]));
  assert.deepEqual(records.slice(3), [[LAPTOP.subscription.endpoint, 'ok']], 'the second alert goes only to the live device');
  assert.equal(result.delivered.filter(d => d.url === PHONE.subscription.endpoint).length, 1);
  assert.equal(result.delivered.some(d => d.url === stray.endpoint), false, 'a host off the push list is never contacted');
});

test('an alert with no push text (unknown kind or family, or no incident id) counts as one failed alert and the others still go out', async t => {
  t.mock.method(console, 'info', () => {});
  const warn = t.mock.method(console, 'warn', () => {});
  const broken = [note(11, { key: 'mystery:x', kind: 'mystery' }), note(12, { key: 'failed:billing', kind: 'failed', family: 'billing' }), { ...ODDS_QUIET, incidentId: '9' }];
  const s = fakeService({ notifications: [...broken, RESULTS_FAILED] });
  const result = await run({ service: s });
  assert.deepEqual(result.body, { runId: RUN, status: 'succeeded', reason: null, sent: 1, failed: 3 });
  assert.deepEqual(result.delivered.map(d => d.payload), [{ title: 'GTL ops alert', body: 'The results refresh failed at 2:35 PM PT.', tag: 'gtl-ops-failed:results' }]);
  assert.deepEqual(named(s.calls, 'gtl_mark_ops_notification').map(a => a.p_incident), [7]);
  assert.deepEqual(warn.mock.calls.map(call => call.arguments), Array(3).fill(['Ops alert skipped: no push text for this alert.']));
  // Nothing buildable: nothing is sent or marked, and the run failed.
  const none = fakeService({ notifications: broken });
  const failed = await run({ service: none });
  assert.deepEqual(failed.body, { runId: RUN, status: 'failed', reason: 'send_failed', sent: 0, failed: 3 });
  assert.deepEqual([failed.delivered, named(none.calls, 'gtl_mark_ops_notification')], [[], []]);
});

test('on the wire: oldest first, encrypted to each device, exactly { title, body, tag }, a 6-hour TTL under the sender\'s 4-hour cap, and the day judged on the claim\'s database clock', async t => {
  t.mock.method(console, 'info', () => {});
  // The claim's clock is Wednesday 1:00 AM PST; the worker's own clock still says Tuesday. The claim's decides.
  const s = fakeService({ notifications: [RESULTS_FAILED, WEEK10_OPEN, ODDS_QUIET], now: '2026-11-04T09:00:00.000Z' });
  const result = await run({ service: s });
  assert.deepEqual(result.delivered.map(d => d.payload), [
    { title: 'GTL ops alert', body: 'The results refresh failed at Tue 2:35 PM PT.', tag: 'gtl-ops-failed:results' },
    { title: 'GTL ops alert cleared', body: 'Points Week 10 is open now.', tag: 'gtl-ops-points-open:2026-10' },
    { title: 'GTL ops alert', body: 'The odds refresh has not run since Tue 2:35 PM PT.', tag: 'gtl-ops-quiet:odds' },
  ]);
  assert.equal(OPS_ALERT_TTL_S, 4 * 3600);
  for (const { headers } of result.delivered) {
    assert.equal(headers.TTL, '14400', 'four hours, the cap in cloud/web-push.mjs');
    assert.match(headers.Authorization, /^vapid t=[^,]+, k=/);
    assert.equal(headers['Content-Encoding'], 'aes128gcm');
  }
  // A claim without its clock falls back to the worker's own.
  const bare = await run({ service: fakeService({ now: null }), clock: () => Date.parse('2026-11-04T09:00:00.000Z') });
  assert.equal(bare.delivered[0].payload.body, 'The results refresh failed at Tue 2:35 PM PT.');
});

test('a claim that arrives empty completes with M-38\'s own skip reasons, and every reason the worker can finish with is one gtl_complete_ops_alerts accepts', async () => {
  assert.deepEqual(COMPLETION, { nothing_owed: 'skipped', no_subscriptions: 'skipped', vapid_unavailable: 'failed', send_failed: 'failed' });
  for (const [claim, reason] of [[{ notifications: [] }, 'nothing_owed'], [{ subscriptions: [] }, 'no_subscriptions'], [{ notifications: [], subscriptions: [] }, 'nothing_owed']]) {
    const s = fakeService(claim);
    const result = await run({ service: s });
    assert.deepEqual(result.body, { runId: RUN, status: 'skipped', reason, sent: 0, failed: 0 });
    assert.deepEqual([s.calls.map(([name]) => name), result.delivered], [['gtl_claim_ops_alerts', 'gtl_complete_ops_alerts'], []]);
  }
  const source = fs.readFileSync(new URL('../cloud/ops-alerts.mjs', import.meta.url), 'utf8');
  const reasons = [...source.matchAll(/finish\(([^)]*)\)/g)].flatMap(([, args]) => [...args.matchAll(/'([a-z_]+)'/g)].map(m => m[1]));
  assert.deepEqual(reasons.sort(), ['no_subscriptions', 'nothing_owed', 'send_failed', 'vapid_unavailable']);
  for (const reason of reasons) assert.ok(Object.hasOwn(COMPLETION, reason), reason);
});

test('the adapter: exactly the four ops worker functions, the push-reminders configuration checks, schedule codes kept and provider details hidden', async () => {
  for (const url of ['http://abc.supabase.co', 'https://abc.supabase.co/rest', 'https://abc.supabase.co/?x=1', 'https://abc.supabase.co/#x', 'https://u:p@abc.supabase.co'])
    assert.throws(() => createOpsAlertAdapter({ url, serviceRoleKey: 'service-key' }), /Invalid ops alert configuration/, url);
  assert.throws(() => createOpsAlertAdapter({ url: 'https://abc.supabase.co', serviceRoleKey: '' }), /Invalid ops alert configuration/);
  const seen = [];
  let answer = () => Response.json({ ok: true });
  const adapter = createOpsAlertAdapter({ url: 'https://abc.supabase.co', serviceRoleKey: 'service-key', fetchImpl: async (url, init) => { seen.push([String(url), init]); return answer(); } });
  const allowed = ['gtl_claim_ops_alerts', 'gtl_mark_ops_notification', 'gtl_record_ops_delivery', 'gtl_complete_ops_alerts'];
  for (const name of allowed) assert.deepEqual(await adapter.rpc(name, { p_run: RUN }), { ok: true });
  for (const name of ['gtl_ops_test_alert', 'gtl_dispatch_ops_alerts', 'gtl_ops_findings', 'gtl_record_push_delivery', 'gtl_claim_push_reminders', 'gtl_push_subscribe'])
    await assert.rejects(adapter.rpc(name, {}), /Invalid ops alert operation/, name);
  assert.deepEqual(seen.map(([url]) => url), allowed.map(name => `https://abc.supabase.co/rest/v1/rpc/${name}`));
  for (const [, init] of seen) {
    assert.deepEqual([init.method, init.redirect, init.body, init.signal instanceof AbortSignal], ['POST', 'error', JSON.stringify({ p_run: RUN }), true]);
    assert.deepEqual(init.headers, { apikey: 'service-key', Authorization: 'Bearer service-key', 'Content-Type': 'application/json' });
  }
  const cases = [
    [() => new Response(JSON.stringify({ message: 'GTL_SCHEDULE_AUTH', hint: 'secret hint' }), { status: 400 }), 'GTL_SCHEDULE_AUTH'],
    [() => new Response(JSON.stringify({ message: 'GTL_SCHEDULE_RUN' }), { status: 400 }), 'GTL_SCHEDULE_RUN'],
    [() => new Response(JSON.stringify({ message: 'GTL_SCHEDULE_EXPIRED' }), { status: 400 }), 'GTL_SCHEDULE_EXPIRED'],
    [() => new Response(JSON.stringify({ message: 'connection to 10.0.0.1 refused' }), { status: 500 }), 'UNAVAILABLE'],
    [() => new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }), { status: 404 }), 'UNAVAILABLE'],
    [() => new Response('<html>bad gateway</html>', { status: 502 }), 'UNAVAILABLE'],
  ];
  for (const [reply, code] of cases) {
    answer = reply;
    await assert.rejects(adapter.rpc('gtl_claim_ops_alerts', {}), error => error.code === code && error.message === 'Scheduled ops alert request failed.', code);
  }
});

test('error mapping as the reminder worker: a refused capability is 401, a bad run or claim 400, anything else 503 with a generic message', async t => {
  t.mock.method(console, 'info', () => {});
  const cases = [
    [{ gtl_claim_ops_alerts: () => { throw refused('GTL_SCHEDULE_AUTH'); } }, 401, 'Unauthorized.'],
    [{ gtl_claim_ops_alerts: () => { throw refused('GTL_SCHEDULE_RUN'); } }, 400, 'Invalid ops alert request.'],
    [{ gtl_mark_ops_notification: () => { throw refused('GTL_SCHEDULE_RUN'); } }, 400, 'Invalid ops alert request.'],
    [{ gtl_complete_ops_alerts: () => { throw refused('GTL_SCHEDULE_EXPIRED'); } }, 503, 'The scheduled ops alert service is temporarily unavailable.'],
    [{ gtl_record_ops_delivery: () => { throw new Error(`write to ${PHONE.subscription.endpoint} failed`); } }, 503, 'The scheduled ops alert service is temporarily unavailable.'],
    [{ gtl_claim_ops_alerts: () => { throw refused('UNAVAILABLE'); } }, 503, 'The scheduled ops alert service is temporarily unavailable.'],
  ];
  for (const [overrides, status, error] of cases) {
    const result = await run({ service: fakeService({ overrides }) });
    assert.deepEqual([result.status, result.body], [status, { error }], Object.keys(overrides)[0]);
  }
});

test('nothing secret leaves the worker: no token, service key, VAPID key, device endpoint or device key in any log line or response', async t => {
  const logged = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) t.mock.method(console, level, (...args) => logged.push(args.map(String).join(' ')));
  const responses = [];
  const secrets = [TOKEN, KEYS.privateKey, 'service-key', ...[PHONE, LAPTOP].flatMap(d => [d.subscription.endpoint, d.subscription.p256dh, d.subscription.auth]), 'fcm.googleapis.com', 'mozilla.com'];
  const scenarios = [
    { service: fakeService({ notifications: [RESULTS_FAILED, note(11, { key: 'mystery:x', kind: 'mystery' }), WEEK10_OPEN], subscriptions: [PHONE.subscription, LAPTOP.subscription] }),
      devices: [PHONE, LAPTOP], answers: { [PHONE.subscription.endpoint]: [410], [LAPTOP.subscription.endpoint]: [500] } },
    { service: fakeService({ overrides: { gtl_record_ops_delivery: () => { throw new Error(`service-key rejected for ${PHONE.subscription.endpoint}`); } } }) },
    { service: fakeService(), vapid: { ...KEYS, subject: 'not-a-subject' } },
  ];
  for (const scenario of scenarios) responses.push(JSON.stringify((await run(scenario)).body));
  // The real adapter, with a provider error that names the endpoint and the key.
  const adapter = createOpsAlertAdapter({ url: 'https://abc.supabase.co', serviceRoleKey: 'service-key', fetchImpl: async () =>
    new Response(JSON.stringify({ message: `bad key service-key for ${PHONE.subscription.endpoint}` }), { status: 500 }) });
  responses.push(JSON.stringify((await run({ service: adapter })).body));
  assert.ok(logged.length > 0 && responses.length === 4);
  for (const text of [...logged, ...responses]) for (const secret of secrets) assert.equal(text.includes(secret), false, `${secret} in ${text}`);
});

test('contract: the Edge entry reads only the two Supabase variables and the three gtl-push-reminders VAPID secrets, names item 22 and M-38, and the function skips the platform JWT check', async () => {
  const entry = fs.readFileSync(new URL('../supabase/functions/gtl-ops-alerts/index.ts', import.meta.url), 'utf8');
  const reminders = fs.readFileSync(new URL('../supabase/functions/gtl-push-reminders/index.ts', import.meta.url), 'utf8');
  const env = text => [...text.matchAll(/Deno\.env\.get\('([A-Z_]+)'\)/g)].map(m => m[1]).sort();
  assert.match(entry, /^import \{ createOpsAlertAdapter, createOpsAlertHandler \} from '\.\.\/\.\.\/\.\.\/cloud\/ops-alerts\.mjs';$/m);
  assert.deepEqual(env(entry), ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'VAPID_PRIVATE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_SUBJECT']);
  assert.deepEqual(env(entry), env(reminders), 'the same secrets as the reminder worker');
  assert.match(entry, /Item 22/); assert.match(entry, /M-38/);
  assert.match(entry, /Deno\.serve\(createOpsAlertHandler\(\{ service, vapid: \{/);
  const config = fs.readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  assert.match(config.split('[functions.gtl-ops-alerts]')[1]?.split(/^\[/m)[0] ?? '', /^verify_jwt = false$/m);
  assert.match(config.split('[functions.gtl-api]')[1].split(/^\[/m)[0], /^verify_jwt = true$/m, 'gtl-api keeps JWT verification');
});

test('end to end on PGlite with the real migrations: a failed results run pushes one exact alert (a refused push stays owed and is retried), and its recovery pushes one cleared push', {
  skip: pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.',
}, async t => {
  t.mock.method(console, 'info', () => {});
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world, SEAN = ACCOUNTS.sean.id;
  // pg_net is hosted-only: a stand-in records each call, as tests/ops-alerts-sql.test.mjs does.
  await db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';");
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const now = Date.now(), iso = ms => new Date(ms).toISOString();
  const phone = await device('https://fcm.googleapis.com/fcm/send/ops-e2e-phone');
  await db.query("insert into public.gtl_results_refresh_schedule(id,enabled,endpoint,authorized_by,season) values('nfl-results',true,'https://abc.supabase.co/functions/v1/gtl-results-refresh',$1,2026)", [SEAN]);
  await db.query("insert into public.gtl_ops_alert_schedule(id,enabled,endpoint) values('ops',true,$1)", [ENDPOINT]);
  await db.query('insert into public.gtl_push_subscriptions(endpoint,user_id,p256dh,auth) values($1,$2,$3,$4)', [phone.subscription.endpoint, SEAN, phone.subscription.p256dh, phone.subscription.auth]);
  const runRow = (status, slot, finished) => db.query("insert into public.gtl_results_refresh_runs(schedule_id,slot_start,capability_hash,status,finished_at) values('nfl-results',$1,repeat('a',64),$2,$3)", [iso(slot), status, iso(finished)]);
  await runRow('failed', now - 40 * MINUTE, now - 35 * MINUTE);

  // The real adapter over a local PostgREST double: each RPC runs as service_role on this database.
  const transportErrors = [];
  const service = createOpsAlertAdapter({ url: 'https://abc.supabase.co', serviceRoleKey: 'local-fixture-key', fetchImpl: async (url, init) => {
    const name = new URL(url).pathname.split('/').at(-1), args = JSON.parse(init.body);
    assert.ok(Object.keys(args).every(key => /^p_[a-z_]+$/.test(key)));
    try { return Response.json(await serviceSql(db)(name, args)); }
    catch (error) { transportErrors.push(name); return Response.json({ message: error.message }, { status: 400 }); }
  } });
  const answers = [], delivered = [];
  const handler = createOpsAlertHandler({ service, vapid: KEYS, fetchImpl: async (url, init) => {
    delivered.push({ url, payload: JSON.parse(await decrypt(new Uint8Array(init.body), phone)) });
    return new Response(null, { status: answers.shift() ?? 201 });
  } });
  // The claim after a dispatch must land in the dispatch's 15-minute slot, so near a slot edge wait for the next slot first.
  const dispatch = async () => { await waitOutSlotEdge(); return (await one('select public.gtl_dispatch_ops_alerts() value')).value; };
  // Moves this slot's run to its own past slot, as if 15 minutes went by (tests/ops-alerts-sql.test.mjs).
  const nextSlot = () => db.query("update public.gtl_ops_alert_runs set slot_start=timestamptz '2000-01-01 00:00:00+00'+(select count(*) from public.gtl_ops_alert_runs)*interval '15 minutes' where slot_start=date_bin(interval '15 minutes',clock_timestamp(),timestamptz '2000-01-01 00:00:00+00')");
  /** What the dispatcher posted for `queued`: its token and run id, sent to the real handler. */
  const deliver = async queued => {
    const call = (await db.query('select url,body,headers from net.outbox order by id')).rows.at(-1);
    assert.equal(call.url, ENDPOINT);
    assert.deepEqual(call.body, { runId: queued.runId });
    const token = /^Bearer ([0-9a-f]{64})$/.exec(call.headers.Authorization)[1];
    const response = await handler(request({ token, body: { runId: queued.runId } }));
    return [response.status, await response.json()];
  };
  const incident = () => one("select id,notified_at,cleared_at,cleared_notified_at from public.gtl_ops_incidents where key='failed:results'");
  // The device row itself is gtl_record_ops_delivery's to change (tests/ops-alerts-sql.test.mjs); here it only has to stay active.
  const phoneActive = async () => (await one('select disabled_at from public.gtl_push_subscriptions where endpoint=$1', [phone.subscription.endpoint]))?.disabled_at === null;

  // 1. The push service refuses the first push: the run fails and the alert stays owed.
  const first = await dispatch();
  assert.deepEqual({ ...first, runId: typeof first.runId }, { status: 'queued', runId: 'string', opened: 1, cleared: 0, owed: 1 });
  answers.push(500);
  assert.deepEqual(await deliver(first), [200, { runId: first.runId, status: 'failed', reason: 'send_failed', sent: 0, failed: 1 }]);
  assert.equal((await incident()).notified_at, null, 'no device accepted it: still owed');
  assert.equal(await phoneActive(), true, 'a refused push does not retire the device');
  // 2. The next run retries it and the phone accepts: one push with the exact text, and the incident is marked.
  await nextSlot();
  const second = await dispatch();
  assert.deepEqual({ ...second, runId: typeof second.runId }, { status: 'queued', runId: 'string', opened: 0, cleared: 0, owed: 1 });
  assert.deepEqual(await deliver(second), [200, { runId: second.runId, status: 'succeeded', reason: null, sent: 1, failed: 0 }]);
  const claimedAt = (await one('select claimed_at from public.gtl_ops_alert_runs where id=$1', [second.runId])).claimed_at;
  const when = pacificWhen(iso(now - 35 * MINUTE), claimedAt);
  assert.match(when, /^(?:[A-Z][a-z]{2} )?\d{1,2}:\d{2} [AP]M PT$/);
  assert.deepEqual(delivered.map(d => [d.url, d.payload]), Array(2).fill([phone.subscription.endpoint,
    { title: 'GTL ops alert', body: `The results refresh failed at ${when}.`, tag: 'gtl-ops-failed:results' }]), 'the refused push and its retry, nothing else');
  assert.ok((await incident()).notified_at instanceof Date);
  assert.equal(await phoneActive(), true);
  // The same capability again replays the stored summary and sends nothing.
  assert.deepEqual(await deliver(second), [200, { runId: second.runId, status: 'succeeded', reason: null, sent: 1, failed: 0 }]);
  assert.equal(delivered.length, 2);
  // 3. The results refresh works again: the incident clears and one cleared push replaces the alert.
  await runRow('succeeded', now - 10 * MINUTE, now - 5 * MINUTE);
  await nextSlot();
  const third = await dispatch();
  assert.deepEqual({ ...third, runId: typeof third.runId }, { status: 'queued', runId: 'string', opened: 0, cleared: 1, owed: 1 });
  assert.deepEqual(await deliver(third), [200, { runId: third.runId, status: 'succeeded', reason: null, sent: 1, failed: 0 }]);
  assert.deepEqual(delivered.slice(2).map(d => d.payload), [{ title: 'GTL ops alert cleared', body: 'The results refresh is working again.', tag: 'gtl-ops-failed:results' }]);
  const done = await incident();
  assert.ok(done.cleared_at instanceof Date && done.cleared_notified_at instanceof Date);
  // 4. Nothing is owed any more: a quiet tick calls nothing.
  await nextSlot();
  assert.deepEqual(await dispatch(), { status: 'nothing_owed', opened: 0, cleared: 0, owed: 0 });
  assert.equal((await db.query('select count(*)::int n from net.outbox')).rows[0].n, 3);
  assert.deepEqual((await db.query('select status,reason,sent,failed from public.gtl_ops_alert_runs order by created_at')).rows,
    [{ status: 'failed', reason: 'send_failed', sent: 0, failed: 1 }, { status: 'succeeded', reason: null, sent: 1, failed: 0 }, { status: 'succeeded', reason: null, sent: 1, failed: 0 }]);
  assert.deepEqual(transportErrors, []);
});
