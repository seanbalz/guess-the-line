// Redesign build plan stage 13 (with DASH-7's All trends sheet): the Lines board, the game sheet and the All trends sheet,
// rendered with vitest + react-dom/server over the committed Week 6 trends file and fixture replies (no browser; the browser
// checks are tests/cloud-browser/next-lines.spec.js). The data hook and the wind and referee loaders are stood in for, so
// nothing here reaches the network. Fixture picks and lines only; no player data.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import week from '../shared/trends/2026-week-06.json';
import { bannedCopy } from '../shared/trends.mjs';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { allTrends } from '../shared/trends-view.mjs';
import { TEAM_NAMES } from '../shared/nfl-schedule.mjs';

const state = vi.hoisted(() => ({ lines: null, wind: null, officials: null }));
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: () => state.lines }));
vi.mock('../web/src/next/lines/trendsHooks.js', () => ({
  useOfficials: () => state.officials,
  useWind: () => state.wind ?? { loading: false, wind: null, now: null },
  useTrendWeek: () => ({ status: 'ready', week }),
}));

const { ShellContext } = await import('../web/src/next/shell/context.js');
const { LinesBoard } = await import('../web/src/next/lines/LinesBoard.jsx');
const { GameSheet } = await import('../web/src/next/lines/GameSheet.jsx');
const { AllTrendsSheet, GroupBody } = await import('../web/src/next/lines/AllTrendsSheet.jsx');
const { ShortTrend } = await import('../web/src/next/lines/parts.jsx');

