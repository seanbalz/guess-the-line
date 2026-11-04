// D-69 step 3: Research › Fantasy's report card rebuilt as tiles and rows in the new app (the Track 1 owner opened
// web/src/next/fantasy/ for it on November 4, 2026). Contracts: the numbers are summarizeReview's; the old
// FantasyAccuracy.jsx leaves the new app (spec test 13) and stays for the old one; and the owner's binding conditions,
// one test each: D-76's copy, the method's name and version from each snapshot's own data, a lazy Fantasy chunk, every
// new-app Fantasy file parses, the NBA status region stays mounted, and one Fantasy title.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { transformSync } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { reviewFixture } from './helpers/fantasy-review-fixture.mjs';
import { DEFAULT_FILTERS, formatFantasyNumber } from '../shared/fantasy-rankings.mjs';
import { summarizeReview } from '../shared/fantasy-review.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const base = JSON.parse(read('shared/fantasy/2026-week-06.json'));
const USAGE = { name: 'GTL usage', version: '2.0', description: 'Usage estimates. Kickers, and any player with incomplete usage stats, use the earlier pace method.' };
const PACE = { name: 'GTL statistical pace', version: '1.1', description: 'For each statistic, a descriptive pace estimate.' };
const state = vi.hoisted(() => ({ value: null }));
vi.mock('../web/src/fantasyData.js', () => ({ FANTASY_AVAILABLE: [{ key: '2026-06', season: 2026, week: 6 }], FANTASY_INITIAL: '2026-06',
  fantasyWeekKey: (season, week) => `${season}-${String(week).padStart(2, '0')}`, useFantasySnapshot: () => state.value }));
vi.mock('../web/src/fantasyContext.js', () => ({ useFantasyGameContext: () => ({ lines: null, wind: null }) }));
const { FantasyNest, methodBody } = await import('../web/src/next/fantasy/FantasyNest.jsx');
const { REPORT_COPY, reportModel, reportTile } = await import('../web/src/next/fantasy/fantasyReport.js');
const { FantasyPage } = await import('../web/src/next/fantasy/FantasyPage.jsx');
const { Games } = await import('../web/src/next/nba/Games.jsx');

