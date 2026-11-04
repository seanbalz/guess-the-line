// D-69 step 2 (H1A): Home's This week game tiles and the Who's in layer, rendered statically over fixture replies (the
// browser drives them in tests/cloud-browser/next-home-layers.spec.js). Fixture people and games only. Each test names
// the contract it protects.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ home: null, shell: null, clock: null }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn(), socialApi: vi.fn() }));
vi.mock('../web/src/next/home/homeData.js', () => ({ useHomeData: () => state.home }));
vi.mock('../web/src/next/bets/useTicketSummary.js', () => ({ useTicketSummary: () => ({ loading: true, error: null, active: null }) }));
vi.mock('../web/src/next/features/useFeatures.js', () => ({ useFeatures: () => ({ model: null }) }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({ useMoments: () => null, useMomentScope: () => {}, useNewCount: () => 0, useNewMoments: () => [], usePopped: () => false }));
vi.mock('../web/src/next/home/useServerNow.js', async importOriginal => { const actual = await importOriginal(); return { useServerNow: base => (state.clock === null ? actual.useServerNow(base) : base + state.clock) }; });
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { weekGames } = await import('../web/src/next/home/homeModel.js');
const { Home, openAllGames, openGameTile } = await import('../web/src/next/home/Home.jsx');

const THU = '2026-11-06T01:15:00.000Z', SUN10 = '2026-11-08T18:00:00.000Z', SUN1 = '2026-11-08T21:05:00.000Z', SUN5 = '2026-11-09T01:20:00.000Z', MON = '2026-11-10T01:15:00.000Z';
const G = (id, kickoff) => { const [away, home] = id.split('-'); return { id, awayCode: away, homeCode: home, away, home, kickoff }; };
const GAMES = [G('SEA-DEN', THU), G('BUF-KC', SUN10), G('LAC-LV', SUN10), G('NYG-PHI', SUN1), G('HOU-JAX', SUN5), G('CHI-GB', MON)];
const BALLOT = { picks: { 'BUF-KC': -4.5, 'LAC-LV': 7.5 }, lockedAt: { 'LAC-LV': '2026-11-04T18:00:00.000Z' }, scoringReferences: { 'LAC-LV': { status: 'available', value: 3.5 } } };
const personal = (extra = {}) => ({ season: 2026, week: 9, now: '2026-11-08T17:00:00.000Z', deadline: THU, rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true },
  games: GAMES, ballots: { guess_spread: BALLOT }, ...extra });
const MEMBERS = ['Casey Moore', 'Avery Stone', 'Blake Rivers', 'Drew Lane', 'Emery Fox'].map(name => ({ id: `u-${name.split(' ')[0].toLowerCase()}`, displayName: name, removed: false }));
const sent = userId => ({ userId, mode: 'guess_spread', submittedAt: '2026-11-04T18:00:00Z', satOut: false, late: null });
const community = { viewer: 'u-casey', members: MEMBERS, week: { season: 2026, week: 9, deadline: THU, games: 6 }, optOuts: [],
  due: [{ mode: 'guess_spread', submitted: false, satOut: false, filled: 2, games: 6 }, { mode: 'guess_total', submitted: false, satOut: false, filled: 0, games: 6 }],
  submissions: [sent('u-avery'), sent('u-blake'), sent('u-drew'), { userId: 'u-emery', mode: 'guess_spread', submittedAt: null, satOut: true, late: null }],
  standings: [], posts: [], picksDue: { state: 'due', week: 9, deadline: THU, opensAt: '2026-11-02T08:00:00.000Z', now: '2026-11-03T20:00:00.000Z', modes: [] } };
const ready = data => ({ status: 'ready', data, error: null });
const app = { accountId: 'u-casey', refresh: vi.fn(), league: { name: 'Community', community: true } };
function home({ personal: read, community: reply = community, status = 'ready' } = {}, view = {}) {
  state.home = { app, viewer: 'u-casey', personal: read, community: { status, data: reply, error: status === 'error' ? { status: 503 } : null, loading: status === 'loading' } };
  state.shell = { state: { tab: 'home', sheets: [], views: { home: view }, trail: [] }, go: vi.fn(), setView: vi.fn(), openSheet: vi.fn(), tab: vi.fn(), reload: vi.fn(), league: { name: 'Community' } };
}
const render = () => renderToStaticMarkup(<ShellContext.Provider value={state.shell}><div className="gx"><Home/></div></ShellContext.Provider>);
const nodes = (root, test) => [...walk(typeof root === 'string' ? parseMarkup(root) : root)].filter(n => n.tag && test(n));
const byAttr = (root, name, value) => nodes(root, n => n.attrs[name] === value);
const under = (n, test) => { for (let a = n.parent; a; a = a.parent) if (a.attrs && test(a)) return true; return false; };
/** What a sighted reader sees, word runs joined by spaces: no sr-only and no aria-hidden text. */
const shown = n => [...walk(n)].filter(x => x.text !== undefined && !under(x, a => a.attrs['aria-hidden'] === 'true' || (a.attrs.class ?? '').split(/\s+/).includes('gx-sr-only')))
  .map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();
