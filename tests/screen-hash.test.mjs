import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCREEN, MARKET_SLUGS, SCREENS, currentMarket, currentScreen, fragmentOf, goScreen, marketFromHash, placeFromHash, screenFromHash, setMarket } from '../web/src/screenHash.js';

test('only the Community screens are read from the fragment; anything else leaves the screen alone', () => {
  assert.deepEqual(SCREENS, ['feed', 'picks', 'history', 'fantasy', 'groups']);
  assert.equal(screenFromHash(''), DEFAULT_SCREEN);
  assert.equal(screenFromHash('#'), DEFAULT_SCREEN);
  assert.equal(screenFromHash(undefined), DEFAULT_SCREEN);
  for (const name of SCREENS) { assert.equal(screenFromHash(`#${name}`), name); assert.equal(screenFromHash(name), name); }
  // Skip-link targets, Supabase's recovery fragment and a stripped invitation are not screens.
  for (const other of ['#main', '#picks-due', '#type=recovery', '#access_token=x&type=recovery', '#invite=abc', '#Picks', '#games', '#history-x', '#History']) assert.equal(screenFromHash(other), null);
  // The history view is a bare screen: no market slug, so a reload lands on the same tab with the week list in component state.
  assert.deepEqual(placeFromHash('#history'), { screen: 'history', market: null });
  assert.equal(fragmentOf({ screen: 'history', market: 'guess_total' }), '#history', 'only Picks carries a market');
});

test('the Picks entry carries its market (#picks-spread, #picks-total); a bare #picks names none and an unknown market is not a screen', () => {
  assert.deepEqual(MARKET_SLUGS, { guess_spread: 'spread', guess_total: 'total' });
  assert.deepEqual(placeFromHash('#picks-spread'), { screen: 'picks', market: 'guess_spread' });
  assert.deepEqual(placeFromHash('#picks-total'), { screen: 'picks', market: 'guess_total' });
  assert.deepEqual(placeFromHash('#picks'), { screen: 'picks', market: null });
  assert.deepEqual(placeFromHash(''), { screen: 'feed', market: null });
  assert.equal(screenFromHash('#picks-total'), 'picks');
  assert.equal(marketFromHash('#picks-total'), 'guess_total');
  assert.equal(marketFromHash('#picks'), null);
  assert.equal(marketFromHash('#feed'), null);
  for (const other of ['#picks-', '#picks-challenge', '#picks-Total', '#picks-guess_total', '#feed-total', '#picks-total-x', '#main']) { assert.equal(placeFromHash(other), null); assert.equal(marketFromHash(other), null); }
  assert.equal(fragmentOf({ screen: 'picks', market: 'guess_total' }), '#picks-total');
  assert.equal(fragmentOf({ screen: 'picks', market: null }), '#picks');
  assert.equal(fragmentOf({ screen: 'feed', market: 'guess_total' }), '#feed', 'only Picks carries a market');
});

test('moving between screens works without a browser history (the screen still changes in memory)', () => {
  assert.equal(currentScreen(), DEFAULT_SCREEN);
  assert.equal(currentMarket(), null);
  assert.equal(setMarket('guess_total'), false, 'the feed has no market');
  assert.equal(goScreen('picks'), true);
  assert.equal(currentScreen(), 'picks');
  assert.equal(currentMarket(), null, 'the Picks tab opens bare; the screen settles the market');
  assert.equal(goScreen('picks'), false, 'the open screen is never pushed twice');
  assert.equal(goScreen('main'), false, 'an unknown screen is refused');
  assert.equal(currentScreen(), 'picks');
  // The market is written into the open Picks entry, never pushed, and never an unknown market.
  assert.equal(setMarket('guess_total'), true);
  assert.equal(currentMarket(), 'guess_total');
  assert.equal(setMarket('guess_total'), false, 'the open market is not written twice');
  assert.equal(setMarket('betting_challenge'), false);
  assert.equal(currentMarket(), 'guess_total');
  assert.equal(setMarket('guess_spread'), true);
  assert.equal(currentMarket(), 'guess_spread');
  assert.equal(goScreen('history'), true);
  assert.equal(currentScreen(), 'history');
  assert.equal(currentMarket(), null, 'leaving Picks drops the market from the place');
  assert.equal(setMarket('guess_total'), false, 'the history view has no market entry');
  assert.equal(goScreen('groups', { replace: true }), true);
  assert.equal(currentScreen(), 'groups');
  assert.equal(goScreen('feed'), true);
  assert.equal(currentScreen(), 'feed');
});
