// Redesign build plan stage 10: the new app's address and Back button (web/src/next/shell/router.js) against a fake
// window whose history behaves like a browser's: pushState drops forward entries, back() and forward() traverse later
// (popstate arrives as its own task), and a traversal to an entry with another fragment fires popstate too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectHistory, fragmentFor, isLegacyFragment, placeFromFragment, startPlace } from '../web/src/next/shell/router.js';
import { EPL_ROUTER } from '../web/src/next/epl/shellRoute.js';
import { leagueLayer, leagueMode } from '../web/src/next/league/leagueModel.js';
import { HOME_LAYER_IDS, RESEARCH_LAYERS, canGoBack, initialState, isDetail, layer, reduce, researchLayerOf } from '../web/src/next/shell/state.js';
import { HOME_LAYERS } from '../web/src/next/home/homeModel.js';

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
    go(delta) { traverse(delta); },
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
function app(win, confirmLeave, route) {
  let state = initialState(startPlace(win, route));
  const connection = connectHistory(win, { getState: () => state, confirmLeave, route, dispatch: action => { const prev = state; state = reduce(state, action); connection.sync(prev, state); } });
  connection.sync(null, state);
  const dispatch = action => { const prev = state; state = reduce(state, action); connection.sync(prev, state); };
  return { get state() { return state; }, dispatch, connection, open: (id, args) => dispatch({ type: 'open', layer: layer(id, args) }) };
}


test('history connection owns manual scroll restoration and restores the previous mode once', () => {
  for (const previous of ['auto', 'manual']) {
    const win = fakeWindow();
    win.history.scrollRestoration = previous;
    const shell = app(win);
    assert.equal(win.history.scrollRestoration, 'manual');
    shell.dispatch({ type: 'go', tab: 'research', view: { section: 'games' } });
    assert.equal(win.history.scrollRestoration, 'manual');
    shell.connection.disconnect();
    assert.equal(win.history.scrollRestoration, previous);
    win.history.scrollRestoration = 'auto';
    shell.connection.disconnect();
    assert.equal(win.history.scrollRestoration, 'auto', 'repeat cleanup must not overwrite a later owner');
    assert.equal(win.listeners.size, 0);
  }
});
test('scroll ownership leaves unsupported or inaccessible APIs and a later mode choice alone', () => {
  const unsupported = fakeWindow();
  app(unsupported).connection.disconnect();
  assert.equal('scrollRestoration' in unsupported.history, false);
  for (const descriptor of [
    { get() { throw new Error('not accessible'); } },
    { value: 'auto', writable: false },
    { get() { return 'auto'; }, set() { throw new Error('not writable'); } },
  ]) {
    const win = fakeWindow();
    Object.defineProperty(win.history, 'scrollRestoration', descriptor);
    const shell = app(win);
    shell.dispatch({ type: 'tab', tab: 'research' });
    assert.equal(win.location.hash, '#research');
    shell.connection.disconnect();
    assert.equal(win.listeners.size, 0);
  }
  const win = fakeWindow();
  win.history.scrollRestoration = 'manual';
  const shell = app(win);
  win.history.scrollRestoration = 'auto';
  shell.connection.disconnect();
  assert.equal(win.history.scrollRestoration, 'auto');
});

