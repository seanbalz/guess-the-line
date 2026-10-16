import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_TAB, LAYER_KINDS, TABS, hasLayers, initialState, layer, layerCount, layerKind, modalOpen, reduce, topSheet, visibleOverlay, visibleToast,
} from '../web/src/next/shell/state.js';
import { SLOTS, TAB_INFO, tabBadge } from '../web/src/next/shell/tabs.js';

// Redesign build plan stage 10: the new app's navigation state (web/src/next/shell/state.js), the prototype shell's
// navigation and layer calls (CONTRACT sections 5, 6 and 9) as a pure reducer; and the tab slot files (section 3.1).
const run = (state, ...actions) => actions.reduce(reduce, state);
const start = () => initialState();
const sheet = (id, args) => ({ type: 'open', layer: layer(id, args) });

test('a visit starts on Home with every tab\'s view empty and nothing open', () => {
  const state = start();
  assert.equal(state.tab, 'home');
  assert.equal(DEFAULT_TAB, 'home');
  assert.deepEqual(TABS, ['home', 'play', 'bets', 'lines', 'league', 'fantasy']);
  assert.deepEqual(state.views, { home: {}, play: {}, bets: {}, lines: {}, league: {}, fantasy: {} });
  assert.deepEqual([state.page, state.sheets, state.dialog, state.popover, state.overlays, state.toasts], [null, [], null, null, [], []]);
  assert.equal(hasLayers(state), false);
  assert.equal(modalOpen(state), false);
});

test('a place from the address starts on its tab, with its view and layer', () => {
  assert.equal(initialState({ tab: 'play', view: { market: 'total' } }).views.play.market, 'total');
  const groups = initialState({ tab: 'home', layer: { id: 'sh.switcher' } });
  assert.equal(groups.tab, 'home');
  assert.deepEqual(groups.sheets, [{ id: 'sh.switcher', key: 1 }]);
  assert.equal(initialState({ tab: 'league', view: { view: 'feed' } }).views.league.view, 'feed');
  // Anything else starts on Home.
  for (const place of [null, {}, { tab: 'menu' }, { tab: 'Play' }, 'play']) assert.equal(initialState(place).tab, 'home');
  assert.deepEqual(initialState({ tab: 'home', layer: { id: 'nope' } }).sheets, []);
});

test('layer ids name their kind by prefix, and args may not use "id" or "key"', () => {
  assert.deepEqual(LAYER_KINDS, ['sheet', 'dialog', 'popover', 'overlay', 'page']);
  assert.deepEqual(['sh.menu', 'dlg.sitOut', 'pop.reactions', 'ov.flash', 'page.settings'].map(layerKind), LAYER_KINDS);
  for (const bad of ['menu', 'sh.', '.menu', 'tab.home', 'sheet.menu', '', null, 4]) assert.equal(layerKind(bad), null, String(bad));
  assert.deepEqual(layer('sh.game', { game: 'g1', sub: null }), { game: 'g1', sub: null, id: 'sh.game' });
  assert.deepEqual(layer('sh.menu'), { id: 'sh.menu' });
  assert.throws(() => layer('menu'), /Not a layer id/);
  assert.throws(() => layer('sh.game', { id: 'g1' }), /may not use "id"/);
  assert.throws(() => layer('ov.flash', { key: 3 }), /may not use "key"/);
  assert.throws(() => layer('sh.game', ['g1']), /plain object/);
});

