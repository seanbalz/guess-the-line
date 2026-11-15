import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParlayIdeas, parlayLegStatus, propCategory } from '../shared/parlay-research.mjs';
const now = Date.parse('2026-11-15T18:00:00Z');
const leg = (id, gameId = id, book = 'fanduel') => ({ id, gameId, color: 'yellow', kickoff: '2026-11-15T20:00:00Z', selection: { market: 'prop', playerId: id, key: 'player_pass_yds', line: 200, side: 'over' }, quote: { book, source: book, odds: -110, observedAt: '2026-11-15T17:50:00Z', expiresAt: '2026-11-15T18:50:00Z' }, evidence: [{ eligible: true, stance: 'support', sourceUrl: 'https://example.com', datasetId: 'same' }] });
test('composes 2/3 legs without probabilities or calculated payout and flags shared sources', () => {
  const rows = [leg('a'), leg('b'), leg('c')], before = JSON.stringify(rows);
  assert.equal(buildParlayIdeas(rows, { now }).length, 3);
  const [idea] = buildParlayIdeas(rows, { now, size: 3 });
  assert.equal(idea.legs.length, 3); assert.equal(idea.combinedOdds, null); assert.equal(idea.probability, null); assert.equal(idea.sharedEvidence, true);
  assert.equal(JSON.stringify(rows), before);
});
test('does not compose different books, same games, same players or duplicates', () => {
  assert.equal(buildParlayIdeas([leg('a'), leg('b', 'b', 'draftkings')], { now }).length, 0);
  assert.equal(buildParlayIdeas([leg('a','game'),leg('b','game')], { now }).length, 0);
  const a = leg('a'), b = leg('b'); b.selection.playerId = 'a';
  assert.equal(buildParlayIdeas([a,b], { now }).length, 0);
  assert.equal(buildParlayIdeas([a, {...a}], { now }).length, 0);
});
test('fails closed for stale, missing, future quotes, kickoff, unsupported and conflicting evidence', () => {
  for (const mutate of [a => a.quote = null, a => a.quote.expiresAt = new Date(now).toISOString(), a => a.quote.observedAt = new Date(now + 1).toISOString(), a => a.kickoff = new Date(now).toISOString(), a => a.color = 'gray', a => a.evidence = [], a => a.evidence[0].sourceUrl = null, a => a.hasConflicts = true, a => a.evidence.push({eligible:true, stance:'oppose'})]) {
    const a = leg('a'); mutate(a); assert.ok(parlayLegStatus(a, now));
    assert.equal(buildParlayIdeas([a,leg('b')], { now }).length, 0);
  }
  assert.deepEqual(buildParlayIdeas([leg('a'),leg('b')], {}), []);
});
test('empty/reveal-gated input stays empty, limits bounded, and categories map', () => {
  assert.deepEqual(buildParlayIdeas([], {now}), []);
  assert.deepEqual(buildParlayIdeas([leg('a'),leg('b')], {now,size:5}), []);
  assert.equal(buildParlayIdeas([leg('a'),leg('b'),leg('c')], {now,limit:1}).length, 1);
  assert.equal(propCategory(leg('a')), 'Passing');
});
test('common-book alternative preserved when individual best books differ; rationale and risk visible',()=>{
 const a=leg('a','a','fanduel'),b=leg('b','b','draftkings');
 a.offers=[a.quote,{...a.quote,book:'betmgm'}];b.offers=[b.quote,{...b.quote,book:'betmgm'}];
 a.evidence[0].statement='Recorded appearances support this side';
 const [idea]=buildParlayIdeas([a,b],{now});
 assert.equal(idea.book,'betmgm'); assert.equal(idea.why.length,1); assert.ok(idea.risks.length);
 assert.match(idea.rankingLabel,/not win probability/);
});
test('ranking cannot starve a compatible game beyond the former 90-offer cutoff', () => {
  const rows = Array.from({length:91}, (_,i) => leg(`p${String(i).padStart(3,'0')}`, i<90?'SEA-DEN':'DAL-PHI'));
  const ideas = buildParlayIdeas(rows,{now});
  assert.equal(ideas.length,6);
  assert.ok(ideas.every(idea=>new Set(idea.legs.map(a=>a.gameId)).size===2));
  assert.equal(buildParlayIdeas(rows,{now,size:3}).length,0);
  rows.push(leg('z-third','NYG-WAS'));
  assert.equal(buildParlayIdeas(rows,{now,size:3}).length,6);
});