test('legacy links map to explicit details while authentication and unknown fragments stay untouched', () => {
  for (const [fragment, tab, section] of [['#trends','research','trends'], ['#lines','research','games'], ['#fantasy','research','fantasy'], ['#league','play','league'], ['#feed','play','league'], ['#picks-total','play','picks']]) {
    const place = placeFromFragment(fragment); assert.equal(place.tab,tab); assert.equal(place.view.section,section);
  }
  for (const fragment of ['#type=recovery','#access_token=secret&type=signup','#invite=abc','#main','#picks-due','#unknown']) {
    assert.equal(placeFromFragment(fragment),null);
    const win = fakeWindow(`https://gtl.test/${fragment}`); app(win); assert.equal(win.location.hash,fragment);
  }
});
test('aliases normalize in place without losing requested market on a second reload', () => {
  const win = fakeWindow('https://gtl.test/?app=next#picks-total');
  const first = app(win); assert.equal(first.state.views.play.market,'total'); assert.equal(win.history.length,1);
  first.connection.disconnect();
  const reloaded=app(win); assert.equal(reloaded.state.views.play.market,'total'); assert.equal(reloaded.state.views.play.section,'picks');
  assert.equal(win.location.search,'?app=next');
});
test('root navigation uses one entry, Back and Forward add none', async () => {
  const win = fakeWindow('https://gtl.test/#home'); const shell = app(win);
  shell.dispatch({type:'tab',tab:'play'}); shell.dispatch({type:'tab',tab:'research'}); shell.dispatch({type:'tab',tab:'research'});
  assert.equal(win.history.length,3); win.history.back(); await settle(); assert.equal(shell.state.tab,'play');
  win.history.back(); await settle(); assert.equal(shell.state.tab,'home'); win.history.forward(); await settle();
  assert.equal(shell.state.tab,'play'); assert.equal(win.history.length,3);
});
test('nested details preserve origin through Back, Forward and reload', async () => {
  const win=fakeWindow('https://gtl.test/#home'); let shell=app(win);
  shell.dispatch({type:'go',tab:'play',view:{section:'score',market:'total',season:2026,week:7}});
  shell.dispatch({type:'go',tab:'play',view:{section:'compare'}});
  shell.dispatch({type:'back'}); await settle(); assert.equal(shell.state.views.play.section,'score');
  assert.equal(shell.state.trail.length,1); shell.connection.disconnect(); shell=app(win);
  assert.equal(shell.state.views.play.market,'total'); shell.dispatch({type:'back'}); await settle(); assert.equal(shell.state.tab,'home');
  win.history.forward(); await settle(); assert.equal(shell.state.views.play.section,'score'); assert.equal(win.history.length,3);
});
test('browser Back and legacy links protect a dirty same-tab detail and accepted traversal works', async () => {
  const win=fakeWindow('https://gtl.test/#home'); let allow=false; let prompts=0;
  const shell=app(win,()=>{prompts++;return allow;});
  shell.dispatch({type:'go',tab:'play',view:{section:'picks',market:'total'}});
  shell.dispatch({type:'go',tab:'play',view:{section:'score'}});
  win.history.back(); await settle(); assert.equal(shell.state.views.play.section,'score'); assert.match(win.location.hash,/score/); assert.equal(prompts,1);
  win.follow('#fantasy'); await settle(); assert.equal(shell.state.tab,'play');
  allow=true; win.history.back(); await settle(); assert.equal(shell.state.views.play.section,'picks');
});
test('history never contains player records, editor fields or layer payloads', () => {
  const win=fakeWindow('https://gtl.test/#home'); const shell=app(win);
  shell.dispatch({type:'go',tab:'play',view:{section:'picks',market:'total',guess:55,players:['private'],editor:{note:'secret'}}});
  shell.open('sh.game',{guess:55,note:'secret'});
  assert.doesNotMatch(JSON.stringify(win.history.state),/secret|guess|players|editor/);
  assert.doesNotMatch(win.location.hash,/secret|guess|players|editor/);
});
test('layers retain one temporary entry and close one per browser Back', async () => {
  const win=fakeWindow('https://gtl.test/#home'); const shell=app(win);
  shell.dispatch({type:'tab',tab:'research'}); shell.open('sh.game',{game:'g1'}); shell.open('sh.menu'); shell.open('dlg.test');
  assert.equal(win.history.length,3);
  for (const left of [2,1,0]) { win.history.back(); await settle(); assert.equal(shell.state.sheets.length+(shell.state.dialog?1:0),left); assert.equal(shell.state.tab,'research'); }
  win.history.back(); await settle(); assert.equal(shell.state.tab,'home');
});
test('closing a layer or changing destination removes its temporary entry first', async () => {
  const win=fakeWindow('https://gtl.test/#home'); const shell=app(win);
  shell.open('sh.menu'); shell.dispatch({type:'go',tab:'league',view:{view:'history',market:'guess_total'}}); await settle();
  assert.equal(shell.state.tab,'play'); assert.equal(shell.state.views.league.view,'history'); assert.equal(win.history.length,2);
  shell.open('sh.menu'); shell.dispatch({type:'close',kind:'sheet'}); await settle();
  win.history.back(); await settle(); assert.equal(shell.state.tab,'home');
});
test('groups opens switcher once, and Forward/reload never reopens stale layers', async () => {
  const win=fakeWindow('https://gtl.test/#groups'); let shell=app(win);
  assert.equal(shell.state.sheets.length,1); win.history.back(); await settle(); assert.equal(shell.state.sheets.length,0);
  win.history.forward(); await settle(); assert.equal(shell.state.sheets.length,0);
  shell.open('sh.menu'); shell.connection.disconnect(); shell=app(win); assert.equal(shell.state.sheets.length,0);
  shell.connection.disconnect(); assert.equal(win.listeners.size,0);
});
test('#history opens Me › History over Home once (stages 73 and 74); #history/bets opens its Bets view; reload never reopens it', async () => {
  assert.deepEqual(placeFromFragment('#history'), { tab: 'home', layer: { id: 'page.history' } });
  assert.deepEqual(placeFromFragment('#history/bets'), { tab: 'home', layer: { id: 'page.history', view: 'bets' } });
  assert.deepEqual(placeFromFragment('#history/older'), { tab: 'home', layer: { id: 'page.history', view: 'older' } }, 'stage 74');
  for (const fragment of ['#history/', '#history/other', '#history?week=5', '#historyx']) assert.equal(placeFromFragment(fragment), null, fragment);
  assert.ok(isLegacyFragment('#history') && isLegacyFragment('#history/bets') && !isLegacyFragment('#history/other'));
  const win=fakeWindow('https://gtl.test/#history/bets'); let shell=app(win);
  assert.deepEqual([shell.state.tab, shell.state.page?.id, shell.state.page?.view], ['home', 'page.history', 'bets']);
  assert.equal(win.location.hash, '#home', 'the address becomes the tab underneath; the page has its own Back entry');
  win.history.back(); await settle(); assert.equal(shell.state.page, null);
  win.history.forward(); await settle(); assert.equal(shell.state.page, null, 'Forward never reopens a closed page');
  shell.connection.disconnect(); shell=app(win); assert.equal(shell.state.page, null);
  shell.connection.disconnect();
});
test('blocked history writes leave navigation working in memory', () => {
  const win=fakeWindow('https://gtl.test/#feed');
  win.history.pushState=win.history.replaceState=()=>{throw new Error('blocked');};
  const shell=app(win); assert.equal(shell.state.tab,'play'); shell.open('sh.menu'); shell.dispatch({type:'tab',tab:'bets'}); assert.equal(shell.state.tab,'bets');
});


test('Research game actions round-trip only a game id on the picks destination', () => {
  const view = { section: 'picks', market: 'total', season: 2026, week: 6, pickGame: 'HOU-JAX' };
  assert.deepEqual(placeFromFragment(fragmentFor('play', view)), { tab: 'play', view });
  assert.equal(placeFromFragment('#play/score?pickGame=HOU-JAX').view.pickGame, undefined);
  assert.equal(placeFromFragment('#play/picks?pickGame=%3Cscript%3E').view.pickGame, undefined);
});


test('a game focus follows Back but is cleared for a fresh general Play destination', () => {
  let state = initialState({ tab: 'play', view: { section: 'picks', pickGame: 'HOU-JAX', week: 6 } });
  state = reduce(state, { type: 'go', tab: 'research', view: { section: 'games' } });
  assert.equal(reduce(state, { type: 'back' }).views.play.pickGame, 'HOU-JAX');
  assert.equal(reduce(state, { type: 'go', tab: 'play', view: { section: 'picks' } }).views.play.pickGame, undefined);
  assert.equal(reduce(state, { type: 'restore', place: { tab: 'play', view: { section: 'picks' } } }).views.play.pickGame, undefined);
});

test('D-70: opening a game in Your guesses is a step; the lip and Next keep the week underneath', () => {
  const start = initialState({ tab: 'play', view: { section: 'picks', market: 'total', season: 2026, week: 9 } });
  const game = reduce(start, { type: 'view', tab: 'play', patch: { pickGame: 'DEN-CAR' } });
  assert.equal(game.views.play.pickGame, 'DEN-CAR');
  assert.equal(game.trail.length, 1);
  assert.equal(placeFromFragment(fragmentFor('play', game.views.play)).view.pickGame, 'DEN-CAR'); // a reload reopens it
  for (const week of [reduce(game, { type: 'back' }), reduce(game, { type: 'view', tab: 'play', patch: { pickGame: undefined } })]) {
    assert.equal(week.views.play.section, 'picks');
    assert.equal(week.views.play.pickGame, undefined);
    assert.equal(week.views.play.market, 'total');
    assert.deepEqual(week.trail, []); // the lip back to the week is Back, so the next Back leaves Your guesses
  }
  // Next replaces the open game, so the trail never holds the previous game.
  const next = reduce(game, { type: 'view', tab: 'play', patch: { pickGame: 'DET-MIA' } });
  assert.equal(next.views.play.pickGame, 'DET-MIA');
  assert.equal(next.trail.length, 1);
  assert.equal(next.trail[0].view.pickGame, undefined);
  assert.deepEqual(reduce(next, { type: 'back' }).trail, []);
  // Outside Your guesses a game id is not a step.
  const score = initialState({ tab: 'play', view: { section: 'score' } });
  assert.equal(reduce(score, { type: 'view', tab: 'play', patch: { pickGame: 'DEN-CAR' } }).trail.length, 0);
});

