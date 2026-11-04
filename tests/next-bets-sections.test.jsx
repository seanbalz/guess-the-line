// D-69 step 4: each Bets section is its own screen (as Play's and Research's are). Contracts: its title is the tile's one
// word; My bets keeps one title on its four addresses and names the list as its one meta line; each has its ⓘ; no section
// draws the old Tracked / Your gap / Virtual buttons or the Your picks / Everyone switch; Everyone's empty week offers
// Your picks as a fresh section. Each section's reads are stand-ins; lazy chunks show their loading frame.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ read: { loading: true, data: null, error: null, retry: () => {} }, go: null }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => ({ accountId: 'luke', league: { community: true }, community: { data: null }, refresh: vi.fn(), requestSignIn: vi.fn() }), useSharedRead: () => ({ data: null }) }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: () => state.read, LeagueFailure: () => null }));
vi.mock('../web/src/api.js', () => ({ socialApi: vi.fn(), betsApi: vi.fn(), cloudApi: vi.fn(() => new Promise(() => {})), linesApi: vi.fn(() => new Promise(() => {})), date: v => v, signed: v => String(v) }));
// The lazy tracker and Your gap chunks load in the background of a static render; their old-app imports are stood in for.
vi.mock('../web/src/trendsLoaders.js', () => ({ loadTrendWeek: vi.fn(() => new Promise(() => {})) }));
vi.mock('../web/src/fantasyData.js', () => ({ useFantasySnapshot: () => ({ status: 'missing' }), fantasyWeekKey: (season, week) => `${season}-${week}` }));
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Bets } = await import('../web/src/next/bets/Bets.jsx');

const render = view => { state.go = vi.fn(); const shell = { state: { views: { bets: { view } }, nav: 1 }, go: state.go, setView: vi.fn(), setDirty: vi.fn(), toast: vi.fn(), confirmLeave: () => true };
  return renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx"><Bets/></div></ShellContext.Provider>); };
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));

describe('Bets sections', () => {
  for (const [view, section, title, meta, about] of [
    ['tracked', 'mybets', 'My bets', null, 'About tracked bets'], ['active', 'mybets', 'My bets', 'Active tickets · all weeks', 'About tracked bets'],
    ['settled', 'mybets', 'My bets', 'Settled tickets · all weeks', 'About tracked bets'], ['add', 'mybets', 'My bets', 'Add a bet', 'About tracked bets'],
    ['virtual', 'picks', 'Your picks', null, 'About Virtual Units'], ['everyone', 'everyone', 'Everyone', null, 'About everyone’s picks'],
  ]) it(`#bets/${view} is ${title}: its title, its ⓘ${meta ? ', its list as the meta line' : ''}, and no switch`, () => {
    const html = render(view);
    expect(markupProblems(html)).toEqual([]);
    const [screen] = nodes(html).filter(n => n.attrs?.['data-bets-section']);
    expect(screen.attrs['data-bets-section']).toBe(section);
    expect(nodes(html).filter(n => n.tag === 'h1').map(textOf)).toEqual([title]);
    expect(nodes(html).some(n => n.tag === 'button' && nameFrom(n) === about)).toBe(true);
    if (meta) expect(html).toContain(meta);
    for (const gone of ['aria-label="Bets view"', 'aria-label="Virtual Units view"', 'Tickets you placed elsewhere', 'Place play-money picks on this week']) expect(html).not.toContain(gone);
  });
  it('the landing is what any other view draws', () => {
    for (const view of [undefined, 'nope']) expect(nodes(render(view)).some(n => n.attrs?.['data-landing'] === 'bets')).toBe(true);
  });
  it('Everyone’s empty week offers Your picks as a fresh section', () => {
    state.read = { loading: false, error: null, data: { season: 2026, week: 9, published: true, roster: [], games: [], bets: [], faces: {}, markets: {}, qualification: [] }, retry: () => {} };
    const html = render('everyone');
    state.read = { loading: true, data: null, error: null, retry: () => {} };
    expect(html).toContain('Place a pick');
  });
});
