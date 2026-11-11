// D-69 step 4 (spec 5A): the Bets landing drawn. Contracts: one glow card labelled by its eyebrow with the kit meter, one
// meta line and the screen's one lime button; five tiles with stable ids and faces on Everyone, NEW only on My bets (a tracked win waiting for its card); while
// /personal loads, the meter card's skeleton with five tile skeletons; a failed read says one sentence
// with Try again and keeps the tiles; a failed refresh keeps the last copy and says so. Main's landing cards as tiles: My
// bets says the net units and Open and Settled counts; Recommended draws the teased matchup's two marks and opens that
// assessment, a fresh step. Fixture data only.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ personal: null, tickets: { loading: false, error: null, data: { entries: [] } }, waiting: 0, research: { status: 'loading', data: null } }));
const LUKE = '00000000-0000-4000-8000-000000000003';
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => ({ accountId: LUKE, league: { community: true }, refresh: vi.fn(), requestSignIn: vi.fn(),
  community: { data: { week: { season: 2026, week: 9 }, optOuts: [], members: [{ id: LUKE, displayName: 'Luke' }, { id: 'troy', displayName: 'Troy' }] } } }),
  useSharedRead: () => state.personal }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: () => state.tickets, LeagueFailure: () => null }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({ useMoments: () => null, useMomentScope: () => {}, useNewCount: () => state.waiting, useNewMoments: () => [], usePopped: () => false }));
vi.mock('../web/src/api.js', () => ({ socialApi: vi.fn(), betsApi: vi.fn(), cloudApi: vi.fn(), linesApi: vi.fn() }));
vi.mock('../web/src/next/research/useAssessments.js', () => ({ useAssessments: () => state.research }));
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Bets } = await import('../web/src/next/bets/Bets.jsx');

const personal = { season: 2026, week: 9, now: '2026-11-08T19:00:00Z', games: [
  { id: 'DAL-NYG', kickoff: '2026-11-06T01:15:00Z' }, { id: 'SEA-DEN', kickoff: '2026-11-08T18:00:00Z' }, { id: 'KC-BUF', kickoff: '2026-11-08T21:25:00Z' }],
  ballots: { guess_spread: { picks: { 'KC-BUF': -2.5 }, lockedAt: { 'KC-BUF': '2026-11-07T00:00:00Z' } } } };
const ready = { status: 'ready', data: personal, error: null, at: null };
const shell = { state: { views: { bets: {} } }, go: vi.fn(), setView: vi.fn() };
const render = (read = ready) => { state.personal = read; return renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx"><Bets/></div></ShellContext.Provider>); };
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));
const byAttr = (html, name, value) => nodes(html).filter(n => n.attrs?.[name] === value);
const tiles = html => nodes(html).filter(n => n.tag === 'button' && (n.attrs.class ?? '').includes('gx-tile'));