test('D-70: Next replaces the game in browser history too, so the browser Back button lands on the week', async () => {
  const win = fakeWindow('https://gtl.test/#play/picks?market=spread&season=2026&week=9');
  const shell = app(win);
  shell.dispatch({ type: 'view', tab: 'play', patch: { pickGame: 'DEN-CAR' } });
  await settle();
  assert.equal(win.history.length, 2);
  shell.dispatch({ type: 'view', tab: 'play', patch: { pickGame: 'DET-MIA' } });
  await settle();
  assert.equal(shell.state.navMode, 'replace');
  assert.deepEqual(win.stack(), ['#play/picks?market=spread&season=2026&week=9', '[#play/picks?market=spread&season=2026&week=9&pickGame=DET-MIA]']);
  win.history.back();
  await settle();
  assert.equal(shell.state.views.play.pickGame, undefined);
  assert.deepEqual(shell.state.trail, []);
});

test('D-70: a deep link opens the game layer and Back returns to where it came from', () => {
  let state = initialState({ tab: 'research', view: { section: 'games' } });
  state = reduce(state, { type: 'go', tab: 'play', view: { section: 'picks', market: 'spread', season: 2026, week: 9, pickGame: 'HOU-JAX' } });
  assert.equal(state.views.play.pickGame, 'HOU-JAX');
  assert.equal(reduce(state, { type: 'back' }).tab, 'research');
  // Next from a deep-linked game is a plain step: it never goes back to Research first.
  const next = reduce(state, { type: 'view', tab: 'play', patch: { pickGame: 'SEA-DEN' } });
  assert.equal(next.tab, 'play');
  assert.equal(next.views.play.pickGame, 'SEA-DEN');
  assert.equal(next.trail.length, 2);
  const week = reduce(state, { type: 'view', tab: 'play', patch: { pickGame: undefined } });
  assert.equal(week.views.play.pickGame, undefined);
  assert.equal(week.trail.length, 2); // the lip opens the week as a new step; Back returns to the game, then Research
});

test('EPL uses the shared sheet/history loop and restores only its own route state', async () => {
  const win = fakeWindow('https://gtl.test/#epl/play/guess');
  // An unrelated NFL history entry must not supply a hidden trail or private selection.
  win.history.replaceState({ gxSport: 'nfl', gxRoute: { tab: 'play', view: { section: 'picks', week: 8 }, trail: [{ tab: 'bets', view: { week: 7 } }] } }, '', win.location.href);
  const a = app(win, undefined, EPL_ROUTER);
  assert.equal(a.state.views.play.section, 'guess');
  assert.deepEqual(a.state.trail, []);
  a.open('sh.menu');
  assert.equal(win.history.state.gxSport, 'epl');
  assert.equal(win.location.hash, '#epl/play/guess');
  win.history.back(); await settle();
  assert.equal(a.state.sheets.length, 0);
  assert.equal(a.state.views.play.section, 'guess');
  a.dispatch({ type: 'tab', tab: 'research' });
  assert.equal(win.location.hash, '#epl/research/fantasy');
  win.history.back(); await settle();
  assert.equal(a.state.views.play.section, 'guess');
  assert.equal(win.location.hash, '#epl/play/guess');
  a.connection.disconnect();
});

test('D-69 layer addresses: every section keeps a layer and an item, so a reload or a shared link reopens a card', () => {
  // Home is not in this list since step 2's final review: its one layer is Who's in (the M3 test below).
  for (const [tab, view] of [['play', { section: 'score' }], ['research', { section: 'games' }], ['bets', { view: 'tracked' }]]) {
    const fragment = fragmentFor(tab, { ...view, layer: 'game', item: '2026_08_SEA_DEN' });
    assert.match(fragment, /layer=game/, tab);
    assert.match(fragment, /item=2026_08_SEA_DEN/, tab);
    const place = placeFromFragment(fragment);
    assert.equal(place.view.layer, 'game', tab);
    assert.equal(place.view.item, '2026_08_SEA_DEN', tab);
  }
  assert.equal(placeFromFragment('#play/score?layer=%3Cscript%3E').view?.layer, undefined, 'only safe characters');
});

test('D-69: a game in Your score is its own layer: opening it is a step, the lip and Back close it, and its address reopens it', () => {
  const start = initialState({ tab: 'play', view: { section: 'score', market: 'guess_spread', season: 2026, week: 8 } });
  const game = reduce(start, { type: 'view', tab: 'play', patch: { scoreGame: 'SEA-DEN' } });
  assert.equal(game.views.play.scoreGame, 'SEA-DEN');
  assert.equal(game.trail.length, 1);
  const place = placeFromFragment(fragmentFor('play', game.views.play)); // a reload or a shared link reopens it
  assert.deepEqual([place.view.section, place.view.scoreGame, place.view.week, place.view.market], ['score', 'SEA-DEN', 8, 'guess_spread']);
  for (const list of [reduce(game, { type: 'back' }), reduce(game, { type: 'view', tab: 'play', patch: { scoreGame: undefined } })]) {
    assert.equal(list.views.play.section, 'score');
    assert.equal(list.views.play.scoreGame ?? null, null);
    assert.equal(list.views.play.week, 8);
    assert.deepEqual(list.trail, [], 'the lip back to the list is Back, so the next Back leaves Your score');
  }
  // Week chips, the market and the filters change the list in place: no step.
  for (const patch of [{ week: 7 }, { market: 'guess_total' }, { team: 'DEN' }, { season: 2025, week: null }]) assert.equal(reduce(start, { type: 'view', tab: 'play', patch }).trail.length, 0, JSON.stringify(patch));
  // A pick's "View weekly score" lands on the game layer; Back returns to the picks.
  const picks = initialState({ tab: 'play', view: { section: 'picks', market: 'spread', season: 2026, week: 8 } });
  const linked = reduce(picks, { type: 'view', tab: 'play', patch: { section: 'score', season: 2026, week: 8, market: 'guess_spread', scoreGame: 'SEA-DEN' } });
  assert.equal(linked.views.play.scoreGame, 'SEA-DEN');
  assert.equal(reduce(linked, { type: 'back' }).views.play.section, 'picks');
});

test('D-69: the browser Back button closes the Your score game layer and keeps the list', async () => {
  const win = fakeWindow('https://gtl.test/#play/score?market=guess_spread&season=2026&week=8');
  const shell = app(win);
  shell.dispatch({ type: 'view', tab: 'play', patch: { scoreGame: 'SEA-DEN' } });
  await settle();
  assert.deepEqual(win.stack(), ['#play/score?market=guess_spread&season=2026&week=8', '[#play/score?market=guess_spread&season=2026&week=8&scoreGame=SEA-DEN]']);
  win.history.back();
  await settle();
  assert.equal(shell.state.views.play.section, 'score');
  assert.equal(shell.state.views.play.scoreGame ?? null, null);
  assert.equal(win.location.hash, '#play/score?market=guess_spread&season=2026&week=8');
});

