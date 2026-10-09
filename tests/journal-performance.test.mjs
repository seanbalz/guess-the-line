import test from 'node:test';
import assert from 'node:assert/strict';
import { decimalToMinor, minorToDecimal, summarizeJournal, validateJournalMoney } from '../shared/journal-performance.mjs';
test('journal accounting parses exact decimal amounts including zero returned and rejects hidden rounding', () => {
  assert.equal(decimalToMinor('10.10'),1010);assert.equal(decimalToMinor('0'),0);assert.equal(decimalToMinor('19.28'),1928);assert.equal(decimalToMinor(''),null);
  assert.equal(minorToDecimal(-150),'-1.50');assert.equal(minorToDecimal(1010),'10.10');
  for(const value of ['1.001','1e4','-2','NaN','Infinity','1,000'])assert.throws(()=>decimalToMinor(value));
  assert.throws(()=>validateJournalMoney({kind:'research_note',stakeMinor:100,currency:'USD'}));
  assert.throws(()=>validateJournalMoney({kind:'user_reported_placed_bet',stakeMinor:0,currency:'USD'}));
  assert.throws(()=>validateJournalMoney({kind:'user_reported_placed_bet',stakeMinor:100,currency:'USD',outcome:'pending',returnedMinor:0}));
});
test('performance groups currencies, explains samples, excludes voids, pending, research and archived records',()=>{
  const bet=(outcome,stakeMinor,returnedMinor,currency='USD',extra={})=>({kind:'user_reported_placed_bet',outcome,stakeMinor,returnedMinor,currency,...extra});
  const stats=summarizeJournal([bet('win',1010,1928),bet('loss',1000,0),bet('push',1000,1000),bet('void',2000,2000),bet('pending',500,null),bet('win',1000,null),bet('win',100,250,'EUR'),bet('loss',1000,0,'USD',{archived:true}),bet('loss',1000,0,'USD',{kind:'research_note'})]);
  assert.equal(stats.recordCount,7);assert.equal(stats.decidedCount,4);assert.equal(stats.winRatePercent,75);assert.deepEqual(stats.outcomes,{pending:1,win:3,loss:1,push:1,void:1});
  const usd=stats.currencies.find(x=>x.currency==='USD');assert.equal(usd.sampleCount,3);assert.equal(usd.stakeMinor,3010);assert.equal(usd.netMinor,-82);assert.equal(usd.pendingStakeMinor,500);assert.equal(usd.excludedCount,3);assert.equal(usd.roiPercent,100*(-82)/3010);
  assert.equal(stats.currencies.find(x=>x.currency==='EUR').netMinor,150);
  assert.equal(summarizeJournal([bet('pending',100,null)]).winRatePercent,null);
  assert.equal(summarizeJournal([bet('pending',100,null)]).currencies[0].roiPercent,null);
});
