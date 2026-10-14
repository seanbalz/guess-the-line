// Redesign stage 15 (D-37, D-39): the old app's reading of the live rules for sent picks (web/src/sentFinal.js).
// Today (`sentFinal: false`, or no rules at all) nothing is final; once M-02 reports `sentFinal: true`, each pick in a
// submitted ballot is locked in and final, game by game, the same reading as M-01's gtl_guess_locked_in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BALLOT_LOCKED, FINAL_LABEL, FINAL_RULE, FINAL_SHORT, LOCKED_MESSAGE, ballotFinal, isBallotLocked, lockedIn, pickFinal, sentFinal } from '../web/src/sentFinal.js';
import { SENT_FINAL_MESSAGE, ballotLockedIn } from '../server/engine.mjs';
import { BALLOT_LOCKED as SERVER_CODE, BALLOT_LOCKED_MESSAGE } from '../cloud/weekly.mjs';
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

test('a pick in a submitted ballot is locked in (every ballot the old app sends, and every one sent before M-02)', () => {
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

// Redesign stage 18 (M-02): a pick is also locked in when the ballot's server-written lockedAt names its game (the new app's
// per-game lock-in, D-39), with no submission; the old app, the engine mirror and gtl_ballot_locked_in read it the same way.
test('per-game lock-in: a draft pick that lockedAt names is locked in; its other picks stay drafts', () => {
  const locked = { submittedAt: null, picks: { 'TB-DAL': -3.5, 'PHI-JAX': 0 }, lockedAt: { 'TB-DAL': '2026-10-15T18:00:00.000Z' } };
  assert.deepEqual(games.map(id => lockedIn(locked, id)), [true, false, false]);
  assert.deepEqual(games.map(id => pickFinal(M02, locked, id)), [true, false, false], 'final once the live rules say so; the others change freely');
  assert.deepEqual(games.map(id => pickFinal(TODAYS_RULES, locked, id)), [false, false, false]);
  assert.equal(ballotFinal(M02, locked, games), false);
  assert.equal(ballotFinal(M02, { ...locked, picks: { ...locked.picks, 'CIN-MIA': 2 }, lockedAt: Object.fromEntries(games.map(id => [id, 'x'])) }, games), true, 'every game locked in');
  for (const [label, ballot] of [['a lockedAt time that is not a string', { ...locked, lockedAt: { 'TB-DAL': true } }], ['lockedAt for a game with no pick', { ...locked, picks: {} }],
    ['lockedAt that is not an object', { ...locked, lockedAt: 'TB-DAL' }]]) assert.equal(lockedIn(ballot, 'TB-DAL'), false, label);
  // One reading in the client and the engine mirror (and gtl_ballot_locked_in in SQL, tests/guess-write-rules-sql.test.mjs).
  for (const ballot of [locked, submitted, draft, { ...locked, lockedAt: { 'TB-DAL': 1 } }, null]) for (const id of [...games, 'NYJ-DEN']) assert.equal(ballotLockedIn(ballot, id), lockedIn(ballot, id), `${id} ${JSON.stringify(ballot)}`);
});

test('the refusal of a change to a locked-in pick: its code and the server\'s sentence', () => {
  assert.deepEqual([BALLOT_LOCKED, LOCKED_MESSAGE], ['GTL_BALLOT_LOCKED', 'Sent picks are final.']);
  assert.deepEqual([SERVER_CODE, BALLOT_LOCKED_MESSAGE, SENT_FINAL_MESSAGE], [BALLOT_LOCKED, LOCKED_MESSAGE, LOCKED_MESSAGE], 'gtl-api, the engine mirror and the old app say the same');
  assert.equal(isBallotLocked({ code: 'GTL_BALLOT_LOCKED', status: 409 }), true);
  for (const error of [null, undefined, {}, { status: 409 }, { code: 'GTL_SUBMISSION_QUOTES_REQUIRED' }, { message: 'Sent picks are final.' }]) assert.equal(isBallotLocked(error), false, JSON.stringify(error));
});
