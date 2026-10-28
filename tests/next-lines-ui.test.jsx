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
import { accessFor, lineAtGuess, gamesOf } from '../shared/lines-view.mjs';
import { TEAM_NAMES } from '../shared/nfl-schedule.mjs';
import { assertNoLeak, leakScan, lineSecrets, pickSecrets } from './helpers/leak-scan.mjs';

const state = vi.hoisted(() => ({ lines: null, wind: null, officials: null, openRows: false, research: null, teams: null }));
// SSR verifies the detail markup eagerly; the real code-loading boundary is exercised in Playwright.
vi.mock('../web/src/next/lines/GameDetailsSlot.jsx', async () => ({
  GameDetailsSlot: (await import('../web/src/next/lines/GameDetails.jsx')).default,
}));
// The native private-note editor uses the existing authenticated route wrapper. SSR never makes its effect read;
// isolate that browser auth module here while the hosted-schema browser spec exercises the real handler and auth.
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), linesApi: vi.fn(), communityApi: vi.fn(), betsApi: vi.fn() }));
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: () => state.lines }));
vi.mock('../web/src/next/lines/useGameLines.js', () => ({
  useGameLines: () => ({ status: 'loading', data: null }),
  useBoardLines: () => {
    const personal = state.lines.personal.data;
    return { status: 'ready', now: Date.parse(personal?.now), reload: vi.fn(), data: { games: gamesOf(personal).map(g => {
      const access = accessFor(personal, state.lines.community, g.id);
      return { ...g, awayCode: g.away, homeCode: g.home, started: Date.parse(personal.now) >= Date.parse(g.kickoff),
        ...Object.fromEntries(['spread', 'total'].map(m => [m, { visible: access[m], value: lineAtGuess(personal, g, m, access)?.value ?? null, source: 'fixture', observedAt: personal.now }])) };
    }) } };
  },
}));
// The matchup research read (/lines/research): loading, as SSR leaves it, unless a test gives its answer.
vi.mock('../web/src/next/research/useResearch.js', async importOriginal => ({
  ...(await importOriginal()), useResearch: () => state.research ?? { status: 'loading', data: null, reload: () => {} },
}));
// D-62: the shared team read (records and game logs); the bundled records until a test gives its answer.
vi.mock('../web/src/next/teams/teamsData.js', async importOriginal => {
  const real = await importOriginal();
  return { ...real, useTeamSeason: () => state.teams ?? { status: 'loading', data: real.fallbackTeamSeason() } };
});
vi.mock('../web/src/next/lines/trendsHooks.js', () => ({
  useOfficials: () => state.officials,
  useWind: () => state.wind ?? { loading: false, wind: null, now: null },
  useTrendWeek: () => ({ status: 'ready', week }),
}));
// `state.openRows` opens every row that opens in place, so a test can read the bodies a closed row keeps out of the markup.
vi.mock('../web/src/next/lines/parts.jsx', async importOriginal => {
  const parts = await importOriginal();
  const { createElement } = await import('react');
  return { ...parts, Expander: props => createElement(parts.Expander, { ...props, open: state.openRows || props.open }) };
});

const { ShellContext } = await import('../web/src/next/shell/context.js');
const { LinesBoard } = await import('../web/src/next/lines/LinesBoard.jsx');
const { GameSheet } = await import('../web/src/next/lines/GameSheet.jsx');
const { YourPickSheet } = await import('../web/src/next/lines/YourPickSheet.jsx');
const { AllTrendsSheet, GroupBody } = await import('../web/src/next/lines/AllTrendsSheet.jsx');
const { ShortTrend, trendInfoBody, trendRowSub } = await import('../web/src/next/lines/parts.jsx');
const { INFO } = await import('../web/src/next/info.js');

