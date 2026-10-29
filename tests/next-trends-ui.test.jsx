import { trendAvailabilityText } from '../web/src/trendsAvailability.js';
import { marketSituationCards } from '../web/src/next/trends/situations.js';
vi.mock('../web/src/auth', () => ({ cloudEnabled: false, supabase: null }));
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, matchups, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { teamMarks } from '../web/src/teamLogoRegistry.js';
import { TABS } from '../web/src/next/shell/state.js';
import { PlayersNest } from '../web/src/next/trends/PlayersNest.jsx';
import { TrendAvailability } from '../web/src/next/lines/parts.jsx';
import { BiasChart } from '../web/src/next/trends/charts.jsx';
import { readTrendsHistory } from '../web/src/next/trends/useTrendsHistory.js';
vi.mock('../web/src/api.js', () => ({ communityApi: vi.fn(), leagueApi: vi.fn() }));
const game = { id: 'CAR-ATL', awayCode: 'CAR', homeCode: 'ATL', kickoff: '2026-10-01T20:00:00Z' };
const reference = { value: 3.5, basis: 'saved', observedAt: '2026-09-30T20:00:00Z', source: 'Fixture books' };
const history = { viewer: 'me', members: [{ id: 'me', displayName: 'Avery Fixture' }], season: 2026, seasons: [2026], weeks: [
 { season: 2026, week: 4, games: [game], gate: { 'CAR-ATL': { spread: true } }, results: { 'CAR-ATL': { status: 'final', home: 17, away: 22 } }, entries: [{ userId: 'me', mode: 'guess_spread', status: 'submitted', picks: [{ gameId: game.id, guess: 7, reference, points: 6.5 }] }] }
]};
// D-66: the Players section is nesting cards; each render names its layer through the view.
const render = (data = history, patch = {}) => renderToStaticMarkup(<div className="gx"><PlayersNest history={data} published={{ season: 2026, week: 6 }} view={{ market: 'spread', ...patch }} onChange={() => {}} scopeName="Fixture league"/></div>);
describe('Trends UI evidence', () => {
 it('filters independent markets before highlight cap', () => { const cards = Object.fromEntries(['s1','s2','s3','t1'].map((id,i) => [id,{ title: id, market: i === 3 ? 'total' : 'home_ats', tier: 2, sideRule: 'A', score: { score: 100-i }, record: { W: 3,L: 2,P: 0 } }])); const week = { season: 2026, cards, games: [{ id: 'g', home: 'ATL', away: 'CAR', tier2: Object.keys(cards).map(card => ({ card })) }] }; expect(marketSituationCards(week,{ id: 'g',access: { spread: true,total: true },saved: {} },'total').map(c => c.id)).toEqual(['t1']); });
 it('keeps the approved four primary tabs', () => expect(TABS).toEqual(['home','play','bets','research']));
 it('separates saved market accuracy, hypothetical results and exact game evidence, one layer each', () => {
  const players = render();
  expect(markupProblems(players)).toEqual([]);
  expect(players).toContain('Avery Fixture'); expect(players).toContain('6.5'); expect(players).not.toContain('gx-nest-lip');
  const person = render(history, { player: 'me' });
  for (const word of ['Points per game','Market error','Home-team strength gap','At saved line','By team','Back to ']) expect(person).toContain(word);
  const covers = render(history, { player: 'me', playerLayer: 'covers' });
  expect(markupProblems(covers)).toEqual([]);
  for (const word of ['Opposite side','At guessed line','Straight-up','Cover performance by competition week','Contributing games','Fixture books']) expect(covers).toContain(word);
  expect(render(history, { player: 'me', playerLayer: 'error' })).toContain('Market absolute error by competition week');
  const team = render(history, { player: 'me', playerLayer: 'teams', playerItem: 'CAR' });
  expect(team).toContain('CAR strength gap by competition week'); expect(team).toContain('Small sample');
  const direction = [...walk(parseMarkup(team))].find(n => n.attrs?.['data-direction'])?.attrs['data-direction'];
  const callout = render(history, { player: 'me', playerLayer: 'teams', playerItem: 'CAR:' + direction });
  expect(markupProblems(callout)).toEqual([]);
  for (const word of ['Recent','Earlier','1 finals','Contributing games']) expect(callout).toContain(word);
 });
 it('labels current spread sentiment with the team and signed-home convention', () => {
  const data = structuredClone(history); data.weeks[0].week = 6; data.weeks[0].results = {};
  const week = render(data, { playerLayer: 'week' });
  expect(week).toContain('Panthers '+String.fromCharCode(8722)+'7'); expect(week).toContain('Median of 1');
  const game = render(data, { playerLayer: 'week', playerItem: 'CAR-ATL' });
  expect(game).toContain('signed home spread distribution');
  expect(game).not.toContain('The distribution uses signed home spreads'); // behind the layer's ⓘ
 });
 it('D-62: each contributing game and each sentiment game is headed by its matchup as marks, away first', () => {
  const CAR_ATL = { srcs: [teamMarks.CAR.src, teamMarks.ATL.src], name: 'Carolina Panthers at Atlanta Falcons' };
  const nodes = [...walk(parseMarkup(render(history, { player: 'me', playerLayer: 'covers' })))];
  const h4 = nodes.find(n => n.tag === 'h4' && nameFrom(n).startsWith('2026 Week 4'));
  expect(nameFrom(h4)).toBe('2026 Week 4 · Carolina Panthers at Atlanta Falcons');
  expect(matchups(h4)).toEqual([CAR_ATL]);
  const current = structuredClone(history); current.weeks[0].week = 6; current.weeks[0].results = {};
  const tile = [...walk(parseMarkup(render(current, { playerLayer: 'week' })))].find(n => n.tag === 'button' && n.attrs?.['data-game'] === 'CAR-ATL');
  expect(nameFrom(tile).startsWith('Carolina Panthers at Atlanta Falcons')).toBe(true);
  expect(matchups(tile)).toEqual([CAR_ATL]);
 });
 it('hidden values do not enter markup or chart metadata', () => {
  const data = structuredClone(history); data.viewer = 'other'; data.weeks[0].gate['CAR-ATL'].spread = false; data.weeks[0].entries[0].picks[0].guess = 87.125;
  for (const patch of [{}, { player: 'me' }, { player: 'me', playerLayer: 'covers' }, { playerLayer: 'week' }]) expect(render(data, patch)).not.toContain('87.125');
  expect(render(data, { player: 'me' })).toContain('No eligible locked guesses');
 });
 it('keeps calendar-only source dates and stale availability visible', () => {
  const html = renderToStaticMarkup(<TrendAvailability week={{ availability: { stale: true, sourceAsOf: '2026-10-12', reason: 'Seed fallback' } }}/>);
  expect(html).toContain('2026-10-12'); expect(html).toContain('Stale'); expect(html).not.toContain('Seed fallback'); expect(trendAvailabilityText({ availability: { stale: true, sourceAsOf: '2026-10-12', reason: 'Seed fallback' } })).toContain('Seed fallback');
 });
 it('charts have explicit zero and data tables, null never draws zero', () => {
  const html = renderToStaticMarkup(<BiasChart rows={[{ label: 'Week 4', value: 3.5, sample: 1 }, { label: 'Week 5', value: null, sample: 0 }]} title="Strength gap"/>);
  expect(markupProblems('<div class="gx">'+html+'</div>')).toEqual([]);
  expect(html).toContain('Zero baseline'); expect(html).toContain('<table'); expect(html).toContain('No sample');
 });
 it.each([
  [{ rows: [{ value: 3.5 }, { value: -2 }] }, 'Scale: −3.5 to +3.5 points'],
  [{ rows: [{ value: 0.25 }, { value: 0 }], signedValues: false }, 'Scale: 0 to 1 points'],
  [{ rows: [{ value: 25 }, { value: 50 }], signedValues: false, unit: 'percent' }, 'Scale: 0 to 100%'],
  [{ rows: [{ value: null }, { value: NaN }] }, 'Scale unavailable'],
 ])('describes the plotted comparison range without treating missing values as zero', (props, label) => {
  const html = renderToStaticMarkup(<BiasChart {...props} title="Comparison"/>);
  expect(html).toContain(label);
  const nodes = [...walk(parseMarkup(html))];
  const figure = nodes.find(n => n.tag === 'figure');
  const scale = nodes.find(n => n.attrs?.id === figure.attrs['aria-describedby']);
  expect(scale?.attrs['data-chart-scale']).toBe('');
 });
 it('labels each observation and value beside its bar, preserving zero and missing samples', () => {
  const rows = [{ label: 'Positive week', value: 3.5 }, { label: 'Negative week', value: -3.5 }, { label: 'Zero week', value: 0 }, { label: 'Missing week', value: null }, { label: 'Invalid week', value: NaN }];
  const html = renderToStaticMarkup(<BiasChart rows={rows} title="Signed bias"/>);
  const nodes = [...walk(parseMarkup(html))].filter(n => n.tag);
  expect(nodes.filter(n => n.attrs.class === 'gx-tr-observation')).toHaveLength(5);
  expect(nodes.filter(n => n.tag === 'rect')).toHaveLength(2);
  expect(nodes.filter(n => n.tag === 'rect').map(n => n.attrs.width)).toEqual(['128', '128']);
  expect(nodes.filter(n => n.tag === 'rect').map(n => n.attrs.x)).toEqual(['150', '22']);
  expect(nodes.filter(n => n.attrs.class === 'gx-tr-zero-point')).toHaveLength(1);
  const chart = html.slice(0, html.indexOf('<table'));
  for (const text of ['Positive week', 'Negative week', '+3.5', '−3.5', 'Zero week', 'Missing week', 'No sample']) expect(chart).toContain(text);
  expect(html).not.toContain('NaN');
  expect(markupProblems('<div class="gx">'+html+'</div>')).toEqual([]);
 });
 it('keeps percentage bars on a shared 0–100 scale without a fabricated zero-width bar', () => {
  const html = renderToStaticMarkup(<BiasChart rows={[{ label: 'Zero', value: 0 }, { label: 'Half', value: 50 }, { label: 'Full', value: 100 }]} title="Cover rate" unit="percent" signedValues={false}/>);
  const nodes = [...walk(parseMarkup(html))].filter(n => n.tag);
  expect(nodes.filter(n => n.tag === 'rect').map(n => n.attrs.width)).toEqual(['134', '268']);
  expect(nodes.filter(n => n.tag === 'rect').every(n => n.attrs.x === '16')).toBe(true);
  expect(nodes.filter(n => n.attrs.class === 'gx-tr-zero-point')).toHaveLength(1);
  expect(html).toContain('50%'); expect(html).toContain('100%');
 });
 it('all-season reader fails the view on any missing requested season', async () => {
  const api = vi.fn(async (action, body) => { if (body.season === 2025) throw new Error('Unavailable'); return { ...history, seasons: [2026, 2025] }; });
  await expect(readTrendsHistory({ api, season: 2026, window: 'all', signal: new AbortController().signal })).rejects.toThrow('Unavailable');
 });
 it.each(['last5','last10'])('rolling %s spans available prior seasons', async window => { const api = vi.fn(async (action, body) => ({ ...history, season: body.season, seasons: [2026,2025], weeks: [] })); const data = await readTrendsHistory({ api, season: 2026, window, signal: new AbortController().signal }); expect(data.requestedSeasons).toEqual([2026,2025]); });
 it('rejects a substituted private scope instead of displaying Community history', async () => { const api = async () => ({ ...history, leagueId: null }); await expect(readTrendsHistory({ api, leagueId: 'private', season: 2026, signal: new AbortController().signal })).rejects.toThrow('private history'); });
 it('private reader passes league on every read, available seasons bound requests', async () => {
  const api = vi.fn(async (action, body) => ({ ...history, leagueId: body.leagueId, season: body.season, seasons: [2026, 2024], weeks: [] }));
  const data = await readTrendsHistory({ api, leagueId: 'private', season: 2026, window: 'years3', signal: new AbortController().signal });
  expect(api.mock.calls.map(c => c[1])).toEqual([{ season: 2026, leagueId: 'private' },{ season: 2024, leagueId: 'private' }]);
  expect(data.requestedSeasons).toEqual([2026,2024]);
 });
});