const records = JSON.parse(fs.readFileSync(new URL('../shared/team-records-2026.json', import.meta.url), 'utf8'));
const GAMES = week.games.map(g => ({ id: g.id, away: g.away, home: g.home, awayCode: g.away, homeCode: g.home, kickoff: g.kickoff }));
const HOUR = 3_600_000;
const NOW = Date.parse(week.games[0].kickoff) - 24 * HOUR;
const TODAY = { sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' };
const ref = value => ({ basis: 'line_at_guess', status: 'available', value, source: 'fixture' });
const shell = { openSheet: vi.fn(), closeSheet: vi.fn(), toOldApp: vi.fn(), state: { sheets: [] } };

/** The data hook's answer: the viewer's own week (a sent Total, Spread drafts and a forged Spread line), the Community week. */
function data({ now = NOW, rules = TODAY } = {}) {
  const totals = Object.fromEntries(GAMES.map(g => [g.id, 44]));
  const personal = { season: 2026, week: 6, now: new Date(now).toISOString(), deadline: week.games[0].kickoff, games: GAMES, rules, ballots: {
    guess_spread: { picks: { 'SEA-DEN': 4, 'HOU-JAX': -9 }, scoringReferences: { 'SEA-DEN': ref(-11.5) } },
    guess_total: { picks: totals, submittedAt: new Date(now - HOUR).toISOString(), scoringReferences: { 'SEA-DEN': ref(43.5) } },
  } };
  return { app: { refresh: vi.fn() }, personal: { status: 'ready', data: personal, error: null }, community: { week: { season: 2026, week: 6 }, optOuts: [] },
    shown: { season: 2026, week: 6 }, trends: { status: 'ready', week }, trendsWeek: week, records };
}
const render = node => renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx">{node}</div></ShellContext.Provider>);
const text = html => [...walk(parseMarkup(html))].filter(x => x.text !== undefined).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();
const nodes = (html, test) => [...walk(parseMarkup(html))].filter(n => n.tag && test(n));
const attr = (name, value) => n => n.attrs[name] === value;
const textOf = n => [...walk(n)].filter(x => x.text !== undefined).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();

afterEach(() => { state.lines = null; state.wind = null; state.officials = null; });

describe('the Lines board', () => {
  it('a lock is an icon on every closed market, never "—"; your tags; your own line at the guess; at most three trend lines', () => {
    state.lines = data();
    const html = render(<LinesBoard/>);
    expect(markupProblems(html)).toEqual([]);
    const cards = nodes(html, n => n.attrs['data-game']);
    expect(cards).toHaveLength(14);
    const locked = nodes(html, attr('data-cell', 'locked'));
    expect(locked).toHaveLength(14, 'every Spread is closed (drafts only)');
    for (const cell of locked) {
      expect(cell.children.filter(c => c.tag === 'svg')).toHaveLength(1);
      expect(textOf(cell)).toBe('');
    }
    // Every Total is open (sent): his line at the guess where one is saved, else "—" (a missing value, not a lock).
    expect(nodes(html, attr('data-cell', 'line')).map(textOf)).toEqual(['43.5 at your guess']);
    expect(nodes(html, attr('data-cell', 'none'))).toHaveLength(13);
    expect(nodes(html, attr('data-cell', 'none')).every(n => textOf(n) === '—')).toBe(true);
    const sea = cards.find(attr('data-game', 'SEA-DEN'));
    expect(textOf(sea)).toContain('You −4');
    expect(sea.attrs['aria-label']).toBe('Seahawks at Broncos, Thu 5:15 PM PT. Spread line hidden. Total 43.5 at your guess. Your spread pick SEA −4. Your total pick 44. Open game details');
    const chips = nodes(html, n => n.attrs['data-chip']);
    expect(chips.length).toBeLessThanOrEqual(3);
    for (const card of cards) expect([...walk(card)].filter(n => n.attrs?.['data-chip']).length).toBeLessThanOrEqual(1);
    expect(text(html)).toContain('Line now arrives in a later update.');
    // The forged line under the closed Spread (−11.5) never shows.
    expect(text(html)).not.toContain('11.5');
  });

  it('says what is happening while the week loads, when it is not published and when the read fails', () => {
    state.lines = { ...data(), personal: { status: 'loading', data: null, error: null } };
    expect(text(render(<LinesBoard/>))).toContain('Loading this week’s games…');
    state.lines = { ...data(), personal: { status: 'error', data: null, error: { status: 404 } } };
    expect(text(render(<LinesBoard/>))).toContain('This week’s games aren’t published yet.');
    state.lines = { ...data(), personal: { status: 'error', data: null, error: { status: 0 } } };
    const failed = render(<LinesBoard/>);
    expect(text(failed)).toContain('This week’s games didn’t load.');
    expect(nodes(failed, n => n.tag === 'button').map(textOf)).toEqual(['Try again', 'Use the old app']);
  });
});

describe('the game sheet', () => {
  it('header, You on this game, the top trends with records and sample sizes, and a locked line trend with no number', () => {
    state.lines = data();
    const sea = render(<GameSheet args={{ game: 'SEA-DEN' }}/>);
    expect(markupProblems(sea)).toEqual([]);
    const t = text(sea);
    expect(t).toContain('Thu Oct 15 · 5:15 PM PT · TNF · Denver');
    expect(t).toMatch(/Seahawks \d+–\d+ · Broncos \d+–\d+ · Records as of Thu Oct 8/);
    expect(t).toContain('Draft SEA −4');
    expect(t).toContain('Submit your Spread picks to see this line.');
    expect(t).toContain('Submitted 44');
    expect(t).toContain('Line at your guess 43.5');
    expect(t).not.toContain('11.5');
    const locked = nodes(sea, attr('data-trend', 'locked'));
    expect(locked).toHaveLength(1);
    expect(textOf(locked[0])).toBe('Line-based trend Submit your Spread picks to see this trend.');
    expect(textOf(locked[0])).not.toMatch(/\d/);
    expect(t).toContain('Line now arrives in a later update.');

    const nyg = render(<GameSheet args={{ game: 'NO-NYG' }}/>);
    const top = nodes(nyg, n => n.tag === 'li' && n.attrs['data-trend']);
    expect(top.map(textOf)).toEqual([
      'Covering almost every week this season · NYG 54% Teams in the Saints’ spot covered 442 times and missed 377 since 2002. Record 442–377–19 838 games Consistent, not proven',
      'Totals reversion 53% Under after high-scoring starts and Over after low-scoring starts: right 830 times and wrong 724 since 2002. Record 830–724–17 1,571 games Watch list, no proven edge',
      'Home team after an overtime game · NYG 57% Teams in the Saints’ spot covered 186 times and missed 142 since 2002. Record 186–142–13 341 games Watch list, no proven edge',
    ]);
    expect(bannedCopy(top.map(textOf).join(' '))).toEqual([]);
    // No weather or referee row without data (here: no forecast read, no assignment); All trends is always there.
    expect(nodes(nyg, attr('data-row', 'weather'))).toHaveLength(0);
    expect(nodes(nyg, attr('data-row', 'referee'))).toHaveLength(0);
    expect(text(nyg)).toContain('All trends');
  });

  it('the weather row is closed with no digits; the referee row names the assignment', () => {
    state.lines = data();
    const k = Date.parse(week.games[0].kickoff);
    state.wind = { loading: false, now: NOW, wind: { asOf: new Date(NOW).toISOString(), games: { 'SEA-DEN': { kickoff: week.games[0].kickoff, status: 'forecast',
      venue: { name: 'Empower Field at Mile High', city: 'Denver', country: 'USA', type: 'outdoor' },
      wind: { windMph: 16.4, gustMph: 31.2, directionDeg: 225, temperatureF: 57.2, precipitationProbability: 40, forecastHour: new Date(k - 15 * 60_000).toISOString(), fetchedAt: new Date(NOW - HOUR).toISOString() } } } } };
    state.officials = { season: 2026, week: 6, assignments: { 'SEA-DEN': { referee: 'Shawn Hochuli', setAt: '2026-10-14T18:00:00Z', revision: 1 } } };
    const html = render(<GameSheet args={{ game: 'SEA-DEN' }}/>);
    expect(markupProblems(html)).toEqual([]);
    const weather = nodes(html, attr('data-row', 'weather'))[0];
    expect(textOf(weather)).toBe('Weather at kickoff Kickoff forecast');
    expect(textOf(weather)).not.toMatch(/\d/);
    const referee = nodes(html, attr('data-row', 'referee'))[0];
    expect(textOf(referee)).toBe('Referee Shawn Hochuli');
  });
});

describe('the All trends sheet', () => {
  it('opens over the game sheet with its back button; five groups; locked groups show no numbers', () => {
    state.lines = data();
    const html = render(<AllTrendsSheet args={{ game: 'SEA-DEN' }}/>);
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html, n => n.tag === 'button' && textOf(n) === 'SEA @ DEN')).toHaveLength(1);
    expect(nodes(html, n => n.attrs['data-group']).map(n => n.attrs['data-group'])).toEqual(['team', 'situational', 'line', 'weather', 'referee']);
    expect(nodes(html, n => n.attrs['data-group'] === 'referee').map(textOf)).toEqual(['Referee Not assigned yet']);
    // Each group's body, as it opens.
    const groups = Object.fromEntries(allTrends(week, 'SEA-DEN', { access: { spread: false, total: true }, saved: { spread: null, total: 43.5 }, names: TEAM_NAMES }).groups.map(g => [g.key, g]));
    const line = render(<GroupBody group={groups.line} rules={TODAY}/>);
    expect(text(line)).toContain('Submit your Spread picks to see its Spread line-based records.');
    expect(groups.line.locks).toEqual(['spread']);
    expect(groups.line.items.length).toBeGreaterThan(0);
    expect(groups.line.items.every(item => item.gate === 'total'), 'only Total records show while the Spread is closed').toBe(true);
    expect(nodes(line, n => n.tag === 'li' && n.attrs['data-trend'])).toHaveLength(groups.line.items.length);
    const situational = render(<GroupBody group={groups.situational} rules={TODAY}/>);
    const items = nodes(situational, n => n.tag === 'li' && n.attrs['data-trend']);
    expect(items.length).toBeGreaterThan(10);
    expect(items[0].attrs['data-trend']).toBe('locked');
    expect(textOf(items[0])).not.toMatch(/\d/);
    for (const item of items.slice(1)) expect(textOf(item)).toMatch(/Record [\d,]+–[\d,]+(–[\d,]+)? [\d,]+ games?/);
    const team = render(<GroupBody group={groups.team} rules={TODAY}/>);
    expect(text(team)).toContain('Last meetings (within four years)');
    expect(text(team)).toContain('2024-09-08: DEN 20, SEA 26');
  });

  it('a locked short trend never prints a number, whatever the market', () => {
    for (const gate of ['spread', 'total', 'both']) {
      const html = render(<ShortTrend card={{ key: 'x', kind: 'card', gate, locked: true, title: 'Line-based trend', strength: [3, -22] }} rules={TODAY}/>);
      expect(textOf(parseMarkup(html))).not.toMatch(/\d/);
    }
  });
});
