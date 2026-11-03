import test from 'node:test';
import assert from 'node:assert/strict';
import { tabFadeNext } from '../web/src/next/shell/tabFade.js';

// D-69 4.3: the tab fade starts only from a tab change made after the launch settled.
test('before the launch settles a tab change moves the starting tab and never turns the fade on', () => {
  assert.deepEqual(tabFadeNext({ on: false, first: 'home', tab: 'play', settled: false }), { on: false, first: 'play' });
});
test('after settling, staying on the same tab keeps the fade off (a deep-linked screen does not fade on first press)', () => {
  const afterDeepLink = tabFadeNext({ on: false, first: 'home', tab: 'play', settled: false });
  assert.deepEqual(tabFadeNext({ ...afterDeepLink, tab: 'play', settled: true }), { on: false, first: 'play' });
});
test('after settling, a different tab turns the fade on', () => {
  assert.equal(tabFadeNext({ on: false, first: 'home', tab: 'bets', settled: true }).on, true);
});
test('once on, the fade stays on, even back on the first tab', () => {
  assert.equal(tabFadeNext({ on: true, first: 'home', tab: 'home', settled: true }).on, true);
});
