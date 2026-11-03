// D-69 big moments: what the player sees and feels, and when motion counts as reduced. Pure code, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { flashItem, playBig } from '../web/src/next/moments/play.js';
import { motionReduced } from '../web/src/next/ui/motion.js';

const moment = (id, extra = {}) => ({ id, title: `T${id}`, meta: `M${id}`, parts: [id], icon: 'trophy', rarity: 'rare', ...extra });
const phone = () => { const calls = []; return { calls, vibrate(ms) { calls.push(ms); return true; } }; };

test('playBig: every big moment arrives as one ov.flash card, each keyed by its moment id', () => {
  const shown = [];
  const nav = phone();
  const ok = playBig([moment('a'), moment('b')], { showOverlay: (id, args) => shown.push([id, args]), nav });
  assert.equal(ok, true);
  assert.equal(shown.length, 1, 'one card however many moments');
  assert.equal(shown[0][0], 'ov.flash');
  assert.deepEqual(shown[0][1].items, [flashItem(moment('a')), flashItem(moment('b'))]);
  assert.deepEqual(shown[0][1].items[0], { key: 'a', title: 'Ta', meta: 'Ma', parts: ['a'], icon: 'trophy', rarity: 'rare' });
});

test('playBig: a 20ms win buzz, and no buzz at all under reduced motion', () => {
  const loud = phone();
  playBig([moment('a')], { showOverlay() {}, nav: loud });
  assert.deepEqual(loud.calls, [20]);
  const quiet = phone();
  const shown = [];
  playBig([moment('a')], { showOverlay: (...a) => shown.push(a), reduced: true, nav: quiet });
  assert.deepEqual(quiet.calls, [], 'reduced motion stops the buzz');
  assert.equal(shown.length, 1, 'the card still shows');
});

test('playBig: nothing to play, or nowhere to show it, shows and buzzes nothing', () => {
  const nav = phone();
  let shown = 0;
  assert.equal(playBig([], { showOverlay: () => { shown += 1; }, nav }), false);
  assert.equal(playBig([moment('a')], { nav }), false);
  assert.equal(playBig(undefined, { showOverlay: () => { shown += 1; }, nav }), false);
  assert.equal(shown, 0);
  assert.deepEqual(nav.calls, []);
});

test('motionReduced: the app setting on an ancestor, the device setting, or neither', () => {
  assert.equal(motionReduced({ closest: sel => (sel === '[data-motion="reduce"]' ? {} : null) }), true);
  assert.equal(motionReduced({ closest: () => null }), false);
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    globalThis.window = { matchMedia: q => ({ matches: q === '(prefers-reduced-motion: reduce)' }) };
    assert.equal(motionReduced({ closest: () => null }), true, 'the device setting alone stops motion');
  } finally {
    if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window;
  }
});