const records = JSON.parse(fs.readFileSync(new URL('../shared/team-records-2026.json', import.meta.url), 'utf8'));
const GAMES = week.games.map(g => ({ id: g.id, away: g.away, home: g.home, awayCode: g.away, homeCode: g.home, kickoff: g.kickoff }));
const HOUR = 3_600_000;
const NOW = Date.parse(week.games[0].kickoff) - 24 * HOUR;
const TODAY = { sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' };
const ref = value => ({ basis: 'line_at_guess', status: 'available', value, source: 'fixture' });
const shell = { openSheet: vi.fn(), closeSheet: vi.fn(), reload: vi.fn(), setDirty: vi.fn(), confirmLeave: vi.fn(() => true), state: { sheets: [] } };

/** The data hook's answer: the viewer's own week (a sent Total, Spread drafts and a forged Spread line), the Community week. */
function data({ now = NOW, rules = TODAY } = {}) {
  const totals = Object.fromEntries(GAMES.map(g => [g.id, 44]));
  const personal = { season: 2026, week: 6, now: new Date(now).toISOString(), deadline: week.games[0].kickoff, games: GAMES, rules, ballots: {
    guess_spread: { picks: { 'SEA-DEN': 4, 'HOU-JAX': -9 }, scoringReferences: { 'SEA-DEN': ref(-11.5) } },
    guess_total: { picks: totals, submittedAt: new Date(now - HOUR).toISOString(), scoringReferences: { 'SEA-DEN': ref(43.5) } },
  } };
  return { app: { accountId: 'fixture-account', refresh: vi.fn(), requestSignIn: vi.fn() }, personal: { status: 'ready', data: personal, error: null }, community: { week: { season: 2026, week: 6 }, optOuts: [] },
    shown: { season: 2026, week: 6 }, trends: { status: 'ready', week }, trendsWeek: week, records };
}
const render = node => renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx">{node}</div></ShellContext.Provider>);
const text = html => [...walk(parseMarkup(html))].filter(x => x.text !== undefined).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();
const nodes = (html, test) => [...walk(parseMarkup(html))].filter(n => n.tag && test(n));
const attr = (name, value) => n => n.attrs[name] === value;
const textOf = n => [...walk(n)].filter(x => x.text !== undefined).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();

afterEach(() => { state.lines = null; state.wind = null; state.officials = null; state.openRows = false; state.research = null; state.teams = null; });

describe('the Lines board', () => {
  it('a lock is an icon on every closed market, never "—"; your tags; current quote; at most three trend lines', () => {
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
    // Every Total is open: the reader fixture carries one quote; missing quotes are not locks.
    expect(nodes(html, attr('data-cell', 'line')).map(textOf)).toEqual(['43.5 Current line']);
    expect(nodes(html, attr('data-cell', 'none'))).toHaveLength(13);
    expect(nodes(html, attr('data-cell', 'none')).every(n => textOf(n) === '— Unavailable')).toBe(true);
    const sea = cards.find(attr('data-game', 'SEA-DEN'));
    expect(textOf(sea)).toContain('You −4');
    expect(sea.attrs['aria-label']).toContain('Spread line hidden. Total 43.5. Current line. fixture. Updated');
    const chips = nodes(html, n => n.attrs['data-chip'] === 'trend');
    expect(chips.length).toBeLessThanOrEqual(3);
    for (const card of cards) expect([...walk(card)].filter(n => n.attrs?.['data-chip']).length).toBeLessThanOrEqual(1);
    // D-55: the credits and "Line now arrives…" are behind the title's ⓘ.
    expect(nodes(html, n => n.tag === 'button' && n.attrs['aria-label'] === 'About trends')).toHaveLength(1);
    expect(text(html)).not.toContain('Line now arrives in a later update.');
    // The forged line under the closed Spread (−11.5) never shows.
    expect(text(html)).not.toContain('11.5');
  });

  it('D-62: each team\'s record sits beside its name in text-2 numbers and is said after the matchup; the row stays one button', () => {
    state.lines = data();
    const record = (w, l, t = 0) => ({ overall: { w, l, t }, home: null, road: null, pointsFor: null, pointsAgainst: null, games: [] });
    const season = year => ({ status: 'ready', data: { season: year, throughWeek: 6, fallback: false, teams: { SEA: record(3, 2), DEN: record(2, 2, 1) } } });
    state.teams = season(2026);
    const html = render(<LinesBoard/>);
    expect(markupProblems(html)).toEqual([]);
    const cards = Object.fromEntries(nodes(html, n => n.attrs['data-game']).map(n => [n.attrs['data-game'], n]));
    const recs = card => [...walk(card)].filter(n => n.attrs?.class === 'gx-l-rec').map(textOf);
    expect(recs(cards['SEA-DEN'])).toEqual(['3–2', '2–2–1']);
    expect(cards['SEA-DEN'].attrs['aria-label']).toMatch(/^Seahawks at Broncos, \w{3} [^.]+ PT\. Records: Seahawks 3–2, Broncos 2–2–1\. Spread line hidden\./);
    expect([...walk(cards['SEA-DEN'])].filter(n => n.tag === 'button'), 'no team buttons nested in the row').toHaveLength(0);
    expect(recs(cards['HOU-JAX']), 'a team the read does not have shows no record').toEqual([]);
    // A file for another season never labels this week's games.
    state.teams = season(2025);
    expect(render(<LinesBoard/>)).not.toContain('gx-l-rec');
  });

  it('one weather word per card from the week\'s forecasts (D-45), never digits; a trend line keeps its place; none for a dome', () => {
    state.lines = data();
    const forecast = (id, values) => {
      const g = week.games.find(x => x.id === id), k = Date.parse(g.kickoff);
      return { kickoff: g.kickoff, venue: g.flags.stadium, status: 'forecast', wind: { windMph: 9, gustMph: 12, directionDeg: 180, temperatureF: 60, precipitationProbability: 10,
        forecastHour: new Date(Math.round(k / HOUR) * HOUR).toISOString(), fetchedAt: new Date(NOW - HOUR).toISOString(), ...values } };
    };
    state.wind = { loading: false, now: NOW, wind: { season: 2026, week: 6, asOf: new Date(NOW).toISOString(), games: {
      'SEA-DEN': forecast('SEA-DEN', { windMph: 21.3 }), 'NO-NYG': forecast('NO-NYG', { precipitationProbability: 80 }),
      'BUF-LV': { kickoff: week.games.find(x => x.id === 'BUF-LV').kickoff, venue: { name: 'Allegiant Stadium', city: 'Las Vegas', country: 'USA', type: 'dome' }, status: 'indoor', wind: null },
    } } };
    const html = render(<LinesBoard/>);
    expect(markupProblems(html)).toEqual([]);
    const cards = Object.fromEntries(nodes(html, n => n.attrs['data-game']).map(n => [n.attrs['data-game'], n]));
    const chip = id => [...walk(cards[id])].find(n => n.attrs?.['data-chip']);
    expect(chip('SEA-DEN').attrs['data-chip']).toBe('weather');
    expect(textOf(chip('SEA-DEN'))).toBe('Windy');
    expect([...walk(chip('SEA-DEN'))].filter(n => n.tag === 'svg'), 'a weather word, not the trend diamond').toHaveLength(0);
    expect(cards['SEA-DEN'].attrs['aria-label']).toContain('Kickoff weather: Windy.');
    expect(chip('NO-NYG').attrs['data-chip'], 'its trend line keeps the one chip').toBe('trend');
    expect(chip('BUF-LV')).toBeUndefined();
    for (const node of nodes(html, attr('data-chip', 'weather'))) expect(textOf(node)).not.toMatch(/\d/);
  });

  it('says what is happening while the week loads, when it is not published and when the read fails', () => {
    state.lines = { ...data(), personal: { status: 'loading', data: null, error: null } };
    expect(text(render(<LinesBoard/>))).toContain('Loading this week’s games…');
    state.lines = { ...data(), personal: { status: 'error', data: null, error: { status: 404 } } };
    expect(text(render(<LinesBoard/>))).toContain('This week’s games aren’t published yet.');
    state.lines = { ...data(), personal: { status: 'error', data: null, error: { status: 0 } } };
    const failed = render(<LinesBoard/>);
    expect(text(failed)).toContain('This week’s games didn’t load.');
    // D-55: the title's ⓘ is the one icon-only button; it is named for its topic.
    expect(nodes(failed, n => n.tag === 'button').map(n => textOf(n) || n.attrs['aria-label'])).toEqual(['About trends', 'Try again', 'Reload the app']);
  });

  it('design upgrade: while the week loads, skeleton game cards stand in, with the words kept as the status a screen reader hears', () => {
    state.lines = { ...data(), personal: { status: 'loading', data: null, error: null } };
    const html = render(<LinesBoard/>);
    expect(markupProblems(html)).toEqual([]);
    const [status] = nodes(html, attr('role', 'status'));
    expect(status.attrs['data-skeleton']).toBe('cards');
    expect(textOf(status)).toBe('Loading this week’s games…');
    const [words] = nodes(html, attr('class', 'gx-sr-only'));
    expect(textOf(words)).toBe('Loading this week’s games…');
    const [art] = nodes(html, attr('class', 'gx-skel-art'));
    expect(art.attrs['aria-hidden']).toBe('true');
    expect(nodes(html, attr('class', 'gx-skel-card'))).toHaveLength(3);
    expect(textOf(art)).toBe('');
  });
});

describe('the game sheet pages through the week (design upgrade)', () => {
  const order = () => gamesOf(data().personal.data);
  const pageButtons = html => nodes(html, n => n.tag === 'button' && (n.attrs.class ?? '').split(' ').includes('gx-sheet-page'));
  it('shows its place under the title and names the neighbouring games on 44px previous and next buttons', () => {
    state.lines = data();
    const games = order();
    expect(games.length).toBeGreaterThan(2);
    const second = render(<GameSheet args={{ game: games[1].id }}/>);
    expect(markupProblems(second)).toEqual([]);
    const title = `${games[1].away} @ ${games[1].home}`;
    const [dialog] = nodes(second, attr('role', 'dialog'));
    expect(textOf(nodes(second, n => n.attrs.id === dialog.attrs['aria-labelledby'])[0])).toBe(title);
    const [place] = nodes(second, attr('aria-live', 'polite'));
    expect(textOf(place)).toBe(`${title}, game 2 of ${games.length}`);
    expect(pageButtons(second).map(n => [n.attrs['aria-label'], n.attrs['aria-disabled']])).toEqual([
      [`Previous game, ${games[0].away} @ ${games[0].home}`, undefined],
      [`Next game, ${games[2].away} @ ${games[2].home}`, undefined],
    ]);
    expect(nodes(second, n => (n.attrs.class ?? '').split(' ').includes('gx-sheet-body--pager'))).toHaveLength(1);
    // At the first game the previous button stays, named and focusable, but unavailable.
    const first = render(<GameSheet args={{ game: games[0].id }}/>);
    expect(pageButtons(first).map(n => [n.attrs['aria-label'], n.attrs['aria-disabled']])).toEqual([
      ['Previous game', 'true'], [`Next game, ${games[1].away} @ ${games[1].home}`, undefined],
    ]);
    expect(textOf(nodes(first, attr('aria-live', 'polite'))[0])).toMatch(new RegExp(`game 1 of ${games.length}$`));
    const last = render(<GameSheet args={{ game: games.at(-1).id }}/>);
    expect(pageButtons(last).map(n => n.attrs['aria-disabled'])).toEqual([undefined, 'true']);
    // A game not on the board has no pager.
    expect(pageButtons(render(<GameSheet args={{ game: 'XX-YY' }}/>))).toHaveLength(0);
  });

  it('while its market lines load, skeleton panels stand in with the status in words', () => {
    state.lines = data();
    const html = render(<GameSheet args={{ game: 'SEA-DEN' }}/>);
    const [market] = nodes(html, attr('aria-label', 'Market lines'));
    const [status] = [...walk(market)].filter(n => n.attrs?.role === 'status');
    expect(status.attrs['data-skeleton']).toBe('panels');
    expect(textOf(status)).toBe('Loading market lines…');
    expect([...walk(status)].filter(n => n.attrs?.class === 'gx-skel-card')).toHaveLength(2);
  });
});

describe('the game sheet', () => {
  it('header, You on this game, the top trends with records and sample sizes, and a locked line trend with no number', () => {
    state.lines = data();
    // Pin the team read so refreshed public records cannot invalidate the expected copy.
    const record = (w, l, t = 0) => ({ overall: { w, l, t }, home: null, road: null, pointsFor: null, pointsAgainst: null, games: [] });
    state.teams = { status: 'ready', data: { season: 2026, throughWeek: 6, fallback: false, teams: { SEA: record(3, 2), DEN: record(2, 2, 1) } } };
    const sea = render(<GameSheet args={{ game: 'SEA-DEN' }}/>);
    expect(markupProblems(sea)).toEqual([]);
    const t = text(sea);
    expect(t).toContain('Thu Oct 15 · 5:15 PM PT · TNF · Denver');
    // D-62: the matchup as marks, away then home, each record under its code and each team a button to its sheet;
    // the words line ("Seahawks 3–2 · Broncos 2–2–1") is gone and one meta line says how current the records are.
    // Each mark keeps its letters behind the logo, so the code reads twice in plain text.
    expect(t).toContain('SEA SEA 3–2 @ DEN DEN 2–2–1 Records through Week 6');
    expect(t).not.toContain('Records as of');
    expect(nodes(sea, n => n.tag === 'button' && /Open team$/.test(n.attrs['aria-label'] ?? '')).map(n => n.attrs['aria-label']))
      .toEqual(['Seattle Seahawks, 3–2. Open team', 'Denver Broncos, 2–2–1. Open team']);
    expect(t).toContain('Draft SEA −4');
    expect(t).toContain('Submit your Spread picks to see this line.');
    expect(t).toContain('Submitted 44');
    expect(t).toContain('Line at your guess 43.5');
    expect(t).not.toContain('11.5');
    const locked = nodes(sea, attr('data-trend', 'locked'));
    expect(locked).toHaveLength(1);
    expect(textOf(locked[0])).toBe('Line-based trend Submit your Spread picks to see this trend.');
    expect(textOf(locked[0])).not.toMatch(/\d/);
    // D-55: the footnote, market-detail destination and nflverse credit sit behind the Trends heading's ⓘ.
    expect(nodes(sea, n => n.tag === 'button' && n.attrs['aria-label'] === 'About trends')).toHaveLength(1);
    expect(INFO.trends.body.join(' ')).toContain('Open a game for market lines, book quotes and recorded line movement.');
    expect(INFO.trends.links.map(link => link.text).join(' ')).toMatch(/nflverse/);
    expect(t).not.toContain('Line now arrives in a later update.');

    const nyg = render(<GameSheet args={{ game: 'NO-NYG' }}/>);
    // D-55 round 3: compact rows, each with its percent and sample size; the first with a chart opens in place with
    // its record since its first season and the stat tiles. Its plain sentence and tier words are in its ⓘ.
    const top = nodes(nyg, n => n.tag === 'li' && n.attrs['data-trend']);
    expect(top).toHaveLength(3);
    expect(textOf(top[0])).toMatch(/^Covering almost every week this season · NYG .*54% · 838 games/);
    expect(textOf(top[1])).toMatch(/^Totals reversion .*53% · 1,571 games/);
    expect(textOf(top[2])).toMatch(/^Home team after an overtime game · NYG .*57% · 341 games/);
    expect([...walk(top[0])].filter(n => n.attrs?.['data-trend-detail'] === '')).toHaveLength(1);
    expect(textOf(top[0])).toContain('442–377–19 since 2002');
    expect(textOf(top[0])).toContain('Win rate');
    expect([...walk(top[1])].filter(n => n.attrs?.['data-trend-detail'] === '')).toHaveLength(0);
    expect(bannedCopy(top.map(textOf).join(' '))).toEqual([]);
    const card = { sentence: 'Teams in the Saints’ spot covered 442 times and missed 377 since 2002.', tierLabel: 'Consistent, not proven', chart: { conditions: ['Team: covering 70%+'] }, notes: ['A note'] };
    expect(trendInfoBody(card).slice(0, 4)).toEqual([card.sentence, card.tierLabel, 'Team: covering 70%+', 'A note']);
    expect(trendInfoBody(card)).toEqual(expect.arrayContaining(INFO.trends.body));
    expect(trendRowSub({ chart: { side: 'Under' }, pct: 55, record: '898–730–22', sample: '1,650 games' })).toBe('Under · 55% · 1,650 games');
    expect(trendRowSub({ pct: null, record: '102–101–5', sample: '208 games' })).toBe('102–101–5 · 208 games');
    // Every game has a weather row (D-45): with no forecast read it says so, with nothing to open; no referee row
    // without an assignment; All trends is always there.
    expect(nodes(nyg, attr('data-row', 'weather')).map(textOf)).toEqual(['Weather at kickoff No current forecast']);
    expect(nodes(nyg, n => n.attrs['data-row'] === 'weather' && n.tag === 'button')).toHaveLength(0);
    expect(nodes(nyg, attr('data-row', 'referee'))).toHaveLength(0);
    expect(text(nyg)).toContain('All trends');
  });

  it('the weather row is closed with no digits; the referee row names the assignment', () => {
    state.lines = data();
    const k = Date.parse(week.games[0].kickoff);
    state.wind = { loading: false, now: NOW, wind: { season: 2026, week: 6, asOf: new Date(NOW).toISOString(), games: { 'SEA-DEN': { kickoff: week.games[0].kickoff, status: 'forecast',
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
    // Another week's /wind/read answer is never read for this game.
    state.wind = { ...state.wind, wind: { ...state.wind.wind, week: 7 } };
    expect(nodes(render(<GameSheet args={{ game: 'SEA-DEN' }}/>), attr('data-row', 'weather')).map(textOf)).toEqual(['Weather at kickoff No current forecast']);
  });

  // Sean, October 22: once /lines/research answered, the game sheet swapped its D-55 trend cards for "No qualifying research
  // in this view". The weekly trends are the section; research for this game joins below them only when it has candidates.
  it('keeps the weekly top trends whatever the matchup research read says; research joins below only with candidates', () => {
    state.lines = data();
    const record = { wins: 20, losses: 9, pushes: 1, sample: 30, illustrativeUnits: 9.18, coverage: { from: '2025-09-01T00:00:00Z', to: '2026-10-12T00:00:00Z' } };
    const candidate = id => ({ id, title: `Synthetic research ${id}`, market: 'total', family: 'schedule', period: 'recent30', sourceState: 'computed', conditions: [], conditionDescriptions: ['Synthetic condition'],
      qualification: { qualifies: true, label: 'Consistent, not proven' }, record, applications: [{ gameId: 'NO-NYG', direction: 'over', whyApplies: [] }],
      series: { points: [{ ...record, from: record.coverage.from, to: record.coverage.to }], binned: true, selectedSample: 30 } });
    const answer = (shortlist, candidates) => ({ status: 'ready', reload: () => {}, data: { now: new Date(NOW).toISOString(), shortlist, candidates, games: [], explore: [] } });
    const shape = n => (n.text !== undefined ? n.text : [n.tag, n.attrs, n.children.map(shape)]);
    const sheet = read => {
      state.research = read;
      const html = render(<GameSheet args={{ game: 'NO-NYG' }}/>);
      expect(markupProblems(html)).toEqual([]);
      const section = nodes(html, attr('data-section', 'trends'))[0];
      const inSection = test => [...walk(section)].filter(n => n.tag && test(n));
      const [top] = inSection(n => n.tag === 'ul' && n.attrs['aria-label'] === 'Top trends for this game');
      return { html, section, top, research: inSection(n => n.attrs['data-research-card']), opened: inSection(n => n.attrs['data-trend-detail'] === ''),
        button: inSection(n => n.tag === 'button' && textOf(n) === 'Open matchup research') };
    };
    const loading = sheet(null);
    expect(loading.top.children).toHaveLength(3);
    expect(loading.opened, 'the first trend opens with its chart').toHaveLength(1);
    expect(loading.button).toHaveLength(1);
    // Loading, failed, or answered with nothing for this game: the trend content is exactly the same and nothing is added.
    for (const read of [{ status: 'error', error: { status: 503 }, data: null, reload: () => {} }, answer([], []), answer(['missing'], [])]) {
      const view = sheet(read);
      expect(view.top, `the top trends stay (${read.status})`).toBeDefined();
      expect(shape(view.top)).toEqual(shape(loading.top));
      expect(view.research).toHaveLength(0);
      expect(text(view.html)).not.toContain('No qualifying research');
      expect(textOf(view.section)).toBe(textOf(loading.section));
    }
    // Candidates for this game: the same trends, then the research rows (compact, so one trend stays open, D-55), then the button.
    const found = sheet(answer(['synthetic-a', 'synthetic-b'], ['synthetic-a', 'synthetic-b'].map(candidate)));
    expect(found.top, 'the top trends stay beside research').toBeDefined();
    expect(shape(found.top)).toEqual(shape(loading.top));
    expect(found.research.map(n => n.attrs['data-research-card'])).toEqual(['synthetic-a', 'synthetic-b']);
    expect(found.opened).toHaveLength(1);
    const order = [...walk(found.section)];
    expect(order.indexOf(found.top)).toBeLessThan(order.indexOf(found.research[0]));
    expect(order.indexOf(found.research[1])).toBeLessThan(order.indexOf(found.button[0]));
    expect(textOf(found.section)).toContain('Matchup research');
    expect(text(found.html)).not.toContain('No qualifying research');
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
    for (const item of items.slice(1)) expect(textOf(item)).toMatch(/(\d+%|[\d,]+–[\d,]+(–[\d,]+)?) · [\d,]+ games?/);
    const team = render(<GroupBody group={groups.team} rules={TODAY}/>);
    expect(text(team)).toContain('Last meetings (within four years)');
    expect(text(team)).toContain('2024-09-08: DEN 20, SEA 26');
  });

  it('says what is true while its own read of the week file loads, fails, finds no file, or finds a file without the game', () => {
    // The sheet opens with its own read still loading (it then answers from the shared cache): it says so, never "publish after".
    const said = lines => { state.lines = lines; const html = render(<AllTrendsSheet args={{ game: 'SEA-DEN' }}/>); expect(markupProblems(html)).toEqual([]); return nodes(html, attr('role', 'status')).map(textOf); };
    expect(said({ ...data(), trends: { status: 'loading', week: null }, trendsWeek: null })).toEqual(['Loading trends…']);
    expect(said({ ...data(), trends: { status: 'idle', week: null }, trendsWeek: null })).toEqual(['Loading trends…']);
    expect(said({ ...data(), trends: { status: 'error', week: null }, trendsWeek: null })).toEqual(['Trends didn’t load. Check your connection and try again.']);
    expect(said({ ...data(), trends: { status: 'missing', week: null }, trendsWeek: null })).toEqual(['Trends for Week 6 are available when the published week opens; pending records update after finals.']);
    const without = { ...week, games: week.games.filter(g => g.id !== 'SEA-DEN') };
    expect(said({ ...data(), trends: { status: 'ready', week: without }, trendsWeek: without })).toEqual(['No trends for this game in this week’s file.']);
    expect(said({ ...data(), personal: { status: 'loading', data: null, error: null } })).toEqual(['Loading this week’s games…']);
    // A game that is not on the board says so, here and in the game sheet.
    state.lines = data();
    expect(nodes(render(<AllTrendsSheet args={{ game: 'XX-YY' }}/>), attr('role', 'status')).map(textOf)).toEqual(['This game isn’t on this week’s board.']);
    expect(nodes(render(<GameSheet args={{ game: 'XX-YY' }}/>), attr('role', 'status')).map(textOf)).toEqual(['This game isn’t on this week’s board.']);
  });

  it('the game sheet says a file without this game holds no trends for it, not that the file is still to come', () => {
    const trendStatuses = html => nodes(html, attr('data-section', 'trends')).flatMap(section => [...walk(section)].filter(n => n.attrs?.role === 'status').map(textOf));
    const without = { ...week, games: week.games.filter(g => g.id !== 'SEA-DEN') };
    state.lines = { ...data(), trends: { status: 'ready', week: without }, trendsWeek: without };
    const html = render(<GameSheet args={{ game: 'SEA-DEN' }}/>);
    expect(trendStatuses(html)).toEqual(['No trends for this game in this week’s file.']);
    expect(text(html)).not.toContain('publish after');
    state.lines = { ...data(), trends: { status: 'loading', week: null }, trendsWeek: null };
    expect(trendStatuses(render(<GameSheet args={{ game: 'SEA-DEN' }}/>))).toEqual(['Loading trends…']);
  });

  it('a line record that does not fit this game at the viewer\'s line says so', () => {
    const card = { key: 'r', kind: 'row', gate: 'total', locked: false, title: 'A total band', sentence: 'Overs hit 10 times and unders 12 since 2002.', record: '10–12', sample: '22 games', pct: null, tierLabel: 'No proven edge', notes: [] };
    const fits = value => textOf(parseMarkup(render(<ShortTrend card={{ ...card, fits: value }} rules={TODAY}/>)));
    expect(fits(true)).toContain('Fits this game at your line');
    expect(fits(null)).toContain('Fits only at some lines');
    expect(fits(false)).toContain('Doesn’t fit this game at your line');
    expect(fits(undefined)).not.toMatch(/fit/i);
  });

  it('a locked short trend never prints a number, whatever the market', () => {
    for (const gate of ['spread', 'total', 'both']) {
      const html = render(<ShortTrend card={{ key: 'x', kind: 'card', gate, locked: true, title: 'Line-based trend', strength: [3, -22] }} rules={TODAY}/>);
      expect(textOf(parseMarkup(html))).not.toMatch(/\d/);
    }
  });
});

describe('the leak rule on the rendered markup, attributes included', () => {
  const KICKOFF_RULES = { sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' };
  const SEA_KICKOFF = Date.parse(week.games[0].kickoff);
  // Forged replies: a saved line under every pick that is not locked in (the screen must never read one), and another
  // player's picks in the Community week. Quarter points: no record, count, percent, time or trend title equals them.
  const forgedSpread = Object.fromEntries(GAMES.map((g, i) => [g.id, 20.25 + i]));
  const forgedTotal = Object.fromEntries(GAMES.map((g, i) => [g.id, 60.75 + i]));
  const others = { spread: { 'SEA-DEN': 13.25, 'HOU-JAX': -17.75 }, total: { 'SEA-DEN': 49.25, 'NO-NYG': 38.75 } };
  const refs = values => Object.fromEntries(Object.entries(values).map(([id, value]) => [id, ref(value)]));
  const posts = [{ actorId: 'other', kind: 'ballot_submitted', mode: 'guess_spread', picks: others.spread }, { actorId: 'other', kind: 'ballot_submitted', mode: 'guess_total', picks: others.total }];
  const otherSecrets = [...pickSecrets(others.spread, { market: 'spread', owner: 'other' }), ...pickSecrets(others.total, { market: 'total', owner: 'other' })];
  const world = ({ now, ballots, optOuts = [] }) => {
    const lines = data({ now, rules: KICKOFF_RULES });
    return { ...lines, personal: { ...lines.personal, data: { ...lines.personal.data, ballots } }, community: { week: { season: 2026, week: 6 }, optOuts, posts } };
  };
  const STATES = {
    // D-23 sit-out of the Spread under the D-39 rules: the Spread opens for the week; every Total is a draft, never locked in.
    'sat out Spread': {
      lines: world({ now: NOW, optOuts: ['guess_spread'], ballots: { guess_total: { picks: Object.fromEntries(GAMES.map(g => [g.id, 44])), scoringReferences: refs(forgedTotal) } } }),
      secrets: [...lineSecrets(forgedTotal, { market: 'total' }), ...otherSecrets],
    },
    // After SEA @ DEN kicks off: that game opens for everyone; HOU @ JAX's Total is locked in (its own line shows); every
    // other pick is a draft, so no other saved line shows anywhere, SEA @ DEN's included.
    'after SEA @ DEN kicked off': {
      lines: world({ now: SEA_KICKOFF + 30 * 60_000, ballots: {
        guess_spread: { picks: Object.fromEntries(GAMES.map(g => [g.id, 3])), scoringReferences: refs(forgedSpread) },
        guess_total: { picks: Object.fromEntries(GAMES.map(g => [g.id, 44])), lockedAt: { 'HOU-JAX': new Date(NOW).toISOString() }, scoringReferences: refs({ ...forgedTotal, 'HOU-JAX': 44.5 }) },
      } }),
      secrets: [...lineSecrets(forgedSpread, { market: 'spread' }), ...lineSecrets(Object.fromEntries(Object.entries(forgedTotal).filter(([id]) => id !== 'HOU-JAX')), { market: 'total' }), ...otherSecrets],
    },
  };
  /** Every text and attribute value in the markup that a viewer or a screen reader can reach (an svg's drawing data is not text). */
  const reachable = html => {
    const out = [];
    const visit = node => {
      for (const child of node.children ?? []) {
        if (child.text !== undefined) out.push(child.text);
        else if (child.tag === 'svg') out.push(child.attrs['aria-label'] ?? '');
        else { out.push(...Object.values(child.attrs)); visit(child); }
      }
    };
    visit(parseMarkup(html));
    return out;
  };

  it('the board, every game sheet and every All trends sheet, every row open, in the sat-out and after-kickoff states', () => {
    for (const [name, { lines, secrets }] of Object.entries(STATES)) {
      state.lines = lines;
      state.openRows = true;
      state.officials = { season: 2026, week: 6, assignments: { 'SEA-DEN': { referee: 'Shawn Hochuli', setAt: '2026-10-14T18:00:00Z', revision: 1 }, 'NO-NYG': { referee: 'Shawn Hochuli', setAt: '2026-10-14T18:00:00Z', revision: 1 } } };
      const scan = (html, where) => { expect(markupProblems(html)).toEqual([]); assertNoLeak({ markup: reachable(html) }, { viewer: 'viewer', secrets }, `${name}: ${where}`); return html; };
      scan(render(<LinesBoard/>), 'the board');
      let trendItems = 0;
      for (const { id } of GAMES) {
        scan(render(<GameSheet args={{ game: id }}/>), `${id} sheet`);
        trendItems += nodes(scan(render(<AllTrendsSheet args={{ game: id }}/>), `${id} All trends`), n => n.attrs['data-trend']).length;
      }
      expect(trendItems, 'every group body was in the markup').toBeGreaterThan(500);
    }
    // The scan reads attributes too (it is live): an aria-label with a forged line is found.
    expect(leakScan({ markup: reachable('<div aria-label="Spread DEN −20.25 at your guess"></div>') }, { viewer: 'viewer', secrets: STATES['after SEA @ DEN kicked off'].secrets })).toHaveLength(1);
  });

  it('the after-kickoff state shows what it may: SEA @ DEN open, HOU @ JAX\'s own Total line, no other line', () => {
    state.lines = STATES['after SEA @ DEN kicked off'].lines;
    const html = render(<LinesBoard/>);
    const cards = Object.fromEntries(nodes(html, n => n.attrs['data-game']).map(n => [n.attrs['data-game'], n]));
    const cells = (id, kind) => [...walk(cards[id])].filter(n => n.attrs?.['data-cell'] === kind);
    expect(cells('SEA-DEN', 'locked')).toHaveLength(0);
    expect(cells('HOU-JAX', 'line').map(textOf)).toEqual(['44.5 Current line']);
    expect(cells('NO-NYG', 'locked')).toHaveLength(2);
  });
});

it('stale availability remains alongside usable game and All trends records', () => {
  const stale = { ...week, availability: { stale: true, sourceAsOf: '2026-10-12', reason: 'Fixture source unavailable' } };
  state.lines = { ...data(), trendsWeek: stale, trends: { status: 'ready', week: stale } };
  for (const node of [<GameSheet args={{ game: 'HOU-JAX' }}/>, <AllTrendsSheet args={{ game: 'HOU-JAX' }}/>]) {
    state.openRows = true;
    const html = render(node);
    expect(text(html)).toContain('2026-10-12');
    expect(text(html)).toContain('Stale evidence');
    expect(nodes(html, n => n.attrs['data-trend']).length).toBeGreaterThan(0);
  }
});


describe('your pick sheet', () => {
  const args = { game: 'SEA-DEN', market: 'total', accountId: 'fixture-account', season: 2026, week: 6 };
  it('renders the saved reference and a fixed Community market with valid markup', () => {
    state.lines = data();
    const html = render(<YourPickSheet args={args}/>);
    expect(markupProblems(html)).toEqual([]);
    expect(text(html)).toContain('Line at your guess'); expect(text(html)).toContain('43.5');
    expect(text(html)).toContain('Total community guesses'); expect(text(html)).toContain('Open Total in Play');
  });
  it('hides an old account or week, and keeps a forged draft reference out', () => {
    state.lines = data();
    for (const patch of [{ accountId: 'someone-else' }, { week: 7 }, { game: 'UNKNOWN' }]) {
      const html = render(<YourPickSheet args={{ ...args, ...patch }}/>);
      expect(text(html)).toContain('not in the current account and week'); expect(text(html)).not.toContain('43.5');
    }
    const draft = render(<YourPickSheet args={{ ...args, market: 'spread' }}/>);
    expect(text(draft)).toContain('No locked-in scoring line'); expect(text(draft)).not.toContain('11.5');
  });
  it('a failed personal refresh retains and labels the last saved reference', () => {
    state.lines = data(); state.lines.personal.error = new Error('Refresh failed');
    const html = render(<YourPickSheet args={args}/>);
    expect(text(html)).toContain('Showing the last loaded saved record'); expect(text(html)).toContain('43.5');
  });
});
