import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn, sendBallot, storeBookLines } from './community-world.mjs';
import { HOSTED } from '../migrations.mjs';
import { setCaptureTheme } from './theme-capture.mjs';

// These recommendations use fictional saved guesses, retained three-book quotes, the hosted schema plus this
// release's additive writer on PGlite. The network fixture rejects unmocked external traffic; no real bet is placed.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const view = (page, name) => page.getByRole('group', { name: 'Bets view' }).getByRole('button', { name, exact: true });
async function selectTracker(page,label,value){
 const control=page.getByLabel(label,{exact:true});
 if(!await control.isVisible())await page.locator('.social-filters > summary').click();
 await control.selectOption(value);
}

const cards = page => page.locator('.recommended-bet-card');
// BETS-NEXT-01: the All / Spreads / Totals choice and what each card shows.
const marketFilter = page => page.getByRole('group', { name: 'Recommendation market', exact: true });
const market = (page, name) => marketFilter(page).getByRole('button', { name, exact: true });
const cardMarkets = page => cards(page).evaluateAll(list => list.map(card => card.dataset.market));
const gapSizes = page => cards(page).locator('.recommended-percent').allTextContents();
const region = page => page.getByRole('region', { name: 'Recommended bets', exact: true });
async function openTotal(page, gameId) {
  const card = page.locator(`.recommended-bet-card[data-game-id="${gameId}"][data-market="total"]`);
  if (await card.count() === 0) await page.getByRole('button', { name: /Show all/i }).click();
  await card.locator('summary').click();
  return card;
}
// Player feedback (October 28, 2026): a saved recommendation keeps the player on Recommended; the toast offers My bets.
const savedToast = page => page.locator('.gx-toast').filter({ hasText: 'Bet saved to My bets' });
async function viewSavedTicket(page) {
  await savedToast(page).getByRole('button', { name: 'View', exact: true }).click();
  await expect(view(page, 'Tracked bets')).toHaveAttribute('aria-pressed', 'true');
}
async function playTotal(page, world) {
  await (await openTotal(page, world.state.games[0].id)).getByRole('button', { name: 'Play with Virtual Units', exact: true }).click();
}
function requests(page) {
  const calls = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === SUPABASE && url.pathname.includes('/gtl-api/')) calls.push({
      path: url.pathname.split('/gtl-api/')[1], query: url.search,
      body: request.method() === 'POST' ? request.postDataJSON() : null,
    });
  });
  return calls;
}
const placements = calls => calls.filter(call => call.path === 'bets/recommendations/place');
const picksCount = async world => Number((await world.db.query('select count(*) as n from public.gtl_virtual_units_picks where user_id=$1', [ACCOUNTS.luke.id])).rows[0].n);
const migrations = [...new Set([...HOSTED, '20261015143006_gtl_recommended_virtual_pick.sql'])].sort();

async function fixture(page, baseURL, { games = 4, spread = true, total = true, clock } = {}) {
  const world = await communityWorld(page, baseURL, { games, groupScreens: true, virtualUnits: true, optionalRpc: true, migrations, ...(clock ? { clock } : {}) });
  world.lines = {
    spread: Object.fromEntries(world.state.games.map(game => [game.id, -3.5])),
    total: Object.fromEntries(world.state.games.map(game => [game.id, 44.5])),
  };
  world.observedAt = await storeBookLines(world, world.lines);
  world.guesses = {
    spread: Object.fromEntries(world.state.games.map((game, i) => [game.id, [-10, -7, -5, -3][i]])),
    total: Object.fromEntries(world.state.games.map((game, i) => [game.id, [55, 49, 43, 44.5][i]])),
  };
  if (spread) await sendBallot(world, 'luke', 'guess_spread', world.guesses.spread);
  if (total) await sendBallot(world, 'luke', 'guess_total', world.guesses.total);
  return world;
}

