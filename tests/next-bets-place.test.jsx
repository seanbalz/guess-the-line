// Bets › Virtual › Your picks (redesign stages 43 and 44). Contracts: a market's prices show only where /bets/read opens
// it for the viewer, and a closed market draws a lock sentence with no line anywhere in the markup; a started game takes
// no bet; your saved bet shows in full with "Price moved" when the offer for your side changed; the slip sends exactly
// the offered terms, `expected: null` for a new bet and your saved terms for an edit; units step in halves.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems } from './helpers/ui-markup.mjs';

vi.mock('../web/src/api.js', () => ({ betsApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));

const { PLACE_COPY, placeBoard, placeRequest, slipEntries, slipKey, stepUnits } = await import('../web/src/next/bets/place.js');
const { PlaceGame } = await import('../web/src/next/bets/PlaceBets.jsx');

const LUKE = '00000000-0000-4000-8000-000000000003', TROY = '00000000-0000-4000-8000-000000000002';
const offer = (side, line, odds = -110, source = 'DraftKings') => ({ book: source.toLowerCase(), source, side, line, odds, observedAt: '2026-10-28T15:00:00.000Z', collectedAt: '2026-10-28T15:00:01.000Z' });
const data = {
  season: 2026, week: 8, published: true, now: '2026-10-28T18:00:00.000Z', leagueId: null, revision: 0,
  roster: [{ userId: LUKE, displayName: 'Luke' }, { userId: TROY, displayName: 'Troy' }],
  games: [
    { id: 'SEA-DEN', homeCode: 'DEN', awayCode: 'SEA', kickoff: '2026-11-01T20:05:00.000Z' },
    { id: 'HOU-JAX', homeCode: 'JAX', awayCode: 'HOU', kickoff: '2026-10-28T17:00:00.000Z' },
  ],
  markets: {
    'SEA-DEN': { spread: { visible: true, offers: { home: offer('home', -3.5), away: offer('away', 3.5, -105, 'FanDuel') } }, total: { visible: false } },
    'HOU-JAX': { spread: { visible: true, offers: { home: offer('home', -1), away: offer('away', 1) } }, total: { visible: true, offers: { over: offer('over', 44.5), under: null } } },
  },
  bets: [
    { userId: LUKE, gameId: 'SEA-DEN', market: 'spread', status: 'pending', selection: { gameId: 'SEA-DEN', market: 'spread', side: 'home', line: -3, odds: -110, units: 2, source: 'DraftKings', quotedAt: '2026-10-27T15:00:00.000Z' } },
    { userId: TROY, gameId: 'SEA-DEN', market: 'total', selection: { side: 'over', units: 1 } },
  ],
  faces: { 'SEA-DEN': [TROY, LUKE] },
};

describe('the placing board', () => {
  const board = placeBoard(data, LUKE);
  const [later, started] = [board.games.find(g => g.id === 'SEA-DEN'), board.games.find(g => g.id === 'HOU-JAX')];
  it('orders games by kickoff and marks one that started', () => {
    expect(board.games.map(g => g.id)).toEqual(['HOU-JAX', 'SEA-DEN']);
    expect(started.started).toBe(true);
    expect(later.started).toBe(false);
  });
  it('shows prices only for an open market and a lock sentence for a closed one', () => {
    const [spread, total] = later.markets;
    expect(spread.sides.map(side => side.text)).toEqual(['SEA +3.5 · −105', 'DEN −3.5 · −110']);
    expect(total.visible).toBe(false);
    expect(total.locked).toBe(PLACE_COPY.locked('total'));
    expect(total.sides.every(side => side.offer === null)).toBe(true);
    expect(board.closed).toBe(true);
  });
  it('shows your saved bet with "Price moved" when your side’s offer changed', () => {
    const { mine } = later.markets[0];
    expect(mine.text).toBe('DEN −3 · −110');
    expect(mine.units).toBe('2U');
    expect(mine.moved).toBe(true);
    expect(later.faces[0].you).toBe(true);
  });
  it('drops a started game, a closed market and a side without an offer from the slip', () => {
    const slip = {
      [slipKey('SEA-DEN', 'spread')]: { gameId: 'SEA-DEN', market: 'spread', side: 'away', units: 1.5 },
      [slipKey('SEA-DEN', 'total')]: { gameId: 'SEA-DEN', market: 'total', side: 'over', units: 1 },
      [slipKey('HOU-JAX', 'spread')]: { gameId: 'HOU-JAX', market: 'spread', side: 'home', units: 1 },
    };
    expect(slipEntries(board, slip).map(entry => entry.key)).toEqual([slipKey('SEA-DEN', 'spread')]);
  });
  it('sends the offered terms, and for an edit the saved terms as read', () => {
    const entries = slipEntries(board, { [slipKey('SEA-DEN', 'spread')]: { gameId: 'SEA-DEN', market: 'spread', side: 'away', units: 1.5 } });
    const body = placeRequest(board, entries, 'req');
    expect(body).toEqual({ season: 2026, week: 8, requestId: 'req', bets: [{
      gameId: 'SEA-DEN', market: 'spread', side: 'away', line: 3.5, odds: -105, units: 1.5, source: 'FanDuel', quotedAt: '2026-10-28T15:00:00.000Z',
      expected: { side: 'home', line: -3, odds: -110, units: 2, source: 'DraftKings', quotedAt: '2026-10-27T15:00:00.000Z' },
    }] });
    const fresh = placeBoard({ ...data, bets: [] }, LUKE);
    expect(placeRequest(fresh, slipEntries(fresh, { [slipKey('SEA-DEN', 'spread')]: { gameId: 'SEA-DEN', market: 'spread', side: 'home', units: 1 } }), 'r').bets[0].expected).toBeNull();
  });
  it('steps units in halves between 0.5 and 100', () => {
    expect(stepUnits(1, 1)).toBe(1.5);
    expect(stepUnits(0.5, -1)).toBe(0.5);
    expect(stepUnits(100, 1)).toBe(100);
  });
  it('reads an unpublished week as unpublished', () => {
    expect(placeBoard({ ...data, published: false }, LUKE)).toMatchObject({ published: false, games: [] });
  });
});

describe('a game card', () => {
  const board = placeBoard(data, LUKE);
  const html = renderToStaticMarkup(<div className="gx">{board.games.map(game => <PlaceGame key={game.id} game={game} slip={{}} disabled={false} onToggle={() => {}}/>)}</div>);
  it('passes the kit markup rules', () => {
    expect(markupProblems(html)).toEqual([]);
  });
  it('has no line for the closed Total and no price chips for the started game', () => {
    const closedTotal = html.slice(html.indexOf('data-game="SEA-DEN"')).split('data-market="total"')[1];
    expect(closedTotal).toContain('Lock in your Total guess');
    expect(closedTotal).not.toMatch(/44\.5|Over/);
    const startedGame = html.slice(html.indexOf('data-game="HOU-JAX"'), html.indexOf('data-game="SEA-DEN"'));
    expect(startedGame).toContain(PLACE_COPY.started);
    expect(startedGame).not.toContain('gx-chip');
  });
});
