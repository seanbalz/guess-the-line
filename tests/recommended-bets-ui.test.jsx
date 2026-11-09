import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecommendationCard } from '../web/src/VirtualUnits.jsx';
import { RecommendationTrendDetail, recommendationTrendCards } from '../web/src/RecommendationTrends.jsx';
import week7 from '../shared/trends/2026-week-07.json';

vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), date: value => value, signed: value => String(value) }));
vi.mock('../web/src/trendsLoaders.js', () => ({ loadTrendWeek: vi.fn() }));

const observedAt = '2099-10-08T15:00:00.000Z';
const row = {
  game: { id: 'NYJ-BUF', away: 'NYJ', home: 'BUF', awayCode: 'NYJ', homeCode: 'BUF', kickoff: '2099-10-08T20:00:00.000Z' },
  market: 'spread', guess: -11, reference: { value: -10, observedAt, source: 'Named-book median', books: 3 },
  gap: 1, gapScore: 10.685865858279652, side: 'home', offer: null,
  evaluations: {
    home: { side: 'home', advantage: 1, color: 'yellow', label: 'Small gap' },
    away: { side: 'away', advantage: -1, color: 'yellow', label: 'Small gap' },
  },
};

describe('compact recommendation', () => {
  it('shows historical size and point gaps in a native disclosure without implying probability', () => {
    const html = renderToStaticMarkup(<RecommendationCard row={row} season={2099} week={5} now={Date.parse(observedAt)} />);
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('Size 10.7/100');
    expect(html).toContain('Historical gap size 10.7 out of 100');
    expect(html).toContain('1 pt gap');
    expect(html).toContain('NYJ at BUF');
    expect(html).toContain('Latest consensus');
  });

  it('keeps both directions and the Large label without a small-line denominator', () => {
    const large = { ...row, guess: -16, reference: { ...row.reference, value: -2 }, gap: 14, gapScore: 75.8,
      evaluations: { home: { advantage: 14, color: 'green', label: 'Large gap in your direction' }, away: { advantage: -14, color: 'red', label: 'Large gap against your guess' } } };
    const html = renderToStaticMarkup(<RecommendationCard row={large} season={2099} week={5} now={Date.parse(observedAt)} />);
    expect(html).not.toContain('3-point minimum spread');
    expect(html).toContain('Large gap in your direction');
    expect(html).toContain('Large gap against your guess');
  });

  it('uses actual historical record, sample, period and credit without forecasting', () => {
    const html = renderToStaticMarkup(<RecommendationTrendDetail trend={{ status: 'ready', reference: 'Historical schedule through 2026', cards: [{
      key: 'past', title: 'Past home games', record: '8–4–0', sample: '12 games', years: [2018, 2026],
    }] }}/>);
    expect(html).toContain('8–4–0');
    expect(html).toContain('12 games');
    expect(html).toContain('2018–2026');
    expect(html).toContain('not forecasts');
    expect(html).toContain('CC BY 4.0');
  });

  it('shows only trends for the recommended market from the published week', () => {
    const spread = recommendationTrendCards(week7, 'PIT-NO', 'spread', -3);
    const total = recommendationTrendCards(week7, 'PIT-NO', 'total', 45);
    expect(spread.every(card => week7.cards[card.id].market.endsWith('_ats'))).toBe(true);
    expect(total.length).toBeGreaterThan(0);
    expect(total.every(card => week7.cards[card.id].market.startsWith('total'))).toBe(true);
    expect(recommendationTrendCards(week7, 'NOT-A-GAME', 'total', 45)).toEqual([]);
  });
});
