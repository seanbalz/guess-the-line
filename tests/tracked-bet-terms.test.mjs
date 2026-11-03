import test from 'node:test';
import assert from 'node:assert/strict';
import {cashToUnits,ownUnitHint,parsePlayerProp,playerPropLeg,trackedLeg,unitText,trackedOverview,trackedBetDate} from '../web/src/trackedBetTerms.js';
const prop=selection=>({market:'prop',side:'over',line:70,selection});
test('cash conversion retains cent amounts and the four-decimal unit precision',()=>{
 assert.equal(cashToUnits(7.47,100),.0747);assert.equal(cashToUnits(25,100),.25);
 for(const [cash,unit] of [[0,100],[7.471,100],[7.47,0],[7.47,1000],['',100],[10,'']])assert.equal(cashToUnits(cash,unit),null);
 assert.equal(unitText(.0747),'0.0747U');
});
test('unit hints use only explicit, consistent, unlocked owner notes',()=>{
 const own={ownerId:'a',notes:'Stake 0.25U at $100/U.'};
 assert.equal(ownUnitHint([own,{ownerId:'b',notes:'1U=$500.'}],'a'),100);
 assert.equal(ownUnitHint([{...own,noteHidden:true}],'a'),null);
 assert.equal(ownUnitHint([own,{...own,notes:'1U=$50.'}],'a'),null);
 assert.equal(ownUnitHint([{...own,notes:'Cash stake $100'}],'a'),null);
 assert.equal(ownUnitHint([{...own,notes:'Cash tracking: $25.00 risked; 1U=$1,000.00.'}],'a'),1000);
 assert.equal(ownUnitHint([{...own,notes:'1U=$100.001'}],'a'),null);
 assert.equal(ownUnitHint([{...own,notes:'at $100/U; 1U=$50.'}],'a'),null);
});
test('milestone, over and touchdown props retain their exact meanings',()=>{
 assert.deepEqual(parsePlayerProp(prop('Sample Runner 70+ rushing yards')),{player:'Sample Runner',stat:'rushing yards',direction:'at least',line:'70'});
 assert.equal(parsePlayerProp(prop('Sample Runner over 49.5 rushing yards')).direction,'over');
 assert.equal(parsePlayerProp(prop('Sample Runner anytime touchdown (1+)')).stat,'anytime touchdown');
 assert.equal(trackedLeg(prop('Sample Runner 70+ rushing yards')).pick,'70+');
 assert.equal(trackedLeg({...prop('Secret over 49.5 rushing yards'),locked:true}).pick,'Locked');
 assert.equal(parsePlayerProp(prop('Unfamiliar exact custom text')),null);
});
test('guided fields serialize only exact existing prop terms without inventing a threshold',()=>{
 const base={player:'Sample Runner',stat:'rushing yards',direction:'over',line:'49.5'};
 assert.deepEqual(playerPropLeg('A-B',base),{gameId:'A-B',market:'prop',side:'Sample Runner',line:49.5,selection:'Sample Runner over 49.5 rushing yards'});
 assert.equal(playerPropLeg('A-B',{...base,line:''}).selection,'');
 assert.equal(playerPropLeg('A-B',{...base,line:'49.25'}).selection,'');
 assert.equal(playerPropLeg('A-B',{...base,direction:'at least',line:'70'}).selection,'Sample Runner 70+ rushing yards');
 assert.equal(playerPropLeg('A-B',{...base,stat:'anytime touchdown'}).line,null);
});

