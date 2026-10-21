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
  gap: 1, gapPercent: 10, denominator: 10, side: 'away', offer: null,
  evaluations: {
    away: { side: 'away', advantage: 1, color: 'green', label: 'Favorable' },
    home: { side: 'home', advantage: -1, color: 'red', label: 'Against your guess' },
  },
};

describe('compact recommendation', () => {
  it('shows comparable percentage and point gaps in a native disclosure', () => {
    const html = renderToStaticMarkup(<RecommendationCard row={row} season={2099} week={5} now={Date.parse(observedAt)} />);
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('10.0% gap');
    expect(html).toContain('1 pt gap');
    expect(html).toContain('NYJ at BUF');
    expect(html).toContain('Latest consensus');
  });

  it('labels small-spread normalization and keeps both sides in expanded detail', () => {
    const html = renderToStaticMarkup(<RecommendationCard row={{ ...row, reference: { ...row.reference, value: -2 }, denominator: 3 }} season={2099} week={5} now={Date.parse(observedAt)} />);
    expect(html).toContain('3-point minimum spread');
    expect(html).toContain('Favorable');
    expect(html).toContain('Against your guess');
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