test('D-69: an open Your score game follows Back but never rides into the Play tab or a fresh Your score link', () => {
  let state = initialState({ tab: 'play', view: { section: 'score', season: 2026, week: 8, scoreGame: 'SEA-DEN' } });
  state = reduce(state, { type: 'go', tab: 'research', view: { section: 'games' } });
  assert.equal(reduce(state, { type: 'back' }).views.play.scoreGame, 'SEA-DEN');
  assert.equal(reduce(state, { type: 'tab', tab: 'play' }).views.play.scoreGame, undefined);
  assert.equal(reduce(state, { type: 'go', tab: 'play', view: { section: 'score', week: 8 } }).views.play.scoreGame, undefined, 'the Play tile opens the list');
  assert.equal(reduce(state, { type: 'restore', place: { tab: 'play', view: { section: 'score' } } }).views.play.scoreGame, undefined);
});

test('D-69: any nested Play layer (layer, item) is a step Back closes and never rides into a fresh destination; Compare\'s player choice is not a step', () => {
  const grid = initialState({ tab: 'play', view: { section: 'features' } });
  const badge = reduce(grid, { type: 'view', tab: 'play', patch: { layer: 'badge', item: 'bullseye' } });
  assert.equal(badge.trail.length, 1, 'opening the badge is a step');
  const back = reduce(badge, { type: 'back' });
  assert.equal(back.views.play.section, 'features');
  assert.equal(back.views.play.layer ?? null, null);
  assert.equal(back.views.play.item ?? null, null);
  assert.equal(reduce(badge, { type: 'go', tab: 'play', view: { section: 'points' } }).views.play.layer, undefined, 'a tile opens its section on its first layer');
  assert.equal(reduce(badge, { type: 'restore', place: { tab: 'play', view: { section: 'features' } } }).views.play.item, undefined);
  const compare = initialState({ tab: 'play', view: { section: 'compare' } });
  assert.equal(reduce(compare, { type: 'view', tab: 'play', patch: { item: 'u-2' } }).trail.length, 0, 'choosing the other player is not a step');
});

test('D-69 Compare: the opponent is the item on section compare; a face is not a step, a reload reopens it, Back leaves', async () => {
  const troy = '00000000-0000-4000-8000-000000000002', sean = '00000000-0000-4000-8000-000000000003';
  assert.deepEqual(placeFromFragment(`#play/compare?market=total&season=2026&week=8&item=${troy}`).view, { section: 'compare', market: 'total', season: 2026, week: 8, item: troy });
  const win = fakeWindow('https://gtl.test/#home');
  let shell = app(win);
  shell.dispatch({ type: 'go', tab: 'play', view: { section: 'compare', item: troy, week: 8 } });
  shell.dispatch({ type: 'view', tab: 'play', patch: { item: sean } });
  assert.match(win.location.hash, new RegExp(`^#play/compare\\?.*item=${sean}$`));
  assert.equal(win.history.length, 2, 'choosing a face rewrites the entry; it adds no Back step');
  shell.connection.disconnect();
  shell = app(win);
  assert.equal(shell.state.views.play.item, sean, 'a reload reopens the same head-to-head');
  win.history.back(); await settle();
  assert.equal(shell.state.tab, 'home', 'Back closes Compare');
});

test('D-69 Guess the Points: a slot and its profile are steps with their own address; Back and a lip close one layer', () => {
  const list = initialState({ tab: 'play', view: { section: 'points' } });
  const slot = reduce(list, { type: 'view', tab: 'play', patch: { item: 'QB' } });
  assert.deepEqual([slot.views.play.section, slot.views.play.item, slot.trail.length], ['points', 'QB', 1]);
  assert.equal(fragmentFor('play', slot.views.play), '#play/points?item=QB');
  assert.deepEqual(placeFromFragment('#play/points?item=QB'), { tab: 'play', view: { section: 'points', item: 'QB' } }); // a reload or a shared link reopens it
  // PointsBallot.jsx sends these exact patches (the profile names its slot, since a go drops `item`).
  const profile = reduce(slot, { type: 'view', tab: 'play', patch: { item: 'QB', layer: 'profile' } });
  assert.deepEqual([profile.views.play.item, profile.views.play.layer, profile.trail.length], ['QB', 'profile', 2]);
  assert.equal(fragmentFor('play', profile.views.play), '#play/points?layer=profile&item=QB');
  for (const back of [reduce(profile, { type: 'back' }), reduce(profile, { type: 'view', tab: 'play', patch: { item: 'QB', layer: undefined } })]) {
    assert.deepEqual([back.views.play.item, back.views.play.layer ?? null, back.trail.length], ['QB', null, 1]);
  }
  for (const back of [reduce(slot, { type: 'back' }), reduce(slot, { type: 'view', tab: 'play', patch: { item: undefined, layer: undefined } })]) {
    assert.deepEqual([back.views.play.section, back.views.play.item ?? null, back.trail], ['points', null, []]);
  }
  // A fresh Play destination never reopens the slot or profile it last showed.
  assert.equal(reduce(slot, { type: 'tab', tab: 'play' }).views.play.item, undefined);
  assert.equal(reduce(reduce(slot, { type: 'tab', tab: 'home' }), { type: 'go', tab: 'play', view: { section: 'points' } }).views.play.item, undefined);
  const restored = reduce(profile, { type: 'restore', place: { tab: 'play', view: { section: 'points' } } }).views.play;
  assert.deepEqual([restored.item ?? null, restored.layer ?? null], [null, null]);
  assert.equal(placeFromFragment('#play/points?item=%3Cscript%3E').view.item, undefined);
});

test('D-69 Guess the Points: browser Back closes the slot layer, then leaves Points', async () => {
  const win = fakeWindow('https://gtl.test/#play/points');
  const shell = app(win);
  shell.dispatch({ type: 'view', tab: 'play', patch: { item: 'RB' } });
  await settle();
  assert.equal(win.location.hash, '#play/points?item=RB');
  win.history.back();
  await settle();
  assert.equal(shell.state.views.play.section, 'points');
  assert.equal(shell.state.views.play.item, undefined);
});

