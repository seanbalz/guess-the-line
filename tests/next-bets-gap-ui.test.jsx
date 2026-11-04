// D-69 step 4: Bets › Your gap drawn from a fixed state (GapList and GapHero draw what `gap` holds). Contracts: D-77's hero
// is the first card with its approved words, dots and About toggle; the market switch; four tiles; the ranked rows as
// picture rows (marks first, a stable id, the % over its word); Show all names its count; your card's unsaved
// selections; your virtual card with its count and week; an older week is view only; the Refresh lines button says
// Refreshing… and is busy while a read is on its way; the title is focusable for the navigation that opens it.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(() => new Promise(() => {})), linesApi: vi.fn(() => new Promise(() => {})) }));
vi.mock('../web/src/trendsLoaders.js', () => ({ loadTrendWeek: vi.fn(() => new Promise(() => {})) }));
const { GapList } = await import('../web/src/next/bets/gap/YourGap.jsx');
const { GapHero } = await import('../web/src/next/bets/gap/GapHero.jsx');

const now = Date.parse('2099-10-08T17:00:00Z');
const game = (id, away, home) => ({ id, awayCode: away, homeCode: home, kickoff: '2099-10-08T20:00:00Z', offers: {}, locked: {} });
const ref = { value: -3.5, books: 3, observedAt: '2099-10-08T15:00:00Z' };
const ranked = id => ({ key: `${id}:spread`, game: game(id, ...id.split('-')), market: 'spread', guess: -10, gap: 6.5, gapPercent: 185.7, side: 'home', reference: ref, offer: { line: -3.5 }, savedPick: null, actionable: true, evaluations: {} });
const rows = ['SEA-DEN', 'HOU-JAX', 'KC-BUF', 'LAR-SF'].map(ranked);
const record = { wins: 5, losses: 2, pushes: 0, netUnits: 2.55, favorable: { wins: 4, losses: 2, pushes: 0 }, notGraded: { noFinal: 0, noLine: 0 },
  graded: [{ gameId: 'SEA-DEN', market: 'spread', outcome: 'win' }, { gameId: 'HOU-JAX', market: 'spread', outcome: 'loss' }] };
const gap = (patch = {}) => ({ data: { season: 2099, week: 5, games: rows.map(r => r.game), picks: [{ gameId: 'SEA-DEN', market: 'total', status: 'pending', selection: { side: 'over', line: 44.5, odds: -110, units: 1, source: 'BetMGM' } }] },
  info: { publishedWeek: { season: 2099, week: 5 }, slates: [{ season: 2099, week: 5 }, { season: 2099, week: 4 }] }, now, loading: false, busy: false, error: '', notice: '',
  selections: { 'NYJ-BUF:total': { gameId: 'NYJ-BUF', market: 'total', side: 'over', units: 2, offer: { line: 44.5, odds: -110, source: 'BetMGM', observedAt: ref.observedAt }, game: game('NYJ-BUF', 'NYJ', 'BUF') } },
  uncertain: null, expanded: false, historical: false, ranked: { status: 'ready', rows, counts: { locked: 1, missingReference: 0 } },
  shown: { rows, visible: rows.slice(0, 3) }, gaps: record, picks: {}, canTrack: true, setExpanded: vi.fn(), refresh: vi.fn(), changeWeek: vi.fn(), ...patch });
const draw = (state = gap()) => renderToStaticMarkup(<div className="gx"><GapList gap={state} market="all" messages onMarket={vi.fn()} onOpen={vi.fn()}/></div>);
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));

