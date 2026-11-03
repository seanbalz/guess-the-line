// D-69 moments engine: the launch guard and the engine that plays moments (web/src/next/moments). Fixture data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { armLaunch, hasNavigated, isSettled, markNavigated, markSettled, onLaunchScreen, onSettled, resetLaunch } from '../web/src/next/moments/launch.js';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';
import { SCOPES } from '../web/src/next/moments/catalog.js';
import { SEEN_CAP, momentsKey } from '../web/src/next/moments/seen.js';
import { featureMoments } from '../web/src/next/features/model.js';

const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
const badge = id => ({ id, kind: 'badge', scopes: [SCOPES.features, SCOPES.home], title: id });
const streak = id => ({ id, kind: 'streak', scopes: [SCOPES.home], title: id });
// `navigated` (the launch screen is over) mirrors `settled` unless a test sets it apart, as the review's race does.
function rig({ storage = memory(), settled = { value: false }, navigated = settled, clock = { t: 1000 } } = {}) {
  const big = [], small = [], timers = [];
  const engine = createMomentsEngine({ account: 'acct', storage, isSettled: () => settled.value, hasNavigated: () => navigated.value, onBig: ms => big.push(ms.map(x => x.id)), onSmall: x => small.push(x.id),
    setTimer: (fn, ms) => { timers.push(ms); fn(); }, now: () => clock.t });
  return { engine, big, small, timers, settled, navigated, storage, clock };
}
const record = storage => JSON.parse(storage.getItem(momentsKey('acct')));

test('launch guard: settled only by a trusted press or key; a reset makes it a launch again and the listeners stay until disarmed', () => {
  resetLaunch();
  const handlers = {};
  const target = { addEventListener: (type, fn) => { handlers[type] = fn; }, removeEventListener: type => { delete handlers[type]; } };
  const disarm = armLaunch(target);
  let calls = 0; onSettled(() => { calls += 1; });
  handlers.pointerdown({ isTrusted: false });
  assert.equal(isSettled(), false, 'a script-made event is not the member');
  handlers.keydown({ isTrusted: true });
  assert.equal(isSettled(), true);
  assert.equal(calls, 1, 'listeners hear it once');
  resetLaunch();
  assert.equal(isSettled(), false, 'sign-in starts a launch again');
  handlers.keydown({ isTrusted: true });
  assert.equal(isSettled(), true, 'the listeners are still attached after the first press');
  disarm();
  assert.deepEqual(Object.keys(handlers), []);
  resetLaunch();
});

test('launch screen: a press settles the launch but only a navigation ends the launch screen; a reset starts both again', () => {
  resetLaunch();
  assert.equal(hasNavigated(), false);
  assert.equal(onLaunchScreen(), true);
  markSettled();
  assert.equal(isSettled(), true, 'a scroll press means the member is here');
  assert.equal(onLaunchScreen(), true, 'but a press alone is not a navigation: the launch screen stays');
  markNavigated();
  assert.equal(hasNavigated(), true);
  assert.equal(onLaunchScreen(), false, 'the first navigation ends the launch screen');
  resetLaunch();
  assert.equal(isSettled(), false, 'a new sign-in is a launch again');
  assert.equal(hasNavigated(), false, 'and a launch screen again');
  assert.equal(onLaunchScreen(), true);
});

test('engine: a first read seeds silently; a new badge at launch waits as NEW and plays when its card is opened after the launch', () => {
  const r = rig();
  r.engine.open(SCOPES.home);
  r.engine.report([badge('b1')]);
  assert.deepEqual(r.big, [], 'first read on this device: nothing plays');
  r.engine.report([badge('b1'), badge('b2')]);
  assert.deepEqual(r.big, [], 'never on page load');
  assert.equal(r.engine.newCount(SCOPES.features), 1, 'marked NEW');
  r.settled.value = true;
  const close = r.engine.open(SCOPES.features);
  assert.deepEqual(r.big, [['b2']], 'opening its card plays it');
  assert.equal(r.engine.newCount(SCOPES.features), 0);
  close();
  r.engine.report([badge('b1'), badge('b2')]);
  r.engine.open(SCOPES.features);
  assert.deepEqual(r.big, [['b2']], 'never replays');
});

