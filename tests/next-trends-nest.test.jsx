// D-66 Trends › Teams as nesting cards. The data mapping (teamNest.js), the three layers' markup (TeamsNest.jsx) and
// their addresses (router allowlist, back closes one layer). A hand-built week with fixture teams; nothing here reaches
// the network.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

vi.mock('../web/src/auth', () => ({ cloudEnabled: false, supabase: null }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), leagueApi: vi.fn(), linesApi: vi.fn(), readTeams: vi.fn(), trendsApi: vi.fn() }));
// The saved-trends tile reads the shared lines data; these layers get theirs as props.
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: () => null }));
const { nestTeams, nestTeamTrends, trendShare } = await import('../web/src/next/trends/teamNest.js');
const { TeamsNest, trendSlug } = await import('../web/src/next/trends/TeamsNest.jsx');
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { fragmentFor, placeFromFragment } = await import('../web/src/next/shell/router.js');
const { initialState, reduce } = await import('../web/src/next/shell/state.js');

const GB_ATS = 'team_ats|team:GB+v:home', GB_OU = 'total|v:home+team:GB', GB_SU = 'su|team:GB+v:home';
const CAR_ATS = 'team_ats|team:CAR+v:road', CAR_OU = 'total|v:road+team:CAR', COACH = 'team_ats|coach:Fixture Coach';
const rows = {
  [GB_ATS]: { title: 'GB at home: ATS', market: 'team_ats', split: [5, 2, 0] },
  [GB_OU]: { title: 'GB games at home: over/under', market: 'total', split: [2, 5, 0] },
  [GB_SU]: { title: 'GB at home: straight-up', market: 'su', split: [4, 3, 0], descriptive: true },
  [CAR_ATS]: { title: 'CAR on the road: ATS', market: 'team_ats', split: [3, 3, 1] },
  [CAR_OU]: { title: 'CAR games on the road: over/under', market: 'total', split: [4, 2, 0] },
  [COACH]: { title: 'Head coach Fixture Coach: ATS (career)', market: 'team_ats', split: [60, 50, 3] },
};
const weekOf = (gated = undefined) => ({ season: 2026, rows, cards: {}, games: [{ id: 'CAR-GB', home: 'GB', away: 'CAR', ...(gated ? { gated } : {}), entities: {
  teams: { GB: { ats: GB_ATS, ou: GB_OU, su: GB_SU }, CAR: { ats: CAR_ATS, ou: CAR_OU, su: null } }, coaches: { GB: { ats: COACH, ou: null } },
} }] });
const viewOf = (access = { spread: true, total: true }) => ({ id: 'CAR-GB', away: { code: 'CAR' }, home: { code: 'GB' }, access, saved: {}, trendsGame: {}, title: 'CAR @ GB', when: 'Thu, Oct 29, 5:15 PM PT', rules: {} });
const shell = { openSheet: vi.fn(), state: { sheets: [] } };
const render = (view, { week = weekOf(), views = [viewOf()], market = 'spread' } = {}) => renderToStaticMarkup(
  <ShellContext.Provider value={shell}><div className="gx"><TeamsNest week={week} views={views} market={market} view={view} onChange={() => {}}/></div></ShellContext.Provider>);
const nodes = html => [...walk(parseMarkup(html))];
const textOf = node => (node.text ?? (node.children ?? []).map(textOf).join(''));
// Each run of text on a layer's surface, sentence by sentence; a closed disclosure, a chart's figure and its table are a
// tap or a scroll away, so they are not surface.
const surfaceSentences = html => {
  const runs = [], visit = n => { if (n.text != null) runs.push(n.text); else if (!['details', 'figure', 'table'].includes(n.tag)) (n.children ?? []).forEach(visit); };
  visit(parseMarkup(html));
  return runs.flatMap(t => t.split(/(?<=[.!?])\s+/)).map(t => t.trim()).filter(Boolean);
};

