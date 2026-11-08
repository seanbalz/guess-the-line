import { describe, expect, it, vi } from 'vitest';
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), leagueApi: vi.fn() }));
import { renderToStaticMarkup } from 'react-dom/server';
import { LeagueStanding } from '../web/src/next/league/LeagueStanding.jsx';
import { PostCard } from '../web/src/next/feed/PostCard.jsx';
import { ShellContext } from '../web/src/next/shell/context.js';

describe('approved League compositions use only permitted figures', () => {
  it('keeps an unranked missing result distinct from a ranked zero and preserves ties', () => {
    const missing = renderToStaticMarkup(<LeagueStanding mode="guess_total"/>);
    expect(missing).toContain('Your rank');
    expect(missing).toContain('Total points');
    expect(missing).not.toContain('>0<');
    const zero = renderToStaticMarkup(<LeagueStanding mode="guess_spread" row={{ rank: 2, tied: true, points: 0 }}/>);
    expect(zero).toContain('T-2');
    expect(zero).toContain('>0<');
    expect(zero).not.toContain('Total points');
  });
  it('charts only a revealed result, including a scored zero; hidden records have no score graphic', () => {
    const post = { id: 'post', actorId: 'friend', kind: 'result_shared', season: 2026, week: 8, mode: 'guess_spread', createdAt: '2026-10-26T18:00:00Z', reactions: { counts: {}, total: 0 }, comments: [], commentCount: 0 };
    const render = embed => renderToStaticMarkup(<ShellContext.Provider value={{ openSheet() {}, toast() {} }}><PostCard post={{ ...post, embed }} names={new Map()} viewer="you" now="2026-10-26T20:00:00Z"/></ShellContext.Provider>);
    expect(render({ visible: false, gameId: 'SEA-DEN' })).not.toContain('role="meter"');
    const zero = render({ visible: true, gameId: 'SEA-DEN', pick: -2.5, points: 0 });
    expect(zero).toContain('role="meter"');
    expect(zero).toContain('aria-valuenow="0"');
    expect(zero).toContain('DEN −2.5');
    expect(zero).not.toContain('NaN');
    expect(render({ visible: true, gameId: 'SEA-DEN', pick: -2.5, points: null })).not.toContain('role="meter"');
  });
});
