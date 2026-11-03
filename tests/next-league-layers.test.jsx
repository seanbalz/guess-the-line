// D-69 step 1 (P6A): League as Play layers, rendered statically with the reads stood in for. Contracts: the landing is
// the board first (market switch, your rank chip, the total at the end, no race strip), then the two newest posts with NEW
// on one this device had not shown, "Open the feed" and History; the feed is its own layer under the League lip; the
// Play landing's League tile shows NEW while a League moment waits. Fixture people only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ app: null, feed: null, read: null, waiting: 0 }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), leagueApi: vi.fn(), meApi: vi.fn(), date: value => String(value) }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => state.app }));
vi.mock('../web/src/next/features/useFeatures.js', () => ({ useFeatures: () => ({ model: null }) }));
vi.mock('../web/src/next/feed/useLeagueFeed.js', () => ({ useLeagueFeed: () => state.feed, feedReaderKnown: () => true }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: () => state.read, LeagueFailure: () => null, LeagueLoading: () => null, LeagueEmpty: () => null }));
vi.mock('../web/src/next/league/LeagueHistory.jsx', () => ({ LeagueHistory: () => null }));
vi.mock('../web/src/fantasyData.js', () => ({ fantasyWeekKey: (season, week) => `${season}-${String(week).padStart(2, '0')}`, useFantasySnapshot: () => ({ status: 'loading' }) }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({ useMoments: () => null, useMomentScope: () => {}, usePopped: () => false, useNewCount: () => state.waiting }));
vi.mock('../web/src/next/play/PlayTile.jsx', () => ({ PlayTile: ({ label, big, sub, tone, isNew, ariaLabel }) => <output data-label={label} data-big={big} data-sub={sub} data-tone={tone} data-new={String(isNew)} aria-label={ariaLabel}/> }));
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { LeagueScreen } = await import('../web/src/next/league/LeagueScreen.jsx');
const { LeagueTile } = await import('../web/src/next/league/LeagueTile.jsx');
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
function render(node, league = {}) {
  state.app = { accountId: YOU, league: { id: 'community', name: 'Community', community: true }, leagues: [{ id: 'community', on: true, players: 2 }],
    community: { status: 'ready', data: community, error: null }, refresh: vi.fn(), requestSignIn: vi.fn(), chooseLeague: vi.fn(), mutateCommunity: vi.fn() };
  state.feed = { status: 'ready', page: { posts, members, now: '2026-11-03T00:00:00Z', next: null }, posts, next: null, busy: false, error: null, more: vi.fn(), retry: vi.fn() };
  shell.state = { views: { play: { section: 'league' }, league }, trail: [] };
  vi.stubGlobal('localStorage', { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) });
  return renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx">{node}</div></ShellContext.Provider>).replace(/<!-- -->/g, '');
}
afterEach(() => { store.clear(); state.waiting = 0; vi.unstubAllGlobals(); });

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
    expect(find(preview, cls('gx-feed-new')).map(readText)).toEqual(['NEW']);
    expect(find(root, n => n.tag === 'button').map(nameFrom)).toEqual(expect.arrayContaining(['Back to Play', 'Your leagues', 'Open the feed', 'History · Seasons and weeks']));
  });
  it('the feed is its own layer under the League lip, with every post and no preview', () => {
    const root = parseMarkup(render(<LeagueScreen/>, { view: 'feed' }));
    expect(find(root, n => n.tag === 'h2').map(readText)).toEqual(['Feed']);
    expect(find(root, cls('gx-nest-lip')).map(nameFrom)).toEqual(['Back to Play', 'Back to League']);
    expect(find(root, n => n.tag === 'article')).toHaveLength(3);
    expect(find(root, n => n.attrs['data-league'] === 'preview')).toHaveLength(0);
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
});
