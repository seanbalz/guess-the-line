// D-69 step 4: the moments drawn. Contracts: a Roomy card opens its own ticket's moment scope and its Won pill pops only
// when that ticket's win plays (a loss never pops); useBetWins reports only a fresh ticket read, under one source, and
// nothing while the read is on its way or failed; a placed bet's "Your bet" tag pops only when its placement is confirmed.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseMarkup, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ scopes: [], popped: [], moments: null, tickets: null }));
vi.mock('react', async importOriginal => ({ ...(await importOriginal()), useEffect: fn => { fn(); } }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({ useMoments: () => state.moments, useMomentScope: scope => { state.scopes.push(scope); },
  useNewCount: () => 0, useNewMoments: () => [], usePopped: id => Boolean(id) && state.popped.includes(id) }));
vi.mock('../web/src/next/bets/useTicketSummary.js', () => ({ useTicketSummary: () => state.tickets }));
vi.mock('../web/src/api.js', () => ({ betsApi: vi.fn(), socialApi: vi.fn(), cloudApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn(), useSharedRead: vi.fn() }));
const { TrackedBetRow } = await import('../web/src/next/bets/TrackedBetRow.jsx');
const { useBetWins } = await import('../web/src/next/bets/useBetWins.js');
const { PlaceGame } = await import('../web/src/next/bets/PlaceBets.jsx');
const { BET_WIN_SOURCE, betWinId } = await import('../web/src/next/bets/betMoments.js');
const { ticketScope } = await import('../web/src/next/moments/catalog.js');

const LUKE = '00000000-0000-4000-8000-000000000003';
const nodes = html => [...walk(parseMarkup(html))];
const pill = html => nodes(html).find(n => (n.attrs?.class ?? '').includes('gx-pill'));
const row = entry => renderToStaticMarkup(<div className="gx"><TrackedBetRow entry={{ week: 9, stakeUnits: 1, source: 'BetMGM', kind: 'single', legs: [{ gameId: 'SEA-DEN', selection: 'DEN −3' }], ...entry }} games={[{ id: 'SEA-DEN', away: 'SEA', home: 'DEN' }]}/></div>);

describe('a Roomy card holds its own ticket’s win', () => {
  it('opens its ticket’s scope and pops its Won pill only when that win plays', () => {
    state.scopes = []; state.popped = [];
    const still = row({ id: 't1', outcome: 'win' });
    expect(state.scopes).toEqual([ticketScope('t1')]);
    expect(pill(still).attrs['data-moment']).toBeUndefined();
    state.popped = [betWinId('t1')];
    const html = row({ id: 't1', outcome: 'win' });
    expect([pill(html).attrs['data-moment'], nodes(html).find(n => n.tag === 'article').attrs['data-ticket']]).toEqual(['pop', 't1']);
    expect(pill(row({ id: 't2', outcome: 'loss' })).attrs['data-moment'], 'a loss stays quiet').toBeUndefined();
    state.popped = [];
  });
  // Step 2's Home card and step 3's rank chip: a scope opened where nothing can show the moment spends it unseen. The ticket
  // summary and the card's own list are separate reads, so a card still drawing the ticket as open, lost or pushed holds
  // nothing; the win waits (NEW on My bets) until a card draws that ticket as won.
  it('a card that does not draw its ticket as won holds no scope', () => {
    state.scopes = []; state.popped = ['betWin:t3', 'betWin:t4', 'betWin:t5'];
    const drawn = ['pending', 'loss', 'push'].map((outcome, i) => row({ id: `t${i + 3}`, outcome }));
    expect(state.scopes).toEqual([]);
    expect(drawn.map(html => [nodes(html).find(n => n.tag === 'article').attrs['data-outcome'], pill(html).attrs['data-moment']])).toEqual([['pending', undefined], ['loss', undefined], ['push', undefined]]);
    state.popped = [];
  });
});

describe('useBetWins', () => {
  function Probe({ app }) { useBetWins(app); return null; }
  const app = { accountId: LUKE };
  it('reports a fresh ticket read’s wins under the tickets source', () => {
    const reportFn = vi.fn(); state.moments = { report: reportFn };
    state.tickets = { loading: false, error: null, data: { entries: [{ id: 'a', ownerId: LUKE, outcome: 'win', settledAt: '2026-11-03T12:00:00.000Z' }, { id: 'b', ownerId: LUKE, outcome: 'loss' }] } };
    renderToStaticMarkup(<Probe app={app}/>);
    expect(reportFn).toHaveBeenCalledTimes(1);
    expect(reportFn.mock.calls[0][0].map(m => m.id)).toEqual([betWinId('a')]);
    expect(reportFn.mock.calls[0][1]).toEqual({ source: BET_WIN_SOURCE });
  });
  it('reports nothing while the read is on its way, after it failed, without a viewer or without an engine', () => {
    const reportFn = vi.fn(); state.moments = { report: reportFn };
    for (const tickets of [{ loading: true, data: null }, { loading: false, error: { status: 0 }, data: null }]) { state.tickets = tickets; renderToStaticMarkup(<Probe app={app}/>); }
    state.tickets = { loading: false, data: { entries: [{ id: 'a', ownerId: LUKE, outcome: 'win', settledAt: '2026-11-03T12:00:00.000Z' }] } };
    renderToStaticMarkup(<Probe app={{ accountId: '' }}/>);
    expect(reportFn).not.toHaveBeenCalled();
    state.moments = null;
    expect(() => renderToStaticMarkup(<Probe app={app}/>)).not.toThrow();
  });
});

describe('a confirmed placement', () => {
  const game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2099-10-25T20:05:00.000Z', started: false, faces: [],
    markets: [{ market: 'spread', name: 'Spread', visible: true, locked: null, sides: [], mine: { text: 'DEN −3 · −110', units: '2U', moved: false, selection: {} } }] };
  const tag = html => nodes(html).find(n => (n.attrs?.class ?? '').includes('gx-tag'));
  it('pops the placed bet’s tag only when its placement is confirmed', () => {
    const draw = placed => renderToStaticMarkup(<div className="gx"><PlaceGame game={game} slip={{}} disabled={false} placed={placed} onToggle={() => {}}/></div>);
    expect(tag(draw(null)).attrs['data-moment']).toBeUndefined();
    expect(tag(draw({ id: 'r1', keys: new Set(['KC-BUF:total']) })).attrs['data-moment']).toBeUndefined();
    expect(tag(draw({ id: 'r1', keys: new Set(['SEA-DEN:spread']) })).attrs['data-moment']).toBe('pop');
  });
});
