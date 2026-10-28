// D-62: team records and the team sheet. The view model (teamModel.js) helper by helper, the shared team read
// (teamsData.js: one request for every subscriber, the bundled records on a 404 or a failure, no new request within
// ten minutes) and the markup of the team sheet and the pick-screen headers that open it. Fixture teams and scores
// only; nothing here reaches the network (the read is a stand-in, and SSR never subscribes).
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import bundled from '../shared/team-records-2026.json';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';

vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), linesApi: vi.fn(), readTeams: vi.fn() }));
const model = await import('../web/src/next/teams/teamModel.js');
const { TEAMS_TTL_MS, createTeamSeasonStore, fallbackTeamSeason, teamSeasonFrom, teamSeasonStore } = await import('../web/src/next/teams/teamsData.js');
const { TeamView, TeamSheet, NO_GAMES, teamInfo } = await import('../web/src/next/teams/TeamSheet.jsx');
const { marginLayout } = await import('../web/src/next/teams/MarginChart.jsx');
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { PerGameEditor } = await import('../web/src/next/play/PerGamePlay.jsx');
const { playPresentation } = await import('../web/src/next/play/PlayPresentation.jsx');
const api = await import('../web/src/api.js');

const game = (week, gameId, opponent, home, pf, pa, kickoff = `2026-09-${String(6 + week).padStart(2, '0')}T20:25:00Z`) => ({
  week, gameId, opponent, home, neutral: false, kickoff, final: pf !== null, pf, pa, result: pf === null ? null : pf > pa ? 'W' : pf < pa ? 'L' : 'T',
});
/** The /lines/teams reply contract, through Week 7, with SEA's season (a tie, a bye in Week 6) and a stray market. */
const reply = () => ({
  season: 2026, throughWeek: 7, finals: 107, updatedAt: '2026-10-27T16:12:00Z', stale: false,
  source: { name: 'nflverse nfldata', url: 'https://example.test/games.csv', credit: 'nflverse nfldata (Lee Sharpe); final scores only' },
  teams: {
    SEA: { overall: { w: 4, l: 1, t: 1 }, home: { w: 3, l: 0, t: 0 }, road: { w: 1, l: 1, t: 1 }, pointsFor: 145, pointsAgainst: 116, spread: -3.5,
      games: [
        game(1, 'SF-SEA', 'SF', true, 24, 17), game(2, 'SEA-PIT', 'PIT', false, 20, 20), game(3, 'NO-SEA', 'NO', true, 31, 10),
        game(4, 'SEA-ARI', 'ARI', false, 13, 27), game(5, 'TB-SEA', 'TB', true, 27, 24), { ...game(7, 'SEA-DEN', 'DEN', false, 30, 18), total: 44.5 },
        game(8, 'WAS-SEA', 'WAS', true, null, null, '2026-11-01T21:05:00Z'), game(9, 'SEA-LAR', 'LAR', false, null, null, null),
      ] },
    DEN: { overall: { w: 3, l: 3, t: 0 }, home: { w: 2, l: 1, t: 0 }, road: { w: 1, l: 2, t: 0 }, pointsFor: 120, pointsAgainst: 121, games: [] },
  },
});
const live = () => teamSeasonFrom(reply());
const nodes = html => [...walk(parseMarkup(html))];
const textOf = node => (node.text ?? (node.children ?? []).map(textOf).join(''));
const words = html => textOf(parseMarkup(html)).replace(/\s+/g, ' ').trim();
const shell = { openSheet: vi.fn(), closeSheet: vi.fn(), state: { sheets: [] } };
const inShell = node => renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx">{node}</div></ShellContext.Provider>);

