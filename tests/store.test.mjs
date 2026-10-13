import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createStore, seed } from '../server/store.mjs';
import { withSyntheticLocalQuotes } from './fixtures/local-quotes.mjs';
const now = Date.parse('2026-10-08T16:00:00Z');
function setup(t,clock=()=>now,initialState){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gtl-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'state.json');if(initialState)fs.writeFileSync(file,JSON.stringify(initialState));return {store:createStore(file,clock),file};}
const fill=(view,value)=>Object.fromEntries(view.games.map(g=>[g.id,value]));
test('saved Sean picks and newest snapshot load correctly without static asset imports',t=>{const {store}=setup(t);const v=store.view('sean');assert.equal(v.score,null);assert.equal(v.games.length,15);assert.equal(v.games[0].prediction,-9.5);assert.equal(v.games.find(g=>g.id==='CIN-MIA').prediction,7);assert.equal(v.archivedCount,2);assert.deepEqual(v.history.map(h=>h.total),[95.8,95.8,96.4]);assert.equal(v.snapshot.verified,false);assert.match(v.snapshot.id,/150212/);});
test('unsubmitted player receives no benchmarks, opponents, scores or history in any route',t=>{const {store}=setup(t);for(const mode of ['guess_spread','guess_total','betting_challenge']){const v=store.view('troy',mode);assert.equal(v.score,null);assert.equal(v.snapshot,null);assert.deepEqual(v.history,[]);assert(v.standings.every(p=>p.points===null));assert(v.games.every(g=>g.market===null&&g.previousMarket===null&&g.points===null&&g.opponents.length===0));}assert.deepEqual(store.export('troy').ballots,{});});
test('total ballot starts blank and is independent; drafts persist across process recreation',t=>{const {store,file}=setup(t),v=store.view('sean','guess_total');assert.equal(v.score,null);assert(v.games.every(g=>g.prediction===null));store.saveBallot('sean','guess_total',{'TB-DAL':44.5});const reloaded=createStore(file,()=>Date.parse('2026-10-08T16:00:00Z'));assert.equal(reloaded.view('sean','guess_total').games[0].prediction,44.5);assert.equal(reloaded.view('sean').games[0].prediction,-9.5);assert.equal(reloaded.view('sean','guess_total').revealed,false);});
test('full ballot is required before reveal; with no stored line the submission saves pending and missing totals never become zeros',t=>{const {store,file}=setup(t);assert.throws(()=>store.saveBallot('troy','guess_total',{'TB-DAL':44.5},true));assert.throws(()=>store.saveBallot('troy','guess_total',{'TB-DAL':44.5,'PHI-JAX':-1}));assert.equal(store.view('troy','guess_total').statuses.guess_total.filled,0);const v=store.view('troy','guess_total');const saved=store.saveBallot('troy','guess_total',fill(v,44.5),true);assert.equal(saved.revealed,true);assert(saved.games.every(g=>g.scoringReference.status==='pending'&&g.points===null));assert.equal(saved.score,null);assert.equal(store.view('troy').revealed,false);assert.equal(fs.existsSync(file),true);});
test('draft and submitted revisions are audited and preserved without changing source files',t=>{
  const {store,file}=setup(t,undefined,withSyntheticLocalQuotes(seed(),now));
  const source='data/picks/2026-week-05.json',hash=()=>createHash('sha256').update(fs.readFileSync(source)).digest('hex'),original=hash();
  const v=store.view('sean'),picks=Object.fromEntries(v.games.map(g=>[g.id,g.prediction]));
  picks['TB-DAL']=-8;store.saveBallot('troy','guess_spread',picks);
  picks['TB-DAL']=-7.5;store.saveBallot('troy','guess_spread',picks);
  const draft=store.view('troy');
  assert.equal(draft.revisionCount,2);assert.equal(draft.audit[0].before['TB-DAL'],-8);assert.equal(draft.locked,false);
  store.saveBallot('troy','guess_spread',picks,true);
  const persisted=fs.readFileSync(file,'utf8'),reloaded=createStore(file,()=>Date.parse('2026-10-08T16:00:00Z'));
  assert.equal(reloaded.view('troy').lockReason,null);
  assert.throws(()=>reloaded.saveBallot('sean','guess_spread',{}),/Complete all/);
  assert.equal(fs.readFileSync(file,'utf8'),persisted);
  const previous = reloaded.export('troy').ballots.guess_spread;
  reloaded.saveBallot('troy','guess_spread',{...picks,'TB-DAL':-7});
  const revised = createStore(file,()=>Date.parse('2026-10-08T16:00:00Z')).export('troy');
  assert.equal(revised.ballots.guess_spread.picks['TB-DAL'],-7);
  assert.equal(revised.ballots.guess_spread.submittedAt,previous.submittedAt);
  assert.equal(revised.audit.at(-1).before['TB-DAL'],-7.5);
  assert.equal(revised.audit.at(-1).type,'ballot_edited');
  assert.equal(store.view('sean').history[2].total,96.4);assert.equal(store.view('sean').games[0].prediction,-9.5);
  assert.equal(hash(),original);
});
test('deadline is enforced on server, including at the exact instant',t=>{const {store}=setup(t,()=>Date.parse('2026-10-09T00:15:00Z'));assert.equal(store.view('sean').locked,true);assert.throws(()=>store.saveBallot('troy','guess_total',{},false),/deadline/);assert.equal(store.view('sean').officialStatus,'Scoring uses each guess’s saved submission or edit reference');});
test('legacy closest standings stay unscored and a no-op does not backfill historical references',t=>{const initial=seed(),picks=initial.ballots.sean.guess_spread.picks;for(const player of ['troy','luke'])initial.ballots[player]={guess_spread:{picks:structuredClone(picks),submittedAt:'2026-10-08T15:00:00Z',origin:'Synthetic legacy import'}};const {store}=setup(t,undefined,initial);assert(store.view('sean').standings.every(p=>p.record===null&&p.points===null));store.saveBallot('troy','guess_spread',picks,true);assert(store.view('troy').games.every(g=>g.scoringReference.status==='unavailable'));assert.deepEqual(store.export('troy').ballots.guess_spread.scoringReferences,{});});
test('Betting Challenge enforces independent ballot privacy, immutable line and one pick per game',t=>{const {store}=setup(t);const bet={gameId:'TB-DAL',market:'spread',side:'home',line:-3,odds:-110,source:'Unit test fixture, not current odds',quotedAt:'2026-10-08T15:59:00Z'};assert.throws(()=>store.saveBet('troy',bet),/ballot/);assert.throws(()=>store.saveBet('sean',{...bet,market:'total',side:'over',line:44.5}),/ballot/);store.saveBet('sean',bet);assert.throws(()=>store.saveBet('sean',{...bet,line:-4}),/One selection/);assert.equal(store.view('sean','betting_challenge').games[0].bet.line,-3);assert.equal(store.view('sean').games[0].prediction,-9.5);assert.equal(store.view('sean','betting_challenge').games[0].bet.result,null);});
test('unknown players, modes, and games are rejected',t=>{const {store}=setup(t);assert.throws(()=>store.view('intruder'));assert.throws(()=>store.view('sean','other'));assert.throws(()=>store.saveBallot('troy','guess_total',{'unknown':0}));assert.throws(()=>store.export('intruder'));});
test('failed disk persistence does not accept a ballot or audit in memory',t=>{
  const {store,file}=setup(t);
  // A directory at the target filename makes atomic replacement fail, even as root.
  fs.mkdirSync(file);
  assert.throws(()=>store.saveBallot('troy','guess_total',{'TB-DAL':44.5}));
  assert.equal(store.view('troy','guess_total').games[0].prediction,null);
  assert.deepEqual(store.export('troy').audit,[]);
});
test('local views refresh repository history while retaining saved private ballots',t=>{
  const {file}=setup(t);
  const saved=seed();
  saved.history=[];
  saved.ballots.troy={guess_total:{picks:{'TB-DAL':44.5},submittedAt:null}};
  fs.writeFileSync(file,JSON.stringify(saved));
  const reloaded=createStore(file,()=>Date.parse('2026-10-08T16:00:00Z'));
  assert.equal(reloaded.view('sean').score,null);
  assert.equal(reloaded.view('sean').history.length,3);
  assert.equal(reloaded.view('troy','guess_total').games[0].prediction,44.5);
  assert.equal(reloaded.view('troy','guess_total').revealed,false);
});

