import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { decode, markupProblems } from './helpers/ui-markup.mjs';
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(async () => ({})) }));
const { cloudApi } = await import('../web/src/api.js');
const { eplApi } = await import('../web/src/next/epl/api.js');
const { BetsList, RecommendationCard, BETS_EXPLANATION, CONCERN_COPY } = await import('../web/src/next/epl/bets/EplBets.jsx');
const { default: EplBets } = await import('../web/src/next/epl/bets/EplBets.jsx');

const text = html => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const markup = element => renderToStaticMarkup(<div className="gx">{element}</div>);
const item = patch => ({ eventId: 'e1', home: 'ARS', away: 'CHE', commenceTime: '2099-01-02T15:00:00.000Z', market: 'three_way', outcome: 'draw', club: null, price: 230,
  lockedAt: '2099-01-01T10:00:00.000Z', referencePrice: 250, referenceObservedAt: '2099-01-01T10:00:00.000Z', latestPrice: 260, latestObservedAt: '2099-01-02T09:00:00.000Z',
  books: 3, gap: 30, firstPrice: 240, firstObservedAt: '2099-01-01T09:00:00.000Z', observations: 3, source: 'Median of DraftKings, FanDuel and BetMGM',
  trend: { from: 240, to: 260, observations: 3, change: 20, direction: 'longer' }, concerns: [], ...patch });
const reply = patch => ({ available: true, reason: null, season: 2099, week: 9, ownerId: 'owner-1', asOf: '2099-01-02T10:00:00.000Z', locked: 3, unpriced: 1, withoutGap: 0, items: [], ...patch });

describe('EPL Bets recommendations', () => {
  it('shows market, outcome, guess, comparison, source/time, gap and the probability distinction', () => {
    const html = markup(<RecommendationCard id="r" item={item()}/>), words = text(html);
    for (const part of ['Pick: Draw · 3-way moneyline', 'Your locked guess', '+230', 'Latest price', '+260', '30', 'points in your favor',
      'Median of DraftKings, FanDuel and BetMGM · 3 books', 'PT', '+240 first stored → +260 latest · 20 points longer']) expect(words).toContain(part);
    expect(markupProblems(html)).toEqual([]);
    const list = text(markup(<BetsList data={reply({ items: [item()] })} onReload={() => {}}/>));
    expect(list).toContain(BETS_EXPLANATION); expect(list).toContain('not an estimated chance'); expect(list).toContain('ordered by favorable gap only');
  });
  it('keeps the server order and shows every concern as a flag without hiding a card', () => {
    const items = [item({ eventId: 'b', gap: 50, latestPrice: 280, market: 'draw_no_bet', outcome: 'home', club: 'ARS', concerns: ['few_books', 'stale_price'] }), item({ eventId: 'a', concerns: ['large_gap', 'shortening', 'reference_pending', 'kickoff_soon'] })];
    const html = markup(<BetsList data={reply({ items, locked: 3 })} onReload={() => {}}/>), words = text(html);
    expect(words.indexOf('Pick: Arsenal · Draw no bet')).toBeLessThan(words.indexOf('Pick: Draw · 3-way moneyline'));
    for (const copy of Object.values(CONCERN_COPY)) expect(words).toContain(copy);
    expect(html.match(/<article/g)).toHaveLength(2); expect(words).toContain('1 without a stored price yet');
    expect(markupProblems(html)).toEqual([]);
  });
  it('explains empty, unlinked and unavailable states without inventing a recommendation', () => {
    expect(text(markup(<BetsList data={reply({ withoutGap: 2, unpriced: 1 })} onReload={() => {}}/>))).toContain('No favorable gaps right now.');
    expect(text(markup(<BetsList data={reply({ locked: 0, unpriced: 0 })} onReload={() => {}}/>))).toContain('Lock moneyline guesses on upcoming matches');
    expect(text(markup(<BetsList data={reply({ ownerId: null, locked: 0, unpriced: 0 })} onReload={() => {}}/>))).toContain('Link an FEPL manager');
    expect(text(markup(<BetsList data={{ available: false, reason: 'schema_unavailable', items: [] }}/>))).toContain('in this app version yet');
    expect(text(markup(<BetsList data={{ available: false, reason: 'prices_not_verified' }}/>))).toContain('aren’t available right now');
  });
  it('reads bets/read as a read (retries allowed, never a replayed write) and first draws only loading', async () => {
    cloudApi.mockClear(); await eplApi('bets/read');
    expect(cloudApi.mock.calls.map(call => [call[0], call[2].save])).toEqual([['epl/bets/read', false]]);
    // The first render is the loading state; nothing account-specific is drawn before this account's own reply.
    expect(text(markup(<EplBets api={vi.fn()} accountId="a1"/>))).toContain('Loading EPL Bets');
  });
});
