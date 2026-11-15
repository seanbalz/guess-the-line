import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as research from '../shared/parlay-research.mjs';

const now = Date.parse('2026-11-15T17:40:00Z');
const ranked = (...args) => research.buildWeeklyProps(...args);
const prop = (id, patch = {}) => ({
  id, routeId:id, gameId:'BUF-NYJ', kickoff:'2026-11-15T20:00:00Z', color:'yellow',
  selection:{market:'prop',playerId:id,playerName:id,key:'player_rush_yds',unit:'yards',side:'over',line:30.5},
  quote:{book:'book-a',source:'Book A',odds:-110,observedAt:'2026-11-15T17:35:00Z',expiresAt:'2026-11-15T18:35:00Z'},
  evidence:[{eligible:true,stance:'support',sourceUrl:'https://example.test/stats',datasetId:'history',sample:{count:8},statement:'Historical sample.'}], ...patch
});

test('weekly board returns twenty distinct player/stat picks rather than a handful of combinations',()=>{
  const rows=Array.from({length:25},(_,i)=>prop(`p${String(i).padStart(2,'0')}`));
  const before=structuredClone(rows), result=ranked(rows,{now});
  assert.equal(result.length,20); assert.equal(result[0].id,'p00'); assert.equal(result[19].id,'p19');
  assert.deepEqual(rows,before);
});
test('alternate lines and duplicate books cannot fill the weekly board',()=>{
  const a=prop('a'), alternate=prop('alternate'); alternate.selection={...a.selection,line:31.5};
  const otherBook=structuredClone(a); otherBook.id='duplicate';otherBook.quote.book='book-b';
  assert.equal(ranked([a,alternate,otherBook,prop('b')],{now}).length,2);
});
test('ranking uses sourced dataset diversity, sample coverage and recency without a model edge',()=>{
  const a=prop('a'), b=prop('b'), c=prop('c');
  b.evidence[0].sample.count=5;
  c.evidence.push({...c.evidence[0],datasetId:'charting',sample:{count:3}});
  assert.deepEqual(ranked([b,a,c],{now}).map(a=>a.id),['c','a','b']);
  const duplicate=structuredClone(b);duplicate.id='d';duplicate.evidence.push({...duplicate.evidence[0]});
  assert.deepEqual(ranked([duplicate,a],{now}).map(a=>a.id),['a','d']);
});
test('weekly board refuses stale, post-kickoff, conflicted, unsourced and unpriced props',()=>{
  const bad=[prop('expired',{quote:{...prop('a').quote,expiresAt:new Date(now).toISOString()}}),
    prop('old',{quote:{...prop('a').quote,observedAt:new Date(now-3600001).toISOString(),expiresAt:new Date(now+1000).toISOString()}}),
    prop('closed',{kickoff:new Date(now).toISOString()}),prop('conflict',{hasConflicts:true}),
    prop('missing',{quote:null}),prop('no-id',{selection:{...prop('a').selection,playerId:null}}),
    prop('invalid-price',{quote:{...prop('a').quote,odds:0}}),
    prop('unsourced',{evidence:[{eligible:true,stance:'support'}]})];
  assert.deepEqual(ranked([...bad,prop('good')],{now}).map(a=>a.id),['good']);
  assert.deepEqual(ranked([prop('good')],{now:NaN}),[]);
});
test('a fresh alternative book is used when the primary quote has expired',()=>{
  const a=prop('a'); a.offers=[{...a.quote,book:'book-b',source:'Book B',odds:105}];a.quote.expiresAt=new Date(now).toISOString();
  const result=ranked([a],{now});assert.equal(result[0]?.quote.book,'book-b');
});