const longLines = html => nodes(html, n => n.attrs['aria-hidden'] !== 'true').map(n => n.children.filter(c => c.text !== undefined).map(c => c.text).join(' ').replace(/\s+/g, ' ').trim())
  .filter(text => text.split(' ').filter(w => w && w !== '·').length > 12);

afterEach(() => { state.home = null; state.shell = null; state.clock = null; vi.clearAllMocks(); });

describe('This week (H1A)', () => {
  it('a heading with the game count, the next four games as tiles with your own Spread word, then All N games', () => {
    home({ personal: ready(personal()) });
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    const week = byAttr(html, 'data-home', 'week')[0];
    expect(shown(nodes(week, n => n.tag === 'h2')[0])).toBe('This week');
    expect(shown(week)).toContain('Week 9 · 6 games');
    expect(nodes(week, n => n.tag === 'button' && n.attrs.id).map(b => b.attrs.id)).toEqual(['BUF-KC', 'LAC-LV', 'NYG-PHI', 'HOU-JAX'].map(id => `gx-h-game-${id}`));
    const tiles = nodes(week, n => n.tag === 'li' && n.attrs['data-game-tile']);
    expect(tiles.map(li => li.attrs['data-game-tile'])).toEqual(['BUF-KC', 'LAC-LV', 'NYG-PHI', 'HOU-JAX']);
    expect(tiles.map(li => nameFrom(nodes(li, n => n.tag === 'button')[0]))).toEqual([
      'Bills at Chiefs, Sun 10:00 AM PT, Spread draft', 'Chargers at Raiders, Sun 10:00 AM PT, Spread locked in',
      'Giants at Eagles, Sun 1:05 PM PT, Spread to pick', 'Texans at Jaguars, Sun 5:20 PM PT, Spread to pick']);
    expect(shown(tiles[1])).toBe('LAC @ LV Sun 10:00 AM PT Locked in');
    expect(nodes(week, n => n.tag === 'button').map(nameFrom).at(-1)).toBe('All 6 games');
    expect(nodes(html, n => /\bgx-btn--primary\b/.test(n.attrs.class ?? ''))).toHaveLength(1);
    expect(longLines(html)).toEqual([]);
  });

  it('D-31: a game tile shows your own state word only: no pick, no line and nothing of another player, in its words or its name', () => {
    home({ personal: ready(personal({ others: [{ userId: 'u-troy', name: 'Troy', picks: { 'BUF-KC': 6.5 } }] })) });
    const week = byAttr(render(), 'data-home', 'week')[0];
    const said = [...walk(week)].flatMap(n => (n.text !== undefined ? [n.text] : n.attrs?.['aria-label'] ? [n.attrs['aria-label']] : [])).join(' ');
    for (const secret of ['6.5', '4.5', '7.5', '3.5', 'u-troy', 'Troy']) expect(said).not.toContain(secret);
  });

  it('while /personal loads: four tile placeholders; no week (404): no section; a failed read: one sentence and Try again', () => {
    home({ personal: { status: 'loading', data: null, error: null } });
    let html = render();
    expect(byAttr(html, 'data-skeleton', 'tiles')).toHaveLength(1);
    expect(byAttr(html, 'data-home', 'week')).toHaveLength(0);
    home({ personal: { status: 'error', data: null, error: { status: 404 } } });
    html = render();
    expect(byAttr(html, 'data-home', 'week')).toHaveLength(0);
    expect(byAttr(html, 'data-skeleton', 'tiles')).toHaveLength(0);
    home({ personal: { status: 'error', data: null, error: { status: 503 } } });
    html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(shown(byAttr(html, 'data-home', 'week')[0])).toBe('This week This week’s games didn’t load. Try again');
  });
});

