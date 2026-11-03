// D-69 Your score moments (web/src/next/play/scoreMoments.js) and how the moments engine plays them. Each test names
// the contract it guards. Fixture data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCOPES, sizeOf } from '../web/src/next/moments/catalog.js';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';
import { scoreMoments, scoreReport, scoreSource, weekFinal } from '../web/src/next/play/scoreMoments.js';

const ME = 'u-me';
const SEA_DEN = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-11-01T21:05:00Z' };
const LAC_LV = { id: 'LAC-LV', awayCode: 'LAC', homeCode: 'LV', kickoff: '2026-11-02T01:20:00Z' };
const NYG_PHI = { id: 'NYG-PHI', awayCode: 'NYG', homeCode: 'PHI', kickoff: '2026-11-03T01:15:00Z' };
const pick = (gameId, guess, points, line) => ({ gameId, guess, lockedIn: true, lockedAt: '2026-10-28T18:00:00Z', points, reference: { value: line } });
const mine = (picks, extra = {}) => ({ userId: ME, mode: 'guess_spread', status: 'submitted', eligible: true, scoreTiming: 'immediate', weekPoints: 15, picks, ...extra });
const reply = (entries, games = [SEA_DEN, LAC_LV]) => ({ viewer: ME, season: 2026, now: '2026-10-29T12:00:00Z', seasons: [2026], weeks: [{ season: 2026, week: 8, games, entries }] });
const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
const ids = list => list.map(m => m.id);
const words = list => JSON.stringify(list.map(({ id, title, meta }) => ({ id, title, meta })));

test('Bullseye: a scored 10 of 10 game of yours is one big moment for the score scope; a miss makes no moment at all', () => {
  const moments = scoreMoments(reply([mine([pick('SEA-DEN', -3, 10, -3)], { weekPoints: 10 })]), ME);
  assert.deepEqual(ids(moments), ['score:bullseye:2026:8:guess_spread:SEA-DEN'], 'stable ids: season, week, market and game');
  assert.equal(sizeOf(moments[0].kind), 'big');
  assert.deepEqual(moments[0].scopes, [SCOPES.score]);
  assert.deepEqual([moments[0].title, moments[0].meta], ['Bullseye', 'Week 8 · SEA at DEN · Spread']);
  assert.deepEqual(scoreMoments(reply([mine([pick('SEA-DEN', -3, 9, -3.5)], { weekPoints: 9 })]), ME), [], 'a 9 is quiet: nothing pops and nothing is kept');
});

test('Week final: every game of your week is scored or closed without a lock; a game still open or waiting for its line is not final', () => {
  const week = reply([]).weeks[0];
  const both = mine([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, 5, 6.5)]);
  assert.equal(weekFinal(week, both, NaN), true, 'every game scored: final, whatever the clock');
  const oneOpen = mine([pick('SEA-DEN', -3, 10, -3)]);
  assert.equal(weekFinal(week, oneOpen, Date.parse('2026-11-01T00:00:00Z')), false, 'LAC at LV can still be locked');
  assert.equal(weekFinal(week, oneOpen, Date.parse('2026-11-02T02:00:00Z')), true, 'LAC at LV kicked off without a lock: the week is settled');
  assert.equal(weekFinal(week, oneOpen, NaN), false, 'without the server clock an unlocked game never counts as closed');
  assert.equal(weekFinal(week, mine([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, null, null)]), NaN), false, 'a locked game waiting for its line');
  assert.equal(weekFinal(week, { ...both, status: 'sat_out' }, NaN), false, 'a sit-out never celebrates');
  assert.equal(weekFinal(week, { ...both, eligible: false }, NaN), false, 'an ineligible ballot never celebrates');
  const final = scoreMoments(reply([both]), ME).find(m => m.kind === 'weekFinal');
  assert.deepEqual([final.id, final.title, final.meta, sizeOf(final.kind)], ['score:weekFinal:2026:8:guess_spread', 'Week 8 final', 'Spread · 15 points', 'big']);
});

