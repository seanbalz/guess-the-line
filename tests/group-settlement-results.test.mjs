import test from 'node:test';
import assert from 'node:assert/strict';
import {applyReviewedResults} from '../cloud/results.mjs';
const state={league:{season:2026,week:5},games:[{id:'TB-DAL',home:'Dallas Cowboys',away:'Tampa Bay Buccaneers',kickoff:'2026-10-09T00:15:00Z'}],results:{}};
const row={status:'final',reviewType:'settlement',homeTeam:'Dallas Cowboys',awayTeam:'Tampa Bay Buccaneers',scheduledKickoff:state.games[0].kickoff,home:21,away:14,version:1,observedAt:'2026-10-10T00:00:00Z',reviewedAt:'2026-10-10T00:00:00Z',source:'nflverse nfldata games.csv final scores',sourceURL:'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'};
test('private group final read accepts settlement provenance without claiming commissioner review',()=>{
 const read=r=>applyReviewedResults(state,{season:2026,week:5,games:{'TB-DAL':r}},Date.parse('2026-10-11T00:00:00Z'));
 assert.equal(read(row).results['TB-DAL']?.home,21);
 assert.equal(read(row).results['TB-DAL']?.reviewType,'settlement');
 assert.deepEqual(read({...row,homeTeam:'Wrong'}).results,{});
 assert.deepEqual(read({...row,observedAt:'2026-10-12T00:00:00Z'}).results,{});
});
