// tests/next-features-streak.test.mjs
// D-69 "Pick streak grows" (small): the detector (web/src/next/features/streakMoment.js) and how the engine plays it
// from fresh features reads: once per longer streak, quiet when it breaks, NEW on the Badges tile while it waits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickStreakMoment, streakMoments } from '../web/src/next/features/streakMoment.js';
import { featureMoments } from '../web/src/next/features/model.js';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';
import { SCOPES, sizeOf } from '../web/src/next/moments/catalog.js';
import { momentsKey } from '../web/src/next/moments/seen.js';

const YOU = 'u-you', ANA = 'u-ana';
const reply = (current, best = current, season = 2026) => ({ leagueId: null, season, ran: true, badges: [], awards: [], seasonWinners: null,
  streaks: [{ userId: YOU, pick: { current, best }, bets: { current: 0, best: 0 } }, { userId: ANA, pick: { current: 9, best: 9 }, bets: { current: 0, best: 0 } }] });
const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
function rig(storage = memory()) {
  const small = [], big = [], settled = { value: false };
  const engine = createMomentsEngine({ account: YOU, storage, isSettled: () => settled.value, hasNavigated: () => settled.value,
    onBig: ms => big.push(ms.map(m => m.id)), onSmall: m => small.push(m.id), setTimer: fn => { fn(); return 0; }, now: () => 0 });
  // What useFeatures does with every fresh read: one report of the badges, awards and streak moments.
  const read = data => engine.report([...featureMoments(data, YOU), ...streakMoments(data, YOU)], { source: 'features:community' });
  return { engine, small, big, settled, read, storage };
}

test('detector: your Pick streak as one small moment named by season, length and best; none for 0, no read or another player', () => {
  const m = pickStreakMoment(reply(4, 6), YOU);
  assert.deepEqual(m, { id: 'streak:pick:2026:4:6', kind: 'streak', scopes: [SCOPES.features], title: 'Pick streak', meta: '4 weeks in a row' });
  assert.equal(sizeOf(m.kind), 'small');
  assert.equal(pickStreakMoment(reply(1), YOU).meta, '1 week in a row');
  assert.equal(pickStreakMoment(reply(5, 3), YOU).id, 'streak:pick:2026:5:5', 'a best below the current reads as the current');
  assert.equal(pickStreakMoment(reply(0, 6), YOU), null, 'a broken streak is quiet');
  assert.equal(pickStreakMoment(reply(4, 6, null), YOU), null, 'no season, no id');
  assert.equal(pickStreakMoment(reply(4), 'u-nobody'), null);
  assert.equal(pickStreakMoment(null, YOU), null, 'a pending read (no data yet) confirms nothing');
  assert.deepEqual(streakMoments(reply(0), YOU), []);
});

test('engine: the first read seeds it; a longer streak in a later read plays once in place; a break and the same length stay quiet', () => {
  const r = rig();
  r.engine.open(SCOPES.features);
  r.read(reply(3, 3));
  assert.deepEqual(r.small, [], 'a first read on this device shows the streak as it is');
  r.settled.value = true;
  r.read(reply(3, 3));
  assert.deepEqual(r.small, [], 'the same streak again is not a moment');
  r.read(reply(4, 4));
  assert.deepEqual(r.small, ['streak:pick:2026:4:4'], 'it grew while you watched: one small pop in place');
  assert.deepEqual(r.big, [], 'never a big moment');
  r.read(reply(4, 4));
  assert.deepEqual(r.small, ['streak:pick:2026:4:4'], 'never replays');
  r.read(reply(0, 4));
  assert.deepEqual(r.small, ['streak:pick:2026:4:4'], 'a break is quiet');
  r.read(reply(1, 4));
  assert.deepEqual(r.small, ['streak:pick:2026:4:4', 'streak:pick:2026:1:4'], 'growing again from the break plays');
});

