import test from 'node:test';
import assert from 'node:assert/strict';
import {cashToUnits,ownUnitHint,parsePlayerProp,playerPropLeg,trackedLeg,unitText} from '../web/src/trackedBetTerms.js';
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
