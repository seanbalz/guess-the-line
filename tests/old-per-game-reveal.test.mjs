// Redesign build plan stage 17 (D-39 per-game lock-in, D-31 kickoff, D-36, DP-1, DP-2): the old Community screens' reading of the
// board, a feed post's per-game picks and the picks-due card (web/src/communityBoard.js), and the shared wording for "—" and the
// Late marker (web/src/communityFormat.js). Pure; fixture names and values only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boardRows, byPoints, dueState, postPicksView } from '../web/src/communityBoard.js';
import { lateText, show } from '../web/src/communityFormat.js';
import { fmtLate } from '../web/src/next/format.js';

const A = 'a-member', B = 'b-member', C = 'c-member', D = 'd-member';
const names = { [A]: 'Avery Fixture', [B]: 'Blair Fixture', [C]: 'Casey Fixture', [D]: 'Drew Fixture' };
const name = id => names[id];

test('the board ranks Spread and Total apart, never by their sum; no ballot goes last (DP-2, D-36, DP-1)', () => {
  const standing = (userId, mode, seasonPoints, weekPoints = 0) => ({ userId, mode, seasonPoints, weekPoints, satOut: false });
  // Avery leads Spread, Blair leads Total; Blair has the larger Spread + Total sum, which the old board sorted by.
  const feed = { members: [A, B, C, D].map(id => ({ id, displayName: name(id) })), standings: [
    standing(A, 'guess_spread', 40), standing(A, 'guess_total', 5),
    standing(B, 'guess_spread', 30), standing(B, 'guess_total', 25),
    standing(C, 'guess_spread', null), // M-01: no submitted ballot this season (a sit-out) is null
    standing(D, 'guess_total', 0),
  ] };
  assert.deepEqual(boardRows(feed, 'guess_spread', name).map(r => r.id), [A, B, C, D], 'Spread by Spread points; null and no row last, by name');
  assert.deepEqual(boardRows(feed, 'guess_total', name).map(r => r.id), [B, A, D, C], 'Total by Total points; 0 is a number, ahead of no ballot');
  assert.deepEqual(boardRows(feed, 'guess_spread', name).map(r => (r.standing ? r.standing.seasonPoints : 'none')), [40, 30, null, 'none']);
  assert.deepEqual([byPoints(1, null), byPoints(null, 1), byPoints(null, undefined), byPoints(2, 3)], [-1, 1, 0, 1]);
  assert.deepEqual(boardRows({}, 'guess_spread'), [], 'no members, no rows');
});

test('"—" for a missing number, never "0.0" (DP-1); numbers read as before', () => {
  for (const missing of [null, undefined, Number.NaN, Infinity, '3', {}]) assert.equal(show(missing), '—', String(missing));
  assert.deepEqual([show(0), show(9), show(7.5), show(-3), show(12.25)], ['0', '9', '7.5', '-3', '12.3']);
});

test('a feed post opens game by game: shown games, a count of withheld ones, and the old whole-post shape', () => {
  const post = extra => ({ kind: 'ballot_submitted', week: 6, mode: 'guess_spread', ...extra });
  assert.deepEqual(postPicksView(post({ picksHidden: true, picks: { 'SEA-DEN': -3.5 }, hiddenGames: ['HOU-JAX', 'KC-LV'] })),
    { shown: [['SEA-DEN', -3.5]], hidden: 2, allHidden: false, perGame: true });
  assert.deepEqual(postPicksView(post({ picksHidden: true, picks: null, hiddenGames: ['HOU-JAX', 'SEA-DEN'] })), { shown: [], hidden: 2, allHidden: true, perGame: true });
  assert.deepEqual(postPicksView(post({ picksHidden: true, picks: null, hiddenGames: null })), { shown: [], hidden: 0, allHidden: true, perGame: false }, 'before M-01: the whole post');
  assert.deepEqual(postPicksView(post({ picksHidden: false, picks: { 'SEA-DEN': 0 }, hiddenGames: [] })), { shown: [['SEA-DEN', 0]], hidden: 0, allHidden: false, perGame: true });
  assert.deepEqual(postPicksView(post({ picksHidden: false, picks: { 'SEA-DEN': null, 'HOU-JAX': '2' } })).shown, [], 'only numbers show');
  assert.equal(postPicksView({ kind: 'joined' }), null);
});

test('the picks-due card knows four states; any other reads as closed, and none or done shows no card', () => {
  assert.deepEqual(['not_open', 'due', 'urgent', 'closed'].map(state => dueState({ state })), ['not_open', 'due', 'urgent', 'closed']);
  assert.deepEqual(['late', 'open', '', undefined, 42].map(state => dueState({ state })), ['closed', 'closed', 'closed', 'closed', 'closed'], 'a state a later gtl-api adds reads as closed');
  assert.deepEqual([dueState(null), dueState(undefined), dueState({ state: 'none' }), dueState({ state: 'done' })], [null, null, null, null]);
});

test('the Late marker reads the same as the new app\'s (D-30); no marker is empty text', () => {
  for (const minutes of [0, 0.5, 1, 12, 59, 60, 61, 125, 1439, 1440, 1500, 1563, 4321]) assert.equal(lateText({ minutes }), fmtLate(minutes), String(minutes));
  assert.deepEqual([lateText({ minutes: 12 }), lateText({ minutes: 125 }), lateText({ minutes: 3061 })], ['Late · 12 min', 'Late · 2 h 5 min', 'Late · 2 d 3 h']);
  assert.deepEqual([lateText(null), lateText(undefined), lateText({}), lateText({ minutes: -1 }), lateText({ minutes: 'x' })], ['', '', 'Late', 'Late', 'Late']);
});
