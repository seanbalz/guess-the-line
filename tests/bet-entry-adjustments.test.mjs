import test from 'node:test';
import assert from 'node:assert/strict';
import {adjustTicketOdds,adjustTicketUnits} from '../web/src/betEntryAdjustments.js';

test('ticket unit taps change 0.1U exactly without widening the existing editor limits',()=>{
  assert.equal(adjustTicketUnits(0.5,1),0.6);
  assert.equal(adjustTicketUnits(0.5,-1),0.4);
  assert.equal(adjustTicketUnits('0.01',1),0.11);
  assert.equal(adjustTicketUnits('0.0747',1),0.1747);
  assert.equal(adjustTicketUnits(10000,1),null);
  assert.equal(adjustTicketUnits(0.0001,-1),null);
  for(const value of ['',null,NaN,-1,0,10001,0.00001]) assert.equal(adjustTicketUnits(value,1),null);
});
test('manual odds taps cross even money without inventing invalid American prices',()=>{
  assert.equal(adjustTicketOdds(-105,1),100);
  assert.equal(adjustTicketOdds(100,-1),-105);
  assert.equal(adjustTicketOdds(-110,1),-105);
  assert.equal(adjustTicketOdds(150,-1),145);
  assert.equal(adjustTicketOdds(1000000,1),null);
  for(const value of ['',null,NaN,99,-99,Infinity]) assert.equal(adjustTicketOdds(value,1),null);
});
