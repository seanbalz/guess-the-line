import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import trendsSeed from '../../cloud/trends-seed.mjs';
import { parseCsvRows, writeCompactCsv } from '../../shared/trends.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, sendBallot, signIn, storeBookLines } from './community-world.mjs';
import { createOpenMeteoProvider } from '../../cloud/open-meteo.mjs';
import { windNextDue } from '../../cloud/wind.mjs';
import { forecastFetch } from '../fixtures/open-meteo/build.mjs';
import { assertNoLeak, lineSecrets, pickSecrets } from '../helpers/leak-scan.mjs';
import { kickoffGroups, gamesOf } from '../../shared/lines-view.mjs';
import { randomUUID } from 'node:crypto';

// Redesign build plan stage 13 (with DASH-7's All trends sheet from stage 34): the read-only Lines tab and game sheet at
// 390 x 844 (section 4.1), on the real app (main.jsx, AuthGate, the lazy NextApp) and the real handler with every migration
// (ALL) on local PGlite. The fixture week uses four games of the committed 2026 Week 6 trends file. Luke has sent his Total
// picks (so his Total lines at the guess show) and keeps Spread drafts (so every Spread line is locked); Troy has sent both
// markets. Checked: the kickoff groups, the "YOU" tags, a lock is an icon and never "—", the game sheet and the All trends
// sheet open and close with Back, the top trends with their records and sample sizes, the D-45 weather chip on the board
// and the weather row in the sheet (closed with no digits, times in PT, the credit), the referee row, the 404 fallbacks,
// one /wind/read for the board and every sheet, no writes, the leak scan on
// the rendered page (its text and attributes), axe in Light and Dark, and the phone rules measured in CI's fallback font
// (ciFonts). D-47: the board reads the forecasts again at the next due point and never sooner (the browser clock jumps;
// the server's does not). Fictional accounts only; never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const TEAMS = { SEA: 'Seattle Seahawks', DEN: 'Denver Broncos', HOU: 'Houston Texans', JAX: 'Jacksonville Jaguars', NO: 'New Orleans Saints', NYG: 'New York Giants', WAS: 'Washington Commanders', SF: 'San Francisco 49ers' };
const GAMES = ['SEA-DEN', 'HOU-JAX', 'NO-NYG', 'WAS-SF'];
// These tests deliberately move Week 6's games to an open deadline today. Keep the historical
// source at Week 6 too: later scheduled weeks must not become fictitious unfinished prior games
// when the calendar advances. Real missing-final behavior has separate Trends service tests.
const WEEK6_SOURCE = writeCompactCsv(parseCsvRows(trendsSeed.seasonCsv).rows.filter(row => Number(row.week) <= 6));
/** The committed trends file is 2026 Week 6; the fixture week uses four of its games so the sheet has real trends. */
const week6 = state => {
  state.league.season = 2026; state.league.week = 6;
  state.games = GAMES.map((id, i) => {
    const [away, home] = id.split('-');
    return { ...state.games[i], id, away: TEAMS[away], home: TEAMS[home], awayCode: away, homeCode: home, matchup: `${TEAMS[away]} @ ${TEAMS[home]}` };
  });
};
// Book lines stored for the week (fixture values, never live odds). Every Spread line stays locked for Luke; his Totals are sent.
const LINES = { spread: { 'SEA-DEN': -1.5, 'HOU-JAX': 2.5, 'NO-NYG': -6.5, 'WAS-SF': 7.5 }, total: { 'SEA-DEN': 43.5, 'HOU-JAX': 41.5, 'NO-NYG': 40, 'WAS-SF': 48 } };
const LUKE_TOTALS = { 'SEA-DEN': 41, 'HOU-JAX': 44, 'NO-NYG': 39, 'WAS-SF': 47 };
const LUKE_SPREAD_DRAFT = { 'SEA-DEN': 4, 'HOU-JAX': -9 };
// A forged reply: a saved line under Luke's locked Spread draft, which the screen must never read.
const FORGED_SPREAD_LINE = 11.5;
// Denver's kickoff hour: rain likely (60%, 49.3 °F), so SEA @ DEN, the one fixture game with no board trend line, shows the
// D-45 chip "Rain likely"; 14.2 mph stays under the Windy line.
const VALUES = { '39.744': { wind_speed_10m: 14.2, wind_gusts_10m: 27.5, wind_direction_10m: 247, temperature_2m: 49.3, precipitation_probability: 60 } };

const tabBar = page => page.getByRole('navigation', { name: 'Main' });
const tab = (page, name) => tabBar(page).getByRole('button', { name: new RegExp(`^${name}(, .+)?$`) });
const title = (page, name) => page.getByRole('heading', { name, level: 1, exact: true });
const sheet = (page, name) => page.getByRole('dialog', { name, exact: true });
const card = (page, id) => page.locator(`.gx-l-card[data-game="${id}"]`);

async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
}

/**
 * The app's fonts never load here (the tests block Google Fonts), so the text falls back to the system font: DejaVu Sans
 * on the Ubuntu CI runner, often a narrower one (Inter) on a laptop. A label that fits in Inter can clip in DejaVu Sans
 * (it did: "SPREAD" in a fixed 56px box). Draw every font token in DejaVu Sans wherever it is installed, so a local run
 * measures what CI measures.
 */
async function ciFonts(page) {
  await page.evaluate(() => {
    if (document.getElementById('ci-fonts')) return;
    const style = document.createElement('style');
    style.id = 'ci-fonts';
    style.textContent = 'html .gx { --gx-font-body: "DejaVu Sans", sans-serif; --gx-font-num: "DejaVu Sans", sans-serif; --gx-font-display: "DejaVu Sans", sans-serif; }';
    document.head.append(style);
  });
}

/** Phone rules for everything under `root` (section 4.1): no side scroll, 44px targets, no text under 12px, nothing clipped. */
async function phoneChecks(page, root = '.gx') {
  await ciFonts(page);
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no side scroll').toBe(true);
  const report = await page.locator(root).first().evaluate(scope => {
    const visible = el => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && el.getClientRects().length > 0 && !el.closest('[inert], [hidden], dialog:not([open])'); };
    const targets = [...scope.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button]')].filter(visible)
      .map(el => { const r = el.getBoundingClientRect(); return { name: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w < 44 || r.h < 44);
    const small = [], clipped = [];
    for (const el of [scope, ...scope.querySelectorAll('*')]) {
      if (!visible(el) || el.closest('.gx-sr-only') || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 12) small.push(el.textContent.trim().slice(0, 40));
      if (!el.closest('.gx-truncate') && el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 40));
      const r = el.getBoundingClientRect();
      // Season tables intentionally scroll inside their named, focusable region;
      // their end-column reachability is checked separately below. The region
      // itself must still fit the viewport, and text cannot clip within a cell.
      const tableRegion = el.closest('.gx-tc-table-wrap[role="region"]');
      const scrolls = tableRegion && el !== tableRegion && getComputedStyle(tableRegion).overflowX === 'auto';
      if (!scrolls && (r.right > innerWidth + 0.5 || r.left < -0.5)) clipped.push(`off screen: ${el.textContent.trim().slice(0, 40)}`);
    }
    return { targets, small, clipped };
  });
  expect(report).toEqual({ targets: [], small: [], clipped: [] });
}