test('tapping a tab closes every sheet, dialog, popover and page and shows that tab as it was left', () => {
  let state = run(start(), { type: 'view', tab: 'bets', patch: { view: 'mine' } }, { type: 'tab', tab: 'bets' });
  assert.equal(state.tab, 'bets');
  state = run(state, sheet('sh.menu'), sheet('dlg.pass', { challenge: 'c1' }), { type: 'open', layer: layer('page.settings') });
  state = run(state, sheet('sh.game', { game: 'g1' }), sheet('pop.reactions', { post: 'p1' }));
  assert.ok(hasLayers(state));
  state = reduce(state, { type: 'tab', tab: 'lines' });
  assert.equal(state.tab, 'lines');
  assert.deepEqual([state.sheets, state.dialog, state.popover, state.page], [[], null, null, null]);
  state = reduce(state, { type: 'tab', tab: 'bets' });
  assert.deepEqual(state.views.bets, { view: 'mine' }, 'the view it was left in');
});

test('the tab already showing closes its page, and is otherwise the same state (the frame scrolls to the top)', () => {
  const onPlay = reduce(start(), { type: 'tab', tab: 'play' });
  assert.equal(reduce(onPlay, { type: 'tab', tab: 'play' }), onPlay);
  const withPage = reduce(onPlay, { type: 'open', layer: layer('page.history', { who: 'you' }) });
  const popped = reduce(withPage, { type: 'tab', tab: 'play' });
  assert.equal(popped.page, null);
  assert.equal(popped.tab, 'play');
  assert.equal(reduce(onPlay, { type: 'tab', tab: 'nope' }), onPlay);
});

test('go() deep-links: closes the layers, switches the tab and merges its view; setView changes a view in place', () => {
  let state = run(start(), sheet('sh.menu'), { type: 'go', tab: 'play', view: { market: 'total', upNext: 'g2' } });
  assert.equal(state.tab, 'play');
  assert.deepEqual(state.sheets, []);
  assert.deepEqual(state.views.play, { market: 'total', upNext: 'g2' });
  state = run(state, sheet('sh.review', { market: 'total' }), { type: 'view', tab: 'play', patch: { upNext: 'g3' } });
  assert.deepEqual(state.views.play, { market: 'total', upNext: 'g3' });
  assert.equal(state.sheets.length, 1, 'setView closes nothing');
  assert.equal(reduce(state, { type: 'view', tab: 'play', patch: 'x' }), state);
});

test('sheets are one stack; a sub-view changes the top sheet in place; replace swaps the top one', () => {
  let state = run(start(), sheet('sh.game', { game: 'g1' }), sheet('sh.everyone', { market: 'spread' }));
  assert.deepEqual(state.sheets.map(s => s.id), ['sh.game', 'sh.everyone']);
  assert.equal(topSheet(state).id, 'sh.everyone');
  state = reduce(state, { type: 'sheetArgs', patch: { sub: 'game', game: 'g1' } });
  assert.deepEqual(topSheet(state), { id: 'sh.everyone', market: 'spread', sub: 'game', game: 'g1', key: 2 }, 'it keeps its key');
  assert.equal(reduce(state, { type: 'sheetArgs', patch: { id: 'sh.other' } }), state, 'a patch cannot rename the sheet');
  assert.equal(reduce(state, { type: 'sheetArgs', patch: { key: 1 } }), state, 'or change its key');
  // A replace with the same id keeps the key (the host keeps drawing it); another sheet gets a new one.
  assert.equal(topSheet(reduce(state, { type: 'replaceSheet', layer: layer('sh.everyone', { market: 'total' }) })).key, 2);
  state = reduce(state, { type: 'replaceSheet', layer: layer('sh.whosIn', { market: 'total' }) });
  assert.deepEqual(state.sheets.map(s => s.id), ['sh.game', 'sh.whosIn']);
  assert.deepEqual(state.sheets.map(s => s.key), [1, 3]);
  state = reduce(state, { type: 'close', kind: 'sheet' });
  assert.deepEqual(state.sheets.map(s => s.id), ['sh.game']);
  // Opening a sheet closes the dialog and popover; closing one closes the popover.
  state = run(state, sheet('dlg.sitOut', { from: 'lines' }), sheet('sh.menu'));
  assert.equal(state.dialog, null);
  state = run(state, sheet('pop.reactions', { post: 'p1' }), { type: 'close', kind: 'sheet' });
  assert.equal(state.popover, null);
  assert.deepEqual(reduce(state, { type: 'close', kind: 'sheets' }).sheets, []);
});

