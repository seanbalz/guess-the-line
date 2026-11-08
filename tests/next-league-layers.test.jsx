// D-69 step 1 (P6A): League as Play layers, rendered statically with the reads stood in for. Contracts: the landing is
// the board first (market switch, your rank chip, the total at the end, no race strip), then the two newest posts with NEW
// on one this device had not shown, "Open the feed" and History; the feed is its own layer under the League lip; the
// Play landing's League tile shows NEW while a League moment waits. Fixture people only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ app: null, feed: null, read: null, waiting: 0, links: [] }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), leagueApi: vi.fn(), meApi: vi.fn(), date: value => String(value) }));
// Every LinkRow draws as usual, and its props are kept so a test can press it (the markup is static, so it has no click).
vi.mock('../web/src/next/ui/index.js', async importOriginal => { const actual = await importOriginal(); return { ...actual, LinkRow: props => { state.links.push(props); return actual.LinkRow(props); } }; });
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => state.app }));
vi.mock('../web/src/next/features/useFeatures.js', () => ({ useFeatures: () => ({ model: null }) }));
vi.mock('../web/src/next/feed/useLeagueFeed.js', () => ({ useLeagueFeed: () => state.feed, feedReaderKnown: () => true }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: () => state.read, LeagueFailure: () => null, LeagueLoading: () => null, LeagueEmpty: () => null }));
vi.mock('../web/src/fantasyData.js', () => ({ fantasyWeekKey: (season, week) => `${season}-${String(week).padStart(2, '0')}`, useFantasySnapshot: () => ({ status: 'loading' }) }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({ useMoments: () => null, useMomentScope: () => {}, usePopped: () => false, useNewCount: () => state.waiting }));
vi.mock('../web/src/next/play/PlayTile.jsx', () => ({ PlayTile: ({ label, big, sub, tone, isNew, ariaLabel }) => <output data-label={label} data-big={big} data-sub={sub} data-tone={tone} data-new={String(isNew)} aria-label={ariaLabel}/> }));
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { LeagueScreen } = await import('../web/src/next/league/LeagueScreen.jsx');
const { LeagueHistory } = await import('../web/src/next/league/LeagueHistory.jsx');
const { leagueLayer } = await import('../web/src/next/league/leagueModel.js');
const { LeagueTile, LeaguePodium } = await import('../web/src/next/league/LeagueTile.jsx');
const { seenKey } = await import('../web/src/next/feed/feedModel.js');
const { rankKey } = await import('../web/src/next/league/rankMoment.js');

const YOU = 'u-casey', BLAKE = 'u-blake';
const members = [{ id: YOU, displayName: 'Casey Moore' }, { id: BLAKE, displayName: 'Blake Rivers' }];
const standing = (userId, seasonPoints) => ({ userId, mode: 'guess_spread', seasonPoints, seasonScored: 6, weekPoints: 4, weekScored: 2 });
const post = (id, createdAt) => ({ id, actorId: BLAKE, kind: 'joined', season: 2026, week: 8, mode: null, leagueId: null, createdAt, reactions: { counts: {}, total: 0, mine: null }, commentCount: 0, comments: [], embed: {} });
const posts = [post('p1', '2026-11-02T18:00:00Z'), post('p2', '2026-10-30T18:00:00Z'), post('p3', '2026-10-29T18:00:00Z')];
const community = { viewer: YOU, week: { season: 2026, week: 8 }, members, posts, standings: [standing(BLAKE, 24), standing(YOU, 21.5)] };
const shell = { state: null, go: vi.fn(), back: vi.fn(), setView: vi.fn(), openSheet: vi.fn(), openPopover: vi.fn(), toast: vi.fn() };
const store = new Map();
const find = (node, test) => [...walk(node)].filter(n => n.tag && test(n));
const cls = name => n => (n.attrs.class ?? '').split(/\s+/).includes(name);
function render(node, league = {}, app = {}, feedState = {}) {
  state.app = { accountId: YOU, league: { id: 'community', name: 'Community', community: true }, leagues: [{ id: 'community', on: true, players: 2 }],
    community: { status: 'ready', data: community, error: null }, refresh: vi.fn(), requestSignIn: vi.fn(), chooseLeague: vi.fn(), mutateCommunity: vi.fn(), ...app };
  state.feed = { status: 'ready', page: { posts, members, now: '2026-11-03T00:00:00Z', next: null }, posts, next: null, busy: false, error: null, more: vi.fn(), retry: vi.fn(), ...feedState };
  shell.state = { views: { play: { section: 'league' }, league }, trail: [] };
  vi.stubGlobal('localStorage', { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) });
  return renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx">{node}</div></ShellContext.Provider>).replace(/<!-- -->/g, '');
}
afterEach(() => { store.clear(); state.waiting = 0; state.read = null; state.links = []; shell.go.mockClear(); vi.unstubAllGlobals(); });
const press = text => state.links.find(link => link.children === text || (Array.isArray(link.children) && link.children.some(child => child === text)))?.onClick();

