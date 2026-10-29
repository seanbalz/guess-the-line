// EPL Guess the Line, plan 2026-10-28-epl-moneyline.md Task 1: the pure moneyline rules. American prices map to a line on
// which -100 and +100 are the same point; distance is the gap on that line; the real price is the median of the books on
// that line, converted back; the leaderboard ranks lowest average distance per match guessed, ties by more matches guessed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { distance, fromLine, leaderboard, median, toLine, validPrice } from '../shared/epl-moneyline.mjs';

test('toLine folds -100 and +100 onto one point', () => {
  assert.equal(toLine(120), 20);
  assert.equal(toLine(-110), -10);
  assert.equal(toLine(100), 0);
  assert.equal(toLine(-100), 0);
  assert.equal(fromLine(0), 100);
  assert.equal(fromLine(5), 105);
  assert.equal(fromLine(-30), -130);
});

test('distance across and within signs (plan exact values)', () => {
  assert.equal(distance(-110, 120), 30);
  assert.equal(distance(120, -110), 30);
  assert.equal(distance(-150, -120), 30);
  assert.equal(distance(100, -100), 0);
  assert.equal(distance(-100, 100), 0);
  assert.equal(distance(-105, 105), 10);
  assert.equal(distance(250, 180), 70);
});

test('validPrice: integers with |p| >= 100 only', () => {
  assert.equal(validPrice(99), false);
  assert.equal(validPrice(-99), false);
  assert.equal(validPrice(-100), true);
  assert.equal(validPrice(100), true);
  assert.equal(validPrice(-2500), true);
  assert.equal(validPrice(110.5), false);
  assert.equal(validPrice(0), false);
  assert.equal(validPrice('120'), false);
  assert.equal(validPrice(Number.NaN), false);
  assert.equal(validPrice(Infinity), false);
  assert.equal(validPrice(null), false);
});

test('median is taken on the line scale and converted back', () => {
  assert.equal(median([-110, 120]), 105);
  assert.equal(median([-120, -110, 105]), -110);
  assert.equal(median([-100, 100]), 100);
  assert.equal(median([150]), 150);
  assert.equal(median([-130, -150, -140, -110]), -135);
});

test('median rounds a half-point mean away from zero, symmetrically', () => {
  // line -10 and 15 -> 2.5 -> 3 -> +103; line 10 and -15 -> -2.5 -> -3 -> -103
  assert.equal(median([-110, 115]), 103);
  assert.equal(median([110, -115]), -103);
});

test('median ignores invalid prices and returns null with none left', () => {
  assert.equal(median([]), null);
  assert.equal(median([50, Number.NaN]), null);
  assert.equal(median([-110, 99, 120]), 105);
  assert.equal(median(undefined), null);
});

test('leaderboard ranks lowest average, ties broken by more matches guessed, then ownerId', () => {
  const rows = [
    { ownerId: 'b', distance: 20 },
    { ownerId: 'b', distance: 40 }, // b: average 30 over 2
    { ownerId: 'a', distance: 30 }, // a: average 30 over 1
    { ownerId: 'c', distance: 10 },
    { ownerId: 'c', distance: 20 },
    { ownerId: 'c', distance: 30 }, // c: average 20 over 3
    { ownerId: 'd', distance: 30 },
    { ownerId: 'd', distance: 30 }, // d: average 30 over 2, ties b, ownerId breaks it
  ];
  assert.deepEqual(leaderboard(rows), [
    { ownerId: 'c', average: 20, guessed: 3, unscored: 0 },
    { ownerId: 'b', average: 30, guessed: 2, unscored: 0 },
    { ownerId: 'd', average: 30, guessed: 2, unscored: 0 },
    { ownerId: 'a', average: 30, guessed: 1, unscored: 0 },
  ]);
});

test('leaderboard excludes unscored guesses from the average and counts them separately', () => {
  const rows = [
    { ownerId: 'a', distance: 10 },
    { ownerId: 'a', distance: null },
    { ownerId: 'a', distance: 20 },
    { ownerId: 'b', distance: 14 },
  ];
  assert.deepEqual(leaderboard(rows), [
    { ownerId: 'b', average: 14, guessed: 1, unscored: 0 },
    { ownerId: 'a', average: 15, guessed: 2, unscored: 1 },
  ]);
});

test('leaderboard compares averages exactly, not by float rounding', () => {
  // 10/3 and 20/6 are equal; more matches guessed wins.
  const rows = [
    ...[0, 0, 10].map(d => ({ ownerId: 'a', distance: d })),
    ...[0, 0, 0, 0, 10, 10].map(d => ({ ownerId: 'b', distance: d })),
  ];
  const board = leaderboard(rows);
  assert.deepEqual(board.map(r => r.ownerId), ['b', 'a']);
  assert.equal(board[0].guessed, 6);
});

test('leaderboard: a manager with only unscored guesses has no average and sits below every ranked manager', () => {
  const rows = [
    { ownerId: 'a', distance: null },
    { ownerId: 'b', distance: 500 },
  ];
  assert.deepEqual(leaderboard(rows), [
    { ownerId: 'b', average: 500, guessed: 1, unscored: 0 },
    { ownerId: 'a', average: null, guessed: 0, unscored: 1 },
  ]);
  assert.deepEqual(leaderboard([]), []);
});
