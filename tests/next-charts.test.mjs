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

test('smoothed segments never invent peaks, troughs or reversals between reported values', () => {
  // Equal endpoints used to overshoot beyond the highest value, even above the plot.
  const cases = [[0, 10, 10, 0], [0, -10, -10, 0], [0, 100, 101, 201], [0, -100, -101, -201], [0, 8, -2, 9, 9, -20], [4, 4, 4], [0, 3]];
  for (const values of cases) {
    const geo = linePath(values);
    const segments = [...geo.line.matchAll(/C([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)/g)].map(match => match.slice(1).map(Number));
    assert.equal(segments.length, values.length - 1);
    let previous = [0, Number(geo.line.match(/^M[\d.-]+ ([\d.-]+)/)[1])];
    for (const segment of segments) {
      const [x1, y1, x2, y2, x3, y3] = segment, [x0, y0] = previous;
      const lo = Math.min(y0, y3), hi = Math.max(y0, y3), direction = Math.sign(y3 - y0);
      let lastY = y0, lastX = x0;
      for (let step = 1; step <= 100; step++) {
        const t = step / 100, a = 1 - t;
        const y = a ** 3 * y0 + 3 * a ** 2 * t * y1 + 3 * a * t ** 2 * y2 + t ** 3 * y3;
        const x = a ** 3 * x0 + 3 * a ** 2 * t * x1 + 3 * a * t ** 2 * x2 + t ** 3 * x3;
        assert.ok(y >= lo - 1e-8 && y <= hi + 1e-8, `segment overshoot for ${values}`);
        assert.ok(direction === 0 ? Math.abs(y - y0) < 1e-8 : direction * (y - lastY) >= -1e-8, 'no extra direction change');
        assert.ok(x >= lastX, 'time only moves forward');
        lastY = y; lastX = x;
      }
      previous = [x3, y3];
    }
  }
});
