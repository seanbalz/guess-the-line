import test from 'node:test';
import assert from 'node:assert/strict';
import * as candidates from '../shared/trends-research-candidates.mjs';
import { researchRecord, selectResearchPeriod } from '../shared/trends-research.mjs';

const now = '2026-11-07T12:00:00.000Z';
const row = (i, season, date, result = 1, odds = -110) => ({ gameId: `sample-${i}`, season, date: `${date}T18:00:00.000Z`, result, odds });
const records = [row(1, 2024, '2024-12-29', 1, 125), row(2, 2024, '2025-01-05', -1, -105),
  row(3, 2025, '2025-09-01', 0, null), row(4, 2025, '2026-01-04', 1, -115), row(5, 2026, '2026-09-01', 1, -110),
  row(6, 2026, '2026-12-01'), row(7, 2026, '2026-02-30'), row(8, 2026, '2026-10-01', 99)];

test('season summaries use the validated selected NFL season sample and canonical price/rounding math', () => {
  assert.equal(typeof candidates.researchSeasonSummaries, 'function');
  for (const period of candidates.RESEARCH_PERIODS) {
    const record = researchRecord(selectResearchPeriod(records, { now, season: 2026, period }));
    const seasons = candidates.researchSeasonSummaries(record);
    assert.equal(seasons.reduce((n, s) => n + s.sample, 0), record.sample);
    for (const season of seasons) {
      const exact = researchRecord(record.records.filter(r => r.season === season.season));
      assert.deepEqual(season, Object.fromEntries(['season', 'sample', 'wins', 'losses', 'pushes', 'illustrativeUnits', 'actualUnits', 'priceCoverage'].map(k => [k, k === 'season' ? season.season : exact[k]])));
    }
    assert.ok(!JSON.stringify(seasons).includes('gameId'));
  }
  const all = candidates.researchSeasonSummaries(researchRecord(selectResearchPeriod(records, { now, season: 2026, period: 'all' })));
  assert.deepEqual(all.map(s => [s.season, s.sample]), [[2024, 2], [2025, 2], [2026, 1]]);
  assert.equal(all[0].actualUnits, 0.25);
  assert.equal(all[1].actualUnits, null);
  assert.equal(all[1].priceCoverage.priced, 1);
  assert.equal(all[1].illustrativeUnits, 0.9091);
  assert.deepEqual(candidates.researchSeasonSummaries(researchRecord([])), []);
});

test('row curves merge adjacent exact bins without losing counts, endpoints, zero units or cross-year samples', () => {
  assert.equal(typeof candidates.compactResearchRowSeries, 'function');
  const rows = Array.from({ length: 121 }, (_, i) => row(i, i < 70 ? 2024 : 2025, new Date(Date.UTC(2024, 10, i + 1)).toISOString().slice(0, 10), [1, -1, 0][i % 3], i === 2 ? null : -110));
  const record = researchRecord(rows), series = candidates.compactResearchSeries(record);
  const compact = candidates.compactResearchRowSeries(series);
  assert.ok(series.points.some(p => new Date(p.from).getUTCFullYear() !== new Date(p.to).getUTCFullYear()));
  assert.ok(compact.points.length <= 12); assert.equal(compact.selectedSample, 121);
  assert.deepEqual(compact.points.at(-1), { ...compact.points.at(-1), to: series.points.at(-1).to, illustrativeUnits: record.illustrativeUnits, actualUnits: null });
  for (const key of ['sample', 'wins', 'losses', 'pushes']) assert.equal(compact.points.reduce((n, p) => n + p[key], 0), key === 'sample' ? record.sample : record[key]);
  let consumed = 0;
  for (const p of compact.points) {
    const exact = rows.slice(consumed, consumed + p.sample); consumed += p.sample;
    assert.equal(p.from, exact[0].date); assert.equal(p.to, exact.at(-1).date);
    assert.equal(p.illustrativeUnits, record.chart[consumed - 1].illustrativeUnits);
  }
  const zero = candidates.compactResearchRowSeries(candidates.compactResearchSeries(researchRecord([row(1, 2025, '2025-09-01', 0)])));
  assert.equal(zero.points[0].illustrativeUnits, 0);
  assert.deepEqual(candidates.compactResearchRowSeries(candidates.compactResearchSeries(researchRecord([]))).points, []);
});