const tracked=(id,extra={})=>({id,ownerId:'a',origin:'tracked',kind:'single',season:2026,week:8,legs:[prop('Runner 70+ rushing yards')],stakeUnits:1,odds:100,source:'Book A',countsForRecord:true,outcome:'pending',recordedAt:'2026-11-02T08:30:00Z',...extra});
test('overview counts whole tickets and keeps owner, virtual, excluded and incomplete accounting separate',()=>{
 const entries=[tracked('win',{outcome:'win',actualReturnUnits:2.2}),tracked('loss',{kind:'parlay',legs:[prop('Runner 70+ rushing yards'),{market:'total'}],stakeUnits:.25,outcome:'loss',odds:null,source:'Book B'}),tracked('open',{stakeUnits:null}),tracked('excluded',{outcome:'win',countsForRecord:false}),tracked('foreign',{ownerId:'b',outcome:'win',stakeUnits:100}),tracked('virtual',{origin:'virtual',outcome:'win',stakeUnits:100})];
 const data={entries,chart:[{entryId:'foreign',ownerId:'b',netUnits:100},{entryId:'win',ownerId:'a',netUnits:1.2},{entryId:'loss',ownerId:'a',netUnits:-.25},{entryId:'excluded',ownerId:'a',netUnits:1}]},before=structuredClone(data);
 const model=trackedOverview(data,{actorId:'a'});
 assert.equal(model.summary.bets,3);assert.equal(model.summary.netUnits,.95);assert.equal(model.summary.roiPercent,76);assert.equal(model.summary.excludedCount,1);assert.equal(model.summary.roiSampleCount,2);
 assert.deepEqual(model.types,[{label:'Singles',count:2},{label:'Parlays',count:1}]);assert.equal(model.markets.find(row=>row.label==='Mixed markets').count,1);
 assert.equal(model.pendingStakeUnits,0);assert.equal(model.unknownPendingStakes,1);assert.deepEqual(model.chart.map(p=>p.cumulativeNetUnits),[1.2,.95]);
 assert.deepEqual(data,before);assert.equal(trackedOverview(data,{}).entries.length,0);
});
test('overview book/date filters rebase cumulative points without changing actual returns or metadata',()=>{
 const entries=[tracked('a',{outcome:'win'}),tracked('b',{outcome:'loss',source:{name:'Book B'},stakeUnits:.25,notes:'Preserve this',audit:[{kind:'create'}]}),tracked('c',{outcome:'win',source:'Book B',actualReturnUnits:1.5})];
 const model=trackedOverview({entries,chart:entries.map((e,i)=>({entryId:e.id,ownerId:'a',netUnits:[1,-.25,.5][i],cumulativeNetUnits:[1,.75,1.25][i]}))},{actorId:'a',source:'book:Book B',from:'2026-11-02',to:'2026-11-02'});
 assert.deepEqual(model.entries.map(e=>e.id),['b','c']);assert.deepEqual(model.chart.map(p=>p.cumulativeNetUnits),[-.25,.25]);assert.equal(model.summary.netUnits,.25);assert.equal(model.entries[0],entries[1]);assert.equal(model.entries[0].notes,'Preserve this');
 assert.deepEqual(model.books,['Book A','Book B']);
});
test('overview preserves unknown book identity and never plots excluded-only or incomplete wins',()=>{
 const entries=[tracked('unknown',{source:''}),tracked('named',{source:'Unknown book'}),tracked('incomplete',{outcome:'win',odds:null}),tracked('void',{outcome:'void'}),tracked('excluded',{countsForRecord:false,outcome:'win'})];
 const data={entries,chart:[]};const model=trackedOverview(data,{actorId:'a'});
 assert.equal(model.summary.netUnits,null);assert.equal(model.summary.roiPercent,null);assert.equal(model.chart.length,0);
 assert.deepEqual(trackedOverview(data,{actorId:'a',source:'book:'}).entries.map(e=>e.id),['unknown']);assert.deepEqual(trackedOverview(data,{actorId:'a',source:'book:Unknown book'}).entries.map(e=>e.id),['named']);
 assert.equal(model.sources.filter(row=>row.label==='Unknown book').length,2);
});
test('overview dates use Pacific placement and recording fallback, with honest empty and invalid ranges',()=>{
 assert.equal(trackedBetDate({placedAt:'2026-11-02T07:30:00Z',recordedAt:'2026-11-04T12:00:00Z'}),'2026-11-01');
 assert.equal(trackedBetDate({recordedAt:'2026-11-02T08:30:00Z'}),'2026-11-02');assert.equal(trackedBetDate({}),null);
 const data={entries:[tracked('a')],chart:[]};
 for(const range of [{from:'2026-11-03',to:'2026-11-02'},{from:'2026-02-30'},{to:'not-a-date'}]){const m=trackedOverview(data,{actorId:'a',...range});assert(m.rangeError);assert.equal(m.entries.length,0);}
 const empty=trackedOverview(data,{actorId:'a',from:'2026-11-03'});assert.equal(empty.rangeError,null);assert.equal(empty.summary.netUnits,null);assert.equal(empty.summary.bets,0);
});
