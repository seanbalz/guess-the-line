// D-55 trend chart geometry (web/src/next/charts/geometry.js). Contracts: the drawn line passes through every real
// point and never moves the zero line out of the box; the pointer always lands on a real point; stems grow from zero
// in the direction of their sign; win rate leaves pushes out; signs use the real minus and zero has none.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BREAK_EVEN_PCT, hitPct, linePath, nearestIndex, recordText, signed, stemLayout } from '../web/src/next/charts/geometry.js';

const pointsOf = d => [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)(?= C| L|$)/g)].map(m => [Number(m[1]), Number(m[2])]);

test('signed numbers use the real minus sign, a plus for gains and no sign for zero; missing is an em dash', () => {
  assert.equal(signed(45.18), '+45.2');
  assert.equal(signed(-2.22), '−2.2');
  assert.equal(signed(0.04), '0.0');
  assert.equal(signed(-0.04), '0.0');
  assert.equal(signed(Number.NaN), '—');
  assert.equal(recordText(229, 163, 3), '229–163–3');
  assert.equal(recordText(7, 3), '7–3');
});

test('the line passes through every point (curves only between them) and the area closes on the zero line', () => {
  const values = [0, 3.45, -1.2, 7.82, 45.18];
  const geo = linePath(values, { width: 320, height: 160, top: 12, bottom: 12 });
  const ends = pointsOf(geo.line);
  assert.equal(ends.length, values.length, 'one segment end per point');
  values.forEach((value, i) => {
    assert.ok(Math.abs(ends[i][0] - geo.x(i)) < 0.06, `x of point ${i}`);
    assert.ok(Math.abs(ends[i][1] - geo.y(value)) < 0.06, `y of point ${i}`);
  });
  assert.ok(geo.zeroY >= 12 && geo.zeroY <= 148, 'zero stays inside the plot');
  assert.ok(geo.area.endsWith(`L0 ${geo.zeroY} Z`), 'the area closes along zero');
  assert.ok(geo.y(45.18) < geo.y(0) && geo.y(-1.2) > geo.y(0), 'up is up');
  // All-positive data still shows the zero line at the bottom edge of the plot, not off the box.
  assert.equal(linePath([1, 2, 3], { height: 100, top: 10, bottom: 10 }).zeroY, 90);
  // A flat series does not divide by zero.
  assert.doesNotMatch(linePath([0, 0, 0]).line, /NaN|Infinity/);
});

test('the pointer always lands on a real point, clamped at both ends', () => {
  assert.equal(nearestIndex(0, 48), 0);
  assert.equal(nearestIndex(1, 48), 47);
  assert.equal(nearestIndex(0.5, 48), 24);
  assert.equal(nearestIndex(-3, 48), 0);
  assert.equal(nearestIndex(9, 48), 47);
  assert.equal(nearestIndex(Number.NaN, 48), 47);
  assert.equal(nearestIndex(0.5, 0), 0);
});

test('stems grow from zero toward their sign, in proportion, and a zero season still shows', () => {
  const { zeroY, stems } = stemLayout([2.74, -2.22, 10.95, 0]);
  assert.ok(stems[0].up && Math.abs(stems[0].top + stems[0].height - zeroY) < 1e-9, 'a gain ends at zero from above');
  assert.ok(!stems[1].up && Math.abs(stems[1].top - zeroY) < 1e-9, 'a loss starts at zero going down');
  assert.ok(Math.abs(stems[2].height / stems[0].height - 10.95 / 2.74) < 1e-9, 'heights are proportional');
  assert.equal(stems[3].height, 0.02);
  for (const stem of stems) assert.ok(stem.top >= 0 && stem.top + stem.height <= 1, 'inside the box');
});

test('win rate leaves pushes out, and break-even is 52.4% at −110', () => {
  assert.equal(hitPct(87, 57), 60.4);
  assert.equal(hitPct(0, 0), null);
  assert.equal(BREAK_EVEN_PCT, Math.round((1000 * 110) / 210) / 10);
});
