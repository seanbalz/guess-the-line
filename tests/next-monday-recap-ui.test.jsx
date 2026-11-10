import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecapEntry, RecapLayer } from '../web/src/next/home/MondayRecap.jsx';
import { PriorWeekCard } from '../web/src/next/lines/PriorWeek.jsx';
import { priorWeekStillPlaying } from '../shared/prior-week.mjs';

// Monday recap (design/monday-recap-2026-11-05) drawn from fictional `/league/comparison` and `/lines/read` fixtures.
const rig = vi.hoisted(() => ({ view: {}, read: null, asked: [], lines: null }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => ({}), useSharedRead: () => ({}) }));
vi.mock('../web/src/api.js', () => ({ leagueApi: vi.fn(), linesApi: vi.fn() }));
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ state: { views: { home: rig.view } }, go: vi.fn(), setView: vi.fn() }) }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: key => { rig.asked.push(key); return rig.read; } }));
vi.mock('../web/src/next/lines/useGameLines.js', () => ({ useBoardLines: () => rig.lines ?? { status: 'loading', data: null, reload: () => {} } }));

const SUN = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', kickoff: '2026-11-08T21:05:00Z' };
const MNF = { id: 'MIA-GB', awayCode: 'MIA', homeCode: 'GB', away: 'Miami Dolphins', home: 'Green Bay Packers', kickoff: '2026-11-10T01:15:00Z' };
const ref = value => ({ value, source: 'Fixture median', observedAt: '2026-11-05T17:00:00Z', basis: 'saved' });
const pick = (gameId, guess, line, points) => ({ gameId, guess, points, reference: ref(line), lockedIn: true, lockedAt: '2026-11-05T18:00:00Z', hidden: false });
const entry = (userId, picks, weekPoints) => ({ userId, mode: 'guess_spread', status: 'submitted', eligible: true, picks, hiddenGames: [], weekPoints, weekScored: 1 });
const DATA = {
  viewer: 'me', season: 2026, seasons: [2026], now: '2026-11-09T23:00:00Z',
  members: [{ id: 'me', displayName: 'Sean B' }, { id: 'maya', displayName: 'Maya Fixture' }],
  weeks: [{ season: 2026, week: 9, games: [SUN, MNF], results: { [SUN.id]: { status: 'final', away: 20, home: 27 } },
    gate: { [SUN.id]: { spread: true, total: false }, [MNF.id]: { spread: false, total: false } }, revealed: {},
    entries: [entry('me', [pick(SUN.id, -3, -3.5, 9.5), pick(MNF.id, -4.5, -4, null)], 9.5),
      // Maya's MNF guess arrives as a provider fault with numbers; the gate is shut, so none of it may show.
      entry('maya', [pick(SUN.id, -2, -3.5, 8.5), pick(MNF.id, -13.5, -12.5, null)], 11)] }],
};
const app = { accountId: 'me', league: { community: true, name: 'Community' } };
const draw = view => { rig.view = view; return renderToStaticMarkup(<RecapLayer head={<h1>Home</h1>} app={app}/>); };

