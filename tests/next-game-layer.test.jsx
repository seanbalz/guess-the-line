// D-69 step 3 (spec 6, "The game layer holds the lines, the movement chart, your pick, trends and the matchup
// statistics"; spec 4.1, "Its swipe paging between games moves into the game layer"): Research › Games › one game as a
// nesting card with its own address, in place of the game sheet on this path. Fixture week (the committed Week 6
// trends file); the data hook and readers are stood in for, so nothing reaches the network.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import week from '../shared/trends/2026-week-06.json';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { gamesOf } from '../shared/lines-view.mjs';

const state = vi.hoisted(() => ({ lines: null }));
vi.mock('../web/src/next/lines/GameDetailsSlot.jsx', async () => ({ GameDetailsSlot: (await import('../web/src/next/lines/GameDetails.jsx')).default }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), linesApi: vi.fn(), communityApi: vi.fn(), betsApi: vi.fn(), readTeams: vi.fn() }));
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: () => state.lines }));
vi.mock('../web/src/next/lines/useGameLines.js', () => ({ useGameLines: () => ({ status: 'loading', data: null }), useBoardLines: () => ({ status: 'loading', data: null, reload: vi.fn() }) }));
vi.mock('../web/src/next/research/useResearch.js', async importOriginal => ({ ...(await importOriginal()), useResearch: () => ({ status: 'loading', data: null, reload: () => {} }) }));
vi.mock('../web/src/next/lines/trendsHooks.js', () => ({ useOfficials: () => null, useWind: () => ({ loading: false, wind: null, now: null }), useTrendWeek: () => ({ status: 'ready', week }) }));

const { ShellContext } = await import('../web/src/next/shell/context.js');
const { GameLayer } = await import('../web/src/next/lines/GameLayer.jsx');
const { GamesScreen } = await import('../web/src/next/lines/GamesScreen.jsx');
const { rememberBoard } = await import('../web/src/next/lines/boardContext.js');

const GAMES = week.games.map(g => ({ id: g.id, away: g.away, home: g.home, awayCode: g.away, homeCode: g.home, kickoff: g.kickoff }));
const NOW = Date.parse(week.games[0].kickoff) - 24 * 3_600_000;
const personal = { season: 2026, week: 6, now: new Date(NOW).toISOString(), deadline: week.games[0].kickoff, games: GAMES,
  rules: { sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' }, ballots: { guess_spread: { picks: { 'SEA-DEN': 4 } }, guess_total: { picks: {} } } };
const lines = (patch = {}) => ({ app: { accountId: 'fixture-account', refresh: vi.fn(), requestSignIn: vi.fn() }, personal: { status: 'ready', data: personal, error: null },
  community: { week: { season: 2026, week: 6 }, optOuts: [] }, shown: { season: 2026, week: 6 }, trends: { status: 'ready', week }, trendsWeek: week, records: null, ...patch });
const shellOf = views => ({ state: { tab: 'research', views: { research: { section: 'games' }, lines: {}, ...views }, sheets: [] },
  setView: vi.fn(), go: vi.fn(), openSheet: vi.fn(), setDirty: vi.fn(), confirmLeave: vi.fn(() => true), reload: vi.fn() });
const render = (node, shell = shellOf({})) => renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx">{node}</div></ShellContext.Provider>);
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));
const byClass = (html, cls) => nodes(html).filter(n => (n.attrs?.class ?? '').split(/\s+/).includes(cls));

afterEach(() => { state.lines = null; rememberBoard(null); });

