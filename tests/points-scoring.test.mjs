import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FINAL, POINTS_SLOTS, PROVISIONAL, beatHouse, canFinalize, finalizeAt, freezeWeek, isValidGuess, pointsOff, rankRows,
  roundTenth, scoreWeek, seasonStandings, slotOutcome, slotPoints, weekMaximum, weekStandings, weekWinners,
} from '../shared/points-scoring.mjs';

// D-56 Guess the Points scoring (spec sections 3.5–3.7 and the section 9 "Scoring" and "Boards" contracts).
// Fixture players, teams and guesses only; no real player picks.
const HOUR = 3_600_000;
const KICK = Date.parse('2026-10-25T17:00:00Z');
const AFTER = KICK + 30 * HOUR;
const slots = POINTS_SLOTS.map((slot, i) => ({ slot, playerId: `P${i + 1}`, team: ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'][i], kickoff: new Date(KICK + i * HOUR).toISOString() }));
const slate = { slots, rulesVersion: 'ppr4-v1', house: { QB: 20.4, RB: 11.5, WR: 13.2, TE: 8.8, FLEX: 10 } };
const actual = (team, points, extra = {}) => ({ team, played: true, playedBasis: 'snaps', points: { 'ppr4-v1': points }, ...extra });
const locked = (userId, picks) => Object.entries(picks).map(([slot, guess]) => ({ userId, slot, guess, lockedAt: '2026-10-24T00:00:00Z' }));

test('slot points are max(0, 10 − |guess − actual|) to the tenth', () => {
  assert.equal(slotPoints(18, 14.6), 6.6);
  assert.equal(slotPoints(14, 14), 10);
  assert.equal(slotPoints(0, 30.2), 0);
  assert.equal(slotPoints(25, 15), 0, 'exactly 10 off earns 0');
  assert.equal(slotPoints(20, 10.1), 0.1);
  assert.equal(slotPoints(3, -1.2), 5.8, 'a negative actual is scored the same way');
  // Binary fractions never leak: 0.1 + 0.2 style sums stay exact in tenths.
  assert.equal(slotPoints(10, 9.7) + 0, 9.7);
  assert.equal(roundTenth(14.65), 14.7, 'actuals round half away from zero, as round(numeric, 1)');
  assert.equal(roundTenth(-2.25), -2.3);
  assert.equal(pointsOff(18, 14.6), 3.4);
  for (const g of [0, 1, 59, 60]) assert.ok(isValidGuess(g));
  for (const g of [-1, 61, 12.5, '12', null, Number.NaN]) assert.equal(isValidGuess(g), false, String(g));
});

test('slot outcome: open before kickoff, pending without stats, void for no snap, team change or a game out of the week', () => {
  const s = slots[0], at = { now: AFTER, rulesVersion: 'ppr4-v1' };
  assert.equal(slotOutcome(s, actual('AAA', 20), { ...at, now: KICK - 1 }).state, 'open');
  assert.equal(slotOutcome(s, null, at).state, 'pending');
  assert.equal(slotOutcome(s, actual('AAA', 20, { played: null }), at).state, 'pending', 'played unknown stays pending');
  assert.deepEqual(slotOutcome(s, actual('AAA', 0, { played: false, playedBasis: 'no_snap' }), at), { slot: 'QB', state: 'void', actual: null, voidReason: 'no_snap' });
  assert.deepEqual(slotOutcome(s, actual('AAA', 0, { played: false, playedBasis: 'game_postponed' }), at).voidReason, 'game_postponed');
  assert.deepEqual(slotOutcome(s, actual('ZZZ', 12), at), { slot: 'QB', state: 'void', actual: null, voidReason: 'team_change' });
  assert.deepEqual(slotOutcome(s, actual('AAA', 21.04), at), { slot: 'QB', state: 'scored', actual: 21, voidReason: null });
  // One snap and injured still counts: the played flag is true and the actual scores.
  assert.equal(slotOutcome(s, actual('AAA', 0.4), at).state, 'scored');
});

test('the pinned rules version is used even after the weights change', () => {
  const row = { team: 'AAA', played: true, points: { 'ppr4-v1': 18.2, 'ppr4-v2': 22.6 } };
  assert.equal(slotOutcome(slots[0], row, { now: AFTER, rulesVersion: 'ppr4-v1' }).actual, 18.2);
  assert.equal(slotOutcome(slots[0], row, { now: AFTER, rulesVersion: 'ppr4-v2' }).actual, 22.6);
  // A loader that cannot reproduce the pinned version writes no points for it: the slot stays pending, never 0.
  assert.equal(slotOutcome(slots[0], { team: 'AAA', played: true, points: { 'ppr4-v2': 22.6 } }, { now: AFTER, rulesVersion: 'ppr4-v1' }).state, 'pending');
});

test('a void slot lowers the maximum and scores nothing for anyone; an unlocked slot scores nothing and reads null', () => {
  const actuals = { P1: actual('AAA', 14.6), P2: actual('BBB', 0, { played: false, playedBasis: 'no_snap' }), P3: actual('CCC', 9), P4: actual('DDD', 5.5), P5: actual('EEE', 12) };
  const guesses = [
    ...locked('u-ann', { QB: 18, RB: 10, WR: 9, TE: 6, FLEX: 12 }),
    // Bo locked QB only; the WR draft never scores.
    ...locked('u-bo', { QB: 14 }), { userId: 'u-bo', slot: 'WR', guess: 9, lockedAt: null },
  ];
  const week = scoreWeek({ slate, actuals, guesses, now: AFTER });
  assert.equal(week.status, PROVISIONAL);
  assert.equal(week.maximum, 40);
  assert.equal(weekMaximum(week.slots), 40);
  const ann = week.members.find(m => m.userId === 'u-ann'), bo = week.members.find(m => m.userId === 'u-bo');
  assert.deepEqual(ann.slots, { QB: 6.6, RB: null, WR: 10, TE: 9.5, FLEX: 10 });
  assert.equal(ann.points, 36.1);
  assert.equal(ann.exact, 2);
  assert.deepEqual(bo.slots, { QB: 9.4, RB: null, WR: null, TE: null, FLEX: null });
  assert.equal(bo.points, 9.4);
  assert.equal(week.members.length, 2, 'only members with a lock-in are on the week');
  // House: complete (every non-void slot has an estimate) and scored the same way.
  assert.equal(week.house.complete, true);
  assert.deepEqual(week.house.slots, { QB: 4.2, RB: null, WR: 5.8, TE: 6.7, FLEX: 8 });
  assert.equal(week.house.points, 24.7);
});

test('before any actual the week has no status and every total reads null, never 0', () => {
  const week = scoreWeek({ slate, actuals: {}, guesses: locked('u-ann', { QB: 18 }), now: KICK - HOUR });
  assert.equal(week.status, null);
  assert.equal(week.members[0].points, null);
  assert.equal(week.house.points, null);
  assert.equal(weekStandings(week)[0].rankLabel, '—');
});

test('PROVISIONAL re-grades on a corrected load; FINAL freezes and a later correction changes no total, rank or winner', () => {
  const guesses = [...locked('u-ann', { QB: 18, RB: 10, WR: 9, TE: 6, FLEX: 12 }), ...locked('u-bo', { QB: 20, RB: 10, WR: 9, TE: 6, FLEX: 12 })];
  const first = { P1: actual('AAA', 14.6), P2: actual('BBB', 10), P3: actual('CCC', 9), P4: actual('DDD', 5.5), P5: actual('EEE', 12) };
  const before = scoreWeek({ slate, actuals: first, guesses, now: AFTER });
  assert.deepEqual(weekStandings(before).map(r => [r.userId, r.points, r.rankLabel]), [['u-ann', 46.1, '1'], ['u-bo', 44.1, '2']]);
  // A stat correction moves the QB from 14.6 to 19.6: both members re-grade and the order flips.
  const corrected = { ...first, P1: actual('AAA', 19.6) };
  const after = scoreWeek({ slate, actuals: corrected, guesses, now: AFTER });
  assert.equal(after.status, PROVISIONAL);
  assert.deepEqual(weekStandings(after).map(r => [r.userId, r.points]), [['u-bo', 49.1], ['u-ann', 47.9]]);
  assert.deepEqual(weekWinners(after), [], 'no winner while PROVISIONAL');
  const final = freezeWeek(after);
  assert.equal(final.status, FINAL);
  assert.deepEqual(weekWinners(scoreWeek({ slate, actuals: corrected, guesses, now: AFTER, final })), ['u-bo']);
  // After FINAL a further correction arrives: nothing changes.
  const late = scoreWeek({ slate, actuals: { ...corrected, P1: actual('AAA', 4) }, guesses, now: AFTER + 200 * HOUR, final });
  assert.deepEqual(late, { ...final, status: FINAL });
  assert.deepEqual(weekWinners(late), ['u-bo']);
});

test('ties share the rank (T-2); null rows take no rank; the House never takes a rank', () => {
  const rows = rankRows([{ userId: 'a', points: 30 }, { userId: 'b', points: 41.5 }, { userId: 'c', points: 30 }, { userId: 'd', points: null }, { userId: 'e', points: 12 }]);
  assert.deepEqual(rows.map(r => [r.userId, r.rankLabel]), [['b', '1'], ['a', 'T-2'], ['c', 'T-2'], ['e', '4'], ['d', '—']]);
  const week = scoreWeek({ slate, actuals: { P1: actual('AAA', 18) }, guesses: [...locked('a', { QB: 18 }), ...locked('b', { QB: 18 })], now: AFTER });
  const standings = weekStandings(week);
  assert.deepEqual(standings.map(r => r.rankLabel), ['T-1', 'T-1']);
  assert.ok(standings.every(r => r.userId !== 'house'));
  assert.deepEqual(weekWinners(freezeWeek(week)).sort(), ['a', 'b'], 'members sharing rank 1 share the week');
});

test('beat the House counts only weeks with a complete House', () => {
  const actuals = { P1: actual('AAA', 20), P2: actual('BBB', 10), P3: actual('CCC', 10), P4: actual('DDD', 10), P5: actual('EEE', 10) };
  const guesses = locked('a', { QB: 20, RB: 10, WR: 10, TE: 10, FLEX: 10 });
  const full = scoreWeek({ slate, actuals, guesses, now: AFTER });
  assert.equal(beatHouse(full, 'a'), true);
  const partial = scoreWeek({ slate: { ...slate, house: { ...slate.house, TE: undefined } }, actuals, guesses, now: AFTER });
  assert.equal(partial.house.complete, false);
  assert.equal(partial.house.points, null, 'an incomplete House week reads "—"');
  assert.equal(beatHouse(partial, 'a'), false);
  // A missing estimate on a void slot does not make the House incomplete.
  const voided = scoreWeek({ slate: { ...slate, house: { ...slate.house, TE: undefined } }, actuals: { ...actuals, P4: actual('DDD', 0, { played: false }) }, guesses, now: AFTER });
  assert.equal(voided.house.complete, true);
});

test('season standings: a member appears from their first lock-in, weeks not played add nothing, PROVISIONAL is labelled', () => {
  const actuals = { P1: actual('AAA', 20), P2: actual('BBB', 10), P3: actual('CCC', 10), P4: actual('DDD', 10), P5: actual('EEE', 10) };
  const w1 = freezeWeek(scoreWeek({ slate, actuals, guesses: [...locked('a', { QB: 20, RB: 10 }), ...locked('b', { QB: 18 })], now: AFTER }));
  const w2 = scoreWeek({ slate, actuals, guesses: [...locked('a', { QB: 19 }), ...locked('c', { QB: 20, RB: 10, WR: 10, TE: 10, FLEX: 10 })], now: AFTER });
  const table = seasonStandings([w1, w2]);
  assert.deepEqual(table.map(r => [r.userId, r.points, r.weeksPlayed, r.provisional, r.rankLabel]),
    [['c', 50, 1, true, '1'], ['a', 29, 2, true, '2'], ['b', 8, 1, false, '3']]);
  assert.equal(table.find(r => r.userId === 'a').perWeek, 14.5);
  assert.equal(table.find(r => r.userId === 'c').beatHouse, 1);
  assert.ok(!table.some(r => r.userId === 'd'), 'no lock-in, no row');
});

test('FINAL time is the following Thursday 12:00 PM PT, across the November DST change', () => {
  assert.equal(finalizeAt('2026-10-20T19:00:00Z'), '2026-10-29T19:00:00.000Z', 'Tue Oct 20 12:00 PDT → Thu Oct 29 12:00 PDT');
  assert.equal(finalizeAt('2026-10-27T19:00:00Z'), '2026-11-05T20:00:00.000Z', 'Tue Oct 27 12:00 PDT → Thu Nov 5 12:00 PST');
  assert.equal(finalizeAt('2026-10-27T07:00:00Z'), '2026-11-05T20:00:00.000Z', 'D-61 midnight open: Tue Oct 27 00:00 PDT → Thu Nov 5 12:00 PST');
  assert.equal(finalizeAt('2026-11-03T08:00:00Z'), '2026-11-12T20:00:00.000Z', 'D-61 midnight open: Tue Nov 3 00:00 PST → Thu Nov 12 12:00 PST');
  const outcomes = [{ state: 'scored' }, { state: 'void' }];
  assert.deepEqual(canFinalize({ finalizeAt: '2026-10-29T19:00:00Z', outcomes, now: '2026-10-29T18:59:59Z' }), { ready: false, reason: 'not_yet' });
  assert.deepEqual(canFinalize({ finalizeAt: '2026-10-29T19:00:00Z', outcomes: [...outcomes, { state: 'pending' }], now: '2026-10-29T19:00:00Z' }), { ready: false, reason: 'pending_stats' });
  assert.deepEqual(canFinalize({ finalizeAt: '2026-10-29T19:00:00Z', outcomes, now: '2026-10-29T19:00:00Z' }), { ready: true, reason: null });
});