describe('teamModel: what each helper promises', () => {
  const season = live(), sea = model.teamOf(season, 'sea');

  it('records: "4–1–1" with a tie, both sides for a matchup, none for another season or an unknown team', () => {
    expect(model.recordOf(season, 'SEA')).toBe('4–1–1');
    expect(model.recordOf(season, 'DEN')).toBe('3–3');
    expect(model.matchupRecords(season, 'SEA', 'DEN', 2026)).toEqual({ away: '4–1–1', home: '3–3' });
    expect(model.matchupRecords(season, 'SEA', 'KC')).toEqual({ away: '4–1–1', home: null });
    expect(model.matchupRecords(season, 'SEA', 'DEN', 2027), 'a 2026 file never labels a 2027 game').toBeNull();
    expect(model.matchupRecords(season, 'KC', 'BUF')).toBeNull();
    expect(model.teamOf(season, 'not a team')).toBeNull();
  });

  it('"Through Week 7" and "Records through Week 7", or nothing when the week is unknown', () => {
    expect(model.throughText(season)).toBe('Through Week 7');
    expect(model.recordsThroughText(season)).toBe('Records through Week 7');
    expect(model.throughText({ ...season, throughWeek: null })).toBeNull();
    expect(model.recordsThroughText(fallbackTeamSeason())).toBe(`Records through Week ${bundled.through_week}`);
  });

  it('points per game over the counted finals, one decimal; none without totals or games', () => {
    expect(model.pointsPerGame(sea)).toEqual({ scored: '24.2', allowed: '19.3', games: 6 });
    expect(model.pointsPerGame({ ...sea, pointsFor: null })).toBeNull();
    expect(model.pointsPerGame({ ...sea, overall: { w: 0, l: 0, t: 0 } })).toBeNull();
  });

  it('last five: the five latest finals, oldest first, each with its letter, tone and words', () => {
    const five = model.lastFive(sea);
    expect(five.map(r => `${r.week}${r.result}`)).toEqual(['2T', '3W', '4L', '5W', '7W']);
    expect(five.map(r => r.tone)).toEqual(['pending', 'win', 'loss', 'win', 'win']);
    expect(five[2].words).toBe('Week 4: loss 13–27 @ ARI');
    expect(model.lastFive({ games: [] })).toEqual([]);
  });

  it('margins: one per final by week with its readout and its words; the range always includes zero', () => {
    const series = model.marginSeries(sea);
    expect(series.map(p => [p.week, p.margin])).toEqual([[1, 7], [2, 0], [3, 21], [4, -14], [5, 3], [7, 12]]);
    expect(series[0].label).toBe('Week 1 · W 24–17 vs SF');
    expect(series[3].label).toBe('Week 4 · L 13–27 @ ARI');
    expect(series[3].words).toBe('Week 4, lost 13–27 at Arizona Cardinals');
    expect(model.marginExtent(series)).toEqual({ low: -14, high: 21 });
    expect(model.marginRangeText(model.marginExtent(series))).toBe('+21 to −14 points');
    expect(model.marginExtent([{ margin: 7 }])).toEqual({ low: 0, high: 7 });
    expect(model.marginRangeText({ low: 0, high: 0 })).toBe('0 points');
    expect(model.marginExtent([])).toBeNull();
  });

  it('the next game is the first one not final; the season rows give sides, result words, scores or the kickoff', () => {
    expect(model.nextGame(sea).gameId).toBe('WAS-SEA');
    const rows = model.seasonRows(sea, 'SEA');
    expect(rows.map(r => `${r.week} ${r.away}@${r.home} ${r.word ?? r.when}${r.score ? ` ${r.score}` : ''}`)).toEqual([
      '1 SF@SEA WIN 24–17', '2 SEA@PIT TIE 20–20', '3 NO@SEA WIN 31–10', '4 SEA@ARI LOSS 13–27', '5 TB@SEA WIN 27–24',
      '7 SEA@DEN WIN 30–18', '8 WAS@SEA Sun Nov 1, 1:05 PM PT', '9 SEA@LAR Kickoff time not set',
    ]);
    expect(rows.filter(r => r.next).map(r => r.week)).toEqual([8]);
    expect(rows.map(r => r.tone).slice(0, 4)).toEqual(['win', 'pending', 'win', 'loss']);
    expect(model.nextGame({ games: [game(1, 'SF-SEA', 'SF', true, 1, 0)] })).toBeNull();
  });

  it('teamView: at most three tiles (home, road, points per game) and the fallback flag without games', () => {
    const view = model.teamView(season, 'SEA');
    expect(view).toMatchObject({ code: 'SEA', name: 'Seattle Seahawks', record: '4–1–1', through: 'Through Week 7', fallback: false });
    expect(view.tiles).toEqual([{ key: 'home', label: 'Home', value: '3–0' }, { key: 'road', label: 'Road', value: '1–1–1' }, { key: 'ppg', label: 'Points per game', scored: '24.2', allowed: '19.3' }]);
    const offline = model.teamView(fallbackTeamSeason(), 'SEA');
    expect(offline.fallback).toBe(true);
    expect(offline.tiles.map(t => t.key), 'no points per game without totals').toEqual(['home', 'road']);
    expect(offline.rows).toEqual([]);
    expect(model.teamView(season, 'KC')).toBeNull();
  });
});

