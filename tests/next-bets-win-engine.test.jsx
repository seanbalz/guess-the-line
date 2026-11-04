// D-69 step 4: a tracked win waits on the Roomy card that draws its ticket as won, with the real MomentsProvider and the
// real engine. Contracts: the ticket summary read (useBetWins) landing after the card mounted plays the win once, in place
// on that card; the summary and the card's own list are separate reads, so a card still drawing the ticket as open never
// spends a win the summary brought first: it waits (NEW on My bets) and plays when the card draws the ticket as won (step
// 2's Home card and step 3's rank chip: a scope opened where nothing can show the moment spends it unseen); a loss reports
// nothing and plays nothing. Memory record, sync timer, a member who has navigated; effects run in place in a static
// render: the provider's own engine-making effect once, the scope holders' effects and useBetWins' report (as in
// tests/next-score-rank-chip-engine.test.jsx). Fixture data only.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const rig = vi.hoisted(() => ({ engine: null, made: false, small: [], big: [], tickets: null }));
vi.mock('react', async importOriginal => ({
  ...(await importOriginal()),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  useEffect: effect => {
    const source = String(effect);
    if (source.includes('setEngine')) { if (!rig.made) { rig.made = true; effect(); } } else if (source.includes('ctx?.engine') || source.includes('betWinMoments')) effect();
  },
}));
vi.mock('../web/src/api.js', () => ({ socialApi: vi.fn() }));
vi.mock('../web/src/next/bets/useTicketSummary.js', () => ({ useTicketSummary: () => rig.tickets }));
vi.mock('../web/src/next/moments/engine.js', async importOriginal => {
  const actual = await importOriginal();
  const map = new Map();
  const storage = { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } };
  return { ...actual, createMomentsEngine: options => (rig.engine ??= actual.createMomentsEngine({ ...options, storage, isSettled: () => true, hasNavigated: () => true, setTimer: fn => { fn(); },
    onSmall: m => rig.small.push(m.id), onBig: ms => rig.big.push(ms.map(m => m.id)) })) };
});
const { MomentsProvider } = await import('../web/src/next/moments/MomentsProvider.jsx');
const { TrackedBetRow } = await import('../web/src/next/bets/TrackedBetRow.jsx');
const { useBetWins } = await import('../web/src/next/bets/useBetWins.js');
const { betWinId } = await import('../web/src/next/bets/betMoments.js');
const { SCOPES, ticketScope } = await import('../web/src/next/moments/catalog.js');

const GAMES = [{ id: 'SEA-DEN', away: 'SEA', home: 'DEN' }];
const entry = (account, id, outcome) => ({ id, ownerId: account, outcome, settledAt: outcome === 'pending' ? null : '2026-11-03T12:00:00.000Z', week: 9, stakeUnits: 1, source: 'BetMGM', kind: 'single', legs: [{ gameId: 'SEA-DEN', selection: 'DEN −3' }] });
const summary = entries => ({ loading: false, error: null, data: { entries } });
function Wins({ account }) { useBetWins({ accountId: account }); return null; }
/** One render: the ticket summary read (when given) reports first, then the cards draw, as a read landing on a mounted list. */
function draw(account, { tickets = null, rows = [] } = {}) {
  rig.made = false;
  rig.tickets = tickets;
  return renderToStaticMarkup(<MomentsProvider account={account} showOverlay={() => {}}><div className="gx">
    {tickets ? <Wins account={account}/> : null}{rows.map(row => <TrackedBetRow key={row.id} entry={row} games={GAMES}/>)}
  </div></MomentsProvider>);
}

describe('a tracked win with the real engine', () => {
  beforeEach(() => { rig.engine = null; rig.small = []; rig.big = []; });

  it('the summary read landing after the card mounted plays the win once, in place on its card', () => {
    const YOU = 'u-after';
    draw(YOU, { tickets: summary([]) }); // this device's first read of the tickets seeds it
    draw(YOU, { rows: [entry(YOU, 'a', 'win')] }); // My bets' list draws the ticket as won; the summary has not refreshed
    expect(rig.small).toEqual([]);
    draw(YOU, { tickets: summary([entry(YOU, 'a', 'win')]), rows: [entry(YOU, 'a', 'win')] }); // the summary refreshes
    expect(rig.small).toEqual([betWinId('a')]);
    expect(rig.big, 'a tracked win is small').toEqual([]);
    expect(rig.engine.newCount(SCOPES.bets)).toBe(0);
    draw(YOU, { tickets: summary([entry(YOU, 'a', 'win')]), rows: [entry(YOU, 'a', 'win')] });
    expect(rig.small, 'never again').toEqual([betWinId('a')]);
  });

  it('a card still drawing its ticket as open never spends the win; it waits, then plays when the card draws it won', () => {
    const YOU = 'u-open';
    draw(YOU, { tickets: summary([]) });
    draw(YOU, { rows: [entry(YOU, 'b', 'pending')] }); // the card's own list read the ticket before it settled
    draw(YOU, { tickets: summary([entry(YOU, 'b', 'win')]), rows: [entry(YOU, 'b', 'pending')] }); // the summary is ahead
    expect(rig.small, 'nothing spent on a card that shows Open').toEqual([]);
    expect([rig.engine.newCount(SCOPES.bets), rig.engine.newCount(ticketScope('b'))], 'it waits for its card and counts on My bets').toEqual([1, 1]);
    const html = draw(YOU, { rows: [entry(YOU, 'b', 'win')] }); // the list refreshes: the card draws the ticket as won
    expect(html).toContain('data-outcome="win"');
    expect(rig.small).toEqual([betWinId('b')]);
    expect(rig.engine.newCount(SCOPES.bets)).toBe(0);
  });

  it('a loss reports nothing and plays nothing', () => {
    const YOU = 'u-loss';
    draw(YOU, { tickets: summary([]) });
    draw(YOU, { rows: [entry(YOU, 'c', 'loss')] });
    draw(YOU, { tickets: summary([entry(YOU, 'c', 'loss')]), rows: [entry(YOU, 'c', 'loss')] });
    expect([rig.small, rig.big]).toEqual([[], []]);
    expect([rig.engine.newCount(SCOPES.bets), rig.engine.newCount(ticketScope('c'))]).toEqual([0, 0]);
  });
});
