import test from 'node:test';
import assert from 'node:assert/strict';
import { sportSwitchHash } from '../web/src/next/sportSwitch.js';
import { EPL_ROUTER } from '../web/src/next/epl/shellRoute.js';

test('sport changes keep the primary section and only transfer a shared sport-neutral subsection', () => {
  for (const tab of ['home', 'play', 'bets', 'research']) {
    const epl = sportSwitchHash('epl', `#${tab}`);
    assert.equal(EPL_ROUTER.placeFromFragment(epl).tab, tab);
    assert.equal(sportSwitchHash('nfl', epl).split('/')[0], `#${tab}`);
  }
  assert.equal(sportSwitchHash('epl', '#research/fantasy?week=8&fantasyPlayer=123'), '#epl/research/fantasy');
  assert.equal(sportSwitchHash('nfl', '#epl/research/fantasy'), '#research/fantasy');
  assert.equal(sportSwitchHash('epl', '#play/picks?week=8&leagueId=sean-troy-luke'), '#epl/play/pick');
  assert.equal(sportSwitchHash('nfl', '#epl/play/guess'), '#play');
  assert.equal(sportSwitchHash('epl', '#bets/tracked?week=8'), '#epl/bets');
});

test('EPL shell history drops NFL fields, treats default modes as roots, and leaves unrelated fragments alone', () => {
  assert.deepEqual(EPL_ROUTER.placeFromFragment('#epl/play/pick'), { tab: 'play', view: {} });
  assert.deepEqual(EPL_ROUTER.cleanPlace({ tab: 'play', view: { section: 'guess', week: 8, leagueId: 'nfl', pickGame: 'private' } }), { tab: 'play', view: { section: 'guess' } });
  assert.equal(EPL_ROUTER.fragmentFor('play', { section: 'picks', week: 8 }), '#epl/play/pick');
  for (const fragment of ['#home', '#nba/bets', '#main', '#invite=private']) assert.equal(EPL_ROUTER.placeFromFragment(fragment), null);
});
