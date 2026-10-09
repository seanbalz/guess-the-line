import test from 'node:test';
import assert from 'node:assert/strict';
import { draftFromGames, draftScope, mergeDraft, writeDraft, readDraft, clearTabDrafts } from '../web/src/predictionDraft.js';
import { validateChallengeQuote } from '../web/src/challengeReview.js';
import { buildPlayerComparison } from '../web/src/playerComparisonModel.js';
import { normalizePreferences, quietAt, planReminder, movementEvents, deliveryDecision } from '../server/notifications/policy.mjs';
const fakeStorage = () => { const values = new Map(); return {get length(){return values.size},getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),key:index=>[...values.keys()][index]}; };
test('tab draft scopes isolate account, season, week and market; recovery is not account data', () => {
 const games=[{id:'a',prediction:null},{id:'b',prediction:-3}], data={playerId:'p',league:{season:2026,week:5},mode:'guess_spread'};
 const scope=draftScope(data), storage=fakeStorage(), base=draftFromGames(games); assert.equal(base.a,'');
 assert.equal(writeDraft(scope,{a:'2.5',b:'-3'},base,storage),true); assert.equal(readDraft(scope,games,storage).draft.a,'2.5');
 for(const other of [{...data,playerId:'other'},{...data,mode:'guess_total'},{...data,league:{season:2026,week:6}}]) assert.equal(readDraft(draftScope(other),games,storage),null);
 storage.setItem('theme','light');clearTabDrafts(storage);assert.equal(storage.getItem('theme'),'light');assert.equal(readDraft(scope,games,storage),null);
 assert.equal(writeDraft(scope,base,base,{setItem(){throw Error('blocked')}}),false);
});
test('three-way merge preserves separate edits but exposes overlapping changes', () => {
 const result=mergeDraft({a:'1',b:'2',c:'3'},{a:'1.5',b:'2',c:'4'},{a:'2',b:'5',c:'4'});
 assert.deepEqual(result.draft,{a:'1.5',b:'5',c:'4'});assert.deepEqual(result.conflicts,{a:{local:'1.5',saved:'2'}});
});
test('Challenge confirmation rejects changed age, future quotes, invalid American odds and kickoff', () => {
 const now=Date.parse('2026-10-08T16:00:00Z'), quote={market:'spread',side:'away',line:3.5,odds:-110,source:'Named book test',quotedAt:'2026-10-08T15:59:00Z'}, kickoff='2026-10-09T00:15:00Z';
 assert.equal(validateChallengeQuote(quote,kickoff,now),null);
 assert.match(validateChallengeQuote({...quote,odds:0},kickoff,now),/American odds/);
 assert.match(validateChallengeQuote({...quote,quotedAt:'2026-10-08T17:00:00Z'},kickoff,now),/last six hours/);
 assert.match(validateChallengeQuote(quote,kickoff,now+7*3600_000),/last six hours/);
 assert.match(validateChallengeQuote(quote,kickoff,Date.parse(kickoff)),/closed/);
});
test('comparison excludes hidden players, preserves missing and requires one complete reference', () => {
 const data={revealed:true,mode:'guess_spread',playerId:'a',league:{roster:[{id:'a'},{id:'b'},{id:'c'}]},standings:[{id:'a',submitted:true},{id:'b',submitted:true},{id:'c',submitted:false}],games:[{id:'1',awayCode:'A',homeCode:'B',prediction:-2,market:-3,opponents:[{id:'b',value:-3},{id:'c',value:-3}]},{id:'2',prediction:null,market:1,opponents:[{id:'b',value:2}]}]};
 const ref={status:'provisional',source:'Same snapshot',capturedAt:'2026-10-08T16:00:00Z'};const output=buildPlayerComparison(data,ref);
 assert.equal(output.players[0].sample,1);assert.equal(output.players[0].mean,1);assert.equal(output.players[2].sample,0);assert.equal(output.players[2].mean,null);assert.deepEqual(output.players[1].bins,[1,1,0,0]);
 assert.equal(buildPlayerComparison({...data,revealed:false},ref),null);assert.equal(buildPlayerComparison({...data,games:[{...data.games[0],market:null}]},ref),null);
});
test('notification policy defaults every channel off and observes explicit timezone quiet hours', () => {
 assert.deepEqual(Object.values(normalizePreferences().channels),[false,false,false,false]);
 const preferences={timezone:'America/Los_Angeles',quietHours:{enabled:true,start:'22:00',end:'07:00'}};
 assert.equal(quietAt(preferences,Date.parse('2026-10-09T06:00:00Z')),true);assert.equal(quietAt(preferences,Date.parse('2026-10-09T15:00:00Z')),false);
 assert.equal(normalizePreferences({timezone:'invalid',channels:{push:'yes'}}).channels.push,false);
});
test('reminders use two hours and actual kickoff only, expire and invalidate after reschedule', () => {
 const input={season:2026,week:5,leagueId:'group',scheduledKickoff:'2026-10-09T00:15:00Z'}, event=planReminder({...input,kind:'incomplete_two_hours'});
 assert.equal(event.dueAt,'2026-10-08T22:15:00.000Z');assert.equal(planReminder({...input,kind:'commissioner_kickoff'}),null);
 const recipient={id:'player',active:true,scheduledKickoff:event.scheduledKickoff}, preferences={channels:{push:true},events:{incomplete_two_hours:true}}, now=Date.parse(event.dueAt);
 assert.equal(deliveryDecision({event,recipient,preferences,channel:'push',now}).allowed,true);
 assert.equal(deliveryDecision({event,recipient:{...recipient,scheduledKickoff:'later'},preferences,channel:'push',now}).reason,'schedule_changed');
 assert.equal(deliveryDecision({event,recipient,preferences,channel:'push',now:Date.parse(event.expiresAt)}).reason,'expired');
});
test('movement needs explicit verified baseline and crossing; delivery checks consent, reveal, revocation and duplicates', () => {
 const baseline={id:'base',gameId:'a',market:'spread',verified:true,value:-3,observedAt:'2026-10-08T16:00:00Z'}, observation={...baseline,id:'new',value:0,observedAt:'2026-10-08T17:00:00Z'};
 const events=movementEvents({baseline,observation,scope:'week5'});assert.deepEqual(events.map(event=>event.threshold),[1.5,3]);assert.deepEqual(movementEvents({baseline:{...baseline,verified:false},observation,scope:'week5'}),[]);
 const input={event:events[0],recipient:{id:'p',active:true,revealedMarkets:{spread:true}},preferences:{channels:{push:true},events:{movement:true}},channel:'push',now:Date.parse(observation.observedAt)};
 const result=deliveryDecision(input);assert.equal(result.allowed,true);assert.equal(result.preview.text.includes('-3'),false);
 assert.equal(deliveryDecision({...input,deliveredKeys:[result.deliveryKey]}).reason,'duplicate');assert.equal(deliveryDecision({...input,recipient:{...input.recipient,active:false}}).reason,'access_revoked');assert.equal(deliveryDecision({...input,recipient:{...input.recipient,revealedMarkets:{}}}).reason,'market_hidden');assert.equal(deliveryDecision({...input,preferences:{}}).reason,'not_opted_in');
});
test('D16 distributions use individual saved references and never current consensus or missing zeros',()=>{
 const data={revealed:true,scoringPolicy:'submission-time',mode:'guess_spread',playerId:'a',league:{roster:[{id:'a'},{id:'b'}]},standings:[{id:'a',submitted:true},{id:'b',submitted:true}],games:[{id:'1',awayCode:'A',homeCode:'B',prediction:-2,market:99,currentConsensus:{value:99},scoringReference:{status:'captured',value:-3,savedAt:'2026-10-08T15:00:00Z'},opponents:[{id:'b',value:-3,scoringReference:{status:'available',value:-5,savedAt:'2026-10-08T15:01:00Z'}}]},{id:'2',prediction:1,scoringReference:{status:'unavailable'},opponents:[{id:'b',value:4,scoringReference:{status:'captured',value:4}}]}]};
 const output=buildPlayerComparison(data);assert.equal(output.basis,'individual');assert.equal(output.capturedAt,null);assert.equal(output.players[0].sample,1);assert.equal(output.players[0].mean,1);assert.equal(output.players[1].sample,2);assert.equal(output.players[1].mean,1);assert.equal(output.players[0].games[1].error,null);assert.equal(output.players[1].games[0].reference,-5);
});
