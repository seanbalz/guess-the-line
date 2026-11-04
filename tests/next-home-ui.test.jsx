// Redesign build plan stage 12: the read-only Home, rendered with vitest + react-dom/server over fixture Community
// replies (no browser; the browser checks are tests/cloud-browser/next-home.spec.js, whose fixture week cannot score
// a ballot, so the ranked and tied tiles are rendered here). The data hook is stood in for, so nothing here reaches
// the network. Fixture people and points only; no player data.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { HOME_COPY } from '../shared/home-view.mjs';
import { HERO_COPY } from '../web/src/next/home/homeModel.js';
import { rankKey } from '../web/src/next/league/rankMoment.js';
import { featuresModel } from '../web/src/next/features/model.js';
import { scoreScope } from '../web/src/next/moments/catalog.js';

vi.mock('../web/src/api.js', () => ({ meApi: vi.fn() }));
const state = vi.hoisted(() => ({ home: null, tickets: { loading: true, error: null, active: null }, features: { model: null }, waiting: {}, popped: [], scopes: [] }));
vi.mock('../web/src/next/home/homeData.js', () => ({ useHomeData: () => state.home }));
// The tickets tile's read, held loading (its real first render) unless a test sets a count.
vi.mock('../web/src/next/bets/useTicketSummary.js', () => ({ useTicketSummary: () => state.tickets }));
// The features read (awards, the Pick streak) and the moments engine stand in: each test says what read and what waits.
vi.mock('../web/src/next/features/useFeatures.js', () => ({ useFeatures: () => state.features }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({
  useMoments: () => null, useMomentScope: scope => { state.scopes.push(scope); },
  useNewCount: scope => (state.waiting[scope] ?? []).length, useNewMoments: scope => state.waiting[scope] ?? [], usePopped: id => state.popped.includes(id),
}));

const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Home } = await import('../web/src/next/home/Home.jsx');

const HOUR = 3_600_000, DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-13T20:03:00Z'); // Tue Oct 13, 1:03 PM PT
const DEADLINE = '2026-10-16T00:15:00Z'; // Thu Oct 15, 5:15 PM PT
const OPENS_AT = '2026-10-12T07:00:00Z'; // Mon Oct 12, 12:00 AM PT
const SPREAD = 'guess_spread', TOTAL = 'guess_total';
const MEMBERS = [
  { id: 'u-avery', displayName: 'Avery Stone', removed: false },
  { id: 'u-blake', displayName: 'Blake Rivers', removed: false },
  { id: 'u-casey', displayName: 'Casey Moore', removed: false },
  { id: 'u-drew', displayName: 'Drew Lane', removed: false },
  { id: 'u-emery', displayName: 'Emery Fox', removed: false },
];
const row = (userId, mode, seasonPoints, seasonScored = 4, extra = {}) => ({ userId, mode, weekPoints: seasonPoints, weekScored: seasonScored, seasonPoints, seasonScored, weeksSubmitted: 1, satOut: false, ...extra });
const sent = (userId, mode) => ({ userId, mode, submittedAt: '2026-10-13T18:00:00Z', satOut: false, late: null });
const satOut = (userId, mode) => ({ userId, mode, submittedAt: null, satOut: true, late: null });

/**
 * The normalized /community/read reply (cloud/community.mjs) as the viewer Casey: picks due, Spread drafted 2 of 4 and
 * Total not started; Avery, Blake and Drew in on Spread, Emery sat out; Blake leads Spread at 12, Casey and Avery tie at
 * 10, Drew 8; Casey has no Total ballot.
 */
function reply(patch = {}) {
  return {
    viewer: 'u-casey',
    admin: false,
    members: MEMBERS,
    week: { season: 2026, week: 6, deadline: DEADLINE, games: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }, { id: 'g4' }] },
    optOuts: [],
    due: [{ mode: SPREAD, submitted: false, satOut: false, filled: 2, games: 4 }, { mode: TOTAL, submitted: false, satOut: false, filled: 0, games: 4 }],
    submissions: [sent('u-avery', SPREAD), sent('u-blake', SPREAD), sent('u-drew', SPREAD), satOut('u-emery', SPREAD), sent('u-blake', TOTAL)],
    standings: [row('u-blake', SPREAD, 12), row('u-casey', SPREAD, 10), row('u-avery', SPREAD, 10), row('u-drew', SPREAD, 8), row('u-blake', TOTAL, 7.5)],
    posts: [],
    interests: [],
    interestCounts: {},
    picksDue: { state: 'due', opensAt: OPENS_AT, deadline: DEADLINE, week: 6, modes: [{ mode: SPREAD }, { mode: TOTAL }], now: new Date(NOW).toISOString() },
    pushConfigured: false,
    ...patch,
  };
}