test('one dialog, one popover and one page at a time; a page closes the sheets; each dialog opening has its own key', () => {
  let state = run(start(), sheet('sh.game', { game: 'g1' }), sheet('dlg.revealForfeit', { market: 'spread', game: 'g1' }));
  assert.equal(state.sheets.length, 1, 'a dialog opens over a sheet');
  const first = state.dialog.key;
  state = reduce(state, sheet('dlg.sitOut', { from: 'play' }));
  assert.equal(state.dialog.id, 'dlg.sitOut');
  assert.notEqual(state.dialog.key, first);
  state = run(state, sheet('pop.reactions', { post: 'p1' }), sheet('pop.reactions', { post: 'p2' }));
  assert.equal(state.popover.post, 'p2');
  state = reduce(state, { type: 'open', layer: layer('page.settings') });
  assert.deepEqual([state.sheets, state.dialog, state.popover, state.page.id], [[], null, null, 'page.settings']);
  state = reduce(state, { type: 'pageArgs', patch: { segment: 'bets' } });
  assert.deepEqual(state.page, { id: 'page.settings', segment: 'bets' });
  assert.equal(reduce(state, { type: 'close', kind: 'page' }).page, null);
});

test('overlays queue and show one at a time, never over a dialog; toasts never show over an overlay', () => {
  let state = run(start(), sheet('ov.flash', { kind: 'bullseye' }), sheet('ov.newResults', { rows: [] }));
  assert.equal(visibleOverlay(state).id, 'ov.flash');
  state = reduce(state, { type: 'open', layer: layer('ov.reveal', { week: 5 }), front: true });
  assert.equal(visibleOverlay(state).id, 'ov.reveal', 'front shows it now');
  const key = visibleOverlay(state).key;
  assert.equal(reduce(state, { type: 'close', kind: 'overlay', key: key + 99 }), state, 'a stale close does nothing');
  state = reduce(state, { type: 'close', kind: 'overlay', key });
  assert.equal(visibleOverlay(state).id, 'ov.flash');
  state = reduce(state, { type: 'toast', toast: { text: 'Shared to Community' } });
  assert.equal(visibleToast(state), null, 'the toast waits for the overlay');
  state = reduce(state, sheet('dlg.pass', { challenge: 'c1' }));
  assert.equal(visibleOverlay(state), null, 'held behind the dialog');
  assert.equal(visibleToast(state).text, 'Shared to Community');
  assert.equal(modalOpen(state), false, 'the dialog makes the page inert itself (showModal)');
  assert.ok(modalOpen(reduce(state, { type: 'close', kind: 'dialog' })), 'the overlay it held now shows');
  assert.ok(modalOpen(reduce(start(), sheet('sh.menu'))));
  assert.equal(modalOpen(run(start(), sheet('pop.reactions', { post: 'p1' }), { type: 'open', layer: layer('page.settings') })), false);
});

