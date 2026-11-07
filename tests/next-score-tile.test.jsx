// D-69 Play landing (P1B): the Your score tile. It reuses the shared home-score history read, shows the latest scored
// week of one market and the board's last move, and says NEW while a score moment waits. Fixture data only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));
const view = vi.hoisted(() => ({ play: {} }));
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ state: { views: { play: view.play } }, go: vi.fn(), setView: vi.fn() }) }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: vi.fn() }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({ useMoments: () => null, useNewCount: vi.fn(() => 0) }));
// The tile's props are the contract here; PlayTile's own drawing is Task 1's test.
vi.mock('../web/src/next/play/PlayTile.jsx', () => ({ PlayTile: props => { globalThis.__scoreTile = props; return null; } }));
import { useAppData } from '../web/src/next/data/AppData.jsx';
import { useLeagueRead } from '../web/src/next/league/useLeagueRead.jsx';
import { useNewCount } from '../web/src/next/moments/MomentsProvider.jsx';
import { ScoreTile } from '../web/src/next/play/ScoreTile.jsx';

const ME = 'u-me', game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:05:00Z' };
const week = (n, points) => ({ season: 2026, week: n, games: [game], entries: points === null ? [] : [{ userId: ME, mode: 'guess_spread', status: 'submitted', eligible: true, weekPoints: points, picks: [{ gameId: game.id, guess: -3, lockedIn: true, points, reference: { value: -3 } }] }] });
const history = { viewer: ME, season: 2026, seasons: [2026], weeks: [week(7, 6), week(8, 10), week(9, null)] };
const standings = [['u-a', 90], ['u-b', 80], [ME, 70]].map(([userId, seasonPoints]) => ({ userId, mode: 'guess_spread', seasonPoints, seasonScored: 9 }));
const app = { accountId: ME, requestSignIn: vi.fn(), community: { data: { week: { season: 2026, week: 9 }, standings } } };
const memory = values => { const map = new Map(Object.entries(values)); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) }; };
const tile = (read = { loading: false, error: null, data: history, retry() {} }, onOpen = vi.fn()) => {
  useAppData.mockReturnValue(app); useLeagueRead.mockReturnValue(read);
  renderToStaticMarkup(<ScoreTile onOpen={onOpen}/>);
  return globalThis.__scoreTile;
};

afterEach(() => { delete globalThis.localStorage; useNewCount.mockImplementation(() => 0); view.play = {}; });

describe('ScoreTile (P1B)', () => {
  it('shows the latest scored week from the shared home-score read and opens Your score on that week', () => {
    const onOpen = vi.fn();
    const props = tile(undefined, onOpen);
    expect(props).toMatchObject({ label: 'Your score', icon: 'chart', big: '10', sub: 'Week 8 · 3rd', tone: 'plain', isNew: false });
    const [key, , , options] = useLeagueRead.mock.calls.at(-1);
    expect(key).toBe('u-me:home-score:2026:9'); expect(options).toEqual({ shared: true });
    props.onClick();
    expect(onOpen).toHaveBeenCalledWith({ season: 2026, week: 8, market: 'guess_spread' });
  });
  it('NEW: shows NEW (and says it) while a score moment waits for the score scope', () => {
    useNewCount.mockImplementation(scope => (scope === 'score' ? 1 : 0));
    const props = tile();
    expect(props.isNew).toBe(true);
    expect(props.ariaLabel).toBe('Your score, Week 8 Spread, 10 points, season rank 3rd, new result');
  });
  it('NEW: a Community rank move waiting on the market the tile opens shows NEW and says "new" (final review I2)', () => {
    // Rank moves wait on scoreScope(mode) as well as League (league/rankMoment.js); the tile opens Your score on Spread here.
    useNewCount.mockImplementation(scope => (scope === 'score:guess_spread' ? 1 : 0));
    const props = tile();
    expect(props.isNew).toBe(true);
    expect(props.ariaLabel).toBe('Your score, Week 8 Spread, 10 points, season rank 3rd, new result');
  });
  it('NEW: a rank move on the other market stays off this tile, since opening it would not play that move', () => {
    useNewCount.mockImplementation(scope => (scope === 'score:guess_total' ? 1 : 0));
    expect(tile()).toMatchObject({ isNew: false, ariaLabel: 'Your score, Week 8 Spread, 10 points, season rank 3rd' });
    // Play's market is Total, but Total has no scored week, so the tile shows and opens Spread: still not Total's move.
    view.play = { market: 'total' };
    const onOpen = vi.fn(), props = tile(undefined, onOpen);
    expect(props.isNew).toBe(false);
    props.onClick();
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ market: 'guess_spread' }));
  });
  it('the move the League board last showed: a rise reads "▲ 2" in the good tone, a drop "▼ 2" stays plain', () => {
    globalThis.localStorage = memory({ 'gtl.next.rank.v1.u-me.community.guess_spread': JSON.stringify({ rank: 3, from: 5 }) });
    expect(tile()).toMatchObject({ sub: 'Week 8 · ▲ 2', tone: 'good' });
    globalThis.localStorage = memory({ 'gtl.next.rank.v1.u-me.community.guess_spread': JSON.stringify({ rank: 3, from: 1 }) });
    expect(tile()).toMatchObject({ sub: 'Week 8 · ▼ 2', tone: 'plain' });
  });
  it('a read on its way or a failed read shows a dash, never a made-up 0', () => {
    expect(tile({ loading: true, data: null, error: null, retry() {} })).toMatchObject({ big: '—', sub: 'Loading…' });
    expect(tile({ loading: false, data: null, error: { status: 500 }, retry() {} })).toMatchObject({ big: '—', sub: 'Open to retry' });
  });
});

describe('approved full-width Play season card', () => {
  const expanded = data => {
    useAppData.mockReturnValue(app); useLeagueRead.mockReturnValue({ data, loading: false, error: null, retry() {} });
    return renderToStaticMarkup(<ScoreTile expanded onOpen={() => {}}/>);
  };
  it('uses only the selected market’s authoritative personal week totals and preserves genuine zeroes', () => {
    const data = structuredClone(history);
    data.weeks = [week(7, 6), week(8, 0)];
    data.weeks[0].entries.push({ userId: ME, mode: 'guess_total', eligible: true, weekPoints: 999, picks: [] });
    const html = expanded(data);
    expect(html).toContain('Personal season accuracy points · Spread');
    expect(html).toContain('Week 7: 6 cumulative personal points, Week 8: 6 cumulative personal points');
    expect(html).not.toContain('999');
    expect(html).not.toContain('No scored games yet');
  });
  it('keeps missing weeks out of the line graph instead of plotting zero or joining across missing data', () => {
    const html = expanded(history);
    expect(html).toContain('Unscored weeks have no value.');
    expect(html).not.toContain('gx-play-score-chart');
    expect(html).toContain('Week 7: 6 points · Week 8: 10 points');
  });
});