describe('teamNest: what the layers are built from', () => {
  it('layer 1 lists each team once, by code, with its venue record for the market and its share of decided games', () => {
    const spread = nestTeams(weekOf(), [viewOf()], 'spread');
    expect(spread.map(t => [t.code, t.role, t.headline.record])).toEqual([['CAR', 'road', '3–3–1'], ['GB', 'home', '5–2']]);
    expect(spread[1].share).toBeCloseTo(5 / 7);
    expect(spread[0].share).toBeCloseTo(3 / 6); // a push is not a decided game
    const total = nestTeams(weekOf(), [viewOf()], 'total');
    expect(total.map(t => t.headline.record)).toEqual(['4–2', '2–5']);
  });
  it('layer 2 holds only that team’s trends in the market: its own rows and its coach, never the opponent’s', () => {
    const gb = nestTeams(weekOf(), [viewOf()], 'spread').find(t => t.code === 'GB');
    const { cards } = nestTeamTrends(weekOf(), gb, 'spread');
    expect(cards.map(c => c.id).sort()).toEqual([COACH, GB_ATS, GB_SU].sort());
    const totals = nestTeamTrends(weekOf(), gb, 'total').cards.map(c => c.id);
    expect(totals).toEqual([GB_OU]);
  });
  it('a closed line gate is a lock with no record, and the market’s public rows stay', () => {
    const week = weekOf({ spread: ['team_ats|team:GB+fav'] });
    const gb = nestTeams(week, [viewOf({ spread: false, total: true })], 'spread').find(t => t.code === 'GB');
    const { cards, locks } = nestTeamTrends(week, gb, 'spread');
    expect(locks).toEqual(['spread']);
    expect(cards.map(c => c.id)).toContain(GB_ATS);
    expect(nestTeamTrends(week, gb, 'total').locks).toEqual([]);
  });
  it('a missing share is null, never zero', () => {
    expect(trendShare(weekOf(), null)).toBeNull();
    expect(trendShare(weekOf(), { locked: true })).toBeNull();
    expect(trendShare(weekOf(), { kind: 'card', pct: null })).toBeNull();
  });
});

describe('TeamsNest: one smaller layer per tap', () => {
  it('Teams: one tile per team with its mark, one number and a meter; no lips; fine print only behind ⓘ', () => {
    const html = render({});
    expect(markupProblems(html)).toEqual([]);
    const tiles = nodes(html).filter(n => n.tag === 'button' && n.attrs?.['data-team']);
    expect(tiles.map(n => n.attrs['data-team'])).toEqual(['CAR', 'GB']);
    expect(nameFrom(tiles[1])).toContain('Green Bay Packers');
    expect(nameFrom(tiles[1])).toContain('5–2');
    expect(html).not.toContain('gx-nest-lip');
    expect(nodes(html).some(n => n.tag === 'button' && nameFrom(n) === 'About team trends')).toBe(true);
    expect(html).not.toContain('Past results since 2002'); // the footnote moved behind ⓘ
    for (const sentence of surfaceSentences(html)) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(12);
  });
  it('one team: a lip back to Teams, the game in one meta line, a tile per trend, and the game sheet one tap away', () => {
    const html = render({ teamsTeam: 'GB' });
    expect(markupProblems(html)).toEqual([]);
    const lips = nodes(html).filter(n => n.tag === 'button' && n.attrs?.class?.includes('gx-nest-lip'));
    expect(lips.map(nameFrom)).toEqual(['Back to Teams']);
    expect(nodes(html).find(n => n.tag === 'h2' && n.attrs?.['data-route-focus'] !== undefined)).toBeTruthy();
    expect(html).toContain('Green Bay Packers');
    expect(html).toContain('CAR @ GB · Thu, Oct 29, 5:15 PM PT');
    expect(html).toContain('GB at home: ATS');
    expect(html).not.toContain('CAR on the road: ATS');
    expect(html).toContain('Game details · CAR @ GB');
  });
  it('one trend: two lips, the big record, the sample and tier as tags, windows behind a disclosure; the address hides the key', () => {
    const key = `${GB_ATS}@GB`, slug = trendSlug(key);
    expect(slug).toMatch(/^t[0-9a-z]+$/);
    expect(slug).not.toContain('GB');
    const html = render({ teamsTeam: 'GB', teamsTrend: slug });
    expect(markupProblems(html)).toEqual([]);
    const lips = nodes(html).filter(n => n.tag === 'button' && n.attrs?.class?.includes('gx-nest-lip'));
    expect(lips.map(nameFrom)).toEqual(['Back to Teams', 'Back to Green Bay Packers']);
    expect(nodes(html).find(n => n.tag === 'h2').children.map(textOf).join('')).toBe('GB at home: ATS');
    expect(html).toContain('7 games');
    expect(html).toContain('No proven edge');
    expect(html).not.toContain('since 2002.'); // the sentence is in the ⓘ, not on the card
    expect(html).not.toContain(GB_ATS);
  });
  it('a stale address falls back to the nearest layer that exists', () => {
    const lipsOf = html => nodes(html).filter(n => n.tag === 'button' && n.attrs?.class?.includes('gx-nest-lip')).map(nameFrom);
    expect(lipsOf(render({ teamsTeam: 'GB', teamsTrend: 'tnothing' }))).toEqual(['Back to Teams']);
    expect(render({ teamsTeam: 'NYJ' })).not.toContain('gx-nest-lip');
  });
  it('a closed line gate shows a lock tile with its condition and no record', () => {
    const week = weekOf({ spread: ['team_ats|team:GB+fav'] });
    const html = render({ teamsTeam: 'GB' }, { week, views: [viewOf({ spread: false, total: true })] });
    expect(html).toContain('Line-based records');
    expect(nodes(html).some(n => n.attrs?.['data-trend'] === 'locked')).toBe(true);
  });
});

