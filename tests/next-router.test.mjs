// Redesign build plan stage 10: the new app's address and Back button (web/src/next/shell/router.js) against a fake
// window whose history behaves like a browser's: pushState drops forward entries, back() and forward() traverse later
// (popstate arrives as its own task), and a traversal to an entry with another fragment fires popstate too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectHistory, fragmentFor, isLegacyFragment, placeFromFragment, startPlace } from '../web/src/next/shell/router.js';
import { initialState, layer, reduce } from '../web/src/next/shell/state.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function settle() { for (let i = 0; i < 6; i += 1) await tick(); }

function fakeWindow(start = 'https://gtl.test/') {
  const entries = [{ url: new URL(start), state: null }];
  let index = 0;
  const listeners = new Set();
  const current = () => entries[index];
  const location = {
    get href() { return current().url.href; },
    get hash() { return current().url.hash; },
    get pathname() { return current().url.pathname; },
    get search() { return current().url.search; },
  };
  const traverse = delta => {
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    setTimeout(() => { index = target; for (const listener of listeners) listener({ state: current().state }); }, 0);
  };
  const history = {
    get state() { return current().state; },
    get length() { return entries.length; },
    pushState(state, _title, url) { entries.splice(index + 1, Infinity, { url: new URL(url, current().url), state: structuredClone(state) }); index += 1; },
    replaceState(state, _title, url) { entries[index] = { url: new URL(url ?? current().url.href, current().url), state: structuredClone(state) }; },
    back() { traverse(-1); },
    forward() { traverse(1); },
  };
  /** A link to a fragment followed in the page: a new entry, then popstate (as browsers fire for a fragment change). */
  const follow = fragment => {
    entries.splice(index + 1, Infinity, { url: new URL(fragment, current().url), state: null });
    index += 1;
    setTimeout(() => { for (const listener of listeners) listener({ state: null }); }, 0);
  };
  return {
    history,
    location,
    addEventListener(type, fn) { if (type === 'popstate') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'popstate') listeners.delete(fn); },
    follow,
    /** The entries as "fragment" or "fragment+layer", the current one in brackets. */
    stack: () => entries.map((entry, i) => { const name = `${entry.url.hash || '(none)'}${entry.state?.gxLayer ? '+layer' : ''}`; return i === index ? `[${name}]` : name; }),
    listeners,
  };
}

/** The shell's loop in miniature: the reducer, and sync() after every change, as Shell.jsx's effect does. */
function app(win, confirmLeave) {
  let state = initialState(startPlace(win));
  const connection = connectHistory(win, { getState: () => state, confirmLeave, dispatch: action => { const prev = state; state = reduce(state, action); connection.sync(prev, state); } });
  connection.sync(null, state);
  const dispatch = action => { const prev = state; state = reduce(state, action); connection.sync(prev, state); };
  return { get state() { return state; }, dispatch, connection, open: (id, args) => dispatch({ type: 'open', layer: layer(id, args) }) };
}

test('fragments: the new app\'s tabs, the old app\'s screens on the way in, and the ones left alone', () => {
  const cases = {
    '': { tab: 'home' }, '#': { tab: 'home' }, '#home': { tab: 'home' }, '#play': { tab: 'play' }, '#bets': { tab: 'bets' }, '#lines': { tab: 'lines' }, '#league': { tab: 'league' }, '#fantasy': { tab: 'fantasy' },
    '#picks': { tab: 'play' }, '#picks-spread': { tab: 'play', view: { market: 'spread' } }, '#picks-total': { tab: 'play', view: { market: 'total' } }, '#picks-week': { tab: 'play' },
    '#feed': { tab: 'league', view: { view: 'feed' } }, '#groups': { tab: 'home', layer: { id: 'sh.switcher' } },
    '#main': null, '#picks-due': null, '#type=recovery': null, '#access_token=x&type=signup': null, '#invite=abc': null, '#picks=1': null, '#history': null, '#Play': null, '#unknown': null,
  };
  for (const [fragment, place] of Object.entries(cases)) assert.deepEqual(placeFromFragment(fragment), place, fragment);
  assert.deepEqual(['home', 'play', 'bets', 'lines', 'league', 'fantasy', 'nope'].map(fragmentFor), ['#home', '#play', '#bets', '#lines', '#league', '#fantasy', '#home']);
  assert.deepEqual(['#picks', '#picks-total', '#feed', '#groups', '#play', '', '#main', '#x=1'].map(isLegacyFragment), [true, true, true, true, false, false, false, false]);
});