test('engine: after the launch a moment that arrives where you are plays in place; two big ones share one card; small ones 240 ms apart', () => {
  const r = rig({ settled: { value: true } });
  r.engine.report([]);
  r.engine.open(SCOPES.home);
  r.engine.report([badge('b1'), badge('b2'), streak('s1'), streak('s2')]);
  assert.deepEqual(r.big, [['b1', 'b2']]);
  assert.deepEqual(r.small, ['s1', 's2']);
  assert.deepEqual(r.timers, [0, 240]);
});

test('engine: a card held open since the launch plays what arrives after the first press, in place, but not what waited', () => {
  const r = rig();
  r.engine.report([]);
  r.engine.open(SCOPES.home);
  r.engine.report([badge('waited')]);
  r.settled.value = true;
  r.engine.report([badge('waited'), badge('arrived')]);
  assert.deepEqual(r.big, [['arrived']]);
  assert.equal(r.engine.newCount(SCOPES.features), 1, 'what waited stays NEW');
  r.engine.open(SCOPES.features);
  assert.deepEqual(r.big, [['arrived'], ['waited']]);
});

test('engine: the record survives a reload; another account starts its own; a quiet loss never waits', () => {
  const storage = memory();
  const a = rig({ storage, settled: { value: true } });
  a.engine.report([]);
  a.engine.open(SCOPES.features);
  a.engine.report([badge('b1'), { id: 'l1', kind: 'loss', scopes: [SCOPES.features], title: 'l1' }]);
  assert.deepEqual(a.big, [['b1']]);
  assert.equal(a.engine.newCount(SCOPES.features), 0, 'the loss is never pending');
  const reload = rig({ storage, settled: { value: true } });
  reload.engine.open(SCOPES.features);
  reload.engine.report([badge('b1')]);
  assert.deepEqual(reload.big, [], 'seen before the reload');
  const other = createMomentsEngine({ account: 'acct-2', storage, isSettled: () => true, onBig: () => assert.fail('a first read for a new account seeds'), onSmall: () => {} });
  other.open(SCOPES.features);
  other.report([badge('b9')]);
});

test('engine: a first read with nothing in it still writes the record, so a NEW moment survives a reload', () => {
  const storage = memory();
  const a = rig({ storage });
  a.engine.report([]);
  a.engine.report([badge('b1')]);
  assert.equal(a.engine.newCount(SCOPES.features), 1);
  const reload = rig({ storage, settled: { value: true } });
  reload.engine.report([badge('b1')]);
  reload.engine.open(SCOPES.features);
  assert.deepEqual(reload.big, [['b1']], 'not silently seeded after the reload');
});

test('engine: small moments stay 240 ms apart across separate reads', () => {
  const clock = { t: 1000 };
  const r = rig({ settled: { value: true }, clock });
  r.engine.report([]);
  r.engine.open(SCOPES.home);
  r.engine.report([streak('s1')]);
  clock.t += 100;
  r.engine.report([streak('s1'), streak('s2')]);
  assert.deepEqual(r.timers, [0, 140]);
});

test('engine: subscribers hear NEW counts change and stop hearing after unsubscribe; without an account nothing ever plays', () => {
  const r = rig();
  r.engine.report([]);
  let heard = 0; const off = r.engine.subscribe(() => { heard += 1; });
  r.engine.report([badge('b3')]);
  assert.ok(heard >= 1);
  assert.equal(r.engine.newCount(SCOPES.home), 1);
  off();
  const before = heard;
  r.engine.report([badge('b3'), badge('b4')]);
  assert.equal(heard, before, 'an unsubscribed listener hears nothing');
  const none = createMomentsEngine({ account: null, isSettled: () => true, onBig: () => assert.fail('no account'), onSmall: () => assert.fail('no account') });
  none.open(SCOPES.features);
  none.report([badge('b1')]);
  none.report([badge('b1'), badge('b2')]);
  assert.equal(none.newCount(SCOPES.features), 0);
});

