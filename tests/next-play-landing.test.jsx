// D-69 step 1, the Play landing (Sean's P1B, November 3, 2026), rendered statically: one glow card with the ballot to
// do next, then six tiles in two columns. The five page tiles are each page task's own component with its own tests;
// here they are stand-ins, so this file guards only the landing's composition. Fixture weeks only.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ app: null, newMoments: {}, scopes: [], buttons: [], tiles: [] }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => state.app, useSharedRead: () => ({ status: 'loading', data: null }) }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: () => ({ loading: true, data: null, error: null }), LeagueFailure: () => null }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn(), socialApi: vi.fn() }));
vi.mock('../web/src/fantasyData.js', () => ({ fantasyWeekKey: (season, week) => `${season}-${String(week).padStart(2, '0')}`, useFantasySnapshot: () => ({ status: 'loading' }) }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({
  useMoments: () => null, useMomentScope: scope => { state.scopes.push(scope); },
  useNewCount: scope => (state.newMoments[scope] ?? []).length, useNewMoments: scope => state.newMoments[scope] ?? [], usePopped: () => false,
}));
// The hero's button and the ballot tile are the real components; these wrappers only note the props they were given.
vi.mock('../web/src/next/ui/index.js', async importOriginal => {
  const real = await importOriginal();
  return { ...real, Button: props => { state.buttons.push(props); return real.Button(props); } };
});
vi.mock('../web/src/next/play/PlayTile.jsx', async importOriginal => {
  const real = await importOriginal();
  return { PlayTile: props => { state.tiles.push(props); return real.PlayTile(props); } };
});
const stub = (name, label) => ({ [name]: ({ onOpen }) => <button type="button" className="gx-stub-tile" onClick={onOpen}>{label}</button> });
vi.mock('../web/src/next/play/ScoreTile.jsx', () => stub('ScoreTile', 'Your score'));
vi.mock('../web/src/next/play/CompareTile.jsx', () => stub('CompareTile', 'Compare'));
vi.mock('../web/src/next/play/points/PointsTile.jsx', () => stub('PointsTile', 'Guess the Points'));
vi.mock('../web/src/next/features/BadgesTile.jsx', () => stub('BadgesTile', 'Badges'));
vi.mock('../web/src/next/league/LeagueTile.jsx', () => stub('LeagueTile', 'League'));
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Play } = await import('../web/src/next/play/Play.jsx');

const DEADLINE = '2026-11-06T01:15:00.000Z'; // Thu 5:15 PM PT
const due = (spread, total, extra = {}) => [
  { mode: 'guess_spread', submitted: false, satOut: false, filled: spread, games: 14, openGames: 14 - spread, locked: spread, nextKickoff: spread < 14 ? DEADLINE : null },
  { mode: 'guess_total', submitted: false, satOut: false, filled: total, games: 14, openGames: 14 - total, locked: total, nextKickoff: total < 14 ? DEADLINE : null, ...extra },
];
const week = (rows, state = 'due') => ({ viewer: 'fixture', rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true },
  week: { season: 2026, week: 9, deadline: DEADLINE, games: 14 }, picksDue: { state, week: 9, deadline: DEADLINE, now: '2026-11-03T20:00:00.000Z', modes: [] }, due: rows, members: [], optOuts: [] });