describe('teamsData: the reply is read once, kept to records and scores, and replaced by the bundle when it fails', () => {
  it('keeps only records and final scores: a market field in the reply never reaches a screen', () => {
    const season = live();
    expect(JSON.stringify(season)).not.toMatch(/spread|total|44\.5|-3\.5/);
    expect(season).toMatchObject({ season: 2026, throughWeek: 7, finals: 107, stale: false, fallback: false, source: { name: 'nflverse nfldata' } });
    expect(Object.keys(season.teams.SEA.games[0]).sort()).toEqual(['final', 'gameId', 'home', 'kickoff', 'neutral', 'opponent', 'pa', 'pf', 'result', 'week']);
    expect(teamSeasonFrom({ season: 2026, teams: {} }), 'no teams is not an answer').toBeNull();
    expect(teamSeasonFrom(null)).toBeNull();
  });

  it('the bundled file in the same shape: records only, games: [], fallback: true and its own week', () => {
    const fallback = fallbackTeamSeason();
    expect(fallback).toMatchObject({ season: bundled.season, throughWeek: bundled.through_week, fallback: true });
    expect(Object.keys(fallback.teams)).toHaveLength(32);
    expect(fallback.teams.SEA).toEqual({ overall: bundled.teams.SEA.overall, home: bundled.teams.SEA.home, road: bundled.teams.SEA.road, pointsFor: null, pointsAgainst: null, games: [] });
  });

  it('one request for every subscriber, none again within ten minutes, a fresh one after', async () => {
    let clock = 0;
    const read = vi.fn(async () => reply());
    const store = createTeamSeasonStore({ read, now: () => clock });
    expect(store.getSnapshot().status).toBe('loading');
    expect(store.getSnapshot().data.fallback, 'the bundle stands in until the read answers').toBe(true);
    const heard = vi.fn();
    const stops = Array.from({ length: 12 }, () => store.subscribe(() => heard()));
    await store.ensure();
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith({});
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', data: { throughWeek: 7, fallback: false } });
    expect(heard).toHaveBeenCalledTimes(12);
    clock = TEAMS_TTL_MS - 1;
    store.subscribe(() => {})(); await store.ensure();
    expect(read).toHaveBeenCalledTimes(1);
    clock = TEAMS_TTL_MS;
    store.subscribe(() => {})(); await store.ensure();
    expect(read).toHaveBeenCalledTimes(2);
    stops.forEach(stop => stop());
  });

  it('a 404 (route not deployed) or a failure falls back to the bundle, and is not retried within ten minutes', async () => {
    for (const failure of [Object.assign(new Error('Not found.'), { status: 404 }), Object.assign(new Error('No connection'), { status: 0 })]) {
      let clock = 1_000;
      const read = vi.fn(async () => { throw failure; });
      const store = createTeamSeasonStore({ read, now: () => clock });
      store.subscribe(() => {}); store.subscribe(() => {});
      await store.ensure();
      expect(read).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot()).toMatchObject({ status: 'fallback', data: { fallback: true, throughWeek: bundled.through_week } });
      clock += TEAMS_TTL_MS - 1;
      await store.ensure();
      expect(read).toHaveBeenCalledTimes(1);
    }
  });

  it('a later failure keeps the last good answer; an unreadable reply counts as a failure', async () => {
    let clock = 0, fail = false;
    const store = createTeamSeasonStore({ read: async () => { if (fail) throw new Error('blip'); return reply(); }, now: () => clock });
    await store.ensure();
    fail = true; clock = TEAMS_TTL_MS;
    await store.ensure();
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', data: { throughWeek: 7 } });
    const junk = createTeamSeasonStore({ read: async () => ({ season: 2026, teams: 'none' }) });
    await junk.ensure();
    expect(junk.getSnapshot().status).toBe('fallback');
  });

});

