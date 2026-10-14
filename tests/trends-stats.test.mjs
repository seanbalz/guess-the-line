import test from 'node:test';
import assert from 'node:assert/strict';
import { T } from './trends-fixture.mjs';

test('payout per pick is rounded to 4 dp and blank odds price at -110', () => {
  assert.equal(T.payout(-110), 0.9091);
  assert.equal(T.payout(120), 1.2);
  assert.equal(T.payout(-146), 0.6849);
  assert.equal(T.payout(null), 0.9091);
});

test('Wilson interval, exact binomial tails and Benjamini-Hochberg', () => {
  assert.deepEqual(T.wilson(5, 6), [0.4365, 0.9699]);
  assert.equal(T.wilson(0, 0), null);
  assert.ok(Math.abs(T.binomSf(60, 100, 0.5) - 0.02844) < 2e-4);
  assert.ok(Math.abs(T.binomTwoSided(60, 100) - 0.05689) < 4e-4);
  assert.ok(Math.abs(T.binomSf(5, 10, 0.5) - 0.623) < 1e-3);
  assert.ok(T.binomSf(1200, 2000, 0.5) < 1e-15);
  assert.equal(T.binomSf(0, 10, 0.5), 1);
  assert.equal(T.binomSf(11, 10, 0.5), 0);
  assert.deepEqual(T.bh([0.01, 0.04, 0.03, 0.5]).map(x => Math.round(x * 1e4) / 1e4), [0.04, 0.0533, 0.0533, 0.5]);
  assert.equal(T.jaccard(['a', 'b', 'c'], ['a', 'b', 'd']), 0.5);
  assert.equal(T.jaccard([], []), 0);
});

// Synthetic bet units: res is the result for side A (+1 win, -1 loss, 0 push).
const unit = (season, i, res, oa = -110, ob = -110) => ({ g: { season, date: `${season}-10-${String(1 + (i % 28)).padStart(2, '0')}`, id: `${season}_${i}` }, id: `${season}_${i}`, res, resid: res * 3, oa, ob });
const ctx = units => ({ units, pop: [], throughSeason: 2025, currentSeason: 2026, lastFinalDate: '2026-10-11' });

test('records: ROI risks pushes, streak skips pushes, last 10 includes pushes, sparkline keeps endpoints', () => {
  const units = [unit(2002, 1, 1), unit(2002, 2, -1), unit(2002, 3, 0), unit(2002, 4, 1), unit(2002, 5, 0), unit(2002, 6, 1)];
  const r = T.evaluatePreset({ market: 'total', atoms: ['g:g_all'], side: 'A' }, ctx(units));
  assert.deepEqual([r.reg.W, r.reg.L, r.reg.P], [3, 1, 2]);
  assert.equal(r.reg.units110, 1.7273);
  assert.equal(r.reg.roi110, 0.2879, 'net 1.7273 over 6 bets including 2 pushes');
  assert.deepEqual(r.reg.streak, { result: 'W', length: 2 }, 'the push between the last two wins is skipped');
  assert.deepEqual(r.reg.last10, { W: 3, L: 1, P: 2 });
  assert.deepEqual(r.split, { A: 3, B: 1, P: 2 });
  const many = Array.from({ length: 120 }, (_, i) => unit(2002 + Math.floor(i / 10), i, i % 3 === 0 ? -1 : 1));
  const s = T.evaluatePreset({ market: 'total', atoms: ['g:g_all'], side: 'A' }, ctx(many)).reg;
  assert.equal(s.spark.length, 48);
  assert.equal(s.spark[0], 0);
  assert.equal(s.spark[47], Math.round(s.units110 * 100) / 100);
  assert.deepEqual(T.evaluatePreset({ market: 'total', atoms: ['g:g_all'], side: 'A' }, ctx(many)).reg.spark, s.spark, 'deterministic');
});

test('walk-forward picks each season\'s side from earlier seasons only (20+ decided, ties skipped)', () => {
  const units = [];
  for (let i = 0; i < 30; i++) units.push(unit(2010, i, i < 20 ? -1 : 1)); // 2010: A 10-20, so B leads
  for (let i = 0; i < 10; i++) units.push(unit(2018, i, i < 4 ? 1 : -1)); // B 6-4
  for (let i = 0; i < 10; i++) units.push(unit(2019, i, -1)); // B 10-0
  for (let i = 0; i < 4; i++) units.push(unit(2026, i, -1));
  const r = T.evaluatePreset({ market: 'total', atoms: ['g:g_all'] }, ctx(units));
  assert.equal(r.disc.side, 'B');
  assert.deepEqual([r.oos.W, r.oos.L, r.oos.P], [16, 4, 0]);
  assert.deepEqual(r.oos.perSeason.map(x => x.slice(0, 5)), [[2018, 'B', 6, 4, 0], [2019, 'B', 10, 0, 0]]);
  assert.equal(r.wf.from, 2018, 'no season before 2018 had 20 decided games of history');
  assert.equal(r.seasonSide, 'B', 'the 2026 side comes from 2002-2025');
  assert.deepEqual(r.thisSeason, { W: 4, L: 0, P: 0 });
  const tie = [...Array.from({ length: 20 }, (_, i) => unit(2010, i, i < 10 ? 1 : -1)), unit(2018, 1, 1)];
  assert.equal(T.evaluatePreset({ market: 'total', atoms: ['g:g_all'] }, ctx(tie)).oos.W + T.evaluatePreset({ market: 'total', atoms: ['g:g_all'] }, ctx(tie)).oos.L, 0, 'a 10-10 history books no side');
});

