import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
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
      if (r.right > innerWidth + 0.5 || r.left < -0.5) clipped.push(`off screen: ${el.textContent.trim().slice(0, 40)}`);
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
const READS = ['GET /lobby', 'POST /community/read', 'GET /personal', 'POST /wind/read', 'POST /officials/read', 'POST /personal/notes'];

/** The world: Week 6 fixtures, Luke's sent Totals and Spread drafts, Troy's sent ballots, a stored collection and a wind stand-in. */
async function lukesWeek(page, baseURL, { forge = true } = {}) {
  const fake = forecastFetch(point => ({ values: () => VALUES[point.latitude.toFixed(3)] ?? {} }));
  const world = await communityWorld(page, baseURL, { migrations: ALL, games: GAMES.length, prepare: week6, wind: createOpenMeteoProvider({ fetchImpl: fake.fetchImpl }) });
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
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
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

test('the board: kickoff groups, YOU tags, a lock icon on each closed market (never "—"), his own line at the guess, no writes', async ({ page, baseURL }) => {
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
    // Every Spread is locked for Luke: an icon, never a dash or a number; his sent Totals show his line at the guess.
    for (const id of GAMES) {
      const cell = card(page, id).locator('.gx-l-val');
      await expect(cell).toHaveAttribute('data-cell', 'locked');
      await expect(cell.locator('svg')).toHaveCount(1);
      expect((await cell.innerText()).trim()).toBe('');
      await expect(card(page, id).locator('.gx-l-cfoot [data-cell="line"] .gx-n-s')).toHaveText(String(LINES.total[id]));
    }
    for (const text of await page.locator('.gx-l-card [data-cell="locked"]').allInnerTexts()) expect(text).not.toContain('—');
    await expect(sea).toHaveAttribute('aria-label', /Spread line hidden\. Total 43\.5 at your guess\. Your spread pick SEA −4\. Your total pick 41\./);
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
    await expect(page.getByText('Line now arrives in a later update.')).toBeVisible();
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
    await expect(game).toContainText(/Records as of /);
    await expect(game).toContainText(/Seahawks \d+–\d+ · Broncos \d+–\d+/);
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
    await expect(situational.nth(1).locator('.gx-l-tnums')).toContainText(/\d[\d,]*–\d[\d,]*.*\d[\d,]* games/);
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
    await expect(londonTop.first()).toContainText('Teams in the Texans’ spot covered 444 times and missed 364 since 2002.');
    await expect(londonTop.first()).toContainText('444–364–22');
    await expect(londonTop.first()).toContainText('830 games');
    await page.goBack();
    await expect(london).toBeHidden();
    expect(calls.filter(call => call === 'POST /wind/read'), 'one wind read for the board and every sheet').toHaveLength(1);
    expect(calls.filter(call => !READS.includes(call)), 'browsing writes nothing').toEqual([]);
    expect(fake.calls).toHaveLength(1);
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