const shell = { tab: vi.fn(), reload: vi.fn(), state: { tab: 'home', sheets: [] } };
const app = { refresh: vi.fn(), accountId: 'u-casey' };
const home = (community, patch = {}) => { state.home = { app, viewer: 'u-casey', community: { status: 'ready', data: community, error: null, loading: false }, ...patch }; };
const render = () => renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx"><Home/></div></ShellContext.Provider>);
/** The elements under `root` (markup, or a node from an earlier read) that pass `test`. */
const nodes = (root, test) => [...walk(typeof root === 'string' ? parseMarkup(root) : root)].filter(n => n.tag && test(n));
const attr = (name, value) => n => n.attrs[name] === value;
const hasClass = cls => n => (n.attrs.class ?? '').split(/\s+/).includes(cls);
const textOf = n => [...walk(n)].filter(x => x.text !== undefined).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();
/** The words a sighted reader sees under `n`: no sr-only text. */
const hidden = n => { for (let a = n.parent; a; a = a.parent) if (a.attrs && hasClass('gx-sr-only')(a)) return true; return false; };
const seen = n => [...walk(n)].filter(x => x.text !== undefined && !hidden(x)).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();
const primaries = html => nodes(html, hasClass('gx-btn--primary'));
const buttons = html => nodes(html, n => n.tag === 'button').map(textOf);
const tile = (html, market) => nodes(html, attr('data-tile', market))[0];
const button = n => nodes(n, x => x.tag === 'button')[0];
/** D-66 (design audit B0-4): each element's own visible text runs no longer than twelve words. */
const longLines = html => nodes(html, n => !hidden(n) && n.attrs['aria-hidden'] !== 'true')
  .map(n => n.children.filter(c => c.text !== undefined).map(c => c.text).join(' ').replace(/\s+/g, ' ').trim())
  .filter(text => text.split(' ').filter(w => w && w !== '·').length > 12);
const FEATURES = { leagueId: null, season: 2026, ran: true, badges: [], seasonWinners: null,
  awards: [{ week: 5, version: 1, createdAt: '2026-10-13T16:00:00Z', awards: [{ id: 'spread_winner', winners: ['u-blake'], entries: [], value: { points: 12 } }, { id: 'total_winner', winners: ['u-casey'], entries: [], value: { points: 7 } }] }],
  streaks: [{ userId: 'u-casey', pick: { current: 3, best: 3 }, bets: { current: 0, best: 0 } }] };
const features = () => ({ model: featuresModel(FEATURES, { viewer: 'u-casey', nameOf: id => id }), data: FEATURES });

afterEach(() => { state.home = null; state.features = { model: null }; state.waiting = {}; state.popped = []; state.scopes = []; vi.clearAllMocks(); });

