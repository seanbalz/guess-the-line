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
function app(win, confirmLeave) {
  let state = initialState(startPlace(win));
  const connection = connectHistory(win, { getState: () => state, confirmLeave, dispatch: action => { const prev = state; state = reduce(state, action); connection.sync(prev, state); } });
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
