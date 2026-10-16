import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn, sendBallot, storeBookLines } from './community-world.mjs';

// The new Bets tab on the schema players have today, using the existing social and virtual routes.
// All accounts, tickets, prices and writes are local fixtures. No hosted account or provider is contacted.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(60000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));
const tab = (page, name) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true });
const view = (page, name) => page.getByRole('group', { name: 'Bets view' }).getByRole('button', { name, exact: true });
async function openBets(page) {
  await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('/#bets');
  await signIn(page, 'luke', { navigate: false });
  await expect(page.getByRole('heading', { name: 'Bets', level: 1, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add bet', exact: true })).toBeEnabled();
}
async function fillTicket(page, gameId) {
  await page.getByRole('button', { name: 'Add bet', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add a tracked bet' });
  await editor.getByLabel('Matchup').selectOption(gameId);
  await editor.getByRole('combobox', { name: 'Team', exact: true }).selectOption('home');
  await editor.getByLabel('Exact signed spread').fill('-3.5');
  await editor.getByLabel('American odds', { exact: true }).fill('-110');
  await editor.getByLabel('Sportsbook / quote source').fill('Synthetic ticket fixture');
  return editor;
}
function callsFrom(page) {
  const calls = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === SUPABASE && url.pathname.includes('/gtl-api/')) calls.push({ path: url.pathname.split('/gtl-api/')[1], query: url.search, body: request.method() === 'POST' ? request.postDataJSON() : null });
  });
  return calls;
}
async function loseReplyAfterCommit(page, world, action) {
  await page.route(url => url.origin === SUPABASE && url.pathname === `/functions/v1/gtl-api/${action}`, async route => {
    const req = route.request();
    const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
    expect(response.status, `${action} committed in the fixture`).toBe(200);
    await response.text();
    await route.abort('failed');
  }, { times: 1 });
}

test('Community tracked bets work without private membership; create, own week and history retain the same ticket', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    await world.db.query('delete from public.gtl_memberships where user_id=$1', [ACCOUNTS.luke.id]);
    await world.db.query('insert into public.gtl_favorites(user_id,season,week,game_id,saved,notes) values($1,$2,$3,$4,true,$5)', [ACCOUNTS.luke.id, world.state.league.season, world.state.league.week, world.state.games[0].id, 'PRIVATE NOTE SENTINEL']);
    const calls = callsFrom(page);
    await openBets(page);
    await expect(page.locator('body')).not.toContainText('PRIVATE NOTE SENTINEL');
    await expect(page.locator('.gx-bets')).toContainText('Tracked bets are shared with all signed-in players');
    await view(page, 'Virtual Units').click();
    await expect(page.getByRole('button', { name: 'Choose league', exact: true })).toBeVisible();
    expect(calls.filter(call => call.path.startsWith('virtual-'))).toEqual([]);
    await view(page, 'Tracked bets').click();
    const editor = await fillTicket(page, world.state.games[0].id);
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'My week', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your weekly bet card' })).toBeVisible();
    await expect.poll(() => calls.filter(call => call.path === 'social/read').at(-1)?.body.filters.playerId).toBe(ACCOUNTS.luke.id);
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bet history', exact: true })).toBeVisible();
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    expect(calls.filter(call => call.path === 'social/create')).toHaveLength(1);
    expect(calls.some(call => call.path === 'state' || call.path.startsWith('bets/'))).toBe(false);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const results = await new AxeBuilder({ page }).include('.gx-bets').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(results.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
        await page.screenshot({ path: `.local/previews/next-bets-tracked-${theme}-${width}.png`, fullPage: true });
      }
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a lost tracked-ticket reply preserves entered values and explicitly confirms the same request once', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    const calls = callsFrom(page);
    await openBets(page);
    const editor = await fillTicket(page, world.state.games[0].id);
    await loseReplyAfterCommit(page, world, 'social/create');
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('could not confirm whether your save completed');
    await expect(editor.getByLabel('Exact signed spread')).toHaveValue('-3.5');
    await expect(editor.getByRole('button', { name: 'Retry same save' })).toBeDisabled();
    expect(calls.filter(call => call.path === 'social/create')).toHaveLength(1);
    await editor.getByRole('button', { name: 'Check saved bets' }).click();
    await expect(editor.getByRole('button', { name: 'Retry same save' })).toBeEnabled();
    expect(calls.filter(call => call.path === 'social/create')).toHaveLength(1);
    await editor.getByRole('button', { name: 'Retry same save' }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    const writes = calls.filter(call => call.path === 'social/create');
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toEqual(writes[0].body);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Virtual Units uses the selected league, confirms a lost save by readback and protects a remaining draft', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { groupScreens: true, virtualUnits: true, optionalRpc: true });
  try {
    const games = world.state.games;
    await storeBookLines(world, { spread: Object.fromEntries(games.map(game => [game.id, -3.5])), total: Object.fromEntries(games.map(game => [game.id, 44.5])) });
    await sendBallot(world, 'luke', 'guess_spread', Object.fromEntries(games.map(game => [game.id, -3])));
    const calls = callsFrom(page);
    await openBets(page);
    await view(page, 'Virtual Units').click();
    expect(calls.filter(call => call.path.startsWith('virtual-'))).toEqual([]);
    await page.getByRole('button', { name: 'Choose league', exact: true }).click();
    await page.getByRole('dialog', { name: 'Your leagues' }).getByRole('button', { name: /^Triple Threat/ }).click();
    await expect(page.locator('.virtual-game-card')).toHaveCount(games.length);
    expect(calls.filter(call => call.path === 'virtual-units').every(call => call.query === '?league=sean-troy-luke')).toBe(true);
    // Spread is open, Total remains server locked. The bridge never creates a way around that gate.
    await expect(page.locator('.virtual-market-locked')).toHaveCount(games.length);
    for (let i = 0; i < games.length; i++) await page.locator('.virtual-game-card').nth(i).locator('.virtual-side-buttons').getByRole('button').first().click();
    await loseReplyAfterCommit(page, world, 'virtual-pick');
    await page.locator('.virtual-game-card').first().getByRole('button', { name: 'Place virtual pick' }).click();
    await expect(page.getByRole('alert')).toContainText('could not confirm whether your save completed');
    expect(calls.filter(call => call.path === 'virtual-pick')).toHaveLength(1);
    await page.getByRole('button', { name: 'Check saved picks' }).click();
    await expect(page.locator('.auth-notice')).toHaveText('Your saved Virtual Units pick is confirmed.');
    await expect(page.locator('.virtual-save')).toHaveCount(1);
    expect(calls.filter(call => call.path === 'virtual-pick')).toHaveLength(1);
    page.once('dialog', dialog => dialog.dismiss());
    await tab(page, 'Home').click();
    await expect(page.getByRole('heading', { name: 'Bets', level: 1, exact: true })).toBeVisible();
    await expect(page.locator('.virtual-save')).toHaveCount(1);
    page.once('dialog', dialog => dialog.accept());
    await tab(page, 'Home').click();
    await expect(page.getByRole('heading', { name: 'Bets', level: 1, exact: true })).toHaveCount(0);
    await tab(page, 'Bets').click();
    await expect(view(page, 'Virtual Units')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.virtual-game-card')).toHaveCount(games.length);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});


test('an expired sign-in opens recovery above the tracked-bet editor and preserves its entered values', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    await openBets(page);
    const editor = await fillTicket(page, world.state.games[0].id);
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/social/create'), route => route.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: 'Sign in to continue.' }) }), { times: 1 });
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    const signInAgain = page.getByRole('alertdialog', { name: 'Sign in again' });
    await expect(signInAgain).toBeVisible();
    await signInAgain.getByLabel('Password', { exact: true }).fill('fixture-password');
    await signInAgain.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(signInAgain).not.toBeVisible();
    await expect(editor.getByLabel('Exact signed spread')).toHaveValue('-3.5');
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