test('D-69 Badges and awards: a shared badge link reopens it; each layer is one browser step; Back closes one layer', async () => {
  const win = fakeWindow('https://gtl.test/#play/features?layer=badge&item=bullseye');
  let shell = app(win);
  assert.deepEqual([shell.state.views.play.section, shell.state.views.play.layer, shell.state.views.play.item], ['features', 'badge', 'bullseye']);
  shell.connection.disconnect();
  const away = fakeWindow('https://gtl.test/#play/league?view=board');
  shell = app(away);
  shell.dispatch({ type: 'go', tab: 'play', view: { section: 'features', layer: 'badge', item: 'sharp@u-troy' } });
  assert.equal(away.location.hash, '#play/features?layer=badge&item=sharp%40u-troy');
  shell.dispatch({ type: 'view', tab: 'play', patch: { layer: undefined, item: undefined } });
  shell.dispatch({ type: 'view', tab: 'play', patch: { layer: 'streaks', item: undefined } });
  assert.deepEqual(away.stack(), ['#play/league?view=board', '#play/features?layer=badge&item=sharp%40u-troy', '#play/features', '[#play/features?layer=streaks]']);
  away.history.back(); await settle();
  assert.deepEqual([shell.state.views.play.section, shell.state.views.play.layer], ['features', undefined], 'Back closes the streaks layer');
  away.history.back(); await settle();
  assert.deepEqual([shell.state.views.play.layer, shell.state.views.play.item], ['badge', 'sharp@u-troy']);
  away.history.back(); await settle();
  assert.equal(shell.state.views.play.section, 'league', 'and then the board the badge was opened from');
  shell.connection.disconnect();
});

test('D-69 League layers: board first, #feed opens the feed, and a History week is its own step that browser Back closes', async () => {
  assert.equal(leagueLayer(placeFromFragment('#play/league').adapters.league).layer, 'board');
  assert.equal(leagueLayer(placeFromFragment('#feed').adapters.league).layer, 'feed');
  const fragment = fragmentFor('play', { section: 'league', view: 'history', season: 2026, week: 8 });
  assert.equal(fragment, '#play/league?season=2026&week=8&view=history');
  assert.deepEqual(leagueLayer(placeFromFragment(fragment).adapters.league), { layer: 'week', season: 2026, week: 8 }, 'a reload reopens it');
  let state = initialState(placeFromFragment('#play/league'));
  state = reduce(state, { type: 'view', tab: 'league', patch: { view: 'history', week: null } });
  state = reduce(state, { type: 'view', tab: 'league', patch: { week: 8 } });
  assert.equal(state.trail.length, 2);
  const lip = reduce(state, { type: 'view', tab: 'league', patch: { week: null } });
  assert.deepEqual([leagueLayer(lip.views.league).layer, lip.trail.length], ['history', 1], 'the History lip lands on the place under it: Back');
  assert.equal(reduce(lip, { type: 'view', tab: 'league', patch: { season: 2025 } }).trail.length, 1, 'a season tile is a filter, not a step');
  const win = fakeWindow('https://gtl.test/#play/league?view=history'), shell = app(win);
  shell.dispatch({ type: 'view', tab: 'league', patch: { week: 8 } }); await settle();
  assert.match(win.location.hash, /week=8/);
  win.history.back(); await settle();
  assert.equal(leagueLayer(shell.state.views.league).layer, 'history', 'an entry without a week restores History, not the week left');
  win.history.forward(); await settle();
  assert.equal(shell.state.views.league.week, 8);
  shell.connection.disconnect();
});

// play/PlayLayer.jsx CLOSED_LAYER (a .jsx module, so its value is restated here): what openPlay clears.
const CLOSED_LAYER = Object.freeze({ layer: undefined, item: undefined, scoreGame: undefined });
test('D-69 step 1: the Play landing opens each section on its first layer, a reload reopens it, and Back returns to the landing', () => {
  // A game card left open earlier, then the landing.
  let state = initialState({ tab: 'play', view: { section: 'picks', market: 'total', season: 2026, week: 9, pickGame: 'DEN-CAR' } });
  state = reduce(state, { type: 'go', tab: 'play', view: { section: undefined, ...CLOSED_LAYER } });
  assert.equal(placeFromFragment(fragmentFor('play', state.views.play)).view.section, undefined, 'the landing is Play with no section');
  assert.equal(state.views.play.pickGame, undefined);
  // "Make picks" and the ballot tile (openPlay with the week the landing shows): the week's card, never the old game.
  const picks = reduce(state, { type: 'go', tab: 'play', view: { section: 'picks', ...CLOSED_LAYER, market: 'spread', season: 2026, week: 9 } });
  assert.equal(picks.views.play.pickGame, undefined);
  assert.equal(fragmentFor('play', picks.views.play), '#play/picks?market=spread&season=2026&week=9');
  assert.deepEqual(placeFromFragment(fragmentFor('play', picks.views.play)), { tab: 'play', view: { section: 'picks', market: 'spread', season: 2026, week: 9 } });
  assert.equal(reduce(picks, { type: 'back' }).views.play.section, undefined, 'Back from a section returns to the landing');
  // "View your results" and the other tiles open their section the same way.
  for (const section of ['score', 'compare', 'points', 'features', 'league']) {
    const opened = reduce(state, { type: 'go', tab: 'play', view: { section, ...CLOSED_LAYER } });
    assert.equal(placeFromFragment(fragmentFor('play', opened.views.play)).view.section, section);
  }
});

// Final fix wave F1 (spec test 8): League never reopens a stale layer. Every arrival from outside League (the landing's
// tile, the Play lip then the tile, a tab switch, a restored entry that names no League layer) lands on the board;
// Back from the feed or History lands on the board; an address that names a layer still opens it.
test('F1 League: the tile after a History week opens the board, also after the Play lip and a tab switch', () => {
  const tile = state => reduce(state, { type: 'go', tab: 'play', view: { section: 'league', ...CLOSED_LAYER } });
  const playLip = state => reduce(state, { type: 'go', tab: 'play', view: { section: undefined, ...CLOSED_LAYER } });
  let state = tile(initialState({ tab: 'play' }));
  state = reduce(state, { type: 'view', tab: 'league', patch: { view: 'history', week: null } });
  state = reduce(state, { type: 'view', tab: 'league', patch: { season: 2025 } });
  state = reduce(state, { type: 'view', tab: 'league', patch: { week: 6 } });
  assert.equal(leagueLayer(state.views.league).layer, 'week');
  const again = tile(playLip(state));
  assert.deepEqual(leagueLayer(again.views.league), { layer: 'board', season: null, week: null }, 'the tile opens the board, not Week 6');
  assert.equal(fragmentFor('play', again.views.play, again.views), '#play/league', 'and its address is the canonical board');
  const switched = tile(reduce(reduce(state, { type: 'tab', tab: 'home' }), { type: 'tab', tab: 'play' }));
  assert.equal(leagueLayer(switched.views.league).layer, 'board', 'the same after a tab switch');
  // History from that board starts fresh: no week and no season left from the last visit.
  const history = reduce(again, { type: 'view', tab: 'league', patch: { view: 'history', week: null } });
  assert.deepEqual(leagueLayer(history.views.league), { layer: 'history', season: null, week: null });
  // Inside League a step keeps its own keys: the History lip from a week returns to that season's History.
  const inside = reduce(state, { type: 'view', tab: 'league', patch: { week: null } });
  assert.deepEqual(leagueLayer(inside.views.league), { layer: 'history', season: 2025, week: null });
  // Openers that name their layer still get it.
  assert.equal(leagueLayer(reduce(playLip(state), { type: 'go', tab: 'league', view: { view: 'feed' } }).views.league).layer, 'feed');
});