const review = reviewFixture(base);
const ready = method => ({ status: 'ready', snapshot: { ...base, method }, review, origin: 'hosted', weeks: [{ key: '2026-06', season: 2026, week: 6 }] });
const render = (view = {}) => renderToStaticMarkup(<div className="gx"><FantasyNest navigationState={{ selection: '2026-06' }} onNavigationState={() => {}} view={view} onLayer={() => {}}
  profileId={null} onProfile={() => {}} compareIds={[]} onCompareChange={() => {}} onCompare={() => {}}/></div>);
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));
const words = html => nodes(html).filter(n => n.text != null).map(n => n.text).join(' ');
const filesUnder = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? filesUnder(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const code = file => transformSync(read(file), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', jsx: 'automatic', format: 'esm' }).code; // comments dropped
const FANTASY = filesUnder('web/src/next/fantasy').filter(file => /\.jsx?$/.test(file));
const SURFACES = [{}, { fantasyLayer: 'report' }, { fantasyLayer: 'compare' }];

describe('the report card as tiles and rows', () => {
  it('four tiles, one row per position and the biggest misses one tap away, every number summarizeReview’s', () => {
    state.value = ready(USAGE);
    const html = render({ fantasyLayer: 'report' });
    expect(markupProblems(html)).toEqual([]);
    const s = summarizeReview(review, DEFAULT_FILTERS);
    const tile = key => nodes(html).find(n => n.attrs?.['data-report'] === key);
    expect(textOf(tile('miss'))).toContain(formatFantasyNumber(s.mae));
    expect(textOf(tile('baseline'))).toContain(formatFantasyNumber(s.baselineMae));
    expect(textOf(tile('within'))).toContain(`${Math.round(s.within5 * 100)}%`);
    expect(textOf(tile('graded'))).toContain(String(s.graded));
    expect(nodes(html).filter(n => n.attrs?.['data-report-position']).map(n => n.attrs['data-report-position'])).toEqual(s.byPosition.map(r => r.position));
    expect(html).toContain(`aria-label="Week ${review.week} accuracy"`);
    expect(html).toContain('PROVISIONAL');
    expect(nodes(html).filter(n => n.tag === 'details' && n.attrs['data-fantasy'] === 'misses')).toHaveLength(1);
    expect(nodes(html).filter(n => n.tag === 'table')).toHaveLength(0);
    expect(reportModel(review, DEFAULT_FILTERS, 'Full PPR').overs.map(r => r.id)).toEqual(s.overs.map(r => r.id));
  });
  it('the rankings card’s report tile shows the miss in points; with nothing graded, the status', () => {
    state.value = ready(USAGE);
    const html = render();
    const tile = nodes(html).find(n => n.attrs?.['data-fantasy'] === 'report');
    expect(textOf(tile)).toContain(formatFantasyNumber(summarizeReview(review, DEFAULT_FILTERS).mae));
    expect(reportTile({ ...review, players: [] }, DEFAULT_FILTERS)).toEqual({ big: 'PROVISIONAL', sub: 'How close the estimates were' });
  });
  it('spec test 13: no new-app file imports the old FantasyAccuracy.jsx; the old app keeps it', () => {
    for (const file of filesUnder('web/src/next').filter(file => /\.jsx?$/.test(file))) expect(read(file), file).not.toMatch(/(from\s*|import\(\s*)['"][^'"]*FantasyAccuracy/);
    expect(read('web/src/FantasyFootball.jsx')).toMatch(/import \{ FantasyAccuracy \} from '\.\/FantasyAccuracy\.jsx'/);
  });
});

describe('the Track 1 owner’s conditions', () => {
  it('D-76 copy: the rankings ⓘ says "from recent usage and statistics"; the report card says "GTL’s weekly estimates"', () => {
    expect(methodBody({ ...base, method: USAGE }, DEFAULT_FILTERS, 'Full PPR')[0]).toContain('from recent usage and statistics');
    expect(REPORT_COPY.about).toContain('GTL’s weekly estimates');
    expect(reportModel(review, DEFAULT_FILTERS, 'Full PPR').fine[0]).toBe(REPORT_COPY.about);
  });
  it('the rankings ⓘ shows each snapshot’s own method text unchanged, and the app’s own fallback when a snapshot has none', () => {
    for (const method of [USAGE, PACE]) expect(methodBody({ ...base, method }, DEFAULT_FILTERS, 'Full PPR')).toContain(method.description);
    const { method: _none, ...withoutMethod } = { ...base, method: undefined };
    expect(methodBody(withoutMethod, DEFAULT_FILTERS, 'Full PPR')).toContain('Estimates come from recent usage and statistics over the scheduled games remaining.');
  });
  it('"pace" on no rendered surface: no app string says it, and no drawn surface says it, even when a snapshot’s own method does (the ⓘ dialog shows that method text unchanged, above)', () => {
    for (const file of FANTASY) expect(code(file), file).not.toMatch(/\bpace\b/i);
    for (const method of [USAGE, PACE]) for (const view of SURFACES) {
      state.value = ready(method);
      expect(words(render(view)), `${method.name} ${JSON.stringify(view)}`).not.toMatch(/\bpace\b/i);
    }
  });
  it('the method’s name and version come from each snapshot’s own data, never from the app', () => {
    expect(methodBody({ ...base, method: USAGE }, DEFAULT_FILTERS, 'Full PPR')).toContain('Method: GTL usage 2.0.');
    expect(methodBody({ ...base, method: PACE }, DEFAULT_FILTERS, 'Full PPR')).toContain('Method: GTL statistical pace 1.1.');
    for (const file of FANTASY) expect(code(file), file).not.toMatch(/GTL usage|statistical pace|['"`]2\.0['"`]|['"`]1\.1['"`]/);
    expect(JSON.stringify(reportModel(review, DEFAULT_FILTERS, 'Full PPR'))).not.toMatch(/GTL usage|statistical pace|usage 2\.0|pace 1\.1/); // a review names no method
  });
  it('the Fantasy chunk stays lazy: nothing the app loads first reaches the Fantasy screen except through import()', () => {
    const exts = ['', '.js', '.jsx', '.mjs', '/index.js'];
    const resolve = (from, spec) => exts.map(ext => path.join(path.dirname(from), spec) + ext).find(file => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile());
    const staticImports = file => [...read(file).matchAll(/^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)].map(m => m[1] ?? m[2]);
    const seen = new Set(), queue = ['web/src/next/NextApp.jsx'];
    while (queue.length) {
      const file = queue.pop();
      if (seen.has(file) || !/\.(m?js|jsx)$/.test(file)) { seen.add(file); continue; }
      seen.add(file);
      for (const spec of staticImports(file)) if (spec.startsWith('.')) { const next = resolve(file, spec); if (next) queue.push(path.normalize(next).replaceAll('\\', '/')); }
    }
    for (const lazy of ['web/src/next/fantasy/FantasyScreen.jsx', 'web/src/next/fantasy/FantasyNest.jsx', 'web/src/next/fantasy/FantasyReport.jsx', 'web/src/next/fantasy/fantasyReport.js', 'web/src/next/fantasy/fantasy.css']) {
      expect(seen.has(lazy), lazy).toBe(false);
    }
    expect(seen.has('web/src/next/fantasy/FantasyPage.jsx')).toBe(true);
    expect(read('web/src/next/fantasy/FantasyPage.jsx')).toMatch(/import\('\.\/FantasyScreen\.jsx'\)/);
  });
  it('every new-app Fantasy file parses', () => {
    for (const file of FANTASY) expect(() => code(file), file).not.toThrow();
  });
  it('the NBA status region stays mounted while games load and after', () => {
    const draw = props => renderToStaticMarkup(<div className="gx"><Games board={null} date="2026-11-04" timeZone="America/Los_Angeles" onDate={() => {}} onTrack={() => {}} refresh={() => {}} {...props}/></div>);
    for (const props of [{ loading: true }, { loading: false }, { loading: false, error: { status: 500, message: 'down' } }]) {
      expect(nodes(draw(props)).filter(n => n.tag === 'div' && n.attrs.role === 'status' && n.attrs['data-skeleton'] === undefined), JSON.stringify(props)).toHaveLength(1);
    }
  });
  it('one Fantasy title, "Fantasy Football", on every layer and while the code loads', () => {
    state.value = ready(USAGE);
    for (const view of SURFACES) expect(nodes(render(view)).filter(n => n.tag === 'h1').map(textOf), JSON.stringify(view)).toEqual(['Fantasy Football']);
    expect(nodes(renderToStaticMarkup(<div className="gx"><FantasyPage/></div>)).filter(n => n.tag === 'h1').map(textOf)).toEqual(['Fantasy Football']);
  });
});
