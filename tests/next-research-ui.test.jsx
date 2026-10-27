import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems } from './helpers/ui-markup.mjs';
vi.mock('../web/src/api.js', () => ({ linesApi: vi.fn() }));
const { ResearchCards, ResearchLeans, ResearchSources, ResearchStatus, researchLine } = await import('../web/src/next/research/ResearchCards.jsx');
const { default: ResearchChart } = await import('../web/src/next/research/ResearchChart.jsx');
const { researchExpiry, researchRefreshDue, withoutExpiredLeans } = await import('../web/src/next/research/useResearch.js');
const record = { wins: 20, losses: 9, pushes: 1, sample: 30, coverage: { from: '2025-01-01', to: '2026-10-20' } };
const candidates = ['a','b','c','fourth'].map(id => ({ id, title: `Synthetic ${id}`, market: 'spread', family: id, conditions: [], record, qualification: { qualifies: true, label: 'Consistent, not proven' }, applications: [{ gameId: 'SEA-DEN', direction: id === 'fourth' ? 'away' : 'home', whyApplies: [] }], series: { points: [{ from: '2025-01-01', to: '2026-10-20', wins: 20, losses: 9, pushes: 1, sample: 30, illustrativeUnits: 9.18 }], binned: true, selectedSample: 30 } }));
const now = '2026-10-21T12:00:00Z';
const game = { id: 'SEA-DEN', kickoff: '2026-10-22T12:00:00Z', spread: { visible: true, ownGuess: -4, savedReference: { value: -3, source: 'Synthetic', observedAt: now }, currentReference: { value: -2, source: 'Synthetic', observedAt: now }, guessGap: { value: 2, label: 'Difference from your expected market line' }, lean: { state: 'lean', direction: 'home', reasons: [], groups: [{ id: 'g1', role: 'supporting', memberIds: ['a'] },{ id: 'g4', role: 'alternative', memberIds: ['fourth'] }] } }, total: { visible: false } };
const data = { now, shortlist: ['a','b','c'], candidates, games: [game] };
const render = el => renderToStaticMarkup(<div className="gx">{el}</div>);
describe('shared research presentation', () => {
  it('caps the shared shortlist and labels canonical consistency separately', () => {
    const html = render(<ResearchCards data={data} ids={['a','b','c','fourth']} limit={3}/>);
    expect((html.match(/data-research-card=/g) || [])).toHaveLength(3);
    // D-55: the canonical consistency is the card's own pill ("Not proven"), apart from the selected period's dates;
    // its full sentence is in the card's ⓘ.
    expect(html).toContain('Not proven'); expect(html).toContain('2025-01-01 to 2026-10-20');
    expect(markupProblems(html)).toEqual([]);
  });
  it('shows team direction and yellow qualifying opposition outside the shortlist', () => {
    const html = render(<ResearchLeans data={data}/>);
    expect(html).toContain('DEN against the spread'); expect(html).toContain('Synthetic fourth');
    expect(html).toContain('Alternative'); expect(html).toContain('gx-r-alternative');
    expect(html).toContain('Difference from your expected market line');
    expect(html).toContain('DEN −2'); expect(html).toContain('Your expected market line');
    expect(html).toContain('Total research is locked');
  });
  it('renders closed markets without their forged evidence', () => {
    const html = render(<ResearchLeans data={{ ...data, games: [{ ...game, spread: { ...game.spread, visible: false } }] }}/>);
    expect(html).not.toContain('Synthetic fourth'); expect(html).not.toContain('DEN −2');
    expect(html).not.toContain('<time'); expect(html).not.toContain(now);
  });
  // D-55: the evidence table keeps the selected sample's bins; the chart drawn from the same series is the card's line.
  it('the accessible binned table and the card’s line reconcile with the same selected sample and zero baseline', () => {
    const html = render(<ResearchChart candidate={candidates[0]}/>);
    expect(html).toContain('Illustrative units at -110'); expect(html).toContain('chronological bins');
    expect(html).toContain('30'); expect(html).toContain('9.18');
    expect(markupProblems(html)).toEqual([]);
    const line = researchLine(candidates[0]);
    expect(line.values).toEqual([0, ...candidates[0].series.points.map(p => p.illustrativeUnits)]);
    const card = render(<ResearchCards data={data} ids={[candidates[0].id]} limit={1}/>);
    expect(card).toContain('data-zero-baseline'); expect(card).toContain('About this research');
    expect(markupProblems(card)).toEqual([]);
  });
  it('Trent remains a separate unavailable original-play feed', () => {
    const html = render(<ResearchSources trent={{ status: 'unavailable', plays: [] }}/>);
    expect(html).toContain('Source unavailable'); expect(html).toContain('Original plays'); expect(html).not.toContain('Synthetic');
  });
  it('shows reference instants in Pacific time while retaining their exact source timestamps', () => {
    const html = render(<ResearchLeans data={data}/>);
    expect(html).toContain('Wed Oct 21, 2026 · 5:00 AM PT');
    expect(html).toContain('dateTime="2026-10-21T12:00:00Z"');
    const winter = { ...game.spread, currentReference: { ...game.spread.currentReference, observedAt: '2026-11-02T01:30:00Z' } };
    const winterHtml = render(<ResearchLeans data={{ ...data, games: [{ ...game, spread: winter }] }}/>);
    expect(winterHtml).toContain('Sun Nov 1, 2026 · 5:30 PM PT');
    expect(markupProblems(html)).toEqual([]);
  });
  it('keeps posted, captured and checked times separate and does not invent a date-only clock time', () => {
    const source = { name: 'Fixture source', status: 'reviewed', checkedAt: '2026-10-21T12:00:00Z', plays: [{ id: 'fixture', event: 'Fixture game', selection: 'Fixture selection', originalTerms: 'Original fixture terms', postedAt: '2026-10-21T11:00:00Z', capturedAt: '2026-10-21T11:30:00Z', sourceUrl: 'https://example.test/source' }] };
    const html = render(<ResearchSources sources={[source]}/>);
    for (const time of ['4:00 AM PT', '4:30 AM PT', '5:00 AM PT']) expect(html).toContain(time);
    expect(html).toContain('Original fixture terms');
    expect(markupProblems(html)).toEqual([]);
    for (const checkedAt of [null, '', 'invalid', '2026-10-21T12:00:00', '2026-02-30']) {
      const unknown = render(<ResearchSources sources={[{ ...source, checkedAt, plays: [] }]}/>);
      expect(unknown).toContain('Time unavailable'); expect(unknown).not.toContain(' PT');
    }
    const dateOnly = render(<ResearchSources sources={[{ ...source, checkedAt: '2026-10-21', plays: [] }]}/>);
    expect(dateOnly).toContain('2026-10-21'); expect(dateOnly).toContain('time unavailable'); expect(dateOnly).not.toContain(' PT');
  });
  it('pairs cumulative units with cumulative records across winning, losing and push bins', () => {
    const points = [
      { from: '2025-09-01', to: '2025-09-30', wins: 2, losses: 1, pushes: 1, sample: 4, illustrativeUnits: 0.82 },
      { from: '2025-10-01', to: '2025-10-31', wins: 0, losses: 2, pushes: 0, sample: 2, illustrativeUnits: -1.18 },
      { from: '2025-11-01', to: '2025-11-01', wins: 1, losses: 0, pushes: 0, sample: 1, illustrativeUnits: -0.27 },
    ];
    const candidate = { ...candidates[0], series: { points, binned: true, selectedSample: 7 } };
    const line = researchLine(candidate);
    expect(line.values).toEqual([0, 0.82, -1.18, -0.27]);
    expect(line.tip(0)).toEqual({ value: '0.0 U', label: 'Start, 2025-09-01' });
    expect(line.tip(2).label).toContain('2–3–1');
    expect(line.tip(1).label).toBe('2–1–1 total · through 2025-09-30');
    expect(line.tip(2)).toEqual({ value: '−1.2 U', label: '2–3–1 total · through 2025-10-31' });
    expect(line.tip(3)).toEqual({ value: '−0.3 U', label: '3–3–1 total · through 2025-11-01' });
    const html = render(<ResearchChart candidate={candidate}/>);
    expect(html).toContain('Period W-L-P');
    expect(html).toContain('Total units');
    expect(html).toContain('0-2-0'); // The period table retains its own record, not the accumulated record.
    expect(html).toContain('-1.18'); // No recalculation or rounding of the supplied units.
    expect(markupProblems(html)).toEqual([]);
  });
  it('shows source-reported original terms, unknown prices and correction ancestry without granting consistency', () => {
    const html = render(<ResearchSources trent={{ status: 'reviewed', plays: [{ id: 'synthetic-revision', previousRevision: 'synthetic-original', event: 'Synthetic event', selection: 'Synthetic original selection', originalTerms: 'Synthetic unchanged terms', postedLine: null, price: null, sourceUrl: 'https://x.com/bookitwithtrent/status/1', status: 'corrected' }] }}/>);
    expect(html).toContain('Source-reported · not verified'); expect(html).toContain('Odds: Unknown');
    expect(html).toContain('synthetic-original'); expect(html).toContain('Original source post');
    expect(html).not.toContain('Supports the lean'); expect(markupProblems(html)).toEqual([]);
  });
  it('retains a no-clear-lean reason and treats groups as yellow mixed evidence', () => {
    const html = render(<ResearchLeans data={{ ...data, games: [{ ...game, spread: { ...game.spread, lean: { ...game.spread.lean, label: 'No clear lean', state: 'no-clear-lean', reasons: ['balanced_groups'] } } }] }}/>);
    expect(html).toContain('Qualifying evidence groups are evenly split.'); expect(html).toContain('No clear lean');
    expect(html).not.toContain('gx-r-support');
  });
  it('explains sample overlap in words rather than exposing internal record objects', () => {
    const html = render(<ResearchLeans data={{ ...data, games: [{ ...game, spread: { ...game.spread, lean: { ...game.spread.lean, groups: [{ id: 'overlap', memberIds: ['a', 'b'], overlaps: [{ a: 'a', b: 'b', count: 15, smaller: 30, reasons: ['family', 'sample_overlap'] }] }] } } }] }}/>);
    expect(html).toContain('15 of 30 games in the smaller sample');
    expect(html).toContain('same situation family'); expect(html).not.toContain('&quot;count&quot;');
  });
  it('uses decorative loading shapes without displaying data or recovery controls before the read finishes', () => {
    for (const compact of [false, true]) {
      const html = render(<ResearchStatus read={{ status: 'loading' }} compact={compact}/>);
      expect(html).toContain(`data-skeleton="${compact ? 'lines' : 'panels'}"`);
      expect(html).toContain('role="status"'); expect(html).toContain('Loading research…');
      expect(html).toContain('aria-hidden="true"'); expect(html).not.toContain('<button');
      expect(html).not.toContain('<svg'); expect(markupProblems(html)).toEqual([]);
    }
    expect(render(<ResearchStatus read={{ status: 'ready' }}/>)).not.toContain('data-skeleton');
  });
  it.each([[401, 'Sign in again'], [404, 'not published'], [503, 'temporarily unavailable'], [500, 'could not be loaded']])('explains read status %i', (status, copy) => {
    const html = render(<ResearchStatus read={{ status: 'error', error: { status } }}/>);
    expect(html).toContain(copy); expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('role="alert"'); expect(html).toContain('Try research again');
    expect(html).not.toContain('data-skeleton');
  });
  it('expires from authoritative server time using the request-start monotonic baseline', () => {
    expect(researchExpiry(data)).toBe(Date.parse(now) + 12 * 3600000);
    const expired = withoutExpiredLeans(data, 12 * 3600000 + 1);
    expect(expired.games[0].spread.lean.state).toBe('unavailable');
    expect(expired.games[0].total).toEqual({ visible: false });
    expect(data.games[0].spread.lean.state).toBe('lean');
  });
  it('expires at the earlier kickoff and suppresses a response that spent its remaining lifetime on the network', () => {
    const short = { ...data, games: [{ ...game, kickoff: '2026-10-21T12:00:01Z' }] };
    expect(researchExpiry(short)).toBe(Date.parse(now) + 1000);
    expect(withoutExpiredLeans(short, 1100).games[0].spread.lean.state).toBe('unavailable');
    expect(withoutExpiredLeans(short, 500).games[0].spread.lean.state).toBe('lean');
  });
  it('refreshes a fully locked market at kickoff so reveal can change without focus', () => {
    const closed = { ...data, games: [{ ...game, spread: { visible: false }, total: { visible: false } }] };
    expect(researchRefreshDue(closed)).toBe(Date.parse(game.kickoff));
    expect(researchExpiry(closed)).toBe(Infinity);
  });
});