test('F1 League: browser Back from the feed or History (a restored entry) lands on the board; deep links and Forward still open the layer', async () => {
  for (const patch of [{ view: 'feed' }, { view: 'history', week: null }]) {
    const win = fakeWindow('https://gtl.test/#play/league'), shell = app(win);
    shell.dispatch({ type: 'view', tab: 'league', patch }); await settle();
    const opened = win.location.hash;
    assert.notEqual(opened, '#play/league');
    win.history.back(); await settle();
    assert.equal(leagueLayer(shell.state.views.league).layer, 'board', `Back from ${patch.view} lands on the board`);
    assert.equal(win.location.hash, '#play/league', 'and the address stays the board');
    win.history.forward(); await settle();
    assert.equal(leagueLayer(shell.state.views.league).layer, patch.view, 'Forward reopens the layer');
    assert.equal(win.location.hash, opened);
    shell.connection.disconnect();
  }
  // A History week restored, then Back to an entry without a week or season: History, then the board.
  const win = fakeWindow('https://gtl.test/#play/league'), shell = app(win);
  shell.dispatch({ type: 'view', tab: 'league', patch: { view: 'history', week: null } });
  shell.dispatch({ type: 'view', tab: 'league', patch: { season: 2025 } });
  shell.dispatch({ type: 'view', tab: 'league', patch: { week: 6 } }); await settle();
  win.history.back(); await settle();
  assert.deepEqual(leagueLayer(shell.state.views.league), { layer: 'history', season: 2025, week: null });
  win.history.back(); await settle();
  assert.deepEqual(leagueLayer(shell.state.views.league), { layer: 'board', season: null, week: null });
  shell.connection.disconnect();
  for (const [fragment, layer] of [['#play/league?view=feed', 'feed'], ['#play/league?view=history', 'history'], ['#play/league?season=2026&week=6&view=history', 'week']]) {
    const deep = fakeWindow(`https://gtl.test/${fragment}`), linked = app(deep);
    assert.equal(leagueLayer(linked.state.views.league).layer, layer, `${fragment} opens ${layer}`);
    linked.connection.disconnect();
  }
  // A followed #play/league link from History (popstate with no saved entry) lands on the board too.
  const followed = fakeWindow('https://gtl.test/#play/league?view=history'), linked = app(followed);
  followed.follow('#play/league'); await settle();
  assert.equal(leagueLayer(linked.state.views.league).layer, 'board');
  linked.connection.disconnect();
});

// Follow-up: League's board market and Picks's market are separate. The address and the board agree; Picks keeps its own.
test('League market: Picks Total then the League tile shows Spread and says so; the deep link opens Total; Back and the lip keep Picks on Total', () => {
  let state = reduce(initialState({ tab: 'play' }), { type: 'go', tab: 'play', view: { section: 'picks', market: 'total', ...CLOSED_LAYER } });
  assert.equal(state.views.play.market, 'total');
  const tile = reduce(state, { type: 'go', tab: 'play', view: { section: 'league', ...CLOSED_LAYER } });
  assert.equal(leagueMode(tile.views.league.market), 'guess_spread', 'the board shows Spread');
  assert.equal(fragmentFor('play', tile.views.play, tile.views), '#play/league', 'and the address names no market');
  assert.equal(reduce(tile, { type: 'back' }).views.play.market, 'total', 'Back returns to Picks on Total');
  const lip = reduce(reduce(tile, { type: 'go', tab: 'play', view: { section: undefined, ...CLOSED_LAYER } }), { type: 'go', tab: 'play', view: { section: 'picks', ...CLOSED_LAYER } });
  assert.equal(lip.views.play.market, 'total', 'the Play lip then the Picks tile reopens Total');
  const board = reduce(tile, { type: 'view', tab: 'league', patch: { market: 'total' } });
  assert.equal(fragmentFor('play', board.views.play, board.views), '#play/league?market=total', "the board's own switch writes the address");
  assert.equal(reduce(board, { type: 'tab', tab: 'home' }).views.league.market, 'total', 'a tab switch alone leaves the choice');
  assert.equal(leagueMode(reduce(reduce(board, { type: 'tab', tab: 'home' }), { type: 'go', tab: 'play', view: { section: 'league', ...CLOSED_LAYER } }).views.league.market), 'guess_spread', 'but arriving from outside opens Spread');
  const deep = placeFromFragment('#play/league?market=total');
  assert.equal(leagueMode(deep.adapters.league.market), 'guess_total', 'the deep link names Total');
  assert.equal(fragmentFor(deep.tab, deep.view, deep.adapters), '#play/league?market=total');
  const restored = reduce(state, { type: 'restore', place: deep });
  assert.equal(leagueMode(restored.views.league.market), 'guess_total');
  assert.equal(restored.views.play.market, 'total', 'Picks keeps its own market');
  const fresh = reduce(initialState({ tab: 'play' }), { type: 'restore', place: deep });
  assert.equal(fresh.views.play.market, undefined, 'a deep link into League does not set Picks');
  assert.equal(fragmentFor('play', tile.views.play, tile.views), '#play/league');
});

test('D-69 step 2: Who’s in is a Home layer at #home?layer=who: a step; its lip and Back close it; a reload reopens it; the Home tab opens the root', () => {
  const root = initialState({ tab: 'home' });
  const who = reduce(root, { type: 'view', tab: 'home', patch: { layer: 'who' } });
  assert.equal(who.views.home.layer, 'who');
  assert.equal(who.trail.length, 1, 'opening the layer is a step');
  assert.equal(who.navMode, 'go');
  assert.equal(fragmentFor('home', who.views.home), '#home?layer=who');
  for (const closed of [reduce(who, { type: 'back' }), reduce(who, { type: 'view', tab: 'home', patch: { layer: undefined } })]) {
    assert.equal(closed.views.home.layer ?? null, null);
    assert.deepEqual(closed.trail, [], 'the lip is Back, so the next Back leaves nothing open');
  }
  const reloaded = initialState(placeFromFragment('#home?layer=who'));
  assert.deepEqual([reloaded.tab, reloaded.views.home.layer, reloaded.trail.length], ['home', 'who', 0], 'a reload or a shared link reopens it');
  const back = reduce(reloaded, { type: 'back' });
  assert.deepEqual([back.tab, back.views.home.layer ?? null, back.navMode], ['home', null, 'back'], 'Back after a reload closes the layer');
  assert.equal(reduce(who, { type: 'tab', tab: 'home' }).views.home.layer ?? null, null, 'the Home tab opens Home’s root');
  assert.equal(reduce(who, { type: 'go', tab: 'home' }).views.home.layer ?? null, null, 'so does the logo');
  const away = reduce(who, { type: 'go', tab: 'play', view: { section: 'score' } });
  assert.equal(reduce(away, { type: 'back' }).views.home.layer, 'who', 'Back from another tab returns to the layer');
  assert.equal(placeFromFragment('#home?layer=%3Cscript%3E').view?.layer, undefined, 'only safe characters');
});

