// Kickoff wind forecast in the browser (D-34): the real handler and the wind migration on local PGlite
// (the community-world pattern) with a builder-backed Open-Meteo stand-in that records every request.
// The browser never leaves the app and the mocked Supabase origin (community-world aborts anything
// else), and nothing here contacts Open-Meteo or the hosted project. Fixture kickoffs are within a day
// of now and every time decision uses the real database clock, so no lead-dependent text is asserted.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { communityWorld, pgliteAvailable, signIn, switchAccount } from './community-world.mjs';
import { createOpenMeteoProvider } from '../../cloud/open-meteo.mjs';
import { forecastFetch } from '../fixtures/open-meteo/build.mjs';

const TEAMS = { SEA: 'Seattle Seahawks', DEN: 'Denver Broncos', HOU: 'Houston Texans', JAX: 'Jacksonville Jaguars', BUF: 'Buffalo Bills', LV: 'Las Vegas Raiders', CHI: 'Chicago Bears', ATL: 'Atlanta Falcons',
  ARI: 'Arizona Cardinals', LAR: 'Los Angeles Rams' };
/** The committed trends file is 2026 Week 6; the fixture week uses two of its games so the panel has real data. */
const week6 = ids => state => {
  state.league.season = 2026; state.league.week = 6;
  state.games = ids.map((id, i) => {
    const [away, home] = id.split('-');
    return { ...state.games[i], id, away: TEAMS[away], home: TEAMS[home], awayCode: away, homeCode: home, matchup: `${TEAMS[away]} @ ${TEAMS[home]}` };
  });
};
const VALUES = {
  '39.744': { wind_speed_10m: 14.2, wind_gusts_10m: 27.5, wind_direction_10m: 247, temperature_2m: 49.3, precipitation_probability: 25 },
  '51.556': { wind_speed_10m: 16.4, wind_gusts_10m: 31.2, wind_direction_10m: 225, temperature_2m: 57.2, precipitation_probability: 40 },
  '33.755': { wind_speed_10m: 12.1, wind_gusts_10m: 20.3, wind_direction_10m: 180, temperature_2m: 71.6, precipitation_probability: 5 },
};
const stub = (options = {}) => forecastFetch(point => ({ values: () => VALUES[point.latitude.toFixed(3)] ?? {} }), options);
const openPanel = async (page, label) => {
  const expander = page.getByRole('button', { name: label, exact: true });
  if (await expander.getAttribute('aria-expanded') !== 'true') await expander.click();
  return page.locator(`#${await expander.getAttribute('aria-controls')}`);
};
const showTrends = async page => {
  await page.getByRole('button', { name: /^Picks/ }).click();
  const toggle = page.getByRole('button', { name: 'Show trends', exact: true });
  if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
};

