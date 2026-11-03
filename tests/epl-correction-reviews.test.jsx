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
    expect(render({ data: { available: true, reviews: [] } })).toContain('No EPL stat corrections are awaiting review');
    expect(render({ data: { available: true, reviews: [{ ...review, nextPickCount: 0 }] } })).toContain('Review its order against the corrected totals before drafting');
  });
});
