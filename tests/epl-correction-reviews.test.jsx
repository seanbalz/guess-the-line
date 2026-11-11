import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems } from './helpers/ui-markup.mjs';
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn() }));
const { EplCorrectionReviewsView } = await import('../web/src/next/me/commissioner/EplCorrectionReviews.jsx');
const review = { week: 9, nextWeek: 10, nextPickCount: 1, totalsComplete: true,
  original: { capturedAt: '2026-11-03T02:00:00Z' }, corrected: { capturedAt: '2026-11-03T20:05:00Z' },
  changes: [{ name: 'Sean', before: { points: 500.25, against: 400 }, after: { points: 501.25, against: 400 }, pointsChange: 1, againstChange: 0 }] };
const render = props => renderToStaticMarkup(<div className="gx"><EplCorrectionReviewsView {...props}/></div>);

describe('read-only EPL correction reviews', () => {
  it('shows the flag, separate original/corrected totals and source capture times with accessible markup', () => {
    const html = render({ data: { available: true, reviews: [review] } });
    expect(markupProblems(html)).toEqual([]);
    for (const text of ['MW9 stat correction needs review', 'stored picks and draft order are preserved', '500.25', '501.25', '+1', 'original capture', 'recheck', 'PT']) expect(html).toContain(text);
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).toContain('Refresh reviews');
    expect(html).not.toMatch(/<form\b|Apply correction|Reorder|Acknowledge/);
  });
  it('preserves missing totals and distinguishes unavailable, error, stale and empty states', () => {
    const missing = { ...review, totalsComplete: false, changes: [{ ...review.changes[0], after: { points: null, against: 400 }, pointsChange: null }] };
    const html = render({ data: { available: true, reviews: [missing] } });
    expect(html).toContain('Missing values are shown as —');
    expect(html).toContain('500.25 → — (—)');
    expect(render({ data: { available: false, reviews: [] } })).toContain('checks are not available yet');
    expect(render({ failed: true })).toContain('could not load');
    expect(render({ denied: true })).toContain('Only the Community commissioner can view these corrections');
    expect(render({ data: { available: true, reviews: [review] }, failed: true })).toContain('Showing the last loaded reviews');
    expect(render({ data: { available: true, reviews: [] } })).toContain('No Premier League stat corrections are awaiting review');
    expect(render({ data: { available: true, reviews: [{ ...review, nextPickCount: 0 }] } })).toContain('Review its order against the corrected totals before drafting');
  });
  // D-83 (Sean, November 11, 2026: "Yes, import wins"): a confirmed import kept the order at the recheck. gtl-api compares
  // the live order with it (orderState) and the card says what that means, never that the import set the order.
  const kept = ['Nemo', 'Cullen', 'Adam', 'Sean', 'Evan', 'Mark', 'Steven', 'Darin'];
  const candidate = ['Cullen', 'Nemo', 'Adam', 'Sean', 'Evan', 'Mark', 'Steven', 'Darin'];
  const other = ['Adam', 'Nemo', 'Cullen', 'Sean', 'Evan', 'Mark', 'Steven', 'Darin'];
  const imported = (orderState, currentOrder, extra = {}) => ({ ...review, nextPickCount: 0, orderState, currentOrder, candidateOrder: candidate, ...extra });
  const lists = html => [...html.matchAll(/<ol>(.*?)<\/ol>/g)].map(m => [...m[1].matchAll(/<li>([^<]*)<\/li>/g)].map(li => li[1]));
  const readOnly = html => {
    expect(markupProblems(html)).toEqual([]);
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<form\b|Apply correction|Reorder|Acknowledge/);
    expect(html, 'the import does not always set the order (pending_results)').not.toContain('Kept by your import');
    expect(html).not.toContain('Review its order against the corrected totals');
  };
  const use = 'To use Tuesday’s totals, add a new Sleeper Matchups screenshot in Premier League weekly scores and record it as a correction while the MW10 draft is open, before its first pick or kickoff.';
  it('kept: says the confirmed import kept the order, lists the current and Tuesday’s orders and how to use the correction', () => {
    const html = render({ data: { available: true, reviews: [imported('kept', kept)] } });
    readOnly(html);
    expect(html).toContain('Tuesday’s totals would put Cullen first. Because you confirmed an import, MW10 keeps Nemo first.');
    expect(html).toContain(use);
    expect(lists(html)).toEqual([kept, candidate]);
    for (const text of ['MW10 pick order', 'Current MW10 order', 'Tuesday’s totals']) expect(html).toContain(text);
  });
  it('adopted: a later import set Tuesday’s order, so the card shows that order and asks for nothing', () => {
    const html = render({ data: { available: true, reviews: [imported('adopted', candidate)] } });
    readOnly(html);
    expect(html).toContain('An import after Tuesday’s recheck set the order Tuesday’s totals give. MW10 now has Cullen first. Nothing else is needed.');
    expect(html).not.toContain('Because you confirmed an import');
    expect(html).not.toMatch(/To use Tuesday|record it as a correction/);
    expect(lists(html)).toEqual([candidate]);
    expect(html).toContain('Current MW10 order');
  });
  it('changed: the order moved to neither, so the card shows the current and Tuesday’s orders and how to use the correction', () => {
    const html = render({ data: { available: true, reviews: [imported('changed', other)] } });
    readOnly(html);
    expect(html).toContain('MW10’s order changed after Tuesday’s recheck. It now has Adam first. Tuesday’s totals would put Cullen first.');
    expect(html).not.toContain('Because you confirmed an import');
    expect(html).toContain(use);
    expect(lists(html)).toEqual([other, candidate]);
  });
  it('keeps the picks sentence once a pick exists, shows unknown managers as — and ignores an unknown state', () => {
    for (const [state, order] of [['kept', kept], ['changed', other], ['adopted', candidate]]) {
      const html = render({ data: { available: true, reviews: [imported(state, [...order.slice(0, 7), null], { nextPickCount: 2 })] } });
      expect(html).toContain('MW10 has 2 recorded picks. Its stored picks and draft order are preserved.');
      expect(html).not.toContain('record it as a correction');
      expect(html).toContain('<li>—</li>');
    }
    for (const extra of [{ orderState: null }, { orderState: 'invented' }, { currentOrder: null }, { candidateOrder: null }])
      expect(render({ data: { available: true, reviews: [imported('kept', kept, extra)] } })).not.toContain('pick order');
  });
});