test.beforeEach(() => { test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'); });

test('wind: a member sees the kickoff forecast with its credit; one Open-Meteo request serves every panel and member', async ({ page, baseURL }) => {
  const fake = stub();
  const world = await communityWorld(page, baseURL, { prepare: week6(['SEA-DEN', 'HOU-JAX']), troyBallots: false, wind: createOpenMeteoProvider({ fetchImpl: fake.fetchImpl }) });
  await signIn(page, 'luke');
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await showTrends(page);
  const den = await openPanel(page, 'Trends for SEA at DEN');
  const card = den.locator('section.trend-wind');
  await expect(card.getByRole('heading', { name: 'Kickoff wind forecast' })).toBeVisible();
  await expect(card).toContainText('Empower Field at Mile High, Denver');
  await expect(card).toContainText('14.2 mph from the WSW');
  await expect(card).toContainText('up to 27.5 mph in the kickoff hour');
  await expect(card).toContainText('10–14 mph band: if this holds, the Strong wind (10+ mph) Under card would fit this game');
  await expect(card).toContainText('Using it with a forecast has not been backtested');
  await expect(card).toContainText('Results 2018-2025 (period used to select this card): 282-196-5');
  await expect(card.getByRole('link', { name: 'Weather data by Open-Meteo.com' })).toHaveAttribute('href', 'https://open-meteo.com/');
  await expect(card.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  await expect(den.locator('footer.trends-source').getByRole('link', { name: 'Weather data by Open-Meteo.com' })).toBeVisible();
  await expect(den).toContainText('Applies only if kickoff wind is 10+ mph; see the kickoff wind forecast above');
  const axe = await new AxeBuilder({ page }).include(`#${await page.getByRole('button', { name: 'Trends for SEA at DEN', exact: true }).getAttribute('aria-controls')}`).analyze();
  expect(axe.violations.map(v => `${v.id}: ${v.nodes.length}`)).toEqual([]);

  const lon = await openPanel(page, 'Trends for HOU at JAX');
  await expect(lon.locator('section.trend-wind')).toContainText('Wembley Stadium, London (international)');
  await expect(lon.locator('section.trend-wind')).toContainText('16.4 mph');
  await expect(lon.locator('section.trend-wind')).toContainText('15+ mph band: if this holds, both wind cards would fit');
  expect(fake.calls).toHaveLength(1);
  const query = new URL(fake.calls[0].url).searchParams;
  expect([query.get('latitude'), query.get('longitude')]).toEqual(['39.744,51.556', '-105.020,-0.280']);
  expect(JSON.stringify(fake.calls[0].init.headers)).toBe('{"Accept":"application/json"}');

  // Closing and reopening, and another member's visit, are served from storage.
  await page.getByRole('button', { name: 'Trends for SEA at DEN', exact: true }).click();
  await openPanel(page, 'Trends for SEA at DEN');
  await expect(page.locator('section.trend-wind').first()).toContainText('14.2 mph');
  await switchAccount(page, 'troy');
  await showTrends(page);
  const troy = await openPanel(page, 'Trends for SEA at DEN');
  await expect(troy.locator('section.trend-wind')).toContainText('14.2 mph');
  const direct = await world.api('troy', 'wind/read', { season: 2026, week: 6 });
  expect(direct.status).toBe(200);
  expect(['not_due', 'cooldown']).toContain(direct.body.refresh.outcome);
  expect(fake.calls).toHaveLength(1);
  const counts = (await world.db.query('select (select count(*)::int from public.gtl_wind_forecasts) forecasts, (select count(*)::int from public.gtl_wind_fetches) fetches')).rows[0];
  expect(counts).toEqual({ forecasts: 2, fetches: 1 });
  expect(world.errors).toEqual([]);
});

test('wind: a dome says Indoors with no forecast or credit; a retractable roof shows "Roof may close" and the roof note', async ({ page, baseURL }) => {
  const fake = stub();
  const world = await communityWorld(page, baseURL, { prepare: week6(['BUF-LV', 'CHI-ATL']), troyBallots: false, wind: createOpenMeteoProvider({ fetchImpl: fake.fetchImpl }) });
  await signIn(page, 'luke');
  await showTrends(page);
  const dome = await openPanel(page, 'Trends for BUF at LV');
  await expect(dome.locator('.trend-weather[data-kind="indoors"]')).toHaveText('Kickoff weather: Indoors · Allegiant Stadium, Las Vegas');
  await expect(dome).toContainText('Strong wind trends do not apply indoors (dome or closed roof).');
  await expect(dome.locator('section.trend-wind')).toHaveCount(0);
  await expect(dome.getByRole('link', { name: 'Weather data by Open-Meteo.com' })).toHaveCount(0);
  const roof = await openPanel(page, 'Trends for CHI at ATL');
  await expect(roof.locator('section.trend-wind')).toContainText('Mercedes-Benz Stadium, Atlanta');
  await expect(roof.locator('section.trend-wind .trend-wind-roof')).toHaveText('Roof may close');
  await expect(roof.locator('section.trend-wind')).toContainText('Retractable roof: the wind matters only if the roof is open, which is decided on game day.');
  expect(fake.calls).toHaveLength(1);
  expect(new URL(fake.calls[0].url).searchParams.get('latitude')).toBe('33.755');
  expect(world.errors).toEqual([]);
});

test('wind: when Open-Meteo fails the panel keeps the fallback note, stores the fixed code and shows no provider text', async ({ page, baseURL }) => {
  const failing = { calls: [], fetchImpl: async (url, init) => { failing.calls.push({ url, init }); return new Response('{"error":true,"reason":"The service is overloaded"}', { status: 503, headers: { 'content-type': 'application/json' } }); } };
  const world = await communityWorld(page, baseURL, { prepare: week6(['SEA-DEN', 'HOU-JAX']), troyBallots: false, wind: createOpenMeteoProvider({ fetchImpl: failing.fetchImpl }) });
  await signIn(page, 'luke');
  await showTrends(page);
  const panel = await openPanel(page, 'Trends for SEA at DEN');
  await expect(panel).toContainText('Applies only if kickoff wind is 10+ mph; no current forecast for this game');
  await expect(panel.locator('.trend-weather[data-kind="none"]')).toHaveText('Kickoff weather: no current forecast for this game.');
  await expect(panel.locator('section.trend-wind')).toHaveCount(0);
  await expect(panel).not.toContainText('mph from the');
  await expect(page.locator('body')).not.toContainText('overloaded');
  expect(failing.calls).toHaveLength(1);
  const outcome = (await world.db.query('select status,error_code,http_status,stored from public.gtl_wind_fetch_outcomes')).rows;
  expect(outcome).toEqual([{ status: 'failed', error_code: 'WIND_UNAVAILABLE', http_status: 503, stored: 0 }]);
  expect((await world.db.query('select count(*)::int n from public.gtl_wind_forecasts')).rows[0].n).toBe(0);
  expect(world.errors).toEqual([]);
});

// D-45: every game gets a weather row. One world, one Open-Meteo request (Atlanta only: never the Las Vegas dome or
// SoFi), then each panel at 320, 390 and 1440 px in Light and Dark: no sideways scroll, axe clean, screenshots for review.
test('weather on every game: Indoors for a dome and for SoFi, and "Roof may close", at 320, 390 and 1440 px in Light and Dark', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const fake = stub();
  const world = await communityWorld(page, baseURL, { games: 3, prepare: week6(['BUF-LV', 'ARI-LAR', 'CHI-ATL']), troyBallots: false, wind: createOpenMeteoProvider({ fetchImpl: fake.fetchImpl }) });
  await signIn(page, 'luke');
  // signIn only clicks the button: wait until the session is stored, or the reload below can cancel the sign-in.
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await showTrends(page);
    const dome = await openPanel(page, 'Trends for BUF at LV');
    const sofi = await openPanel(page, 'Trends for ARI at LAR');
    const atl = await openPanel(page, 'Trends for CHI at ATL');
    await expect(dome.locator('.trend-weather[data-kind="indoors"]')).toHaveText('Kickoff weather: Indoors · Allegiant Stadium, Las Vegas');
    await expect(dome.locator('section.trend-wind')).toHaveCount(0);
    await expect(dome.getByRole('link', { name: 'Weather data by Open-Meteo.com' })).toHaveCount(0);
    await expect(sofi.locator('.trend-weather[data-kind="indoors"]')).toHaveText('Kickoff weather: Indoors · SoFi Stadium, Inglewood');
    await expect(sofi.locator('section.trend-wind')).toHaveCount(0);
    await expect(sofi.getByRole('link', { name: 'Weather data by Open-Meteo.com' })).toHaveCount(0);
    await expect(sofi).toContainText('Strong wind trends do not apply indoors (dome or closed roof).');
    const roof = atl.locator('section.trend-wind');
    await expect(roof.locator('.trend-wind-roof')).toHaveText('Roof may close');
    await expect(roof).toContainText('Mercedes-Benz Stadium, Atlanta');
    await expect(roof.getByRole('link', { name: 'Weather data by Open-Meteo.com' })).toHaveAttribute('href', 'https://open-meteo.com/');
    await expect(roof.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: width < 720 ? 844 : 1000 });
      await roof.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}`).toBe(true);
      for (const box of [await roof.boundingBox(), await dome.locator('.trend-weather').boundingBox(), await sofi.locator('.trend-weather').boundingBox()]) {
        expect(box.x + box.width, `${theme} ${width}`).toBeLessThanOrEqual(width);
      }
      await page.screenshot({ path: testInfo.outputPath(`weather-${theme}-${width}.png`), fullPage: false });
      await roof.screenshot({ path: `.local/previews/weather-atl-${theme}-${width}.png` });
      await sofi.locator('.trend-weather').screenshot({ path: `.local/previews/weather-sofi-${theme}-${width}.png` });
    }
    for (const label of ['Trends for BUF at LV', 'Trends for ARI at LAR', 'Trends for CHI at ATL']) {
      const axe = await new AxeBuilder({ page }).include(`#${await page.getByRole('button', { name: label, exact: true }).getAttribute('aria-controls')}`).analyze();
      expect(axe.violations.map(v => `${theme} ${label} ${v.id}: ${v.nodes.length}`)).toEqual([]);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  expect(fake.calls).toHaveLength(1);
  expect(new URL(fake.calls[0].url).searchParams.get('latitude')).toBe('33.755');
  expect((await world.db.query('select game_id from public.gtl_wind_forecasts order by game_id')).rows.map(r => r.game_id)).toEqual(['CHI-ATL']);
  expect(world.errors).toEqual([]);
});