describe('Home while picks are due', () => {
  it('one lime button, "Make picks"; the eyebrow; the countdown named with its words; one status line per market', () => {
    home(reply());
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html, n => n.tag === 'h1').map(textOf)).toEqual(['Home']);
    const hero = nodes(html, attr('data-home', 'hero'))[0];
    expect(hero.attrs['data-state']).toBe('due');
    // H1A: while picks are due the card's eyebrow is "Your next move", in place of "Week 6" (Decisions for Sean).
    expect(textOf(hero)).toContain(HERO_COPY.nextMove);
    expect(primaries(html).map(textOf)).toEqual(['Make picks']);
    expect(buttons(html).filter(t => t === 'See Lines')).toEqual([]);
    const timer = nodes(html, attr('role', 'timer'))[0];
    expect(timer.attrs['aria-label']).toBe('Picks lock in 2 days 4 hours 12 minutes');
    expect(timer.attrs['aria-live']).toBe('off');
    expect(nodes(html, attr('data-home', 'status')).map(textOf)).toEqual(['Spread · 2 of 4 picked Total · 0 of 4 picked']);
  });

  // Design lane hierarchy pass: the one primary card says the next action in words, with the week's deadline under it.
  it('the card names the next action under "Your next move": "Lock in 4 games" over "before Thu 5:15 PM PT"', () => {
    home(reply());
    const html = render();
    const hero = nodes(html, attr('data-home', 'hero'))[0];
    expect(nodes(hero, n => n.tag === 'h2').map(textOf)).toEqual(['Lock in 4 games']);
    expect(nodes(hero, attr('data-home', 'when')).map(textOf)).toEqual(['before Thu 5:15 PM PT']);
    expect(nodes(hero, attr('data-home', 'eyebrow')).map(textOf)).toEqual([HERO_COPY.nextMove]);
    expect(seen(hero)).not.toContain('Week 6');
    expect(textOf(hero)).not.toContain(HERO_COPY.dueSoon);
  });

  it('urgent: a "Due soon" pill beside the week; per-game lock-in counts the open games and names the next kickoff', () => {
    home(reply({ picksDue: { ...reply().picksDue, state: 'urgent' } }));
    let hero = nodes(render(), attr('data-home', 'hero'))[0];
    expect(nodes(hero, hasClass('gx-pill')).map(textOf)).toEqual([HERO_COPY.dueSoon]);

    const kickoff = '2026-10-18T17:00:00Z'; // Sun Oct 18, 10:00 AM PT
    home(reply({ rules: { perGameScoring: true }, due: [
      { mode: SPREAD, submitted: false, satOut: false, filled: 2, games: 4, openGames: 3, locked: 1, nextKickoff: kickoff },
      { mode: TOTAL, submitted: false, satOut: false, filled: 0, games: 4, openGames: 2, locked: 2, nextKickoff: kickoff },
    ] }));
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    hero = nodes(html, attr('data-home', 'hero'))[0];
    expect(nodes(hero, n => n.tag === 'h2').map(textOf)).toEqual(['Lock in 3 games']);
    expect(nodes(hero, attr('data-home', 'when')).map(textOf)).toEqual(['Next kickoff Sun 10:00 AM PT']);
  });

  it('the week meter: one segment per game for each market, filled as far as its words say, hidden beside them', () => {
    home(reply());
    const meters = nodes(render(), hasClass('gx-meter3'));
    expect(meters.map(m => m.attrs['data-market'])).toEqual([SPREAD, TOTAL]);
    for (const meter of meters) {
      expect(meter.attrs['aria-hidden']).toBe('true');
      expect(nodes(meter, hasClass('gx-meter3-seg'))).toHaveLength(4);
    }
    expect(meters.map(m => nodes(m, hasClass('gx-meter3-seg--on')).length)).toEqual([2, 0]);
  });

  it('H1A: six tiles in two columns, each one button with its spoken name; Who’s in is a tile, not a card', () => {
    home(reply());
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    const list = nodes(html, attr('data-home', 'tiles'))[0];
    expect(list.attrs.class).toContain('gx-tiles');
    expect(nodes(list, n => n.tag === 'li').map(li => li.attrs['data-tile'])).toEqual(['spread', 'total', 'who', 'awards', 'tickets', 'trends']);
    expect(nodes(list, n => n.tag === 'button').map(nameFrom)).toEqual([
      'Spread rank, T-2, 10 points', 'Total rank, not scored yet', 'Who’s in, 4 of 5 Spread ballots in', 'Awards', 'My bets, loading', 'Trends, none saved, charts for every game']);
    expect(nodes(tile(html, 'who'), hasClass('gx-tile-pic'))).toHaveLength(1);
    expect(nodes(html, attr('data-home', 'whos-in'))).toHaveLength(0);
    expect(nodes(html, hasClass('gx-meter3'))).toHaveLength(2);
    expect(html).not.toContain('Your scores');
  });

  it('a ranked tile shows its rank and the season points the server sent, no chase line (H1A); an unranked tile shows no points', () => {
    home(reply());
    const html = render();
    const spread = tile(html, 'spread'), total = tile(html, 'total');
    expect(seen(spread)).toBe('Spread rank T-2 10 pts');
    expect(nodes(spread, attr('data-home', 'points')).map(textOf)).toEqual(['10 pts']);
    expect(nodes(spread, hasClass('gx-countup'))[0].attrs['data-count']).toBe('rest');
    expect(seen(total)).toBe(`Total rank — ${HOME_COPY.notScored}`);
    expect(nodes(total, attr('data-home', 'points'))).toHaveLength(0);
  });

  it('a rank tile shows the last move the League board saw on this device, and reads it without spending it', () => {
    const store = new Map([[rankKey('u-casey', 'community', SPREAD), JSON.stringify({ rank: 4, from: null })]]);
    vi.stubGlobal('localStorage', { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) });
    try {
      home(reply());
      const spread = tile(render(), 'spread');
      expect(seen(spread)).toBe('Spread rank T-2 ▲ 2 · 10 pts');
      expect(nameFrom(button(spread))).toBe('Spread rank, T-2, up 2, 10 points');
      expect(nodes(spread, hasClass('gx-tile-sub--good'))).toHaveLength(1);
      expect(store.get(rankKey('u-casey', 'community', SPREAD))).toBe(JSON.stringify({ rank: 4, from: null }));
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('the other hero states', () => {
  it('before the week opens: the countdown runs to the open under "Picks open Monday 12:00 AM PT"; the quiet "See Lines"', () => {
    home(reply({ picksDue: { state: 'not_open', opensAt: '2026-10-19T07:00:00Z', deadline: '2026-10-23T00:15:00Z', week: 7, modes: [{ mode: SPREAD }, { mode: TOTAL }], now: '2026-10-18T20:00:00Z' }, week: { season: 2026, week: 7, deadline: '2026-10-23T00:15:00Z', games: [] } }));
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html, attr('data-home', 'hero'))[0].attrs['data-state']).toBe('not_open');
    expect(nodes(html, attr('role', 'timer'))[0].attrs['aria-label']).toBe('Picks open Monday 12:00 AM PT 11 hours 0 minutes');
    expect(primaries(html)).toHaveLength(1);
    expect(buttons(nodes(html, attr('data-home', 'hero'))[0])).toEqual(['Explore games']);
  });

  it('closed: its one headline instead of a countdown; done: "Week 6 locked in"; no week: the headline says so and nothing is due', () => {
    home(reply({ picksDue: { state: 'closed', opensAt: OPENS_AT, deadline: DEADLINE, week: 6, modes: [{ mode: TOTAL }], now: '2026-10-16T01:00:00Z' } }));
    let html = render();
    expect(nodes(html, attr('role', 'timer'))).toHaveLength(0);
    const heading = html => nodes(nodes(html, attr('data-home', 'hero'))[0], n => n.tag === 'h2').map(textOf);
    expect(heading(html)).toEqual([HOME_COPY.closed]);
    expect(nodes(html, attr('data-home', 'when'))).toHaveLength(0);
    expect(buttons(nodes(html, attr('data-home', 'hero'))[0])).toEqual(['Explore games']);

    home(reply({ due: [{ mode: SPREAD, submitted: true, satOut: false, filled: 4, games: 4 }, { mode: TOTAL, submitted: false, satOut: true, filled: 0, games: 4 }], picksDue: { state: 'done', modes: [] } }));
    html = render();
    expect(heading(html)).toEqual(['Week 6 locked in']);
    expect(nodes(html, attr('data-home', 'status')).map(textOf)).toEqual(['Spread · sent Total · sat out']);
    expect(primaries(html)).toHaveLength(1);

    home(reply({ week: null, due: [], submissions: [], standings: [], picksDue: { state: 'none', modes: [] } }));
    html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(heading(html)).toEqual([HOME_COPY.noWeek]);
    expect(nodes(html, attr('data-home', 'status'))).toHaveLength(0);
    expect(nodes(html, attr('role', 'timer'))).toHaveLength(0);
    expect(buttons(nodes(html, attr('data-home', 'hero'))[0])).toEqual(['Explore games']);
    expect(nodes(html, attr('data-home', 'whos-in'))).toHaveLength(0);
  });
});

