import { trendAvailabilityText } from '../web/src/trendsAvailability.js';
import { marketSituationCards } from '../web/src/next/trends/situations.js';
vi.mock('../web/src/auth', () => ({ cloudEnabled: false, supabase: null }));
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, matchups, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { teamMarks } from '../web/src/teamLogoRegistry.js';
import { TABS } from '../web/src/next/shell/state.js';
import { PlayerEvidence } from '../web/src/next/trends/PlayerEvidence.jsx';
import { TrendAvailability } from '../web/src/next/lines/parts.jsx';
import { BiasChart } from '../web/src/next/trends/charts.jsx';
import { readTrendsHistory } from '../web/src/next/trends/useTrendsHistory.js';
vi.mock('../web/src/api.js', () => ({ communityApi: vi.fn(), leagueApi: vi.fn() }));
const game = { id: 'CAR-ATL', awayCode: 'CAR', homeCode: 'ATL', kickoff: '2026-10-01T20:00:00Z' };
const reference = { value: 3.5, basis: 'saved', observedAt: '2026-09-30T20:00:00Z', source: 'Fixture books' };
const history = { viewer: 'me', members: [{ id: 'me', displayName: 'Avery Fixture' }], season: 2026, seasons: [2026], weeks: [
 { season: 2026, week: 4, games: [game], gate: { 'CAR-ATL': { spread: true } }, results: { 'CAR-ATL': { status: 'final', home: 17, away: 22 } }, entries: [{ userId: 'me', mode: 'guess_spread', status: 'submitted', picks: [{ gameId: game.id, guess: 7, reference, points: 6.5 }] }] }
]};
const render = (data = history, patch = {}) => renderToStaticMarkup(<div className="gx"><PlayerEvidence history={data} published={{ season: 2026, week: 6 }} view={{ market: 'spread', team: 'CAR', ...patch }} onChange={() => {}} scopeName="Fixture league"/></div>);
describe('Trends UI evidence', () => {
 it('filters independent markets before highlight cap', () => { const cards = Object.fromEntries(['s1','s2','s3','t1'].map((id,i) => [id,{ title: id, market: i === 3 ? 'total' : 'home_ats', tier: 2, sideRule: 'A', score: { score: 100-i }, record: { W: 3,L: 2,P: 0 } }])); const week = { season: 2026, cards, games: [{ id: 'g', home: 'ATL', away: 'CAR', tier2: Object.keys(cards).map(card => ({ card })) }] }; expect(marketSituationCards(week,{ id: 'g',access: { spread: true,total: true },saved: {} },'total').map(c => c.id)).toEqual(['t1']); });
 it('keeps the approved four primary tabs', () => expect(TABS).toEqual(['home','play','bets','research']));
 it('separates saved market accuracy, hypothetical results and exact game evidence', () => {
  const html = render();
  expect(markupProblems(html)).toEqual([]);
  for (const word of ['Absolute error versus saved reference','Mean official points','At saved reference','At guessed line','Straight-up','Contributing games','Fixture books','Small sample','Cover performance by competition week','Player matchup']) expect(html).toContain(word);
 });
 it('labels current spread sentiment with the team and signed-home convention', () => { const data = structuredClone(history); data.weeks[0].week = 6; data.weeks[0].results = {}; const html = render(data); expect(html).toContain('Median GTL spread guess'); expect(html).toContain('Panthers '+String.fromCharCode(8722)+'7'); expect(html).toContain('Distribution uses signed home spreads: negative favors'); expect(html).toContain('signed home spread distribution'); });
 it('D-62: each contributing game and each sentiment game is headed by its matchup as marks, away first', () => {
  const CAR_ATL = { srcs: [teamMarks.CAR.src, teamMarks.ATL.src], name: 'Carolina Panthers at Atlanta Falcons' };
  const nodes = [...walk(parseMarkup(render()))];
  const h4 = nodes.find(n => n.tag === 'h4' && nameFrom(n).startsWith('2026 Week 4'));
  expect(nameFrom(h4)).toBe('2026 Week 4 · Carolina Panthers at Atlanta Falcons');
  expect(matchups(h4)).toEqual([CAR_ATL]);
  const current = structuredClone(history); current.weeks[0].week = 6; current.weeks[0].results = {};
  const summary = [...walk(parseMarkup(render(current)))].find(n => n.tag === 'summary' && nameFrom(n).includes('permitted guesses'));
  expect(nameFrom(summary)).toBe('Carolina Panthers at Atlanta Falcons · 1 permitted guesses');
  expect(matchups(summary)).toEqual([CAR_ATL]);
 });
 it('hidden values do not enter markup or chart metadata', () => {
  const data = structuredClone(history); data.viewer = 'other'; data.weeks[0].gate['CAR-ATL'].spread = false; data.weeks[0].entries[0].picks[0].guess = 87.125;
  const html = render(data);
  expect(html).not.toContain('87.125'); expect(html).toContain('No eligible locked guesses');
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
const selectedMatchup = html => {
 const select = [...walk(parseMarkup(html))].filter(n => n.tag === 'select')[1];
 return select.children.filter(n => n.tag === 'option' && Object.hasOwn(n.attrs, 'selected')).map(n => n.attrs.value);
};
const nextGame = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:00:00Z' };
// D-66: Teams has no Team or Matchup filter any more; it is the nesting cards (tests/next-trends-nest.test.jsx).
describe.each(['week'])('published matchup filters in %s', section => {
 it('uses All matchups when the published week replaces the saved matchup', () => {
  const view = { trendSection: section, matchup: game.id };
  const initial = renderPublishedSlate(6,[game,nextGame],view);
  expect(selectedMatchup(initial)).toEqual([game.id]);
  expect(initial).toContain('Game details · CAR @ ATL');
  expect(initial).not.toContain('Game details · SEA @ DEN');
  const changed = renderPublishedSlate(7,[nextGame],view);
  expect(view.matchup).toBe(game.id);
  expect(selectedMatchup(changed)).toEqual(['']);
  expect(changed).toContain('Published week: 2026 Week 7');
  expect(changed).toContain('Game details · SEA @ DEN');
  expect(changed).not.toContain('No games match these filters.');
  expect(markupProblems(changed)).toEqual([]);
  // D-62: the card's heading is the matchup as 32px marks, away first; the button keeps its text name.
  const heading = [...walk(parseMarkup(changed))].find(n => n.tag === 'h3' && n.children[0]?.attrs?.class?.includes('gx-mu'));
  expect(nameFrom(heading)).toBe('Seattle Seahawks at Denver Broncos');
  expect(matchups(heading)).toEqual([{ srcs: [teamMarks.SEA.src, teamMarks.DEN.src], name: 'Seattle Seahawks at Denver Broncos' }]);
 });
 it('uses All matchups when the current team filter removes the saved matchup', () => {
  const view = { trendSection: section, matchup: game.id, weekTeam: 'DEN' };
  const html = renderPublishedSlate(7,[game,nextGame],view);
  expect(selectedMatchup(html)).toEqual(['']);
  expect(html).toContain('Game details · SEA @ DEN');
  expect(html).not.toContain('Game details · CAR @ ATL');
  expect(html).not.toContain('No games match these filters.');
 });
});
