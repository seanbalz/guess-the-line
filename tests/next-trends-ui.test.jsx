import { trendAvailabilityText } from '../web/src/trendsAvailability.js';
import { marketSituationCards } from '../web/src/next/trends/situations.js';
vi.mock('../web/src/auth', () => ({ cloudEnabled: false, supabase: null }));
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems } from './helpers/ui-markup.mjs';
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
 it('preserves original tabs and adds Trends seventh', () => expect(TABS).toEqual(['home','play','bets','lines','league','fantasy','trends']));
 it('separates saved market accuracy, hypothetical results and exact game evidence', () => {
  const html = render();
  expect(markupProblems(html)).toEqual([]);
  for (const word of ['Absolute error versus saved reference','Mean official points','At saved reference','At guessed line','Straight-up','Contributing games','Fixture books','Small sample','Cover performance by competition week','Player matchup']) expect(html).toContain(word);
 });
 it('labels current spread sentiment with the team and signed-home convention', () => { const data = structuredClone(history); data.weeks[0].week = 6; data.weeks[0].results = {}; const html = render(data); expect(html).toContain('Median GTL spread guess'); expect(html).toContain('Panthers '+String.fromCharCode(8722)+'7'); expect(html).toContain('Distribution uses signed home spreads: negative favors'); expect(html).toContain('signed home spread distribution'); });
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
const { parseMarkup, walk } = await import('./helpers/ui-markup.mjs');
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
describe.each(['week','teams'])('published matchup filters in %s', section => {
 it('uses All matchups when the published week replaces the saved matchup', () => {
  const view = { section, matchup: game.id };
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
 });
 it('uses All matchups when the current team filter removes the saved matchup', () => {
  const view = { section, matchup: game.id, weekTeam: 'DEN' };
  const html = renderPublishedSlate(7,[game,nextGame],view);
  expect(selectedMatchup(html)).toEqual(['']);
  expect(html).toContain('Game details · SEA @ DEN');
  expect(html).not.toContain('Game details · CAR @ ATL');
  expect(html).not.toContain('No games match these filters.');
 });
});
