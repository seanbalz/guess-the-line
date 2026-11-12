import test from 'node:test';
import assert from 'node:assert/strict';
import { nbaHash, nbaReadFilters, nbaRoute, nbaView } from '../web/src/next/nba/route.js';
import { NBA_ROUTER } from '../web/src/next/nba/shellRoute.js';
import { connectHistory, startPlace } from '../web/src/next/shell/router.js';
import { initialState, reduce } from '../web/src/next/shell/state.js';
import { NBA_ON_SWITCH, sportOptions, SPORT_HOME } from '../web/src/next/epl/route.js';
import { sportSwitchHash } from '../web/src/next/sportSwitch.js';
import { sportAt } from '../web/src/next/sportAt.js';
import { nbaFrameContext } from '../web/src/next/shell/confirmedFrame.js';

// A minimal browser history: entries with state and URL, pushState/replaceState/back, and popstate listeners.
function fakeWindow(hash) {
  const entries = [{ state: null, url: `/${hash}` }];
  let index = 0;
  const listeners = new Set();
  const location = { pathname: '/', search: '', get hash() { return new URL(entries[index].url, 'http://x').hash; }, get href() { return entries[index].url; } };
  const fire = () => { for (const listener of [...listeners]) listener(); };
  const history = {
    scrollRestoration: 'auto',
    get state() { return entries[index].state; },
    get length() { return entries.length; },
    pushState(state, _, url) { entries.splice(index + 1); entries.push({ state, url: url ?? entries[index].url }); index += 1; },
    replaceState(state, _, url) { entries[index] = { state, url: url ?? entries[index].url }; },
    back() { if (index > 0) { index -= 1; fire(); } },
    go(delta) { index = Math.max(0, Math.min(entries.length - 1, index + delta)); fire(); },
  };
  return {
    location, history, entries: () => entries.map(entry => new URL(entry.url, 'http://x').hash), index: () => index,
    addEventListener: (type, fn) => { if (type === 'popstate') listeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === 'popstate') listeners.delete(fn); },
    /** The member follows a link to `hash`: the browser adds an entry, then fires popstate. */
    follow(next) { entries.splice(index + 1); entries.push({ state: null, url: `/${next}` }); index += 1; fire(); },
  };
}

test('contract: every v1 NBA address and any unknown #nba/ fragment maps to its new place', () => {
  const map = {
    '#nba/games': '#nba/research/games',
    '#nba/games?date=2026-10-21': '#nba/research/games?date=2026-10-21',
    '#nba/bets': '#nba/bets/open',
    '#nba/bets?status=all': '#nba/bets/open',
    '#nba/bets?status=pending&market=spread': '#nba/bets/open?market=spread',
    '#nba/bets?status=win': '#nba/bets/history?status=win',
    '#nba/history': '#nba/bets/history',
    '#nba/history?status=settled&market=spread&from=2026-10-01': '#nba/bets/history?market=spread&from=2026-10-01',
    '#nba/history?status=all': '#nba/bets/history?status=all',
    '#nba/research': '#nba/research/games',
    '#nba/research/games?date=not-a-date': '#nba/research/games',
    '#nba/unknown': '#nba/home',
    '#nba/bets/open/extra': '#nba/home',
    '#nba/': '#nba/home',
  };
  for (const [legacy, target] of Object.entries(map)) {
    const route = nbaRoute(legacy);
    assert.equal(route.legacy, true, legacy);
    assert.equal(nbaHash(route), target, legacy);
    assert.equal(NBA_ROUTER.isLegacyFragment(legacy), true, legacy);
  }
  for (const canonical of ['#nba/home', '#nba/play', '#nba/bets/open', '#nba/bets/history', '#nba/bets/history?status=win&market=total', '#nba/research/games', '#nba/research/games?date=2026-11-10']) {
    assert.equal(nbaRoute(canonical).legacy, false, canonical);
    assert.equal(NBA_ROUTER.fragmentFor(NBA_ROUTER.placeFromFragment(canonical).tab, NBA_ROUTER.placeFromFragment(canonical).view), canonical);
  }
  // Not NBA addresses: NFL and EPL routes, the in-page anchor and empty values.
  for (const hash of ['#home', '#bets/tracked', '#epl/home', '#nba-main', '#nba', '', null, undefined]) assert.equal(nbaRoute(hash), null, String(hash));
});

test('contract: a cold legacy link is replaced in place, adding no history entry, so Back never loops to it', () => {
  for (const [legacy, target] of [['#nba/bets', '#nba/bets/open'], ['#nba/games?date=2026-10-21', '#nba/research/games?date=2026-10-21'], ['#nba/history', '#nba/bets/history'], ['#nba/whatever', '#nba/home']]) {
    const win = fakeWindow(legacy);
    const place = startPlace(win, NBA_ROUTER);
    assert.equal(win.history.length, 1, `${legacy}: no entry added`);
    assert.deepEqual(win.entries(), [target], `${legacy}: replaced`);
    assert.equal(nbaHash(place), target);
  }
});

