import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RESEARCH_PROP_UNITS,researchMarketLabel} from '../shared/research-markets.mjs';

test('every accepted research stat and alternate variant has a market label',()=>{
  for(const key of Object.keys(RESEARCH_PROP_UNITS)) {
    assert.ok(researchMarketLabel(key),`${key} must not fall back to a broad category`);
    assert.equal(researchMarketLabel(`${key}_alternate`),`${researchMarketLabel(key)} (alternate)`);
  }
  for(const key of [null,undefined,'unknown_market','toString'])assert.equal(researchMarketLabel(key),null);
});
test('binary TD, period and combined markets retain distinct labels',()=>{
  assert.equal(researchMarketLabel('player_1st_td'),'First touchdown scorer');
  assert.equal(researchMarketLabel('player_last_td'),'Last touchdown scorer');
  assert.equal(researchMarketLabel('player_anytime_td'),'Anytime touchdown scorer');
  assert.equal(researchMarketLabel('player_pass_yds_q1'),'First-quarter passing yards');
  assert.equal(researchMarketLabel('player_pass_rush_reception_yds'),'Passing + rushing + receiving yards');
});
