import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { matchups } from './helpers/ui-markup.mjs';
import { teamMarks } from '../web/src/teamLogoRegistry.js';

// P-02 / D-56: the Community feed words the two Points post kinds. Rendered through LeagueScreen (postText is private).
const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002';
const state = vi.hoisted(() => ({ app: null }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => state.app }));
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ state: { views: {} }, go: vi.fn(), setView: vi.fn(), openSheet: vi.fn() }) }));
vi.mock('../web/src/next/league/LeagueHistory.jsx', () => ({ LeagueHistory: () => null }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: () => ({ loading: true }), LeagueFailure: () => null }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), date: value => String(value) }));
const { LeagueScreen } = await import('../web/src/next/league/LeagueScreen.jsx');

const post = (id, patch) => ({ id, actorId: A, season: 2026, week: 8, mode: null, createdAt: '2026-11-01T18:00:00Z', likes: 0, likedByMe: false, comments: [], payload: {}, ...patch });
function feedText(posts) {
  state.app = { accountId: A, league: { community: true, name: 'Community' }, refresh: vi.fn(), community: { status: 'ready', data: { viewer: A, members: [{ id: A, displayName: 'Ana' }, { id: B, displayName: 'Bo' }], posts, standings: [] } } };
  return renderToStaticMarkup(<LeagueScreen/>).replace(/<!-- -->/g, '');
}

describe('Points posts in the Community feed', () => {
  it('words points_played and a single-winner points_final', () => {
    const html = feedText([
      post('00000000-0000-4000-8000-0000000000a1', { kind: 'points_played' }),
      post('00000000-0000-4000-8000-0000000000a2', { kind: 'points_final', payload: { winners: [{ userId: A, points: 38.4 }], house: 31.2, max: 5 } }),
    ]);
    expect(html).toContain('is playing Week 8 Points.');
    expect(html).toContain('won Week 8 Points with 38.4 · House 31.2 · FINAL.');
  });
  it('shares a tied win and shows a missing House as "—" (brand rule)', () => {
    const html = feedText([post('00000000-0000-4000-8000-0000000000a3', { kind: 'points_final', payload: { winners: [{ userId: A, points: 38 }, { userId: B, points: 38 }], house: null, max: 5 } })]);
    expect(html).toContain('tied for the win in Week 8 Points with 38 · House — · FINAL.');
  });
});

describe('a ballot post’s shown picks (D-62)', () => {
  it('draws each game as marks, away first, beside its pick, read as one sentence', () => {
    const html = feedText([post('00000000-0000-4000-8000-0000000000a4', { kind: 'ballot_submitted', mode: 'guess_spread', picks: { 'SEA-DEN': -3, 'KC-LV': 2.5 }, hiddenGames: [] })]);
    expect(matchups(html)).toEqual([
      { srcs: [teamMarks.SEA.src, teamMarks.DEN.src], name: 'Seattle Seahawks at Denver Broncos' },
      { srcs: [teamMarks.KC.src, teamMarks.LV.src], name: 'Kansas City Chiefs at Las Vegas Raiders' },
    ]);
    expect(html).not.toContain('SEA at DEN');
  });
});