describe('Your gap', () => {
  const html = draw();
  it('keeps the kit markup rules; its title is Your gap, focusable', () => {
    expect(markupProblems(html)).toEqual([]);
    const h1 = nodes(html).find(n => n.tag === 'h1');
    expect([textOf(h1), h1.attrs.tabindex, 'data-route-focus' in h1.attrs]).toEqual(['Your gap', '-1', true]);
    // The title's ⓘ is named for the screen it explains (the old "About your guess vs. market" named the old row).
    expect(nodes(html).find(n => n.tag === 'button' && n.attrs['aria-haspopup'] === 'dialog').attrs['aria-label']).toBe('About gap ranking');
    // ...and never the near twin of D-77's fixed "About your gaps" toggle a few elements below.
    expect(nodes(html).filter(n => n.tag === 'button' && /^About your gaps?$/.test(nameFrom(n) ?? '')).map(nameFrom)).toEqual(['About your gaps']);
  });
  it('D-77’s hero is the first card: the rate, the record, one dot per gap, the About toggle', () => {
    const list = nodes(html).find(n => n.attrs?.['data-gap'] === 'list');
    const first = list.children.find(n => n.tag);
    expect([first.attrs['aria-label'], first.attrs['data-gap']]).toEqual(['Your gaps vs. closing lines', 'hero']);
    for (const text of ['Your gaps · Week 5', '71.4%', 'beat the close', '5–2 · +2.55U at −110']) expect(textOf(first)).toContain(text);
    expect(nodes(html).filter(n => n.attrs?.['data-outcome']).map(n => [n.attrs['data-outcome'], n.attrs['aria-label']])).toEqual([['win', 'SEA at DEN spread: Win'], ['loss', 'HOU at JAX spread: Loss']]);
    expect(nodes(html).find(n => n.tag === 'button' && nameFrom(n) === 'About your gaps').attrs['aria-expanded']).toBe('false');
    expect(html).not.toContain('a paper record, not bets placed');
  });
  it('the market switch, four tiles, the top three as picture rows, and Show all with its count', () => {
    expect(nodes(html).some(n => n.attrs?.role === 'group' && n.attrs['aria-label'] === 'Recommendation market')).toBe(true);
    expect(nodes(html).filter(n => n.attrs?.['data-gap-tile']).map(n => n.attrs['data-gap-tile'])).toEqual(['act', 'gaps', 'top', 'card']);
    const gapRows = nodes(html).filter(n => n.attrs?.['data-gap-row']);
    expect(gapRows.map(n => [n.attrs['data-gap-row'], n.attrs.id])).toEqual([['SEA-DEN:spread', 'gx-b-gap-SEA-DEN-spread'], ['HOU-JAX:spread', 'gx-b-gap-HOU-JAX-spread'], ['KC-BUF:spread', 'gx-b-gap-KC-BUF-spread']]);
    expect(/\bgx-prow-pic\b/.test(gapRows[0].children[0].attrs?.class ?? '')).toBe(true);
    expect(textOf(gapRows[0])).toContain('6.5 pt gap');
    expect(html).toContain('Top 3 to act on');
    expect(html).toContain('4 gaps · Week 5');
    expect(nodes(html).some(n => n.tag === 'button' && textOf(n) === 'Show all 4 differences')).toBe(true);
  });
  it('one gap says "1 gap", never "1 gaps"; a left-out note names missing lines too', () => {
    const one = draw(gap({ shown: { rows: rows.slice(0, 1), visible: rows.slice(0, 1) }, ranked: { status: 'ready', rows, counts: { locked: 0, missingReference: 2 } } }));
    expect(one).toContain('1 gap · Week 5');
    expect(one).not.toContain('1 gaps');
    expect(one).toContain('Drafts, locked markets, started games and missing lines are left out.');
  });
  it('your card lists an unsaved selection whose row is not shown; your virtual card counts its picks', () => {
    const card = nodes(html).find(n => n.attrs?.['data-gap'] === 'your-card');
    expect(textOf(card)).toContain('Over 44.5 · −110 · 2U · BetMGM');
    const saved = nodes(html).find(n => n.attrs?.['data-gap'] === 'saved-card');
    expect(saved.attrs['aria-label']).toBe('Your virtual card');
    for (const text of ['1 saved · Week 5', 'Over 44.5 · −110 · 1U · BetMGM', 'Pending']) expect(textOf(saved)).toContain(text);
    expect(nodes(html).find(n => n.tag === 'select').attrs['aria-label']).toBe('Recommendation week');
  });
  it('an older week is view only: no rows, no placement', () => {
    const older = draw(gap({ historical: true }));
    expect(older).toContain('View only · older week');
    expect(nodes(older).filter(n => n.attrs?.['data-gap-row'])).toHaveLength(0);
  });
  it('Refresh lines says Refreshing… and is busy while a read is on its way, with the rows’ skeleton', () => {
    const busy = draw(gap({ data: null, loading: true, gaps: null }));
    const button = nodes(busy).find(n => n.tag === 'button' && nameFrom(n) === 'Refreshing…');
    expect(button.attrs['aria-busy']).toBe('true');
    expect(nodes(busy).find(n => n.attrs?.['data-skeleton'] === 'rows').attrs.class).toContain('gx-gap-skel');
  });
  it('the hero with nothing graded says so', () => {
    const empty = renderToStaticMarkup(<div className="gx"><GapHero record={{ ...record, graded: [] }} week={5}/></div>);
    expect(empty).toContain('No finished games with a gap yet.');
  });
});
