import test from 'node:test';
import assert from 'node:assert/strict';
import { tabFadeNext, fadesNow } from '../web/src/next/shell/tabFade.js';

// D-69 4.3: a tab change made after the launch settled fades the content; nothing else does.
const step = (prev, tab, nav, settled = true) => tabFadeNext({ ...prev, tab, nav, settled });

test('before the launch settles a tab change only moves the starting tab: a deep link or restore never fades', () => {
  const s = step({ fadeNav: null, prevTab: 'home' }, 'play', 3, false);
  assert.deepEqual(s, { fadeNav: null, prevTab: 'play' });
  assert.equal(fadesNow(s, 3), false);
});

test('after settling, staying on the same tab never fades (a deep-linked screen does not fade on first press)', () => {
  const s = step({ fadeNav: null, prevTab: 'play' }, 'play', 4);
  assert.equal(fadesNow(s, 4), false);
});

test('after settling, the navigation that lands on another tab fades, and a re-render of it keeps the fade', () => {
  const s = step({ fadeNav: null, prevTab: 'home' }, 'bets', 5);
  assert.equal(fadesNow(s, 5), true);
  assert.equal(fadesNow(step(s, 'bets', 5), 5), true, 'a data load inside the same navigation is the same fade');
});

test('the next navigation inside that tab does not fade: a nesting card opening there rises on its own (no double motion)', () => {
  const tabbed = step({ fadeNav: null, prevTab: 'home' }, 'play', 6);
  const inside = step(tabbed, 'play', 7);
  assert.equal(fadesNow(inside, 7), false);
  assert.equal(fadesNow(step(inside, 'home', 8), 8), true, 'going back to the first tab is a tab change, so it fades again');
});