test('engine: a closer is safe to call twice; dispose cancels small moments still waiting', () => {
  const r = rig({ settled: { value: true } });
  r.engine.report([]);
  const first = r.engine.open(SCOPES.home);
  r.engine.open(SCOPES.home);
  first(); first();
  r.engine.report([streak('s9')]);
  assert.deepEqual(r.small, ['s9'], 'the second holder still has Home open');
  const queued = [];
  const e = createMomentsEngine({ account: 'acct', storage: memory(), isSettled: () => true, onBig: () => {}, onSmall: x => assert.fail(`played ${x.id} after dispose`),
    setTimer: fn => { queued.push(fn); return queued.length; }, clearTimer: id => { queued[id - 1] = null; }, now: () => 0 });
  e.report([]);
  e.open(SCOPES.home);
  e.report([streak('s1')]);
  e.dispose();
  for (const fn of queued) fn?.();
});

test('engine (the review race): a scroll press is not a navigation; the session\'s first read waits as NEW and plays when its card opens after one', () => {
  const storage = memory();
  // Yesterday's session on this device read this source and saw b1.
  storage.setItem(momentsKey('acct'), JSON.stringify(['source:features:community', 'badge:b1']));
  const held = id => ({ id, kind: 'badge', scopes: [SCOPES.features, SCOPES.home, SCOPES.league], title: id });
  const r = rig({ storage, settled: { value: false }, navigated: { value: false } });
  r.engine.open(SCOPES.home); // Home mounts on page load, before any press
  r.settled.value = true; // the member scrolls: a trusted press, still on the launch screen
  r.engine.open(SCOPES.league); // a card that mounts on the launch screen after that press is still a launch card
  r.engine.report([held('badge:b1'), held('badge:b2')], { source: 'features:community' }); // the session's first read
  assert.deepEqual(r.big, [], 'nothing plays on the launch screen, even after a press');
  assert.equal(r.engine.newCount(SCOPES.features), 1, 'the badge earned while away waits as NEW');
  r.navigated.value = true;
  r.engine.open(SCOPES.features);
  assert.deepEqual(r.big, [['badge:b2']], 'it plays when its card opens after a navigation');
});

test('engine: a device with a record but no marker for a source seeds that source silently; its next read plays what is new', () => {
  const storage = memory();
  storage.setItem(momentsKey('acct'), JSON.stringify(['source:features:community', 'c1']));
  const r = rig({ storage, settled: { value: true } });
  r.engine.open(SCOPES.features);
  r.engine.report([badge('p1'), badge('p2')], { source: 'features:L2' });
  assert.deepEqual(r.big, [], 'the first read of a private league on this device is silent: no flood');
  assert.equal(r.engine.newCount(SCOPES.features), 0);
  assert.ok(record(storage).includes('source:features:L2'), 'the source is marked as seeded');
  assert.ok(record(storage).includes('c1'), 'the other source\'s record stays');
  r.engine.report([badge('p1'), badge('p2'), badge('p3')], { source: 'features:L2' });
  assert.deepEqual(r.big, [['p3']], 'a later read of that source plays what is new, in place');
  // A record written before sources had markers seeds too, rather than flooding every badge it never held.
  const legacy = memory();
  legacy.setItem(momentsKey('acct'), JSON.stringify(['badge:b1']));
  const old = rig({ storage: legacy, settled: { value: true } });
  old.engine.open(SCOPES.features);
  old.engine.report([badge('badge:b1'), badge('badge:b2')]);
  assert.deepEqual(old.big, []);
  assert.deepEqual(record(legacy), ['badge:b1', 'badge:b2', 'source:default']);
});

