// Redesign build plan stage 12: the read-only Home, rendered with vitest + react-dom/server over fixture Community
// replies (no browser; the browser checks are tests/cloud-browser/next-home.spec.js, whose fixture week cannot score
// a ballot, so the ranked and tied tiles are rendered here). The data hook is stood in for, so nothing here reaches
// the network. Fixture people and points only; no player data.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { HOME_COPY, homeTiles } from '../shared/home-view.mjs';

const state = vi.hoisted(() => ({ home: null }));
vi.mock('../web/src/next/home/homeData.js', () => ({ useHomeData: () => state.home }));

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

const shell = { tab: vi.fn(), toOldApp: vi.fn(), state: { tab: 'home', sheets: [] } };
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

afterEach(() => { state.home = null; vi.clearAllMocks(); });

describe('Home while picks are due', () => {
  it('one lime button, "Make picks"; the week; the countdown named with its words; one status line per market', () => {
    home(reply());
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html, n => n.tag === 'h1').map(textOf)).toEqual(['Home']);
    const hero = nodes(html, attr('data-home', 'hero'))[0];
    expect(hero.attrs['data-state']).toBe('due');
    expect(textOf(hero)).toContain('Week 6');
    expect(primaries(html).map(textOf)).toEqual(['Make picks']);
    expect(buttons(html).filter(t => t === 'See Lines')).toEqual([]);
    const timer = nodes(html, attr('role', 'timer'))[0];
    expect(timer.attrs['aria-label']).toBe('Picks lock in 2 days 4 hours 12 minutes');
    expect(timer.attrs['aria-live']).toBe('off');
    expect(nodes(html, attr('data-home', 'status')).map(textOf)).toEqual(['Spread 2 of 4 picked Total 0 of 4 picked']);
    expect(nodes(html, attr('data-home', 'line'))).toHaveLength(0);
  });

  it('who\'s in: "4 of 5 in", the faces of everyone in or sat out, never the one still out', () => {
    home(reply());
    const html = render();
    const who = nodes(html, attr('data-home', 'whos-in'))[0];
    expect(textOf(who)).toContain('Who’s in');
    expect(textOf(who)).toContain('4 of 5 in');
    expect(homeTiles({ community: reply() }).whosIn.label).toBe('4 of 5 in');
    // Four people are done (three in, Emery sat out); the stack shows up to four faces, so none is folded into "+N".
    expect(nodes(who, hasClass('gx-av'))).toHaveLength(4);
    expect(nodes(who, hasClass('gx-av-more'))).toHaveLength(0);
    expect(textOf(who)).not.toContain('Casey');
  });

  it('the rank tiles: "T-2" in words for the tie, points to one decimal, the chase line under Spread; "—" and "No ballot yet" for Total, never 0', () => {
    home(reply());
    const html = render();
    const spread = tile(html, 'spread');
    expect(textOf(spread)).toContain('Spread rank');
    expect(seen(spread)).toContain('T-2');
    expect(textOf(spread)).toContain('Rank 2, tied');
    expect(textOf(spread)).toContain('10.0 pts');
    expect(nodes(spread, attr('data-home', 'chase')).map(textOf)).toEqual(['2 behind Blake Rivers']);
    const total = tile(html, 'total');
    expect(textOf(total)).toContain('Total rank');
    expect(seen(total)).toContain('—');
    expect(textOf(total)).toContain('Not ranked');
    expect(textOf(total)).toContain('No ballot yet');
    expect(seen(total)).not.toMatch(/\d/);
    expect(nodes(total, attr('data-home', 'chase'))).toHaveLength(0);
  });

  it.each([[SPREAD, 'spread', TOTAL, 'total'], [TOTAL, 'total', SPREAD, 'spread']])('an unscored %s submission says "Not scored yet" while the other market still says "No ballot yet"', (submittedMode, submittedMarket, emptyMode, emptyMarket) => {
    home(reply({
      due: [{ mode: submittedMode, submitted: true, satOut: false, filled: 4, games: 4 }, { mode: emptyMode, submitted: false, satOut: false, filled: 0, games: 4 }],
      submissions: [sent('u-casey', submittedMode)],
      standings: [row('u-casey', submittedMode, 0, 0), row('u-casey', emptyMode, null, 0, { weeksSubmitted: 0 })],
    }));
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(textOf(tile(html, submittedMarket))).toContain('Not scored yet');
    expect(textOf(tile(html, submittedMarket))).not.toContain('No ballot yet');
    expect(textOf(tile(html, emptyMarket))).toContain('No ballot yet');
    expect(textOf(tile(html, emptyMarket))).not.toContain('Not scored yet');
    for (const market of ['spread', 'total']) {
      expect(seen(tile(html, market))).toContain('—');
      expect(seen(tile(html, market))).not.toMatch(/\d/);
    }
  });

  it('a scored zero remains a ranked "0.0 pts", not an unscored ballot', () => {
    home(reply({ standings: [row('u-casey', SPREAD, 0, 1)] }));
    const spread = tile(render(), 'spread');
    expect(textOf(spread)).toContain('Rank 1');
    expect(textOf(spread)).toContain('0.0 pts');
    expect(textOf(spread)).not.toContain('Not scored yet');
    expect(textOf(spread)).not.toContain('No ballot yet');
  });

  it('the leader reads "You lead by 2"; first place keeps the kit\'s lime ring', () => {
    home(reply({ viewer: 'u-blake' }), { viewer: 'u-blake' });
    const html = render();
    const spread = tile(html, 'spread');
    expect(seen(spread)).toContain('1');
    expect(nodes(spread, hasClass('gx-rank--1'))).toHaveLength(1);
    expect(textOf(spread)).toContain('12.0 pts');
    expect(nodes(spread, attr('data-home', 'chase')).map(textOf)).toEqual(['You lead by 2']);
    expect(textOf(tile(html, 'total'))).toContain('7.5 pts');
  });
});

