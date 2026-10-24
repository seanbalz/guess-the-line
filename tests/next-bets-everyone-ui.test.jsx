// Bets › Everyone (M-10, D-36) screen markup, rendered with react-dom/server. Contracts: the kit's markup rules hold
// (gx- classes, named controls, hidden or labelled svgs); a friend's closed row has side, units and the lock
// sentence and no line, price or book anywhere in the HTML; an open row and your own row show their terms; the one
// banner offers a way to lock in; an unpublished or empty week says so in one sentence.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems } from './helpers/ui-markup.mjs';

// The board draws what it is given; the container's read and the app data are not under test here.
vi.mock('../web/src/api.js', () => ({ betsApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));

const { EveryoneBoard } = await import('../web/src/next/bets/EveryoneBets.jsx');
const { EVERYONE_COPY } = await import('../web/src/next/bets/everyone.js');

const LUKE = '00000000-0000-4000-8000-000000000003', TROY = '00000000-0000-4000-8000-000000000002', SEAN = '00000000-0000-4000-8000-000000000001';
const data = {
  season: 2026, week: 7, published: true,
  roster: [{ userId: SEAN, displayName: 'Sean' }, { userId: TROY, displayName: 'Troy' }, { userId: LUKE, displayName: 'Luke' }],
  games: [{ id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:05:00.000Z' }, { id: 'HOU-JAX', awayCode: 'HOU', homeCode: 'JAX', kickoff: '2026-10-25T17:00:00.000Z' }],
  markets: { 'SEA-DEN': { spread: { visible: false }, total: { visible: false } }, 'HOU-JAX': { spread: { visible: true }, total: { visible: false } } },
  bets: [
    { userId: TROY, gameId: 'SEA-DEN', market: 'spread', selection: { side: 'home', units: 1.5, line: -13.5, odds: -115, source: 'BetMGM' }, status: 'win', result: { netUnits: 1.3 } },
    { userId: LUKE, gameId: 'SEA-DEN', market: 'total', selection: { side: 'over', line: 44.5, odds: -110, units: 2, source: 'DraftKings' }, status: null, result: null },
    { userId: SEAN, gameId: 'HOU-JAX', market: 'spread', selection: { side: 'away', line: 3, odds: 120, units: 1, source: 'FanDuel' }, status: 'win', result: { netUnits: 1.2 } },
  ],
  faces: { 'SEA-DEN': [TROY, LUKE], 'HOU-JAX': [SEAN] },
  qualification: [{ userId: TROY, picks: 3, units: 4.5, qualified: true }, { userId: LUKE, picks: 1, units: 2, qualified: false }, { userId: SEAN, picks: 1, units: 1, qualified: false }],
};
const render = (props = {}) => renderToStaticMarkup(<div className="gx"><EveryoneBoard data={data} viewer={LUKE} scopeName="Community" onLockIn={() => {}} onPlace={() => {}} onRefresh={() => {}} {...props}/></div>);
const slice = (html, key) => {
  const start = html.indexOf(`data-pick="${key}"`);
  return html.slice(start, html.indexOf('</li>', start));
};

describe('everyone’s picks', () => {
  const html = render();
  it('passes the kit markup rules', () => {
    expect(markupProblems(html)).toEqual([]);
  });
  it('shows a closed friend’s side and units with the lock sentence, and none of the terms the reply carried', () => {
    const troy = slice(html, `${TROY}:spread`);
    expect(troy).toContain('data-open="false"');
    expect(troy).toContain('DEN');
    expect(troy).toContain('1.5U');
    expect(troy).toContain(EVERYONE_COPY.locked('spread'));
    for (const secret of ['13.5', '115', 'BetMGM', '1.30', 'Win']) expect(troy).not.toContain(secret);
    expect(html).not.toContain('BetMGM');
    expect(html).not.toContain('13.5');
  });
  it('shows an open friend’s terms and result, and your own pick in full', () => {
    const sean = slice(html, `${SEAN}:spread`);
    expect(sean).toContain('HOU +3');
    expect(sean).toContain('+120 · FanDuel');
    expect(sean).toContain('Win +1.20U');
    const luke = slice(html, `${LUKE}:total`);
    expect(luke).toContain('You');
    expect(luke).toContain('Over 44.5');
    expect(luke).toContain('−110 · DraftKings');
  });
  it('draws one banner with a way to lock in, and the weekly list with qualification in words', () => {
    expect(html.split(EVERYONE_COPY.banner).length - 1).toBe(1);
    expect(html).toContain('Lock in a guess');
    expect(html).toContain('Qualified');
    expect(html).toContain('3 picks · 4.5U');
  });
  it('names each game’s pickers for screen readers', () => {
    expect(html).toContain('You, Troy picked this game');
  });
});

describe('quiet weeks', () => {
  it('an unpublished week is one sentence', () => {
    const html = render({ data: { season: 2026, week: 8, published: false, roster: [], games: [], bets: [], faces: {}, markets: {}, qualification: [] } });
    expect(html).toContain(EVERYONE_COPY.unpublished);
    expect(html).not.toContain('id="gx-ev-week"');
  });
  it('a week with no picks is one sentence and one action', () => {
    const html = render({ data: { ...data, bets: [], faces: {}, qualification: [] } });
    expect(html).toContain(EVERYONE_COPY.empty);
    expect(html).toContain('Place a pick');
    expect(markupProblems(html)).toEqual([]);
  });
});
