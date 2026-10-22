import test from 'node:test';
import assert from 'node:assert/strict';
import { TABS, initialState, reduce } from '../web/src/next/shell/state.js';
import { placeFromFragment, fragmentFor, startPlace, connectHistory } from '../web/src/next/shell/router.js';

test('four roots retain legacy adapters and aliases', () => {
  assert.deepEqual(TABS, ['home','play','bets','research']);
  for (const [alias, tab, section] of [['league','play','league'],['lines','research','games'],['fantasy','research','fantasy']]) {
    const state = reduce(initialState(), {type:'go',tab:alias,view:{market:'total'}});
    assert.equal(state.tab,tab); assert.equal(state.views[tab].section,section);
    assert.equal(state.views[alias].market,'total');
    assert.equal(placeFromFragment(`#${alias}`).tab,tab);
  }
});
test('details Back returns through nested origins with local filters intact', () => {
  let state=reduce(initialState(),{type:'view',tab:'home',patch:{period:'season'}});
  state=reduce(state,{type:'go',tab:'play',view:{section:'score',market:'total',week:7}});
  state=reduce(state,{type:'view',tab:'play',patch:{team:'SEA'}});
  state=reduce(state,{type:'go',tab:'play',view:{section:'compare'}});
  state=reduce(state,{type:'back'});
  assert.equal(state.views.play.section,'score'); assert.equal(state.views.play.team,'SEA');
  state=reduce(state,{type:'back'});
  assert.equal(state.tab,'home'); assert.equal(state.views.home.period,'season');
  state=reduce(state,{type:'tab',tab:'play'});
  assert.ok(!state.views.play.section); assert.equal(state.views.play.team,'SEA');
});
test('navigation address reload retains only explicit metadata and market intent', () => {
  const fragment=fragmentFor('play',{section:'picks',market:'total',season:2026,week:7,guess:55,editor:{note:'secret'},players:['private']});
  assert.doesNotMatch(fragment,/secret|guess|players|editor/);
  const state=initialState(placeFromFragment(fragment));
  assert.equal(state.views.play.section,'picks'); assert.equal(state.views.play.market,'total'); assert.equal(Number(state.views.play.week),7);
  assert.equal(placeFromFragment('#access_token=x&type=signup'),null);
  assert.equal(placeFromFragment('#invite=abc'),null);
});
test('a section patch creates navigation while filter patches stay in place',()=>{
  let state=reduce(initialState({tab:'play'}),{type:'view',tab:'play',patch:{section:'picks',market:'total'}});
  assert.equal(state.trail.length,1);
  state=reduce(state,{type:'view',tab:'play',patch:{team:'SEA'}});
  assert.equal(state.trail.length,1);
  state=reduce(state,{type:'back'}); assert.ok(!state.views.play.section);
});

test('direct adapter details and legacy section changes keep reversible adapter preferences', () => {
  let state=reduce(initialState(),{type:'go',tab:'research',view:{section:'games',market:'total'}});
  assert.equal(state.views.lines.market,'total');
  state=reduce(state,{type:'go',tab:'league',view:{view:'board'}});
  state=reduce(state,{type:'view',tab:'league',patch:{view:'history'}});
  state=reduce(state,{type:'back'});
  assert.equal(state.views.league.view,'board'); assert.equal(state.views.play.section,'league');
});

test('switching an editor market is reversible navigation while score filters remain local', () => {
  let state=initialState({tab:'play',view:{section:'picks',market:'total'}});
  state=reduce(state,{type:'view',tab:'play',patch:{market:'spread'}});
  assert.equal(state.trail.length,1);
  state=reduce(state,{type:'back'}); assert.equal(state.views.play.market,'total');
  state=initialState({tab:'play',view:{section:'score',market:'total'}});
  state=reduce(state,{type:'view',tab:'play',patch:{market:'spread'}}); assert.equal(state.trail.length,0);
});

test('Back to a root preserves newer nested ticket and Fantasy preferences', () => {
  let state=initialState({tab:'bets'});
  state=reduce(state,{type:'go',tab:'bets',view:{view:'tracked'}});
  state=reduce(state,{type:'view',tab:'bets',patch:{trackers:{tracked:{filters:{outcome:'settled'}}},season:2026,week:5}});
  state=reduce(state,{type:'back'});
  assert.equal(state.views.bets.trackers?.tracked?.filters?.outcome,'settled');
  state=reduce(state,{type:'go',tab:'fantasy'});
  state=reduce(state,{type:'view',tab:'fantasy',patch:{selection:{season:2026,week:5},filters:{position:'WR'},season:2026,week:5}});
  state=reduce(state,{type:'back'});
  assert.equal(state.views.fantasy.filters?.position,'WR'); assert.equal(state.views.fantasy.week,5);
  state=reduce(state,{type:'restore',place:{tab:'research',view:{section:'fantasy'},adapters:{fantasy:{season:2026,week:5}}}});
  assert.equal(state.views.fantasy.filters?.position,'WR');
});
