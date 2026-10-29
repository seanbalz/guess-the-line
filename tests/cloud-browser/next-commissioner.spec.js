// Menu › Commissioner tools (D-65 follow-up): the new-app home of the old app's commissioner screens. The real gtl-api
// handler runs on local PGlite with the hosted migrations; the routes this fixture has no service for (the reviewed-results
// write, the odds provider and Virtual Units settlement) are answered by the spec, so no live provider is ever called.
// Fixture accounts only: Sean is the Community commissioner and the Triple Threat commissioner, Luke a player.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn, SUPABASE } from './community-world.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.skip(!pgliteAvailable, 'Install the local PGlite test runtime.');
test.setTimeout(120000);
const endpoint = path => url => url.origin === SUPABASE && url.pathname.endsWith(`/gtl-api/${path}`);
const sheet = page => page.getByRole('dialog').last();
async function openMenu(page, account) {
  await page.goto('/');
  await signIn(page, account, { navigate: false });
  await page.getByRole('button', { name: 'Your menu', exact: true }).click();
}
async function openTools(page) {
  await openMenu(page, 'sean');
  await page.getByRole('button', { name: 'Commissioner tools', exact: true }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Commissioner tools', exact: true })).toBeVisible();
}
async function tool(page, name) {
  await sheet(page).getByRole('button', { name, exact: true }).click();
  await expect(sheet(page).getByRole('heading', { name, exact: true })).toBeVisible();
}
async function back(page) { await sheet(page).getByRole('button', { name: 'Commissioner tools', exact: true }).click(); }
async function checkLayout(page, testInfo, name) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} ${theme} fits 320px`).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations, `${name} ${theme}`).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`commissioner-${name}-${theme}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
/** A public-schedule fixture for the week after the open one, kicking off later this week (never a live download). */
function scheduleFor(season, week) {
  const day = offset => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const pad = String(week).padStart(2, '0');
  return 'game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location\n'
    + `${season}_${pad}_SEA_DEN,${season},REG,${week},${day(3)},Thursday,20:15,SEA,,DEN,,Home\n`
    + `${season}_${pad}_HOU_JAX,${season},REG,${week},${day(6)},Sunday,13:00,HOU,,JAX,,Home`;
}