// Each Whole week locked moment waits on its own market's picks scope (M4), as the engine holds it.
const waitingFor = (...ids) => Object.groupBy(ids.map(id => ({ id, kind: 'weekLocked', scopes: [`picks:${id.split(':').at(-1)}`, 'play'], title: id })), m => m.scopes[0]);
let lastShell = null;
function render(community, { newMoments = {} } = {}) {
  state.app = { accountId: 'fixture', community, league: { name: 'Community', community: true }, refresh: vi.fn(), requestSignIn: vi.fn() };
  state.newMoments = newMoments; state.scopes = []; state.buttons = []; state.tiles = [];
  const shell = lastShell = { state: { views: { play: {} }, trail: [] }, go: vi.fn(), setView: vi.fn(), tab: vi.fn(), reload: vi.fn() };
  return renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx"><Play/></div></ShellContext.Provider>);
}
const ready = data => ({ status: 'ready', data, error: null });
const nodes = html => [...walk(parseMarkup(html))];
const byAttr = (html, name, value) => nodes(html).filter(n => n.attrs?.[name] !== undefined && (value === undefined || n.attrs[name] === value));
/** Each text run, trimmed, in order: the card's lines one by one. */
const texts = node => [...walk(node)].filter(n => n.text !== undefined && n.text.trim()).map(n => n.text.trim());
const primaries = html => nodes(html).filter(n => n.tag === 'button' && /\bgx-btn--primary\b/.test(n.attrs?.class ?? '')).map(nameFrom);

describe('P1B: the next move first, then six tiles', () => {
  const html = render(ready(week(due(3, 14))));
  it('one glow card holds the eyebrow, the next ballot\'s name, its 14-segment week, one meta line and the one lime "Make picks"', () => {
    expect(markupProblems(html)).toEqual([]);
    const [hero] = byAttr(html, 'data-play', 'hero');
    expect(hero.attrs['data-hero']).toBe('next');
    expect(texts(hero)).toEqual(['Your next move', 'Guess the Spread', '3 of 14 locked · first kickoff Thu 5:15 PM PT', 'Make picks']);
    expect([...walk(hero)].filter(n => /\bgx-meter3-seg\b/.test(n.attrs?.class ?? ''))).toHaveLength(14);
    expect([...walk(hero)].filter(n => /\bgx-meter3-seg--on\b/.test(n.attrs?.class ?? ''))).toHaveLength(3);
    expect(nodes(html).filter(n => /\bgx-card--hero\b/.test(n.attrs?.class ?? ''))).toHaveLength(1);
    expect(primaries(html)).toEqual(['Make picks']);
  });
  it('the tiles follow in Sean\'s order: the other ballot, Points, Your score, League, Badges, Compare', () => {
    expect(byAttr(html, 'data-play-tile').map(n => n.attrs['data-play-tile'])).toEqual(['ballot', 'points', 'score', 'league', 'badges', 'compare']);
    const [ballot] = byAttr(html, 'data-play-tile', 'ballot');
    const [button] = [...walk(ballot)].filter(n => n.tag === 'button');
    expect(nameFrom(button)).toBe('Guess the Total, all 14 locked');
    expect(readText(ballot)).toContain('14 / 14');
    expect(readText(ballot)).toContain('All locked');
  });
  it('replaces the focus card, the rows, the Points glow card and "More in Play"', () => {
    for (const gone of ['gx-focus-action', 'gx-focus-rows', 'Continue guessing', 'More in Play', 'My league', 'data-points-landing']) expect(html).not.toContain(gone);
  });
  it('opens the Play scope, so a moment waiting for this card plays where it shows', () => {
    expect(state.scopes).toContain('play');
  });
});