describe('League, board first (P6A)', () => {
  it('the landing: the league\'s board, your rank chip and total, then the newest two posts with NEW, the feed and History', () => {
    store.set(seenKey(YOU, null), '2026-11-01T00:00:00Z');
    const html = render(<LeagueScreen/>);
    expect(markupProblems(html)).toEqual([]);
    const root = parseMarkup(html), mine = find(root, n => n.attrs['data-board-row'] === YOU)[0];
    expect([find(root, n => n.tag === 'h1').map(readText), readText(find(root, n => n.tag === 'h2')[0])]).toEqual([['League'], 'Community']);
    expect(find(root, n => n.attrs['aria-label'] === 'Standings market')).toHaveLength(1);
    expect(find(mine, n => n.attrs['data-board'] === 'chip').map(readText)).toEqual(['2nd']);
    expect(find(mine, n => n.attrs['data-board'] === 'total').map(readText)).toEqual(['21.5']);
    expect(find(root, cls('gx-strip'))).toHaveLength(0);
    const preview = find(root, n => n.attrs['data-league'] === 'preview')[0];
    expect(find(preview, n => n.tag === 'article').map(a => a.attrs['data-post'])).toEqual(['p1', 'p2']);
    expect(readText(preview)).toContain('1 new post');
    expect(find(preview, cls('gx-new')).map(readText)).toEqual(['NEW']);
    expect(find(root, n => n.tag === 'button').map(nameFrom)).toEqual(expect.arrayContaining(['Back to Play', 'Your leagues', 'Open the feed', 'History · Seasons and weeks']));
  });
  it('the feed is its own layer under the League lip, with every post and no preview', () => {
    const root = parseMarkup(render(<LeagueScreen/>, { view: 'feed' }));
    expect(find(root, n => n.tag === 'h2').map(readText)).toEqual(['Feed']);
    expect(find(root, cls('gx-nest-lip')).map(nameFrom)).toEqual(['Back to Play', 'Back to League']);
    expect(find(root, n => n.tag === 'article')).toHaveLength(3);
    expect(find(root, n => n.attrs['data-league'] === 'preview')).toHaveLength(0);
  });
  it('a private group whose feed was refused shows none of its posts, on the landing or in the feed layer', () => {
    const group = { league: { id: 'g1', name: 'Fixture Group', community: false }, leagues: [{ id: 'g1', on: true, players: 5 }] };
    const refused = { status: 'error', page: null, posts: [], next: null, error: { status: 403, message: 'This group is no longer available.' } };
    state.read = { loading: false, data: null, error: refused.error };
    for (const view of [{}, { view: 'feed' }]) {
      expect(find(parseMarkup(render(<LeagueScreen/>, view, group, refused)), n => n.tag === 'article'), JSON.stringify(view)).toHaveLength(0);
    }
    const shown = find(parseMarkup(render(<LeagueScreen/>, { view: 'feed' }, group)), n => n.tag === 'article');
    expect(shown.length, 'the same screen with a good feed does show the posts').toBeGreaterThan(0);
  });
  it('the League tile: your Spread rank, the move and "New posts" from the Community read; NEW while a League moment waits', () => {
    store.set(seenKey(YOU, null), '2026-11-01T00:00:00Z');
    store.set(rankKey(YOU, 'community', 'guess_spread'), JSON.stringify({ rank: 3, from: null }));
    state.waiting = 1;
    expect(find(parseMarkup(render(<LeagueTile onOpen={vi.fn()}/>)), n => n.tag === 'output')[0].attrs).toMatchObject({ 'data-label': 'League', 'data-big': '2nd',
      'data-sub': '▲ 1 · New posts', 'data-tone': 'good', 'data-new': 'true', 'aria-label': 'League, 2nd on the Spread board, up 1, new posts' });
    state.waiting = 0;
    expect(find(parseMarkup(render(<LeagueTile onOpen={vi.fn()}/>)), n => n.tag === 'output')[0].attrs['data-new']).toBe('false');
  });
  it('the League tile says "new" whenever NEW shows: a waiting rank moment with no new posts, and a private group', () => {
    const tile = node => find(parseMarkup(render(node.element, {}, node.app)), n => n.tag === 'output')[0].attrs;
    store.set(seenKey(YOU, null), '2026-11-03T00:00:00Z'); // every post already shown: nothing new in the feed
    state.waiting = 1;
    expect(tile({ element: <LeagueTile onOpen={vi.fn()}/> })).toMatchObject({ 'data-new': 'true', 'aria-label': 'League, 2nd on the Spread board, new' });
    const group = { league: { id: 'g1', name: 'Fixture Group', community: false }, leagues: [{ id: 'g1', on: true, players: 5 }] };
    expect(tile({ element: <LeagueTile onOpen={vi.fn()}/>, app: group })).toMatchObject({ 'data-new': 'true', 'aria-label': 'League, 5 players, new' });
    store.set(seenKey(YOU, null), '2026-11-01T00:00:00Z'); // new posts and a waiting moment: "new" once
    expect(tile({ element: <LeagueTile onOpen={vi.fn()}/> })['aria-label']).toBe('League, 2nd on the Spread board, new posts');
  });
});