test('engine: a waiting moment missing from the next read of its source is dropped (a revoked badge never plays); other sources keep theirs', () => {
  const storage = memory();
  storage.setItem(momentsKey('acct'), JSON.stringify(['source:features:community', 'source:features:L2']));
  const r = rig({ storage });
  r.engine.report([badge('b1'), badge('b2')], { source: 'features:community' });
  r.engine.report([badge('x1')], { source: 'features:L2' });
  assert.equal(r.engine.newCount(SCOPES.features), 3);
  r.engine.report([badge('b1')], { source: 'features:community' });
  assert.equal(r.engine.newCount(SCOPES.features), 2, 'b2 was revoked; L2\'s x1 still waits');
  r.settled.value = true;
  r.engine.open(SCOPES.features);
  assert.deepEqual(r.big, [['b1', 'x1']]);
});

test('engine: after dispose, report and open play nothing', () => {
  const r = rig({ settled: { value: true } });
  r.engine.report([]);
  r.engine.report([badge('b1')]); // no card holding it is open: it waits
  assert.equal(r.engine.newCount(SCOPES.features), 1);
  r.engine.dispose();
  const close = r.engine.open(SCOPES.features);
  r.engine.report([badge('b1'), badge('b2')]);
  assert.deepEqual(r.big, [], 'a disposed engine (an account switch) never plays');
  assert.doesNotThrow(close);
});

test('engine: source markers outlive the record cap, so a long-used device never seeds a source again', () => {
  const storage = memory();
  const r = rig({ storage, settled: { value: true } });
  r.engine.report([], { source: 'features:community' });
  // Quiet moments are remembered at once; more of them than the cap holds.
  r.engine.report(Array.from({ length: SEEN_CAP + 5 }, (_, i) => ({ id: `l${i}`, kind: 'loss', scopes: [SCOPES.features], title: 'loss' })), { source: 'features:community' });
  const kept = record(storage);
  assert.equal(kept.length, SEEN_CAP);
  assert.ok(kept.includes('source:features:community'));
});

test('engine with feature moments: a badge seen through the Community never plays again when a league\'s read brings it', () => {
  // Badge events have no league: the same award key reaches every league the player is in.
  const reply = leagueId => ({ leagueId, season: 2026, awards: [], badges: [{ userId: 'u-1', badge: 'bullseye', key: 'bullseye:u-1:2026:6:SEA-DEN', week: 6,
    visibleAt: '2026-10-16T00:15:00Z', facts: { gameId: 'SEA-DEN', away: 'SEA', home: 'DEN', market: 'total', guess: 41 } }] });
  const storage = memory();
  storage.setItem(momentsKey('acct'), JSON.stringify(['source:features:community', 'source:features:L2']));
  const r = rig({ storage, settled: { value: true } });
  r.engine.open(SCOPES.features);
  r.engine.report(featureMoments(reply(null), 'u-1'), { source: 'features:community' });
  assert.equal(r.big.length, 1, 'it plays once, through the Community');
  r.engine.report(featureMoments(reply('L2'), 'u-1'), { source: 'features:L2' });
  assert.equal(r.big.length, 1, 'the league\'s read brings the same badge: it never plays again');
});

test('engine: a moment waiting from two sources survives one dropping it, and goes when both have', () => {
  const storage = memory();
  storage.setItem(momentsKey('acct'), JSON.stringify(['source:features:community', 'source:features:L2']));
  const r = rig({ storage });
  r.engine.report([badge('b1')], { source: 'features:community' });
  r.engine.report([badge('b1')], { source: 'features:L2' });
  assert.equal(r.engine.newCount(SCOPES.features), 1, 'one moment, however many reads bring it');
  r.engine.report([], { source: 'features:community' });
  assert.equal(r.engine.newCount(SCOPES.features), 1, 'the league\'s read still has it');
  r.engine.report([], { source: 'features:L2' });
  assert.equal(r.engine.newCount(SCOPES.features), 0, 'no read has it any more: it never plays');
});