describe('the team sheet (sh.team)', () => {
  it('is registered as a sheet layer (the registry pulls in the whole app, so its source is read)', () => {
    const registry = fs.readFileSync(new URL('../web/src/next/shell/registry.jsx', import.meta.url), 'utf8');
    expect(registry).toContain("import { TeamSheet } from '../teams/TeamSheet.jsx';");
    expect(registry).toMatch(/^  'sh\.team': TeamSheet,/m);
  });

  it('top to bottom: mark and record, three tiles, last five as lettered blocks, the margin chart, then the games', () => {
    const html = renderToStaticMarkup(<div className="gx"><TeamView season={live()} code="SEA"/></div>);
    expect(markupProblems(html)).toEqual([]);
    const all = nodes(html), cls = name => all.filter(n => (n.attrs?.class ?? '').split(/\s+/).includes(name));
    const order = ['gx-team-head', 'gx-team-tiles', 'gx-team-five', 'gx-team-chart', 'gx-team-games'].map(name => html.indexOf(name));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(order.every(at => at > 0)).toBe(true);
    expect(textOf(cls('gx-team-record')[0])).toBe('Record 4–1–1Through Week 7');
    expect(cls('gx-team-tile').map(textOf)).toEqual(['Home3–0', 'Road1–1–1', 'Points per game24.2 scored19.3 allowed']);
    // Never color alone: each block carries its letter (and its game in words).
    expect(cls('gx-team-blk').map(n => n.attrs.class.split(' ')[1])).toEqual(['gx-team-blk--pending', 'gx-team-blk--win', 'gx-team-blk--loss', 'gx-team-blk--win', 'gx-team-blk--win']);
    expect(cls('gx-team-blk').map(n => textOf(n.children[0]))).toEqual(['T', 'W', 'L', 'W', 'W']);
    // The chart: one image named with every game, bars up for wins and down for losses, a ring for the tie, the
    // selected game's readout (the latest by default) and a range input to move across the games.
    const plot = all.find(n => n.attrs?.role === 'img' && n.attrs.class === 'gx-team-plot');
    expect(plot.attrs['aria-label']).toBe('Margin by week, oldest first: Week 1, won 24–17 vs San Francisco 49ers; Week 2, tied 20–20 at Pittsburgh Steelers; Week 3, won 31–10 vs New Orleans Saints; Week 4, lost 13–27 at Arizona Cardinals; Week 5, won 27–24 vs Tampa Bay Buccaneers; Week 7, won 30–18 at Denver Broncos');
    expect(all.filter(n => n.tag === 'path' && /gx-team-bar--win/.test(n.attrs.class))).toHaveLength(4);
    expect(all.filter(n => n.tag === 'path' && /gx-team-bar--loss/.test(n.attrs.class))).toHaveLength(1);
    expect(all.filter(n => n.tag === 'circle' && /gx-team-tie/.test(n.attrs.class))).toHaveLength(1);
    expect(all.filter(n => n.tag === 'line' && n.attrs.class === 'gx-team-zero')).toHaveLength(1);
    expect(textOf(cls('gx-team-readout')[0])).toBe('+12Week 7 · W 30–18 @ DEN');
    expect(textOf(cls('gx-team-weeks')[0])).toBe('123457');
    expect(words(html)).toContain('Week by week · scale +21 to −14 points');
    const scrub = all.find(n => n.tag === 'input' && n.attrs.type === 'range');
    expect(scrub.attrs).toMatchObject({ min: '0', max: '5', value: '5', 'aria-label': 'Move across the games', 'aria-valuetext': 'Week 7, won 30–18 at Denver Broncos' });
    // The games: week, away @ home as marks, the result word and score, or the kickoff; the next game marked.
    const rows = cls('gx-team-game');
    expect(rows).toHaveLength(8);
    expect(textOf(rows[0]).replace(/\s+/g, ' ')).toContain('San Francisco 49ers at Seattle Seahawks');
    expect(textOf(rows[0])).toContain('WIN24–17');
    expect(textOf(rows[1])).toContain('TIE20–20');
    const next = rows.filter(n => 'data-next' in n.attrs).map(textOf);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatch(/^Week Wk 8Washington Commanders at Seattle Seahawks.*NextSun Nov 1, 1:05 PM PT$/);
    expect(textOf(rows[7])).toContain('Kickoff time not set');
    // The credit is one tap away (rule 10), and nothing about a market anywhere.
    expect(all.filter(n => n.tag === 'button' && n.attrs['aria-label'] === 'About team records')).toHaveLength(1);
    expect(words(html)).not.toMatch(/spread|total|over|under|44\.5|−3\.5/i);
  });

  it('the bars stand on one zero line, up for a win and down for a loss, with lengths in proportion', () => {
    const series = model.marginSeries(model.teamOf(live(), 'SEA'));
    const layout = marginLayout(series, model.marginExtent(series));
    const bar = i => layout.bars[i];
    expect(layout.bars.every(b => b.y0 === layout.zeroY)).toBe(true);
    expect(bar(0).y1).toBeLessThan(layout.zeroY);
    expect(bar(3).y1).toBeGreaterThan(layout.zeroY);
    expect(bar(1).y1).toBe(layout.zeroY);
    const len = i => Math.abs(bar(i).y1 - bar(i).y0);
    expect(len(2) / len(3)).toBeCloseTo(21 / 14, 1);
  });

  it('with the bundled records only: the record tiles and one sentence, no chart or game list', () => {
    const html = renderToStaticMarkup(<div className="gx"><TeamView season={fallbackTeamSeason()} code="SEA"/></div>);
    expect(markupProblems(html)).toEqual([]);
    expect(words(html)).toContain(NO_GAMES);
    expect(html).toContain('gx-team-tiles');
    expect(html).not.toContain('gx-team-chart');
    expect(html).not.toContain('gx-team-games');
    expect(teamInfo(fallbackTeamSeason()).body.join(' ')).toContain('These records come from the copy bundled with the app.');
  });

  it('what "About team records" says: what is counted, through when, updated when, and the nflverse credit and link', () => {
    const info = teamInfo(live());
    expect(info.body).toEqual([
      'Records count every regular-season final so far in the free nflverse schedule file, so Sunday’s and Monday’s finals show the same weekend.',
      'Through Week 7, updated Tue Oct 27, 9:12 AM PT.',
      'Source: nflverse nfldata (Lee Sharpe); final scores only.',
    ]);
    expect(info.links).toEqual([{ text: 'nflverse nfldata games file', url: 'https://example.test/games.csv' }]);
    expect(teamInfo({ ...live(), stale: true }).body).toContain('This copy may be behind the latest finals.');
  });

  it('the sheet: the team name as its title, a skeleton while the read loads, a back label over another sheet', () => {
    const loading = inShell(<TeamSheet args={{ team: 'SEA' }}/>);
    expect(markupProblems(loading)).toEqual([]);
    const all = nodes(loading);
    expect(all.find(n => n.attrs?.role === 'dialog')).toBeTruthy();
    expect(all.find(n => n.tag === 'h2').children.map(textOf).join('')).toBe('Seattle Seahawks');
    expect(all.find(n => n.attrs?.['data-skeleton'])).toBeTruthy();
    const over = inShell(<TeamSheet args={{ team: 'DEN', from: 'SEA @ DEN' }}/>);
    expect(words(over)).toContain('SEA @ DEN');
    expect(nodes(over).find(n => n.tag === 'button' && n.attrs.class === 'gx-sheet-back')).toBeTruthy();
    expect(words(inShell(<TeamSheet args={{ team: '??' }}/>))).toContain('Team');
  });
});