describe('This week opens the right places (requirement 4)', () => {
  it('a tile opens that game’s Spread picks card; All N games opens Research › Games', () => {
    home({ personal: ready(personal()) });
    openGameTile(state.shell, weekGames(personal()).games[0]);
    expect(state.shell.go).toHaveBeenCalledWith('play', expect.objectContaining({ section: 'picks', market: 'spread', season: 2026, week: 9, pickGame: 'BUF-KC' }));
    openAllGames(state.shell);
    expect(state.shell.go).toHaveBeenLastCalledWith('research', { section: 'games', season: null, week: null });
  });

  it('the section always names the week of the games shown, even when Community is on another week', () => {
    home({ personal: ready(personal({ week: 10 })) });
    expect(shown(nodes(byAttr(render(), 'data-home', 'week')[0], n => (n.attrs.class ?? '').includes('gx-t-meta'))[0])).toBe('Week 10 · 6 games');
  });
});

describe('Who’s in, a Home layer (#home?layer=who)', () => {
  it('a nesting card under a Home lip: every member with their word, Standings and Invite, and no next-move card', () => {
    home({ personal: ready(personal()) }, { layer: 'who' });
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(byAttr(html, 'data-home', 'hero')).toHaveLength(0);
    const layer = byAttr(html, 'data-home', 'who-layer')[0];
    expect(nodes(layer, n => n.tag === 'button').map(nameFrom)).toEqual(['Back to Home', 'Standings', 'Invite']);
    expect(shown(nodes(layer, n => n.tag === 'h2')[0])).toBe('Who’s in');
    expect(shown(nodes(layer, n => (n.attrs.class ?? '').includes('gx-meta-line'))[0])).toBe('Community · Week 9 · Spread ballots 4 of 5 in');
    const people = nodes(layer, n => n.tag === 'li' && (n.attrs.class ?? '').includes('gx-h-person'));
    expect(people).toHaveLength(5);
    expect(readText(people[0])).toContain('Casey Moore · You');
    expect(readText(people[0])).toContain('Not yet');
    expect(longLines(html)).toEqual([]);
  });

  it('while the Community read loads the layer shows row placeholders; a failed read is one sentence and Try again', () => {
    home({ community: null, status: 'loading' }, { layer: 'who' });
    expect(byAttr(render(), 'data-skeleton', 'rows')).toHaveLength(1);
    home({ community: null, status: 'error' }, { layer: 'who' });
    const layer = byAttr(render(), 'data-home', 'who-layer')[0];
    expect(nodes(layer, n => n.tag === 'button').map(nameFrom)).toEqual(['Back to Home', 'Try again', 'Standings', 'Invite']);
  });
});

describe('This week keeps the server’s clock (carry-over 1)', () => {
  const ids = html => nodes(byAttr(html, 'data-home', 'week')[0], n => n.tag === 'li' && n.attrs['data-game-tile']).map(li => li.attrs['data-game-tile']);
  const wordOf = (html, id) => shown(nodes(html, n => n.tag === 'li' && n.attrs['data-game-tile'] === id)[0]);

  it('a game that kicks off while Home stays open reads Closed at kickoff and the window moves on, with no reload', () => {
    home({ personal: ready(personal()) });
    state.clock = 0;
    const before = render();
    expect(ids(before)).toEqual(['BUF-KC', 'LAC-LV', 'NYG-PHI', 'HOU-JAX']);
    expect(wordOf(before, 'NYG-PHI')).toContain('To pick');
    // 4 h 30 min of this device's elapsed time: the 10:00 AM games and the 1:05 PM game are over, the server's clock says so.
    state.clock = 4.5 * 3_600_000;
    const after = render();
    expect(ids(after)).toEqual(['LAC-LV', 'NYG-PHI', 'HOU-JAX', 'CHI-GB']);
    expect(wordOf(after, 'NYG-PHI')).toContain('Closed at kickoff');
    expect(wordOf(after, 'NYG-PHI')).not.toContain('To pick');
  });

  it('the device clock is never the source of truth: a device date years off changes nothing', () => {
    home({ personal: ready(personal()) });
    state.clock = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2031-01-01T00:00:00Z'));
      expect(ids(render())).toEqual(['BUF-KC', 'LAC-LV', 'NYG-PHI', 'HOU-JAX']);
    } finally { vi.useRealTimers(); }
  });

  it('a malformed server now or deadline draws the week without throwing; with no clock a tile never reads To pick', () => {
    home({ personal: ready(personal({ now: 'soon', deadline: 'later' })) });
    let html;
    expect(() => { html = render(); }).not.toThrow();
    const tiles = nodes(byAttr(html, 'data-home', 'week')[0], n => n.tag === 'li' && n.attrs['data-game-tile']);
    expect(tiles.length).toBeGreaterThan(0);
    for (const li of tiles) expect(shown(li)).toMatch(/Closed at kickoff|Locked in|Draft/);
  });
});