describe('League › History (P6A)', () => {
  const SEA = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-09T00:15:00Z' }, BUF = { id: 'BUF-KC', awayCode: 'BUF', homeCode: 'KC', kickoff: '2026-10-12T20:25:00Z' };
  const HISTORY = { viewer: YOU, season: 2026, seasons: [2026], members, weeks: [{ season: 2026, week: 5, games: [SEA, BUF],
    results: { 'SEA-DEN': { status: 'final', away: 20, home: 17, source: 'Fixture final', origin: 'settlement' } }, entries: [
      { userId: YOU, mode: 'guess_spread', status: 'submitted', submittedAt: '2026-10-08T18:00:00Z', eligible: true, weekPoints: 15, weekScored: 2, games: 2, picks: [
        { gameId: 'SEA-DEN', guess: -3, points: 10, reference: { basis: 'saved', status: 'available', value: -3, source: 'Fixture median' } },
        { gameId: 'BUF-KC', guess: 2.5, points: 5, reference: { basis: 'commissioner-ruled', value: 0, decision: 'D-25' } }] },
      { userId: BLAKE, mode: 'guess_spread', status: 'submitted', eligible: true, weekPoints: 12, weekScored: 2, games: 2, picksHidden: true, picks: null }] }] };
  it('History: you first among the player chips, and week tiles with the week\'s points and shared rank', () => {
    state.read = { loading: false, error: null, data: HISTORY, retry: vi.fn() };
    const html = render(<LeagueScreen/>, { view: 'history' });
    expect(markupProblems(html)).toEqual([]);
    const root = parseMarkup(html);
    expect(find(root, n => n.tag === 'h2').map(readText)).toEqual(['History · Spread']);
    expect(find(find(root, n => n.attrs['aria-label'] === 'Player')[0], n => n.tag === 'button').map(readText)).toEqual(['You', 'Blake Rivers']); // faces are aria-hidden
    expect(find(root, n => n.tag === 'button' && n.attrs['aria-label']?.startsWith('Week ')).map(n => n.attrs['aria-label'])).toEqual(['Week 5, 15 points, 1st of 2']);
  });
  it('a week layer: each game a disclosure with the line\'s fine print, and Your score for your own week', () => {
    state.read = { loading: false, error: null, data: HISTORY, retry: vi.fn() };
    const html = render(<LeagueScreen/>, { view: 'history', week: 5 });
    expect(markupProblems(html)).toEqual([]);
    const root = parseMarkup(html), games = find(root, n => n.tag === 'details');
    expect(readText(find(root, n => n.tag === 'h2')[0])).toBe('Week 5 · 2026');
    expect(find(root, cls('gx-nest-lip')).map(nameFrom)).toEqual(['Back to Play', 'Back to League', 'Back to History']);
    expect(games.map(g => nameFrom(find(g, n => n.tag === 'summary')[0]))).toEqual([
      'Seattle Seahawks at Denver Broncos · Line Broncos −3 · You Broncos −3 · 10 / 10', 'Buffalo Bills at Kansas City Chiefs · Line Even · You Bills −2.5 · 5 / 10']);
    expect([readText(games[0]), readText(games[1])]).toEqual([expect.stringContaining('Final · SEA 20, DEN 17 · Seahawks by 3 · Fixture final'), expect.stringContaining('Commissioner-ruled line (D-25)')]);
    expect(find(root, n => n.tag === 'button').map(nameFrom)).toContain('Every game in Your score');
  });
  it('Every game in Your score hands off the week and the market: the layer calls onScore, and the screen goes to Score', () => {
    state.read = { loading: false, error: null, data: HISTORY, retry: vi.fn() };
    const onScore = vi.fn(), spread = leagueLayer({ view: 'history', week: 5 });
    render(<LeagueHistory app={{ accountId: YOU, requestSignIn: vi.fn(), refresh: vi.fn() }} place={spread} mode="guess_spread" onPlace={vi.fn()} onScore={onScore}/>);
    press('Every game in Your score');
    expect(onScore).toHaveBeenCalledExactlyOnceWith(2026, 5, 'guess_spread');
    onScore.mockClear(); state.links = [];
    render(<LeagueHistory app={{ accountId: YOU, requestSignIn: vi.fn(), refresh: vi.fn() }} place={spread} mode="guess_total" onPlace={vi.fn()} onScore={onScore}/>);
    press('Every game in Your score');
    expect(onScore).toHaveBeenCalledExactlyOnceWith(2026, 5, 'guess_total');
    // The screen's mapping: the market becomes the Score page's 'spread' or 'total'.
    state.links = [];
    render(<LeagueScreen/>, { view: 'history', week: 5 });
    press('Every game in Your score');
    expect(shell.go).toHaveBeenLastCalledWith('play', { section: 'score', season: 2026, week: 5, market: 'spread' });
    state.links = [];
    render(<LeagueScreen/>, { view: 'history', week: 5, market: 'total' });
    press('Every game in Your score');
    expect(shell.go).toHaveBeenLastCalledWith('play', { section: 'score', season: 2026, week: 5, market: 'total' });
  });
  it('season tiles carry their own names: "Season 2026, showing" for the one on, "Season 2025" for the other', () => {
    state.read = { loading: false, error: null, data: { ...HISTORY, seasons: [2026, 2025] }, retry: vi.fn() };
    const tiles = find(find(parseMarkup(render(<LeagueScreen/>, { view: 'history' })), n => n.attrs['aria-label'] === 'Seasons')[0], n => n.tag === 'button');
    expect(tiles.map(tile => [tile.attrs['aria-label'], tile.attrs['aria-pressed']])).toEqual([['Season 2026, showing', 'true'], ['Season 2025', 'false']]);
  });
});

it('the approved support podium outlines only the actual top-three place; unranked and lower ranks receive no false highlight', () => {
  expect(renderToStaticMarkup(<LeaguePodium rank={2}/>)).toContain('data-place="2" data-you="true"');
  for (const rank of [null, 4]) expect(renderToStaticMarkup(<LeaguePodium rank={rank}/>)).not.toContain('data-you');
});