describe('the other hero states', () => {
  it('before the week opens: the countdown runs to the open under "Picks open Monday 12:00 AM PT"; the quiet "See Lines"', () => {
    home(reply({ picksDue: { state: 'not_open', opensAt: '2026-10-19T07:00:00Z', deadline: '2026-10-23T00:15:00Z', week: 7, modes: [{ mode: SPREAD }, { mode: TOTAL }], now: '2026-10-18T20:00:00Z' }, week: { season: 2026, week: 7, deadline: '2026-10-23T00:15:00Z', games: [] } }));
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html, attr('data-home', 'hero'))[0].attrs['data-state']).toBe('not_open');
    expect(nodes(html, attr('role', 'timer'))[0].attrs['aria-label']).toBe('Picks open Monday 12:00 AM PT 11 hours 0 minutes');
    expect(primaries(html)).toHaveLength(0);
    expect(buttons(html)).toEqual(['See Lines']);
  });

  it('closed: its one line instead of a countdown; done: "You’re in for this week"; no week: the title says so and nothing is due', () => {
    home(reply({ picksDue: { state: 'closed', opensAt: OPENS_AT, deadline: DEADLINE, week: 6, modes: [{ mode: TOTAL }], now: '2026-10-16T01:00:00Z' } }));
    let html = render();
    expect(nodes(html, attr('role', 'timer'))).toHaveLength(0);
    expect(nodes(html, attr('data-home', 'line')).map(textOf)).toEqual([HOME_COPY.closed]);
    expect(buttons(html)).toEqual(['See Lines']);

    home(reply({ due: [{ mode: SPREAD, submitted: true, satOut: false, filled: 4, games: 4 }, { mode: TOTAL, submitted: false, satOut: true, filled: 0, games: 4 }], picksDue: { state: 'done', modes: [] } }));
    html = render();
    expect(nodes(html, attr('data-home', 'line')).map(textOf)).toEqual([HOME_COPY.done]);
    expect(nodes(html, attr('data-home', 'status')).map(textOf)).toEqual(['Spread sent Total sat out']);
    expect(primaries(html)).toHaveLength(0);

    home(reply({ week: null, due: [], submissions: [], standings: [], picksDue: { state: 'none', modes: [] } }));
    html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(textOf(nodes(html, attr('data-home', 'hero'))[0])).toContain(HOME_COPY.noWeek);
    expect(nodes(html, attr('data-home', 'status'))).toHaveLength(0);
    expect(nodes(html, attr('role', 'timer'))).toHaveLength(0);
    expect(buttons(html)).toEqual(['See Lines']);
    expect(textOf(nodes(html, attr('data-home', 'whos-in'))[0])).toContain('0 of 5 in');
  });
});

describe('while the Community read loads or fails', () => {
  it('says it is loading in a status region, with the title and no action', () => {
    home(null, { community: { status: 'loading', data: null, error: null, loading: true } });
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html, attr('role', 'status')).map(textOf)).toEqual(['Loading this week…']);
    expect(buttons(html)).toEqual([]);
    expect(nodes(html, n => n.tag === 'h1').map(textOf)).toEqual(['Home']);
  });

  it('a failed read shows the tab\'s fail pattern: Try again and Use the old app, announced', () => {
    home(null, { community: { status: 'error', data: null, error: { status: 503, message: 'nope' }, loading: false } });
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    const alert = nodes(html, attr('role', 'alert'))[0];
    expect(textOf(alert)).toContain('This tab couldn’t load.');
    expect(buttons(html)).toEqual(['Try again', 'Use the old app']);
    expect(primaries(html)).toHaveLength(0);
    expect(textOf(alert)).not.toContain('nope');
  });
});
