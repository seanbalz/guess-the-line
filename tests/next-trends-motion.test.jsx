// D-69 step 3 (spec 6, "Trends: … it gets entrance motion, count-ups and the chart reveal"): each win rate counts from the
// last value this device showed for that trend (spec 4.4), keyed by the trend's slug, never its key (a key can carry a
// line band); the opened trend's chart reveals only after a tap, never on a load. Hand-built week; no network.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';

vi.mock('../web/src/auth', () => ({ cloudEnabled: false, supabase: null }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), leagueApi: vi.fn(), linesApi: vi.fn(), readTeams: vi.fn(), trendsApi: vi.fn() }));
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: () => null }));
const { TrendRate, TrendTile, rateFigure, trendLayer, trendSlug } = await import('../web/src/next/trends/TrendLayer.jsx');
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { markNavigated, markSettled, resetLaunch } = await import('../web/src/next/moments/launch.js');

const KEY = 'team_ats|team:GB+v:home@band:-3.5';
const card = { key: KEY, id: 'team_ats|team:GB+v:home', kind: 'card', title: 'GB at home: ATS', share: 5 / 7, games: 7, years: [2019, 2026], record: '5–2', chart: { spark: [0, 1, 2, 1, 3], units: 2.6, record: { W: 5, L: 2 } } };
const render = node => renderToStaticMarkup(<ShellContext.Provider value={{ go: vi.fn(), state: { sheets: [] } }}><div className="gx">{node}</div></ShellContext.Provider>);
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));
const byClass = (html, cls) => nodes(html).filter(n => (n.attrs?.class ?? '').split(/\s+/).includes(cls));

afterEach(() => resetLaunch());

describe('Trends count-ups and the chart reveal', () => {
  it('a win rate is a count-up of the one-decimal rate, with "%" after it; the tile reads as before', () => {
    const html = render(<ul><TrendTile card={card} rules={{}} onOpen={() => {}} account="u-1"/></ul>);
    expect(markupProblems(html)).toEqual([]);
    const [count] = byClass(html, 'gx-countup');
    expect([count.attrs['data-count'], textOf(count)]).toEqual(['rest', '71.4']);
    expect(textOf(byClass(html, 'gx-nest-num')[0])).toBe('71.4%');
    expect(render(<TrendRate share={null} account="u-1" figure="x" className="gx-n-m"/>)).not.toContain('gx-countup');
    expect(textOf(nodes(render(<TrendRate share={null} account="u-1" figure="x" className="gx-n-m"/>)).find(n => n.tag === 'span'))).toBe('—');
  });
  it('the remembered value is one per trend, by its slug: no key text (and no line band) in device storage', () => {
    expect(rateFigure(KEY)).toBe(`trends.rate.${trendSlug(KEY)}`);
    expect(rateFigure(KEY)).not.toMatch(/band|GB|\|/);
  });
  it('the opened trend’s chart reveals after a tap, never on a load; its big number counts up', () => {
    const view = { id: 'CAR-GB', title: 'CAR @ GB' };
    const layer = () => render(trendLayer({ label: 'Week trends', layer: 'trend:t1', card, week: { rows: {}, games: [] }, view, lips: [], account: 'u-1' }));
    expect(byClass(layer(), 'gx-reveal')[0].attrs['data-reveal']).toBeUndefined();
    markSettled(); markNavigated();
    const opened = layer();
    expect(markupProblems(opened)).toEqual([]);
    expect(byClass(opened, 'gx-reveal')[0].attrs['data-reveal']).toBe('in');
    expect(byClass(opened, 'gx-n-xl').map(textOf)).toEqual(['71.4%']);
    expect(byClass(opened, 'gx-countup')).toHaveLength(1);
  });
  it('every Trends number that is a win rate goes through TrendRate', () => {
    for (const file of ['TrendLayer.jsx', 'WeekNest.jsx', 'TeamsNest.jsx']) {
      const source = readFileSync(new URL(`../web/src/next/trends/${file}`, import.meta.url), 'utf8');
      expect(source.match(/<span className="gx-n-(m|l|xl)[^"]*">\{winRateText\(/g), file).toBeNull();
    }
  });
});
