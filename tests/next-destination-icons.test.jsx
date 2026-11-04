// Quick win A9 (November 4, 2026): destination rows on the Research and Bets landings, and Home's tiles (D-69 step 2,
// H1A: Home's rows became kit tiles; Research's rows became kit tiles too, D-69 step 3). Contract: no two destinations on one screen share a glyph, a destination has the
// same glyph from every screen (drawn here: Research recommendations on Bets, Trends and My bets on Home; the game layers are not drawn in this file),
// every glyph comes from the kit's Lucide outline set, the row icons are text-2 (lime stays for the one primary action,
// rule 2) and the landing's action headline is in the 28 px title style, not the 40 px display line.
// The Menu and Commissioner tools rows are checked in tests/next-commissioner-ui.test.jsx. Fixture data only.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ app: null, personal: { data: null }, read: { loading: true, data: null, error: null } }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => state.app, useSharedRead: () => state.personal }));
vi.mock('../web/src/next/home/homeData.js', () => ({ useHomeData: () => ({ app: state.app, community: state.app.community, viewer: 'fixture', preferences: {} }) }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: () => state.read, LeagueFailure: () => <p>Read failed</p> }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn(), socialApi: vi.fn() }));
// Research's sections are other screens with their own tests; only its landing is drawn here.
vi.mock('../web/src/next/teams/TeamsScreen.jsx', () => ({ TeamsScreen: () => null })); // D-69 step 3: the team list and its layer
vi.mock('../web/src/next/lines/GamesScreen.jsx', () => ({ GamesScreen: () => null })); // D-69 step 3: the board and its game layer
vi.mock('../web/src/next/trends/TrendsPage.jsx', () => ({ TrendsPage: () => null }));
vi.mock('../web/src/next/fantasy/FantasyPage.jsx', () => ({ FantasyPage: () => null }));
vi.mock('../web/src/fantasyData.js', () => ({ fantasyWeekKey: (season, week) => `${season}-${String(week).padStart(2, '0')}`, useFantasySnapshot: () => ({ status: 'loading' }) }));
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Home } = await import('../web/src/next/home/Home.jsx');
const { Research } = await import('../web/src/next/research/Research.jsx');
const { Bets } = await import('../web/src/next/bets/Bets.jsx');
const { DESTINATION_ICONS, icons } = await import('../web/src/next/ui/index.js');