test('each opening has its own key; a close that names one closes that layer wherever it is, and a stale one nothing', () => {
  // A layer that fails closes itself by its key (LayerHosts.jsx): a sheet hidden under another, not the top one.
  let state = run(start(), sheet('sh.game', { game: 'g1' }), sheet('sh.everyone', { market: 'total' }), sheet('pop.reactions', { post: 'p1' }));
  const [lower, top] = state.sheets;
  assert.equal(new Set([lower.key, top.key, state.popover.key]).size, 3);
  let next = reduce(state, { type: 'close', kind: 'sheet', key: lower.key });
  assert.deepEqual(next.sheets, [top], 'the sheet showing stays');
  assert.equal(next.popover, state.popover, 'with its popover');
  assert.equal(modalOpen(next), true);
  assert.equal(reduce(next, { type: 'close', kind: 'sheet', key: lower.key }), next, 'a stale close does nothing');
  next = reduce(state, { type: 'close', kind: 'sheet', key: top.key });
  assert.deepEqual([next.sheets, next.popover], [[lower], null], 'the top one closes with its popover');
  assert.equal(modalOpen(reduce(next, { type: 'close', kind: 'sheet', key: lower.key })), false, 'the last one leaves nothing over the frame');
  assert.equal(reduce(state, { type: 'close', kind: 'popover', key: state.popover.key + 99 }), state);
  assert.equal(reduce(state, { type: 'close', kind: 'popover', key: state.popover.key }).popover, null);
  // A dialog: a close for an earlier opening leaves the one open now.
  state = reduce(state, sheet('dlg.sitOut', { from: 'play' }));
  const first = state.dialog.key;
  state = reduce(state, sheet('dlg.pass', { challenge: 'c1' }));
  assert.equal(reduce(state, { type: 'close', kind: 'dialog', key: first }), state);
  assert.equal(reduce(state, { type: 'close', kind: 'dialog', key: state.dialog.key }).dialog, null);
  // Overlays: one queued behind the one showing can close by its key too.
  state = run(start(), sheet('ov.flash', { kind: 'bullseye' }), sheet('ov.newResults', { rows: [] }));
  const [showing, queued] = state.overlays;
  next = reduce(state, { type: 'close', kind: 'overlay', key: queued.key });
  assert.deepEqual(next.overlays, [showing]);
  assert.equal(reduce(next, { type: 'close', kind: 'overlay', key: queued.key }), next);
  assert.deepEqual(reduce(state, { type: 'close', kind: 'overlay' }).overlays, [queued], 'without a key, the one showing');
});

test('closeTop is Escape and Back: overlay, popover, dialog, the top sheet, then the page', () => {
  // A page first (opening a page closes the sheets), two sheets, a dialog, a popover over it, and an overlay that
  // waits behind the dialog.
  let state = run(start(), { type: 'open', layer: layer('page.history', { who: 'you' }) }, sheet('sh.game', { game: 'g1' }), sheet('sh.everyone', { market: 'total' }));
  state = run(state, sheet('dlg.revealForfeit', { market: 'total', game: 'g1' }), sheet('pop.reactions', { post: 'p1' }), sheet('ov.flash', { kind: 'betWon' }));
  assert.equal(layerCount(state), 6);
  const closed = [];
  while (hasLayers(state)) {
    const next = reduce(state, { type: 'closeTop' });
    assert.equal(layerCount(next), layerCount(state) - 1, 'one layer per press');
    closed.push(next.popover !== state.popover ? 'popover' : next.dialog !== state.dialog ? 'dialog' : next.overlays.length !== state.overlays.length ? 'overlay'
      : next.sheets.length !== state.sheets.length ? `sheet ${topSheet(state).id}` : 'page');
    state = next;
  }
  assert.deepEqual(closed, ['popover', 'dialog', 'overlay', 'sheet sh.everyone', 'sheet sh.game', 'page']);
  assert.equal(reduce(state, { type: 'closeTop' }), state, 'nothing open: nothing to close');
});

test('toasts queue with their own keys; a dismiss names the toast, so a late timer never takes the next one', () => {
  let state = run(start(), { type: 'toast', toast: { text: 'Change saved · SEA @ DEN' } }, { type: 'toast', toast: { text: "Couldn't save your reaction. Try again.", tone: 'error' } });
  const [a, b] = state.toasts;
  assert.notEqual(a.key, b.key);
  assert.equal(visibleToast(state).key, a.key);
  state = reduce(state, { type: 'dismissToast', key: a.key });
  const once = state;
  assert.equal(reduce(state, { type: 'dismissToast', key: a.key }), once, 'the first toast\'s timer, late');
  assert.equal(visibleToast(state).tone, 'error');
  for (const bad of [{}, { text: '' }, { text: '   ' }, { text: 4 }, null]) assert.equal(reduce(state, { type: 'toast', toast: bad }), state);
});