// A moment two cards report (the shared Bullseye: the features read and a score read) waits on both and plays once.
test('engine: a moment reported by two sources with different scopes counts NEW on both scopes, plays once when either opens, and never replays', () => {
  const r = rig({ settled: { value: true } });
  const asFeatures = { id: 'bull', kind: 'badge', scopes: [SCOPES.features], title: 'Bullseye' };
  const asScore = { id: 'bull', kind: 'badge', scopes: [SCOPES.score], title: 'Bullseye' };
  r.engine.report([], { source: 'features:community' });
  r.engine.report([], { source: 'score:community' });
  r.engine.report([asFeatures], { source: 'features:community' });
  assert.equal(r.engine.newCount(SCOPES.features), 1);
  assert.equal(r.engine.newCount(SCOPES.score), 0, 'the features read alone does not make it NEW on the score card');
  r.engine.report([asScore], { source: 'score:community' });
  assert.equal(r.engine.newCount(SCOPES.features), 1, 'still NEW on the first scope');
  assert.equal(r.engine.newCount(SCOPES.score), 1, 'now NEW on the second scope too');
  assert.deepEqual(r.engine.newMoments(SCOPES.score).map(m => m.id), ['bull']);
  r.engine.open(SCOPES.score);
  assert.deepEqual(r.big, [['bull']], 'it plays when the score card opens');
  assert.equal(r.engine.newCount(SCOPES.features), 0, 'played, so no longer NEW anywhere');
  assert.equal(r.engine.newCount(SCOPES.score), 0);
  r.engine.open(SCOPES.features);
  r.engine.report([asFeatures], { source: 'features:community' });
  r.engine.report([asScore], { source: 'score:community' });
  assert.deepEqual(r.big, [['bull']], 'never replays on the other card or on a later read');
});

test('engine: the other order (the score read first) also waits on both scopes', () => {
  const r = rig({ settled: { value: true } });
  r.engine.report([], { source: 'features:community' });
  r.engine.report([], { source: 'score:community' });
  r.engine.report([{ id: 'bull', kind: 'badge', scopes: [SCOPES.score], title: 'Bullseye' }], { source: 'score:community' });
  r.engine.report([{ id: 'bull', kind: 'badge', scopes: [SCOPES.features], title: 'Bullseye' }], { source: 'features:community' });
  assert.deepEqual([r.engine.newCount(SCOPES.score), r.engine.newCount(SCOPES.features)], [1, 1]);
  r.engine.open(SCOPES.features);
  assert.deepEqual(r.big, [['bull']]);
  assert.equal(r.engine.newCount(SCOPES.score), 0);
});

test('engine: newMoments(scope) lists only that scope\'s waiting moments without the engine\'s own fields, and follows arrivals and plays', () => {
  const r = rig({ settled: { value: true } });
  const seen = [];
  r.engine.subscribe(() => seen.push(r.engine.newMoments(SCOPES.features).map(m => m.id).join('|')));
  r.engine.report([], { source: 'features:community' });
  assert.deepEqual(r.engine.newMoments(SCOPES.features), [], 'nothing waits on a seeding read');
  const other = { id: 'elsewhere', kind: 'badge', scopes: [SCOPES.league], title: 'Elsewhere' };
  r.engine.report([badge('b1'), other], { source: 'features:community' });
  const waiting = r.engine.newMoments(SCOPES.features);
  assert.deepEqual(waiting, [badge('b1')], 'the moment as its reader reported it: no late, no sources');
  assert.equal('late' in waiting[0] || 'sources' in waiting[0], false);
  assert.deepEqual(r.engine.newMoments(SCOPES.league).map(m => m.id), ['elsewhere'], 'each scope sees its own');
  r.engine.report([badge('b1'), badge('b2'), other], { source: 'features:community' });
  assert.deepEqual(r.engine.newMoments(SCOPES.features).map(m => m.id), ['b1', 'b2'], 'a new arrival joins, in arrival order');
  assert.ok(seen.includes('b1|b2'), 'subscribers are told when the list changes');
  r.engine.open(SCOPES.features);
  assert.deepEqual(r.engine.newMoments(SCOPES.features), [], 'a moment that plays leaves the list');
  assert.deepEqual(r.engine.newMoments(SCOPES.league).map(m => m.id), ['elsewhere'], 'other scopes keep waiting');
});
