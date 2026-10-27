// shared/bets-qual.mjs (M-12, stage 42; D-18, D-35, D-36). Contracts:
// - a week counts every current row toward qualification (3 picks or 3U), voided rows included; record, net units
//   and ROI come from settled rows only, a loss without a saved net costs its units, and ROI is null until one settles;
// - the board keeps qualified players only, by ROI, then net units, then wins; a null ROI ranks after every number;
//   equal players share a rank shown "T-n";
// - the season board keeps anyone qualified in at least one week, ranked over every week, unqualified weeks included.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addWeeks, normalizeWeek, pickNet, rankBoard, rankLabel, roiOf, seasonBoard, weekFromPicks } from '../shared/bets-qual.mjs';

const pick = (status, units, netUnits) => ({ status, selection: { units }, result: netUnits === undefined ? null : { netUnits } });

test('settled rows give record, net and ROI; void and pending only count toward qualification', () => {
  const week = weekFromPicks([pick('win', 1, 0.91), pick('loss', 2), pick('push', 1, 0), pick('void', 1), pick('pending', 0.5)]);
  assert.deepEqual(week, { wins: 1, losses: 1, pushes: 1, pending: 1, voids: 1, picks: 5, units: 5.5, riskUnits: 4, netUnits: -1.09, roi: -27.25, qualified: true });
  assert.equal(pickNet(pick('loss', 1.5)), -1.5, 'a loss with no saved net costs its units');
  assert.equal(pickNet(pick('push', 1)), 0);
  assert.equal(pickNet(pick('void', 1, 3)), null, 'a void never has a net, whatever was saved');
  assert.equal(pickNet(pick('pending', 1)), null);
});

test('a week qualifies at 3 picks or 3 units, either one', () => {
  assert.equal(weekFromPicks([pick('pending', 3)]).qualified, true, 'one 3U pick');
  assert.equal(weekFromPicks([pick('pending', 0.5), pick('pending', 0.5), pick('void', 0.5)]).qualified, true, 'three small picks, one voided (D-18 keeps its credit)');
  assert.equal(weekFromPicks([pick('win', 1, 0.91), pick('pending', 1.5)]).qualified, false, '2 picks and 2.5U');
});

test('ROI is null until something settles, then net over risk to two places', () => {
  assert.equal(weekFromPicks([pick('pending', 3)]).roi, null);
  assert.equal(roiOf(0, 0), null);
  assert.equal(roiOf(1, 3), 33.33);
  assert.equal(roiOf(-1, 1), -100);
});

test('the board ranks qualified players by ROI, then net units, then wins, and shares tied ranks', () => {
  const rows = [
    { userId: 'a', wins: 2, losses: 1, picks: 3, units: 3, riskUnits: 3, netUnits: 0.82 },
    { userId: 'b', wins: 3, losses: 0, picks: 3, units: 3, riskUnits: 3, netUnits: 2.73 },
    { userId: 'c', wins: 1, losses: 2, picks: 3, units: 3, riskUnits: 3, netUnits: 0.82 },
    { userId: 'd', wins: 2, losses: 1, picks: 3, units: 3, riskUnits: 3, netUnits: 0.82 },
    { userId: 'e', wins: 0, losses: 0, pending: 3, picks: 3, units: 3, riskUnits: 0, netUnits: 0 },
    { userId: 'f', wins: 1, losses: 0, picks: 1, units: 1, riskUnits: 1, netUnits: 0.91 },
  ];
  const { board, unranked } = rankBoard(rows);
  assert.deepEqual(board.map(row => [row.userId, rankLabel(row)]), [['b', '1'], ['a', 'T-2'], ['d', 'T-2'], ['c', '4'], ['e', '5']]);
  assert.equal(board.find(row => row.userId === 'e').roi, null, 'nothing settled: ROI —, ranked after every number');
  assert.deepEqual(unranked.map(row => row.userId), ['f'], 'an unqualified week is off the board');
});

test('the season board keeps anyone qualified once and ranks over every week, unqualified weeks included', () => {
  const weeks = [
    { week: 6, rows: [{ userId: 'a', wins: 3, picks: 3, units: 3, riskUnits: 3, netUnits: 2.73 }, { userId: 'b', wins: 1, picks: 1, units: 1, riskUnits: 1, netUnits: 0.91 }] },
    { week: 7, rows: [{ userId: 'a', losses: 1, picks: 1, units: 2, riskUnits: 2, netUnits: -2 }, { userId: 'b', wins: 1, picks: 1, units: 1, riskUnits: 1, netUnits: 0.91 }] },
  ];
  const { board, unranked } = seasonBoard(weeks);
  assert.deepEqual(board.map(row => [row.userId, row.wins, row.losses, row.netUnits, row.roi, row.qualifiedWeeks]), [['a', 3, 1, 0.73, 14.6, 1]]);
  assert.deepEqual(unranked.map(row => [row.userId, row.qualifiedWeeks]), [['b', 0]], 'never qualified: off the season board');
  assert.equal(addWeeks(weeks[0].rows.slice(0, 1).concat(weeks[1].rows.slice(0, 1))).picks, 4);
});

test('totals from the SQL shape normalize the same way (strings, missing fields, negatives)', () => {
  assert.deepEqual(normalizeWeek({ wins: '2', losses: 1, picks: '3', units: '3.5', riskUnits: '3', netUnits: '-0.18' }),
    { wins: 2, losses: 1, pushes: 0, pending: 0, voids: 0, picks: 3, units: 3.5, riskUnits: 3, netUnits: -0.18, roi: -6, qualified: true });
  assert.equal(normalizeWeek({ wins: -1 }).wins, 0, 'a negative count is not a count');
});
