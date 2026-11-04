// D-69 step 1: the Play landing's Compare tile (P1B). Contracts: it reuses Home's history read (the same key and
// options, so no new read on the landing); it shows your lead over the player Compare opens on; it never shows NEW
// (Compare has no moments); a private league, whose roster the landing never reads, shows the plain label.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../web/src/api.js', () => ({ communityApi: vi.fn(), leagueApi: vi.fn(), cloudApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: vi.fn() }));
import { useAppData } from '../web/src/next/data/AppData.jsx';
import { useLeagueRead } from '../web/src/next/league/useLeagueRead.jsx';
import { CompareTile } from '../web/src/next/play/CompareTile.jsx';
import { markupProblems } from './helpers/ui-markup.mjs';

const SEA = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:05:00Z' };
const BUF = { id: 'BUF-KC', awayCode: 'BUF', homeCode: 'KC', kickoff: '2026-10-26T00:20:00Z' };
const locked = (gameId, guess, line, points) => ({ gameId, guess, points, reference: { value: line, source: 'Fixture' }, lockedIn: true, hidden: false });
const entry = (userId, picks) => ({ userId, mode: 'guess_spread', status: 'draft', eligible: true, picks, hiddenGames: [] });
const history = { viewer: 'me', season: 2026, seasons: [2026], now: '2026-10-24T12:00:00Z',
  members: [{ id: 'me', displayName: 'Sean B' }, { id: 'troy', displayName: 'Troy Jun' }],
  weeks: [{ season: 2026, week: 8, games: [SEA, BUF], gate: { [SEA.id]: { spread: true, total: false }, [BUF.id]: { spread: true, total: false } }, revealed: {},
    entries: [entry('me', [locked(SEA.id, -3, -3, 10), locked(BUF.id, 2, 2.5, 9)]), entry('troy', [locked(SEA.id, -2.5, -3, 9), locked(BUF.id, 3.5, 2.5, 8)])] }] };
const app = league => ({ accountId: 'me', league, community: { data: { week: { season: 2026, week: 8 } } }, requestSignIn: vi.fn() });
const render = () => renderToStaticMarkup(<div className="gx"><CompareTile onOpen={() => {}}/></div>);

describe('CompareTile', () => {
  it('reads Home’s shared history read and shows your lead over the player Compare opens on, never NEW', () => {
    useAppData.mockReturnValue(app({ id: 'community', name: 'Community', community: true }));
    useLeagueRead.mockReturnValue({ loading: false, error: null, data: history });
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('+2');
    expect(html).toContain('vs Troy');
    expect(html).toContain('Compare: Week 8 Spread, you lead Troy by 2');
    expect(html).not.toContain('NEW');
    const [key, , , options] = useLeagueRead.mock.calls.at(-1);
    expect(key).toBe('me:home-score:2026:8');
    expect(options).toEqual({ shared: true });
  });
  it('a private league shows the plain label: the landing never reads its roster', () => {
    useAppData.mockReturnValue(app({ id: `g_${'0'.repeat(32)}`, name: 'Friends', community: false }));
    useLeagueRead.mockReturnValue({ loading: false, error: null, data: history });
    const html = render();
    expect(html).toContain('Head-to-head');
    expect(html).not.toContain('vs Troy');
    expect(html).not.toContain('NEW');
  });
});