test('a legacy fragment is read once and rewritten in place; the ones left alone are never rewritten', () => {
  for (const [start, tab, view, fragment] of [['#picks-total', 'play', { market: 'total' }, '#play'], ['#feed', 'league', { view: 'feed' }, '#league'], ['#picks', 'play', {}, '#play']]) {
    const win = fakeWindow(`https://gtl.test/?app=next${start}`);
    const { state } = app(win);
    assert.equal(state.tab, tab, start);
    assert.deepEqual(state.views[tab], view, start);
    assert.deepEqual(win.stack(), [`[${fragment}]`], `${start}: no new entry`);
    assert.equal(win.location.search, '?app=next', 'the query stays');
  }
  for (const start of ['#main', '#picks-due', '#type=recovery', '#history']) {
    const win = fakeWindow(`https://gtl.test/${start}`);
    const { state } = app(win);
    assert.equal(state.tab, 'home');
    assert.deepEqual(win.stack(), [`[${start}]`], start);
  }
});

test('#groups opens the switcher over Home; Back closes it and leaves the address on Home', async () => {
  const win = fakeWindow('https://gtl.test/#groups');
  const shell = app(win);
  assert.deepEqual(shell.state.sheets.map(s => s.id), ['sh.switcher']);
  assert.deepEqual(win.stack(), ['#home', '[#home+layer]']);
  win.history.back();
  await settle();
  assert.deepEqual(shell.state.sheets, []);
  assert.deepEqual(win.stack(), ['[#home]', '#home+layer']);
});

test('a tab change is one history entry; Back and Forward move between tabs without adding any', async () => {
  const win = fakeWindow('https://gtl.test/');
  const shell = app(win);
  shell.dispatch({ type: 'tab', tab: 'play' });
  shell.dispatch({ type: 'tab', tab: 'league' });
  shell.dispatch({ type: 'tab', tab: 'league' }); // the tab already showing adds nothing
  assert.deepEqual(win.stack(), ['(none)', '#play', '[#league]']);
  win.history.back();
  await settle();
  assert.equal(shell.state.tab, 'play');
  win.history.back();
  await settle();
  assert.equal(shell.state.tab, 'home');
  win.history.forward();
  await settle();
  assert.equal(shell.state.tab, 'play');
  assert.deepEqual(win.stack(), ['(none)', '[#play]', '#league']);
});

test('Back and legacy links preserve the active form when leaving is declined, then navigate when accepted', async () => {
  const win = fakeWindow('https://gtl.test/#home');
  let allow = false;
  let prompts = 0;
  const shell = app(win, () => { prompts += 1; return allow; });
  shell.dispatch({ type: 'tab', tab: 'bets' });
  win.history.back();
  await settle();
  assert.equal(shell.state.tab, 'bets');
  assert.equal(win.location.hash, '#bets');
  assert.equal(prompts, 1);
  win.follow('#picks-total');
  await settle();
  assert.equal(shell.state.tab, 'bets');
  assert.equal(win.location.hash, '#bets');
  allow = true;
  win.follow('#picks-total');
  await settle();
  assert.equal(shell.state.tab, 'play');
  assert.equal(shell.state.views.play.market, 'total');
  assert.equal(win.location.hash, '#play');
});

test('Back from a tab to the entry a visit started on (#main, a sign-in fragment) shows Home and adds nothing', async () => {
  const win = fakeWindow('https://gtl.test/#main');
  const shell = app(win);
  shell.dispatch({ type: 'tab', tab: 'bets' });
  assert.deepEqual(win.stack(), ['#main', '[#bets]']);
  win.history.back();
  await settle();
  assert.equal(shell.state.tab, 'home');
  assert.deepEqual(win.stack(), ['[#main]', '#bets']);
});

test('a layer adds one entry, so Back closes the top layer, one per press, and then moves between tabs', async () => {
  const win = fakeWindow('https://gtl.test/');
  const shell = app(win);
  shell.dispatch({ type: 'tab', tab: 'lines' });
  shell.open('sh.game', { game: 'g1' });
  shell.open('sh.everyone', { market: 'spread' });
  shell.open('dlg.revealForfeit', { market: 'spread', game: 'g1' });
  assert.deepEqual(win.stack(), ['(none)', '#lines', '[#lines+layer]'], 'one entry for any number of layers');
  for (const left of [2, 1, 0]) {
    win.history.back();
    await settle();
    const open = shell.state.sheets.length + (shell.state.dialog ? 1 : 0);
    assert.equal(open, left);
    assert.equal(shell.state.tab, 'lines');
    assert.deepEqual(win.stack(), left ? ['(none)', '#lines', '[#lines+layer]'] : ['(none)', '[#lines]', '#lines+layer']);
  }
  win.history.back();
  await settle();
  assert.equal(shell.state.tab, 'home');
});

