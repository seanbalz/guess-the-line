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
    for (const tool of [null, 'status', 'weeks', 'referees', 'results', 'odds']) {
      const html = render(<MenuSheet args={{ sub: 'commissioner', tool }}/>, false);
      expect(html).not.toContain('Commissioner tools');
      expect(html).toContain('Sign out');
    }
    // And the tools themselves refuse without the grant.
    const html = render(<CommissionerTools tool="results"/>, false);
    expect(html).toContain(COMMISSIONER_COPY.only);
    expect(html).not.toContain('Final scores');
  });

  it('the hub lists the five tools with accessible markup', () => {
    const html = render(<CommissionerTools/>, true);
    expect(markupProblems(html)).toEqual([]);
    for (const tool of COMMISSIONER_COPY.tools) expect(html).toContain(tool.label);
    expect(COMMISSIONER_COPY.tools.map(tool => tool.id)).toEqual(['status', 'weeks', 'referees', 'results', 'odds']);
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

  it('reuse the old Final scores and Odds connection editors only through LegacyTools.jsx', () => {
    const adapter = read('web/src/next/me/commissioner/LegacyTools.jsx');
    expect(adapter).toMatch(/import ManualOddsControls from '\.\.\/\.\.\/\.\.\/ManualOddsControls\.jsx'/);
    expect(adapter).toMatch(/import ResultReviewControls from '\.\.\/\.\.\/\.\.\/ResultReviewControls\.jsx'/);
    expect(adapter).toContain('gx-live-workflow');
    expect(read('web/src/next/me/commissioner/CommissionerTools.jsx')).not.toMatch(/ResultReviewControls|ManualOddsControls|marketStatus/);
    expect(read('docs/ALL_TABS_LIVE_WORKFLOWS.md')).toContain('LegacyTools.jsx');
  });

  it('load only when the commissioner opens them', () => {
    expect(read('web/src/next/me/MenuSheet.jsx')).toMatch(/const Commissioner = lazy\(\(\) => import\('\.\/commissioner\/CommissionerTools\.jsx'\)/);
  });
});
