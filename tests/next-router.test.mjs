// Redesign build plan stage 10: the new app's address and Back button (web/src/next/shell/router.js) against a fake
// window whose history behaves like a browser's: pushState drops forward entries, back() and forward() traverse later
// (popstate arrives as its own task), and a traversal to an entry with another fragment fires popstate too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectHistory, fragmentFor, isLegacyFragment, placeFromFragment, startPlace } from '../web/src/next/shell/router.js';
import { EPL_ROUTER } from '../web/src/next/epl/shellRoute.js';
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
  for (const [tab, view] of [['play', { section: 'score' }], ['research', { section: 'games' }], ['bets', { view: 'tracked' }], ['home', {}]]) {
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