describe('Monday recap', () => {
  it('Home entry: the week, the games left and Open recap', () => {
    const html = renderToStaticMarkup(<RecapEntry view={{ season: 2026, week: 9, playing: 1, games: [] }} onOpen={() => {}}/>);
    for (const text of ['Week 9 recap', '1 game left', 'Open recap', 'data-recap-entry="2026-9"']) expect(html).toContain(text);
    expect(renderToStaticMarkup(<RecapEntry view={{ season: 2026, week: 9, playing: 0, games: [] }} onOpen={() => {}}/>)).toContain('All games final');
    expect(renderToStaticMarkup(<RecapEntry view={null} onOpen={() => {}}/>)).toBe('');
  });

  it('Home shows the entry beside the still-playing card from one prior-week read, and only with `recap`', () => {
    const MNF_LINE = { id: 'MIA-GB', awayCode: 'MIA', homeCode: 'GB', kickoff: MNF.kickoff, started: false, final: null, mine: { spread: { guess: -4.5, lockedIn: true, points: null }, total: { guess: null } } };
    rig.lines = { status: 'ready', data: { season: 2026, week: 9, games: [MNF_LINE] }, now: Date.parse('2026-11-09T23:00:00Z'), reload: () => {} };
    const personal = { data: { season: 2026, week: 10, slates: [{ season: 2026, week: 10 }, { season: 2026, week: 9 }] } };
    const home = renderToStaticMarkup(<PriorWeekCard app={app} personal={personal} recap/>);
    expect(home.indexOf('Week 9 recap')).toBeGreaterThanOrEqual(0);
    expect(home.indexOf('Week 9 recap')).toBeLessThan(home.indexOf('Still playing from Week 9'));
    expect(home).toContain('1 game left');
    expect(renderToStaticMarkup(<PriorWeekCard app={app} personal={personal}/>)).not.toContain('Week 9 recap');
    expect(priorWeekStillPlaying({ current: { season: 2026, week: 10 }, lines: rig.lines.data, now: rig.lines.now }).playing).toBe(1);
    rig.lines = null;
  });

  it('the week: separate Spread and Total ranks, provisional with the Monday game pending, the friend gated per game', () => {
    rig.read = { loading: false, error: null, data: DATA, retry: () => {} };
    const html = draw({ layer: 'recap', season: 2026, week: 9, market: 'spread' });
    for (const text of ['Week 9 recap', 'Provisional', '1 game left', '2nd in Spread.', '1.5 points behind Maya', 'Spread rank', 'Total rank',
      'You were 1 point closer than Maya.', 'You Broncos −3 · 0.5 off', 'Maya Broncos −2 · 1.5 off', 'PENDING', 'Kicks off Mon 5:15 PM PT',
      'You Packers −4.5 · scores at kickoff', 'Maya’s guess opens at kickoff', 'Compare guesses']) expect(html).toContain(text);
    expect(html).not.toMatch(/13\.5|12\.5/);
    expect(rig.asked.at(-1)).toBe('me:recap:community:2026');
  });

  it('one game: each guess, each miss on one scale, the final score and the result; a pending game says it waits', () => {
    rig.read = { loading: false, error: null, data: DATA, retry: () => {} };
    const html = draw({ layer: 'recap', season: 2026, week: 9, market: 'spread', item: 'SEA-DEN' });
    for (const text of ['Seahawks at Broncos', 'Final', '0.5 pts off.', 'Your guess Broncos −3', 'Saved Broncos −3.5', 'Your saved line Broncos −3.5',
      'Maya’s saved line Broncos −3.5', 'You 0.5 off, Maya 1.5 off', 'Broncos won by 7.', 'Your guess implied Broncos by 3, 4 points from the final margin.']) expect(html).toContain(text);
    expect(html).toContain('Week 9 recap'); // the lip back to the week
    const pending = draw({ layer: 'recap', season: 2026, week: 9, market: 'spread', item: 'MIA-GB' });
    for (const text of ['Dolphins at Packers', 'PENDING', 'The recap stays provisional until it is final.', 'Scores at kickoff.', 'Maya’s guess opens at kickoff']) expect(pending).toContain(text);
    expect(pending).not.toMatch(/13\.5|12\.5/);
    expect(pending).not.toContain('Game result');
  });

  it('loading, failure and a week the reply does not have', () => {
    rig.read = { loading: true, error: null, data: null, retry: () => {} };
    expect(draw({ layer: 'recap', season: 2026, week: 9 })).toContain('Loading your recap');
    rig.read = { loading: false, error: { status: 503, message: 'Comparisons are not available yet. Try again later.' }, data: null, retry: () => {} };
    const failed = draw({ layer: 'recap', season: 2026, week: 9 });
    expect(failed).toContain('Comparisons are not available yet.');
    expect(failed).toContain('Try again');
    rig.read = { loading: false, error: null, data: DATA, retry: () => {} };
    expect(draw({ layer: 'recap', season: 2026, week: 4 })).toContain('No recap for this week yet.');
  });
});
