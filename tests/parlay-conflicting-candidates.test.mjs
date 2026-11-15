import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, NOW, AT } from './fixtures/research-assessments.mjs';
import { propOfferCandidates } from '../cloud/parlay-offer-candidates.mjs';
import { buildResearchAssessments } from '../shared/research-assessments.mjs';
import { buildParlayIdeas } from '../shared/parlay-research.mjs';

function mixed({lockedDependency=false, wrongTerms=false}={}) {
  const f=fixture();
  f.board.games.push({...f.board.games[0],id:'DAL-PHI'});
  f.board.games.push({...f.board.games[0],id:'NYG-WAS',spread:{visible:!lockedDependency}});
  const quotes=[f.quote,{...f.quote,gameId:'DAL-PHI',selection:{...f.quote.selection,playerId:'second-player'}}];
  const research={generatedAt:AT,source:{stats:{url:'https://example.org/stats',sha256:'a'.repeat(64)}},games:quotes.map(q=>({gameId:q.gameId,players:[{playerId:q.selection.playerId,playerName:q.selection.playerName,markets:[{key:q.selection.key,unit:q.selection.unit,baseline:{status:'available',projection:80,sample:8,trainingPeriod:{from:'2026-09-01T00:00:00Z',to:'2026-10-29T00:00:00Z'},holdout:{mae:24,count:3}}}]}]}))};
  const imported={...f.candidate, id:'imported-opposition',dependencies:[...f.candidate.dependencies,{gameId:'NYG-WAS',market:'spread'}],evidence:[{...f.evidence,stance:'oppose'}],selection:{...f.candidate.selection,line:wrongTerms?70.5:f.candidate.selection.line}};
  const snapshot={...f.snapshot,candidates:[imported,...propOfferCandidates(quotes,research,NOW)],quotes};
  return buildResearchAssessments({board:f.board,snapshot,now:NOW});
}
test('generated baseline cannot erase eligible imported opposition at identical terms',()=>{
  const data=mixed();
  const duplicated=data.assessments.filter(a=>a.gameId==='SEA-DEN');
  assert.equal(duplicated.length,2);
  assert.ok(duplicated.every(a=>a.hasConflicts&&a.evidence.some(e=>e.eligible&&e.stance==='oppose')));
  assert.equal(buildParlayIdeas(data.assessments,{now:NOW}).length,0);
});
test('hidden-dependency opposition cannot affect visible cards or ticket availability',()=>{
  const data=mixed({lockedDependency:true});
  assert.ok(data.assessments.every(a=>!a.hasConflicts));
  assert.ok(data.assessments.every(a=>a.evidence.every(e=>e.stance!=='oppose')));
  assert.equal(buildParlayIdeas(data.assessments,{now:NOW}).length,1);
});
test('opposition to different line terms is not merged into this selection',()=>{
  const data=mixed({wrongTerms:true});
  assert.equal(buildParlayIdeas(data.assessments,{now:NOW}).length,1);
});
