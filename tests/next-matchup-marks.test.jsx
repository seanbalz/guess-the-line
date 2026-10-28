// D-62 ("first team logo @ the other team logo"): the places converted to ui/Matchup.jsx that have no screen test of
// their own. Contract for each: the game is drawn as a `gx-mu` with the away team's mark before the home team's, and
// what a screen reader hears still names the matchup ("Seattle Seahawks at Denver Broncos"); a game that cannot be
// named stays "—" (never a raw id or empty marks). react-dom/server only; fixtures are fictional.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { teamMarks } from '../web/src/teamLogoRegistry.js';
import { markupProblems, matchups, nameFrom, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';

const read = vi.hoisted(() => ({ value: { loading: true } }));
vi.mock('../web/src/api.js', () => ({ communityApi: vi.fn(), meApi: vi.fn(), date: value => String(value) }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: () => read.value, LeagueFailure: () => null, LeagueLoading: () => null, LeagueEmpty: () => null }));

const { featuresModel } = await import('../web/src/next/features/model.js');
const { BadgeLine } = await import('../web/src/next/features/BadgeLine.jsx');
const { FlashOverlay } = await import('../web/src/next/features/FlashOverlay.jsx');
const { HistoryMatchup } = await import('../web/src/next/me/HistoryMatchup.jsx');
const { LeagueHistory } = await import('../web/src/next/league/LeagueHistory.jsx');
const { FeedGame } = await import('../web/src/next/feed/PostCard.jsx');
const { ShellContext } = await import('../web/src/next/shell/context.js');

const shell = { state: { views: {} }, go: vi.fn(), closeOverlay: vi.fn(), openSheet: vi.fn() };
const html = node => renderToStaticMarkup(<div className="gx"><ShellContext.Provider value={shell}>{node}</ShellContext.Provider></div>).replace(/<!-- -->/g, '');
const SEA_DEN = { srcs: [teamMarks.SEA.src, teamMarks.DEN.src], name: 'Seattle Seahawks at Denver Broncos' };
const YOU = '00000000-0000-4000-8000-000000000001';
const bullseye = { key: 'b1', userId: YOU, badge: 'bullseye', week: 6, visibleAt: '2026-10-20T00:00:00Z', facts: { gameId: 'SEA-DEN', market: 'total', guess: 41 } };
const hotHand = { key: 'b2', userId: YOU, badge: 'hot_hand', week: 6, visibleAt: '2026-10-20T00:00:00Z', facts: { wins: 3 } };

describe('badge lines', () => {
  const model = featuresModel({ badges: [bullseye, hotHand], awards: [], streaks: [] }, { viewer: YOU });
  const earned = id => model.badgesOf(YOU).find(b => b.id === id);
  it('keep the text line and add its parts, so the detail draws the game as marks', () => {
    expect(earned('bullseye').lines).toEqual(['Week 6 · SEA @ DEN · Total 41 exact']);
    expect(earned('bullseye').parts).toEqual([{ week: 'Week 6', game: { away: 'SEA', home: 'DEN', text: 'SEA @ DEN' }, detail: 'Total 41 exact' }]);
  });
  it('draw "Week 6 · [SEA] @ [DEN] · Total 41 exact", away mark first, read as one sentence', () => {
    const out = html(<p><BadgeLine parts={earned('bullseye').parts[0]}/></p>);
    expect(matchups(out)).toEqual([SEA_DEN]);
    expect(readText(out)).toBe('Week 6 · Seattle Seahawks at Denver Broncos · Total 41 exact');
    expect(markupProblems(out)).toEqual([]);
  });
  it('a badge with no game stays words only', () => {
    const out = html(<p><BadgeLine parts={earned('hot_hand').parts[0]}/></p>);
    expect(matchups(out)).toEqual([]);
    expect(readText(out)).toBe('Week 6 · 3 wins in a row');
  });
  it('the celebration overlay draws a badge’s game as marks and keeps an award’s words', () => {
    const items = [
      { key: 'badge:b1', kind: 'badge', title: 'Bullseye', meta: 'Week 6 · SEA @ DEN · Total 41 exact', parts: earned('bullseye').parts[0], icon: 'M0 0h1', rarity: 'uncommon' },
      { key: 'award:6:best_guess', kind: 'award', title: 'Best guess', meta: 'Week 6 · Exact · 10 PTS', icon: 'M0 0h1', rarity: 'rare' },
    ];
    const out = html(<FlashOverlay args={{ key: 'k', items }}/>);
    expect(matchups(out)).toEqual([SEA_DEN]);
    const lines = [...walk(parseMarkup(out))].filter(n => n.tag === 'li').map(n => readText(n));
    expect(lines).toEqual(['Bullseye · Week 6 · Seattle Seahawks at Denver Broncos · Total 41 exact', 'Best guess · Week 6 · Exact · 10 PTS']);
    expect(readText(html(<FlashOverlay args={{ key: 'k', items: items.slice(0, 1) }}/>))).toContain('Week 6 · Seattle Seahawks at Denver Broncos · Total 41 exact');
  });
});

describe('history and feed games', () => {
  it('HistoryMatchup draws a slate game as marks, and "—" for a game the slate does not have', () => {
    expect(matchups(html(<HistoryMatchup game={{ id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN' }}/>))).toEqual([SEA_DEN]);
    expect(matchups(html(<HistoryMatchup away="SEA" home="DEN"/>))).toEqual([SEA_DEN]);
    for (const missing of [<HistoryMatchup key="a" game={undefined}/>, <HistoryMatchup key="b" away={null} home={null}/>]) {
      const out = html(missing);
      expect(matchups(out)).toEqual([]);
      expect(readText(out)).toBe('—');
    }
  });
  it('FeedGame draws a game id as marks, and "—" for an id that is not two codes', () => {
    expect(matchups(html(<FeedGame gameId="SEA-DEN"/>))).toEqual([SEA_DEN]);
    expect(readText(html(<FeedGame gameId=""/>))).toBe('—');
  });
  it('League history: each game row’s summary leads with its matchup, away first', () => {
    read.value = { loading: false, data: { viewer: YOU, season: 2026, seasons: [2026], members: [{ id: YOU, displayName: 'Avery Fixture' }],
      weeks: [{ season: 2026, week: 6, results: {}, games: [{ id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-18T20:05:00Z' }],
        entries: [{ userId: YOU, mode: 'guess_spread', status: 'submitted', eligible: true, weekScored: 1, weekPoints: 8, picks: [{ gameId: 'SEA-DEN', guess: -3, points: 8, reference: null }] }] }] } };
    const out = html(<LeagueHistory app={{ accountId: YOU, refresh: vi.fn() }}/>);
    const summary = [...walk(parseMarkup(out))].find(n => n.tag === 'summary');
    expect(matchups(summary)).toEqual([SEA_DEN]);
    expect(nameFrom(summary)).toBe('Seattle Seahawks at Denver Broncos · Broncos −3');
  });
});