test('engine: a streak that grew while you were away waits as NEW on the Badges tile and plays when Badges and awards opens', () => {
  const yesterday = rig();
  yesterday.read(reply(2, 2));
  const today = rig(yesterday.storage); // a new session on the same device
  today.settled.value = true; // the member has pressed and moved around
  today.read(reply(3, 3)); // the session's first read brings what changed while away: it waits, pressed or not
  assert.equal(today.engine.newCount(SCOPES.features), 1, 'the Badges tile shows NEW');
  assert.deepEqual(today.engine.newMoments(SCOPES.features), [pickStreakMoment(reply(3, 3), YOU)], 'the waiting moment as reported, without the engine’s own fields');
  today.engine.open(SCOPES.play);
  assert.deepEqual(today.small, [], 'the Play landing does not play it');
  today.engine.open(SCOPES.features);
  assert.deepEqual(today.small, ['streak:pick:2026:3:3'], 'opening Badges and awards plays it');
  assert.equal(today.engine.newCount(SCOPES.features), 0);
});

test('a badge moment names its catalog badge, so the grid marks that badge NEW while it waits', () => {
  const data = { ...reply(0), badges: [{ userId: YOU, badge: 'bullseye', key: 'bullseye:u-you:2026:6:SEA-DEN', week: 6, visibleAt: '2026-10-16T00:15:00Z', facts: { gameId: 'SEA-DEN', away: 'SEA', home: 'DEN', market: 'total', guess: 41 } }] };
  assert.deepEqual(featureMoments(data, YOU).map(m => [m.kind, m.badge]), [['badge', 'bullseye']]);
});

test('one exact guess, one celebration: a Bullseye badge shares Your score\'s Bullseye id; one already celebrated never replays', () => {
  const memoryWith = ids => { const m = memory(); m.setItem(momentsKey(YOU), JSON.stringify(ids)); return m; };
  const data = { ...reply(0), badges: [{ userId: YOU, badge: 'bullseye', key: 'bullseye:u-you:2026:6:SEA-DEN:total', week: 6, visibleAt: '2026-10-16T00:15:00Z', facts: { gameId: 'SEA-DEN', market: 'total', guess: 41, points: 10 } }] };
  assert.deepEqual(featureMoments(data, YOU).map(m => [m.id, m.aka]), [['score:bullseye:2026:6:guess_total:SEA-DEN', ['badge:bullseye:u-you:2026:6:SEA-DEN:total']]]);
  const played = rig(memoryWith(['source:features:community', 'source:score']));
  played.settled.value = true;
  played.engine.open('score');
  played.engine.report([{ id: 'score:bullseye:2026:6:guess_total:SEA-DEN', kind: 'bullseye', scopes: ['score'], title: 'Bullseye' }], { source: 'score' });
  assert.equal(played.big.length, 1, 'Your score plays it');
  played.engine.open(SCOPES.features);
  played.read(data);
  assert.equal(played.big.length, 1, 'the badge is the same moment: it never plays again');
  const old = rig(memoryWith(['source:features:community', 'badge:bullseye:u-you:2026:6:SEA-DEN:total']));
  old.settled.value = true;
  old.engine.open(SCOPES.features);
  old.read(data);
  assert.deepEqual(old.big, [], 'celebrated under its award key before the ids were shared: never replays');
  assert.ok(JSON.parse(old.storage.getItem(momentsKey(YOU))).includes('score:bullseye:2026:6:guess_total:SEA-DEN'), 'and the shared id is remembered');
});

test('a Bullseye seeded by Your score\'s first look stays quiet when its badge arrives', () => {
  const m = memory();
  m.setItem(momentsKey(YOU), JSON.stringify(['source:features:community']));
  const data = { ...reply(0), badges: [{ userId: YOU, badge: 'bullseye', key: 'bullseye:u-you:2026:6:SEA-DEN:total', week: 6, visibleAt: '2026-10-16T00:15:00Z', facts: { gameId: 'SEA-DEN', market: 'total', guess: 41, points: 10 } }] };
  // The features source has been read on this device before; Your score has not (the Play landing mounts it first).
  const r = rig(m);
  r.settled.value = true;
  r.engine.open(SCOPES.play);
  r.engine.report([{ id: 'score:bullseye:2026:6:guess_total:SEA-DEN', kind: 'bullseye', scopes: ['score'], title: 'Bullseye' }], { source: 'score' });
  assert.equal(r.big.length, 0, 'the first read of Your score on this device seeds the Bullseye: it does not play');
  r.engine.open(SCOPES.features);
  r.read(data);
  assert.deepEqual(r.big, [], 'the badge carries the same id: nothing plays');
  assert.deepEqual(r.small, []);
  assert.equal(r.engine.newCount(SCOPES.features), 0, 'and nothing waits as NEW');
});