describe('addresses: each layer reloads, and back closes one layer', () => {
  it('the router keeps the team and the trend slug and nothing else new', () => {
    const slug = trendSlug(`${GB_ATS}@GB`);
    const fragment = fragmentFor('research', { section: 'trends' }, { trends: { trendSection: 'teams', teamsTeam: 'GB', teamsTrend: slug, guess: 3.5 } });
    expect(fragment).toContain('teamsTeam=GB');
    expect(fragment).toContain(`teamsTrend=${slug}`);
    expect(fragment).not.toContain('guess');
    expect(placeFromFragment(fragment).adapters.trends).toMatchObject({ trendSection: 'teams', teamsTeam: 'GB', teamsTrend: slug });
  });
  it('opening a team and a trend are steps; back returns to the team, then to Teams', () => {
    let state = reduce(initialState(), { type: 'go', tab: 'research', view: { section: 'trends' } });
    state = reduce(state, { type: 'view', tab: 'trends', patch: { trendSection: 'teams' } });
    const trail = state.trail.length;
    state = reduce(state, { type: 'view', tab: 'trends', patch: { teamsTeam: 'GB', teamsTrend: null } });
    state = reduce(state, { type: 'view', tab: 'trends', patch: { teamsTrend: 'tabc' } });
    expect(state.trail.length).toBe(trail + 2);
    state = reduce(state, { type: 'back' });
    expect(state.views.trends.teamsTeam).toBe('GB');
    expect(state.views.trends.teamsTrend ?? null).toBeNull();
    state = reduce(state, { type: 'back' });
    expect(state.views.trends.teamsTeam ?? null).toBeNull();
    expect(state.views.research.section).toBe('trends');
  });
});

