// Redesign stage 15 (D-37, D-39): the old app's reading of the live rules for sent picks (web/src/sentFinal.js).
// Today (`sentFinal: false`, or no rules at all) nothing is final; once M-02 reports `sentFinal: true`, each pick in a
// submitted ballot is locked in and final, game by game, the same reading as M-01's gtl_guess_locked_in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FINAL_LABEL, FINAL_RULE, FINAL_SHORT, ballotFinal, lockedIn, pickFinal, sentFinal } from '../web/src/sentFinal.js';
import { TODAYS_RULES, parseLiveRules } from '../cloud/live-rules.mjs';

const M02 = { sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' };
const M01 = { sentFinal: false, lateWindow: 'deadline', revealAt: 'kickoff' };
const games = ['TB-DAL', 'PHI-JAX', 'CIN-MIA'];
const submitted = { submittedAt: '2026-10-14T20:00:00.000Z', picks: { 'TB-DAL': -3.5, 'PHI-JAX': 0, 'CIN-MIA': 2 } };
const draft = { picks: { 'TB-DAL': -3.5, 'PHI-JAX': 0, 'CIN-MIA': 2 } };

test('only a live sentFinal of exactly true makes a pick final; every other answer reads as today', () => {
  assert.equal(sentFinal(M02), true);
  assert.equal(sentFinal(parseLiveRules(M02)), true, 'what /community/read, /personal and /state carry once M-02 is applied');
  for (const rules of [undefined, null, {}, TODAYS_RULES, M01, { sentFinal: 'true' }, { sentFinal: 1 }, [], 'sentFinal']) assert.equal(sentFinal(rules), false, JSON.stringify(rules));
});

test('a pick is locked in only as a number in a submitted ballot (gtl_guess_locked_in today)', () => {
  for (const id of games) assert.equal(lockedIn(submitted, id), true, id);
  assert.equal(lockedIn(submitted, 'NYJ-DEN'), false, 'a game the ballot has no pick for');
  assert.equal(lockedIn(draft, 'TB-DAL'), false, 'a draft is never locked in');
  assert.equal(lockedIn({ ...submitted, submittedAt: '' }, 'TB-DAL'), false);
  assert.equal(lockedIn({ ...submitted, picks: { 'TB-DAL': '-3.5' } }, 'TB-DAL'), false, 'the server stores numbers; anything else is not a pick');
  assert.equal(lockedIn({ ...submitted, picks: { 'TB-DAL': null } }, 'TB-DAL'), false);
  assert.equal(lockedIn(null, 'TB-DAL'), false);
  assert.equal(lockedIn(undefined, 'TB-DAL'), false);
});

test('per game (D-39): a pick is final only when it is locked in and the live rules say so', () => {
  for (const id of games) {
    assert.equal(pickFinal(M02, submitted, id), true);
    assert.equal(pickFinal(TODAYS_RULES, submitted, id), false, 'today a submitted pick can still change until the deadline (D-16)');
    assert.equal(pickFinal(M01, submitted, id), false);
    assert.equal(pickFinal(M02, draft, id), false, 'drafts change freely until submitted');
  }
  const partial = { ...submitted, picks: { 'TB-DAL': -3.5, 'PHI-JAX': 0 } };
  assert.deepEqual(games.map(id => pickFinal(M02, partial, id)), [true, true, false], 'a game with no pick stays open');
});

test('a ballot is final only when every game of the slate is', () => {
  assert.equal(ballotFinal(M02, submitted, games), true);
  assert.equal(ballotFinal(TODAYS_RULES, submitted, games), false);
  assert.equal(ballotFinal(undefined, submitted, games), false);
  assert.equal(ballotFinal(M02, draft, games), false);
  assert.equal(ballotFinal(M02, submitted, [...games, 'NYJ-DEN']), false, 'a slate game without a pick leaves something to save');
  assert.equal(ballotFinal(M02, submitted, []), false, 'an empty slate is never final');
  assert.equal(ballotFinal(M02, submitted, undefined), false);
});

test('the words the old app shows while sent picks are final', () => {
  assert.equal(FINAL_LABEL, 'Submitted · final');
  assert.equal(FINAL_SHORT, 'Submitted picks are final.');
  assert.match(FINAL_RULE, /^Submitted picks are final: once you submit, you can't change them\.$/);
  for (const text of [FINAL_LABEL, FINAL_SHORT, FINAL_RULE]) assert.doesNotMatch(text, /lock|edit|until the deadline/i, 'D-39 "due, not lock"; no promise of edits');
});