describe('while the Community read loads or fails', () => {
  it('says it is loading in a status region, with the title and no action', () => {
    home(null, { community: { status: 'loading', data: null, error: null, loading: true } });
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html, attr('role', 'status')).map(textOf)).toEqual(['Loading this week…']);
    expect(nodes(html, attr('data-skeleton', 'landing'))).toHaveLength(1);
    expect(buttons(html)).toEqual([]);
    expect(nodes(html, n => n.tag === 'h1').map(textOf)).toEqual(['Home']);
  });

  it('a failed read shows the tab\'s fail pattern: Try again and Reload the app, announced', () => {
    home(null, { community: { status: 'error', data: null, error: { status: 503, message: 'nope' }, loading: false } });
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    const alert = nodes(html, attr('role', 'alert'))[0];
    expect(textOf(alert)).toContain('This tab couldn’t load.');
    expect(buttons(html)).toEqual(['Try again', 'Reload the app']);
    expect(primaries(html)).toHaveLength(0);
    expect(textOf(alert)).not.toContain('nope');
  });
});

// Design audit A22: the My bets tile said "1 active tickets". The count has its own span, so the word agrees with it.
describe('the My bets tile', () => {
  it('names one active ticket in the singular and any other count in the plural', () => {
    home(reply());
    const words = active => { state.tickets = { loading: false, error: null, active }; return seen(tile(render(), 'tickets')); };
    try {
      expect(words(1)).toBe('My bets 1 active ticket');
      expect(words(0)).toBe('My bets 0 active tickets');
      expect(words(3)).toBe('My bets 3 active tickets');
    } finally { state.tickets = { loading: true, error: null, active: null }; }
  });
});