for (const mode of ['guess_spread', 'guess_total']) test(`${mode} local submission saves the newest stored line at any age, or pending, and never refuses`, t => {
  const cases = [
    [state => ({ ...state, consensusHistory: [] }), () => 'pending'],
    // Ten minutes old at the save but fresh at its own capture: the line at the guess, with its age.
    [state => withSyntheticLocalQuotes(state, now - 600_000), () => 'available'],
    [state => withSyntheticLocalQuotes(state, now, { gameIds: state.games.slice(1).map(game => game.id) }), index => index === 0 ? 'pending' : 'available'],
    [state => { const fixture = withSyntheticLocalQuotes(state, now); fixture.consensusHistory.forEach(row => delete row.id); return fixture; }, () => 'pending'],
  ];
  for (const [prepare, expected] of cases) {
    const { store } = setup(t, undefined, prepare(seed()));
    const picks = fill(store.view('troy', mode), mode === 'guess_total' ? 45 : -3);
    store.saveBallot('troy', mode, picks, false);
    const view = store.saveBallot('troy', mode, picks, true);
    assert.equal(view.revealed, true);
    view.games.forEach((game, index) => assert.equal(game.scoringReference.status, expected(index), `${game.id}`));
  }
});

test('local changed edits take the aged stored line with its age; no-op preserves valid original references', t => {
  let clock = now;
  const { store } = setup(t, () => clock, withSyntheticLocalQuotes(seed(), now));
  const picks = fill(store.view('troy', 'guess_total'), 45);
  assert.equal(store.saveBallot('troy', 'guess_total', picks, true).score, 150);
  const before = store.export('troy');
  clock += 600_000;
  store.saveBallot('troy', 'guess_total', picks, true);
  assert.deepEqual(store.export('troy').ballots.guess_total.scoringReferences, before.ballots.guess_total.scoringReferences);
  // Ten minutes later a changed guess takes the same stored line, now ten minutes old, and is scored against it.
  const edited = store.saveBallot('troy', 'guess_total', { ...picks, 'TB-DAL': 46 }, false);
  const ref = store.export('troy').ballots.guess_total.scoringReferences['TB-DAL'];
  assert.equal(ref.status, 'available'); assert.equal(ref.value, 45); assert.ok(ref.ageSeconds >= 600, String(ref.ageSeconds));
  assert.equal(edited.score, 148);
});

test('local submitted edits require fresh evidence only for the changed guess', t => {
  const { store, file } = setup(t, undefined, withSyntheticLocalQuotes(seed(), now));
  const picks = fill(store.view('troy', 'guess_total'), 45);
  store.saveBallot('troy', 'guess_total', picks, true);
  const initial = store.export('troy').ballots.guess_total;
  const next = withSyntheticLocalQuotes(JSON.parse(fs.readFileSync(file, 'utf8')), now + 600_000, { values: { guess_total: 46 }, gameIds: ['TB-DAL'] });
  fs.writeFileSync(file, JSON.stringify(next));
  const later = createStore(file, () => now + 600_000);
  const view = later.saveBallot('troy', 'guess_total', { ...picks, 'TB-DAL': 46 }, false);
  assert.equal(view.score, 150);
  const revised = later.export('troy').ballots.guess_total;
  assert.notDeepEqual(revised.scoringReferences['TB-DAL'], initial.scoringReferences['TB-DAL']);
  for (const game of view.games.slice(1)) assert.deepEqual(revised.scoringReferences[game.id], initial.scoringReferences[game.id]);
});