test('closing the last layer with its own button takes its entry back off, so the next Back leaves the tab', async () => {
  const win = fakeWindow('https://gtl.test/');
  const shell = app(win);
  shell.dispatch({ type: 'tab', tab: 'play' });
  shell.open('sh.menu');
  shell.dispatch({ type: 'sheetArgs', patch: { sub: 'appearance' } }); // a sub-view is not an entry
  assert.deepEqual(win.stack(), ['(none)', '#play', '[#play+layer]']);
  shell.dispatch({ type: 'close', kind: 'sheet' });
  await settle();
  assert.deepEqual(win.stack(), ['(none)', '[#play]', '#play+layer']);
  win.history.back();
  await settle();
  assert.equal(shell.state.tab, 'home');
  // Forward onto the old layer entry with nothing open: it is cleared, and the tab is unchanged.
  win.history.forward();
  await settle();
  win.history.forward();
  await settle();
  assert.equal(shell.state.tab, 'play');
  assert.deepEqual(win.stack(), ['(none)', '#play', '[#play]']);
  assert.deepEqual(shell.state.sheets, []);
});

test('a tab tapped while a layer is open goes back over the layer entry first, then adds the tab', async () => {
  const win = fakeWindow('https://gtl.test/#home');
  const shell = app(win);
  shell.open('sh.menu');
  shell.dispatch({ type: 'tab', tab: 'bets' });
  assert.equal(shell.state.tab, 'bets');
  await settle();
  assert.deepEqual(win.stack(), ['#home', '[#bets]']);
  // A layer opened before the traversal lands still gets its entry.
  shell.open('sh.menu');
  shell.dispatch({ type: 'go', tab: 'league', view: { view: 'feed' } });
  shell.open('sh.switcher');
  await settle();
  assert.deepEqual(win.stack(), ['#home', '#bets', '#league', '[#league+layer]']);
  win.history.back();
  await settle();
  assert.deepEqual(shell.state.sheets, []);
  win.history.back();
  await settle();
  assert.equal(shell.state.tab, 'bets');
  assert.deepEqual(shell.state.sheets, [], 'Back never reopens a layer');
});

test('an old link followed in the page is read like one a visit starts on, and its entry rewritten', async () => {
  const win = fakeWindow('https://gtl.test/#play');
  const shell = app(win);
  win.follow('#feed');
  await settle();
  assert.equal(shell.state.tab, 'league');
  assert.deepEqual(shell.state.views.league, { view: 'feed' });
  assert.deepEqual(win.stack(), ['#play', '[#league]']);
  win.follow('#picks-total');
  await settle();
  assert.deepEqual([shell.state.tab, shell.state.views.play.market], ['play', 'total']);
  win.follow('#groups');
  await settle();
  assert.deepEqual([shell.state.tab, shell.state.sheets.map(s => s.id)], ['home', ['sh.switcher']]);
  assert.deepEqual(win.stack(), ['#play', '#league', '#play', '#home', '[#home+layer]']);
  win.history.back();
  await settle();
  assert.deepEqual(shell.state.sheets, []);
  win.history.back();
  await settle();
  assert.equal(shell.state.tab, 'play');
  win.history.forward();
  await settle();
  assert.deepEqual([shell.state.tab, shell.state.sheets], ['home', []], 'Forward to the rewritten entry opens no layer');
  // A link followed while a layer is open goes where it says (the layer closes with the move).
  shell.open('sh.menu');
  win.follow('#feed');
  await settle();
  assert.deepEqual([shell.state.tab, shell.state.views.league.view, shell.state.sheets], ['league', 'feed', []]);
  assert.equal(win.stack().at(-1), '[#league]');
  win.history.back(); // the menu's old entry, under the followed link
  await settle();
  assert.deepEqual([shell.state.tab, shell.state.sheets], ['home', []]);
  shell.dispatch({ type: 'tab', tab: 'play' });
  // The same tab with a view in the link still applies the view.
  win.follow('#picks-spread');
  await settle();
  win.follow('#picks-total');
  await settle();
  assert.equal(shell.state.views.play.market, 'total');
});

test('a reload on a layer entry clears it; disconnect stops listening', async () => {
  const win = fakeWindow('https://gtl.test/#lines');
  win.history.pushState({ gxLayer: true }, '', 'https://gtl.test/#lines');
  const shell = app(win);
  assert.equal(shell.state.tab, 'lines');
  assert.deepEqual(win.stack(), ['#lines', '[#lines]']);
  shell.connection.disconnect();
  assert.equal(win.listeners.size, 0);
  shell.dispatch({ type: 'tab', tab: 'play' });
  assert.deepEqual(win.stack(), ['#lines', '[#lines]'], 'nothing written after disconnect');
});

test('a history that refuses writes leaves the shell working in memory', () => {
  const win = fakeWindow('https://gtl.test/#feed');
  win.history.pushState = () => { throw new DOMException('Blocked', 'SecurityError'); };
  win.history.replaceState = () => { throw new DOMException('Blocked', 'SecurityError'); };
  const shell = app(win);
  assert.equal(shell.state.tab, 'league');
  shell.open('sh.menu');
  shell.dispatch({ type: 'tab', tab: 'play' });
  assert.equal(shell.state.tab, 'play');
});