describe('the first card in its other states', () => {
  it('both ballots done: "This week", "Week 9 locked in" and "Review your guesses"', () => {
    const [hero] = byAttr(render(ready(week(due(14, 14), 'done'))), 'data-play', 'hero');
    expect(texts(hero)).toEqual(['This week', 'Week 9 locked in', 'Spread and Total, all 28 locked', 'Review your guesses']);
  });
  it('no week open: the latest result, as "Your week, at a glance" was, with no meter', () => {
    const html = render(ready({ viewer: 'fixture', picksDue: { state: 'none', modes: [] }, due: [], members: [] }));
    const [hero] = byAttr(html, 'data-play', 'hero');
    expect(texts(hero)).toEqual(['Your results', 'Your week, at a glance', 'No week is open yet. Your past results are still here.', 'View your results']);
    expect(html).not.toContain('gx-meter3');
    expect(primaries(html)).toEqual(['View your results']);
  });
  it('a first read that failed: the failure in the card\'s place, every tile still there, no false zero and no lime button', () => {
    const html = render({ status: 'error', data: null, error: { status: 503, message: 'Unavailable.' } });
    expect(html).toContain('could not be loaded');
    expect(byAttr(html, 'data-play-tile')).toHaveLength(6);
    expect(readText(byAttr(html, 'data-play-tile', 'ballot')[0])).toContain('—');
    expect(html).not.toMatch(/\b0 \/ 14\b|Make picks/);
    expect(primaries(html)).toEqual([]);
  });
  it('a failed refresh keeps the last copy and says so, with Refresh week', () => {
    const html = render({ status: 'ready', data: week(due(3, 0)), error: { status: 503 } });
    expect(html).toContain('This week could not refresh. Showing the last loaded update.');
    expect(html).toContain('Refresh week');
    expect(byAttr(html, 'data-play', 'hero')).toHaveLength(1);
  });
});

describe('Whole week locked on the landing', () => {
  const ballotButton = html => nameFrom([...walk(byAttr(html, 'data-play-tile', 'ballot')[0])].find(n => n.tag === 'button'));
  it('NEW shows on the ballot tile while the moment of its own market waits for the picks card, and not otherwise', () => {
    // Spread is next (3 of 14), so the tile is Total.
    const waiting = render(ready(week(due(3, 14))), { newMoments: waitingFor('weekLocked:2026:9:guess_total') });
    expect(readText(byAttr(waiting, 'data-play-tile', 'ballot')[0])).toContain('NEW');
    expect(ballotButton(waiting)).toBe('Guess the Total, all 14 locked, new');
    const quiet = render(ready(week(due(3, 14))));
    expect(readText(byAttr(quiet, 'data-play-tile', 'ballot')[0])).not.toContain('NEW');
    expect(ballotButton(quiet)).toBe('Guess the Total, all 14 locked');
  });
  it('a waiting moment that belongs to the hero market puts no NEW and no "new" on the tile of the other ballot', () => {
    // Spread is the hero's market (the next move); its Whole week locked moment is waiting, the tile's (Total) is not.
    const html = render(ready(week(due(3, 14))), { newMoments: waitingFor('weekLocked:2026:9:guess_spread') });
    expect(byAttr(html, 'data-play', 'hero')).toHaveLength(1);
    expect(readText(byAttr(html, 'data-play-tile', 'ballot')[0])).not.toContain('NEW');
    expect(ballotButton(html)).toBe('Guess the Total, all 14 locked');
    expect(html).not.toMatch(/, new/);
  });
  it('a moment from another week shows no NEW either', () => {
    const html = render(ready(week(due(3, 14))), { newMoments: waitingFor('weekLocked:2026:8:guess_total') });
    expect(readText(byAttr(html, 'data-play-tile', 'ballot')[0])).not.toContain('NEW');
  });
});

describe('where the hero and the ballot tile open', () => {
  // The week's address: its section, the market, the season and the week, and no per-game card (CLOSED_LAYER's keys).
  const address = market => ({ section: 'picks', layer: undefined, item: undefined, scoreGame: undefined, market, season: 2026, week: 9 });
  it('the hero action opens the Spread picks card for Week 9 on its first layer', () => {
    render(ready(week(due(3, 14))));
    const action = state.buttons.find(b => b.variant === 'primary');
    action.onClick();
    expect(lastShell.go).toHaveBeenCalledTimes(1);
    expect(lastShell.go).toHaveBeenCalledWith('play', address('spread'));
    expect(Object.keys(lastShell.go.mock.calls[0][1])).not.toContain('pickGame');
  });
  it('the ballot tile opens the other market (Total) the same way', () => {
    render(ready(week(due(3, 14))));
    expect(state.tiles).toHaveLength(1);
    state.tiles[0].onClick();
    expect(lastShell.go).toHaveBeenCalledWith('play', address('total'));
  });
});
