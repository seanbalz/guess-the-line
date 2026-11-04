// D-69 step 4: Bets › Recommended (research assessments) drawn. Contracts: its title is "Recommended", focusable for the
// navigation that opens it; each assessment is a picture row: the game's marks first, the assessment, the price on the
// right over its assessment word, with a stable id; the spoken name keeps the title and the label; no "Your guess vs.
// market" cross-link. The research read is a stand-in.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ assessments: null }));
vi.mock('../web/src/api.js', () => ({ linesApi: vi.fn(() => new Promise(() => {})) }));
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ go: vi.fn(), state: { views: { bets: { view: 'research' } } } }) }));
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: () => ({ app: { accountId: 'luke' } }) }));
vi.mock('../web/src/next/research/useAssessments.js', () => ({ useAssessments: () => state.assessments }));
const { default: ResearchAssessments } = await import('../web/src/next/research/Assessments.jsx');

const assessment = { id: 'a1', routeId: 'r-0123456789abcdef01234567', gameId: 'SEA-DEN', title: 'Synthetic Receiver over 65.5 yards', label: 'Research lean', color: 'yellow',
  hasConflicts: true, quote: { odds: -115, source: 'FanDuel', observedAt: '2099-10-08T15:00:00Z' }, selection: { market: 'prop' }, reasons: [], evidence: [], evidenceGroups: 1 };
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));

describe('Bets › Recommended', () => {
  state.assessments = { status: 'ready', reload: vi.fn(), data: { season: 2026, week: 9, assessments: [assessment], statistics: [], sources: [], coverage: null } };
  const html = renderToStaticMarkup(<div className="gx"><ResearchAssessments/></div>);
  it('is titled Recommended, focusable, with no cross-link to Your gap', () => {
    expect(markupProblems(html)).toEqual([]);
    const h1 = nodes(html).find(n => n.tag === 'h1');
    expect([textOf(h1), h1.attrs.tabindex, 'data-route-focus' in h1.attrs]).toEqual(['Recommended', '-1', true]);
    expect(html).not.toContain('Your guess vs. market');
  });
  it('draws each assessment as a picture row: marks first, the price over its word, a stable id', () => {
    const row = nodes(html).find(n => n.tag === 'button' && n.attrs?.['data-assessment']);
    expect(row.attrs.id).toBe('gx-b-ra-r-0123456789abcdef01234567');
    expect(nameFrom(row)).toBe('Synthetic Receiver over 65.5 yards Research lean, opposing evidence present');
    expect(/\bgx-prow-pic\b/.test(row.children[0].attrs?.class ?? '')).toBe(true);
    expect([...walk(row.children[0])].filter(n => /\bgx-team(?![\w-])/.test(n.attrs?.class ?? '')).length).toBe(2);
    expect(textOf(nodes(html).find(n => /\bgx-prow-value\b/.test(n.attrs?.class ?? '')))).toBe('−115');
    expect(textOf(nodes(html).find(n => /\bgx-prow-word\b/.test(n.attrs?.class ?? '')))).toBe('Research lean');
  });
});