test('D-31: moments read only your own entries and name no line or guess; another player\'s Bullseye is not yours', () => {
  const other = { ...mine([pick('SEA-DEN', -7, 10, -7), pick('LAC-LV', 1, 10, 1)]), userId: 'u-friend' };
  assert.deepEqual(scoreMoments(reply([other]), ME), []);
  const said = words(scoreMoments(reply([mine([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, 5, 6.5)]), other]), ME));
  for (const leak of ['u-friend', '−3', '-3', '6.5', '−7', '-7']) assert.ok(!said.includes(leak), leak);
  assert.deepEqual(scoreMoments(null, ME), []);
  assert.deepEqual(scoreMoments(reply([mine([pick('SEA-DEN', -3, 10, -3)])]), ''), []);
});

test('fresh reads only (rule 1): a pending or failed read reports nothing; a fresh answer reports its own season as the source', () => {
  const data = reply([mine([pick('SEA-DEN', -3, 10, -3)])]);
  assert.equal(scoreReport({ loading: true, data: null, error: null }), null);
  assert.equal(scoreReport({ loading: false, data: null, error: { status: 500 } }), null);
  assert.equal(scoreReport({ loading: false, data, error: { status: 500 } }), null, 'a kept copy beside a failure confirms nothing');
  assert.deepEqual(scoreReport({ loading: false, data, error: null }), { source: 'score:2026', candidates: scoreMoments(data, ME) });
  assert.equal(scoreSource({ season: null }), 'score:latest');
});

function rig() {
  const big = [];
  const engine = createMomentsEngine({ account: ME, storage: memory(), isSettled: () => true, hasNavigated: () => true, onBig: ms => big.push(ids(ms)),
    onSmall: () => assert.fail('score moments are never small'), setTimer: fn => fn(), now: () => 0 });
  const report = data => { const out = scoreReport({ loading: false, error: null, data }); engine.report(out.candidates, { source: out.source }); };
  return { engine, big, report };
}

test('engine: the first read seeds; a new Bullseye waits as NEW for the Play tile, plays once when Your score opens, and never replays', () => {
  const { engine, big, report } = rig();
  report(reply([mine([pick('SEA-DEN', -3, 10, -3)], { weekPoints: 10 })]));
  assert.deepEqual(big, [], 'this device\'s first read shows results as they are');
  assert.equal(engine.newCount(SCOPES.score), 0);
  report(reply([mine([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 6.5, 10, 6.5)], { weekPoints: 20 })]));
  assert.equal(engine.newCount(SCOPES.score), 2, 'the new Bullseye and the final week wait: the Play tile shows NEW');
  const close = engine.open(SCOPES.score);
  assert.deepEqual(big, [['score:bullseye:2026:8:guess_spread:LAC-LV', 'score:weekFinal:2026:8:guess_spread']], 'one card for both big moments');
  assert.equal(engine.newCount(SCOPES.score), 0);
  report(reply([mine([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 6.5, 10, 6.5)], { weekPoints: 20 })]));
  close();
  engine.open(SCOPES.score);
  assert.equal(big.length, 1, 'a moment in the seen record never plays again');
});

test('engine: a miss stays quiet, and a Bullseye that arrives while Your score is open plays in place', () => {
  const { engine, big, report } = rig();
  const games = [SEA_DEN, LAC_LV, NYG_PHI];
  report(reply([mine([pick('SEA-DEN', -3, 9, -3.5)], { weekPoints: 9 })], games));
  engine.open(SCOPES.score);
  report(reply([mine([pick('SEA-DEN', -3, 9, -3.5), pick('LAC-LV', 4, 5, 6.5)], { weekPoints: 14 })], games));
  assert.deepEqual(big, [], 'a scored miss plays nothing, and NYG at PHI is still open');
  report(reply([mine([pick('SEA-DEN', -3, 9, -3.5), pick('LAC-LV', 4, 5, 6.5), pick('NYG-PHI', -7, 10, -7)], { weekPoints: 24 })], games));
  assert.deepEqual(big, [['score:bullseye:2026:8:guess_spread:NYG-PHI', 'score:weekFinal:2026:8:guess_spread']], 'it plays where you are, as one card');
});
