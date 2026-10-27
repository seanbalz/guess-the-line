import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../web/src/next/home/countUp.js';

// Design lane, item 1: the score count-up's rules (web/src/next/home/countUp.js). Each test names the contract it guards.
// The component's timing (600 ms, the `enter` easing) is checked against the tokens in tests/next-count-up.test.jsx, and
// the counting itself in a real browser in tests/cloud-browser/next-design-home-league.spec.js.
const tokens = JSON.parse(fs.readFileSync(new URL('../design/tokens-next.json', import.meta.url), 'utf8'));

function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return { map, getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)) };
}
const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };

test('storage key: per account and figure under gtl., and none without both (another account never reads yours)', () => {
  assert.equal(C.countUpKey('u-1', 'community.guess_spread.season.u-1'), 'gtl.next.countUp.v1.u-1.community.guess_spread.season.u-1');
  assert.notEqual(C.countUpKey('u-1', 'x'), C.countUpKey('u-2', 'x'));
  assert.equal(C.countUpKey('a b', 'x'), 'gtl.next.countUp.v1.a%20b.x');
  for (const [account, figure] of [[null, 'x'], ['', 'x'], ['u-1', ''], ['u-1', null]]) assert.equal(C.countUpKey(account, figure), null);
});

test('remembered value: only a finite server number is written; garbage, nothing or blocked storage reads as null, never 0', () => {
  const store = memoryStorage();
  C.writeSeen('k', 46.5, store);
  assert.equal(C.readSeen('k', store), 46.5);
  for (const bad of [null, undefined, Number.NaN, Infinity, '12']) C.writeSeen('bad', bad, store);
  assert.equal(store.map.has('bad'), false, 'a missing value never overwrites what the device saw');
  for (const raw of ['', ' ', 'abc', 'NaN']) assert.equal(C.readSeen('r', memoryStorage({ r: raw })), null, raw);
  assert.equal(C.readSeen('missing', store), null);
  assert.equal(C.readSeen('k', blocked), null);
  assert.doesNotThrow(() => C.writeSeen('k', 3, blocked));
  assert.equal(C.readSeen(null, store), null);
});

test('plan: it counts only from a value this device saw that differs, never from 0, and never under reduced motion or a hidden page', () => {
  assert.deepEqual(C.countUpPlan({ seen: null, value: 20 }), { animate: false, from: 20, to: 20 }, 'first sighting shows the number at once');
  assert.deepEqual(C.countUpPlan({ seen: 12, value: 20 }), { animate: true, from: 12, to: 20 });
  assert.deepEqual(C.countUpPlan({ seen: 20, value: 12 }), { animate: true, from: 20, to: 12 }, 'a total can count down');
  assert.equal(C.countUpPlan({ seen: 20, value: 20 }).animate, false);
  assert.equal(C.countUpPlan({ seen: 12, value: 20, reduced: true }).animate, false);
  assert.equal(C.countUpPlan({ seen: 12, value: 20, reduced: true }).from, 20, 'reduced motion starts (and ends) at the final value');
  assert.equal(C.countUpPlan({ seen: 12, value: 20, hidden: true }).animate, false);
  assert.deepEqual(C.countUpPlan({ seen: 12, value: null }), { animate: false, from: null, to: null }, 'no server value, nothing to count');
});