describe('Players layers: addresses, steps and surface text', async () => {
  const { PlayersNest } = await import('../web/src/next/trends/PlayersNest.jsx');
  const game = { id: 'CAR-ATL', awayCode: 'CAR', homeCode: 'ATL', kickoff: '2026-10-01T20:00:00Z' };
  const reference = { value: 3.5, basis: 'saved', observedAt: '2026-09-30T20:00:00Z', source: 'Fixture books' };
  const history = { viewer: 'me', members: [{ id: 'me', displayName: 'Avery Fixture' }, { id: 'pal', displayName: 'Blake Fixture' }], season: 2026, seasons: [2026], weeks: [1, 2, 3, 4].map(week => ({
    season: 2026, week, games: [game], gate: { 'CAR-ATL': { spread: true } }, results: { 'CAR-ATL': { status: 'final', home: 17, away: 22 + week } },
    entries: ['me', 'pal'].map(userId => ({ userId, mode: 'guess_spread', status: 'submitted', picks: [{ gameId: game.id, guess: userId === 'me' ? 7 : -2, reference, points: userId === 'me' ? 6.5 : 4 }] })),
  })) };
  const show = view => renderToStaticMarkup(<div className="gx"><PlayersNest history={history} published={{ season: 2026, week: 6 }} view={{ market: 'spread', ...view }} onChange={() => {}} scopeName="Fixture league"/></div>);
  it.each([[{}], [{ player: 'me' }], [{ player: 'me', playerLayer: 'covers' }], [{ player: 'me', playerLayer: 'teams' }], [{ player: 'me', playerLayer: 'teams', playerItem: 'CAR' }], [{ playerLayer: 'week' }]])('layer %j: valid markup, viewer first, no surface sentence over twelve words', view => {
    const html = show(view);
    expect(markupProblems(html)).toEqual([]);
    for (const sentence of surfaceSentences(html)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(12);
  });
  it('the viewer’s tile comes first and each tile opens that player', () => {
    const tiles = nodes(show({})).filter(n => n.tag === 'button' && n.attrs?.['data-player']);
    expect(tiles.map(n => n.attrs['data-player'])).toEqual(['me', 'pal']);
    expect(nameFrom(tiles[0])).toContain('6.5');
  });
  it('the router keeps the player, layer and item; opening each is a step; the account reset is not', () => {
    const fragment = fragmentFor('research', { section: 'trends' }, { trends: { trendSection: 'players', player: 'me', playerLayer: 'teams', playerItem: 'CAR:for' } });
    expect(placeFromFragment(fragment).adapters.trends).toMatchObject({ player: 'me', playerLayer: 'teams', playerItem: 'CAR:for' });
    let state = reduce(initialState(), { type: 'go', tab: 'research', view: { section: 'trends' } });
    state = reduce(state, { type: 'view', tab: 'trends', patch: { trendSection: 'players' } });
    const trail = state.trail.length;
    for (const patch of [{ player: 'me', playerLayer: null, playerItem: null }, { playerLayer: 'teams', playerItem: null }, { playerItem: 'CAR' }]) state = reduce(state, { type: 'view', tab: 'trends', patch });
    expect(state.trail.length).toBe(trail + 3);
    state = reduce(state, { type: 'back' });
    expect([state.views.trends.player, state.views.trends.playerLayer, state.views.trends.playerItem ?? null]).toEqual(['me', 'teams', null]);
    const before = state.trail.length;
    state = reduce(state, { type: 'view', tab: 'trends', patch: { player: undefined, playerLayer: undefined, playerItem: undefined, team: undefined, playerMatchup: undefined, window: undefined } });
    expect(state.trail.length).toBe(before);
    expect(state.views.trends.player).toBeUndefined();
  });
});

describe('This Week layers: top trends, games, one game, one trend', async () => {
  const { WeekNest } = await import('../web/src/next/trends/WeekNest.jsx');
  const card = { title: 'Home team after a loss: ATS', market: 'home_ats', tier: 2, sideRule: 'A', score: { score: 90 }, record: { W: 30, L: 20, P: 1 } };
  const withCard = () => { const week = weekOf(); week.cards = { c1: card }; week.games[0].tier2 = [{ card: 'c1' }]; return week; };
  const lines = { app: {}, personal: { data: null }, shown: { season: 2026, week: 6 } };
  const show = (view, { week = withCard(), views = [viewOf()], market = 'spread' } = {}) => renderToStaticMarkup(
    <ShellContext.Provider value={shell}><div className="gx"><WeekNest week={week} views={views} market={market} view={view} onChange={() => {}} lines={lines} onBuild={() => {}}/></div></ShellContext.Provider>);
  const lips = html => nodes(html).filter(n => n.tag === 'button' && n.attrs?.class?.includes('gx-nest-lip')).map(nameFrom);
  it('This week: the top trend, a tile per game with its count, no lips, and fine print behind ⓘ', () => {
    const html = show({});
    expect(markupProblems(html)).toEqual([]);
    expect(lips(html)).toEqual([]);
    expect(html).toContain('CAR @ GB · Home team after a loss: ATS');
    const tile = nodes(html).find(n => n.tag === 'button' && n.attrs?.['data-game'] === 'CAR-GB');
    expect(nameFrom(tile).startsWith('Carolina Panthers at Green Bay Packers')).toBe(true);
    expect(html).not.toContain('Past results since 2002');
    expect(nodes(html).some(n => n.tag === 'button' && nameFrom(n) === 'About this week’s trends')).toBe(true);
    for (const sentence of surfaceSentences(html)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(12);
  });
  it('one game: a lip back to This week, its trends as tiles, and a closed market as a lock', () => {
    const open = show({ weekGame: 'CAR-GB' });
    expect(markupProblems(open)).toEqual([]);
    expect(lips(open)).toEqual(['Back to This week']);
    expect(open).toContain('Home team after a loss: ATS');
    expect(open).toContain('Game details · CAR @ GB');
    const closed = show({ weekGame: 'CAR-GB' }, { views: [viewOf({ spread: false, total: true })] });
    expect(closed).toContain('Line-based records');
    expect(nodes(closed).some(n => n.attrs?.['data-trend'] === 'locked')).toBe(true);
  });
  it('one trend: two lips, the record, the tags, and an address that hides the key', () => {
    const slug = trendSlug('c1@');
    const html = show({ weekGame: 'CAR-GB', weekTrend: slug });
    expect(markupProblems(html)).toEqual([]);
    expect(lips(html)).toEqual(['Back to This week', 'Back to CAR @ GB']);
    expect(nodes(html).find(n => n.tag === 'h2').children.map(textOf).join('')).toBe('Home team after a loss: ATS');
    expect(html).toContain('30–20–1');
    const fragment = fragmentFor('research', { section: 'trends' }, { trends: { trendSection: 'week', weekGame: 'CAR-GB', weekTrend: slug } });
    expect(placeFromFragment(fragment).adapters.trends).toMatchObject({ weekGame: 'CAR-GB', weekTrend: slug });
  });
  it('opening a game and a trend are steps; back closes one layer at a time', () => {
    let state = reduce(initialState(), { type: 'go', tab: 'research', view: { section: 'trends' } });
    const trail = state.trail.length;
    state = reduce(state, { type: 'view', tab: 'trends', patch: { weekGame: 'CAR-GB', weekTrend: null } });
    state = reduce(state, { type: 'view', tab: 'trends', patch: { weekTrend: 'tabc' } });
    expect(state.trail.length).toBe(trail + 2);
    state = reduce(state, { type: 'back' });
    expect([state.views.trends.weekGame, state.views.trends.weekTrend ?? null]).toEqual(['CAR-GB', null]);
  });
});
