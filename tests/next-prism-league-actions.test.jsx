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
  it('labels private weekly figures using only that group’s rows and week', () => {
    const rows = [{ id: 'a', rank: 1, points: 12, name: 'Group leader' }, { id: 'b', rank: 2, points: 0, name: 'You' }];
    const html = renderToStaticMarkup(<LeagueStanding mode="guess_spread" row={rows[1]} rows={rows} scope="Private fixture" period="week" week={6}/>);
    expect(html).toContain('Your weekly standing');
    expect(html).toContain('Private fixture · Week 6');
    expect(html).toContain('12 points behind Group leader');
    expect(html).not.toMatch(/season|Community|Shared/);
    const tied = renderToStaticMarkup(<LeagueStanding mode="guess_total" row={{ rank: 1, tied: true, points: 0 }} scope="Community" period="season"/>);
    expect(tied).toContain('Tied for the lead.');
    expect(tied).toContain('Community · Season standing');
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
