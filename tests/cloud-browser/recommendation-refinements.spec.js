import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { ACCOUNTS, SUPABASE, pgliteAvailable, storeBookLines } from './community-world.mjs';
import { cards, edits, fixture, openRecommended, picksCount, placements, requests } from './recommendation-world.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const review = page => page.locator('.recommended-review');
const savedCard = page => page.getByRole('region', { name: 'Your virtual card', exact: true });
const refresh = page => page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
const savedPick = async world => (await world.db.query('select selection,audit from public.gtl_virtual_units_picks where user_id=$1 order by game_id,market', [ACCOUNTS.luke.id])).rows[0];
const forecasts = async world => (await world.db.query('select game_id,market,value::float8 as value,revision::integer as revision from public.gtl_personal_forecasts where user_id=$1 order by game_id,market', [ACCOUNTS.luke.id])).rows;
const ballots = async world => (await world.db.query('select mode,ballot from public.gtl_weekly_ballots where user_id=$1 order by mode', [ACCOUNTS.luke.id])).rows;

async function newTotals(world, value) {
  return storeBookLines(world, { ...world.lines, total: Object.fromEntries(world.state.games.map(game => [game.id, value])) }, { capturedAt: Date.now() - 5000 });
}

async function openForecast(page, gameId, market = 'total') {
  await page.getByRole('combobox', { name: 'Comparison basis', exact: true }).selectOption('forecast');
  await page.getByText('Your personal forecast', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Forecast game', exact: true }).selectOption(gameId);
  await page.getByRole('combobox', { name: 'Forecast market', exact: true }).selectOption(market);
  return page.locator('.recommendation-forecast-editor');
}

test('refresh and stake changes retain reviewed terms until Use updated quote is explicitly chosen', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    await openRecommended(page);
    await cards(page).first().getByRole('button', { name: 'Add to card', exact: true }).click();
    await expect(review(page).locator('.virtual-selected-quote')).toContainText('Over +44.5 (−110) · 1U · BetMGM');
    const updatedAt = await newTotals(world, 46.5);
    await refresh(page);
    await expect(review(page).getByRole('button', { name: 'Use updated quote', exact: true })).toBeVisible();
    await review(page).getByRole('button', { name: '2U', exact: true }).click();
    await expect(review(page).locator('.virtual-selected-quote')).toContainText('Over +44.5 (−110) · 2U · BetMGM');
    await review(page).getByRole('button', { name: 'Increase units', exact: true }).click();
    await expect(review(page).locator('.virtual-selected-quote')).toContainText('Over +44.5 (−110) · 2.5U · BetMGM');
    await expect(review(page).locator('.recommended-quote-update')).toContainText('Updated: Over +46.5');
    expect(placements(calls)).toEqual([]);
    expect(await picksCount(world)).toBe(0);
    await review(page).getByRole('button', { name: 'Use updated quote', exact: true }).click();
    await expect(review(page).locator('.virtual-selected-quote')).toContainText('Over +46.5 (−110) · 2.5U · BetMGM');
    await expect(review(page).getByRole('button', { name: 'Use updated quote', exact: true })).toHaveCount(0);
    await review(page).getByRole('button', { name: 'Place virtual pick', exact: true }).click();
    await expect.poll(() => picksCount(world)).toBe(1);
    expect(placements(calls)).toHaveLength(1);
    expect(placements(calls)[0].body).toMatchObject({ line: 46.5, units: 2.5, source: 'betmgm', quotedAt: updatedAt });
    const placed = (await savedPick(world)).selection;
    expect(placed).toMatchObject({ line: 46.5, units: 2.5 });
    expect(Date.parse(placed.quotedAt)).toBe(Date.parse(updatedAt));
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('removing an open review keeps another prepared selection and never writes a pick', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), game = world.state.games[0];
    await openRecommended(page);
    const total = page.locator(`.recommended-bet-card[data-game-id="${game.id}"][data-market="total"]`);
    const spread = page.locator(`.recommended-bet-card[data-game-id="${game.id}"][data-market="spread"]`);
    await total.getByRole('button', { name: 'Add to card', exact: true }).click();
    await spread.getByRole('button', { name: 'Add to card', exact: true }).click();
    await spread.getByRole('button', { name: '2U', exact: true }).click();
    await expect(review(page)).toHaveCount(2);
    await total.getByRole('button', { name: 'Remove from card', exact: true }).click();
    await expect(review(page)).toHaveCount(1);
    await expect(total.getByRole('button', { name: 'Add to card', exact: true })).toBeEnabled();
    await expect(spread.locator('.virtual-selected-quote')).toContainText('2U · BetMGM');
    await spread.getByRole('button', { name: 'Remove from card', exact: true }).click();
    await expect(review(page)).toHaveCount(0);
    expect(placements(calls)).toEqual([]);
    expect(await picksCount(world)).toBe(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('compact top three contain actionable unsaved picks while saved and unavailable comparisons remain expandable', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), first = world.state.games[0];
    await openRecommended(page);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.locator('.recommended-details')).toHaveCount(0);
    const box = await cards(page).first().boundingBox();
    expect(box.y, 'first recommendation is visible without scrolling on a 390px phone').toBeLessThan(784);
    expect(box.height, 'collapsed row is smaller than half the viewport').toBeLessThan(422);
    const addBox = await cards(page).first().getByRole('button', { name: 'Add to card', exact: true }).boundingBox();
    expect(addBox.height, 'primary card action keeps a 44px touch target').toBeGreaterThanOrEqual(44);
    console.info('Recommendation compact metrics', JSON.stringify({ viewport: 390, firstCard: box, addButton: addBox }));
    await expect(savedCard(page)).toContainText('0 saved');
    await cards(page).first().getByRole('button', { name: 'Add to card', exact: true }).click();
    await page.getByRole('button', { name: 'Place virtual pick', exact: true }).click();
    await expect(savedCard(page)).toContainText('1 saved');
    // A retained entry may carry a median value/base price but no usable side line.
    // Remove only that fictional side's line from every retained fixture snapshot.
    for (const snapshot of (await world.db.query('select id,payload from public.gtl_market_snapshots')).rows) {
      const game = snapshot.payload.games.find(game => game.gameId === first.id);
      for (const quote of game.markets.spread.quotes) delete quote.outcomes.home.line;
      await world.db.query('update public.gtl_market_snapshots set payload=$2 where id=$1', [snapshot.id, snapshot.payload]);
    }
    await refresh(page);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.locator('.recommended-bet-card[data-actionable="false"]')).toHaveCount(0);
    await expect(page.locator(`.recommended-bet-card[data-game-id="${first.id}"]`)).toHaveCount(0);
    await expect(page.locator('.recommended-list-heading').first()).toContainText('5 available');
    await page.getByRole('button', { name: /Show all 7 comparisons/ }).click();
    await expect(cards(page)).toHaveCount(7);
    const unavailable = page.locator(`.recommended-bet-card[data-game-id="${first.id}"][data-market="spread"]`);
    await expect(unavailable).toContainText('Quote unavailable');
    await expect(unavailable.locator('[data-side="home"]')).toContainText('Unavailable');
    await expect(unavailable.locator('.recommended-gap')).toHaveCount(0);
    await expect(unavailable.getByRole('button', { name: 'Add to card', exact: true })).toBeDisabled();
    await unavailable.getByRole('button', { name: 'Show details', exact: true }).click();
    await expect(unavailable).toContainText('6.5 pt difference from consensus');
    const saved = page.locator(`.recommended-bet-card[data-game-id="${first.id}"][data-market="total"]`);
    await expect(saved.getByRole('button', { name: 'Already on your card', exact: true })).toBeDisabled();
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(placements(calls)).toHaveLength(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the inline outcome forecast changes comparison basis without changing the scored guess or falling back', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), before = await ballots(world), game = world.state.games[0];
    await openRecommended(page);
    const editor = await openForecast(page, game.id);
    await expect(cards(page)).toHaveCount(0);
    await expect(page.locator('.recommended-empty')).toContainText('Add an outcome forecast');
    await page.getByLabel('Your forecast', { exact: true }).fill('42');
    await page.getByRole('button', { name: 'Save personal forecast', exact: true }).click();
    await expect(editor).toContainText('Personal forecast saved. Your scored guess is unchanged.');
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first().locator('.recommended-selection-summary')).toContainText('Under 44.5');
    await expect(cards(page).first().locator('.recommended-gap')).toHaveText('+2.5 pt at book');
    await cards(page).first().getByRole('button', { name: 'Show details', exact: true }).click();
    await expect(cards(page).first()).toContainText('Your submitted line guess remains 55');
    expect(await forecasts(world)).toEqual([{ game_id: game.id, market: 'total', value: 42, revision: 1 }]);
    expect(await ballots(world)).toEqual(before);
    expect(placements(calls)).toEqual([]);
    await page.getByRole('combobox', { name: 'Comparison basis', exact: true }).selectOption('guess');
    await expect(cards(page)).toHaveCount(3);
    await expect(cards(page).first().locator('.recommended-selection-summary')).toContainText('Over 44.5');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a lost forecast save reply is checked by readback without a duplicate write', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), before = await ballots(world), game = world.state.games[0];
    await openRecommended(page);
    const editor = await openForecast(page, game.id, 'spread');
    await page.getByLabel('Your forecast', { exact: true }).fill('-1');
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/gtl-api/personal/forecast'), async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      expect(response.status).toBe(200);
      await response.text();
      await route.abort('failed');
    }, { times: 1 });
    await page.getByRole('button', { name: 'Save personal forecast', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('save reply was lost');
    await expect(page.getByRole('button', { name: 'Save personal forecast', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Check saved forecast', exact: true }).click();
    await expect(editor).toContainText('Saved forecast value confirmed');
    await expect(cards(page)).toHaveCount(1);
    expect(calls.filter(call => call.path === 'personal/forecast')).toHaveLength(1);
    expect(await forecasts(world)).toEqual([{ game_id: game.id, market: 'spread', value: -1, revision: 1 }]);
    expect(await ballots(world)).toEqual(before);
    expect(placements(calls)).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('an acknowledged forecast save followed by a failed refresh stays protected until readback', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), before = await ballots(world), game = world.state.games[0];
    let failRead = false;
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/gtl-api/bets/recommendations'), async route => {
      if (!failRead) return route.fallback();
      await route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture recommendation refresh unavailable.' }) });
    });
    await openRecommended(page);
    const editor = await openForecast(page, game.id);
    await page.getByLabel('Your forecast', { exact: true }).fill('42');
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/gtl-api/personal/forecast'), async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      expect(response.status).toBe(200);
      failRead = true;
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    }, { times: 1 });
    await page.getByRole('button', { name: 'Save personal forecast', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('forecast was saved, but the updated view did not load');
    await expect(page.getByRole('button', { name: 'Save personal forecast', exact: true })).toBeDisabled();
    expect(await forecasts(world)).toEqual([{ game_id: game.id, market: 'total', value: 42, revision: 1 }]);
    failRead = false;
    await page.getByRole('button', { name: 'Check saved forecast', exact: true }).click();
    await expect(editor).toContainText('Saved forecast value confirmed');
    await expect(cards(page)).toHaveCount(1);
    expect(calls.filter(call => call.path === 'personal/forecast')).toHaveLength(1);
    expect(await ballots(world)).toEqual(before);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a forecast revision conflict preserves the entered value and requires reviewing the current version', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), before = await ballots(world), game = world.state.games[0];
    await openRecommended(page);
    const editor = await openForecast(page, game.id);
    await page.getByLabel('Your forecast', { exact: true }).fill('42');
    const personal = await world.api('luke', 'personal');
    const otherDevice = await world.api('luke', 'personal/forecast', { season: world.state.league.season, week: world.state.league.week,
      gameId: game.id, market: 'total', value: 43, revision: personal.body.revision, requestId: randomUUID() });
    expect(otherDevice.status).toBe(200);
    await page.getByRole('button', { name: 'Save personal forecast', exact: true }).click();
    await expect(editor.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save personal forecast', exact: true })).toBeDisabled();
    await expect(page.getByLabel('Your forecast', { exact: true })).toHaveValue('42');
    expect(await forecasts(world)).toEqual([{ game_id: game.id, market: 'total', value: 43, revision: 1 }]);
    await page.getByRole('button', { name: 'Review latest saved forecast', exact: true }).click();
    await expect(editor).toContainText('Latest saved forecast: 43');
    await expect(page.getByLabel('Your forecast', { exact: true })).toHaveValue('42');
    await page.getByRole('button', { name: 'Save personal forecast', exact: true }).click();
    await expect(editor).toContainText('Personal forecast saved. Your scored guess is unchanged.');
    expect(await forecasts(world)).toEqual([{ game_id: game.id, market: 'total', value: 42, revision: 2 }]);
    const writes = calls.filter(call => call.path === 'personal/forecast');
    expect(writes).toHaveLength(2);
    expect(writes[0].body.requestId).not.toBe(writes[1].body.requestId);
    expect(await ballots(world)).toEqual(before);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('current card edits preserve old terms for units-only changes and update quotes only explicitly', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), game = world.state.games[0];
    await world.db.query('delete from public.gtl_memberships where user_id=$1', [ACCOUNTS.luke.id]);
    await openRecommended(page);
    await cards(page).first().getByRole('button', { name: 'Add to card', exact: true }).click();
    await page.getByRole('button', { name: 'Place virtual pick', exact: true }).click();
    await expect(savedCard(page)).toContainText('Over 44.5 (−110) · 1U');
    await expect(savedCard(page)).toContainText('Record W–L–P');
    await expect(savedCard(page)).toContainText('1 pending');
    await expect(savedCard(page)).toContainText('ROI');
    const original = (await savedPick(world)).selection;
    const updatedAt = await newTotals(world, 46.5);
    await refresh(page);
    const item = savedCard(page).locator(`li[data-game-id="${game.id}"][data-market="total"]`);
    await item.getByRole('button', { name: 'Edit virtual pick', exact: true }).click();
    await item.getByRole('button', { name: '2U', exact: true }).click();
    await expect(item.locator('.virtual-selected-quote')).toContainText('Over +44.5 (−110) · 2U');
    await item.getByRole('button', { name: 'Save virtual edit', exact: true }).click();
    await expect(item.getByRole('button', { name: 'Edit virtual pick', exact: true })).toBeVisible();
    expect(edits(calls)).toHaveLength(1);
    expect(edits(calls)[0].body).toEqual({ season: world.state.league.season, week: world.state.league.week, revision: expect.any(Number), gameId: game.id, market: 'total', units: 2 });
    const unitsEdit = await savedPick(world);
    expect(unitsEdit.selection).toMatchObject({ line: original.line, odds: original.odds, quotedAt: original.quotedAt, source: original.source, side: original.side, units: 2 });
    expect(unitsEdit.audit).toHaveLength(2);
    await item.getByRole('button', { name: 'Edit virtual pick', exact: true }).click();
    await item.getByRole('button', { name: 'Use updated quote', exact: true }).click();
    await expect(item.locator('.virtual-selected-quote')).toContainText('Over +46.5 (−110) · 2U');
    await item.getByRole('button', { name: 'Save virtual edit', exact: true }).click();
    await expect(item.getByRole('button', { name: 'Edit virtual pick', exact: true })).toBeVisible();
    expect(edits(calls)).toHaveLength(2);
    expect(edits(calls)[1].body).toMatchObject({ updateQuote: true, side: 'over', line: 46.5, odds: -110, units: 2, source: 'betmgm', quotedAt: updatedAt });
    const quoteEdit = await savedPick(world);
    expect(quoteEdit.selection).toMatchObject({ line: 46.5, units: 2 });
    expect(Date.parse(quoteEdit.selection.quotedAt)).toBe(Date.parse(updatedAt));
    expect(quoteEdit.audit).toHaveLength(3);
    await item.getByRole('button', { name: 'Edit virtual pick', exact: true }).click();
    await item.getByRole('button', { name: '3U', exact: true }).click();
    await item.getByRole('button', { name: 'Cancel edit', exact: true }).click();
    expect(edits(calls)).toHaveLength(2);
    expect((await savedPick(world)).selection.units).toBe(2);
    expect(await picksCount(world)).toBe(1);
    expect(placements(calls)).toHaveLength(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
