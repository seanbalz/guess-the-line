// Menu › Commissioner tools (web/src/next/me/commissioner/, D-65 follow-up): the Community commissioner alone sees the
// Menu row and the tools; a player sees neither, even at the tools' address. The tools call the old screens' gtl-api routes
// and no others, and the two old editors are reused only through LegacyTools.jsx. Fixture accounts only; gtl-api and the
// database decide who may save (tests/cloud-browser/next-commissioner.spec.js drives the real handler).
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems } from './helpers/ui-markup.mjs';

const shellState = { communityAdmin: false };
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(() => new Promise(() => {})), communityApi: vi.fn(() => new Promise(() => {})), officialsApi: vi.fn(() => new Promise(() => {})) }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({
  useAppData: () => ({ accountId: 'fixture-sean', community: { status: 'ready', data: { week: { season: 2026, week: 8 } } }, refresh: vi.fn(), requestSignIn: vi.fn() }),
}));
vi.mock('../web/src/next/shell/context.js', () => ({
  useShell: () => ({ ...shellState, you: { id: 'fixture-sean', name: 'Sean Fixture', email: 'sean@example.test' }, setSheetArgs: vi.fn(), closeSheet: vi.fn(), openPage: vi.fn(), signOut: vi.fn(), setDirty: vi.fn(), confirmLeave: () => true }),
}));
vi.mock('../web/src/Theme.jsx', () => ({ useThemePreference: () => null }));
vi.mock('../web/src/dashboardPreferences.js', () => ({ useDashboardPreferences: () => [{ motion: 'system' }, vi.fn(), { storageAvailable: true }] }));
vi.mock('../web/src/trendsLoaders.js', () => ({ rememberOfficial: vi.fn() }));
vi.mock('../web/src/next/lines/trendsHooks.js', () => ({ useTrendWeek: () => ({ status: 'loading', week: null, retry: vi.fn() }) }));
const { MenuSheet } = await import('../web/src/next/me/MenuSheet.jsx');
const { CommissionerTools, COMMISSIONER_COPY } = await import('../web/src/next/me/commissioner/CommissionerTools.jsx');

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const render = (node, admin) => { shellState.communityAdmin = admin; return renderToStaticMarkup(<div className="gx">{node}</div>); };
const routes = text => [...text.matchAll(/(?:cloudApi|communityApi|officialsApi)\(\s*'([^']+)'/g)].map(m => m[1]).sort();

describe('Menu › Commissioner tools visibility', () => {
  it('only the Community commissioner sees the Menu row', () => {
    expect(render(<MenuSheet args={{}}/>, true)).toContain('Commissioner tools');
    expect(render(<MenuSheet args={{}}/>, false)).not.toContain('Commissioner tools');
  });

  it('a player who reaches the tools’ address gets the ordinary Menu, never a tool', () => {
    for (const tool of [null, 'status', 'weeks', 'referees', 'results', 'odds', 'epl-corrections']) {
      const html = render(<MenuSheet args={{ sub: 'commissioner', tool }}/>, false);
      expect(html).not.toContain('Commissioner tools');
      expect(html).toContain('Sign out');
    }
    // And the tools themselves refuse without the grant.
    const html = render(<CommissionerTools tool="results"/>, false);
    expect(html).toContain(COMMISSIONER_COPY.only);
    expect(html).not.toContain('Final scores');
  });

  it('the hub lists the six tools with accessible markup', () => {
    const html = render(<CommissionerTools/>, true);
    expect(markupProblems(html)).toEqual([]);
    for (const tool of COMMISSIONER_COPY.tools) expect(html).toContain(tool.label);
    expect(COMMISSIONER_COPY.tools.map(tool => tool.id)).toEqual(['status', 'weeks', 'referees', 'results', 'odds', 'epl-corrections']);
  });

  it('each tool opens as its own sub-view with a way back to the tools', () => {
    for (const tool of COMMISSIONER_COPY.tools) {
      const html = render(<CommissionerTools tool={tool.id}/>, true);
      expect(markupProblems(html)).toEqual([]);
      expect(html).toContain(`data-commissioner-tool="${tool.id}"`);
      expect(html).toContain(tool.label);
      expect(html).toContain(COMMISSIONER_COPY.title);
    }
    // Week opening and referees start from the published Community week.
    expect(render(<CommissionerTools tool="weeks"/>, true)).toMatch(/value="9"/);
    expect(render(<CommissionerTools tool="referees"/>, true)).toContain('Week 8');
  });
});

describe('Commissioner tools routes and adapter', () => {
  it('call the old screens’ gtl-api routes and no others', () => {
    expect(routes(read('web/src/next/me/commissioner/CommissionerTools.jsx'))).toEqual(
      ['read', 'set', 'state', 'virtual-units', 'virtual-units/settle', 'week-open']);
    // run(action) sends 'publish-preview' and 'publish' through communityApi, as the old PublishWeek did.
    for (const call of ["run('publish-preview')", "run('publish')", 'communityApi(action,']) expect(read('web/src/next/me/commissioner/CommissionerTools.jsx')).toContain(call);
    expect(routes(read('web/src/ResultReviewControls.jsx'))).toEqual(['results/review']);
    expect(read('web/src/ManualOddsControls.jsx')).toContain('cloudApi(`odds/${operation}`');
  });

  it('reuse the old Final scores editor only through LegacyTools.jsx; Odds connection is native (stage 78)', () => {
    const adapter = read('web/src/next/me/commissioner/LegacyTools.jsx');
    expect(adapter).toMatch(/import ResultReviewControls from '\.\.\/\.\.\/\.\.\/ResultReviewControls\.jsx'/);
    expect(adapter).toContain('gx-live-workflow');
    expect(adapter).not.toMatch(/ManualOddsControls/);
    expect(read('web/src/next/me/commissioner/CommissionerTools.jsx')).not.toMatch(/ResultReviewControls|ManualOddsControls|marketStatus/);
    const odds = read('web/src/next/me/commissioner/OddsConnection.jsx');
    expect(odds).not.toMatch(/from '[^']*(ManualOddsControls|lucide-react)[^']*'|className="[^"]*gx-live-workflow/);
    expect(odds).toContain('cloudApi(`odds/${operation}`, { requestId: requests.current[operation] })');
    expect(read('docs/ALL_TABS_LIVE_WORKFLOWS.md')).toContain('LegacyTools.jsx');
  });

  it('load only when the commissioner opens them', () => {
    expect(read('web/src/next/me/MenuSheet.jsx')).toMatch(/const Commissioner = lazy\(\(\) => import\('\.\/commissioner\/CommissionerTools\.jsx'\)/);
  });
});

// Quick wins A9 and A23 (November 4, 2026). A9: no two rows on one Menu screen share a glyph (Profile and Settings were both
// the pencil; Odds connection and EPL stat corrections both the chart), and each glyph comes from the shared destination
// map. A23: Appearance no longer says the old app shares its setting (false since D-65 removed it), and the tools hub
// opens on its rows, without the "Commissioner only" sentence on the surface (the Menu row is already commissioner-only).
const { DESTINATION_ICONS, icons } = await import('../web/src/next/ui/index.js');
const { parseMarkup, walk } = await import('./helpers/ui-markup.mjs');
describe('Menu and Commissioner tools rows (quick wins A9, A23)', () => {
  const glyphs = html => [...walk(parseMarkup(html))].filter(n => n.tag === 'button' && n.attrs?.class?.split(' ').includes('gx-link-row')).map(row => {
    const svg = [...walk(row)].find(n => n.tag === 'svg');
    const words = [...walk(row)].filter(n => n.text !== undefined).map(n => n.text).join('').trim();
    return [words, svg.attrs.class.split(' ').find(c => c.startsWith('lucide-'))];
  });
  const kebab = name => `lucide-${icons[DESTINATION_ICONS[name]].displayName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
  const repeated = list => list.filter(([, glyph], i) => list.findIndex(([, other]) => other === glyph) !== i);

  it('the commissioner’s full Menu, Pick reminders included, uses each glyph once, from the map', () => {
    shellState.pushConfigured = true;
    const rows = glyphs(render(<MenuSheet args={{}}/>, true));
    delete shellState.pushConfigured;
    expect(rows.map(([words]) => words)).toEqual(['Community members', 'Commissioner tools', 'Profile', 'History', 'Export my data', 'Settings · sportsbooks and guidance', 'Pick reminders', 'Guidance and sources', 'Appearance']);
    expect(repeated(rows)).toEqual([]);
    expect(rows.map(([, glyph]) => glyph)).toEqual(['members', 'commissioner', 'profile', 'history', 'export', 'settings', 'reminders', 'guidance', 'appearance'].map(kebab));
  });

  it('the tools hub uses each glyph once and opens on its rows', () => {
    const html = render(<CommissionerTools/>, true);
    const rows = glyphs(html);
    expect(rows.map(([words]) => words)).toEqual(COMMISSIONER_COPY.tools.map(tool => tool.label));
    expect(repeated(rows)).toEqual([]);
    expect(html).not.toContain('Each tool checks your access');
    expect(html).not.toContain('Commissioner only');
  });

  it('Appearance says the setting stays on this device, and nothing about an old app', () => {
    const html = render(<MenuSheet args={{ sub: 'appearance' }}/>, false);
    expect(html).toContain('Saved on this device, not your account.');
    expect(html).not.toMatch(/old app/i);
  });
});