async function axe(page) {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return result.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target.join(' ')).join(', ')}`);
}

/** Every gtl-api call from now on, as "METHOD /route". */
function apiCalls(page) {
  const calls = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === SUPABASE && url.pathname.startsWith('/functions/v1/gtl-api/')) calls.push(`${request.method()} ${url.pathname.replace('/functions/v1/gtl-api', '')}`);
  });
  return calls;
}
const READS = ['POST /personal/read', 'POST /community/picks', 'POST /lines/read', 'POST /lines/game', 'POST /trends/week', 'GET /lobby', 'POST /community/read', 'GET /personal', 'POST /wind/read', 'POST /officials/read', 'POST /personal/notes', 'POST /lines/research', 'POST /lines/teams',
  // D-60: sign-in lands on Home first, which reads the account's preferences and its tracked-ticket summary, and (stage 71)
  // its recap row's badges and awards.
  'POST /me/preferences', 'POST /social/read', 'POST /league/features'];

/**
 * A synthetic /lines/research reader for the games in `withResearch`: two consistent Total candidates for each open
 * Total there, nothing for any other game. Fixture evidence through the real authenticated handler; never real research.
 */
function syntheticResearch(withResearch) {
  const calls = [];
  const read = async ({ board, gameId, period = 'recent30' }) => {
    calls.push({ gameId, period });
    const games = board.games.filter(g => !gameId || g.id === gameId), open = games.filter(g => g.total.visible && withResearch.includes(g.id));
    const record = { wins: 20, losses: 9, pushes: 1, sample: 30, decisive: 29, hitRate: 20 / 29, illustrativeUnits: 9.18, actualUnits: null,
      priceCoverage: { priced: 0, total: 30, complete: false }, coverage: { from: '2025-09-01T00:00:00Z', to: '2026-10-12T00:00:00Z' }, exclusions: {} };
    const candidates = open.length ? ['A', 'B'].map(name => ({ id: `synthetic-${name.toLowerCase()}`, title: `Synthetic matchup pattern ${name}`, version: 1, market: 'total', family: 'schedule', period,
      sourceState: 'computed', conditions: ['Synthetic schedule condition'], conditionDescriptions: ['Synthetic schedule condition'], qualification: { qualifies: true, label: 'Consistent, not proven', reasons: [] },
      record, applications: open.map(g => ({ gameId: g.id, direction: 'over', whyApplies: ['Synthetic schedule'] })), registeredAt: '2026-10-12T00:00:00Z',
      series: { points: [{ ...record, from: record.coverage.from, to: record.coverage.to }], binned: true, selectedSample: 30 } })) : [];
    const shortlist = candidates.map(c => c.id);
    return { version: 'synthetic-game-sheet-v1', now: new Date().toISOString(), season: board.season, week: board.week, shortlist, candidates, explore: shortlist,
      history: { status: 'fresh', snapshotAsOf: '2026-10-12T00:00:00Z', periodAnchor: '2026-10-12T00:00:00Z' }, sources: [], trent: { id: 'bookitwithtrent', name: 'Book It With Trent', status: 'unavailable', checkedAt: null, plays: [] },
      filters: { families: ['schedule'] }, games: games.map(g => ({ id: g.id, kickoff: g.kickoff, spread: { visible: false }, total: { visible: false } })) };
  };
  return { read, calls };
}

/** The world: Week 6 fixtures, Luke's sent Totals and Spread drafts, Troy's sent ballots, a stored collection and a wind stand-in. */
async function lukesWeek(page, baseURL, { forge = true, research, clock, optionalRpc = false } = {}) {
  const fake = forecastFetch(point => ({ values: () => VALUES[point.latitude.toFixed(3)] ?? {} }));
  const world = await communityWorld(page, baseURL, { migrations: ALL, games: GAMES.length, prepare: week6, clock, optionalRpc, trendsReadSeason: async () => WEEK6_SOURCE, wind: createOpenMeteoProvider({ fetchImpl: fake.fetchImpl }), research });
  await storeBookLines(world, LINES);
  await sendBallot(world, 'luke', 'guess_total', LUKE_TOTALS);
  const workspace = await world.api('luke', 'personal');
  const draft = await world.api('luke', 'personal/ballot', { season: 2026, week: 6, mode: 'guess_spread', picks: LUKE_SPREAD_DRAFT, submit: false,
    revision: workspace.body.revision, weeklyRevision: workspace.body.weeklyRevision, requestId: randomUUID() });
  expect(draft.status).toBe(200);
  if (forge) {
    // A reply that wrongly carried a saved line under the locked Spread draft: the screen still never shows it.
    await page.route(url => url.origin === SUPABASE && url.pathname === '/functions/v1/gtl-api/personal', async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers() }));
      const body = await response.json();
      if (body.ballots?.guess_spread) body.ballots.guess_spread = { ...body.ballots.guess_spread, scoringReferences: { 'SEA-DEN': { basis: 'line_at_guess', status: 'available', value: FORGED_SPREAD_LINE, source: 'fixture' } } };
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(body) });
    });
  }
  return { world, fake };
}

async function openLines(page) {
  await signIn(page, 'luke');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await page.goto('about:blank');
  await page.goto('/#lines');
  await expect(title(page, 'Lines')).toBeVisible();
  await expect(card(page, 'SEA-DEN')).toBeVisible();
}

const halves = map => Object.fromEntries(Object.entries(map).filter(([, value]) => !Number.isInteger(value)));
/** The leak scan (tests/helpers/leak-scan.mjs) on the rendered page: no other player's pick and no locked line. */
async function noLeak(page, world, where) {
  // Troy's sent picks (the fixture's half-point ones; whole numbers collide with counts), every locked Spread line and the forged one.
  const secrets = [
    ...pickSecrets(halves(world.troyPicks.guess_spread), { market: 'spread', owner: 'troy' }), ...pickSecrets(halves(world.troyPicks.guess_total), { market: 'total', owner: 'troy' }),
    ...lineSecrets(LINES.spread, { market: 'spread' }), { value: FORGED_SPREAD_LINE, kind: 'line', market: 'spread', label: 'forged locked Spread line' },
  ];
  expect(secrets.length).toBeGreaterThan(5);
  // What a viewer or a screen reader can reach: the text and every attribute (aria-label, title, data-*, href, ...), but
  // not an svg's drawing data or the layout's own style and class values, which are not content.
  const { text, attributes } = await page.evaluate(() => ({
    text: document.body.innerText,
    attributes: [...document.body.querySelectorAll('*')].flatMap(el => [...el.attributes]
      .filter(a => (el.closest('svg') ? a.name === 'aria-label' : a.name !== 'style' && a.name !== 'class'))
      .map(a => `${a.name}=${a.value}`)),
  }));
  expect(attributes.some(a => a.startsWith('aria-label=')), 'the scan reads attributes').toBe(true);
  assertNoLeak({ text, attributes }, { viewer: ACCOUNTS.luke.id, secrets }, where);
}

test.beforeEach(() => { test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'); });

test('season records stay readable on narrow phones and every column is reachable without changing the chart', async ({ page, baseURL }, info) => {
  test.setTimeout(120000);
  const { world } = await lukesWeek(page, baseURL);
  let replaced = 0;
  try {
    // Synthetic wide season records exercise presentation, not historical results.
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/trends/week'), async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.json();
      const replace = value => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value.perSeason)) {
          value.perSeason = [[2024,272,155,115,2,25.9],[2025,272,115,155,2,-50.5]];
          value.seasonsPos = 1; value.seasonsBet = 2; replaced++;
        }
        Object.values(value).forEach(replace);
      };
      replace(body);
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(body) });
    });
    const calls = apiCalls(page);
    await openLines(page); await card(page, 'HOU-JAX').click();
    const trend = sheet(page, 'HOU @ JAX').locator('[data-trend-detail]').first();
    await trend.getByRole('button', { name: 'By season', exact: true }).click();
    const name = await trend.locator('h4').innerText();
    const table = trend.locator('.gx-tc-table'), region = trend.locator('.gx-tc-table-wrap');
    const reads = calls.filter(c => c === 'POST /trends/week').length;
    const season = trend.getByRole('button', { name: 'Show 2024 season on chart', exact: true });
    for (const { width, scale } of [{ width: 320, scale: 1 }, { width: 390, scale: 1 }, { width: 320, scale: 2 }]) for (const theme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ forcedColors, colorScheme: theme });
      await page.evaluate(theme => { localStorage.setItem('gtl.theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: theme })); }, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await ciFonts(page);
      // Simulate 200% table-text enlargement without changing the viewport or product data.
      await page.evaluate(scale => {
        let style = document.getElementById('season-text-size');
        if (!style) { style = document.createElement('style'); style.id = 'season-text-size'; document.head.append(style); }
        style.textContent = scale === 2 ? '.gx .gx-tc-table tbody td, .gx .gx-tc-table tbody th, .gx .gx-tc-season-pick { font-size: 32px; line-height: 40px; } .gx .gx-tc-table thead th { font-size: 26px; line-height: 36px; }' : '';
      }, scale);
      await expect(table.locator('tbody td').first()).toHaveCSS('font-size', `${16 * scale}px`);
      await expect(region).toHaveRole('region');
      await expect(region).toHaveAccessibleName(`Season results · ${name}`);
      await expect(region).toHaveAttribute('tabindex', '0');
      const selectedBefore = await trend.getByRole('slider', { name: 'Move across the seasons' }).inputValue();
      await region.evaluate(el => { el.scrollLeft = 0; });
      await region.focus(); await expect(region).toBeFocused();
      const wide = await region.evaluate(el => el.scrollWidth > el.clientWidth);
      if (scale === 2) expect(wide).toBe(true);
      if (wide) {
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      }
      await region.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      await expect(region).toBeFocused();
      await expect(trend.getByRole('slider', { name: 'Move across the seasons' })).toHaveValue(selectedBefore);
      const last = table.locator('tbody tr').first().locator('td').last();
      await expect(last).toHaveText('+25.9');
      expect(await last.evaluate(el => el.getBoundingClientRect().right <= el.closest('.gx-tc-table-wrap').getBoundingClientRect().right + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await axe(page)).toEqual([]);
      await region.screenshot({ path: info.outputPath(`season-table-${width}-${theme}-${forcedColors}-${scale}x-end.png`) });
      await season.click(); await expect(season).toBeFocused();
      await expect(season).toHaveAttribute('aria-pressed', 'true');
      await expect(trend.getByRole('slider', { name: 'Move across the seasons' })).toHaveValue('0');
      await expect(trend.locator('.gx-tc-tip-value')).toHaveText('+25.9 U');
      await region.screenshot({ path: info.outputPath(`season-table-${width}-${theme}-${forcedColors}-${scale}x-start.png`) });
    }
    expect(replaced).toBeGreaterThan(0);
    expect(calls.filter(c => c === 'POST /trends/week')).toHaveLength(reads);
    expect(calls.filter(call => !READS.includes(call))).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('team season results and margin bars share selection without new reads or focus jumps', async ({ page, baseURL }, info) => {
  test.setTimeout(120000);
  const { world } = await lukesWeek(page, baseURL);
  try {
    const games = [
      { week: 1, opponent: 'SF', home: true, final: true, pf: 24, pa: 17, gameId: 'SF-SEA' },
      { week: 2, opponent: 'DEN', home: false, final: true, pf: 20, pa: 20, gameId: 'SEA-DEN' },
      { week: 3, opponent: 'NO', home: true, final: true, pf: null, pa: null, gameId: 'NO-SEA' },
      { week: 4, opponent: 'ARI', home: false, final: true, pf: 13, pa: 27, gameId: 'SEA-ARI' },
      { week: 5, opponent: 'WAS', home: true, final: false, pf: null, pa: null, gameId: 'WAS-SEA' },
    ];
    let throughWeek = 4;
    await page.route(`${SUPABASE}/functions/v1/gtl-api/lines/teams`, route => route.fulfill({ json: {
      season: 2026, throughWeek, updatedAt: '2026-10-01T00:00:00Z',
      teams: { SEA: { overall: { w: 1, l: 1, t: 1 }, home: { w: 1, l: 0, t: 0 }, road: { w: 0, l: 1, t: 1 }, pointsFor: 57, pointsAgainst: 64, games } },
    } }));
    await openLines(page);
    await card(page, 'SEA-DEN').click();
    await sheet(page, 'SEA @ DEN').getByRole('button', { name: /^Seattle Seahawks, .*Open team$/ }).click();
    const team = sheet(page, 'Seattle Seahawks'), range = team.getByRole('slider', { name: 'Move across the games' });
    const first = team.getByRole('button', { name: /^Show Week 1.*in margin chart$/ });
    const last = team.getByRole('button', { name: /^Show Week 4.*in margin chart$/ });
    // The view must not inherit the logo tile's 32px height/overflow clipping.
    const viewHeight = await team.locator('.gx-team-view').evaluate(el => el.getBoundingClientRect().height);
    expect(viewHeight).toBeGreaterThan(500);
    await expect(first).toBeVisible();
    await expect(last).toHaveAttribute('aria-pressed', 'true');
    await expect(team.getByRole('button', { name: /^Show Week (3|5).*in margin chart$/ })).toHaveCount(0);
    const calls = apiCalls(page);
    await first.focus(); await first.press('Enter');
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(range).toHaveValue('0');
    await expect(team.locator('.gx-team-readout-current')).toContainText('Week 1');
    expect(await first.getAttribute('aria-controls')).toBe(await team.locator('.gx-team-plot').getAttribute('id'));
    await range.focus(); await range.press('End');
    await expect(last).toHaveAttribute('aria-pressed', 'true');
    await expect(range).toBeFocused();
    await team.locator('.gx-team-plot').scrollIntoViewIfNeeded();
    const box = await team.locator('.gx-team-plot').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(range).toHaveValue('1');
    await expect(team.getByRole('button', { name: /^Show Week 2.*in margin chart$/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(team.locator('.gx-team-readout-current')).toContainText('Week 2 · T 20–20');
    for (const theme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.emulateMedia({ forcedColors, colorScheme: theme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 320, height: 844 });
      await phoneChecks(page, '.gx-team-sheet');
      await team.locator('.gx-team-chart').scrollIntoViewIfNeeded();
      await team.locator('.gx-team-chart').screenshot({ path: info.outputPath(`team-chart-${theme}-${forcedColors}.png`) });
      await team.locator('.gx-team-games').scrollIntoViewIfNeeded();
      await expect(first).toBeInViewport();
      await expect(last).toBeInViewport();
      expect(await axe(page)).toEqual([]);
      await team.locator('.gx-team-games').screenshot({ path: info.outputPath(`team-selection-${theme}-${forcedColors}.png`) });
    }
    expect(calls).toEqual([]);
    // A metadata-only refresh keeps selection; corrected game evidence resets it before paint.
    const second = team.getByRole('button', { name: /^Show Week 2.*in margin chart$/ });
    await second.focus();
    throughWeek = 5;
    await page.clock.setFixedTime(Date.now() + 11 * 60_000);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => calls.filter(call => call === 'POST /lines/teams').length).toBe(1);
    await expect(team.locator('.gx-team-record')).toContainText('Through Week 5');
    await expect(range).toHaveValue('1');
    games[0].pf = 31;
    await page.clock.setFixedTime(Date.now() + 22 * 60_000);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(range).toHaveValue('2');
    await expect(last).toHaveAttribute('aria-pressed', 'true');
    await expect(second).toBeFocused();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('team chart keeps its plot steady when enlarged game labels wrap', async ({ page, baseURL }, info) => {
  test.setTimeout(120000);
  const { world } = await lukesWeek(page, baseURL);
  try {
    await page.route(`${SUPABASE}/functions/v1/gtl-api/lines/teams`, route => route.fulfill({ json: {
      season: 2026, throughWeek: 4,
      teams: { SEA: { overall: { w: 1, l: 0, t: 1 }, games: [
        { week: 1, opponent: 'SF', home: true, final: true, pf: 0, pa: 0, gameId: 'SF-SEA' },
        { week: 4, opponent: 'LAR', home: false, final: true, pf: 70, pa: 3, gameId: 'SEA-LAR' },
      ] } },
    } }));
    await openLines(page);
    await card(page, 'SEA-DEN').click();
    await sheet(page, 'SEA @ DEN').getByRole('button', { name: /^Seattle Seahawks, .*Open team$/ }).click();
    const team = sheet(page, 'Seattle Seahawks'), chart = team.locator('.gx-team-chart');
    const range = team.getByRole('slider', { name: 'Move across the games' });
    // User text enlargement: keep the containing layout at phone width while doubling the readout's font and leading.
    await page.addStyleTag({ content: '.gx .gx-team-readout-value { font-size: 36px; line-height: 44px; } .gx .gx-team-readout .gx-t-meta { font-size: 26px; line-height: 36px; }' });
    for (const theme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.emulateMedia({ forcedColors, colorScheme: theme, reducedMotion: 'reduce' });
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        const positions = [];
        for (const key of ['Home', 'End']) {
          await range.focus(); await range.press(key);
          await expect(range).toBeFocused();
          const position = await chart.evaluate(el => {
            const top = el.getBoundingClientRect().top;
            return ['.gx-team-plot', '.gx-team-scrub'].map(selector => el.querySelector(selector).getBoundingClientRect().top - top);
          });
          positions.push(position);
        }
        expect(positions[0]).toEqual(positions[1]);
        await expect(team.locator('.gx-team-readout-current')).toContainText('Week 4');
        expect(await chart.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        if (width === 320) await chart.screenshot({ path: info.outputPath(`team-readout-${theme}-${forcedColors}.png`) });
      }
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('game details wait for opening and keep their frame, pager, close and explicit retry available during downloads', async ({ page, baseURL }, info) => {
  test.setTimeout(120000);
  const { world } = await lukesWeek(page, baseURL);
  let release, mode = 'hold', requests = 0, styles = 0;
  let waiting = new Promise(resolve => { release = resolve; });
  try {
    page.on('request', request => { if (/\/assets\/GameDetails-[^/]+\.css$/.test(request.url())) styles++; });
    await page.route('**/assets/GameDetails-*.js', async route => {
      requests++; if (mode === 'hold') await waiting;
      return mode === 'fail' ? route.abort('failed') : route.continue();
    });
    await openLines(page);
    expect([requests, styles]).toEqual([0, 0]);
    const calls = apiCalls(page), gameReads = () => calls.filter(call => call === 'POST /lines/game').length;
    const opener = card(page, 'SEA-DEN');
    await opener.click();
    const sea = sheet(page, 'SEA @ DEN'), hou = sheet(page, 'HOU @ JAX');
    await expect(sea.getByRole('status')).toHaveText('Loading game details…');
    await expect.poll(() => requests).toBe(1);
    expect(gameReads()).toBe(0);
    await sea.getByRole('button', { name: 'Next game, HOU @ JAX', exact: true }).click();
    await expect(hou.getByRole('status')).toHaveText('Loading game details…');
    expect(requests).toBe(1);
    await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
    const failed = page.waitForEvent('requestfailed', request => /\/assets\/GameDetails-[^/]+\.js$/.test(request.url()));
    mode = 'fail'; release(); await failed;
    await expect(hou).not.toBeVisible(); await expect(opener).toBeFocused();
    await opener.click();
    await expect(sea.getByRole('alert')).toContainText('Game details couldn’t load.');
    for (const theme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
      await page.evaluate(theme => { localStorage.setItem('gtl.theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: theme })); }, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.emulateMedia({ forcedColors, colorScheme: theme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 320, height: 844 });
      await phoneChecks(page, '.gx-l-sheet'); expect(await axe(page)).toEqual([]);
      await sea.screenshot({ path: info.outputPath(`game-download-error-${theme}-${forcedColors}.png`) });
    }
    mode = 'hold'; waiting = new Promise(resolve => { release = resolve; });
    await sea.getByRole('button', { name: 'Try game details again' }).click();
    await expect(sea.getByRole('status')).toHaveText('Loading game details…');
    await expect(sea.getByRole('group', { name: 'Game details', exact: true })).toBeFocused();
    for (const theme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
      await page.evaluate(theme => { localStorage.setItem('gtl.theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: theme })); }, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.emulateMedia({ forcedColors, colorScheme: theme, reducedMotion: 'reduce' });
      await phoneChecks(page, '.gx-l-sheet'); expect(await axe(page)).toEqual([]);
      await sea.screenshot({ path: info.outputPath(`game-download-loading-${theme}-${forcedColors}.png`) });
    }
    expect(gameReads()).toBe(0);
    mode = 'ready'; release();
    await expect(sea.getByRole('heading', { name: 'You on this game', exact: true })).toBeVisible();
    await expect(sea.getByRole('group', { name: 'Game details', exact: true })).toBeFocused();
    await expect.poll(gameReads).toBe(1);
    const loadedRequests = requests;
    await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
    await opener.click();
    await expect(sea.getByRole('heading', { name: 'You on this game', exact: true })).toBeVisible();
    expect(requests).toBe(loadedRequests); expect(styles).toBe(1);
    await noLeak(page, world, 'loaded game details'); expect(world.errors).toEqual([]);
  } finally { release(); await world.db.close(); }
});

test('game details recover a failed stylesheet before showing their market and research content', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL);
  let allowStyle = false, requests = 0;
  try {
    await page.route('**/assets/GameDetails-*.css', route => {
      requests++; return allowStyle ? route.continue() : route.abort('failed');
    });
    await openLines(page); await card(page, 'SEA-DEN').click();
    const game = sheet(page, 'SEA @ DEN');
    await expect(game.getByRole('alert')).toContainText('Game details couldn’t load.');
    await expect(game.getByRole('heading', { name: 'You on this game', exact: true })).toHaveCount(0);
    await game.getByRole('button', { name: 'Try game details again' }).click();
    await expect.poll(() => requests).toBe(2);
    await expect(game.getByRole('alert')).toContainText('Game details couldn’t load.');
    allowStyle = true;
    await game.getByRole('button', { name: 'Try game details again' }).click();
    await expect(game.getByRole('heading', { name: 'You on this game', exact: true })).toBeVisible();
    await expect(game.getByRole('group', { name: 'Game details', exact: true })).toBeFocused();
    await expect(game.locator('.gx-md-disclosure > summary').first()).toHaveCSS('display', 'flex');
    expect(requests).toBe(3); expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('weekly trends recover inside the game and All trends sheets without changing market gates or focus', async ({ page, baseURL }, info) => {
  test.setTimeout(120000);
  const { world } = await lukesWeek(page, baseURL);
  let mode = 'refused', requests = 0, release;
  const waiting = new Promise(resolve => { release = resolve; });
  try {
    await page.route(`${SUPABASE}/functions/v1/gtl-api/trends/week`, async route => {
      requests++; const chosen = mode;
      if (chosen === 'held') await waiting;
      if (chosen === 'refused' || chosen === 'unavailable') return route.fulfill({ status: chosen === 'refused' ? 403 : 503, json: { error: 'Fixture unavailable' } });
      const req = route.request();
      const reply = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      await route.fulfill({ status: reply.status, headers: Object.fromEntries(reply.headers), body: await reply.text() });
    });
    await openLines(page); await card(page, 'SEA-DEN').click();
    const game = sheet(page, 'SEA @ DEN');
    await expect(game.locator('[data-section="trends"]')).toContainText('Trends didn’t load.');
    const retry = game.getByRole('button', { name: 'Retry weekly trends', exact: true });
    await expect(retry).toBeVisible();
    for (const theme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
      await page.evaluate(theme => { localStorage.setItem('gtl.theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: theme })); }, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.emulateMedia({ forcedColors, colorScheme: theme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 320, height: 844 });
      await retry.scrollIntoViewIfNeeded();
      await phoneChecks(page, '.gx-l-sheet'); expect(await axe(page)).toEqual([]);
      await game.screenshot({ path: info.outputPath(`weekly-trend-game-error-${theme}-${forcedColors}.png`) });
    }
    const calls = apiCalls(page), before = requests;
    mode = 'held'; await retry.click();
    const refresh = game.getByRole('button', { name: 'Refresh weekly trends', exact: true });
    await expect(refresh).toBeDisabled(); await expect(refresh).toBeFocused();
    await expect(game.locator('[data-section="trends"]').getByRole('status')).toHaveText('Loading trends…');
    await refresh.evaluate(button => { button.click(); button.click(); });
    await expect.poll(() => requests).toBe(before + 1);
    mode = 'ready'; release();
    await expect(game.getByRole('button', { name: /^All trends/ })).toBeVisible();
    await expect(refresh).toBeFocused(); expect(requests).toBe(before + 1);
    await game.getByRole('button', { name: /^All trends/ }).click();
    const all = sheet(page, 'All trends');
    await expect(all.getByRole('list', { name: 'Trend groups' })).toBeVisible();
    const allRefresh = all.getByRole('button', { name: 'Refresh weekly trends', exact: true });
    mode = 'unavailable'; await allRefresh.click();
    await expect(all.locator('[data-trend-availability]')).toContainText('Refresh unavailable');
    await expect(all.getByRole('list', { name: 'Trend groups' })).toBeVisible();
    await expect(allRefresh).toBeFocused();
    mode = 'refused'; await allRefresh.click();
    await expect(all.getByRole('status')).toContainText('Trends didn’t load.');
    await expect(all.getByRole('list', { name: 'Trend groups' })).toHaveCount(0);
    const allRetry = all.getByRole('button', { name: 'Retry weekly trends', exact: true });
    await expect(allRetry).toBeFocused();
    for (const theme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
      await page.evaluate(theme => { localStorage.setItem('gtl.theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: theme })); }, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.emulateMedia({ forcedColors, colorScheme: theme, reducedMotion: 'reduce' });
      await phoneChecks(page, '.gx-l-sheet'); expect(await axe(page)).toEqual([]);
      await all.screenshot({ path: info.outputPath(`weekly-trend-all-error-${theme}-${forcedColors}.png`) });
    }
    mode = 'ready'; await allRetry.click();
    await expect(all.getByRole('list', { name: 'Trend groups' })).toBeVisible();
    await expect(allRefresh).toBeFocused();
    await all.locator('[data-group="line"] button[aria-expanded]').first().click();
    await expect(all).toContainText('Spread line-based records');
    await noLeak(page, world, 'weekly trend retry');
    expect(calls.filter(call => call !== 'POST /trends/week')).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { release(); await world.db.close(); }
});

test('team details load only on opening; closing, failed download and explicit retry preserve navigation and reads', async ({ page, baseURL }, info) => {
  test.setTimeout(120000);
  const { world } = await lukesWeek(page, baseURL);
  let release, mode = 'hold', requests = 0, styleRequests = 0;
  let waiting = new Promise(resolve => { release = resolve; });
  const themePreference = async theme => {
    await page.evaluate(theme => {
      localStorage.setItem('gtl.theme', theme);
      window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: theme }));
    }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme-preference', theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  };
  try {
    page.on('request', request => { if (/\/assets\/TeamView-[^/]+\.css$/.test(request.url())) styleRequests += 1; });
    await page.route('**/assets/TeamView-*.js', async route => {
      requests += 1;
      if (mode === 'hold') await waiting;
      if (mode === 'fail') return route.abort('failed');
      return route.continue();
    });
    await openLines(page);
    await card(page, 'SEA-DEN').click();
    const game = sheet(page, 'SEA @ DEN');
    const opener = game.getByRole('button', { name: /^Seattle Seahawks, .*Open team$/ });
    await expect(opener).toBeVisible();
    expect(requests).toBe(0);
    expect(styleRequests).toBe(0);
    const calls = apiCalls(page);
    await opener.click();
    const team = sheet(page, 'Seattle Seahawks');
    await expect(team.getByRole('status')).toHaveText('Loading team record…');
    await expect.poll(() => requests).toBe(1);
    await expect(team.locator('.gx-team-view')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(game).toBeVisible();
    await expect(opener).toBeFocused();
    // A rejected download after closing cannot reopen the abandoned sheet.
    const failed = page.waitForEvent('requestfailed', request => /\/assets\/TeamView-[^/]+\.js$/.test(request.url()));
    mode = 'fail'; release(); await failed;
    await expect(team).not.toBeVisible(); await expect(opener).toBeFocused();
    await opener.click();
    await expect(team.getByRole('alert')).toContainText('Team details couldn’t load.');
    for (const theme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
      await themePreference(theme);
      await page.emulateMedia({ forcedColors, colorScheme: theme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 320, height: 844 });
      await phoneChecks(page, '.gx-team-sheet'); expect(await axe(page)).toEqual([]);
      await team.screenshot({ path: info.outputPath(`team-download-error-${theme}-${forcedColors}.png`) });
    }
    mode = 'hold'; waiting = new Promise(resolve => { release = resolve; });
    await team.getByRole('button', { name: 'Try team details again' }).click();
    await expect(team.getByRole('status')).toHaveText('Loading team record…');
    await expect(team.getByRole('group', { name: 'Team details' })).toBeFocused();
    for (const theme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
      await themePreference(theme);
      await page.emulateMedia({ forcedColors, colorScheme: theme, reducedMotion: 'reduce' });
      await phoneChecks(page, '.gx-team-sheet'); expect(await axe(page)).toEqual([]);
      await team.screenshot({ path: info.outputPath(`team-download-loading-${theme}-${forcedColors}.png`) });
    }
    mode = 'ready'; release();
    await expect(team.locator('.gx-team-view')).toBeVisible();
    await expect(team.getByRole('group', { name: 'Team details' })).toBeFocused();
    const loadedRequests = requests;
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(team.locator('.gx-team-view')).toBeVisible();
    expect(requests).toBe(loadedRequests);
    expect(styleRequests).toBe(1);
    expect(calls).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { release(); await world.db.close(); }
});

test('team detail retry recovers a failed stylesheet before displaying the view', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL);
  let allowStyle = false, styleRequests = 0;
  try {
    await page.route(`${SUPABASE}/functions/v1/gtl-api/lines/teams`, route => route.fulfill({ json: {
      season: 2026, throughWeek: 1, teams: { SEA: { overall: { w: 1, l: 0, t: 0 }, games: [
        { week: 1, opponent: 'SF', home: true, final: true, pf: 24, pa: 17, gameId: 'SF-SEA' },
      ] } },
    } }));
    await page.route('**/assets/TeamView-*.css', route => {
      styleRequests += 1; return allowStyle ? route.continue() : route.abort('failed');
    });
    await openLines(page); await card(page, 'SEA-DEN').click();
    await sheet(page, 'SEA @ DEN').getByRole('button', { name: /^Seattle Seahawks, .*Open team$/ }).click();
    const team = sheet(page, 'Seattle Seahawks');
    await expect(team.getByRole('alert')).toContainText('Team details couldn’t load.');
    await expect(team.locator('.gx-team-view')).toHaveCount(0);
    await team.getByRole('button', { name: 'Try team details again' }).click();
    await expect.poll(() => styleRequests).toBe(2);
    await expect(team.getByRole('alert')).toContainText('Team details couldn’t load.');
    await expect(team.locator('.gx-team-view')).toHaveCount(0);
    allowStyle = true;
    await team.getByRole('button', { name: 'Try team details again' }).click();
    await expect(team.locator('.gx-team-view')).toBeVisible();
    await expect(team.locator('.gx-team-svg')).toHaveCSS('display', 'block');
    expect(styleRequests).toBe(3);
    await expect(team.getByRole('group', { name: 'Team details' })).toBeFocused();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the board: kickoff groups, YOU tags, a lock icon on each closed market (never "—"), current permitted quotes, no writes', async ({ page, baseURL }) => {
  const { world, fake } = await lukesWeek(page, baseURL);
  try {
    const calls = apiCalls(page);
    await openLines(page);
    // The groups the shared view model names for the slate the server holds.
    const personal = (await world.api('luke', 'personal')).body;
    const expected = kickoffGroups(gamesOf(personal), { season: 2026, week: 6 }).map(g => g.label);
    await expect(page.locator('.gx-l-group > .gx-l-ghead h2')).toHaveText(expected);
    await expect(page.locator('.gx-l-card')).toHaveCount(GAMES.length);

    // SEA @ DEN: Luke's Spread draft SEA −4 sits on the Seattle row; his sent Total 41 on the Total row.
    const sea = card(page, 'SEA-DEN');
    await expect(sea.locator('.gx-l-tag1')).toHaveText('You−4');
    await expect(sea.locator('.gx-l-cfoot .gx-tag')).toHaveText('You41');
    // HOU @ JAX: the draft JAX −9 sits on the Jacksonville (home) row.
    await expect(card(page, 'HOU-JAX').locator('.gx-l-tag2')).toHaveText('You−9');
    // Every Spread is locked for Luke: an icon, never a dash or a number; his sent Totals show the current reader quotes.
    for (const id of GAMES) {
      const cell = card(page, id).locator('.gx-l-val');
      await expect(cell).toHaveAttribute('data-cell', 'locked');
      await expect(cell.locator('svg')).toHaveCount(1);
      expect((await cell.innerText()).trim()).toBe('');
      await expect(card(page, id).locator('.gx-l-cfoot [data-cell="line"] .gx-n-s')).toHaveText(String(LINES.total[id]));
    }
    for (const text of await page.locator('.gx-l-card [data-cell="locked"]').allInnerTexts()) expect(text).not.toContain('—');
    await expect(sea).toHaveAttribute('aria-label', /Spread line hidden\. Total 43\.5\. Current line\..*Your spread pick SEA −4\. Your total pick 41\./);
    // Board trends: at most three trend lines on the board; one chip per card at most (a trend line or a weather word).
    const chips = page.locator('.gx-l-trend[data-chip="trend"]');
    expect(await chips.count()).toBeLessThanOrEqual(3);
    for (const id of GAMES) expect(await card(page, id).locator('.gx-l-trend').count()).toBeLessThanOrEqual(1);
    await expect(card(page, 'NO-NYG').locator('.gx-l-trend')).toHaveText('Teams in the Saints’ spot covered 54% since 2002 · Not proven');
    // D-45: SEA @ DEN's one chip is the weather word from the stored forecast: no digits, no link, no trend diamond.
    await expect(sea.locator('[data-chip="weather"]')).toHaveText('Rain likely');
    await expect(sea.locator('[data-chip="weather"] svg, [data-chip="weather"] a')).toHaveCount(0);
    await expect(sea).toHaveAttribute('aria-label', /Kickoff weather: Rain likely\./);
    expect(await page.locator('[data-chip="weather"]').count()).toBe(1);
    // D-55: credits and the game-detail destination are behind the title's ⓘ.
    await page.getByRole('button', { name: 'About trends', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'About trends' })).toContainText('Open a game for market lines, book quotes and recorded line movement.');
    await expect(page.getByRole('dialog', { name: 'About trends' }).getByRole('link', { name: /nflverse/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'About trends' })).toBeHidden();
    await phoneChecks(page);
    await noLeak(page, world, 'the board');

    expect(calls.filter(call => call === 'POST /wind/read'), 'the board reads the week\'s forecasts once, for its chips, until the next due point').toHaveLength(1);
    expect(calls.filter(call => !READS.includes(call)), 'browsing writes nothing').toEqual([]);
    expect(fake.calls).toHaveLength(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the game sheet and the All trends sheet open and close with Back; trends in plain words; weather and referee rows', async ({ page, baseURL }) => {
  const { world, fake } = await lukesWeek(page, baseURL);
  try {
    // The commissioner assigns HOU @ JAX's referee; SEA @ DEN has none, so its row stays hidden.
    expect((await world.api('sean', 'officials/set', { season: 2026, week: 6, gameId: 'HOU-JAX', referee: 'Shawn Hochuli' })).status).toBe(200);
    const calls = apiCalls(page);
    await openLines(page);
    await card(page, 'SEA-DEN').click();
    const game = sheet(page, 'SEA @ DEN');
    await expect(game).toBeVisible();
    // D-62: the matchup as marks with each record, each team a button to its sheet, and one "Records through" line.
    // (Until this gtl-api serves /lines/teams, the bundled records stand in.)
    await expect(game).toContainText(/Records through Week \d+/);
    await expect(game.getByRole('button', { name: /^Seattle Seahawks, \d+–\d+(–\d+)?\. Open team$/ })).toBeVisible();
    await expect(game.getByRole('button', { name: /^Denver Broncos, \d+–\d+(–\d+)?\. Open team$/ })).toBeVisible();
    // You on this game: the draft and its lock; the sent Total and its line at the guess.
    const you = game.getByRole('list', { name: 'You on this game' });
    await expect(you.getByRole('listitem').nth(0)).toContainText('Draft SEA −4');
    await expect(you.getByRole('listitem').nth(0)).toContainText('Submit your Spread picks to see this line.');
    await expect(you.getByRole('listitem').nth(1)).toContainText('Submitted 41');
    await expect(you.getByRole('listitem').nth(1)).toContainText('Line at your guess 43.5');
    // Top trends: SEA @ DEN's strongest trend backs the underdog, so it stays locked with the Spread and shows no number.
    const top = game.getByRole('list', { name: 'Top trends for this game' }).getByRole('listitem');
    await expect(top).toHaveCount(1);
    await expect(top.first()).toHaveAttribute('data-trend', 'locked');
    await expect(top.first()).toContainText('Line-based trend');
    expect(await top.first().innerText()).not.toMatch(/\d/);

    // The weather row: closed by default with no digits; open, the values, times in PT and the Open-Meteo credit. The
    // sheet reuses the board's read (the old app's 5-minute cache): the provider was asked once.
    const weather = game.locator('[data-row="weather"]');
    await expect(weather.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    expect(await weather.getByRole('button').innerText()).not.toMatch(/\d/);
    expect(fake.calls).toHaveLength(1);
    await weather.getByRole('button').click();
    await expect(weather).toContainText('14.2 mph from the WSW');
    await expect(weather).toContainText(/kickoff \d{1,2}:\d{2} [AP]M PT\)/);
    await expect(weather).not.toContainText(' ET');
    await expect(weather.getByRole('link', { name: 'Weather data by Open-Meteo.com' })).toHaveAttribute('href', 'https://open-meteo.com/');
    await expect(game.locator('[data-row="referee"]')).toHaveCount(0);
    await phoneChecks(page);
    await noLeak(page, world, 'the SEA @ DEN sheet');

    // All trends opens over the game sheet; the phone's Back closes it and shows the game sheet again.
    await game.getByRole('button', { name: /^All trends/ }).click();
    const all = sheet(page, 'All trends');
    await expect(all).toBeVisible();
    await expect(game).toBeHidden();
    await expect(all.getByRole('button', { name: 'SEA @ DEN' })).toBeVisible();
    for (const group of ['team', 'situational', 'line', 'weather', 'referee']) await expect(all.locator(`[data-group="${group}"]`)).toHaveCount(1);
    await all.locator('[data-group="situational"]').getByRole('button').click();
    const situational = all.locator('[data-group="situational"] li[data-trend]');
    expect(await situational.count()).toBeGreaterThan(10);
    await expect(situational.nth(0)).toHaveAttribute('data-trend', 'locked');
    // D-55: each row shows its percent (or two-sided record) and sample size; opening it shows the rest.
    await expect(situational.nth(1).locator('.gx-tc-row-sub')).toContainText(/(\d+%|\d[\d,]*–\d[\d,]*(–\d[\d,]*)?) · \d[\d,]* games?/);
    await all.locator('[data-group="line"]').getByRole('button').click();
    await expect(all.locator('[data-group="line"]')).toContainText('Submit your Spread picks to see its Spread line-based records.');
    await expect(all.locator('[data-group="referee"] button')).toContainText('Not assigned yet');
    await phoneChecks(page);
    await noLeak(page, world, 'All trends');
    await page.goBack();
    await expect(all).toBeHidden();
    await expect(game).toBeVisible();
    // The sheet's own back button does the same, and Escape then closes the game sheet.
    await game.getByRole('button', { name: /^All trends/ }).click();
    await expect(sheet(page, 'All trends')).toBeVisible();
    await sheet(page, 'All trends').getByRole('button', { name: 'SEA @ DEN' }).click();
    await expect(game).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(game).toBeHidden();
    await expect(title(page, 'Lines')).toBeVisible();

    // HOU @ JAX: the referee row with that referee's records; the wind read is shared, not repeated.
    await card(page, 'HOU-JAX').click();
    const london = sheet(page, 'HOU @ JAX');
    await expect(london).toBeVisible();
    await expect(london).toContainText('London');
    const referee = london.locator('[data-row="referee"]');
    await expect(referee.getByRole('button')).toContainText('Shawn Hochuli');
    await referee.getByRole('button').click();
    await expect(referee).toContainText('Set by the commissioner');
    await expect(referee.locator('li[data-trend]').first()).toContainText(/games/);
    // HOU @ JAX's top trend is a team trend that needs no line, with its record and sample size.
    const londonTop = london.getByRole('list', { name: 'Top trends for this game' }).getByRole('listitem');
    await expect(londonTop.first()).toContainText('Rarely covering this season · HOU');
    await expect(londonTop.first()).toContainText('444–364–22');
    await expect(londonTop.first()).toContainText('830 games');
    // D-55: the chart opens with the trend, and its plain sentence is in the trend's ⓘ.
    await expect(londonTop.first().locator('[data-trend-detail]')).toBeVisible();
    await londonTop.first().getByRole('button', { name: 'About this trend', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'About this trend' })).toContainText('Teams in the Texans’ spot covered 444 times and missed 364 since 2002.');
    await page.getByRole('dialog', { name: 'About this trend' }).getByRole('button', { name: 'Close', exact: true }).click();
    await page.goBack();
    await expect(london).toBeHidden();
    expect(calls.filter(call => call === 'POST /wind/read'), 'one wind read for the board and every sheet').toHaveLength(1);
    expect(calls.filter(call => !READS.includes(call)), 'browsing writes nothing').toEqual([]);
    expect(fake.calls).toHaveLength(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

// Sean, October 22 (iPhone): the game sheet showed the D-55 trend cards, then swapped them for "No qualifying research in
// this view" once /lines/research answered. The weekly trends are the section whatever research says; research for this
// game joins below them only when it has candidates, and the empty-state line never shows in the game sheet.
test('the game sheet keeps its weekly top trends after matchup research answers; research joins below only with candidates', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(60000); // Axe and the phone rules in both themes on the sheet with research, plus the real database/auth fixture.
  const research = syntheticResearch(['HOU-JAX']);
  const { world } = await lukesWeek(page, baseURL, { research });
  try {
    await openLines(page);
    const answer = gameId => page.waitForResponse(r => new URL(r.url()).pathname === '/functions/v1/gtl-api/lines/research' && r.request().postDataJSON()?.gameId === gameId);
    const noResearchLine = page.getByText(/No qualifying research/);

    // NO @ NYG: research answers 200 with nothing for this game.
    let answered = answer('NO-NYG');
    await card(page, 'NO-NYG').click();
    const nyg = sheet(page, 'NO @ NYG');
    const nygTrends = nyg.locator('[data-section="trends"]');
    const nygTop = nygTrends.getByRole('list', { name: 'Top trends for this game' });
    await expect(nygTop).toBeVisible();
    const reply = await answered;
    expect(reply.status()).toBe(200);
    expect((await reply.json()).shortlist).toEqual([]);
    // Wait until that answer is drawn, whichever way: the research wrapper says ready (the defect drew the empty-state line).
    await expect(nygTrends.locator('[data-research="ready"]').or(noResearchLine)).toBeVisible();
    await expect(noResearchLine).toHaveCount(0);
    await expect(nygTop).toBeVisible();
    await expect(nygTop.locator(':scope > li')).toHaveCount(3);
    await expect(nygTop.locator('[data-trend-detail]'), 'the first trend stays open with its chart').toHaveCount(1);
    await expect(nygTrends.locator('[data-research-card]')).toHaveCount(0);
    await expect(nygTrends.getByText('Matchup research', { exact: true })).toHaveCount(0);
    await expect(nygTrends.getByRole('button', { name: 'Open matchup research', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nyg).toBeHidden();

    // HOU @ JAX: research has two candidates for this game. They join below the same trends as compact rows.
    answered = answer('HOU-JAX');
    await card(page, 'HOU-JAX').click();
    const hou = sheet(page, 'HOU @ JAX');
    const houTrends = hou.locator('[data-section="trends"]');
    const houTop = houTrends.getByRole('list', { name: 'Top trends for this game' });
    expect((await (await answered).json()).shortlist).toEqual(['synthetic-a', 'synthetic-b']);
    const rows = houTrends.getByRole('list', { name: 'Research' }).locator('[data-research-card]');
    await expect(rows).toHaveCount(2);
    await expect(houTop).toBeVisible();
    await expect(houTop.locator(':scope > li').first()).toContainText('Rarely covering this season · HOU');
    await expect(houTrends.getByText('Matchup research', { exact: true })).toBeVisible();
    // D-55: one opened trend in view, the weekly one with its chart; the research rows stay closed until tapped.
    await expect(houTop.locator('[data-trend-detail]')).toHaveCount(1);
    await expect(houTrends.locator('[data-trend-detail]')).toHaveCount(1);
    await expect(rows.getByRole('button', { expanded: true })).toHaveCount(0);
    const top = async locator => (await locator.boundingBox()).y;
    const open = houTrends.getByRole('button', { name: 'Open matchup research', exact: true });
    expect(await top(houTop)).toBeLessThan(await top(rows.first()));
    expect(await top(rows.last())).toBeLessThan(await top(open));
    await expect(noResearchLine).toHaveCount(0);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      await phoneChecks(page);
      expect(await axe(page), `axe in ${theme}`).toEqual([]);
      // The whole section at 390 wide for review: a taller window, so the sheet holds it without scrolling.
      await page.setViewportSize({ width: 390, height: 1800 });
      await settle(page);
      await houTrends.screenshot({ path: testInfo.outputPath(`game-sheet-trends-research-390-${theme}.png`) });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await noLeak(page, world, 'the HOU @ JAX sheet with matchup research');
    // A research row opens in place, beside the weekly trends rather than instead of them.
    await rows.first().getByRole('button', { name: /^Synthetic matchup pattern A/ }).click();
    await expect(rows.first().locator('[data-trend-detail]')).toBeVisible();
    await expect(houTop.locator('[data-trend-detail]')).toBeVisible();
    expect(research.calls.map(call => call.gameId)).toEqual(expect.arrayContaining(['NO-NYG', 'HOU-JAX']));
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('D-47: the board reads the forecasts again at the next due point and never sooner; the server fetches nothing early', async ({ page, baseURL }) => {
  const { world, fake } = await lukesWeek(page, baseURL);
  try {
    // Fixture kickoffs follow the wall clock, so on some afternoons a 12 h checkpoint falls minutes after now. The week's
    // snapshots are fetched first and stamped 30 minutes ahead, so the next due point is always at least 30 minutes away
    // (the 2 h checkpoint of the earliest game is at least an hour away: the fixture deadline keeps a 3 h margin).
    expect((await world.api('troy', 'wind/read', { season: 2026, week: 6 })).body.refresh.outcome).toBe('fetched');
    await world.db.query("update public.gtl_wind_forecasts set fetched_at = fetched_at + interval '30 minutes'");
    const rows = (await world.db.query('select game_id, kickoff, max(fetched_at) fetched from public.gtl_wind_forecasts group by game_id, kickoff')).rows;
    expect(rows.map(r => r.game_id).sort()).toEqual([...GAMES].sort());
    // The earliest next due point by the server's rule (cloud/wind.mjs windNextDue): 24 h later, or a 12 h or 2 h checkpoint.
    const due = Math.min(...rows.map(r => windNextDue(r.kickoff.getTime(), r.fetched.getTime())));
    // The browser clock jumps ahead; supabase-js then refreshes the fixture session (1 h): hand back the same token, valid longer.
    await page.clock.install();
    const session = world.sessions[ACCOUNTS.luke.email];
    await page.route(url => url.origin === SUPABASE && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token',
      route => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json',
        body: JSON.stringify({ ...session, expires_in: 7 * 86_400, expires_at: Math.floor(Date.now() / 1000) + 7 * 86_400 }) }));
    const calls = apiCalls(page), answers = [];
    page.on('response', async response => { if (new URL(response.url()).pathname === '/functions/v1/gtl-api/wind/read') answers.push(await response.json()); });
    const reads = () => calls.filter(call => call === 'POST /wind/read').length;
    await openLines(page);
    await expect(card(page, 'SEA-DEN').locator('[data-chip="weather"]')).toHaveText('Rain likely');
    await expect.poll(() => answers.length).toBe(1);
    expect([reads(), answers[0].refresh.outcome]).toEqual([1, 'not_due']);
    const wait = due - Date.parse(answers[0].asOf);
    expect(wait).toBeGreaterThan(25 * 60_000);
    // Two minutes before it: the board has re-rendered on its ticks but asked nothing.
    await page.clock.fastForward(wait - 2 * 60_000);
    await page.waitForTimeout(1500);
    expect(reads(), 'no read before the due point').toBe(1);
    await expect(card(page, 'SEA-DEN').locator('[data-chip="weather"]')).toHaveText('Rain likely');
    // Past it: exactly one read. The server's own clock has not reached the due point, so it fetches nothing ('not_due').
    await page.clock.fastForward(3 * 60_000);
    await expect.poll(reads).toBe(2);
    await expect.poll(() => answers.length).toBe(2);
    expect(answers[1].refresh.outcome).toBe('not_due');
    // Never more often: that answer's next due point is the same server instant, far ahead again.
    await page.clock.fastForward(5 * 60_000);
    await page.waitForTimeout(1500);
    expect(reads(), 'one read per due point').toBe(2);
    expect(fake.calls).toHaveLength(1);
    expect(calls.filter(call => !READS.includes(call)), 'browsing writes nothing').toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a 404 from either route: the weather row says "No current forecast" (D-45) and the referee row hides; no error text', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL, { forge: false });
  try {
    expect((await world.api('sean', 'officials/set', { season: 2026, week: 6, gameId: 'SEA-DEN', referee: 'Shawn Hochuli' })).status).toBe(200);
    for (const route of ['wind/read', 'officials/read']) {
      await page.route(url => url.origin === SUPABASE && url.pathname === `/functions/v1/gtl-api/${route}`,
        r => r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: 'Not found.' }) }));
    }
    await openLines(page);
    await card(page, 'SEA-DEN').click();
    const game = sheet(page, 'SEA @ DEN');
    await expect(game).toBeVisible();
    await expect(game.getByRole('button', { name: /^All trends/ })).toBeVisible();
    await expect(game.locator('[data-row="weather"]')).toHaveText(/^Weather at kickoff\s*No current forecast$/);
    await expect(game.locator('[data-row="weather"] button, [data-row="weather"] a')).toHaveCount(0);
    await expect(game.locator('[data-row="referee"]')).toHaveCount(0);
    await expect(game).not.toContainText('Not found');
    await page.goBack();
    await expect(page.locator('[data-chip="weather"]'), 'no forecast, no board chip').toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('axe in Light and Dark at 390, 320 and 1440 on the board, the game sheet and All trends; 390 screenshots', async ({ page, baseURL }, testInfo) => {
  // Eighteen axe runs and phone checks (two themes, three widths, three screens), like next-data's axe sweep.
  test.setTimeout(120000);
  const { world } = await lukesWeek(page, baseURL);
  try {
    await openLines(page);
    const found = {};
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      await page.goto('about:blank');
      await page.goto('/#lines');
      await expect(card(page, 'SEA-DEN')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const width of [390, 320, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        // Each board audit starts at its heading; don't inherit the previous width's deep sheet/board scroll.
        await page.evaluate(() => window.scrollTo(0, 0));
        await phoneChecks(page);
        found[`board ${theme} ${width}`] = await axe(page);
        if (width === 390) await page.screenshot({ path: testInfo.outputPath(`next-lines-board-390-${theme}.png`), fullPage: true });
        await card(page, 'SEA-DEN').click();
        const game = sheet(page, 'SEA @ DEN');
        await expect(game).toBeVisible();
        await game.locator('[data-row="weather"]').getByRole('button').click();
        await phoneChecks(page);
        found[`sheet ${theme} ${width}`] = await axe(page);
        if (width === 390) await page.screenshot({ path: testInfo.outputPath(`next-lines-sheet-390-${theme}.png`) });
        await game.getByRole('button', { name: /^All trends/ }).click();
        const all = sheet(page, 'All trends');
        await expect(all).toBeVisible();
        await all.locator('[data-group="team"]').getByRole('button').click();
        await phoneChecks(page);
        found[`all trends ${theme} ${width}`] = await axe(page);
        if (width === 390) await page.screenshot({ path: testInfo.outputPath(`next-lines-all-trends-390-${theme}.png`) });
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await expect(title(page, 'Lines')).toBeVisible();
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    expect(found).toEqual(Object.fromEntries(Object.keys(found).map(key => [key, []])));
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('chart dragging stays on the nearest endpoint outside the plot and keyboard selection matches', async ({ page, baseURL }, testInfo) => {
  const { world } = await lukesWeek(page, baseURL);
  try {
    await openLines(page); await card(page, 'HOU-JAX').click();
    const trend = sheet(page, 'HOU @ JAX').locator('[data-trend-detail]').first();
    await expect(trend).toBeVisible();
    for (const seasons of [false, true]) {
      if (seasons) await trend.getByRole('button', { name: 'By season', exact: true }).click();
      const plot = trend.locator(seasons ? '.gx-tc-stems' : '.gx-tc-plot');
      const scrub = trend.getByRole('slider');
      await plot.scrollIntoViewIfNeeded();
      const box = await plot.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x - 25, box.y + box.height / 2, { steps: 5 });
      await expect(scrub).toHaveValue('0');
      const first = await scrub.getAttribute('aria-valuetext');
      await page.mouse.move(box.x + box.width + 25, box.y + box.height / 2, { steps: 5 });
      await expect(scrub).toHaveValue(await scrub.getAttribute('max'));
      const last = await scrub.getAttribute('aria-valuetext');
      await page.mouse.up();
      await scrub.focus(); await page.keyboard.press('Home');
      await expect(scrub).toHaveAttribute('aria-valuetext', first);
      await page.keyboard.press('End');
      await expect(scrub).toHaveAttribute('aria-valuetext', last);
      expect(world.errors).toEqual([]);
    }
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width: 320, height: 844 });
      await trend.scrollIntoViewIfNeeded();
      await phoneChecks(page);
      expect(await axe(page)).toEqual([]);
      for (const heading of ['Season', 'Record', 'Win rate', 'Units']) {
        await expect(trend.getByRole('columnheader', { name: heading, exact: true })).toBeVisible();
      }
      const rates = trend.locator('.gx-tc-table-rate');
      expect(await rates.count()).toBeGreaterThan(1);
      for (const rate of await rates.all()) await expect(rate).toHaveText(/^\d+(\.\d+)?%$/);
      const splitValues = await trend.locator('.gx-tc-tile-value, .gx-tc-table-rate, .gx-tc-table thead th, .gx-tc-table td:not(.gx-tc-table-bar)').evaluateAll(nodes => nodes.filter(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        const lines = new Set([...range.getClientRects()].map(rect => Math.round(rect.top)));
        return lines.size > 1 || node.scrollWidth > node.clientWidth + 1;
      }).map(node => node.textContent));
      expect(splitValues).toEqual([]);
      await trend.locator('.gx-tc-tiles').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`research-seasons-${theme}.png`) });
      await trend.locator('.gx-tc-table').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`research-season-table-${theme}.png`) });
    }
  } finally { await world.db.close(); }
});


test('season table selection stays in sync with the chart and survives view switching', async ({ page, baseURL }, testInfo) => {
  const { world } = await lukesWeek(page, baseURL);
  try {
    await openLines(page); await card(page, 'HOU-JAX').click();
    const trend = sheet(page, 'HOU @ JAX').locator('[data-trend-detail]').first();
    const lineScrub = trend.getByRole('slider', { name: 'Move along the line' });
    const trendTitle = await trend.locator('h4').innerText();
    await expect(lineScrub).toHaveAccessibleName(`Move along the line · ${trendTitle}`);
    await expect(trend.getByRole('group', { name: `Chart view · ${trendTitle}`, exact: true })).toBeVisible();
    await lineScrub.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
    const lineTip = await lineScrub.getAttribute('aria-valuetext');
    await trend.getByRole('button', { name: 'By season', exact: true }).click();
    const season = year => trend.getByRole('button', { name: `Show ${year} season on chart`, exact: true });
    const scrub = trend.getByRole('slider', { name: 'Move across the seasons' });
    await expect(scrub).toHaveAccessibleName(`Move across the seasons · ${trendTitle}`);
    await expect(season(2025)).toHaveAttribute('aria-pressed', 'true');
    await season(2024).click();
    await expect(season(2024)).toBeFocused();
    await expect(season(2024)).toHaveAttribute('aria-pressed', 'true');
    await expect(season(2025)).toHaveAttribute('aria-pressed', 'false');
    await expect(scrub).toHaveValue('6');
    await expect(scrub).toHaveAttribute('aria-valuetext', /2024:.*below break-even/);
    await expect(trend.locator('.gx-tc-tip-value')).toHaveText('−11.5 U');
    await expect(trend.locator('.gx-tc-col--on')).toHaveCount(1);
    const chartId = await season(2024).getAttribute('aria-controls');
    expect(await trend.locator('.gx-tc-seasons').getAttribute('id')).toBe(chartId);
    await trend.getByRole('button', { name: 'Since 2002', exact: true }).click();
    await expect(lineScrub).toHaveValue('1');
    await expect(lineScrub).toHaveAttribute('aria-valuetext', lineTip);
    await expect(trend.getByRole('button', { name: 'Since 2002', exact: true })).toBeFocused();
    await trend.getByRole('button', { name: 'By season', exact: true }).click();
    await expect(season(2024)).toHaveAttribute('aria-pressed', 'true');
    await expect(scrub).toHaveValue('6');
    await season(2019).focus(); await page.keyboard.press('Space');
    await expect(scrub).toHaveValue('1');
    await expect(season(2019)).toBeFocused();
    await scrub.focus(); await page.keyboard.press('Home');
    await expect(season(2018)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('End');
    await expect(season(2025)).toHaveAttribute('aria-pressed', 'true');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width: 320, height: 844 });
      await season(2024).click();
      await phoneChecks(page);
      expect(await axe(page)).toEqual([]);
      const table = trend.locator('.gx-tc-table');
      await table.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`selected-season-${theme}.png`) });
    }
    await trend.getByRole('button', { name: 'Since 2002', exact: true }).click();
    await expect(lineScrub).toHaveValue('1');
    const plot = trend.locator('.gx-tc-plot');
    await plot.scrollIntoViewIfNeeded();
    const box = await plot.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x, box.y + box.height / 2); await page.mouse.up();
    await expect(lineScrub).toHaveValue('0');
    await trend.getByRole('button', { name: 'By season', exact: true }).click();
    await expect(season(2024)).toHaveAttribute('aria-pressed', 'true');
    await trend.getByRole('button', { name: 'Since 2002', exact: true }).click();
    await expect(lineScrub).toHaveValue('0');
    await expect(trend.getByRole('slider')).toHaveCount(1); // The hidden view adds no extra controls.
    await sheet(page, 'HOU @ JAX').getByRole('button', { name: 'Close', exact: true }).click();
    await card(page, 'HOU-JAX').click();
    await expect(lineScrub).toHaveValue(await lineScrub.getAttribute('max')); // A newly opened detail starts fresh.
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('game market details preserve saved references, gate quotes and show recorded movement in both themes', async ({ page, baseURL }, testInfo) => {
  const { world } = await lukesWeek(page, baseURL);
  try {
    await storeBookLines(world, { ...LINES, total: { ...LINES.total, 'SEA-DEN': 45.5 } }, { capturedAt: Date.now() - 1000 });
    const calls = apiCalls(page);
    await openLines(page);
    expect(calls.filter(call => call === 'POST /lines/game')).toHaveLength(0);
    await card(page, 'SEA-DEN').click();
    const game = sheet(page, 'SEA @ DEN'), markets = game.getByRole('region', { name: 'Market lines', exact: true });
    await expect(markets).toContainText('Spread lines are locked');
    const total = markets.locator('[data-market-details="total"]');
    await expect(total).toContainText('Current line'); await expect(total).toContainText('45.5');
    await expect(game.getByRole('list', { name: 'You on this game' })).toContainText('Line at your guess 43.5');
    await total.locator('summary', { hasText: 'Book lines' }).click();
    await expect(total).toContainText('DraftKings'); await expect(total).toContainText('Best recorded');
    await total.getByLabel('Compare side').selectOption('under');
    await expect(total).toContainText('Under 45.5');
    await total.locator('summary', { hasText: 'Line movement' }).click();
    const slider = total.getByRole('slider', { name: 'Move along total movement' });
    await expect(slider).toHaveAttribute('aria-valuetext', /45.5,.*PT/);
    await slider.focus(); await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuetext', /43.5,.*PT/);
    await page.keyboard.press('End'); await expect(slider).toHaveAttribute('aria-valuetext', /45.5,.*PT/);
    await expect(total.getByRole('table')).toContainText('Collected (PT)');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width: 320, height: 844 });
      await phoneChecks(page); expect(await axe(page)).toEqual([]);
      await total.locator('.gx-md-movement').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`market-movement-${theme}.png`) });
    }
    await noLeak(page, world, 'market detail quotes and movement');
    expect(calls.filter(call => !READS.includes(call))).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('market details hide previous quotes on refresh failure and recover from the existing reader', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL);
  try {
    await openLines(page); await card(page, 'SEA-DEN').click();
    const markets = sheet(page, 'SEA @ DEN').getByRole('region', { name: 'Market lines', exact: true });
    await expect(markets.locator('[data-market-details="total"]')).toContainText('43.5');
    const matcher = url => url.origin === SUPABASE && url.pathname.endsWith('/lines/game');
    await page.route(matcher, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable' }) }));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(markets).toContainText('Market lines are unavailable');
    await expect(markets).not.toContainText('43.5');
    await page.unroute(matcher);
    await markets.getByRole('button', { name: 'Retry market lines' }).click();
    await expect(markets.locator('[data-market-details="total"]')).toContainText('43.5');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a delayed market reply for a closed sheet cannot populate a different game', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL);
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  try {
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/lines/game'), async route => {
      const request = route.request(), body = request.postDataJSON();
      const response = await world.handler(new Request(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() }));
      const payload = await response.text();
      if (body.gameId === 'SEA-DEN') await hold;
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: payload }).catch(() => {});
    });
    await openLines(page); await card(page, 'SEA-DEN').click();
    await expect(sheet(page, 'SEA @ DEN').getByRole('region', { name: 'Market lines', exact: true })).toContainText('Loading market lines');
    await page.keyboard.press('Escape');
    await card(page, 'HOU-JAX').click();
    const markets = sheet(page, 'HOU @ JAX').getByRole('region', { name: 'Market lines', exact: true });
    await expect(markets.locator('[data-market-details="total"]')).toContainText(String(LINES.total['HOU-JAX']));
    release();
    await expect(markets.locator('[data-market-details="total"]')).not.toContainText('43.5');
    expect(world.errors).toEqual([]);
  } finally { release(); await world.db.close(); }
});


test('switching accounts cannot restore a delayed market reply with the previous player’s access', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL);
  let release, held = false, holdNext = true;
  const hold = new Promise(resolve => { release = resolve; });
  try {
    await openLines(page);
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'troy', { navigate: false }); await page.goto('/#lines');
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/lines/game'), async route => {
      const request = route.request();
      const response = await world.handler(new Request(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() }));
      const payload = await response.text();
      if (holdNext) { holdNext = false; held = true; await hold; }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: payload }).catch(() => {});
    });
    await card(page, 'SEA-DEN').click(); await expect.poll(() => held).toBe(true);
    await sheet(page, 'SEA @ DEN').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'luke', { navigate: false }); await page.goto('/#lines');
    await card(page, 'SEA-DEN').click();
    const markets = sheet(page, 'SEA @ DEN').getByRole('region', { name: 'Market lines', exact: true });
    await expect(markets).toContainText('Spread lines are locked'); release();
    await expect(markets.locator('[data-market-details="spread"]')).toHaveCount(0);
    await noLeak(page, world, 'market lines after account switch');
    expect(world.errors).toEqual([]);
  } finally { release(); await world.db.close(); }
});


test('market freshness expires using server time without another odds read', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL);
  let reads = 0;
  try {
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/lines/game'), async route => {
      reads += 1;
      const request = route.request();
      const response = await world.handler(new Request(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() }));
      const body = await response.json();
      body.total.line.observedAt = new Date(Date.parse(body.now) - 6 * 3600000 + 2000).toISOString();
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(body) });
    });
    await openLines(page); await card(page, 'SEA-DEN').click();
    const total = sheet(page, 'SEA @ DEN').locator('[data-market-details="total"]');
    await expect(total).toContainText('Current line');
    // Deliberately wrong device wall clock must not extend freshness.
    await page.evaluate(() => { Date.now = () => 0; });
    await expect(total).toContainText('Latest recorded line', { timeout: 5000 });
    expect(reads).toBe(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the market board shows latest quotes separately from saved receipts and sends its gate to Play', async ({ page, baseURL }, testInfo) => {
  const { world } = await lukesWeek(page, baseURL);
  const bodies = [], replies = [];
  try {
    await storeBookLines(world, { ...LINES, total: { ...LINES.total, 'SEA-DEN': 45.5 } }, { capturedAt: Date.now() - 1000 });
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/lines/read'), async route => {
      const req = route.request(); bodies.push(req.postDataJSON());
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.json(); replies.push(body);
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(body) });
    });
    await openLines(page);
    const sea = card(page, 'SEA-DEN');
    await expect(sea).toContainText('45.5'); await expect(sea).not.toContainText('43.5');
    await expect(sea).toContainText('Current line');
    expect(bodies.every(body => body.season === 2026 && body.week === 6)).toBe(true);
    expect(replies.every(body => body.games.every(game => JSON.stringify(game.spread) === '{"visible":false}'))).toBe(true);
    await expect(page.locator('.gx-lock-card')).toHaveCount(1);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width: 320, height: 844 });
      await phoneChecks(page); expect(await axe(page)).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`market-board-${theme}.png`), fullPage: true });
    }
    await sea.click();
    await expect(sheet(page, 'SEA @ DEN')).toContainText('Line at your guess 43.5');
    await page.keyboard.press('Escape');
    const calls = apiCalls(page);
    await expect(page.getByRole('button', { name: 'See picks now', exact: true })).toHaveCount(0); // M-03 is absent in this fixture.
    await page.getByRole('button', { name: 'Finish Spread picks', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your guesses', exact: true })).toBeVisible();
    expect(calls.some(call => /opt-out|forfeit|ballot/.test(call))).toBe(false);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('recorded finals have their own section and result provenance while incomplete results stay started', async ({ page, baseURL }, info) => {
  const { world } = await lukesWeek(page, baseURL);
  let fail = false, finalHome = 7;
  try {
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/lines/read'), async route => {
      if (fail) return route.fulfill({ status: 503, json: { error: 'Fixture offline' } });
      const req = route.request(), response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.json();
      const now = Math.max(...body.games.map(g => Date.parse(g.kickoff))) + 3600000;
      body.now = new Date(now).toISOString();
      body.games.forEach(g => { g.started = true; });
      body.games[0].final = { status: 'final', away: 0, home: finalHome, origin: 'commissioner_reported', source: 'Fixture commissioner with a deliberately long result source name', observedAt: new Date(now - 60000).toISOString() };
      body.games[1].final = { status: 'final', away: null, home: 17 };
      body.games[2].final = { status: 'postponed', away: 10, home: 10 };
      await route.fulfill({ status: 200, json: body });
    });
    await openLines(page);
    const finals = page.getByRole('region', { name: 'Final · 1 game' });
    await expect(finals.locator('.gx-l-card')).toHaveCount(1);
    await expect(finals.locator('.gx-l-card')).toHaveAttribute('data-game', 'SEA-DEN');
    await expect(card(page, 'SEA-DEN')).toContainText('Final · SEA 0–DEN 7');
    await expect(card(page, 'SEA-DEN')).toContainText('Commissioner-reported result');
    await expect(card(page, 'SEA-DEN')).toContainText('Fixture commissioner');
    await expect(card(page, 'SEA-DEN')).toContainText('Observed');
    await expect(card(page, 'SEA-DEN')).toHaveAttribute('aria-label', /Final.*Commissioner-reported result.*Observed/);
    await expect(page.getByRole('region', { name: /Kickoff passed.*3 games/ }).locator('.gx-l-card')).toHaveCount(3);
    for (const id of GAMES) await expect(card(page, id).locator('[data-cell="locked"]')).toHaveCount(1);
    for (const theme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
      await page.evaluate(theme => { localStorage.setItem('gtl.theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: theme })); }, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme-preference', theme);
      await page.emulateMedia({ colorScheme: theme, forcedColors, reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 320, height: 844 }); await phoneChecks(page); expect(await axe(page)).toEqual([]);
      await finals.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`recorded-final-${theme}-${forcedColors}.png`) });
    }
    const displayedOrder = await page.locator('.gx-l-card').evaluateAll(cards => cards.map(card => card.dataset.game));
    expect(displayedOrder).toEqual(['HOU-JAX', 'NO-NYG', 'WAS-SF', 'SEA-DEN']);
    const resultReads = apiCalls(page);
    await card(page, 'SEA-DEN').click(); await expect(sheet(page, 'SEA @ DEN')).toBeVisible();
    const recorded = sheet(page, 'SEA @ DEN').getByRole('region', { name: 'Recorded result', exact: true });
    await expect(recorded).toContainText('Final · SEA 0–DEN 7');
    await expect(recorded).toContainText('Commissioner-reported result');
    await expect(recorded).toContainText('Recorded when opened');
    for (const theme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
      await page.evaluate(theme => { localStorage.setItem('gtl.theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: theme })); }, theme);
      await page.emulateMedia({ colorScheme: theme, forcedColors, reducedMotion: 'reduce' });
      await phoneChecks(page); expect(await axe(page)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`recorded-sheet-${theme}-${forcedColors}.png`) });
    }
    await expect(sheet(page, 'SEA @ DEN')).toContainText('4 of 4');
    await expect(sheet(page, 'SEA @ DEN').getByRole('button', { name: 'Next game', exact: true })).toBeDisabled();
    await sheet(page, 'SEA @ DEN').getByRole('button', { name: 'Previous game, WAS @ SF', exact: true }).click();
    await expect(sheet(page, 'WAS @ SF')).toContainText('3 of 4');
    await expect(sheet(page, 'WAS @ SF').getByRole('region', { name: 'Recorded result', exact: true })).toHaveCount(0);
    await sheet(page, 'WAS @ SF').getByRole('button', { name: 'Next game, SEA @ DEN', exact: true }).click();
    await expect(sheet(page, 'SEA @ DEN')).toContainText('4 of 4');
    await expect(recorded).toContainText('Final · SEA 0–DEN 7');
    expect(resultReads.filter(call => call === 'POST /lines/read')).toEqual([]);
    expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain('Fixture commissioner');
    expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain('boardOrder');
    // A refreshed board may contain a correction; the open sheet labels and keeps its captured observation.
    finalHome = 14; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(card(page, 'SEA-DEN')).toContainText('Final · SEA 0–DEN 14');
    await expect(recorded).toContainText('Final · SEA 0–DEN 7');
    const beforeCheck = resultReads.filter(call => call === 'POST /lines/read').length;
    await recorded.getByRole('button', { name: 'Check recorded result', exact: true }).click();
    await expect(recorded).toContainText('Final · SEA 0–DEN 14');
    await expect(recorded).toContainText('Checked');
    await expect(recorded.getByRole('button', { name: 'Check recorded result', exact: true })).toBeFocused();
    expect(resultReads.filter(call => call === 'POST /lines/read')).toHaveLength(beforeCheck + 1);
    for (const theme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
      await page.evaluate(theme => { localStorage.setItem('gtl.theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: theme })); }, theme);
      await page.emulateMedia({ colorScheme: theme, forcedColors, reducedMotion: 'reduce' });
      await phoneChecks(page); expect(await axe(page)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`checked-result-${theme}-${forcedColors}.png`) });
    }
    await page.keyboard.press('Escape'); await expect(card(page, 'SEA-DEN')).toBeFocused();
    await card(page, 'SEA-DEN').click();
    await expect(sheet(page, 'SEA @ DEN').getByRole('region', { name: 'Recorded result', exact: true })).toContainText('Final · SEA 0–DEN 14');
    await page.keyboard.press('Escape'); await expect(card(page, 'SEA-DEN')).toBeFocused();
    fail = true; await page.getByRole('button', { name: 'Refresh market lines' }).click();
    await expect(page.getByRole('button', { name: 'Retry market lines' })).toBeVisible();
    await expect(finals).toHaveCount(0); await expect(page.locator('.gx-l-card')).toHaveCount(4);
    await expect(page.locator('.gx')).not.toContainText('Fixture commissioner');
    await expect(page.locator('.gx')).not.toContainText('Final · SEA 0–DEN 7');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a direct game open checks results on demand, ignores a late reply after paging and recovers error/missing/wrong-week states', async ({ page, baseURL }) => {
  let now = Date.now();
  const { world } = await lukesWeek(page, baseURL, { clock: () => now });
  let release, mode = 'hold', requests = 0;
  const waiting = new Promise(resolve => { release = resolve; });
  try {
    now = Math.max(...world.state.games.map(game => Date.parse(game.kickoff))) + 3600000;
    await openLines(page); await expect(card(page, 'SEA-DEN')).toContainText('43.5');
    await page.goto('/#trends'); await expect(title(page, 'Trends')).toBeVisible();
    await expect(page.locator('[data-trend-availability]')).toBeVisible();
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/lines/read'), async route => {
      requests++;
      const chosen = mode;
      if (chosen === 'error') return route.fulfill({ status: 503, json: { error: 'Fixture result outage' } });
      const req = route.request(), response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.json();
      body.games.forEach(game => { game.final = chosen === 'missing' ? null : { status: 'final', away: 0, home: 0, source: chosen === 'wrong-week' ? 'WRONG WEEK RESULT' : chosen === 'hold' ? 'LATE RESULT' : 'Fixture checked final', observedAt: body.now }; });
      if (chosen === 'wrong-week') body.week += 1;
      if (chosen === 'hold') await waiting;
      await route.fulfill({ status: 200, json: body }).catch(() => {});
    });
    const directCalls = apiCalls(page);
    await page.getByRole('button', { name: 'Game details · SEA @ DEN', exact: true }).click();
    const sea = sheet(page, 'SEA @ DEN'), recorded = dialog => dialog.getByRole('region', { name: 'Recorded result', exact: true });
    await expect(recorded(sea)).toContainText('No recorded result checked yet.');
    expect(requests).toBe(0);
    expect(directCalls.filter(call => call === 'POST /lines/game')).toHaveLength(1);
    const check = recorded(sea).getByRole('button', { name: 'Check recorded result', exact: true });
    await check.click(); await expect(check).toBeDisabled(); await expect(recorded(sea).getByRole('status')).toHaveText('Checking recorded result…');
    await check.evaluate(button => { button.click(); button.click(); }); expect(requests).toBe(1);
    await sea.getByRole('button', { name: 'Next game, HOU @ JAX', exact: true }).click();
    const hou = sheet(page, 'HOU @ JAX'); await expect(recorded(hou)).toContainText('No recorded result checked yet.');
    release(); await expect(recorded(hou)).not.toContainText('LATE RESULT');
    await hou.getByRole('button', { name: 'Previous game, SEA @ DEN', exact: true }).click();
    await expect(recorded(sea).getByRole('button', { name: 'Check recorded result', exact: true })).toBeEnabled();
    await expect(recorded(sea).getByRole('status')).toHaveCount(0);
    await sea.getByRole('button', { name: 'Next game, HOU @ JAX', exact: true }).click();
    mode = 'error'; await recorded(hou).getByRole('button', { name: 'Check recorded result', exact: true }).click();
    await expect(recorded(hou).getByRole('alert')).toContainText('Couldn’t check the result.');
    mode = 'missing'; await recorded(hou).getByRole('button', { name: 'Try result again', exact: true }).click();
    await expect(recorded(hou)).toContainText('No complete recorded final returned for this game.');
    await expect(recorded(hou)).toContainText('Checked');
    mode = 'wrong-week'; await recorded(hou).getByRole('button', { name: 'Check recorded result', exact: true }).click();
    await expect(recorded(hou).getByRole('alert')).toBeVisible(); await expect(recorded(hou)).not.toContainText('WRONG WEEK RESULT');
    mode = 'ready'; await recorded(hou).getByRole('button', { name: 'Try result again', exact: true }).click();
    await expect(recorded(hou)).toContainText('Final · HOU 0–JAX 0');
    await expect(recorded(hou)).toContainText('Fixture checked final');
    await expect(recorded(hou).getByRole('button', { name: 'Check recorded result', exact: true })).toBeFocused();
    await hou.getByRole('button', { name: 'Previous game, SEA @ DEN', exact: true }).click();
    await sea.getByRole('button', { name: 'Next game, HOU @ JAX', exact: true }).click();
    await expect(recorded(hou)).toContainText('Final · HOU 0–JAX 0'); expect(requests).toBe(5);
    expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain('Fixture checked final');
    expect(world.errors).toEqual([]);
  } finally { release(); await world.db.close(); }
});

test('board refresh failures and wrong-week replies hide market values until retry succeeds', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL);
  let failure = 'offline';
  const matcher = url => url.origin === SUPABASE && url.pathname.endsWith('/lines/read');
  try {
    await openLines(page); await expect(card(page, 'SEA-DEN')).toContainText('43.5');
    await page.route(matcher, async route => {
      if (failure === 'offline') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable' }) });
      const req = route.request(), response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.json(); body.week += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: 'Retry market lines' })).toBeVisible();
    await expect(card(page, 'SEA-DEN')).not.toContainText('43.5');
    await expect(card(page, 'SEA-DEN')).toContainText('You41');
    failure = 'wrong-week'; await page.getByRole('button', { name: 'Retry market lines' }).click();
    await expect(page.getByRole('button', { name: 'Retry market lines' })).toBeVisible();
    await expect(card(page, 'SEA-DEN')).not.toContainText('43.5');
    await page.unroute(matcher); await page.getByRole('button', { name: 'Retry market lines' }).click();
    await expect(card(page, 'SEA-DEN')).toContainText('43.5');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('board freshness expires from server time without polling for quotes', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL);
  let reads = 0;
  try {
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/lines/read'), async route => {
      reads += 1;
      const req = route.request(), response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.json();
      for (const game of body.games) if (game.total.visible) game.total.observedAt = new Date(Date.parse(body.now) - 6 * 3600000 + 2000).toISOString();
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(body) });
    });
    await openLines(page); const sea = card(page, 'SEA-DEN');
    await expect(sea).toContainText('Current line');
    await page.evaluate(() => { Date.now = () => 0; });
    await expect(sea).toContainText('Latest recorded line', { timeout: 5000 });
    expect(reads).toBe(1); expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a delayed board reply cannot restore another account’s unlocked markets', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL);
  let release, held = false, holdNext = true;
  const hold = new Promise(resolve => { release = resolve; });
  try {
    await openLines(page);
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'troy', { navigate: false }); await page.goto('/#lines');
    await expect(card(page, 'SEA-DEN').locator('.gx-l-val')).toHaveAttribute('data-cell', 'line');
    await page.setViewportSize({ width: 320, height: 844 }); await phoneChecks(page);
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/lines/read'), async route => {
      const req = route.request(), response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.text();
      if (holdNext) { holdNext = false; held = true; await hold; }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body }).catch(() => {});
    });
    await page.getByRole('button', { name: 'Refresh market lines', exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'luke', { navigate: false }); await page.goto('/#lines');
    await expect(card(page, 'SEA-DEN')).toContainText('43.5'); release();
    await expect(card(page, 'SEA-DEN').locator('.gx-l-val')).toHaveAttribute('data-cell', 'locked');
    await noLeak(page, world, 'board after account switch'); expect(world.errors).toEqual([]);
  } finally { release(); await world.db.close(); }
});

const guesses = page => page.getByRole('region', { name: 'Everyone’s guesses', exact: true });
async function openGuesses(page, game = 'HOU-JAX') {
  await card(page, game).click();
  await sheet(page, game.replace('-', ' @ ')).getByRole('button', { name: /Everyone’s guesses/ }).click();
  await expect(guesses(page).getByRole('list', { name: 'Community Spread guesses' })).toBeVisible();
}

test('community guesses load on demand, keep drafts private, switch independent markets and write nothing', async ({ page, baseURL }, testInfo) => {
  const { world } = await lukesWeek(page, baseURL);
  const requests = [], responses = [], calls = apiCalls(page);
  try {
    const longName = 'A Very Long Community Display Name For Small Screens';
    await world.db.query('update public.gtl_profiles set display_name=$1 where user_id=$2', [longName, ACCOUNTS.troy.id]);
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/community/picks'), async route => {
      const req = route.request(); requests.push(req.postDataJSON());
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.json(); responses.push(body);
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(body) });
    });
    await openLines(page); await card(page, 'HOU-JAX').click();
    await expect(sheet(page, 'HOU @ JAX').getByRole('button', { name: /Everyone’s guesses/ })).toHaveAttribute('aria-expanded', 'false');
    expect(requests).toHaveLength(0);
    await sheet(page, 'HOU @ JAX').getByRole('button', { name: /Everyone’s guesses/ }).click();
    const section = guesses(page);
    await expect(section).toContainText(longName); await expect(section).toContainText('Your draft');
    await expect(section).toContainText('JAX −9'); await expect(section).toContainText('Guess hidden');
    expect(responses[0].games[0].rows.find(row => row.userId === ACCOUNTS.troy.id).pick).toBeNull();
    await noLeak(page, world, 'community Spread guesses while locked');
    await section.getByRole('button', { name: 'Total', exact: true }).click();
    await expect(section.getByRole('list', { name: 'Community Total guesses' })).toBeVisible();
    await expect(section).toContainText('47.5'); await expect(section).not.toContainText('Your draft');
    expect(requests).toEqual(['guess_spread', 'guess_total'].map(mode => ({ season: 2026, week: 6, gameId: 'HOU-JAX', mode })));
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      await page.setViewportSize({ width: 320, height: 844 }); await phoneChecks(page); expect(await axe(page)).toEqual([]);
      await section.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`community-guesses-${theme}.png`) });
    }
    await section.getByRole('button', { name: 'About community guesses' }).click();
    await expect(page.getByRole('dialog', { name: 'About community guesses' })).toContainText('regardless of the private league selected');
    await page.keyboard.press('Escape'); await expect(sheet(page, 'HOU @ JAX')).toBeVisible();
    expect(calls.filter(call => !READS.includes(call))).toEqual([]); expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('guess refresh failure and mismatched reply clear old guesses until retry succeeds', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL);
  let wrong = false;
  const matcher = url => url.origin === SUPABASE && url.pathname.endsWith('/community/picks');
  try {
    await openLines(page); await openGuesses(page);
    const section = guesses(page); await section.getByRole('button', { name: 'Total', exact: true }).click();
    await expect(section).toContainText('47.5');
    await page.route(matcher, async route => {
      if (!wrong) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable' }) });
      const req = route.request(), response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.json(); body.viewer = ACCOUNTS.troy.id;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(section.getByRole('button', { name: 'Retry guesses' })).toBeVisible(); await expect(section).not.toContainText('47.5');
    wrong = true; await section.getByRole('button', { name: 'Retry guesses' }).click();
    await expect(section.getByRole('button', { name: 'Retry guesses' })).toBeVisible(); await expect(section).not.toContainText('47.5');
    await page.unroute(matcher); await section.getByRole('button', { name: 'Retry guesses' }).click();
    await expect(section).toContainText('47.5'); expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('delayed Total guesses cannot populate the selected locked Spread market', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL);
  let release, held = false;
  const hold = new Promise(resolve => { release = resolve; });
  try {
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/community/picks'), async route => {
      const req = route.request(), response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.text();
      if (req.postDataJSON().mode === 'guess_total') { held = true; await hold; }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body }).catch(() => {});
    });
    await openLines(page); await openGuesses(page); const section = guesses(page);
    await section.getByRole('button', { name: 'Total', exact: true }).click(); await expect.poll(() => held).toBe(true);
    await expect(section).toContainText('Loading community guesses');
    await section.getByRole('button', { name: 'Spread', exact: true }).click();
    await expect(section).toContainText('Guess hidden'); release();
    await expect(section).not.toContainText('47.5'); await noLeak(page, world, 'delayed Total after Spread selected');
    expect(world.errors).toEqual([]);
  } finally { release(); await world.db.close(); }
});

test('a delayed guesses reply cannot restore the previous account’s revealed picks', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL);
  let release, held = false, holdNext = true;
  const hold = new Promise(resolve => { release = resolve; });
  try {
    await openLines(page);
    await page.getByRole('button', { name: 'Your menu', exact: true }).click(); await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'troy', { navigate: false }); await page.goto('/#lines');
    await openGuesses(page); await expect(guesses(page)).toContainText('HOU −2.5');
    // Hold Troy's Total reply, which includes Luke's locked Total; Luke's next Spread scope must stay closed.
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/community/picks'), async route => {
      const req = route.request(), response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.text();
      if (holdNext) { holdNext = false; held = true; await hold; }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body }).catch(() => {});
    });
    await guesses(page).getByRole('button', { name: 'Total', exact: true }).click(); await expect.poll(() => held).toBe(true);
    await sheet(page, 'HOU @ JAX').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Your menu', exact: true }).click(); await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'luke', { navigate: false }); await page.goto('/#lines'); await openGuesses(page);
    await expect(guesses(page)).toContainText('Guess hidden'); release();
    await noLeak(page, world, 'community guesses after account switch'); expect(world.errors).toEqual([]);
  } finally { release(); await world.db.close(); }
});

test('after the deadline only the kicked-off game opens guesses and ranks; later games remain gated', async ({ page, baseURL }) => {
  let now = Date.now();
  const { world } = await lukesWeek(page, baseURL, { clock: () => now });
  try {
    now = Date.parse(world.state.games[0].kickoff) + 60000;
    await openLines(page); await openGuesses(page, 'HOU-JAX');
    await expect(guesses(page)).toContainText('Guess hidden'); await expect(guesses(page)).not.toContainText('Closest');
    await page.keyboard.press('Escape'); await openGuesses(page, 'SEA-DEN');
    const section = guesses(page);
    await expect(section).toContainText('DEN −3'); await expect(section).not.toContainText('Guess hidden');
    await expect(section).toContainText('Closest');
    await expect(section).toContainText('Your draft'); // Kickoff never locks in or scores the owner's unsent guess.
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});


test('game action bar opens the selected matchup and market without writing or dropping other drafts', async ({ page, baseURL }, testInfo) => {
  const { world } = await lukesWeek(page, baseURL, { forge: false, optionalRpc: true });
  const calls = apiCalls(page);
  try {
    await openLines(page); await card(page, 'HOU-JAX').click();
    const actions = sheet(page, 'HOU @ JAX').getByRole('navigation', { name: 'Actions for this game' });
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      await page.setViewportSize({ width: 320, height: 844 });
      await expect(actions.getByRole('button', { name: 'Open Spread for HOU at JAX' })).toBeInViewport();
      await sheet(page, 'HOU @ JAX').getByText('Only you see this.', { exact: false }).scrollIntoViewIfNeeded();
      await expect(actions).toBeInViewport();
      await phoneChecks(page); expect(await axe(page)).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`game-actions-${theme}.png`) });
    }
    const note = sheet(page, 'HOU @ JAX').getByRole('textbox', { name: 'Your note' });
    await note.fill('A private unsaved note');
    page.once('dialog', dialog => dialog.dismiss());
    await actions.getByRole('button', { name: 'Open Spread for HOU at JAX' }).click();
    await expect(note).toHaveValue('A private unsaved note');
    await note.fill('');
    await actions.getByRole('button', { name: 'Open Spread for HOU at JAX' }).click();
    const spread = page.getByRole('article', { name: 'HOU at JAX Spread', exact: true });
    await expect(spread).toBeFocused();
    await expect(spread).toContainText('Draft');
    await expect(page.getByRole('article', { name: 'SEA at DEN Spread', exact: true })).toContainText('Draft');
    await expect(page.getByRole('article')).toHaveCount(4);
    expect(new URL(page.url()).hash).toContain('pickGame=HOU-JAX');
    await page.reload(); await expect(spread).toBeFocused();
    await page.goto('/#research/games'); await card(page, 'HOU-JAX').click();
    await sheet(page, 'HOU @ JAX').getByRole('button', { name: 'Open Total for HOU at JAX' }).click();
    const total = page.getByRole('article', { name: 'HOU at JAX Total', exact: true });
    await expect(total).toBeFocused(); await expect(total).toContainText('Locked in');
    await expect(total.getByRole('button', { name: 'Lock in Total', exact: true })).toHaveCount(0);
    expect(calls.filter(call => !READS.includes(call))).toEqual([]); expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('an unknown game focus keeps the complete ballot usable', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL, { forge: false, optionalRpc: true });
  try {
    await openLines(page);
    await page.goto('/#play/picks?market=spread&season=2026&week=6&pickGame=UNKNOWN');
    await expect(page.getByRole('article')).toHaveCount(4);
    await expect(page.getByRole('article', { name: 'HOU at JAX Spread', exact: true })).toContainText('Draft');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});


test('your pick sheet separates draft and locked references and returns focus to the game row', async ({ page, baseURL }, testInfo) => {
  const { world } = await lukesWeek(page, baseURL, { optionalRpc: true });
  const calls = apiCalls(page);
  try {
    await openLines(page); await card(page, 'SEA-DEN').click();
    const spreadRow = sheet(page, 'SEA @ DEN').getByRole('button', { name: /^Open your Spread pick\./ });
    await spreadRow.click();
    const spread = sheet(page, 'Your Spread pick');
    await expect(spread).toContainText('Draft SEA −4'); await expect(spread).toContainText('No locked-in scoring line');
    await expect(spread.getByRole('list', { name: 'Community Spread guesses' })).toBeVisible();
    await noLeak(page, world, 'draft pick sheet');
    await page.keyboard.press('Escape'); await expect(spreadRow).toBeFocused();
    await sheet(page, 'SEA @ DEN').getByRole('button', { name: /^Open your Total pick\./ }).click();
    const total = sheet(page, 'Your Total pick');
    await expect(total).toContainText('Line at your guess'); await expect(total).toContainText('43.5');
    await expect(total.getByRole('list', { name: 'Community Total guesses' })).toBeVisible();
    await expect(total.getByRole('group', { name: 'Guess market' })).toHaveCount(0);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      await page.setViewportSize({ width: 320, height: 844 }); await phoneChecks(page); expect(await axe(page)).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`your-pick-${theme}.png`) });
    }
    await total.getByRole('button', { name: 'About your saved pick' }).click();
    await expect(sheet(page, 'About your saved pick')).toContainText('Later market movement never replaces a saved reference');
    await page.keyboard.press('Escape'); await expect(total).toBeVisible();
    // Hold navigation's animation frames until the destination has focused itself.
    // This reproduces the race where the shell's later frame replaces game focus with the title.
    await total.getByRole('button', { name: 'Open Total in Play', exact: true }).evaluate(button => {
      button.addEventListener('click', () => {
        const native = window.requestAnimationFrame, pending = new Map();
        window.requestAnimationFrame = callback => {
          const id = native(time => { pending.set(id, () => callback(time)); });
          return id;
        };
        window.resumeRouteFrames = () => {
          window.requestAnimationFrame = native;
          return new Promise(resolve => native(() => {
            for (const callback of pending.values()) callback();
            native(resolve);
          }));
        };
      }, { once: true, capture: true });
    });
    await total.getByRole('button', { name: 'Open Total in Play', exact: true }).click();
    await expect(page.getByRole('article', { name: 'SEA at DEN Total', exact: true })).toBeFocused();
    await page.evaluate(() => window.resumeRouteFrames());
    await expect(page.getByRole('article', { name: 'SEA at DEN Total', exact: true })).toBeFocused();
    expect(calls.filter(call => !READS.includes(call))).toEqual([]); expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('your saved pick keeps pending and first-after labels and survives independent read failures', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL, { forge: false, optionalRpc: true });
  const saved = (await world.api('luke', 'personal')).body;
  const ballot = saved.ballots.guess_total;
  ballot.guessRule = 'per-game-v1'; ballot.lockedLate = { 'SEA-DEN': { minutes: 12 } };
  ballot.scoringReferences['SEA-DEN'] = { status: 'pending', basis: 'first_line_after_submission', value: 99.5 };
  let fail = false;
  await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/personal'), route => route.fulfill({ status: fail ? 503 : 200,
    contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(fail ? { error: 'Fixture unavailable' } : saved) }));
  try {
    await openLines(page); await card(page, 'SEA-DEN').click();
    await sheet(page, 'SEA @ DEN').getByRole('button', { name: /^Open your Total pick\./ }).click();
    const pick = sheet(page, 'Your Total pick');
    await expect(pick).toContainText('Line pending'); await expect(pick).not.toContainText('99.5'); await expect(pick).toContainText('Late · 12');
    ballot.scoringReferences['SEA-DEN'] = { status: 'available', basis: 'first_line_after_submission', value: 44.5, source: 'Saved first-after fixture', observedAt: saved.now };
    await pick.getByRole('button', { name: 'Refresh saved pick' }).click();
    await expect(pick).toContainText('First line after submission'); await expect(pick).toContainText('Saved first-after fixture');
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/community/picks'), route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture unavailable' }) }));
    await pick.getByRole('button', { name: 'Refresh guesses' }).click();
    await expect(pick).toContainText('Community guesses are unavailable'); await expect(pick).toContainText('Saved first-after fixture');
    fail = true; await pick.getByRole('button', { name: 'Refresh saved pick' }).click();
    await expect(pick).toContainText('Showing the last loaded saved record'); await expect(pick).toContainText('Saved first-after fixture');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

// Stage 34: the existing M-10 week reader, projected to one game. Fictional bets only.
async function seedGameBets(world) {
  const now = new Date().toISOString();
  for (const [who, gameId, market, selection] of [
    ['troy', 'SEA-DEN', 'spread', { side: 'home', line: -13.5, odds: -115, units: 1.5, source: 'BetMGM' }],
    ['luke', 'SEA-DEN', 'total', { side: 'under', line: 51.5, odds: -110, units: 2, source: 'DraftKings' }],
    ['sean', 'HOU-JAX', 'total', { side: 'over', line: 44.5, odds: -105, units: 1, source: 'FanDuel' }],
  ]) {
    await world.db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,6) on conflict do nothing', [ACCOUNTS[who].id]);
    await world.db.query('insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection) values($1,2026,6,$2,$3,$4)',
      [ACCOUNTS[who].id, gameId, market, { gameId, market, ...selection, quotedAt: now, selectedAt: now }]);
  }
}
const betsRoute = url => url.origin === SUPABASE && url.pathname.endsWith('/bets/read');
async function openGameBets(page, game = 'SEA-DEN') {
  await card(page, game).click();
  await sheet(page, game.replace('-', ' @ ')).getByRole('button', { name: /^Open League bets for / }).click();
  return sheet(page, 'League bets');
}

test('League bets loads one game on demand with protected terms, phone layout and no writes', async ({ page, baseURL }, testInfo) => {
  const { world } = await lukesWeek(page, baseURL, { forge: false, optionalRpc: true });
  const calls = apiCalls(page);
  try {
    await seedGameBets(world); await openLines(page);
    expect(calls.filter(call => call === 'POST /bets/read')).toEqual([]);
    const response = page.waitForResponse(response => betsRoute(new URL(response.url())));
    const bets = await openGameBets(page);
    const read = await response;
    expect(read.request().postDataJSON()).toEqual({ season: 2026, week: 6 });
    const reply = await read.json();
    expect(reply.bets.find(bet => bet.userId === ACCOUNTS.troy.id).selection).not.toHaveProperty('line');
    const troy = bets.locator(`[data-pick="${ACCOUNTS.troy.id}:spread"]`);
    await expect(troy).toContainText('DEN'); await expect(troy).toContainText('1.5U');
    await expect(troy).toHaveAttribute('data-open', 'false');
    await expect(bets).not.toContainText('BetMGM'); await expect(bets).not.toContainText('13.5');
    await expect(bets.locator(`[data-pick="${ACCOUNTS.luke.id}:total"]`)).toContainText('Under 51.5');
    await expect(bets).toContainText('DraftKings'); await expect(bets.locator('.gx-ev-game')).toHaveCount(1);
    await expect(bets.locator('[data-game="HOU-JAX"]')).toHaveCount(0);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      await page.setViewportSize({ width: 320, height: 844 }); await phoneChecks(page); expect(await axe(page)).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`game-bets-${theme}.png`) });
    }
    await page.keyboard.press('Escape');
    const action = sheet(page, 'SEA @ DEN').getByRole('button', { name: /^Open League bets for / });
    await expect(action).toBeFocused(); await phoneChecks(page); expect(await axe(page)).toEqual([]);
    await action.click(); await bets.getByRole('button', { name: 'Open Spread in Play', exact: true }).click();
    await expect(page.getByRole('article', { name: 'SEA at DEN Spread', exact: true })).toBeFocused();
    expect(calls.filter(call => ![...READS, 'POST /bets/read'].includes(call))).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('League bets clears failures and wrong-week replies, recovers and ignores an abandoned game read', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL, { forge: false, optionalRpc: true });
  let mode = 'ok', release, held;
  const waiting = new Promise(resolve => { held = resolve; });
  await page.route(betsRoute, async route => {
    const request = route.request();
    const response = await world.handler(new Request(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() }));
    const data = await response.json();
    const behavior = mode;
    if (behavior === 'hold') { held(); await new Promise(resolve => { release = resolve; }); }
    if (behavior === 'wrong') data.week += 1;
    await route.fulfill({ status: behavior === 'fail' ? 503 : response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(data) }).catch(() => {});
  });
  try {
    await seedGameBets(world); await openLines(page); const bets = await openGameBets(page);
    await expect(bets).toContainText('DraftKings');
    mode = 'wrong'; await bets.getByRole('button', { name: 'Refresh league bets' }).click();
    await expect(bets).toContainText('League bets are unavailable'); await expect(bets).not.toContainText('DraftKings');
    mode = 'fail'; await bets.getByRole('button', { name: 'Retry league bets' }).click(); await expect(bets).toContainText('League bets are unavailable');
    mode = 'ok'; await bets.getByRole('button', { name: 'Retry league bets' }).click(); await expect(bets).toContainText('DraftKings');
    mode = 'hold'; await bets.getByRole('button', { name: 'Refresh league bets' }).click(); await waiting;
    await expect(bets).not.toContainText('DraftKings'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    mode = 'ok'; await openGameBets(page, 'HOU-JAX'); await expect(bets).toContainText('FanDuel');
    release(); await expect(bets).not.toContainText('DraftKings');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await openGameBets(page, 'NO-NYG'); await expect(bets).toContainText('No Virtual Units picks for this game in Community yet.');
    expect(world.errors).toEqual([]);
  } finally { release?.(); await world.db.close(); }
});

test('League bets uses the selected private roster and never falls back after refusal', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL, { forge: false, optionalRpc: true });
  try {
    await seedGameBets(world); await openLines(page);
    await world.db.query('update public.gtl_memberships set active=false where league_id=$1 and user_id=$2', ['sean-troy-luke', ACCOUNTS.troy.id]);
    await page.evaluate(id => localStorage.setItem(`gtl.next.league.v1.${encodeURIComponent(id)}`, JSON.stringify({ id: 'sean-troy-luke', name: 'Triple Threat' })), ACCOUNTS.luke.id);
    await page.reload(); await expect(card(page, 'SEA-DEN')).toBeVisible();
    const response = page.waitForResponse(response => betsRoute(new URL(response.url())));
    const bets = await openGameBets(page);
    expect((await response).request().postDataJSON()).toEqual({ season: 2026, week: 6, leagueId: 'sean-troy-luke' });
    await expect(bets).toContainText('DraftKings'); await expect(bets).not.toContainText('Community · Week');
    await expect(bets.locator(`[data-pick="${ACCOUNTS.troy.id}:spread"]`)).toHaveCount(0);
    await world.db.query('update public.gtl_memberships set active=false where league_id=$1 and user_id=$2', ['sean-troy-luke', ACCOUNTS.luke.id]);
    const refused = page.waitForResponse(response => betsRoute(new URL(response.url())));
    await bets.getByRole('button', { name: 'Refresh league bets' }).click();
    expect((await refused).status()).toBe(400);
    await expect(bets).toContainText('League bets are unavailable'); await expect(bets).not.toContainText('DraftKings');
    await expect(bets).not.toContainText('Community · Week');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('League bets discards another account’s delayed own-pick terms', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL, { forge: false, optionalRpc: true });
  let release, held = false, holdNext = true;
  const hold = new Promise(resolve => { release = resolve; });
  try {
    await seedGameBets(world); await openLines(page);
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'troy', { navigate: false }); await page.goto('/#lines');
    await page.route(betsRoute, async route => {
      const request = route.request();
      const response = await world.handler(new Request(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() }));
      const payload = await response.text();
      if (holdNext) { holdNext = false; held = true; await hold; }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: payload }).catch(() => {});
    });
    await openGameBets(page); await expect.poll(() => held).toBe(true);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'luke', { navigate: false }); await page.goto('/#lines');
    const bets = await openGameBets(page); await expect(bets).toContainText('DraftKings');
    release(); await expect(bets).not.toContainText('BetMGM'); await expect(bets).not.toContainText('13.5');
    await expect(bets.locator(`[data-pick="${ACCOUNTS.troy.id}:spread"]`)).toHaveAttribute('data-open', 'false');
    expect(world.errors).toEqual([]);
  } finally { release(); await world.db.close(); }
});

const revealDialog = page => page.getByRole('alertdialog', { name: 'See picks now for Week 6?', exact: true });
const forfeitRoute = url => url.origin === SUPABASE && url.pathname.endsWith('/community/forfeit');

test('Research reveal warns before writing, keeps locked scores and drafts, then opens remaining guesses', async ({ page, baseURL }, testInfo) => {
  const { world } = await lukesWeek(page, baseURL, { forge: false, optionalRpc: true });
  const calls = apiCalls(page);
  try {
    const initial = (await world.api('luke', 'personal')).body;
    expect((await world.api('luke', 'personal/ballot', { season: 2026, week: 6, mode: 'guess_spread', picks: LUKE_SPREAD_DRAFT, lockIn: ['SEA-DEN'], submit: false,
      revision: initial.revision, weeklyRevision: initial.weeklyRevision, requestId: randomUUID() })).status).toBe(200);
    const before = (await world.api('luke', 'personal')).body;
    await openLines(page); await card(page, 'HOU-JAX').click();
    const game = sheet(page, 'HOU @ JAX');
    const note = game.getByRole('textbox', { name: 'Your note' }); await note.fill('Private unsaved fixture note');
    await game.getByRole('button', { name: /Everyone’s guesses/ }).click();
    await game.getByRole('button', { name: 'See picks now', exact: true }).click();
    const dialog = revealDialog(page);
    await expect(dialog).toContainText('not just this game'); await expect(dialog).toContainText('Spread: remaining guesses will be sat out · 1 of 4 locked in');
    await expect(dialog).toContainText('Total: fully locked in; keeps counting');
    expect(calls.filter(call => call === 'POST /community/forfeit')).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Keep playing', exact: true }).click();
    await expect(game.getByRole('button', { name: 'See picks now', exact: true })).toBeFocused();
    await game.getByRole('button', { name: 'See picks now', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Confirm sit-out and reveal', exact: true })).toBeVisible();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme); await page.setViewportSize({ width: 320, height: 844 });
      await phoneChecks(page); expect(await axe(page)).toEqual([]); await page.screenshot({ path: testInfo.outputPath(`reveal-${theme}.png`) });
    }
    await dialog.getByRole('button', { name: 'Confirm sit-out and reveal', exact: true }).click();
    const done = page.getByRole('alertdialog', { name: 'Week 6 reveal confirmed', exact: true }); await expect(done).toBeVisible();
    await done.getByRole('button', { name: 'Back to Research', exact: true }).click();
    await expect(game.getByRole('button', { name: 'See picks now', exact: true })).toHaveCount(0);
    await expect(note).toHaveValue('Private unsaved fixture note');
    await expect(game.getByRole('list', { name: 'Community Spread guesses' })).not.toContainText('Guess hidden');
    const after = (await world.api('luke', 'personal')).body;
    expect(after.ballots.guess_spread.picks).toEqual(before.ballots.guess_spread.picks);
    expect(after.scoring.guess_spread.games.find(row => row.gameId === 'SEA-DEN')).toEqual(before.scoring.guess_spread.games.find(row => row.gameId === 'SEA-DEN'));
    expect(after.scoring.guess_total).toEqual(before.scoring.guess_total);
    expect(calls.filter(call => call === 'POST /community/forfeit')).toHaveLength(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Research reveal checks a lost write reply without automatically repeating it', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL, { forge: false, optionalRpc: true });
  let writes = 0;
  await page.route(forfeitRoute, async route => {
    writes += 1; const request = route.request();
    const response = await world.handler(new Request(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() }));
    expect(response.status).toBe(200);
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture lost reply' }) });
  });
  try {
    await openLines(page); await page.getByRole('button', { name: 'See picks now', exact: true }).click();
    const dialog = revealDialog(page); await dialog.getByRole('button', { name: 'Confirm sit-out and reveal', exact: true }).click();
    await expect(dialog).toContainText('Your sit-out is unconfirmed'); expect(writes).toBe(1);
    await expect(dialog.getByRole('button', { name: 'Confirm sit-out and reveal', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Check sit-out status', exact: true }).click();
    await expect(page.getByRole('alertdialog', { name: 'Week 6 reveal confirmed', exact: true })).toBeVisible(); expect(writes).toBe(1);
    expect((await world.db.query('select count(*)::int n from public.gtl_week_forfeits where user_id=$1', [ACCOUNTS.luke.id])).rows[0].n).toBe(1);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('gtl.next.forfeit.')))).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Research reveal refuses mismatched fresh status and allows an explicit retry only after checking', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL, { forge: false, optionalRpc: true });
  let wrong = false, writes = 0, failWrite = true;
  await page.route(forfeitRoute, async route => { writes += 1; if (failWrite) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); await route.fallback(); });
  try {
    await openLines(page);
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/community/read'), async route => {
      const request = route.request();
      const response = await world.handler(new Request(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() }));
      const data = await response.json(); if (wrong) data.forfeit.week += 1;
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(data) });
    });
    wrong = true; await page.getByRole('button', { name: 'See picks now', exact: true }).click();
    const dialog = revealDialog(page); await expect(dialog).toContainText('reveal status is unavailable');
    await expect(dialog.getByRole('button', { name: 'Confirm sit-out and reveal', exact: true })).toHaveCount(0); expect(writes).toBe(0);
    wrong = false; await dialog.getByRole('button', { name: 'Check sit-out status', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm sit-out and reveal', exact: true }).click();
    await expect(dialog).toContainText('Your sit-out is unconfirmed'); expect(writes).toBe(1);
    await dialog.getByRole('button', { name: 'Check sit-out status', exact: true }).click();
    await expect(dialog).toContainText('No saved forfeit was found'); expect(writes).toBe(1);
    failWrite = false; await dialog.getByRole('button', { name: 'Confirm sit-out and reveal', exact: true }).click();
    await expect(page.getByRole('alertdialog', { name: 'Week 6 reveal confirmed', exact: true })).toBeVisible(); expect(writes).toBe(2);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Research reveal removes confirmation at the server deadline and stops reading after cancel', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL, { forge: false, optionalRpc: true });
  let reads = 0;
  try {
    await openLines(page); await page.clock.install();
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/community/read'), async route => {
      reads += 1; const request = route.request();
      const response = await world.handler(new Request(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() }));
      const data = await response.json(); data.forfeit.closesAt = new Date(Date.parse(data.picksDue.now) + 5000).toISOString();
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(data) });
    });
    const calls = apiCalls(page); await page.getByRole('button', { name: 'See picks now', exact: true }).click();
    const dialog = revealDialog(page); await expect(dialog.getByRole('button', { name: 'Confirm sit-out and reveal', exact: true })).toBeVisible();
    await page.clock.runFor(6000); await expect(dialog).toContainText('The last kickoff passed');
    await expect(dialog.getByRole('button', { name: 'Confirm sit-out and reveal', exact: true })).toHaveCount(0);
    expect(calls.filter(call => call === 'POST /community/forfeit')).toEqual([]);
    await dialog.getByRole('button', { name: 'Keep playing', exact: true }).click();
    await expect(dialog).not.toBeVisible(); const before = reads;
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.clock.runFor(100);
    // Shared app data may refresh independently; a closed dialog must not add a second community read.
    expect(reads - before).toBeLessThanOrEqual(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Research reveal restores an uncertain attempt on reopen and checks before any retry', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL, { forge: false, optionalRpc: true });
  let writes = 0;
  await page.route(forfeitRoute, route => { writes += 1; return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); });
  try {
    await openLines(page); await page.getByRole('button', { name: 'See picks now', exact: true }).click();
    const dialog = revealDialog(page); await dialog.getByRole('button', { name: 'Confirm sit-out and reveal', exact: true }).click();
    await expect(dialog).toContainText('Your sit-out is unconfirmed');
    page.once('dialog', prompt => prompt.accept()); await dialog.getByRole('button', { name: 'Keep playing', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: 'See picks now', exact: true }).click();
    await expect(dialog).toContainText('No saved forfeit was found in the latest check'); expect(writes).toBe(1);
    expect((await world.db.query('select count(*)::int n from public.gtl_week_forfeits where user_id=$1', [ACCOUNTS.luke.id])).rows[0].n).toBe(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

// Gradients and box shadows disappear under forced colors. Chart meaning must
// survive through system-color lines, fills and visible selection boundaries.
test('high-contrast charts retain visible bars, stems and selected seasons', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(60000);
  const { world } = await lukesWeek(page, baseURL);
  const observed = [];
  try {
    await storeBookLines(world, { ...LINES, total: { ...LINES.total, 'HOU-JAX': 44.5 } }, { capturedAt: Date.now() - 1000 });
    await openLines(page); await card(page, 'HOU-JAX').click();
    const game = sheet(page, 'HOU @ JAX'), trend = game.locator('[data-trend-detail]').first();
    const total = game.locator('[data-market-details="total"]');
    await total.locator('summary', { hasText: 'Line movement' }).click();
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ forcedColors: 'active', colorScheme: theme });
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width: 320, height: 844 });
      const foreground = await trend.evaluate(el => getComputedStyle(el).color);
      await trend.getByRole('button', { name: 'Since 2002', exact: true }).click();
      const lineSlider = trend.getByRole('slider', { name: 'Move along the line' });
      await lineSlider.focus(); await page.keyboard.press('Home');
      await expect(lineSlider).toHaveValue('0');
      await page.keyboard.press('End');
      await expect(lineSlider).toHaveValue(await lineSlider.getAttribute('max'));
      expect(await trend.locator('.gx-tc-path').evaluate(el => getComputedStyle(el).stroke)).toBe(foreground);
      expect(await trend.locator('.gx-tc-zero').evaluate(el => getComputedStyle(el).stroke)).toBe(foreground);
      await expect(trend.locator('.gx-tc-area')).toBeHidden();
      await trend.locator('.gx-tc-line').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`forced-line-${theme}.png`) });
      await trend.getByRole('button', { name: 'By season', exact: true }).click();
      const selected = trend.getByRole('button', { name: 'Show 2024 season on chart', exact: true });
      await selected.click();
      await expect(selected).toBeFocused();
      await expect(selected).toHaveAttribute('aria-pressed', 'true');
      expect(await selected.evaluate(el => parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThanOrEqual(1);
      expect(await trend.locator('.gx-tc-col--on').evaluate(el => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThanOrEqual(1);
      await expect(trend.getByRole('slider')).toHaveAttribute('aria-valuetext', /2024:.*below break-even/);
      await trend.locator('.gx-tc-stems').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`forced-seasons-${theme}.png`) });
      observed.push(await trend.evaluate(el => {
        const style = selector => getComputedStyle(el.querySelector(selector));
        const up = style('.gx-tc-stem--up'), down = style('.gx-tc-stem--down');
        const fill = style('.gx-tc-bar-fill'), track = style('.gx-tc-bar');
        return { up: up.backgroundColor, down: down.backgroundColor, canvas: getComputedStyle(el).backgroundColor,
          fill: fill.backgroundColor, track: track.backgroundColor, trackBorder: track.borderTopWidth,
          blockOn: style('.gx-tc-block--on').backgroundColor, blockOff: style('.gx-tc-block:not(.gx-tc-block--on)').backgroundColor };
      }));
      await selected.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`forced-table-${theme}.png`) });
      const movementSlider = total.getByRole('slider', { name: 'Move along total movement' });
      await movementSlider.focus(); await page.keyboard.press('Home');
      await expect(movementSlider).toHaveAttribute('aria-valuetext', /41.5,.*PT/);
      await page.keyboard.press('End');
      await expect(movementSlider).toHaveAttribute('aria-valuetext', /44.5,.*PT/);
      expect(await total.locator('.gx-md-path').evaluate(el => getComputedStyle(el).stroke)).toBe(foreground);
      expect(await total.locator('.gx-md-point').first().evaluate(el => getComputedStyle(el).fill)).toBe(foreground);
      await total.locator('.gx-md-movement').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`forced-movement-${theme}.png`) });
      await phoneChecks(page); expect(await axe(page)).toEqual([]);
    }
    await testInfo.attach('forced-color-styles', { body: JSON.stringify(observed), contentType: 'application/json' });
    for (const colors of observed) {
      expect(colors.up).not.toBe(colors.canvas);
      expect(colors.down).not.toBe(colors.canvas);
      expect(colors.fill).not.toBe(colors.track);
      expect(colors.blockOn).not.toBe(colors.blockOff);
      expect(parseFloat(colors.trackBorder)).toBeGreaterThanOrEqual(1);
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('movement marks kickoff without adding a quote or opening a closed market', async ({ page, baseURL }, testInfo) => {
  const { world } = await lukesWeek(page, baseURL);
  try {
    // Synthetic timeline on the authenticated fixture reply only; never hosted odds.
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/lines/game'), async route => {
      const req = route.request();
      const res = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await res.json(), start = Date.parse(body.now) - 3600000;
      body.game.kickoff = new Date(start + 5 * 60000).toISOString(); body.game.started = true;
      body.total.movement = [0, 5, 10].map((minute, i) => ({ value: 41.5 + i, capturedAt: new Date(start + minute * 60000).toISOString() }));
      body.spread = { visible: false, movement: body.total.movement };
      await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: JSON.stringify(body) });
    });
    await openLines(page); await card(page, 'HOU-JAX').click();
    const game = sheet(page, 'HOU @ JAX'), total = game.locator('[data-market-details="total"]');
    await total.locator('summary', { hasText: 'Line movement' }).click();
    const marker = total.locator('[data-kickoff-marker]'), slider = total.getByRole('slider', { name: 'Move along total movement' });
    await expect(marker).toHaveAttribute('x1', '160');
    await expect(total.locator('.gx-md-kickoff-key')).toHaveText(/Kickoff · .*PT/);
    await expect(total.getByRole('img')).toHaveAttribute('aria-label', /3 recorded observations.*Dashed marker: Kickoff/);
    await expect(slider).toHaveAttribute('max', '2');
    await slider.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', /42.5,.*PT/);
    await expect(total.locator('.gx-md-cross')).toHaveCount(0);
    await expect(total.locator('circle[r="6"]')).toHaveAttribute('cx', '160');
    await expect(game.locator('[data-market-details="spread"]')).toHaveCount(0);
    await expect(game).toContainText('Spread lines are locked');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width: 320, height: 844 });
      for (const forcedColors of ['none', 'active']) {
        await page.emulateMedia({ forcedColors, colorScheme: theme });
        expect(await marker.evaluate(el => getComputedStyle(el).strokeDasharray)).not.toBe('none');
        if (forcedColors === 'active') expect(await marker.evaluate(el => getComputedStyle(el).stroke)).toBe(await total.evaluate(el => getComputedStyle(el).color));
        await total.locator('.gx-md-movement').scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`kickoff-${theme}-${forcedColors}.png`) });
        await phoneChecks(page); expect(await axe(page)).toEqual([]);
      }
    }
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuetext', /43.5,.*PT/);
    await expect(marker).toHaveAttribute('x1', '160');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('recent trend tiles distinguish grouped wins losses and pushes in both chart views', async ({ page, baseURL }, testInfo) => {
  const { world } = await lukesWeek(page, baseURL);
  let replaced = 0;
  try {
    // Fictional recent counts; the source supplies aggregates, never a game sequence.
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/trends/week'), async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.json();
      const replace = value => {
        if (!value || typeof value !== 'object') return;
        if (value.last10 && 'W' in value.last10) { value.last10 = { W: 7, L: 2, P: 1 }; replaced++; }
        Object.values(value).forEach(replace);
      };
      replace(body);
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(body) });
    });
    await openLines(page); await card(page, 'HOU-JAX').click();
    const trend = sheet(page, 'HOU @ JAX').locator('[data-trend-detail]').first();
    const recent = trend.locator('.gx-tc-tile').filter({ has: page.locator('.gx-tc-tile-label', { hasText: 'Last 10' }) });
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: 320, height: 844 });
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const forcedColors of ['none', 'active']) {
        await page.emulateMedia({ forcedColors, colorScheme: theme });
        for (const view of ['Since 2002', 'By season']) {
          await trend.getByRole('button', { name: view, exact: true }).click();
          await expect(recent.locator('.gx-tc-tile-value')).toHaveText('7–2–1');
          await expect(recent).toContainText('W · L · P; grouped counts');
          await expect(recent.locator('.gx-tc-block--on')).toHaveCount(7);
          await expect(recent.locator('.gx-tc-block--push')).toHaveCount(1);
          await expect(recent.locator('.gx-tc-block:not(.gx-tc-block--on):not(.gx-tc-block--push)')).toHaveCount(2);
          expect(await recent.locator('.gx-tc-block--push').evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('dashed');
        }
        await recent.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`recent-${theme}-${forcedColors}.png`) });
        await phoneChecks(page); expect(await axe(page)).toEqual([]);
        // The public 2024 season has −11.5 units, which collides with the forged-pick sentinel.
        // Scan the cumulative view; season data is independently asserted above.
        await trend.getByRole('button', { name: 'Since 2002', exact: true }).click();
        await noLeak(page, world, 'recent grouped counts');
      }
    }
    expect(replaced).toBeGreaterThan(0); expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('season stems mark break-even without inflating small gains or losses', async ({ page, baseURL }, testInfo) => {
  const { world } = await lukesWeek(page, baseURL);
  let replaced = 0;
  try {
    // Synthetic chart geometry only; these sample unit values are not historical results.
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/trends/week'), async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.json();
      const replace = value => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value.perSeason)) {
          value.perSeason = [[2018,21,11,10,0,0],[2019,3,2,1,0,0.1],[2020,3,1,2,0,-0.1],[2021,100,80,20,0,100]];
          value.seasonsPos = 2; value.seasonsBet = 4; replaced++;
        }
        Object.values(value).forEach(replace);
      };
      replace(body);
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(body) });
    });
    await openLines(page); await card(page, 'HOU-JAX').click();
    const trend = sheet(page, 'HOU @ JAX').locator('[data-trend-detail]').first();
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: 320, height: 844 });
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const forcedColors of ['none', 'active']) {
        await page.emulateMedia({ forcedColors, colorScheme: theme });
        await trend.getByRole('button', { name: 'By season', exact: true }).click();
        await expect(trend.getByText('0 U · break-even', { exact: true })).toBeVisible();
        await expect(trend.locator('.gx-tc-scale')).toHaveText('Scale: −0.1 to +100 U');
        await expect(trend.locator('.gx-tc-stem--zero')).toHaveCount(1);
        await expect(trend.locator('.gx-tc-stem--up')).toHaveCount(2);
        await expect(trend.locator('.gx-tc-stem--down')).toHaveCount(1);
        await trend.getByRole('button', { name: 'Show 2018 season on chart', exact: true }).click();
        const slider = trend.getByRole('slider'), marker = trend.locator('.gx-tc-stem--zero');
        await expect(slider).toHaveAttribute('aria-valuetext', '2018: 11–10, 0.0 units, at break-even');
        const geo = await trend.evaluate(el => {
          const marker = el.querySelector('.gx-tc-stem--zero'), box = marker.getBoundingClientRect();
          const baseline = el.querySelector('.gx-tc-stems-zero').getBoundingClientRect();
          const bars = [...el.querySelectorAll('.gx-tc-stem:not(.gx-tc-stem--zero)')];
          return { center: box.y + box.height / 2, baseline: baseline.y, heights: bars.map(b => parseFloat(b.style.height)), fill: getComputedStyle(marker).backgroundColor, border: getComputedStyle(marker).borderTopColor };
        });
        expect(Math.abs(geo.center - geo.baseline)).toBeLessThan(1);
        expect(geo.heights[0] / geo.heights[2]).toBeCloseTo(0.001, 8);
        expect(geo.heights[1] / geo.heights[2]).toBeCloseTo(0.001, 8);
        expect(geo.fill).not.toBe(geo.border);
        const plotOffset = () => trend.locator('.gx-tc-seasons').evaluate(el => el.querySelector('.gx-tc-stems').getBoundingClientRect().top - el.getBoundingClientRect().top);
        const before = await plotOffset();
        await slider.focus(); await page.keyboard.press('ArrowRight');
        await expect(slider).toHaveAttribute('aria-valuetext', /2019:.*\+0.1 units, above break-even/);
        expect(await plotOffset()).toBeCloseTo(before, 1);
        await page.keyboard.press('Home');
        await trend.getByRole('button', { name: 'Since 2002', exact: true }).click();
        await trend.getByRole('button', { name: 'By season', exact: true }).click();
        await expect(slider).toHaveValue('0');
        await expect(marker).toHaveClass(/gx-tc-stem--on/);
        await trend.locator('.gx-tc-seasons').evaluate(el => el.scrollIntoView({ block: 'center' }));
        await page.screenshot({ path: testInfo.outputPath(`season-zero-${theme}-${forcedColors}.png`) });
        await phoneChecks(page); expect(await axe(page)).toEqual([]);
        await noLeak(page, world, 'season baseline markers');
      }
    }
    expect(replaced).toBeGreaterThan(0); expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('recorded movement timestamps select chart observations while missing rows stay readable', async ({ page, baseURL }, testInfo) => {
  const { world } = await lukesWeek(page, baseURL);
  let revision = 0;
  try {
    // Synthetic observations on the authenticated fixture, including a gap and duplicate times.
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/lines/game'), async route => {
      const req = route.request();
      const res = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await res.json(), start = Date.parse(body.now) - 3600000;
      body.total.movement = [
        { value: 41.5, capturedAt: new Date(start).toISOString() },
        { value: null, capturedAt: new Date(start + 60000).toISOString() },
        { value: 42.5, capturedAt: new Date(start + 600000).toISOString() },
        { value: 43.5 + revision, capturedAt: new Date(start + 600000).toISOString() },
        { value: 44.5, capturedAt: null },
      ];
      body.spread = { visible: false, movement: body.total.movement };
      await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: JSON.stringify(body) });
    });
    const calls = apiCalls(page);
    await openLines(page); await card(page, 'HOU-JAX').click();
    const game = sheet(page, 'HOU @ JAX'), total = game.locator('[data-market-details="total"]');
    const disclosure = total.locator('summary', { hasText: 'Line movement' });
    await disclosure.click();
    const slider = total.getByRole('slider', { name: 'Move along total movement' });
    const table = total.getByRole('table'), buttons = table.getByRole('button');
    const scale = total.locator('.gx-md-scale');
    await expect(scale).toHaveText('Recorded range: 41.5 to 43.5 points');
    await expect(total.getByRole('img')).toHaveAttribute('aria-describedby', await scale.getAttribute('id'));
    await expect(buttons).toHaveCount(3);
    await expect(table.locator('tbody tr')).toHaveCount(5);
    const first = buttons.nth(0), middle = buttons.nth(1), last = buttons.nth(2);
    await expect(last).toHaveAttribute('aria-pressed', 'true');
    await expect(middle).toHaveAccessibleName(/^Show observation 3:/);
    await expect(last).toHaveAccessibleName(/^Show observation 4:/);
    const count = calls.filter(call => call === 'POST /lines/game').length;
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width: 320, height: 844 });
      for (const forcedColors of ['none', 'active']) {
        await page.emulateMedia({ forcedColors, colorScheme: theme });
        await first.click();
        await expect(slider).toHaveValue('0'); await expect(first).toBeFocused();
        await expect(slider).toHaveAttribute('aria-valuetext', /41.5,.*PT/);
        await expect(table.locator('tr[data-selected="true"]')).toContainText('41.5');
        await expect(first).toHaveAttribute('aria-controls', await total.locator('.gx-md-plot').getAttribute('id'));
        await middle.focus(); await page.keyboard.press('Enter');
        await expect(slider).toHaveValue('1'); await expect(middle).toBeFocused();
        await expect(slider).toHaveAttribute('aria-valuetext', /42.5,.*PT/);
        await slider.focus(); await page.keyboard.press('End');
        await expect(last).toHaveAttribute('aria-pressed', 'true');
        await page.keyboard.press('Home');
        await expect(first).toHaveAttribute('aria-pressed', 'true');
        await expect(scale).toHaveText('Recorded range: 41.5 to 43.5 points');
        await total.locator('.gx-md-movement').scrollIntoViewIfNeeded();
        await phoneChecks(page); expect(await axe(page)).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`movement-selection-${theme}-${forcedColors}.png`) });
      }
    }
    const plot = total.locator('.gx-md-plot');
    await plot.scrollIntoViewIfNeeded(); const box = await plot.boundingBox();
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
    await expect(slider).toHaveValue('1'); await expect(middle).toHaveAttribute('aria-pressed', 'true');
    await disclosure.click(); await disclosure.click();
    await expect(middle).toHaveAttribute('aria-pressed', 'true');
    expect(calls.filter(call => call === 'POST /lines/game')).toHaveLength(count);
    await expect(game).toContainText('Spread lines are locked');
    await expect(game.locator('[data-market-details="spread"]')).toHaveCount(0);
    revision = 1;
    await game.getByRole('button', { name: 'Refresh market lines' }).click();
    await disclosure.click();
    await expect(slider).toHaveAttribute('aria-valuetext', /44.5,.*PT/);
    await expect(scale).toHaveText('Recorded range: 41.5 to 44.5 points');
    await expect(last).toHaveAttribute('aria-pressed', 'true');
    await noLeak(page, world, 'linked movement table');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