test('D-69 step 2: browser Back closes Home’s Who’s in layer, Forward reopens it, and a reload keeps it', async () => {
  const win = fakeWindow('https://gtl.test/#home'); const shell = app(win);
  shell.dispatch({ type: 'view', tab: 'home', patch: { layer: 'who' } });
  assert.equal(win.location.hash, '#home?layer=who');
  win.history.back(); await settle();
  assert.equal(shell.state.views.home.layer ?? null, null);
  assert.equal(win.location.hash, '#home');
  win.history.forward(); await settle();
  assert.equal(shell.state.views.home.layer, 'who');
  shell.connection.disconnect();
  const reloaded = app(win);
  assert.equal(reloaded.state.views.home.layer, 'who');
  reloaded.connection.disconnect();
});

test('D-69 step 2: Who’s in is Home’s only layer: #home?layer=<anything else> is Home’s root, not a detail with Back (final review M3)', () => {
  for (const fragment of ['#home?layer=anything', '#home?layer=awards', '#home?layer=']) {
    const place = placeFromFragment(fragment);
    assert.equal(place?.view?.layer, undefined, `${fragment}: no layer in the place`);
    const state = initialState(place);
    assert.equal(state.views.home.layer ?? null, null, fragment);
    assert.equal(isDetail(state), false, `${fragment}: not a detail`);
    assert.equal(canGoBack(state), false, `${fragment}: no Back on Home’s root`);
  }
  // A history entry that carries an unknown Home layer is cleaned the same way.
  assert.equal(fragmentFor('home', { layer: 'anything' }), '#home');
  assert.equal(isDetail(reduce(initialState({ tab: 'home' }), { type: 'view', tab: 'home', patch: { layer: 'nope' } })), false, 'an unknown layer value is never a detail');
  assert.equal(isDetail(initialState(placeFromFragment('#home?layer=who'))), true, 'Who’s in still is');
  assert.deepEqual(HOME_LAYER_IDS, Object.values(HOME_LAYERS), 'the shell’s list is Home’s layers');
});

test('D-69 step 2: Home’s and Play’s layers never cross tabs: Who’s in to Play › Your score, and a Play layer to the Home tab (final review M4)', () => {
  const who = initialState(placeFromFragment('#home?layer=who'));
  const score = reduce(who, { type: 'go', tab: 'play', view: { section: 'score' } });
  assert.equal(score.views.play.layer, undefined, 'Home’s layer never reaches Play');
  assert.equal(fragmentFor('play', score.views.play, score.views), '#play/score');
  const awards = initialState(placeFromFragment('#play/features?layer=awards'));
  assert.equal(awards.views.play.layer, 'awards');
  const home = reduce(awards, { type: 'tab', tab: 'home' });
  assert.equal(home.tab, 'home');
  assert.equal(home.views.home.layer, undefined, 'Play’s layer never reaches Home');
  assert.equal(fragmentFor('home', home.views.home, home.views), '#home');
});

const at = (state, tab) => fragmentFor(tab, state.views[tab], state.views);

test('D-69 step 3: one game and one team are Research layers with their own addresses; unknown values draw the list', () => {
  const game = placeFromFragment('#research/games?layer=game&item=SEA-DEN');
  assert.deepEqual([game.tab, game.view.section, game.adapters.lines.layer, game.adapters.lines.item], ['research', 'games', 'game', 'SEA-DEN']);
  const opened = initialState(game);
  assert.deepEqual(researchLayerOf('games', opened.views.lines), { layer: 'game', item: 'SEA-DEN' });
  assert.equal(opened.views.research.layer, undefined, 'the game lives in the lines view, never in Research’s own');
  assert.equal(at(opened, 'research'), '#research/games?layer=game&item=SEA-DEN', 'a reload or a shared link reopens it');
  const team = initialState(placeFromFragment('#research/teams?layer=team&item=SEA'));
  assert.deepEqual([team.views.research.section, team.views.research.layer, team.views.research.item], ['teams', 'team', 'SEA']);
  assert.equal(at(team, 'research'), '#research/teams?layer=team&item=SEA');
  for (const fragment of ['#research/games?layer=nope&item=SEA-DEN', '#research/games?layer=team&item=SEA', '#research/games?layer=game&item=%3Cx%3E',
    '#research/teams?layer=team&item=ZZZ', '#research/teams?layer=game&item=SEA-DEN', '#research/trends?layer=game&item=SEA-DEN']) {
    const state = initialState(placeFromFragment(fragment));
    const section = state.views.research.section;
    assert.equal(researchLayerOf(section, section === 'games' ? state.views.lines : state.views.research), null, fragment);
    assert.doesNotMatch(at(state, 'research'), /layer=|item=/, `${fragment}: the address draws the list`);
    assert.equal(isDetail(state), true, `${fragment}: the section is still a detail (Back leaves it), with no layer open`);
  }
  assert.deepEqual(Object.keys(RESEARCH_LAYERS), ['games', 'teams']);
});

test('D-69 step 3: opening a game or a team is a step; the lip and Back close it; the pager swaps the game in place, no step', () => {
  const board = initialState({ tab: 'research', view: { section: 'games' } });
  const game = reduce(board, { type: 'view', tab: 'lines', patch: { layer: 'game', item: 'SEA-DEN' } });
  assert.deepEqual([game.trail.length, game.navMode], [1, 'go'], 'opening the game is a step');
  const paged = reduce(game, { type: 'view', tab: 'lines', patch: { item: 'HOU-JAX' } });
  assert.deepEqual([paged.views.lines.item, paged.trail.length, paged.nav], ['HOU-JAX', 1, game.nav], 'the pager swaps the game in place: no step, no navigation');
  for (const closed of [reduce(paged, { type: 'back' }), reduce(paged, { type: 'view', tab: 'lines', patch: { layer: undefined, item: undefined } })]) {
    assert.equal(closed.views.research.section, 'games');
    assert.equal(researchLayerOf('games', closed.views.lines), null);
    assert.deepEqual(closed.trail, [], 'the lip is Back, so the next Back leaves the board');
  }
  const list = initialState({ tab: 'research', view: { section: 'teams' } });
  const team = reduce(list, { type: 'go', tab: 'research', view: { section: 'teams', layer: 'team', item: 'SEA' } });
  assert.equal(team.trail.length, 1);
  assert.equal(reduce(team, { type: 'view', tab: 'research', patch: { layer: undefined, item: undefined } }).views.research.layer ?? null, null);
  // From a game, a team opens Research › Teams › that team; Back returns to the game.
  const fromGame = reduce(game, { type: 'go', tab: 'research', view: { section: 'teams', layer: 'team', item: 'DEN' } });
  assert.deepEqual([fromGame.views.research.section, fromGame.views.research.item, fromGame.trail.length], ['teams', 'DEN', 2]);
  const back = reduce(fromGame, { type: 'back' });
  assert.deepEqual([back.views.research.section, researchLayerOf('games', back.views.lines)?.item], ['games', 'SEA-DEN']);
});