test('unknown actions and malformed layers leave the state as it is', () => {
  const state = start();
  for (const action of [null, 'tab', {}, { type: 'nope' }, { type: 'open' }, { type: 'open', layer: { id: 'menu' } }, { type: 'replaceSheet', layer: { id: 'dlg.pass' } },
    { type: 'close', kind: 'sheet' }, { type: 'close', kind: 'all' }, { type: 'sheetArgs', patch: { sub: 'x' } }, { type: 'pageArgs', patch: {} }, { type: 'go', tab: 'me' }]) {
    assert.equal(reduce(state, action), state, JSON.stringify(action));
  }
});

test('the tab slot files: every tab and Me has homeTiles, counter and sheetActions, empty until each slot\'s own stage', () => {
  assert.deepEqual(Object.keys(SLOTS).sort(), ['bets', 'fantasy', 'home', 'league', 'lines', 'me', 'play']);
  for (const [tab, slot] of Object.entries(SLOTS)) {
    assert.deepEqual(Object.keys(slot).sort(), ['counter', 'homeTiles', 'sheetActions'], tab);
    assert.ok(Array.isArray(slot.homeTiles) && Object.isFrozen(slot.homeTiles), `${tab} homeTiles`);
    assert.ok(Array.isArray(slot.sheetActions) && Object.isFrozen(slot.sheetActions), `${tab} sheetActions`);
    assert.ok(slot.counter === null || typeof slot.counter === 'function', `${tab} counter`);
    // Stage 11 fills Play's counter (tests/next-data.test.mjs); every other slot is still empty.
    if (tab !== 'play') assert.equal(slot.counter, null, `${tab} counter`);
    assert.equal(slot.homeTiles.length + slot.sheetActions.length, tab === 'play' ? 1 : 0, `${tab} tiles and actions`);
    if (tab === 'play') assert.equal(slot.homeTiles[0].id, 'play.weekly-score');
    // A slot file is data only: it imports nothing, so a lane edits its own folder without touching another's.
    if (tab !== 'play') assert.doesNotMatch(readFileSync(new URL(`../web/src/next/${tab}/index.js`, import.meta.url), 'utf8'), /^\s*import\b/m, `${tab}/index.js`);
  }
  assert.deepEqual(Object.keys(TAB_INFO), TABS);
});

test('the tab bar reads a counter or a dot from a slot, in the tab\'s name too, and shows nothing for anything else', () => {
  for (const tab of TABS) assert.deepEqual(tabBadge(tab, null), { label: TAB_INFO[tab].label, name: TAB_INFO[tab].name ?? TAB_INFO[tab].label, count: 0, dot: false }, tab);
  const slots = counter => ({ ...SLOTS, play: { ...SLOTS.play, counter } });
  const data = { due: 1 };
  assert.deepEqual(tabBadge('play', data, slots(d => ({ count: d.due, label: '1 ballot due' }))), { label: 'Play', name: 'Play, 1 ballot due', count: 1, dot: false });
  assert.deepEqual(tabBadge('play', data, slots(() => ({ dot: true, label: 'new posts' }))), { label: 'Play', name: 'Play, new posts', count: 0, dot: true });
  for (const counter of [() => null, () => ({ count: 0, label: 'x' }), () => ({ count: -1, label: 'x' }), () => ({ count: 1.5, label: 'x' }), () => ({ dot: 'yes', label: 'x' }), () => { throw new Error('bad data'); }, 'counter']) {
    assert.deepEqual(tabBadge('play', data, slots(counter)), { label: 'Play', name: 'Play', count: 0, dot: false }, String(counter));
  }
  assert.equal(tabBadge('play', data, slots(() => ({ count: 2, label: ' ' }))).name, 'Play', 'no words, no change to the name');
});