describe('the Bets landing', () => {
  it('one next-move card: its eyebrow names it, the meter, one meta line, the one lime button; then five tiles', () => {
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    const [hero] = byAttr(html, 'data-bets', 'hero');
    expect(hero.attrs['data-kind']).toBe('place');
    expect(textOf(nodes(html).find(n => n.attrs?.id === hero.attrs['aria-labelledby']))).toBe('Week 9 · Your next move');
    expect(textOf([...walk(hero)].find(n => n.tag === 'h2'))).toBe('Place your picks');
    expect([...walk(hero)].filter(n => (n.attrs?.class ?? '').includes('gx-meter3-seg')).length).toBe(3);
    expect([...walk(hero)].filter(n => (n.attrs?.class ?? '').includes('gx-meter3-seg--on')).length).toBe(1);
    expect(textOf(byAttr(html, 'data-bets', 'hero-line')[0])).toBe('1 of 3 games still open');
    expect(nodes(html).filter(n => n.tag === 'button' && (n.attrs.class ?? '').includes('gx-btn--primary')).map(textOf)).toEqual(['Place picks']);
    expect(tiles(html).map(t => t.attrs.id)).toEqual(['gx-b-tile-mybets', 'gx-b-tile-picks', 'gx-b-tile-everyone', 'gx-b-tile-recommended', 'gx-b-tile-gap']);
    expect(nameFrom(tiles(html)[1])).toBe('Your picks, 1 game open to bet');
    expect([...walk(tiles(html)[2])].some(n => /\bgx-av\b/.test(n.attrs?.class ?? '')), 'Everyone shows faces').toBe(true);
    expect(html).not.toContain('gx-new');
    expect(nodes(html).filter(n => n.tag === 'h1').map(textOf)).toEqual(['Bets']);
  });
  it('with no week: Track a bet, its meter and Add a bet', () => {
    const html = render({ status: 'error', data: null, error: { status: 404 }, at: null });
    const [hero] = byAttr(html, 'data-bets', 'hero');
    expect([hero.attrs['data-kind'], textOf([...walk(hero)].find(n => n.tag === 'h2'))]).toEqual(['track', 'Track a bet']);
    expect(textOf(byAttr(html, 'data-bets', 'hero-line')[0])).toBe('No settled tickets yet');
    expect(nodes(html).filter(n => n.tag === 'button' && (n.attrs.class ?? '').includes('gx-btn--primary')).map(textOf)).toEqual(['Add a bet']);
  });
  it('while /personal loads: the meter card’s skeleton and five tile skeletons', () => {
    const html = render({ status: 'loading', data: null, error: null, at: null });
    expect(markupProblems(html)).toEqual([]);
    const [skeleton] = byAttr(html, 'data-skeleton', 'landing');
    expect(skeleton.attrs.class).toContain('gx-b-skel');
    expect([...walk(skeleton)].filter(n => (n.attrs?.class ?? '').includes('gx-skel-hero--meter'))).toHaveLength(1);
    expect([...walk(skeleton)].filter(n => (n.attrs?.class ?? '').split(' ').includes('gx-skel-tile'))).toHaveLength(5);
    expect(byAttr(html, 'data-bets', 'tiles')).toHaveLength(0);
  });
  it('a failed read: one sentence and Try again, the tiles still there; a failed refresh keeps the last copy and says so', () => {
    const failed = render({ status: 'error', data: null, error: { status: 0 }, at: null });
    expect(textOf(byAttr(failed, 'data-bets', 'failed')[0])).toContain('This week didn’t load.');
    expect(byAttr(failed, 'data-bets', 'tiles')).toHaveLength(1);
    expect(nameFrom(tiles(failed)[1])).toBe('Your picks, not loaded');
    expect(nameFrom(tiles(failed)[4])).toBe('Your gap, not loaded');
    expect(textOf(tiles(failed)[1])).toContain('Not loaded');
    const stale = render({ ...ready, error: { status: 0 } });
    expect(stale).toContain('This week could not refresh. Showing the last loaded update.');
    expect(byAttr(stale, 'data-bets', 'hero')).toHaveLength(1);
  });
  it('while tickets load there is no 0-of-5 meter on the Track a bet card', () => {
    state.tickets = { loading: true, error: null, data: null };
    const html = render({ status: 'error', data: null, error: { status: 404 }, at: null });
    state.tickets = { loading: false, error: null, data: { entries: [] } };
    const [hero] = byAttr(html, 'data-bets', 'hero');
    expect([...walk(hero)].filter(n => (n.attrs?.class ?? '').includes('gx-meter3-seg'))).toHaveLength(0);
    expect(textOf(byAttr(html, 'data-bets', 'hero-line')[0])).toBe('Loading your tickets…');
  });
  it('My bets says your net units with Open and Settled; Recommended draws the teased matchup and opens that assessment', () => {
    const entry = (id, outcome) => ({ id, ownerId: LUKE, origin: 'tracked', kind: 'single', countsForRecord: true, stakeUnits: 0.75, odds: 100, legs: [], outcome });
    const entries = [entry('w', 'win'), entry('o', 'pending')];
    state.tickets = { loading: false, error: null, data: { entries }, model: { entries, summary: { bets: 2, pending: 1, roiSampleCount: 1, netUnits: 0.75 } } };
    state.research = { status: 'ready', data: { assessments: [{ gameId: 'SEA-DEN', routeId: 'sea-den-1', label: 'Research lean', selection: { market: 'spread' } }],
      coverage: { games: [{ id: 'SEA-DEN', closed: false, spreadAccessible: true, totalAccessible: false }] } } };
    shell.go.mockClear();
    const tree = render();
    state.tickets = { loading: false, error: null, data: { entries: [] } };
    state.research = { status: 'loading', data: null };
    const [mine, , , recommended] = tiles(tree);
    expect([nameFrom(mine), textOf(mine)]).toEqual(['My bets, +0.75U net, 1 open, 1 settled, 2 tracked tickets', expect.stringContaining('+0.75U1 open · 1 settled')]);
    expect(nameFrom(recommended)).toBe('Recommended, 1 assessment open to you, first Seahawks @ Broncos, Research lean');
    expect([...walk(recommended)].filter(n => (n.attrs?.class ?? '').split(' ').includes('gx-team')).length, 'the matchup’s two marks').toBe(2);
    expect(textOf(recommended)).toContain('Research lean');
    expect(nodes(tree).filter(n => n.tag === 'button' && (n.attrs.class ?? '').includes('gx-btn--primary')).map(textOf), 'still one lime button').toEqual(['Place picks']);
  });
  it('NEW only on My bets while a tracked win waits for its card', () => {
    state.waiting = 1;
    const html = render();
    state.waiting = 0;
    expect(nameFrom(tiles(html)[0])).toMatch(/^My bets, .*, new$/);
    expect(tiles(html).slice(1).every(t => !/, new$/.test(nameFrom(t)))).toBe(true);
  });
});
