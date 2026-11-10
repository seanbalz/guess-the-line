import test from 'node:test';
import assert from 'node:assert/strict';
import { periodWeeks, combineGapBoards, loadGapBoards } from '../web/src/next/bets/gapPeriods.js';
import { gapRecord } from '../shared/recommended-bets.mjs';

const slates = [{ season: 2026, week: 7 }, { season: 2025, week: 18 }, { season: 2026, week: 5 }, { season: 2026, week: 6 }, { season: 2026, week: 5 }];
const ids = weeks => weeks.map(w => `${w.season}:${w.week}`);
const scope = { season: 2026, week: 6 };
const board = (season, week, margins = [10]) => ({ season, week, games: margins.map((margin, i) => ({
  id: i ? `game-${i}` : 'NYJ-BUF', kickoff: `${season}-10-${String(week + i).padStart(2, '0')}T20:00:00Z`,
  started: true, mine: { spread: { lockedIn: true, guess: -6 }, total: { lockedIn: true, guess: 48 } },
  spread: { visible: true, value: -3 }, total: { visible: true, value: 45 },
  final: { status: 'final', home: 20 + margin, away: 20 },
})) });

test('Week remains one selected week; season follows the latest published season; All time is deduplicated chronological history', () => {
  assert.deepEqual(ids(periodWeeks(slates, { ...scope, period: 'week' })), ['2026:6']);
  assert.deepEqual(ids(periodWeeks(slates, { season: 2025, week: 18, period: 'season' })), ['2026:5', '2026:6', '2026:7']);
  assert.deepEqual(ids(periodWeeks(slates, { ...scope, period: 'all' })), ['2025:18', '2026:5', '2026:6', '2026:7']);
});
test('Custom includes endpoints, gaps in published weeks and cross-season boundaries', () => {
  assert.deepEqual(ids(periodWeeks(slates, { ...scope, period: 'custom', from: '2025:18', to: '2026:6' })), ['2025:18', '2026:5', '2026:6']);
  assert.deepEqual(ids(periodWeeks(slates, { ...scope, period: 'custom', from: '2026:6', to: '2026:6' })), ['2026:6']);
});
test('unknown/reversed custom bounds and invalid periods cannot silently become All time', () => {
  for (const input of [{ period: 'custom', from: '2026:7', to: '2026:5' }, { period: 'custom', from: '2026:1', to: '2026:7' }, { period: 'wat' }]) {
    assert.throws(() => periodWeeks(slates, { ...scope, ...input }), /range|period/i);
  }
  assert.deepEqual(periodWeeks([], { ...scope, period: 'all' }), []);
});
test('combined grades are weighted from counts; pushes do not enter the win-rate denominator', () => {
  const combined = combineGapBoards([board(2026, 6, [10, 0, 0, 0, 3]), board(2026, 5, [10])]);
  const record = gapRecord(combined, { market: 'spread' });
  assert.deepEqual([record.wins, record.losses, record.pushes], [2, 3, 1]);
  assert.equal(record.wins / (record.wins + record.losses), .4);
  assert.equal(record.riskUnits, 6);
  assert.equal(new Set(combined.games.map(g => g.id)).size, 6);
  assert.equal(combined.games[0].week, 5);
  assert.equal(combined.games[0].originalId, 'NYJ-BUF');
});
test('same matchup across seasons stays distinct; market and large-gap filters use the whole period', () => {
  const combined = combineGapBoards([board(2026, 5), board(2025, 5)]);
  assert.equal(new Set(combined.games.map(g => g.id)).size, 2);
  assert.deepEqual(combined.games.map(g => g.season), [2025, 2026]);
  assert.equal(gapRecord(combined).graded.length, 4);
  assert.equal(gapRecord(combined, { market: 'total' }).graded.length, 2);
  assert.equal(gapRecord(combined).large.riskUnits, 0);
  for (const game of combined.games) game.mine.spread.guess = -20;
  assert.equal(gapRecord(combined).large.riskUnits, 2);
});
test('missing evidence, drafts, sit-outs and even guesses retain their existing exclusions', () => {
  const b = board(2026, 5, [10, 10, 10, 10, 10]);
  b.games[0].final = null;
  b.games[1].spread = { visible: false };
  b.games[2].mine.spread.lockedIn = false;
  b.games[3].mine.spread.satOut = true;
  b.games[4].mine.spread.guess = -3;
  const result = gapRecord(combineGapBoards([b]), { market: 'spread' });
  assert.deepEqual(result.notGraded, { noFinal: 1, noLine: 1 });
  assert.equal(result.even, 1);
  assert.equal(result.graded.length, 0);
});
test('combining cannot mutate sources or double count duplicate week/game identities', () => {
  const a = board(2026, 5), before = structuredClone(a);
  combineGapBoards([a]);
  assert.deepEqual(a, before);
  assert.throws(() => combineGapBoards([a, a]), /duplicate/i);
  assert.throws(() => combineGapBoards([{ ...a, games: [...a.games, a.games[0]] }]), /duplicate/i);
});
test('loader reuses displayed-week board and fetches each other week once with at most three active reads', async () => {
  const weeks = Array.from({ length: 8 }, (_, i) => ({ season: 2026, week: i + 1 }));
  let active = 0, peak = 0;
  const seen = [];
  const result = await loadGapBoards(weeks, { board: board(2026, 4), read: async (s, signal) => {
    assert.equal(signal.aborted, false);
    seen.push(s.week); active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--;
    return board(s.season, s.week);
  } });
  assert.equal(peak, 3);
  assert.equal(seen.length, 7);
  assert.ok(!seen.includes(4));
  assert.deepEqual(result.map(b => b.week), weeks.map(w => w.week));
});
test('loader rejects failed or mismatched weeks rather than publishing partial totals', async () => {
  const weeks = [{ season: 2026, week: 5 }, { season: 2026, week: 6 }];
  await assert.rejects(loadGapBoards(weeks, { read: async s => { if (s.week === 6) throw new Error('offline'); return board(s.season, s.week); } }), /offline/);
  await assert.rejects(loadGapBoards(weeks, { read: async () => board(2025, 5) }), /match/i);
});
test('an aborted load launches no further weekly reads', async () => {
  const controller = new AbortController(); controller.abort();
  let reads = 0;
  await assert.rejects(loadGapBoards(slates, { signal: controller.signal, read: async () => { reads++; return board(2026, 5); } }), { name: 'AbortError' });
  assert.equal(reads, 0);
});

test('aborting in-flight reads prevents scheduling the remainder and cannot resolve a partial board', async () => {
  const controller = new AbortController(), started = [];
  const pending = loadGapBoards(Array.from({ length: 8 }, (_, i) => ({ season: 2026, week: i + 1 })), {
    signal: controller.signal, read: async (scope, signal) => {
      started.push(scope.week);
      await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
      return board(scope.season, scope.week);
    },
  });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(started, [1, 2, 3]);
});