it('links evidence dates to cumulative endpoints and leaves the starting baseline without a period selection', () => {
  for (const index of [0, 1]) {
    const html = render(<><div id="fixture-chart"/><ResearchChart candidate={candidates[0]} selection={{ index, chartId: 'fixture-chart', onSelect() {} }}/></>);
    expect(html).toContain('Show period 1 ending 2026-10-20 on chart');
    expect(html).toContain('aria-controls="fixture-chart"');
    expect(html).toContain(`aria-pressed="${index === 1}"`);
    expect(html).toContain(`data-selected="${index === 1}"`);
    expect(html).toContain('Period W-L-P'); expect(html).toContain('20-9-1');
    expect(markupProblems(html)).toEqual([]);
  }
  const unlinked = render(<ResearchChart candidate={candidates[0]}/>);
  expect(unlinked).not.toContain('aria-pressed');
  expect(unlinked).not.toContain('data-selected');
});


it('gives same-day periods distinct chart-control names', () => {
  const candidate = { ...candidates[0], series: { ...candidates[0].series, points: [candidates[0].series.points[0], candidates[0].series.points[0]] } };
  const html = render(<><div id="same-day-chart"/><ResearchChart candidate={candidate} selection={{ index: 2, chartId: 'same-day-chart', onSelect() {} }}/></>);
  expect(html).toContain('Show period 1 ending 2026-10-20 on chart');
  expect(html).toContain('Show period 2 ending 2026-10-20 on chart');
  expect((html.match(/aria-pressed="true"/g) || [])).toHaveLength(1);
  expect(markupProblems(html)).toEqual([]);
});
