import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../server/store.mjs';
import { createEngine } from '../server/engine.mjs';
import { applyScoringBenchmark } from '../cloud/scoring-view.mjs';
const now = Date.parse('2026-10-08T18:00:00Z'), at = new Date(now - 60000).toISOString();
function fixture() {
  const state = seed(); state.league.id = 'approved-duel'; state.league.roster = state.league.roster.slice(0, 2);
  state.ballots.troy = { guess_spread: { picks: Object.fromEntries(Object.entries(state.ballots.sean.guess_spread.picks).map(([id, value]) => [id, value + 1.5])), submittedAt: at } };
  const view = { ...createEngine(state, { clock: () => now }).view('sean'), scoringPolicy: 'legacy-common' }; // Archived policy projection fixture.
  const benchmark = { policyId: 'approved-policy', leagueId: state.league.id, season: 2026, week: 5, mode: 'guess_spread', status: 'provisional',
    source: 'Three approved books', sourceUrl: null, capturedAt: at, quotedAt: at, actualKickoff: null,
    games: Object.fromEntries(view.games.map(g => [g.id, { value: g.prediction + .5, oldestObservedAt: at, newestObservedAt: at }])) };
  return { view, benchmark, state };
}
test('approved scoped median gives separate accuracy and closest records without modifying any original data', () => {
  const {view,benchmark,state}=fixture(), original=structuredClone({view,benchmark,state});
  const result=applyScoringBenchmark(view,benchmark,now);
  assert.equal(result.score,135); assert.equal(result.standings.find(p=>p.id==='troy').points,120);
  assert.deepEqual(result.standings.find(p=>p.id==='sean').record,{W:15,L:0,T:0});
  assert.equal(result.snapshot.verified,false); assert.equal(result.scoringBenchmark.status,'provisional');
  assert.deepEqual(result.history,view.history); assert.equal(Object.hasOwn(result.scoringBenchmark,'games'),false);
  assert.deepEqual({view,benchmark,state},original);
  for(const changed of [{...view,revealed:false},{...view,mode:'guess_total'},{...view,officialEligible:false},{...view,league:{...view.league,id:'another-group'}},{...view,league:{...view.league,practice:true}},{...view,league:{...view.league,week:6}}]) assert.equal(applyScoringBenchmark(changed,benchmark,now),changed);
});
test('unsubmitted opponents remain unscored and tied zero spreads remain ties', () => {
  const {view,benchmark}=fixture();
  view.standings.find(p=>p.id==='troy').submitted=false;
  const partial=applyScoringBenchmark(view,benchmark,now);
  assert.equal(partial.standings.find(p=>p.id==='troy').points,null); assert(partial.standings.every(p=>p.record===null));
  view.standings.find(p=>p.id==='troy').submitted=true;
  for(const g of view.games){g.prediction=-.5;g.opponents.find(p=>p.id==='troy').value=.5;benchmark.games[g.id].value=0;}
  const tied=applyScoringBenchmark(view,benchmark,now);
  assert.equal(tied.score,135); assert(tied.games.every(g=>g.market===0));
  assert(tied.standings.every(p=>p.points===135&&p.record.T===15&&p.record.W===0));
});
test('stale provisional values stay labeled while frozen data requires explicit fresh pre-kickoff evidence', () => {
  const {view,benchmark}=fixture();
  assert.equal(applyScoringBenchmark(view,benchmark,now+600000).scoringBenchmark.stale,true);
  const frozen={...benchmark,status:'frozen',actualKickoff:new Date(now-30000).toISOString()};
  assert.equal(applyScoringBenchmark(view,frozen,now).snapshot.verified,true);
  assert.equal(applyScoringBenchmark(view,frozen,now+3600000).scoringBenchmark.stale,false);
  for(const b of [{...frozen,actualKickoff:null},{...frozen,actualKickoff:new Date(now+1).toISOString()},{...frozen,actualKickoff:at},{...frozen,actualKickoff:new Date(now+600000).toISOString()},{...benchmark,games:{}},{...benchmark,quotedAt:'invalid'}]) assert.equal(applyScoringBenchmark(view,b,now),view);
});

test('submission-time references cannot be overwritten by an archived common benchmark', () => {
  const { view, benchmark } = fixture();
  const current = { ...view, scoringPolicy: 'submission-time' };
  assert.equal(applyScoringBenchmark(current, benchmark, now), current);
});