test('the commissioner reaches every tool; status, week opening and referees use the real routes', async ({ page, baseURL }, testInfo) => {
  const world = await communityWorld(page, baseURL, { groupScreens: true, virtualUnits: true });
  try {
    const { week: open } = (await world.api('sean', 'community/read', {})).body;
    world.schedule = async () => scheduleFor(open.season, open.week + 1);
    const chunks = [];
    page.on('request', request => { if (/\/assets\/CommissionerTools-[^/]+\.js$/.test(new URL(request.url()).pathname)) chunks.push(request.url()); });
    await openMenu(page, 'sean');
    expect(chunks).toHaveLength(0);
    await page.getByRole('button', { name: 'Commissioner tools', exact: true }).click();
    for (const name of ['Schedule and settlement status', 'Week opening', 'Game referees', 'Final scores', 'Odds connection']) {
      await expect(sheet(page).getByRole('button', { name, exact: true })).toBeVisible();
    }
    expect(chunks).toHaveLength(1);
    await checkLayout(page, testInfo, 'hub');

    // Status: the D-24 scheduler row, the odds schedule and the Virtual Units settlement, which runs only when asked.
    let settles = 0;
    await page.route(endpoint('virtual-units/settle'), async route => {
      settles++;
      expect(route.request().postDataJSON()).toEqual({ season: open.season, week: open.week });
      await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { week: open.week, finals: 2, settled: 2, corrected: 0, unchanged: 0, picksSettled: 0, pending: [], skipped: [] } });
    });
    await tool(page, 'Schedule and settlement status');
    await expect(sheet(page).locator('[data-status="week-open"]')).toContainText(/Enabled|Disabled|Not configured/);
    await expect(sheet(page).locator('[data-status="odds"]')).toContainText(/refresh|schedule/i);
    await expect(sheet(page).locator('[data-status="settlement"]')).toContainText(`Week ${open.week}`);
    await checkLayout(page, testInfo, 'status');
    await sheet(page).getByRole('button', { name: 'Settle finals now', exact: true }).click();
    await expect(sheet(page).getByText(`Settled Week ${open.week} from 2 published finals: 2 new, 0 corrected, 0 unchanged, 0 picks graded.`)).toBeVisible();
    expect(settles).toBe(1);
    await back(page);

    // Week opening: review writes nothing; publishing opens the next week once.
    const slates = async () => (await world.db.query('select season,week from public.gtl_weekly_slates order by season,week')).rows;
    const before = await slates();
    await tool(page, 'Week opening');
    await expect(sheet(page).getByLabel('Week', { exact: true })).toHaveValue(String(open.week + 1));
    await sheet(page).getByRole('button', { name: 'Review schedule', exact: true }).click();
    await expect(sheet(page).getByRole('list', { name: `Week ${open.week + 1} schedule` })).toContainText('Seattle Seahawks @ Denver Broncos');
    expect(await slates()).toEqual(before);
    await checkLayout(page, testInfo, 'weeks');
    // Publishing refreshes the Community week; the notice must survive that refresh, not only the moment before it.
    const refreshed = page.waitForResponse(response => endpoint('community/read')(new URL(response.url())) && response.request().method() === 'POST');
    await sheet(page).getByRole('button', { name: `Publish Week ${open.week + 1}`, exact: true }).click();
    await refreshed;
    await expect(sheet(page).getByText(`Week ${open.week + 1} is open.`, { exact: true })).toBeVisible();
    expect(await slates()).toEqual([...before, { season: open.season, week: open.week + 1 }]);
    await back(page);

    // Game referees: the week's game list from the trends file, or its plain "not published yet" line.
    await tool(page, 'Game referees');
    await expect(sheet(page).locator('[data-commissioner-tool="referees"]')).toContainText(/Week \d+\. Pick each game’s referee/);
    await expect(sheet(page).getByRole('combobox').first().or(sheet(page).getByText(/trends file is not published yet/))).toBeVisible();
    await checkLayout(page, testInfo, 'referees');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Final scores reuses the old editor and Odds connection is native for the Triple Threat commissioner', async ({ page, baseURL }, testInfo) => {
  const world = await communityWorld(page, baseURL, { groupScreens: true });
  try {
    // This fixture has no reviewed-results service, so /state is read for real and opened for review here: the first game
    // kicked off three hours ago. The write itself is answered by the spec.
    await page.route(endpoint('state'), async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers() }));
      const body = await response.json();
      expect(response.status).toBe(200);
      body.games[0].kickoff = new Date(Date.now() - 3 * 3_600_000).toISOString();
      body.resultReview = { ...body.resultReview, available: true, games: {} };
      await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: body });
    });
    const reviews = [];
    await page.route(endpoint('results/review'), async route => {
      const sent = route.request().postDataJSON(); reviews.push(sent);
      await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { status: 'final', season: sent.season, week: sent.week, gameId: sent.gameId, version: 1, reviewedAt: new Date().toISOString() } });
    });
    // Odds replies, in order: a check still running, the same check finished with too few credits, a fresh check with
    // enough, then the fetch. Market values in a reply must never reach the page.
    const odds = [], preflights = [
      { status: 'running' },
      { status: 'succeeded', matchedEvents: 2, quota: { remaining: 51, last: 0 } },
      { status: 'succeeded', matchedEvents: 2, quota: { remaining: 400, last: 0 } },
    ];
    await page.route(url => endpoint('odds/preflight')(url) || endpoint('odds/collect')(url), async route => {
      const operation = new URL(route.request().url()).pathname.split('/').at(-1);
      odds.push({ operation, requestId: route.request().postDataJSON().requestId });
      await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: operation === 'preflight' ? preflights.shift()
        : { status: 'succeeded', matchedEvents: 2, availableQuotes: 6, quota: { remaining: 398, last: 2 }, quotes: [{ spread: -13.25 }] } });
    });
    await openTools(page);
    await tool(page, 'Final scores');
    const form = sheet(page);
    await expect(form.getByRole('heading', { name: 'Commissioner final-result review', exact: true })).toBeVisible();
    await form.getByLabel(/^Away · /).fill('24');
    await form.getByLabel(/^Home · /).fill('17');
    await form.getByLabel('Final-score source name', { exact: true }).fill('Fixture source');
    await form.getByLabel('Final-score source URL · HTTPS', { exact: true }).fill('https://example.test/final');
    const observed = await page.evaluate(() => { const at = new Date(Date.now() - 30 * 60_000); at.setSeconds(0, 0); return new Date(at - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); });
    expect(observed).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    await form.getByLabel(/^Final observed · /).fill(observed);
    await form.getByLabel('Review or correction reason', { exact: true }).fill('Checked the fixture final score.');
    await form.getByRole('checkbox').check();
    await checkLayout(page, testInfo, 'results');
    await form.getByRole('button', { name: 'Review final result', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm commissioner-reported final', exact: true }).click();
    await expect(page.getByText('Final result saved · Version 1', { exact: true })).toBeVisible();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ away: 24, home: 17, source: 'Fixture source', sourceURL: 'https://example.test/final', expectedVersion: 0 });
    await back(page);

    await tool(page, 'Odds connection');
    const odd = sheet(page), check = odd.getByRole('button', { name: 'Check connection (zero-credit)', exact: true });
    const fetch = odd.getByRole('button', { name: 'Fetch current lines', exact: true });
    await expect(odd.locator('.gx-live-workflow')).toHaveCount(0);
    await expect(fetch).toBeDisabled();
    // A check that has not finished says so; checking again reuses its request id, so it never starts a second request.
    await check.click();
    await expect(odd.getByRole('alert')).toContainText('This request has not completed.');
    await expect(odd.getByText('Request not completed', { exact: true })).toBeVisible();
    await check.click();
    // It finished with too few credits: fetching stays off.
    await expect(odd.getByRole('alert')).toContainText('at least 52 free credits');
    await expect(fetch).toBeDisabled();
    await check.click();
    await expect(odd.getByText('Connection check completed', { exact: true })).toBeVisible();
    await expect(odd.getByRole('alert')).toHaveText('');
    await expect(fetch).toBeEnabled();
    await checkLayout(page, testInfo, 'odds');
    await fetch.click();
    await expect(odd.getByText('Manual fetch completed', { exact: true })).toBeVisible();
    await expect(odd.locator('[data-odds="result"]')).toContainText('Available quotes saved6');
    await expect(odd).not.toContainText('13.25');
    await checkLayout(page, testInfo, 'odds-fetched');
    // The native page also passes the phone rules: nothing leaves its box, overflows or overlaps at 320.
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(layoutProblems), 'odds 320').toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(odds.map(call => call.operation)).toEqual(['preflight', 'preflight', 'preflight', 'collect']);
    expect(odds[1].requestId).toBe(odds[0].requestId);
    expect(new Set(odds.map(call => call.requestId)).size).toBe(3);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a player sees no commissioner tools, and the routes refuse them', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { groupScreens: true });
  try {
    await openMenu(page, 'luke');
    await expect(sheet(page).getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Commissioner tools', exact: true })).toHaveCount(0);
    const { week } = (await world.api('luke', 'community/read', {})).body;
    expect((await world.api('luke', 'community/publish-preview', { season: week.season, week: week.week + 1 })).status).toBe(403);
    expect((await world.api('luke', 'officials/set', { season: week.season, week: week.week, gameId: world.state.games[0].id, referee: null })).status).toBe(403);
    expect((await world.api('luke', 'state?league=sean-troy-luke&mode=guess_spread')).body.resultReview).toBeUndefined();
    expect(ACCOUNTS.luke.role).toBe('player');
  } finally { await world.db.close(); }
});
