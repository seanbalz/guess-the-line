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
  // D-83 (Sean, November 11, 2026: "Yes, import wins"): a confirmed import kept the order; both orders are shown.
  const kept = ['Nemo', 'Cullen', 'Adam', 'Sean', 'Evan', 'Mark', 'Steven', 'Darin'];
  const candidate = ['Cullen', 'Nemo', 'Adam', 'Sean', 'Evan', 'Mark', 'Steven', 'Darin'];
  const imported = { ...review, nextPickCount: 0, keptOrder: kept, candidateOrder: candidate };
  it('says the confirmed import kept the order, lists both orders and how to use the correction, still read-only', () => {
    const html = render({ data: { available: true, reviews: [imported] } });
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('Tuesday’s totals would put Cullen first. Because you confirmed an import, MW10 keeps Nemo first.');
    expect(html).toContain('record it as a correction before the first MW10 pick');
    expect(html).toContain('Premier League weekly scores');
    expect(html).not.toContain('Review its order against the corrected totals');
    const lists = [...html.matchAll(/<ol>(.*?)<\/ol>/g)].map(m => [...m[1].matchAll(/<li>([^<]*)<\/li>/g)].map(li => li[1]));
    expect(lists).toEqual([kept, candidate]);
    for (const text of ['MW10 pick order', 'Kept by your import', 'Tuesday’s totals']) expect(html).toContain(text);
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<form\b|Apply correction|Reorder|Acknowledge/);
  });
  it('keeps the picks sentence once a pick exists and shows unknown managers as —', () => {
    const html = render({ data: { available: true, reviews: [{ ...imported, nextPickCount: 2, keptOrder: [...kept.slice(0, 7), null] }] } });
    expect(html).toContain('MW10 has 2 recorded picks. Its stored picks and draft order are preserved.');
    expect(html).not.toContain('record it as a correction');
    expect(html).toContain('<li>—</li>');
    expect(render({ data: { available: true, reviews: [{ ...imported, keptOrder: null, candidateOrder: null }] } })).not.toContain('pick order');
  });
});
