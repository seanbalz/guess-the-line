import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, layer, reduce } from '../web/src/next/shell/state.js';
import { nflFrameContext, eplFrameContext } from '../web/src/next/shell/confirmedFrame.js';

const at = (tab, view) => initialState({ tab, view });
const actual = { screen: true, points: true };
test('confirmed NFL contexts require actual registry identity and exact named destinations', () => {
  for (const tab of ['home', 'play', 'bets']) assert.ok(nflFrameContext(at(tab), actual));
  for (const section of ['points', 'score', 'league']) assert.ok(nflFrameContext(at('play', { section }), actual));
  for (const section of ['games', 'trends', 'teams', 'fantasy']) assert.ok(nflFrameContext(at('research', { section }), actual));
  for (const view of ['recommended', 'virtual']) assert.ok(nflFrameContext(at('bets', { view }), actual));
  assert.ok(nflFrameContext(at('bets', { view: 'tracked', trackedPane: 'overview' }), actual));
  for (const view of ['active', 'settled']) assert.ok(nflFrameContext(at('bets', { view, selectedTicket: 'known-opening' }), actual));
  for (const [tab, view] of [['home', {layer:'who'}], ['play',{section:'compare'}], ['play',{section:'features'}], ['play',{section:'unknown'}], ['research',{}], ['research',{section:'unknown'}], ['bets',{view:'research'}], ['bets',{view:'active'}], ['bets',{view:'settled'}], ['bets',{view:'tracked',trackedPane:'tickets'}], ['bets',{view:'everyone'}]]) assert.equal(nflFrameContext(at(tab,view),actual), null);
  for (const tab of ['home','play','bets','research']) assert.equal(nflFrameContext(at(tab)),null);
  assert.equal(nflFrameContext(at('play',{section:'points'}),{screen:true}),null);
  assert.equal(nflFrameContext(at('play',{section:'league',view:'history'}),actual),null);
});
test('opened editable drafts have a route-bound presentation signal; closed, locked and weekly cards do not inherit it', () => {
  for (const market of ['spread','total']) {
    const state = at('play',{section:'picks',market,pickGame:'SEA-DEN'});
    assert.equal(nflFrameContext(state,actual),null);
    assert.equal(nflFrameContext(state,{...actual,draft:true}),'play-draft');
    assert.equal(nflFrameContext(at('play',{section:'picks',market}),{...actual,draft:true}),null);
  }
});
test('recognized History replaces the opener, covers replace pages, and modal-only layers inherit the actual host', () => {
  for (const view of [undefined,'guess','bets','older']) {
    const state=reduce(at('research'),{type:'open',layer:layer('page.history', {view})});
    assert.equal(nflFrameContext(state,{history:true}),'history');
    assert.equal(nflFrameContext(state,actual),null);
    assert.equal(nflFrameContext(state,{cover:true}),'league-cover');
    assert.equal(nflFrameContext(state,{unknownCover:true,history:true}),null);
  }
  const unknown=reduce(at('home'),{type:'open',layer:layer('page.custom')});
  assert.equal(nflFrameContext(unknown,{...actual,history:true}),null);
  for (const id of ['sh.menu','dlg.test','pop.test','ov.test']) {
    assert.equal(nflFrameContext(reduce(at('play',{section:'points'}),{type:'open',layer:layer(id)}),actual),'play-points');
    assert.equal(nflFrameContext(reduce(at('research'),{type:'open',layer:layer(id)}),actual),null);
  }
});
test('EPL uses only actual Home/Play; FEPL aliases, every Fantasy state, Bets and unavailable History remain native', () => {
  assert.equal(eplFrameContext(at('home')),'epl-home');
  for (const section of [undefined,'pick','guess','leaderboard']) assert.equal(eplFrameContext(at('play',{section})),'epl-play');
  for (const section of [undefined,'fantasy']) assert.equal(eplFrameContext(at('research',{section})),null);
  assert.equal(eplFrameContext(at('bets')),null);
  assert.equal(eplFrameContext(at('play',{section:'unknown'})),null);
  assert.equal(eplFrameContext(reduce(at('home'),{type:'open',layer:layer('page.history')})),null);
});
