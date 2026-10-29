// D-66 Research › Fantasy as nesting cards: the rankings card, one player, the report card and compare, with the same
// ranking engine as before. The shipped Week 6 snapshot stands in for the read; nothing here reaches the network.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { buildRankings, DEFAULT_FILTERS } from '../shared/fantasy-rankings.mjs';

const snapshot = JSON.parse(fs.readFileSync(new URL('../shared/fantasy/2026-week-06.json', import.meta.url), 'utf8'));
const read = vi.hoisted(() => ({ value: null }));
vi.mock('../web/src/fantasyData.js', () => ({
  FANTASY_AVAILABLE: [{ key: '2026-06', season: 2026, week: 6 }], FANTASY_INITIAL: '2026-06',
  fantasyWeekKey: (season, week) => `${season}-${String(week).padStart(2, '0')}`, useFantasySnapshot: () => read.value,
}));
vi.mock('../web/src/fantasyContext.js', () => ({ useFantasyGameContext: () => ({ lines: null, wind: null }) }));
const { FantasyNest, FANTASY_PAGE } = await import('../web/src/next/fantasy/FantasyNest.jsx');
const { fragmentFor, placeFromFragment } = await import('../web/src/next/shell/router.js');
const { initialState, reduce } = await import('../web/src/next/shell/state.js');

read.value = { status: 'ready', snapshot, origin: 'hosted', weeks: [{ key: '2026-06', season: 2026, week: 6 }] };
const rows = buildRankings(snapshot, DEFAULT_FILTERS).rows;
const render = (view = {}, extra = {}) => renderToStaticMarkup(<div className="gx"><FantasyNest navigationState={{ selection: '2026-06' }} onNavigationState={() => {}} view={view} onLayer={() => {}}
  profileId={null} onProfile={() => {}} compareIds={[]} onCompareChange={() => {}} onCompare={() => {}} {...extra}/></div>);
const nodes = html => [...walk(parseMarkup(html))];
const lips = html => nodes(html).filter(n => n.tag === 'button' && n.attrs?.class?.includes('gx-nest-lip')).map(nameFrom);
const surface = html => {
  const runs = [], visit = n => { if (n.text != null) runs.push(n.text); else if (!['details', 'figure', 'table', 'dialog'].includes(n.tag)) (n.children ?? []).forEach(visit); };
  visit(parseMarkup(html));
  return runs.flatMap(t => t.split(/(?<=[.!?])\s+/)).map(t => t.trim()).filter(Boolean);
};

describe('Fantasy nesting cards', () => {
  it('the rankings card: one tile per ranked player in engine order, no lips, and no long sentence on the surface', () => {
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(lips(html)).toEqual([]);
    const tiles = nodes(html).filter(n => n.tag === 'button' && n.attrs?.['data-player']);
    expect(tiles.map(n => n.attrs['data-player'])).toEqual(rows.slice(0, FANTASY_PAGE).map(r => r.id));
    expect(html).not.toContain('Player details &amp; trends');
    expect(html).not.toContain('These are GTL estimates'); // the intro and method are behind the card's ⓘ
    expect(nodes(html).some(n => n.tag === 'button' && nameFrom(n) === 'About Fantasy rankings')).toBe(true);
    expect(html).toContain(`Stats through Week ${snapshot.statsThroughWeek}`);
    for (const sentence of surface(html)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(12);
  });
  it('one player: a lip back to Fantasy, the estimate, the trends and the tools', () => {
    const player = rows.find(r => r.trendHighlights?.length) ?? rows[0];
    const html = render({ fantasyLayer: 'player', fantasyPlayer: player.id });
    expect(markupProblems(html)).toEqual([]);
    expect(lips(html)).toEqual(['Back to Fantasy']);
    expect(nodes(html).find(n => n.tag === 'h2').children.map(c => c.text ?? '').join('')).toBe(player.name);
    expect(html).toContain(`Trends entering Week ${snapshot.week}`);
    expect(html).toContain(`Usage &amp; production: ${player.name}`);
    expect(html).toContain(`Add to compare: ${player.name}`);
  });
  it('a player the filters no longer list falls back to the rankings card', () => {
    expect(lips(render({ fantasyLayer: 'player', fantasyPlayer: 'not-a-player' }))).toEqual([]);
  });
  it('compare is its own layer with the comparison region', () => {
    const html = render({ fantasyLayer: 'compare' });
    expect(lips(html)).toEqual(['Back to Fantasy']);
    expect(html).toContain('gx-fantasy-compare');
  });
  it('the layer and player are route keys; opening each is a step and back closes one layer', () => {
    const fragment = fragmentFor('research', { section: 'fantasy' }, { fantasy: { fantasyLayer: 'player', fantasyPlayer: rows[0].id } });
    expect(placeFromFragment(fragment).adapters.fantasy).toMatchObject({ fantasyLayer: 'player', fantasyPlayer: rows[0].id });
    let state = reduce(initialState(), { type: 'go', tab: 'research', view: { section: 'fantasy' } });
    const trail = state.trail.length;
    state = reduce(state, { type: 'view', tab: 'fantasy', patch: { fantasyLayer: 'player', fantasyPlayer: rows[0].id } });
    expect(state.trail.length).toBe(trail + 1);
    state = reduce(state, { type: 'back' });
    expect(state.views.fantasy.fantasyLayer ?? null).toBeNull();
  });
});

describe('a lip back to the previous layer is Back, not a new step', () => {
  it('Fantasy › player › lip leaves the trail as it was, so the next Back leaves Fantasy', () => {
    let state = reduce(initialState(), { type: 'go', tab: 'research', view: { section: 'fantasy' } });
    const trail = state.trail.length;
    state = reduce(state, { type: 'view', tab: 'fantasy', patch: { fantasyLayer: 'player', fantasyPlayer: rows[0].id } });
    state = reduce(state, { type: 'view', tab: 'fantasy', patch: { fantasyLayer: null, fantasyPlayer: null } });
    expect(state.trail.length).toBe(trail);
    expect(state.navMode).toBe('back');
    expect(state.views.fantasy.fantasyLayer ?? null).toBeNull();
  });
  it('a step somewhere new still adds a trail entry', () => {
    let state = reduce(initialState(), { type: 'go', tab: 'research', view: { section: 'fantasy' } });
    state = reduce(state, { type: 'view', tab: 'fantasy', patch: { fantasyLayer: 'player', fantasyPlayer: rows[0].id } });
    const trail = state.trail.length;
    state = reduce(state, { type: 'view', tab: 'fantasy', patch: { fantasyLayer: 'compare', fantasyPlayer: null } });
    expect(state.trail.length).toBe(trail + 1);
  });
});