describe('pick-screen headers: away @ home as marks with records, each team opening its sheet', () => {
  const NOW = Date.parse('2026-10-29T12:00:00Z');
  const games = [{ id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-11-01T20:05:00Z' }];
  const data = { season: 2026, week: 8, now: new Date(NOW).toISOString(), deadline: '2026-10-30T00:15:00Z', revision: 1, weeklyRevision: 1,
    rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true }, games, ballots: {}, scoring: {} };
  const editor = <PerGameEditor accountId="00000000-0000-4000-8000-000000000001" initialData={data} mode="guess_spread"/>;

  it('in the new app: Play\'s card heading is the matchup (size 48, stacked) with this weekend\'s records', async () => {
    // The app's store reads through readTeams (POST /lines/teams, body {}) once, however many screens subscribe.
    api.readTeams.mockResolvedValue(reply());
    const stops = [teamSeasonStore.subscribe(() => {}), teamSeasonStore.subscribe(() => {}), teamSeasonStore.subscribe(() => {})];
    await teamSeasonStore.ensure();
    expect(api.readTeams).toHaveBeenCalledTimes(1);
    expect(api.readTeams).toHaveBeenCalledWith({});
    stops.forEach(stop => stop());
    const html = inShell(editor);
    expect(markupProblems(html)).toEqual([]);
    const h2 = nodes(html).find(n => n.tag === 'h2' && /gx-score-matchup/.test(n.attrs.class ?? ''));
    expect(h2.attrs['aria-label']).toBe('Seattle Seahawks, 4–1–1, at Denver Broncos, 3–3');
    const mu = [...walk(h2)].find(n => /\bgx-mu\b/.test(n.attrs?.class ?? ''));
    expect(mu.attrs.class).toContain('gx-mu--48');
    expect(mu.attrs.class).toContain('gx-mu--stack');
    const buttons = [...walk(h2)].filter(n => n.tag === 'button');
    expect(buttons.map(n => n.attrs['aria-label'])).toEqual(['Seattle Seahawks, 4–1–1. Open team', 'Denver Broncos, 3–3. Open team']);
    expect(textOf(h2)).toBe('SEASEA4–1–1@DENDEN3–3');
  });

  it('in the old app\'s Community Picks page (no Shell): the same marks, no records and no team buttons', () => {
    const html = renderToStaticMarkup(<div className="gx">{editor}</div>);
    expect(markupProblems(html)).toEqual([]);
    const h2 = nodes(html).find(n => n.tag === 'h2' && /gx-score-matchup/.test(n.attrs.class ?? ''));
    expect([...walk(h2)].filter(n => n.tag === 'button')).toEqual([]);
    expect(textOf(h2)).toContain('Seattle Seahawks at Denver Broncos');
    expect(textOf(h2)).not.toMatch(/\d–\d/);
  });

  it('the whole-market card (PlayPresentation) keeps its heading name and draws the matchup with records', () => {
    const { GameCard } = playPresentation;
    const html = inShell(<GameCard game={games[0]} title="Seattle Seahawks @ Denver Broncos" kickoff="Nov 1, 1:05 PM PT" facts={null} picked={false}/>);
    // The card itself keeps the shared ballot's own classes (panel, week-pick); everything else is the kit's.
    expect(markupProblems(html).filter(problem => !/class "(panel|week-pick)"/.test(problem))).toEqual([]);
    const h3 = nodes(html).find(n => n.tag === 'h3');
    expect(h3.attrs['aria-label']).toBe('Seattle Seahawks @ Denver Broncos');
    expect([...walk(h3)].filter(n => n.tag === 'button').map(n => n.attrs['aria-label'])).toEqual(['Seattle Seahawks, 4–1–1. Open team', 'Denver Broncos, 3–3. Open team']);
  });
});
