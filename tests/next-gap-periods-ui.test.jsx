import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GapRecord } from '../web/src/next/bets/GapRecord.jsx';
import { GapPeriodControl } from '../web/src/next/bets/GapPeriodControl.jsx';
const state = vi.hoisted(() => ({ value: null }));
vi.mock('../web/src/next/bets/useGapPeriod.js', () => ({ useGapPeriod: () => state.value }));
const weeks = [{ season: 2025, week: 18 }, { season: 2026, week: 5 }, { season: 2026, week: 6 }];
const board = { games: [] };
const record = { wins: 2, losses: 3, pushes: 1, netUnits: -1.18, roi: -19.7, large: { wins: 2, losses: 3, pushes: 1 }, even: 2, notGraded: { noLine: 1, noFinal: 2 }, graded: [] };
const render = (patch = {}) => {
  state.value = { period: 'all', weeks, title: 'All time', coverage: 'All retained weeks · 3 weeks', status: 'ready', board, record, setPeriod: vi.fn(), applyRange: vi.fn(), retry: vi.fn(), ...patch };
  return renderToStaticMarkup(<GapRecord record={record} board={board} season={2026} week={6}/>);
};
describe('approved gap period controls', () => {
  it('adds labelled period choices while keeping the count-weighted win rate and explicit coverage', () => {
    const html = render();
    for (const text of ['Record period', 'This season', 'All time', 'Custom range', 'All retained weeks · 3 weeks', '40.0%', '2–3–1 W–L–P']) expect(html).toContain(text);
    expect(html).toContain('value="all" selected');
    expect(html).toContain('3 not graded');
  });
  it('Custom presents separate labelled endpoints and Apply; it does not turn fields into recommendation-week controls', () => {
    const html = renderToStaticMarkup(<GapPeriodControl period="custom" weeks={weeks} onPeriod={() => {}} onApply={() => {}}/>);
    for (const text of ['From', 'To', 'Apply range', '2025 · W18', '2026 · W6']) expect(html).toContain(text);
    expect(html).not.toContain('Recommendation week');
    expect((html.match(/<select/g) || []).length).toBe(3);
  });
  it.each(['loading', 'error', 'choose'])('does not display stale figures when status is %s', status => {
    const html = render({ status, error: 'One week failed' });
    expect(html).not.toContain('40.0%');
    expect(html).not.toContain('2–3–1');
    expect(html).toContain('Record period');
    if (status === 'error') { expect(html).toContain('role="alert"'); expect(html).toContain('Retry gap records'); }
  });
  it('empty period explicitly explains the lack of graded games', () => {
    expect(render({ record: { ...record, wins: 0, losses: 0, pushes: 0 } })).toContain('No finished games with a gap yet.');
  });
});