function render(Screen) {
  state.app = { accountId: 'fixture', community: { status: 'ready', data: { week: { season: 2026, week: 6, games: [] }, picksDue: { state: 'due', week: 6, modes: [{ mode: 'guess_total' }] }, due: [{ mode: 'guess_spread', submitted: true }, { mode: 'guess_total', filled: 0, games: 2 }] } }, league: { name: 'Community', community: true }, refresh: vi.fn(), requestSignIn: vi.fn() };
  const shell = { state: { views: { play: {}, bets: {}, research: {} } }, go: vi.fn(), tab: vi.fn(), setView: vi.fn(), reload: vi.fn(), openSheet: vi.fn(), league: state.app.league };
  return renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx"><Screen/></div></ShellContext.Provider>);
}
const nodes = html => [...walk(parseMarkup(html))];
const textOf = node => (node.text ?? (node.children ?? []).map(textOf).join(''));
/** Each destination row (a FocusRow: a button with the landing icon) as [its title, its Lucide glyph]. */
function rows(html) {
  return nodes(html).filter(n => n.tag === 'button' && /\bgx-focus-row\b/.test(n.attrs?.class ?? '')).map(row => {
    const svg = [...walk(row)].find(n => n.tag === 'svg');
    return [row.attrs['aria-label'], (svg?.attrs.class ?? '').split(' ').find(c => c.startsWith('lucide-'))];
  });
}
/** Each of Home's tiles (the kit's Tile: a button with its label and its glyph) as [its label, its Lucide glyph]. */
function tiles(html) {
  return nodes(html).filter(n => n.tag === 'button' && /\bgx-tile\b/.test(n.attrs?.class ?? '')).map(tile => {
    const label = [...walk(tile)].find(n => /\bgx-nest-tile-label\b/.test(n.attrs?.class ?? ''));
    const svg = [...walk(tile)].find(n => n.tag === 'svg');
    return [label ? textOf(label) : undefined, (svg?.attrs.class ?? '').split(' ').find(c => c.startsWith('lucide-'))];
  });
}
const duplicates = list => list.filter(([, glyph], i) => list.findIndex(([, other]) => other === glyph) !== i);
const glyphOf = name => `lucide-${icons[DESTINATION_ICONS[name]].displayName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;

describe('A9: one glyph per destination on the landings', () => {
  const screens = { Home: render(Home), Research: render(Research), Bets: render(Bets) };

  it('no two rows on one screen share a glyph', () => {
    for (const [name, html] of Object.entries(screens)) {
      expect(markupProblems(html), name).toEqual([]);
      const list = ['Home', 'Research'].includes(name) ? tiles(html) : rows(html);
      expect(list.length, `${name} has destination rows`).toBeGreaterThan(0);
      expect(list.filter(([, glyph]) => !glyph), `${name}: every row has a glyph`).toEqual([]);
      expect(duplicates(list), name).toEqual([]);
    }
    expect(rows(screens.Bets).map(([title]) => title)).toEqual(['Overview', 'Active tickets', 'Settled tickets', 'Research recommendations', 'Your guess vs. market', 'Virtual Units', 'Everyone’s picks']);
    expect(tiles(screens.Research).map(([title]) => title)).toEqual(['Games', 'Trends', 'Fantasy', 'Teams']);
    expect(rows(screens.Research), 'Research’s destinations are tiles, not rows').toEqual([]);
    expect(tiles(screens.Home).map(([title]) => title)).toEqual(['Spread rank', 'Total rank', 'Who’s in', 'Awards', 'My bets', 'Trends']);
    expect(rows(screens.Home), 'Home’s destinations are tiles, not rows').toEqual([]);
  });

  it('a destination keeps its glyph from every screen that links to it', () => {
    const glyph = (html, title) => rows(html).find(([name]) => name === title)?.[1];
    expect(glyph(screens.Bets, 'Research recommendations')).toBe(glyphOf('researchPicks'));
    const tileGlyph = (html, title) => tiles(html).find(([name]) => name === title)?.[1];
    expect(tileGlyph(screens.Research, 'Trends')).toBe(glyphOf('trends'));
    expect(tileGlyph(screens.Research, 'Fantasy')).toBe(glyphOf('fantasy'));
    expect(tileGlyph(screens.Research, 'Games')).toBe(glyphOf('games'));
    expect(tileGlyph(screens.Research, 'Teams')).toBe(glyphOf('teams'));
    expect(tileGlyph(screens.Home, 'Trends')).toBe(glyphOf('trends'));
    expect(tileGlyph(screens.Home, 'My bets')).toBe(glyphOf('activeTickets'));
    expect(glyph(screens.Bets, 'Active tickets')).toBe(glyphOf('activeTickets'));
  });

  it('every glyph in the map is one the kit draws (the Lucide outline set)', () => {
    for (const [destination, key] of Object.entries(DESTINATION_ICONS)) expect(typeof icons[key], `${destination}: ${key}`).toBe('object');
  });

  it('the landing headline is the title style, and only Home keeps the display line', () => {
    expect(screens.Research, 'Research').not.toContain('gx-t-display');
    const headline = nodes(screens.Bets).find(n => n.tag === 'h2' && n.parent?.attrs?.class?.includes('gx-focus-action'));
    expect(headline.attrs.class, 'Bets').toBe('gx-t-title');
    expect(screens.Bets, 'Bets').not.toContain('gx-t-display');
    expect(textOf(nodes(screens.Bets).find(n => n.tag === 'h2' && n.attrs.class === 'gx-t-title'))).toBe('Your tickets. All together.');
  });

  it('row icons are text-2, never lime (rule 2: lime is the one primary action)', () => {
    const css = fs.readFileSync(path.resolve(import.meta.dirname, '../web/src/next/ui/focusLanding.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = css.match(/\.gx-focus-icon\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/(^|;)\s*color:\s*var\(--gx-text-2\)/);
    expect(rule).not.toMatch(/accent/);
  });
});