describe('NEW on Home’s tiles (D-69 4.2: results from while you were away, never played on launch)', () => {
  it('a rank move that waits shows NEW on its own market’s tile and says it; the other tile stays quiet', () => {
    home(reply());
    state.waiting = { [scoreScope('guess_spread')]: [{ id: 'rank:community:guess_spread:1', kind: 'rankUp', title: 'Up to 2nd' }] };
    const html = render();
    expect(nameFrom(button(tile(html, 'spread')))).toBe('Spread rank, T-2, 10 points, new');
    expect(nodes(tile(html, 'spread'), hasClass('gx-new'))).toHaveLength(1);
    expect(nodes(tile(html, 'total'), hasClass('gx-new'))).toHaveLength(0);
  });

  it('the Awards tile: the newest week’s count, your award named, NEW for a waiting award or badge and never for a streak', () => {
    home(reply());
    state.features = features();
    expect(nameFrom(button(tile(render(), 'awards')))).toBe('Awards, 2 in Week 5, you won Total winner');
    state.waiting = { features: [{ id: 'award:community:2026:5:total_winner', kind: 'award', title: 'Total winner' }] };
    let awards = tile(render(), 'awards');
    expect(seen(awards)).toBe('Awards 2 Week 5 · New: Total winner NEW');
    expect(nameFrom(button(awards))).toBe('Awards, 2 in Week 5, new: Total winner');
    state.waiting = { features: [{ id: 'badge:x', kind: 'badge', title: 'Bullseye' }] };
    expect(nameFrom(button(tile(render(), 'awards')))).toBe('Awards, 2 in Week 5, you won Total winner, new');
    state.waiting = { features: [{ id: 'streak:pick:2026:4:4', kind: 'streak', title: 'Pick streak' }] };
    awards = tile(render(), 'awards');
    expect(nodes(awards, hasClass('gx-new'))).toHaveLength(0);
  });
});

describe('Home’s own moments (spec 6 step 2: only Whole week locked and the Pick streak, in place)', () => {
  it('Home holds only its own scope, from the next-move card, so a waiting badge, award or rank move never plays on Home', () => {
    home(reply()); state.scopes = [];
    render();
    expect(state.scopes).toEqual(['home']);
    home(null, { community: { status: 'loading', data: null, error: null, loading: true } }); state.scopes = [];
    render();
    expect(state.scopes, 'a loading Home holds no card, so nothing waiting is spent on a placeholder').toEqual([]);
  });

  it('Whole week locked pops its market’s meter in place; a longer Pick streak pops the streak pill', () => {
    home(reply());
    state.features = features();
    state.popped = ['weekLocked:2026:6:guess_spread', 'streak:pick:2026:3:3'];
    const html = render();
    const columns = nodes(nodes(html, attr('data-home', 'status'))[0], n => n.tag === 'li');
    expect(columns.map(li => [li.attrs['data-market'], li.attrs['data-moment'] ?? null])).toEqual([['guess_spread', 'pop'], ['guess_total', null]]);
    expect(nodes(html, attr('data-home', 'streak'))[0].attrs['data-moment']).toBe('pop');
  });
});

describe('words', () => {
  it('no surface sentence over twelve words on Home, in every card state (D-66; design audit B0-4)', () => {
    for (const community of [reply(), reply({ picksDue: { ...reply().picksDue, state: 'urgent' } }), reply({ picksDue: { state: 'done', modes: [] } }), reply({ week: null, due: [], submissions: [], standings: [], picksDue: { state: 'none', modes: [] } })]) {
      home(community); state.features = features();
      expect(longLines(render())).toEqual([]);
    }
  });
});