const fakeResult = o => ({
  decided: 1000, seasons: 24,
  disc: { W: o.dW ?? 610, L: o.dL ?? 528, side: 'B' },
  oos: { W: o.W, L: o.L, P: 0, pts: o.pts ?? 1.5950413, seasonsPos: o.pos ?? 7, seasonsBet: o.bet ?? 8, sideFlips: o.flips ?? 0, dominantSide: 'B', roi110: o.roi ?? 0.12,
    perSeason: o.per ?? [[2018, 'B', 35, 22, 1, 11.56], [2019, 'B', 46, 29, 0, 14.92], [2020, 'B', 33, 30, 0, 1.53], [2021, 'B', 48, 29, 1, 15.85],
      [2022, 'B', 28, 14, 0, 12.24], [2023, 'B', 35, 18, 2, 13.94], [2024, 'B', 28, 31, 1, -5.51], [2025, 'B', 29, 24, 0, 2.24]] },
});

test('quality score worked check (wind 10+ Under on the study data) and the caps', () => {
  const wind = { atoms: ['g:g_wind10'], K: 5 };
  const s = T.qualityScore(fakeResult({ W: 282, L: 197 }), wind, { q: 0.10281403, throughSeason: 2025, eligible: true });
  assert.deepEqual([s.score, s.E, s.M, s.R, s.C, s.P, s.Rc, s.K, s.pen, s.cap], [97.6, 33.2, 9.9, 19.4, 15, 10, 5, 5, 0, 100]);
  assert.equal(T.qualityScore(fakeResult({ W: 40, L: 15 }), wind, { q: 0.1, throughSeason: 2025, eligible: true }).cap, 35, 'n < 60');
  assert.equal(T.qualityScore(fakeResult({ W: 90, L: 50 }), wind, { q: 0.1, throughSeason: 2025, eligible: true }).cap, 69, 'n < 150');
  assert.equal(T.qualityScore(fakeResult({ W: 282, L: 197 }), wind, { q: 0.1, throughSeason: 2025, eligible: false }).score, 39, 'not tier-eligible');
  const tiny = { ...fakeResult({ W: 282, L: 197 }), decided: 22, seasons: 7 };
  const a = T.qualityScore(tiny, wind, { q: 0.1, throughSeason: 2025, eligible: true });
  assert.equal(a.score, 15); assert.equal(a.anecdote, true);
  const two = T.qualityScore(fakeResult({ W: 282, L: 197, flips: 2 }), { atoms: ['g:g_wind10', 'g:g_dec'], K: 2 }, { q: 0.9, throughSeason: 2025, eligible: true });
  assert.equal(two.pen, 15, '-5 for the second filter, -10 for two side flips');
});

test('gates name each failure; Tier 1 accepts the stored permutation family-wise p when q misses 0.10', () => {
  const p = { atoms: ['g:g_wind10'], K: 5, side: 'B', permMaxP: 0.0099 };
  const ok = T.gates(fakeResult({ W: 282, L: 197 }), p, { q: 0.103, robustness: [{ id: 'v', pass: true }] });
  assert.deepEqual(ok.failed, []);
  assert.equal(ok.tier1Checks, true);
  assert.equal(T.gates(fakeResult({ W: 282, L: 197 }), { ...p, permMaxP: 0.0594 }, { q: 0.103 }).tier1Checks, false, 'the 80+ count statistic fails 0.05');
  const bad = T.gates(fakeResult({ W: 100, L: 100, pts: -0.2, roi: -0.05, flips: 2, dW: 500, dL: 500 }), { atoms: ['ref:X', 'g:g_div', 'g:g_prime'], K: 0 }, { q: 0.9, robustness: [{ id: 'loose', pass: false }] });
  for (const reason of ['more than 2 filters', 'entity filter', 'no mechanism prior (K < 2)', 'side changed in 2+ confirmation seasons', 'confirmation hit below 52.38%',
    'confirmation ROI at -110 not positive', 'points versus the line not positive', 'no replication in 2002-2017 (R < 10)', 'robustness: loose']) {
    assert.ok(bad.failed.includes(reason), reason);
  }
});

test('copy guard catches banned words and allows the "No proven edge" label', () => {
  assert.deepEqual(T.bannedCopy('No proven edge'), []);
  assert.deepEqual(T.bannedCopy('A sharp lock'), ['lock', 'sharp']);
  assert.deepEqual(T.bannedCopy('Knowledge and hedges'), []);
  for (const text of Object.values(T.COPY)) assert.deepEqual(T.bannedCopy(text), [], text);
});