const legacy = vi.hoisted(() => ({ week: { availability: { stale: true, sourceAsOf: '2026-10-12', reason: 'Fixture outage' } } }));
vi.mock('../web/src/trendsData.js', () => ({ firstTrendWeek: () => 6, useTrendWeek: () => ({ status: 'ready', week: legacy.week }), useOfficials: () => null, useWind: () => ({ wind: null,now: null,loading: false }) }));
vi.mock('../web/src/TrendsView.jsx', () => ({ default: () => <div>Valid legacy fixture records</div> }));
const { default: LegacyPanel } = await import('../web/src/TrendsPanel.jsx');
it('legacy panel keeps source outage notes alongside valid cards', () => {
 const html = renderToStaticMarkup(<LegacyPanel season={2026} week={6}/>);
 expect(html).toContain('2026-10-12'); expect(html).toContain('Stale evidence'); expect(html).toContain('Fixture outage'); expect(html).toContain('Valid legacy fixture records');
});

const publishedSlate = vi.hoisted(() => ({ value: null }));
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: () => publishedSlate.value }));
const { TrendsScreen } = await import('../web/src/next/trends/TrendsScreen.jsx');
const { ShellContext } = await import('../web/src/next/shell/context.js');
function renderPublishedSlate(week, games, view) {
 publishedSlate.value = {
  app: { accountId: 'me', league: { id: 'community', name: 'Community', community: true } },
  personal: { data: { season: 2026, week, games, now: '2026-10-01T00:00:00Z', deadline: '2026-10-30T00:15:00Z', ballots: {} } },
  community: null, shown: { season: 2026, week }, trends: { status: 'ready', retry: vi.fn() }, trendsWeek: null,
 };
 return renderToStaticMarkup(<div className="gx"><ShellContext.Provider value={{ state: { views: { trends: view } }, setView: vi.fn(), openSheet: vi.fn() }}><TrendsScreen/></ShellContext.Provider></div>);
}
const lipsOf = html => [...walk(parseMarkup(html))].filter(n => n.tag === 'button' && n.attrs?.class?.includes('gx-nest-lip')).map(nameFrom);
const nextGame = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:00:00Z' };
// D-66: This Week is nesting cards (its Team and Matchup filters are gone). An address naming a game the published week
// no longer has falls back to the first card, which lists the new week's games.
describe('This Week nesting cards in the published slate', () => {
 it('opens a published game; a game the new week replaced falls back to This week and its games', () => {
  const view = { trendSection: 'week', weekGame: game.id };
  const initial = renderPublishedSlate(6,[game,nextGame],view);
  expect(lipsOf(initial)).toEqual(['Back to This week']);
  expect(initial).toContain('Game details · CAR @ ATL');
  expect(initial).not.toContain('Game details · SEA @ DEN');
  expect(markupProblems(initial)).toEqual([]);
  const changed = renderPublishedSlate(7,[nextGame],view);
  expect(view.weekGame).toBe(game.id);
  expect(changed).toContain('Published week: 2026 Week 7');
  expect(lipsOf(changed)).toEqual([]);
  expect(markupProblems(changed)).toEqual([]);
  // D-62: each game tile is the matchup as marks, away first; the tile keeps the words in its name.
  const tile = [...walk(parseMarkup(changed))].find(n => n.tag === 'button' && n.attrs?.['data-game'] === 'SEA-DEN');
  expect(nameFrom(tile).startsWith('Seattle Seahawks at Denver Broncos')).toBe(true);
  expect(matchups(tile)).toEqual([{ srcs: [teamMarks.SEA.src, teamMarks.DEN.src], name: 'Seattle Seahawks at Denver Broncos' }]);
 });
 it('a game whose market is closed shows the lock and how it opens, never a record, and keeps the game sheet', () => {
  const html = renderPublishedSlate(7,[game,nextGame],{ trendSection: 'week', weekGame: nextGame.id });
  expect(markupProblems(html)).toEqual([]);
  expect([...walk(parseMarkup(html))].some(n => n.attrs?.['data-trend'] === 'locked')).toBe(true);
  expect(html).toContain('Line-based records');
  expect(html).toContain('Game details · SEA @ DEN');
 });
});
