// D-69 step 3 (spec 5A): the Research landing drawn. Contracts: one glow card labelled by its eyebrow with the week meter,
// one meta line and the screen's one lime button; four tiles with stable ids; while the Community read loads, the meter
// card's skeleton with four tiles; a failed read says one sentence with Try again and keeps the tiles; a failed refresh
// keeps the last copy and says so. Fixture data only; Research's sections are stood in for.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ community: null }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => ({ accountId: 'fixture', community: state.community, refresh: vi.fn(), requestSignIn: vi.fn() }), useSharedRead: () => ({ data: null }) }));
vi.mock('../web/src/next/lines/GamesScreen.jsx', () => ({ GamesScreen: () => null }));
vi.mock('../web/src/next/teams/TeamsScreen.jsx', () => ({ TeamsScreen: () => null }));
vi.mock('../web/src/next/trends/TrendsPage.jsx', () => ({ TrendsPage: () => null }));
vi.mock('../web/src/next/fantasy/FantasyPage.jsx', () => ({ FantasyPage: () => null }));
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Research } = await import('../web/src/next/research/Research.jsx');

const week = { season: 2026, week: 9, games: [
  { id: 'DAL-NYG', awayCode: 'DAL', homeCode: 'NYG', kickoff: '2026-11-06T01:15:00Z' },
  { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-11-08T18:00:00Z' },
  { id: 'KC-BUF', awayCode: 'KC', homeCode: 'BUF', kickoff: '2026-11-08T21:25:00Z' }] };
const ready = { status: 'ready', data: { week, picksDue: { state: 'due', week: 9, now: '2026-11-08T19:00:00Z' } }, error: null, at: null };
const shell = { state: { views: { research: {}, lines: {} } }, go: vi.fn(), setView: vi.fn() };
const render = community => { state.community = community; return renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx"><Research/></div></ShellContext.Provider>); };
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));
const byAttr = (html, name, value) => nodes(html).filter(n => n.attrs?.[name] === value);

describe('the Research landing', () => {
  it('one next-move card: its eyebrow names it, the week meter, one meta line, the one lime button; then four tiles', () => {
    const html = render(ready);
    expect(markupProblems(html)).toEqual([]);
    const [hero] = byAttr(html, 'data-research', 'hero');
    const eyebrow = nodes(html).find(n => n.attrs?.id === hero.attrs['aria-labelledby']);
    expect(textOf(eyebrow)).toBe('Week 9 · This week’s lines');
    const title = [...walk(hero)].find(n => n.tag === 'h2');
    expect(textOf(title)).toBe('3 games');
    expect(title.attrs.class).toBe('gx-t-title');
    expect([...walk(hero)].filter(n => (n.attrs?.class ?? '').includes('gx-meter3-seg')).length).toBe(3);
    expect([...walk(hero)].filter(n => (n.attrs?.class ?? '').includes('gx-meter3-seg--on')).length).toBe(2);
    expect(textOf(byAttr(html, 'data-research', 'hero-line')[0])).toBe('2 of 3 kicked off');
    expect((html.match(/gx-btn--primary/g) || [])).toHaveLength(1);
    const primary = nodes(html).filter(n => n.tag === 'button' && (n.attrs.class ?? '').includes('gx-btn--primary'));
    expect(primary.map(textOf)).toEqual(['Open games']);
    expect(primary[0].attrs.id, 'a stable id for Back’s focus').toBe('gx-r-hero-action');
    const tiles = nodes(html).filter(n => n.tag === 'button' && (n.attrs.class ?? '').includes('gx-tile'));
    expect(tiles.map(t => t.attrs.id)).toEqual(['gx-r-tile-games', 'gx-r-tile-trends', 'gx-r-tile-fantasy', 'gx-r-tile-teams']);
    expect(nameFrom(tiles[0])).toBe('Games, next game KC at BUF, Sun 1:25 PM PT');
    expect(nameFrom(tiles[2])).toMatch(/^Fantasy/);
    expect(html).not.toContain('gx-new');
    expect(nodes(html).filter(n => n.tag === 'h1').map(textOf)).toEqual(['Research']);
  });
  it('while the read loads: the meter card’s skeleton and four tile skeletons, the words for screen readers', () => {
    const html = render({ status: 'loading', data: null, error: null, at: null });
    expect(markupProblems(html)).toEqual([]);
    const [skeleton] = byAttr(html, 'data-skeleton', 'landing');
    expect(skeleton.attrs.class).toContain('gx-r-skel');
    expect([...walk(skeleton)].filter(n => (n.attrs?.class ?? '').includes('gx-skel-hero--meter'))).toHaveLength(1);
    expect([...walk(skeleton)].filter(n => (n.attrs?.class ?? '').split(' ').includes('gx-skel-tile'))).toHaveLength(4);
    expect(byAttr(html, 'data-research', 'tiles')).toHaveLength(0);
    expect(skeleton.attrs.role).toBe('status');
    expect(textOf(skeleton)).toContain('Loading this week’s games…');
  });
  it('a failed read: one sentence and Try again, the tiles still there; a failed refresh keeps the last copy and says so', () => {
    const failed = render({ status: 'error', data: null, error: { status: 0 }, at: null });
    expect(markupProblems(failed)).toEqual([]);
    expect(textOf(byAttr(failed, 'data-research', 'failed')[0])).toContain('This week didn’t load.');
    expect(byAttr(failed, 'data-research', 'tiles')).toHaveLength(1);
    expect(byAttr(failed, 'data-research', 'failed')[0].attrs.role).toBe('alert');
    expect(nodes(failed).filter(n => n.tag === 'button' && textOf(n) === 'Try again')).toHaveLength(1);
    expect(failed).not.toContain('No week open');
    expect(nodes(failed).filter(n => n.tag === 'button' && (n.attrs.class ?? '').includes('gx-tile')).map(n => nameFrom(n))[0]).toBe('Games, not loaded');
    const stale = render({ ...ready, status: 'error', error: { status: 0 } });
    expect(stale).toContain('This week could not refresh. Showing the last loaded update.');
    expect(nodes(stale).filter(n => n.tag === 'button' && textOf(n) === 'Refresh week')).toHaveLength(1);
    expect(byAttr(stale, 'data-research', 'hero')).toHaveLength(1);
  });
});