async function openRecommended(page) {
  await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('/#bets');
  await signIn(page, 'luke', { navigate: false });
  await expect(page.getByRole('heading', { name: 'Bets', level: 1, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Your guess vs. market', exact: true }).click();
  await expect(page.locator('.virtual-units')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh lines', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Choose league', exact: true })).toHaveCount(0);
}

async function publishNextWeek(world) {
  const { season, week } = world.state.league;
  const signature = (await world.db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
  const next = { ...signature, week: week + 1, deadline: signature.deadline + 7 * 86400,
    games: signature.games.map(game => ({ ...game, kickoff: game.kickoff + 7 * 86400 })) };
  await world.db.query('insert into public.gtl_weekly_slates(season,week,signature) values($1,$2,$3)', [season, week + 1, next]);
  await world.db.query('insert into public.gtl_schedule_templates(id,season,week,games,deadline,schedule_source) values($1,$2,$3,$4,$5,$6)',
    [`fixture-history-${week + 1}`, season, week + 1,
      world.state.games.map(game => ({ ...game, kickoff: new Date(Date.parse(game.kickoff) + 7 * 86400000).toISOString() })),
      new Date(next.deadline * 1000).toISOString(), 'Synthetic recommendation history schedule fixture']);
  return { season, week: week + 1 };
}

// Two explicitly synthetic historical boards exercise the real period/controller
// lifecycle. The initial board comes through the fixture's authenticated reader;
// its second-week copy is fixture data, not a claim about retained live history.
async function gapPeriodFixture(page, baseURL) {
  let at = Date.now();
  const world = await fixture(page, baseURL, { clock: () => at });
  const { season, week } = world.state.league;
  for (const game of world.state.games) {
    await world.db.query("insert into public.gtl_virtual_units_settlements(season,week,game_id,version,status,home,away,source,observed_at) values($1,$2,$3,1,'final',27,20,'Synthetic period final',now())", [season, week, game.id]);
  }
  at = Math.max(...world.state.games.map(game => Date.parse(game.kickoff))) + 4 * 3_600_000;
  const old = await world.api('luke', 'lines/read', { season, week });
  expect(old.status).toBe(200);
  const next = await publishNextWeek(world);
  await page.route(`${SUPABASE}/functions/v1/gtl-api/lines/read`, async route => {
    if (route.request().headers().authorization !== `Bearer ${world.sessions[ACCOUNTS.luke.email].access_token}`) return route.fallback();
    const scope = route.request().postDataJSON();
    expect(scope.season).toBe(season);
    expect([week, next.week]).toContain(scope.week);
    await route.fulfill({ json: { ...old.body, ...scope } });
  });
  return { world, season, week, next };
}

test('gap record periods and applied custom bounds survive recommendation-week changes and refresh', async ({ page, baseURL }) => {
  const { world, season, week, next } = await gapPeriodFixture(page, baseURL);
  try {
    const calls = requests(page);
    await openRecommended(page);
    const period = page.getByRole('combobox', { name: 'Record period', exact: true });
    const recommendation = page.getByRole('combobox', { name: 'Recommendation week', exact: true });
    const card = page.getByRole('region', { name: 'Your gaps vs. closing lines', exact: true });
    await period.selectOption('all');
    await expect(card).toContainText('14 graded gaps');
    await recommendation.selectOption(`${season}:${week}`);
    await expect(card).toContainText('14 graded gaps');
    await expect(period).toHaveValue('all');
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    await expect(period).toHaveValue('all');
    await expect(card).toContainText('14 graded gaps');
    await period.selectOption('custom');
    await card.getByLabel('From', { exact: true }).selectOption(`${season}:${week}`);
    await card.getByLabel('To', { exact: true }).selectOption(`${season}:${week}`);
    await card.getByRole('button', { name: 'Apply range', exact: true }).click();
    await expect(card).toContainText('7 graded gaps');
    await recommendation.selectOption('current');
    await expect(period).toHaveValue('custom');
    await expect(card.getByLabel('From', { exact: true })).toHaveValue(`${season}:${week}`);
    await expect(card.getByLabel('To', { exact: true })).toHaveValue(`${season}:${week}`);
    await expect(card).toContainText('7 graded gaps');
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    await expect(period).toHaveValue('custom');
    await expect(card).toContainText('7 graded gaps');
    await period.selectOption('season');
    await recommendation.selectOption(`${season}:${week}`);
    await expect(period).toHaveValue('season');
    await expect(card).toContainText('14 graded gaps');
    await period.selectOption('week');
    await recommendation.selectOption('current');
    await expect(period).toHaveValue('week');
    await expect(card.getByRole('heading', { name: `Your gaps · Week ${next.week}`, exact: true })).toBeVisible();
    expect(placements(calls)).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('expanded gap records show every row when the period grows and can collapse again', async ({ page, baseURL }) => {
  const { world } = await gapPeriodFixture(page, baseURL);
  try {
    await openRecommended(page);
    const card = page.getByRole('region', { name: 'Your gaps vs. closing lines', exact: true });
    await card.getByRole('button', { name: 'Show all 7 gaps', exact: true }).click();
    await expect(card.locator('.gx-gap-row')).toHaveCount(7);
    await card.getByRole('combobox', { name: 'Record period', exact: true }).selectOption('all');
    await expect(card).toContainText('14 graded gaps');
    await expect(card.locator('.gx-gap-row')).toHaveCount(14);
    await card.getByRole('button', { name: 'Show first 6', exact: true }).click();
    await expect(card.locator('.gx-gap-row')).toHaveCount(6);
    await card.getByRole('button', { name: 'Show all 14 gaps', exact: true }).click();
    await expect(card.locator('.gx-gap-row')).toHaveCount(14);
    await card.getByRole('combobox', { name: 'Record period', exact: true }).selectOption('week');
    await expect(card.locator('.gx-gap-row')).toHaveCount(7);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('gap period preference and combined records reset after a real fixture sign-out and account change', async ({ page, baseURL }) => {
  const { world } = await gapPeriodFixture(page, baseURL);
  try {
    await openRecommended(page);
    const period = page.getByRole('combobox', { name: 'Record period', exact: true });
    const card = page.getByRole('region', { name: 'Your gaps vs. closing lines', exact: true });
    await period.selectOption('all');
    await expect(card).toContainText('14 graded gaps');
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'troy', { navigate: false });
    await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toBeVisible();
    await page.goto('/#bets');
    await page.getByRole('button', { name: 'Your guess vs. market', exact: true }).click();
    await expect(period).toHaveValue('week');
    await expect(card).toContainText('0 graded gaps');
    await expect(card).not.toContainText('14 graded gaps');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

async function moveBrowserPastKickoff(page, game) {
  // Only the fictional browser clock moves. The kickoff timer's visibility handler
  // must close the already open card without an API read or an attempted write.
  await page.evaluate(now => {
    Date.now = () => now;
    document.dispatchEvent(new Event('visibilitychange'));
  }, Date.parse(game.kickoff) + 1000);
}

test('a reviewed recommendation becomes one actual tracked ticket and survives reload', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    await openRecommended(page);
    // Returning from a remembered All weeks list must still open the exact recommendation week.
    await view(page, 'Tracked bets').click();
    await selectTracker(page,'Competition week','all');
    await expect(page.getByLabel('Competition week')).toHaveValue('all');
    await view(page, 'Your guess vs. market').click();
    const gameId = world.state.games[0].id, card = await openTotal(page, gameId);
    await card.getByRole('button', { name: 'Track this bet', exact: true }).click();
    await expect(view(page, 'Your guess vs. market')).toHaveAttribute('aria-pressed', 'true');
    const editor = page.getByRole('dialog', { name: 'Review recommended bet' });
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('group', { name: 'Units risked', exact: true }).getByRole('button', { name: 'Unknown', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(editor.getByRole('button', { name: 'Save tracked bet', exact: true })).toBeDisabled();
    expect(calls.filter(call => call.path === 'social/create')).toHaveLength(0);
    expect(placements(calls)).toHaveLength(0);
    await editor.getByLabel('I placed this bet elsewhere and checked these ticket terms.').check();
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    const writes = calls.filter(call => call.path === 'social/create');
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({
      season: world.state.league.season, week: world.state.league.week,
      origin: 'tracked', kind: 'single', stakeUnits: null, placedAt: null,
      legs: [{ gameId, market: 'total', side: 'over', line: 44.5 }],
    });
    expect(writes[0].body.source).toBeTruthy();
    expect(writes[0].body.quotedAt).toBe(world.observedAt);
    expect(await picksCount(world)).toBe(0);
    await expect(view(page, 'Your guess vs. market')).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toHaveAttribute('open', '');
    await viewSavedTicket(page);
    await expect(page.locator('.gx-tracked-row')).toHaveCount(1);
    await expect(page.locator('.gx-tracked-row')).toContainText('Over 44.5');
    await page.reload();
    await expect(page.locator('.gx-tracked-row')).toHaveCount(1);
    await page.locator('.gx-tracked-preview').click();
    await page.locator('.gx-tracked-menu').click();
    await expect(page.locator('.social-bet-card')).toContainText(writes[0].body.source);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

// Player feedback (October 28, 2026): "after I load a bet in I want it to stay on the recommendations screen".
for (const width of [390, 320]) test(`two recommended bets save in a row without leaving Recommended at ${width}px`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: 844 });
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), [first, second] = world.state.games;
    await openRecommended(page);
    await market(page, 'Totals').click();
    // The first bet is reviewed in dark and the second in light, so each width is seen in both themes.
    for (const [game, theme] of [[first, 'dark'], [second, 'light']]) {
      await setCaptureTheme(page, theme);
      const card = await openTotal(page, game.id);
      await card.getByRole('button', { name: 'Track this bet', exact: true }).click();
      const editor = page.getByRole('dialog', { name: 'Review recommended bet' });
      await expect(editor).toBeVisible();
      expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${theme} ${width}px editor fits`).toBe(true);
      await page.screenshot({ path: `.local/previews/recommended-review-${theme}-${width}.png` });
      const scrolled = await page.evaluate(() => window.scrollY);
      await editor.getByLabel('I placed this bet elsewhere and checked these ticket terms.').check();
      await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
      await expect(editor).toHaveCount(0);
      await expect(savedToast(page)).toBeVisible();
      await expect(view(page, 'Your guess vs. market')).toHaveAttribute('aria-pressed', 'true');
      await expect(market(page, 'Totals')).toHaveAttribute('aria-pressed', 'true');
      await expect(card).toHaveAttribute('open', '');
      expect(Math.abs(await page.evaluate(() => window.scrollY) - scrolled)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${theme} ${width}px page fits`).toBe(true);
      await page.screenshot({ path: `.local/previews/recommended-saved-${theme}-${width}.png` });
    }
    const writes = calls.filter(call => call.path === 'social/create');
    expect(writes.map(call => call.body.legs[0].gameId)).toEqual([first.id, second.id]);
    expect(writes.every(call => call.body.origin === 'tracked' && call.body.stakeUnits === null && call.body.quotedAt === world.observedAt)).toBe(true);
    expect(placements(calls)).toHaveLength(0);
    expect(await picksCount(world)).toBe(0);
    await viewSavedTicket(page);
    await expect(page.locator('.gx-tracked-row')).toHaveCount(2);
    await expect(page.getByLabel('Competition week')).toHaveValue(`${world.state.league.season}:${world.state.league.week}`);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('cancelling a recommendation review writes neither a tracked ticket nor a virtual pick', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    await openRecommended(page);
    await (await openTotal(page, world.state.games[0].id)).getByRole('button', { name: 'Track this bet', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Review recommended bet' });
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(view(page, 'Your guess vs. market')).toHaveAttribute('aria-pressed', 'true');
    await expect(savedToast(page)).toHaveCount(0);
    expect(calls.filter(call => call.path === 'social/create')).toHaveLength(0);
    expect(placements(calls)).toHaveLength(0);
    await view(page, 'Tracked bets').click();
    await expect(page.locator('.gx-tracked-row')).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('recommendation ticket recovery keeps its original week and does not duplicate a committed save', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), week = world.state.league.week;
    await openRecommended(page);
    await (await openTotal(page, world.state.games[0].id)).getByRole('button', { name: 'Track this bet', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Review recommended bet' });
    await expect(editor).toBeVisible();
    await publishNextWeek(world);
    await editor.getByLabel('I placed this bet elsewhere and checked these ticket terms.').check();
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/social/create'), async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      expect(response.status).toBe(200);
      await response.text();
      await route.abort('failed');
    }, { times: 1 });
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('could not confirm');
    await editor.getByRole('button', { name: 'Check saved bets', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Retry same save', exact: true })).toBeEnabled();
    await editor.getByRole('button', { name: 'Retry same save', exact: true }).click();
    await expect(editor).toHaveCount(0);
    const writes = calls.filter(call => call.path === 'social/create');
    expect(writes).toHaveLength(2);
    expect(writes[0].body.week).toBe(week);
    expect(writes[1].body).toEqual(writes[0].body);
    await viewSavedTicket(page);
    await expect(page.locator('.gx-tracked-row')).toHaveCount(1);
    await expect(page.locator('.gx-tracked-row')).toContainText(`Week ${week}`);
    await expect(page.getByLabel('Competition week')).toHaveValue(`${world.state.league.season}:${week}`);
    expect(await picksCount(world)).toBe(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('saved guesses rank the top three; expanding retains small gaps and both sides have text-labelled traffic lights on phones', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    await openRecommended(page);
    await expect(cards(page)).toHaveCount(3);
    await expect(cards(page).nth(0).locator('summary')).toContainText('Size 59.2/100');
    await expect(cards(page).nth(0).locator('summary')).toContainText('10.5 pt gap');
    await expect(cards(page).nth(1).locator('summary')).toContainText('Size 44.6/100');
    await expect(cards(page).nth(2).locator('summary')).toContainText('Size 29.2/100');
    await cards(page).first().locator('summary').click();
    await expect(cards(page).first().locator('[data-side="over"][data-value-color="yellow"]')).toContainText('Moderate gap');
    await expect(cards(page).first().locator('[data-side="under"][data-value-color="yellow"]')).toContainText('Moderate gap');
    expect(placements(calls)).toEqual([]);
    expect(await picksCount(world)).toBe(0);
    await page.screenshot({ path: '.local/previews/recommended-bets-top3-dark-390.png', fullPage: true });

    await page.getByRole('button', { name: /Show all/i }).click();
    await expect(cards(page)).toHaveCount(7);
    await expect(cards(page).last().locator('[data-value-color="yellow"]')).toHaveCount(2);
    await expect(cards(page).last()).toContainText('Small gap');
    await expect(cards(page).last().locator('summary')).toContainText('0.5 pt gap');
    expect(calls.filter(call => call.path === 'bets/recommendations').at(-1)?.body).toEqual({});
    expect(calls.some(call => call.path.startsWith('odds/') || call.path === 'virtual-units' || call.path === 'virtual-pick')).toBe(false);

    for (const theme of ['dark', 'light']) {
      await setCaptureTheme(page, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}px fits`).toBe(true);
        const scan = await new AxeBuilder({ page }).include('.gx-bets').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(scan.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
        await page.screenshot({ path: `.local/previews/recommended-bets-${theme}-${width}.png`, fullPage: true });
      }
    }
    await page.getByRole('button', { name: /Show top 3/i }).click();
    await expect(cards(page)).toHaveCount(3);
    // A refreshed synthetic spread makes a 14-point gap: the historical top
    // quarter is the same boundary used by the record, with explicit direction.
    await storeBookLines(world, { ...world.lines, spread: Object.fromEntries(world.state.games.map(game => [game.id, 4])) }, { capturedAt: Date.now() - 5000 });
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    const large = cards(page).first();
    await expect(large.locator('summary')).toContainText('14 pt gap');
    await expect(large.locator('summary')).toContainText('Large gap');
    await large.locator('summary').click();
    await expect(large.locator('[data-side="home"][data-value-color="green"]')).toContainText('Large gap in your direction');
    await expect(large.locator('[data-side="away"][data-value-color="red"]')).toContainText('Large gap against your guess');
    await page.getByRole('button', { name: 'About your guess vs. market', exact: true }).click();
    const info = page.getByRole('dialog', { name: 'About your guess vs. market' });
    await expect(info).toContainText('2,639 NFL regular-season games');
    await expect(info).toContainText('not a win probability');
    await expect(info.getByRole('link').first()).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Add to card only prepares the retained quote; explicit placement saves one current-week pick without overwriting it', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    const firstGame = world.state.games[0];
    await openRecommended(page);
    await expect(cards(page)).toHaveCount(3);
    await playTotal(page, world);
    await expect(page.getByRole('button', { name: 'Place virtual pick', exact: true })).toBeVisible();
    expect(placements(calls)).toEqual([]);
    expect(await picksCount(world)).toBe(0);
    await expect(page.locator('.virtual-units')).toContainText('44.5');
    await expect(page.locator('.virtual-units')).toContainText('BetMGM');
    await page.getByRole('button', { name: 'Place virtual pick', exact: true }).click();
    await expect.poll(() => placements(calls).length).toBe(1);
    expect(placements(calls)[0]).toEqual({ path: 'bets/recommendations/place', query: '', body: {
      season: world.state.league.season, week: world.state.league.week, revision: expect.any(Number),
      gameId: firstGame.id, market: 'total', side: 'over', line: 44.5, odds: -110, units: 1,
      source: 'betmgm', quotedAt: world.observedAt,
    } });
    await expect.poll(() => picksCount(world)).toBe(1);
    // Once saved this row follows actionable rows and leaves the top-three
    // preview; the saved card remains, and Show all exposes the saved row.
    await expect(page.locator('.recommended-saved-card')).toContainText('44.5');
    await page.getByRole('button', { name: /Show all/i }).click();
    await expect(page.locator(`.recommended-bet-card[data-game-id="${firstGame.id}"][data-market="total"]`)).toContainText(/Virtual pick saved|On your card|Already saved/);
    await page.locator(`.recommended-bet-card[data-game-id="${firstGame.id}"][data-market="total"] summary`).click();
    await expect(page.locator(`.recommended-bet-card[data-game-id="${firstGame.id}"][data-market="total"]`).getByRole('button', { name: 'Virtual pick saved', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    await expect(cards(page)).toHaveCount(7);
    expect(placements(calls)).toHaveLength(1);
    expect(await picksCount(world)).toBe(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('draft guesses and locked markets never generate recommendations, including when the published week moves ahead', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL, { games: 2, spread: false, total: false });
  try {
    const personal = await world.api('luke', 'personal');
    const { season, week } = world.state.league;
    const draft = await world.api('luke', 'personal/ballot', { season, week, mode: 'guess_spread', picks: world.guesses.spread,
      submit: false, revision: personal.body.revision, weeklyRevision: personal.body.weeklyRevision, requestId: randomUUID() });
    expect(draft.status).toBe(200);
    const calls = requests(page);
    await openRecommended(page);
    await expect(cards(page)).toHaveCount(0);
    await expect(page.locator('.virtual-units')).toContainText(/saved|submit|locked/i);
    await sendBallot(world, 'luke', 'guess_spread', world.guesses.spread);
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).first()).toContainText('Spread');
    await expect(cards(page).last()).toContainText('Spread');
    const nextKickoff = Math.floor(Date.parse(world.state.league.deadline) / 1000) + 7 * 86400;
    await world.db.query('insert into public.gtl_weekly_slates(season,week,signature) values($1,$2,$3)', [season, week + 1,
      { season, week: week + 1, deadline: nextKickoff, games: [{ id: 'KC-LV', away: 'KC', home: 'LV', kickoff: nextKickoff }] }]);
    await world.db.query('insert into public.gtl_schedule_templates(id,season,week,games,deadline,schedule_source) values($1,$2,$3,$4,$5,$6)',
      ['fixture-next-locked', season, week + 1, [{ id: 'KC-LV', away: 'Kansas City Chiefs', awayCode: 'KC', home: 'Las Vegas Raiders', homeCode: 'LV', kickoff: new Date(nextKickoff * 1000).toISOString() }],
        new Date(nextKickoff * 1000).toISOString(), 'Synthetic recommendation schedule fixture']);
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Recommended bets', exact: true })).toContainText(`Week ${week + 1}`);
    await expect(page.getByRole('region', { name: 'Recommended bets', exact: true })).toContainText('No differences to show yet');
    expect(placements(calls)).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a failed recommendation read is explicit and retry plus Refresh lines uses the newest retained quote', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    let reject = true;
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/gtl-api/bets/recommendations'), async route => {
      if (!reject) return route.fallback();
      await route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: 'Saved guesses temporarily unavailable.' }) });
    });
    await openRecommended(page);
    await expect(page.getByRole('alert')).toContainText('Saved guesses temporarily unavailable.');
    await expect(cards(page)).toHaveCount(0);
    reject = false;
    await page.getByRole('alert').getByRole('button', { name: /Try again|Retry/i }).click();
    await expect(cards(page)).toHaveCount(3);
    await page.getByRole('button', { name: /Show all/i }).click();
    const totalCard = page.locator(`.recommended-bet-card[data-game-id="${world.state.games[0].id}"][data-market="total"]`);
    await expect(totalCard.locator('summary')).toContainText('10.5 pt gap');
    await storeBookLines(world, { ...world.lines, total: Object.fromEntries(world.state.games.map(game => [game.id, 46.5])) }, { capturedAt: Date.now() - 5000 });
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    await expect(totalCard).toBeVisible();
    await expect(totalCard.locator('summary')).toContainText('8.5 pt gap');
    await totalCard.locator('summary').click();
    await expect(totalCard).toContainText('46.5');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Community recommendations use the current published week when the private group is a week behind and membership is absent', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL, { spread: false, total: false });
  try {
    const { season, week } = world.state.league;
    const next = week + 1;
    const signature = (await world.db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
    // These fictional week identities share an open scheduling window. Adding
    // an hour can move Sunday's deadline into Monday, making the newer fixture
    // legitimately unavailable before its week opens.
    const nextSignature = { ...signature, week: next,
      games: signature.games.map(game => ({ ...game })) };
    await world.db.query('insert into public.gtl_weekly_slates(season,week,signature) values($1,$2,$3)', [season, next, nextSignature]);
    const current = { ...world, state: { ...world.state,
      league: { ...world.state.league, week: next, deadline: new Date(nextSignature.deadline * 1000).toISOString() },
      games: world.state.games.map(game => ({ ...game })),
    } };
    await world.db.query('insert into public.gtl_schedule_templates(id,season,week,games,deadline,schedule_source) values($1,$2,$3,$4,$5,$6)',
      [`fixture-next-${next}`, season, next, current.state.games, current.state.league.deadline, 'Synthetic recommendation schedule fixture']);
    const observedAt = await storeBookLines(current, world.lines);
    await sendBallot(current, 'luke', 'guess_spread', world.guesses.spread);
    await sendBallot(current, 'luke', 'guess_total', world.guesses.total);
    await world.db.query('delete from public.gtl_memberships where user_id=$1', [ACCOUNTS.luke.id]);
    const groupState = (await world.db.query("select state from public.gtl_leagues where id='sean-troy-luke'")).rows[0].state;
    expect(groupState.league.week).toBe(week);
    const calls = requests(page);
    await openRecommended(page);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByRole('region', { name: 'Recommended bets', exact: true })).toContainText(`Week ${next}`);
    await playTotal(page, world);
    await page.getByRole('button', { name: 'Place virtual pick', exact: true }).click();
    await expect.poll(() => picksCount(world)).toBe(1);
    expect(placements(calls)).toHaveLength(1);
    expect(placements(calls)[0].body).toMatchObject({ season, week: next, gameId: world.state.games[0].id,
      market: 'total', side: 'over', line: 44.5, odds: -110, source: 'betmgm', quotedAt: observedAt });
    const saved = (await world.db.query('select season,week from public.gtl_virtual_units_picks where user_id=$1', [ACCOUNTS.luke.id])).rows;
    expect(saved).toEqual([{ season, week: next }]);
    expect(calls.some(call => call.path === 'virtual-units' || call.path === 'virtual-pick')).toBe(false);
    expect((await world.db.query("select state from public.gtl_leagues where id='sean-troy-luke'")).rows[0].state).toEqual(groupState);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a lost successful recommendation reply is confirmed by its exact saved source and terms without a second placement', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    await openRecommended(page);
    await playTotal(page, world);
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/gtl-api/bets/recommendations/place'), async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      expect(response.status, 'fixture writer commits before its response is lost').toBe(200);
      await response.text();
      await route.abort('failed');
    }, { times: 1 });
    await page.getByRole('button', { name: 'Place virtual pick', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('could not confirm whether your save completed');
    expect(await picksCount(world)).toBe(1);
    expect(placements(calls)).toHaveLength(1);
    await page.getByRole('button', { name: 'Check saved picks', exact: true }).click();
    await expect(page.locator('.auth-notice')).toHaveText('Your saved Virtual Units pick is confirmed.');
    const saved = page.getByRole('region', { name: 'Your virtual card', exact: true });
    await expect(saved).toContainText('Over 44.5 (−110) · 1U');
    await expect(saved).toContainText('BetMGM');
    await expect(page.getByRole('button', { name: 'Place virtual pick', exact: true })).toHaveCount(0);
    expect(placements(calls)).toHaveLength(1);
    expect(await picksCount(world)).toBe(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a pending review retains the chosen terms at kickoff and offers no placement or silent write', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    await openRecommended(page);
    await playTotal(page, world);
    await page.getByRole('button', { name: '2U', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Place virtual pick', exact: true })).toBeVisible();
    await moveBrowserPastKickoff(page, world.state.games[0]);
    const review = page.locator('.recommended-pending-review');
    await expect(review).toContainText('Closed · Kickoff reached');
    await expect(review).toContainText('Over +44.5 (−110) · 2U · BetMGM');
    await expect(page.getByRole('button', { name: 'Place virtual pick', exact: true })).toHaveCount(0);
    expect(placements(calls)).toEqual([]);
    expect(await picksCount(world)).toBe(0);
    await review.getByRole('button', { name: 'Remove from card', exact: true }).click();
    await expect(review).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a saved virtual pick stays visible when its difference disappears and after kickoff', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), first = world.state.games[0];
    await openRecommended(page);
    await playTotal(page, world);
    await page.getByRole('button', { name: 'Place virtual pick', exact: true }).click();
    const saved = page.getByRole('region', { name: 'Your virtual card', exact: true });
    await expect(saved).toContainText('Over 44.5 (−110) · 1U');
    await storeBookLines(world, { ...world.lines, total: { ...world.lines.total, [first.id]: world.guesses.total[first.id] } }, { capturedAt: Date.now() - 5000 });
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    await expect(page.locator(`.recommended-bet-card[data-game-id="${first.id}"][data-market="total"]`)).toHaveCount(0);
    await expect(saved).toContainText('Over 44.5 (−110) · 1U');
    await expect(saved).toContainText('BetMGM');
    await moveBrowserPastKickoff(page, first);
    await expect(page.locator(`.recommended-bet-card[data-game-id="${first.id}"]`)).toHaveCount(0);
    await expect(saved).toContainText('Over 44.5 (−110) · 1U');
    await expect(saved).toContainText('Pending');
    expect(placements(calls)).toHaveLength(1);
    expect(await picksCount(world)).toBe(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the week selector keeps the player’s older saved card readable after Community advances without permitting old-week placement', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), { season, week } = world.state.league;
    await openRecommended(page);
    await playTotal(page, world);
    await page.getByRole('button', { name: 'Place virtual pick', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Your virtual card', exact: true })).toContainText('BetMGM');
    const next = await publishNextWeek(world);
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    const weekSelect = page.getByRole('combobox', { name: 'Recommendation week', exact: true });
    await expect(weekSelect).toHaveValue('current');
    await expect(page.getByRole('region', { name: 'Recommended bets', exact: true })).toContainText(`Week ${next.week}`);
    await expect(page.getByRole('region', { name: 'Your virtual card', exact: true })).toHaveCount(0);
    await weekSelect.selectOption(`${season}:${week}`);
    await expect(page.locator('.virtual-units')).toContainText('View only · older week');
    const saved = page.getByRole('region', { name: 'Your virtual card', exact: true });
    await expect(saved).toContainText(`1 saved · Week ${week}`);
    await expect(saved).toContainText('Over 44.5 (−110) · 1U');
    await expect(saved).toContainText('BetMGM');
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Play with Virtual Units', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Place virtual pick', exact: true })).toHaveCount(0);
    expect(calls.filter(call => call.path === 'bets/recommendations').at(-1).body).toEqual({ season, week });
    const oldRequest = { ...placements(calls)[0].body, gameId: world.state.games[1].id };
    const refused = await world.api('luke', 'bets/recommendations/place', oldRequest);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/published week changed/i);
    expect(await picksCount(world)).toBe(1);
    expect((await world.db.query("select state from public.gtl_leagues where id='sean-troy-luke'")).rows[0].state.league.week).toBe(week);
    await weekSelect.selectOption('current');
    await expect(page.getByRole('region', { name: 'Recommended bets', exact: true })).toContainText(`Week ${next.week}`);
    await expect(saved).toHaveCount(0);
    expect(placements(calls)).toHaveLength(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('All, Spreads and Totals filter the full ranked list before the top three, by pointer and keyboard, on phones', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    await openRecommended(page);
    await expect(market(page, 'All')).toHaveAttribute('aria-pressed', 'true');
    await expect(market(page, 'Spreads')).toHaveAttribute('aria-pressed', 'false');
    await expect(market(page, 'Totals')).toHaveAttribute('aria-pressed', 'false');
    // D-81 gives totals comparable prominence: the largest three are total, spread, total.
    await expect(cards(page)).toHaveCount(3);
    expect(await gapSizes(page)).toEqual(['Size 59.2/100', 'Size 44.6/100', 'Size 29.2/100']);
    expect(await cardMarkets(page)).toEqual(['total', 'spread', 'total']);
    await expect(region(page)).toContainText('7 gaps');
    const reads = calls.filter(call => call.path === 'bets/recommendations').length;

    // Totals filters the complete ranked set before the top-three limit, so its three totals appear in their order.
    await market(page, 'Totals').click();
    await expect(market(page, 'Totals')).toHaveAttribute('aria-pressed', 'true');
    await expect(market(page, 'All')).toHaveAttribute('aria-pressed', 'false');
    await expect(cards(page)).toHaveCount(3);
    expect(await cardMarkets(page)).toEqual(['total', 'total', 'total']);
    expect(await gapSizes(page)).toEqual(['Size 59.2/100', 'Size 29.2/100', 'Size 10.3/100']);
    await expect(region(page)).toContainText('3 gaps');
    await expect(page.getByRole('button', { name: /Show all/i })).toHaveCount(0);

    // Keyboard: the segments are native buttons in one labelled group.
    await market(page, 'Totals').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(market(page, 'Spreads')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(market(page, 'Spreads')).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page)).toHaveCount(3);
    expect(await cardMarkets(page)).toEqual(['spread', 'spread', 'spread']);
    await expect(region(page)).toContainText('4 gaps');
    await page.getByRole('button', { name: /Show all 4 differences/ }).click();
    await expect(cards(page)).toHaveCount(4);
    expect(await gapSizes(page)).toEqual(['Size 44.6/100', 'Size 26.4/100', 'Size 14.2/100', 'Size 7.3/100']);
    await page.getByRole('button', { name: /Show top 3/ }).click();
    await market(page, 'All').focus();
    await page.keyboard.press('Space');
    await expect(market(page, 'All')).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page)).toHaveCount(3);
    expect(await gapSizes(page)).toEqual(['Size 59.2/100', 'Size 44.6/100', 'Size 29.2/100']);

    // Every filter change is display-only: no new read and no write of any kind.
    expect(calls.filter(call => call.path === 'bets/recommendations')).toHaveLength(reads);
    expect(placements(calls)).toEqual([]);
    expect(calls.filter(call => call.path === 'social/create')).toEqual([]);
    expect(await picksCount(world)).toBe(0);

    for (const theme of ['dark', 'light']) {
      await setCaptureTheme(page, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => scrollTo(0, 0));
        await market(page, 'Totals').click();
        await expect(cards(page)).toHaveCount(3);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}px fits`).toBe(true);
        const segments = await marketFilter(page).evaluate(group => [...group.querySelectorAll('button')].map(button => {
          const box = button.getBoundingClientRect();
          return { inside: box.left >= 0 && box.right <= innerWidth, tall: box.height >= 44, clipped: button.scrollWidth > button.clientWidth };
        }));
        expect(segments, `${theme} ${width}px segments`).toEqual(Array(3).fill({ inside: true, tall: true, clipped: false }));
        // The whole filtered list scrolls fully above the fixed tab bar.
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        const reach = await page.evaluate(() => ({
          list: document.querySelector('.recommended-bets').getBoundingClientRect().bottom,
          nav: document.querySelector('nav[aria-label="Main"]').getBoundingClientRect().top,
        }));
        expect(reach.list, `${theme} ${width}px last card reachable`).toBeLessThanOrEqual(reach.nav);
        const scan = await new AxeBuilder({ page }).include('.gx-bets').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(scan.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: `.local/previews/recommended-bets-totals-${theme}-${width}.png`, fullPage: true });
        await market(page, 'All').click();
      }
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a market without eligible recommendations says so, never shows draft guesses and returns to All', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL, { spread: false });
  try {
    const { season, week } = world.state.league;
    const personal = await world.api('luke', 'personal');
    const draft = await world.api('luke', 'personal/ballot', { season, week, mode: 'guess_spread', picks: world.guesses.spread,
      submit: false, revision: personal.body.revision, weeklyRevision: personal.body.weeklyRevision, requestId: randomUUID() });
    expect(draft.status).toBe(200);
    const calls = requests(page);
    await openRecommended(page);
    await expect(cards(page)).toHaveCount(3);
    expect(await cardMarkets(page)).toEqual(['total', 'total', 'total']);
    await market(page, 'Spreads').click();
    await expect(cards(page)).toHaveCount(0);
    await expect(region(page)).toContainText('No spread differences to show yet.');
    await expect(region(page)).not.toContainText('No differences to show yet');
    await expect(region(page)).toContainText('0 gaps');
    for (const theme of ['dark', 'light']) {
      await setCaptureTheme(page, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}px fits`).toBe(true);
        const scan = await new AxeBuilder({ page }).include('.gx-bets').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(scan.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
        await page.screenshot({ path: `.local/previews/recommended-bets-empty-spreads-${theme}-${width}.png`, fullPage: true });
      }
    }
    const back = region(page).getByRole('button', { name: 'View all markets', exact: true });
    await back.focus();
    await page.keyboard.press('Enter');
    await expect(market(page, 'All')).toHaveAttribute('aria-pressed', 'true');
    await expect(market(page, 'All')).toBeFocused();
    await expect(cards(page)).toHaveCount(3);
    await market(page, 'Totals').click();
    expect(await cardMarkets(page)).toEqual(['total', 'total', 'total']);
    expect(placements(calls)).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a prepared card selection survives filter changes and places exactly its reviewed terms', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), first = world.state.games[0];
    await openRecommended(page);
    await market(page, 'Totals').click();
    const total = page.locator(`.recommended-bet-card[data-game-id="${first.id}"][data-market="total"]`);
    await total.locator('summary').click();
    await total.getByRole('button', { name: 'Play with Virtual Units', exact: true }).click();
    await total.getByRole('button', { name: '2U', exact: true }).click();
    await expect(total.getByRole('button', { name: 'Place virtual pick', exact: true })).toBeVisible();
    const review = page.locator('.recommended-pending-review');
    // Spreads hides the total card, never the unsaved selection: it stays on the card with its chosen terms.
    await market(page, 'Spreads').click();
    await expect(total).toHaveCount(0);
    await expect(review).toHaveCount(1);
    await expect(review).toContainText('Over +44.5 (−110) · 2U');
    await expect(review.getByRole('button', { name: 'Place virtual pick', exact: true })).toBeVisible();
    await market(page, 'All').click();
    await expect(review).toHaveCount(0);
    await expect(total).toContainText('Over +44.5 (−110) · 2U');
    await market(page, 'Totals').click();
    await expect(review).toHaveCount(0);
    if (!(await total.evaluate(card => card.open))) await total.locator('summary').click();
    await expect(total.getByRole('button', { name: 'Review below', exact: true })).toBeDisabled();
    await expect(total).toContainText('Over +44.5 (−110) · 2U');
    expect(placements(calls)).toEqual([]);
    expect(await picksCount(world)).toBe(0);
    await total.getByRole('button', { name: 'Place virtual pick', exact: true }).click();
    await expect.poll(() => placements(calls).length).toBe(1);
    expect(placements(calls)[0].body).toMatchObject({ gameId: first.id, market: 'total', side: 'over', line: 44.5, odds: -110, units: 2, source: 'betmgm', quotedAt: world.observedAt });
    await expect.poll(() => picksCount(world)).toBe(1);
    await expect(market(page, 'Totals')).toHaveAttribute('aria-pressed', 'true');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the chosen market stays while tracking a bet and returning to Recommended within Bets', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    await openRecommended(page);
    await market(page, 'Totals').click();
    await (await openTotal(page, world.state.games[0].id)).getByRole('button', { name: 'Track this bet', exact: true }).click();
    await expect(view(page, 'Your guess vs. market')).toHaveAttribute('aria-pressed', 'true');
    const editor = page.getByRole('dialog', { name: 'Review recommended bet' });
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(view(page, 'Your guess vs. market')).toHaveAttribute('aria-pressed', 'true');
    await expect(market(page, 'Totals')).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page)).toHaveCount(3);
    expect(await cardMarkets(page)).toEqual(['total', 'total', 'total']);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Bets(,|$)/ }).click();
    await expect(page.locator('[data-landing="bets"]')).toBeVisible();
    await page.getByRole('button', { name: 'Your guess vs. market', exact: true }).click();
    await expect(market(page, 'Totals')).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page)).toHaveCount(3);
    expect(await cardMarkets(page)).toEqual(['total', 'total', 'total']);
    expect(calls.filter(call => call.path === 'social/create')).toEqual([]);
    expect(placements(calls)).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

// Computed CSS regression probe on native outcome buttons. The extra P clone checks
// the neutral presentation only; it never enters the paper-record data or grading.
async function assertGapOutcomeStyles(dots, forced = false) {
  const styles = await dots.evaluateAll((buttons, forced) => {
    const source = buttons[0], push = source.cloneNode(true);
    push.dataset.outcome = 'push'; push.textContent = 'P'; source.parentElement.append(push);
    try {
      return [...buttons, push].map(button => {
        const pressed = button.getAttribute('aria-pressed'); button.setAttribute('aria-pressed', 'true');
        const css = getComputedStyle(button), r = button.getBoundingClientRect();
        const token = button.dataset.outcome === 'win' ? '--gx-accent-ink' : button.dataset.outcome === 'loss' ? '--gx-loss' : '--gx-text-1';
        const probe = document.createElement('span'); probe.style.cssText = `color:${forced ? 'CanvasText' : `var(${token})`};border:1px solid ${forced ? 'CanvasText' : button.dataset.outcome === 'push' ? 'var(--gx-border)' : `var(${token})`};outline:3px solid ${forced ? 'Highlight' : 'var(--gx-accent-ink)'};background:${forced ? 'Canvas' : 'var(--gx-card-face)'}`; button.append(probe);
        const expected = getComputedStyle(probe);
        const result = { outcome: button.dataset.outcome, letter: button.firstChild.textContent.trim(), color: css.color === expected.color, border: css.borderColor === expected.borderColor, background: css.background === expected.background, selected: css.outlineColor === expected.outlineColor && css.outlineWidth === '3px' && css.outlineStyle === 'solid' && css.outlineOffset === '2px', target: r.width >= 44 && r.height >= 44 };
        probe.remove(); if (pressed === null) button.removeAttribute('aria-pressed'); else button.setAttribute('aria-pressed', pressed); return result;
      });
    } finally { push.remove(); }
  }, forced);
  for (const style of styles) expect(style).toEqual({ outcome: style.outcome, letter: { win: 'W', loss: 'L', push: 'P' }[style.outcome], color: true, border: true, background: true, selected: true, target: true });
}

// D-77 (Sean, November 3, 2026: "Your gaps' paper record"). The fixture's guesses (spread -10, -7, -5, -3; total 55, 49, 43,
// 44.5) against closing lines of -3.5 and 44.5, with finals 27-20, 20-24, 17-13 and 21-21: spreads W L W W, totals W L W and
// one even guess. 5 of 7 decided gaps is 71.4%; 5 x 10/11 - 2 = +2.55U; none of these gaps reaches the D-81 top quarter.
test('D-77: your gaps vs. closing lines grade finished games on the side your guess favored, follow the market filter and fit phones', async ({ page, baseURL }, testInfo) => {
  let at = Date.now();
  const world = await fixture(page, baseURL, { clock: () => at });
  try {
    const { season, week } = world.state.league, finals = [[27, 20], [20, 24], [17, 13], [21, 21]];
    for (const [i, game] of world.state.games.entries()) {
      await world.db.query("insert into public.gtl_virtual_units_settlements(season,week,game_id,version,status,home,away,source,observed_at) values($1,$2,$3,1,'final',$4,$5,'Fixture final',now())",
        [season, week, game.id, finals[i][0], finals[i][1]]);
    }
    // The server's clock moves past the last kickoff; the guesses and lines were saved before.
    at = Math.max(...world.state.games.map(game => Date.parse(game.kickoff))) + 4 * 3_600_000;
    const calls = requests(page);
    await openRecommended(page);
    const card = page.getByRole('region', { name: 'Your gaps vs. closing lines', exact: true });
    // Option 1, "Hit rate hero": 5 of 7 decided gaps beat the close, one dot per gap in kickoff order.
    await expect(card).toContainText('71.4%');
    await expect(card).toContainText('Gap win rate');
    await expect(card).toContainText('5–2–0 W–L–P');
    await expect(card).toContainText('+2.55U');
    const dots = card.getByRole('list', { name: 'Each gap, in kickoff order' }).getByRole('button');
    await expect(dots).toHaveCount(7);
    expect(await dots.evaluateAll(list => list.map(dot => dot.dataset.outcome))).toEqual(['win', 'win', 'loss', 'loss', 'win', 'win', 'win']);
    await expect(dots.first()).toHaveAttribute('aria-label', /^Select gap 1: .+ at .+, spread, Win$/);
    // The fine print opens from the info button.
    await expect(card).not.toContainText('a paper record, not bets placed');
    await card.getByRole('button', { name: 'About your gaps', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'About your gaps' })).toContainText('a paper record, not bets placed');
    await page.getByRole('dialog', { name: 'About your gaps' }).getByRole('button', { name: 'Close', exact: true }).click();
    await card.locator('.gx-gap-options summary').click();
    await card.getByRole('button', { name: 'Large gaps', exact: true }).click();
    await expect(card).toContainText('No finished games with a large gap yet.');
    await card.getByRole('button', { name: 'All gaps', exact: true }).click();
    await expect(card).not.toContainText('a paper record, not bets placed');
    await market(page, 'Spreads').click();
    await expect(card).toContainText('75.0%');
    await expect(card).toContainText('3–1–0 W–L–P');
    await market(page, 'Totals').click();
    await expect(card).toContainText('66.7%');
    await expect(card).toContainText('2–1–0 W–L–P');
    await market(page, 'All').click();
    await expect(card).toContainText('71.4%');
    const reads = calls.filter(call => call.path === 'lines/read');
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every(call => call.body.season === season && call.body.week === week)).toBe(true);
    expect(placements(calls)).toEqual([]);
    for (const theme of ['dark', 'light']) {
      await setCaptureTheme(page, theme);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}px fits`).toBe(true);
        const scan = await new AxeBuilder({ page }).include('.gx-bets').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(scan.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
        await assertGapOutcomeStyles(dots);
        await card.locator('.gx-gap-hero').scrollIntoViewIfNeeded();
        await card.screenshot({ path: testInfo.outputPath(`gap-record-${theme}-${width}.png`) });
      }
    }
    // Outcome controls share the chart selection; detail/back retains it and the expanded list.
    await card.getByRole('button', { name: /^Select gap 2:/ }).click();
    await card.getByRole('button', { name: 'Show all 7 gaps', exact: true }).click();
    await expect(card.locator('.gx-gap-row')).toHaveCount(7);
    const readCount = calls.filter(call => call.path === 'lines/read').length;
    for (const index of [0, 1]) {
      await card.getByRole('button', { name: 'Gap details', exact: true }).nth(index).click();
      await expect(card.locator('.gx-gap-detail')).toContainText(index ? 'Total' : 'Spread');
      await expect(card.locator('.gx-gap-detail')).toContainText('Recorded final');
      for (const theme of ['dark', 'light']) {
        await setCaptureTheme(page, theme);
        for (const width of [320, 390]) {
          await page.setViewportSize({ width, height: 844 });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await card.locator('.gx-gap-detail').screenshot({ path: testInfo.outputPath(`gap-detail-${index ? 'total' : 'spread'}-${theme}-${width}.png`) });
        }
      }
      await card.getByRole('button', { name: 'Back to gaps', exact: true }).click();
      await expect(card.getByRole('button', { name: 'Gap details', exact: true }).nth(index)).toBeFocused();
      await expect(card.getByRole('button', { name: /^Select gap 2:/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(card.locator('.gx-gap-row')).toHaveCount(7);
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await setCaptureTheme(page, 'dark', { forcedColors: 'active' });
    await assertGapOutcomeStyles(dots, true);
    await card.screenshot({ path: testInfo.outputPath('gap-record-forced-320.png') });
    await page.emulateMedia({ forcedColors: 'none' });
    expect(calls.filter(call => call.path === 'lines/read')).toHaveLength(readCount);
    expect(placements(calls)).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
