import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ app: null, personal: { data: null }, read: { loading: true, data: null, error: null } }));
// Task 7b retires Play's use of the old editor; until then its module is a stand-in.
vi.mock('../web/src/CommunityHome.jsx', () => ({ WeekPicks: () => <div className="community-week-picks"/> }));
// D-69 step 1: Play's landing tiles are each page's own component with its own tests; here they are stand-ins.
const tile = (name, label) => ({ [name]: () => <button type="button">{label}</button> });
vi.mock('../web/src/next/play/ScoreTile.jsx', () => tile('ScoreTile', 'Your score'));
vi.mock('../web/src/next/play/CompareTile.jsx', () => tile('CompareTile', 'Compare'));
vi.mock('../web/src/next/play/points/PointsTile.jsx', () => tile('PointsTile', 'Guess the Points'));
vi.mock('../web/src/next/features/BadgesTile.jsx', () => tile('BadgesTile', 'Badges'));
vi.mock('../web/src/next/league/LeagueTile.jsx', () => tile('LeagueTile', 'League'));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => state.app, useSharedRead: () => state.personal }));
vi.mock('../web/src/next/home/homeData.js', () => ({ useHomeData: () => ({ app: state.app, community: state.app.community, viewer: 'fixture', preferences: {} }) }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: () => state.read, LeagueFailure: () => <p>Read failed</p> }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn(), socialApi: vi.fn() }));
// Board i63: a Points slot sheet reads the week's Fantasy snapshot; these renders leave it loading.
vi.mock('../web/src/fantasyData.js', () => ({ fantasyWeekKey: (season, week) => `${season}-${String(week).padStart(2, '0')}`, useFantasySnapshot: () => ({ status: 'loading' }) }));
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Home } = await import('../web/src/next/home/Home.jsx');
const { Play } = await import('../web/src/next/play/Play.jsx');
const { ScoreSummaryRow } = await import('../web/src/next/home/HomeSummaries.jsx');

function render(Screen, patch = {}) {
  state.app = { accountId: 'fixture', community: { status: 'ready', data: { week: { season: 2026, week: 6, games: [] }, picksDue: { state: 'due', week: 6, modes: [{ mode: 'guess_total' }] }, due: [{ mode: 'guess_spread', submitted: true }, { mode: 'guess_total', filled: 0, games: 2 }] } }, league: { name: 'Community', community: true }, refresh: vi.fn(), requestSignIn: vi.fn(), ...patch };
  const shell = { state: { views: { play: {}, bets: {}, research: {} } }, go: vi.fn(), tab: vi.fn(), setView: vi.fn(), reload: vi.fn(), league: state.app.league };
  return renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx"><Screen/></div></ShellContext.Provider>);
}

describe('One thing first roots', () => {
  // D-55 round 3: Home keeps one lime action; stat tiles replace the summary rows, and research stays one row away.
  it('Home has one action, three stat tiles and a trends row instead of full boards and research', () => {
    const html = render(Home);
    expect(markupProblems(html)).toEqual([]);
    expect((html.match(/gx-btn--primary/g) || [])).toHaveLength(1);
    for (const name of ['Spread rank', 'Total rank', 'My bets', 'This week’s trends']) expect(html).toContain(name);
    for (const removed of ['Explore the week', 'Research readiness', 'New here? Start here', 'Your scores']) expect(html).not.toContain(removed);
  });
  // D-69 step 1 (P1B): the first card is the ballot to do next; the other ballot, your results and the League are tiles.
  it('Play leads with the still-due Total market and keeps Spread, your results and the League one tile away', () => {
    const html = render(Play);
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('Guess the Total');
    expect(html).toContain('Guess the Spread');
    expect(html).not.toContain('community-week-picks'); // the landing never embeds the old editor (until Task 7b)
    for (const name of ['ballot', 'score', 'league']) expect(html).toContain(`data-play-tile="${name}"`);
    expect((html.match(/gx-btn--primary/g) || [])).toHaveLength(1);
  });
  it('an unavailable week does not pretend to have a zero score or an available guess', () => {
    const html = render(Play, { community: { status: 'error', data: null } });
    expect(html).toContain('could not be loaded');
    expect(html).not.toContain('Make picks');
    expect(html).not.toContain('0 points');
    expect(html).toContain('data-play-tile="league"');
  });
  it('labels a last-loaded Play week after a failed refresh', () => {
    render(Play);
    const html = render(Play, { community: { ...state.app.community, status: 'error' } });
    expect(html).toContain('Showing the last loaded update');
    expect(html).toContain('Refresh week');
  });
  it('keeps a real zero separate from a market waiting for its scoring line', () => {
    state.read = { loading: false, data: { viewer: 'fixture', weeks: [{ season: 2026, week: 6, games: [{ id: 'g1' }], entries: [
      { userId: 'fixture', mode: 'guess_spread', eligible: true, picks: [{ gameId: 'g1', lockedIn: true, guess: -3, points: 0 }] },
      { userId: 'fixture', mode: 'guess_total', eligible: true, picks: [{ gameId: 'g1', lockedIn: true, guess: 40, points: null }] },
    ] }] } };
    const html = renderToStaticMarkup(<ScoreSummaryRow app={{ accountId: 'fixture', community: { data: { week: { season: 2026, week: 6 } } } }} onClick={() => {}}/>);
    expect(html).toContain('Spread 0 pts');
    expect(html).toContain('Total —');
    expect(html).not.toContain('40');
    state.read = { loading: true, data: null, error: null };
  });
});