test('frames: the last frame is exactly the server value, and no frame leaves the range between the two values', () => {
  const pop = C.bezierEasing(C.parseBezier(tokens.ease.pop)); // overshoots past 1 on purpose
  let overshoot = 0;
  for (let p = 0; p <= 1; p += 0.01) overshoot = Math.max(overshoot, pop(p));
  assert.ok(overshoot > 1, 'the pop easing does overshoot, so the clamp is what keeps the frames honest');
  for (const [from, to] of [[12, 20], [20, 12], [-3, 4.5], [10, 10.5]]) {
    for (let p = 0; p < 1; p += 0.05) {
      const frame = C.frameAt({ from, to, progress: p, ease: pop });
      assert.ok(frame >= Math.min(from, to) && frame <= Math.max(from, to), `${from}→${to} at ${p}: ${frame}`);
    }
    assert.equal(C.frameAt({ from, to, progress: 1, ease: pop }), to);
    assert.equal(C.frameAt({ from, to, progress: 1.7 }), to);
  }
  // Frames are written at the finer of the two values' precision (halves stay halves, whole numbers stay whole).
  for (let p = 0; p < 1; p += 0.1) assert.equal(C.decimalsOf(C.frameAt({ from: 12, to: 20, progress: p })), 0);
  for (let p = 0; p < 1; p += 0.1) assert.ok(C.decimalsOf(C.frameAt({ from: 12, to: 20.5, progress: p })) <= 1);
});

test('the token easing: enter decelerates from 0 to 1 without overshoot; a bad token falls back to linear', () => {
  const points = C.parseBezier(tokens.ease.enter);
  assert.deepEqual(points, [0.05, 0.7, 0.1, 1]);
  const ease = C.bezierEasing(points);
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  let last = 0;
  for (let p = 0.02; p < 1; p += 0.02) { const y = ease(p); assert.ok(y >= last - 1e-9 && y <= 1, `monotone at ${p}`); last = y; }
  assert.ok(ease(0.25) > 0.5, 'most of the count happens early, so the number settles gently');
  for (const bad of ['ease-in', 'cubic-bezier(2, 0, 0, 1)', '', null]) assert.equal(C.parseBezier(bad), null, String(bad));
  assert.equal(C.bezierEasing(null)(0.3), 0.3);
});

test('formatting: the real minus sign, whole numbers and halves as the board writes them, and "—" for nothing', () => {
  assert.equal(C.formatCount(20), '20');
  assert.equal(C.formatCount(46.5), '46.5');
  assert.equal(C.formatCount(-3), '−3');
  assert.equal(C.formatCount(-0.04, 1), '0.0', 'no minus on a value that rounds to zero');
  assert.equal(C.formatCount(12, 1), '12.0', 'a frame keeps the precision of the count');
  assert.equal(C.formatCount(null), '—');
  assert.equal(C.formatCount(Number.NaN), '—');
});

test('timing: the big token held to the 600 ms cap with the enter easing; without the tokens, the cap and a plain count', () => {
  const css = { '--gx-dur-big': tokens.dur.big, '--gx-ease-enter': tokens.ease.enter };
  const timing = C.countUpTiming(name => css[name]);
  assert.equal(timing.ms, 600);
  assert.ok(Math.abs(timing.ease(0.25) - C.bezierEasing(C.parseBezier(tokens.ease.enter))(0.25)) < 1e-9);
  assert.equal(C.countUpTiming(name => ({ '--gx-dur-big': '900ms' })[name]).ms, C.COUNT_UP_CAP_MS, 'never longer than the brand cap');
  const none = C.countUpTiming();
  assert.equal(none.ms, 600);
  assert.equal(none.ease(0.3), 0.3);
  assert.equal(C.countUpTiming(() => 'nonsense').ms, 600);
  // The built stylesheet is minified: 600ms arrives as ".6s" and the easing as "cubic-bezier(.05, .7, .1, 1)" (seen in
  // the browser run); both must time the same 600 ms count, never a 0.6 ms one.
  const built = C.countUpTiming(name => ({ '--gx-dur-big': '.6s', '--gx-ease-enter': 'cubic-bezier(.05, .7, .1, 1)' })[name]);
  assert.equal(built.ms, 600);
  assert.ok(Math.abs(built.ease(0.25) - timing.ease(0.25)) < 1e-9);
  for (const [text, ms] of [['600ms', 600], ['.6s', 600], ['0.24s', 240], [' 100ms ', 100], ['600', Number.NaN], ['-1s', Number.NaN], ['', Number.NaN]]) {
    assert.ok(Object.is(C.cssTimeMs(text), ms), `${text} → ${ms}`);
  }
});