test('D-69 step 3: on a shared link or a reload, Back and the lip close one Research layer, to its list, never to the landing', () => {
  for (const [fragment, section, key] of [['#research/games?layer=game&item=SEA-DEN', 'games', 'lines'], ['#research/teams?layer=team&item=SEA', 'teams', 'research']]) {
    const linked = initialState(placeFromFragment(fragment));
    assert.equal(linked.trail.length, 0);
    for (const closed of [reduce(linked, { type: 'back' }), reduce(linked, { type: 'view', tab: key, patch: { layer: undefined, item: undefined } })]) {
      assert.deepEqual([closed.tab, closed.views.research.section, closed.navMode], ['research', section, 'back'], fragment);
      assert.equal(researchLayerOf(section, closed.views[key]), null, fragment);
      assert.deepEqual(closed.trail, []);
    }
    assert.equal(reduce(reduce(linked, { type: 'back' }), { type: 'back' }).views.research.section, undefined, 'the next Back leaves for the landing');
  }
});

test('D-69 step 3: a Research layer never rides into a fresh destination or another tab, and other tabs’ layers never reach Research', () => {
  const game = initialState(placeFromFragment('#research/games?layer=game&item=SEA-DEN'));
  const home = reduce(game, { type: 'tab', tab: 'home' });
  assert.equal(home.views.home.layer, undefined, 'a Research layer never reaches Home');
  assert.equal(at(reduce(home, { type: 'go', tab: 'research', view: { section: 'games' } }), 'research'), '#research/games', 'the Games tile and Home’s "All N games" open the board');
  assert.equal(at(reduce(game, { type: 'tab', tab: 'research' }), 'research'), '#research', 'the Research tab opens the landing');
  const who = initialState(placeFromFragment('#home?layer=who'));
  assert.equal(at(reduce(who, { type: 'go', tab: 'research', view: { section: 'teams' } }), 'research'), '#research/teams', 'Home’s layer never reaches Research');
  const awards = initialState(placeFromFragment('#play/features?layer=awards'));
  assert.equal(reduce(awards, { type: 'go', tab: 'research', view: { section: 'teams' } }).views.research.layer, undefined, 'Play’s layer never reaches Research');
  const team = initialState(placeFromFragment('#research/teams?layer=team&item=SEA'));
  assert.equal(at(reduce(team, { type: 'go', tab: 'play', view: { section: 'score' } }), 'play'), '#play/score', 'a Research layer never reaches Play');
  assert.equal(at(reduce(team, { type: 'go', tab: 'research', view: { section: 'teams' } }), 'research'), '#research/teams', 'the Teams tile opens the list');
  const restored = reduce(game, { type: 'restore', place: placeFromFragment('#research/games') });
  assert.equal(researchLayerOf('games', restored.views.lines), null, 'a restored board entry is the board, never the game left open');
});

test('D-69 step 3: browser Back closes the game layer; the pager rewrites its entry; Forward and a reload reopen the game shown', async () => {
  const win = fakeWindow('https://gtl.test/#research/games'); const shell = app(win);
  shell.dispatch({ type: 'view', tab: 'lines', patch: { layer: 'game', item: 'SEA-DEN' } });
  await settle();
  shell.dispatch({ type: 'view', tab: 'lines', patch: { item: 'HOU-JAX' } });
  await settle();
  assert.deepEqual(win.stack(), ['#research/games', '[#research/games?layer=game&item=HOU-JAX]']);
  win.history.back(); await settle();
  assert.equal(researchLayerOf('games', shell.state.views.lines), null);
  assert.equal(win.location.hash, '#research/games');
  win.history.forward(); await settle();
  assert.equal(shell.state.views.lines.item, 'HOU-JAX');
  shell.connection.disconnect();
  const reloaded = app(win);
  assert.deepEqual(researchLayerOf('games', reloaded.state.views.lines), { layer: 'game', item: 'HOU-JAX' });
  reloaded.connection.disconnect();
});

test('Monday recap: #home?layer=recap keeps its week, market and one game; Back closes the game, then the recap; other Home places keep none', () => {
  const place = placeFromFragment('#home?layer=recap&season=2026&week=9&market=total&item=MIA-GB');
  assert.deepEqual(place.view, { layer: 'recap', season: 2026, week: 9, market: 'total', item: 'MIA-GB' });
  assert.deepEqual(placeFromFragment(fragmentFor('home', place.view)).view, place.view, 'the address round-trips');
  // Only allowlisted values: a malformed game or market is dropped, never drawn.
  assert.deepEqual(placeFromFragment('#home?layer=recap&week=9&market=moneyline&item=%3Cscript%3E').view, { layer: 'recap', week: 9 });
  // Who's in and Home's root carry no recap keys.
  assert.deepEqual(placeFromFragment('#home?layer=who&week=9&item=MIA-GB').view, { layer: 'who' });
  assert.equal(placeFromFragment('#home?week=9&item=MIA-GB').view, undefined);
  // From Home: the recap, then one game, are two steps; Back closes the game and keeps the week, then the recap.
  const root = initialState({ tab: 'home' });
  const recap = reduce(root, { type: 'go', tab: 'home', view: { layer: 'recap', season: 2026, week: 9, market: 'spread' } });
  assert.equal(isDetail(recap), true);
  const game = reduce(recap, { type: 'view', tab: 'home', patch: { layer: 'recap', season: 2026, week: 9, market: 'spread', item: 'SEA-DEN' } });
  assert.equal(game.views.home.item, 'SEA-DEN');
  assert.equal(game.trail.length, recap.trail.length + 1, 'opening a game is a step');
  const market = reduce(recap, { type: 'view', tab: 'home', patch: { market: 'total' } });
  assert.equal(market.trail.length, recap.trail.length, 'Spread | Total is a choice inside the layer, not a step');
  const back = reduce(game, { type: 'back' });
  assert.deepEqual([back.views.home.layer, back.views.home.week, back.views.home.item ?? null], ['recap', 9, null]);
  const home = reduce(back, { type: 'back' });
  assert.equal(home.views.home.layer ?? null, null);
  // The recap never leaks into another tab, and a fresh Home destination starts at its root.
  assert.equal(reduce(game, { type: 'go', tab: 'play', view: { section: 'score' } }).views.play.item, undefined);
  assert.equal(reduce(reduce(game, { type: 'tab', tab: 'play' }), { type: 'tab', tab: 'home' }).views.home.item, undefined);
});