describe('the game layer', () => {
  const order = gamesOf(personal);
  const titleOf = g => `${g.away} @ ${g.home}`;
  it('one nesting card under a Games lip: the page title, the game’s heading, its place and both neighbours, the details', () => {
    state.lines = lines();
    const html = render(<GameLayer id={order[1].id}/>);
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html).filter(n => n.attrs?.['data-research'] === 'game')).toHaveLength(1);
    expect(nodes(html).filter(n => n.tag === 'h1').map(textOf)).toEqual(['Games']);
    const heading = nodes(html).find(n => n.tag === 'h2' && n.attrs['data-route-focus'] !== undefined);
    expect(textOf(heading)).toBe(titleOf(order[1]));
    expect(byClass(html, 'gx-nest-lip').map(nameFrom)).toEqual(['Back to Games']);
    expect(textOf(nodes(html).find(n => n.attrs?.['aria-live'] === 'polite'))).toBe(`${titleOf(order[1])}, game 2 of ${order.length}`);
    expect(byClass(html, 'gx-sheet-page').map(n => n.attrs['aria-label'])).toEqual([`Previous game, ${titleOf(order[0])}`, `Next game, ${titleOf(order[2])}`]);
    expect(byClass(html, 'gx-pager-body')[0].attrs.class).toContain('gx-sheet-body--pager');
    // What the sheet held: the market lines, your pick, the trends and the matchup statistics, and both teams as buttons.
    // (The lazy slot is stood in for by GameDetails itself here; its "Game details" region is the browser spec's.)
    expect(nodes(html).some(n => n.attrs?.['aria-label'] === 'Market lines')).toBe(true);
    expect(nodes(html).some(n => n.attrs?.['aria-label'] === 'You on this game')).toBe(true);
    expect(textOf(nodes(html).find(n => n.attrs?.['data-section'] === 'trends'))).toContain('Trends');
    expect(nodes(html).filter(n => n.tag === 'button' && /Open team$/.test(n.attrs['aria-label'] ?? ''))).toHaveLength(2);
    expect(html).toContain('Bet assessments and statistics');
  });
  it('the pager follows the board order captured when the row opened it, for that account and week only', () => {
    state.lines = lines();
    const shown = [order[2].id, order[0].id, ...order.filter((_, i) => i !== 0 && i !== 2).map(g => g.id)];
    rememberBoard({ accountId: 'fixture-account', season: 2026, week: 6, ids: shown, now: NOW, results: {} });
    expect(textOf(nodes(render(<GameLayer id={order[0].id}/>)).find(n => n.attrs?.['aria-live'] === 'polite'))).toMatch(/game 2 of/);
    rememberBoard({ accountId: 'someone-else', season: 2026, week: 6, ids: shown, now: NOW, results: {} });
    expect(textOf(nodes(render(<GameLayer id={order[0].id}/>)).find(n => n.attrs?.['aria-live'] === 'polite'))).toMatch(/game 1 of/);
  });
  it('while the week loads the heading is the game from its address; a game not on this board says so, with the lip back', () => {
    state.lines = lines({ personal: { status: 'loading', data: null, error: null } });
    const loading = render(<GameLayer id="SEA-DEN"/>);
    expect(markupProblems(loading)).toEqual([]);
    expect(textOf(nodes(loading).find(n => n.tag === 'h2'))).toBe('SEA @ DEN');
    expect(nodes(loading).some(n => n.attrs?.['data-skeleton'] === 'panels')).toBe(true);
    state.lines = lines();
    const missing = render(<GameLayer id="XX-YY"/>);
    expect(missing).toContain('This game isn’t on this week’s board.');
    expect(byClass(missing, 'gx-nest-lip').map(nameFrom)).toEqual(['Back to Games']);
    expect(byClass(missing, 'gx-sheet-page')).toHaveLength(0);
  });
  it('Research › Games draws the layer first and keeps the board mounted under it, hidden', () => {
    state.lines = lines();
    const html = render(<GamesScreen/>, shellOf({ lines: { layer: 'game', item: 'SEA-DEN' } }));
    const [kept] = byClass(html, 'gx-kept');
    expect(kept.attrs.hidden).toBe('');
    expect(nodes(html).filter(n => n.tag === 'h1').map(textOf)).toEqual(['Games', 'Games']);
    expect(html.indexOf('data-research="game"')).toBeLessThan(html.indexOf('gx-kept'));
    expect(byClass(render(<GamesScreen/>, shellOf({ lines: { layer: 'nope', item: 'SEA-DEN' } })), 'gx-kept')[0].attrs.hidden).toBeUndefined();
  });
});