test('contract: following a legacy link while NBA shows rewrites that entry; Back then leaves it', () => {
  const win = fakeWindow('#nba/home');
  let state = initialState(startPlace(win, NBA_ROUTER));
  const connection = connectHistory(win, { getState: () => state, dispatch: action => { const prev = state; state = reduce(state, action); connection.sync(prev, state); }, route: NBA_ROUTER });
  connection.sync(null, state);
  win.follow('#nba/history?market=spread');
  assert.equal(state.tab, 'bets');
  assert.deepEqual(win.entries(), ['#nba/home', '#nba/bets/history?market=spread']);
  win.history.back();
  assert.equal(state.tab, 'home');
  assert.deepEqual(win.entries(), ['#nba/home', '#nba/bets/history?market=spread']);
  connection.disconnect();
});

test('contract: Open/History and filters are values on the Bets root (no Back loop), and only NBA keys survive', () => {
  assert.deepEqual(NBA_ROUTER.cleanPlace({ tab: 'bets', view: { pane: 'history', status: 'win', week: 8, leagueId: 'nfl', view: 'tracked' } }),
    { tab: 'bets', view: { pane: 'history', status: 'win', market: undefined, from: undefined, to: undefined } });
  assert.equal(NBA_ROUTER.cleanPlace({ tab: 'lines', view: {} }), null);
  // Restoring Open clears History's filters instead of keeping them.
  const history = initialState(NBA_ROUTER.placeFromFragment('#nba/bets/history?status=loss&market=total'));
  const restored = reduce(history, { type: 'restore', place: NBA_ROUTER.placeFromFragment('#nba/bets/open') });
  assert.deepEqual(nbaView('bets', restored.views.bets), { pane: 'open', status: undefined, market: undefined, from: undefined, to: undefined });
  // A pane change is not a navigation step: no trail, no detail Back bar.
  const open = initialState({ tab: 'bets', view: nbaView('bets', {}) });
  const switched = reduce(open, { type: 'view', tab: 'bets', patch: nbaView('bets', { pane: 'history' }) });
  assert.equal(switched.trail.length, 0);
  assert.equal(switched.nav, open.nav);
  assert.equal(switched.views.bets.pane, 'history');
  assert.deepEqual(nbaReadFilters({ pane: 'open', market: 'spread' }), { status: 'pending', market: 'spread' });
  assert.deepEqual(nbaReadFilters({ pane: 'history' }), { status: 'settled' });
  assert.deepEqual(nbaReadFilters({ pane: 'history', status: 'all', from: '2026-11-01' }), { from: '2026-11-01' });
  assert.deepEqual(nbaView('bets', { from: '2026-11-10', to: '2026-11-01' }).to, undefined, 'a To before From is dropped');
});

test('contract (D-85 item 6): NBA is on the switch by default; one NBA option when on, none when the flag is off', () => {
  assert.equal(NBA_ON_SWITCH, true, 'Sean: "Yes, show NBA" (November 11, 2026)');
  for (const epl of [false, true]) {
    assert.equal(sportOptions(epl).filter(option => option.value === 'nba').length, 1);
    assert.equal(sportOptions(epl, true).filter(option => option.value === 'nba').length, 1);
    assert.equal(sportOptions(epl, false).filter(option => option.value === 'nba').length, 0);
  }
  assert.deepEqual(sportOptions(false).map(option => option.value), ['nfl', 'nba'], 'without EPL access NBA still shows');
  assert.deepEqual(sportOptions(true, true).map(option => option.value), ['nfl', 'epl', 'nba']);
});

test('contract: switching to NBA keeps the tab only, and every #nba/ address opens NBA', () => {
  assert.equal(SPORT_HOME.nba, '#nba/home');
  assert.equal(sportSwitchHash('nba', '#bets/tracked?week=8&leagueId=sean-troy-luke'), '#nba/bets/open');
  assert.equal(sportSwitchHash('nba', '#research/fantasy?week=8'), '#nba/research/games');
  assert.equal(sportSwitchHash('nba', '#epl/play/guess'), '#nba/play');
  assert.equal(sportSwitchHash('nfl', '#nba/research/games?date=2026-11-10'), '#research');
  assert.equal(sportSwitchHash('epl', '#nba/bets/history'), '#epl/bets');
  for (const hash of ['#nba/home', '#nba/unknown', '#nba/games', '#nba/bets/history?status=win']) for (const current of ['nfl', 'nba', 'epl']) assert.equal(sportAt(hash, current), 'nba', `${hash} from ${current}`);
});

test('contract: every actual NBA tab uses the compact Prism frame; pages stay native', () => {
  for (const tab of ['home', 'play', 'bets', 'research']) assert.equal(nbaFrameContext(initialState({ tab, view: nbaView(tab, {}) })), `nba-${tab}`);
  assert.equal(nbaFrameContext(reduce(initialState({ tab: 'home' }), { type: 'open', layer: { id: 'page.history' } })), null);
});
