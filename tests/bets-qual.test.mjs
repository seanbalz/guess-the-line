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

test('saved four-place wins retain their stake and net precision before the ROI percentage is rounded', () => {
  for (const [units, netUnits, roi] of [[0.01, 0.0091, 91], [0.5, 0.4545, 90.9]]) {
    const rows = [pick('win', units, netUnits)];
    const original = structuredClone(rows);
    const week = weekFromPicks(rows);
    assert.equal(week.units, units);
    assert.equal(week.riskUnits, units);
    assert.equal(week.netUnits, netUnits);
    assert.equal(week.roi, roi);
    assert.deepEqual(normalizeWeek({ wins: '1', picks: '1', units: String(units), riskUnits: String(units), netUnits: String(netUnits) }), week);
    assert.deepEqual(rows, original, 'reading a result must not rewrite its saved precision');
  }
});

test('season totals retain every week’s saved fractions and calculate one ROI over the summed settled risk', () => {
  const rows = [[0.5, 0.4545], [0.5, 0.4505], [0.01, 0.0091]]
    .map(([units, netUnits]) => weekFromPicks([pick('win', units, netUnits)]));
  const original = structuredClone(rows);
  const total = addWeeks(rows);
  assert.deepEqual([total.units, total.riskUnits, total.netUnits, total.roi], [1.01, 1.01, 0.9141, 90.5]);
  const season = seasonBoard(rows.map((row, i) => ({ week: i + 1, rows: [{ userId: 'a', ...row, picks: i === 0 ? 3 : 1 }] })));
  assert.deepEqual(season.board.map(row => [row.netUnits, row.roi, row.qualifiedWeeks]), [[0.9141, 90.5, 1]]);
  assert.deepEqual(rows, original, 'season aggregation is read only');
});

test('saved fractions do not promote a below-3U week or erase a tiny settled loss', () => {
  const below = weekFromPicks([pick('pending', 2), pick('void', 0.9999, 100)]);
  assert.equal(below.units, 2.9999);
  assert.equal(below.qualified, false);
  assert.equal(below.roi, null);
  const loss = weekFromPicks([pick('loss', 0.0001), pick('push', 0.0001), pick('void', 1, 100), pick('pending', 1, 100)]);
  assert.deepEqual([loss.wins, loss.losses, loss.pushes, loss.voids, loss.pending], [0, 1, 1, 1, 1]);
  assert.deepEqual([loss.riskUnits, loss.netUnits, loss.roi, loss.qualified], [0.0002, -0.0001, -50, true]);
  assert.equal(pickNet(pick('push', 0.0001)), 0);
});

test('four-place sums stay stable across floating additions, cancellation and week order', () => {
  const weeks = Array.from({ length: 10 }, () => weekFromPicks([pick('win', 0.1, 0.0091)]));
  const total = addWeeks(weeks);
  assert.deepEqual([total.units, total.riskUnits, total.netUnits, total.roi], [1, 1, 0.091, 9.1]);
  assert.deepEqual(addWeeks([...weeks].reverse()), total);
  const cancelled = weekFromPicks([pick('win', 0.1, 0.1), pick('win', 0.2, 0.2), pick('loss', 0.3)]);
  assert.equal(cancelled.netUnits, 0);
  assert.equal(cancelled.roi, 0);
});

test('otherwise qualified half-unit winners at −110 and −111 split the old cent-rounded tie', () => {
  const rows = [0.4545, 0.4505].map((net, i) => ({ userId: String(i), ...weekFromPicks([
    pick('win', 0.5, net), pick('pending', 0.5), pick('void', 0.5),
  ]) }));
  const { board } = rankBoard(rows);
  assert.deepEqual(board.map(row => [row.userId, row.netUnits, row.roi, rankLabel(row)]),
    [['0', 0.4545, 90.9, '1'], ['1', 0.4505, 90.1, '2']]);
  const old = rankBoard(rows.map(row => ({ ...row, netUnits: Math.round(row.netUnits * 100) / 100 })));
  assert.deepEqual(old.board.map(rankLabel), ['T-1', 'T-1'], 'representative impact of the previous cent normalization');
});

test('equal two-place ROI uses four-place net, then wins; exact equality still shares ranks', () => {
  const rows = [
    { userId: 'lower', netUnits: 0.4505, wins: 9 },
    { userId: 'fewer', netUnits: 0.4545, wins: 1 },
    { userId: 'a', netUnits: 0.4545, wins: 2 },
    { userId: 'b', netUnits: 0.4545, wins: 2 },
  ].map(row => ({ picks: 10, units: 100.5, riskUnits: 100, ...row }));
  const original = structuredClone(rows);
  const { board } = rankBoard(rows);
  assert.deepEqual(board.map(row => [row.userId, row.roi, rankLabel(row)]),
    [['a', 0.45, 'T-1'], ['b', 0.45, 'T-1'], ['fewer', 0.45, '3'], ['lower', 0.45, '4']]);
  assert.deepEqual(rows, original);
});
