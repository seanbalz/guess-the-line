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
  await expect(editor.getByRole('button', {name: 'Save tracked bet', exact: true})).toBeDisabled();
  await expect(editor.getByRole('group', {name: 'Units risked', exact: true}).getByRole('button', {name: 'Unknown', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await editor.getByRole('group', { name: 'Matchup', exact: true }).getByRole('button', { name: gameId.replace('-', ' @ '), exact: true }).click();
  await editor.getByRole('group', { name: 'Team', exact: true }).getByRole('button', { name: gameId.split('-')[1], exact: true }).click();
  await editor.getByRole('button', { name: 'Favorite (−)', exact: true }).click();
  await editor.getByRole('group', { name: 'Exact signed spread', exact: true }).getByRole('button', { name: '−3.5', exact: true }).click();
  await editor.getByRole('group', { name: 'American odds', exact: true }).getByRole('button', { name: '−110', exact: true }).click();
  await editor.getByRole('group', { name: 'Units risked', exact: true }).getByRole('button', { name: '1u', exact: true }).click();
  await editor.getByRole('group', { name: 'Sportsbook / quote source', exact: true }).getByRole('button', { name: 'DraftKings', exact: true }).click();
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
    // Choosing a matchup, side, line, price and book is entirely taps and does not write until Save.
    expect(calls.filter(call => call.path === 'social/create')).toEqual([]);
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'My week', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your weekly bet card' })).toBeVisible();
    await expect.poll(() => calls.filter(call => call.path === 'social/read').at(-1)?.body.filters.playerId).toBe(ACCOUNTS.luke.id);
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bet history', exact: true })).toBeVisible();
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    const writes = calls.filter(call => call.path === 'social/create');
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({ kind: 'single', odds: -110, stakeUnits: 1, source: 'DraftKings',
      legs: [{ gameId: world.state.games[0].id, market: 'spread', side: 'home', line: -3.5 }] });
    expect(calls.some(call => call.path === 'state' || call.path.startsWith('bets/'))).toBe(false);
    await page.getByRole('button', { name: 'My bets', exact: true }).click();
    await page.getByLabel('Competition week').selectOption(`${world.state.league.season}:${world.state.league.week}`);
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
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
    await expect(editor.getByRole('group', { name: 'Exact signed spread', exact: true }).getByRole('button', { name: '−3.5', exact: true })).toHaveAttribute('aria-pressed', 'true');
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

test('a total ticket uses only buttons, keeps unknown odds and fits the phone editor in both themes', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    const calls = callsFrom(page), gameId = world.state.games[0].id;
    await openBets(page);
    await page.getByRole('button', { name: 'Add bet', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Add a tracked bet' });
    await editor.getByRole('group', { name: 'Matchup', exact: true }).getByRole('button', { name: gameId.replace('-', ' @ '), exact: true }).click();
    await editor.getByRole('group', { name: 'Market', exact: true }).getByRole('button', { name: 'Total', exact: true }).click();
    await editor.getByRole('group', { name: 'Direction', exact: true }).getByRole('button', { name: 'Over', exact: true }).click();
    await editor.getByRole('group', { name: 'Exact total', exact: true }).getByRole('button', { name: '44.5', exact: true }).click();
    await editor.getByRole('button', { name: 'Increase total by 0.5', exact: true }).click();
    await editor.getByRole('group', { name: 'Units risked', exact: true }).getByRole('button', { name: '2u', exact: true }).click();
    await editor.getByRole('group', { name: 'American odds', exact: true }).getByRole('button', { name: 'Unknown', exact: true }).click();
    await editor.getByRole('group', { name: 'Sportsbook / quote source', exact: true }).getByRole('button', { name: 'Novig', exact: true }).click();
    expect(calls.filter(call => call.path === 'social/create')).toEqual([]);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}px page fits`).toBe(true);
        expect(await editor.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${theme} ${width}px editor fits`).toBe(true);
        const scan = await new AxeBuilder({ page }).include('.social-modal').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(scan.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
        await page.screenshot({ path: `.local/previews/bet-button-editor-${theme}-${width}.png`, fullPage: true });
      }
    }
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    const writes = calls.filter(call => call.path === 'social/create');
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({ kind: 'single', odds: null, stakeUnits: 2, source: 'Novig', quotedAt: null, placedAt: null,
      legs: [{ gameId, market: 'total', side: 'over', line: 45 }] });
    await expect(page.locator('.social-bet-card')).toContainText('Odds unknown');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('custom ticket terms stay exact when switching back to buttons and changing matchups', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    const calls = callsFrom(page);
    await openBets(page);
    const editor = await fillTicket(page, world.state.games[0].id);
    const line = editor.getByRole('group', { name: 'Exact signed spread', exact: true });
    await line.getByRole('button', { name: 'Custom', exact: true }).click();
    await editor.getByRole('spinbutton', { name: 'Exact signed spread', exact: true }).fill('-8.5');
    const odds = editor.getByRole('group', { name: 'American odds', exact: true });
    await odds.getByRole('button', { name: 'Custom', exact: true }).click();
    await editor.getByRole('spinbutton', { name: 'American odds', exact: true }).fill('-112.5');
    await editor.getByRole('group', { name: 'Units risked', exact: true }).getByRole('button', { name: '1.5u', exact: true }).click();
    await editor.getByRole('button', { name: 'Change matchup', exact: true }).click();
    const nextId = world.state.games[1].id;
    await editor.getByRole('group', { name: 'Matchup', exact: true }).getByRole('button', { name: nextId.replace('-', ' @ '), exact: true }).click();
    await editor.getByRole('group', { name: 'Team', exact: true }).getByRole('button', { name: nextId.split('-')[0], exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Save tracked bet', exact: true })).toBeDisabled();
    // A custom price and stake are ticket-level terms, so changing the matchup must not rewrite them.
    await expect(editor.getByRole('spinbutton', { name: 'American odds', exact: true })).toHaveValue('-112.5');
    if (!await editor.getByRole('spinbutton', { name: 'Exact signed spread', exact: true }).isVisible()) await line.getByRole('button', { name: 'Custom', exact: true }).click();
    await editor.getByRole('spinbutton', { name: 'Exact signed spread', exact: true }).fill('8.5');
    expect(calls.filter(call => call.path === 'social/create')).toEqual([]);
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    const writes = calls.filter(call => call.path === 'social/create');
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({ odds: -112.5, stakeUnits: 1.5,
      legs: [{ gameId: nextId, market: 'spread', side: 'away', line: 8.5 }] });
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
    await expect(editor.getByRole('group', { name: 'Exact signed spread', exact: true }).getByRole('button', { name: '−3.5', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('My bets keeps ownership across weeks and grouped filters, hides an obsolete read and opens sharing explicitly', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  const { emptySocialState, socialView } = await import('../../shared/social-bets.mjs');
  let release;
  let held = false;
  const state = emptySocialState(), season = 2026, week = world.state.league.week;
  const base = { ownerId: ACCOUNTS.luke.id, season, week, kind: 'single', origin: 'tracked', odds: 100, stakeUnits: 1, source: 'Fixture', recordedAt: '2026-10-08T15:00:00Z', countsForRecord: true, revision: 1 };
  for (const [i, outcome] of ['pending', 'win', 'loss', 'push', 'void'].entries())
    state.entries.push({ ...base, id: 'ticket' + i, outcome, legs: [{ gameId: world.state.games[0].id, market: i === 2 ? 'total' : 'spread', side: i === 2 ? 'over' : 'home', line: i === 2 ? 44.5 : -3.5, selection: 'Owner ' + outcome }] });
  state.entries.push({ ...state.entries[0], id: 'rival', ownerId: ACCOUNTS.troy.id, legs: [{ ...state.entries[0].legs[0], selection: 'RIVAL SENTINEL' }] });
  state.entries.push({ ...state.entries[0], id: 'previous', week: week - 1, legs: [{ ...state.entries[0].legs[0], selection: 'PREVIOUS OWNER' }] });
  state.entries.push({ ...state.entries[0], id: 'legacy-virtual', origin: 'virtual', legs: [{ ...state.entries[0].legs[0], selection: 'LEGACY VIRTUAL' }] });
  const calls = [];
  await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/social/read'), async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const result = { ...socialView(state, { actorId: ACCOUNTS.luke.id, games: world.state.games, filters: body.filters, season: body.allHistory ? null : season, week: body.allHistory ? null : body.week || week }), actorId: ACCOUNTS.luke.id, season, week: body.week || week, games: world.state.games, availableWeeks: [{ season, week }, { season, week: week - 1 }], weekRevision: 0 };
    if (body.filters?.outcome === 'pending' && !held) {
      held = true;
      await new Promise(resolve => release = resolve);
    }
    await route.fulfill({ json: result }).catch(() => { });
  });
  try {
    await openBets(page);
    await expect(page.getByRole('button', { name: 'My bets', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Following', exact: true })).toHaveCount(0);
    await expect(page.locator('.social-bet-card')).toHaveCount(5);
    await expect(page.locator('.social-feed')).not.toContainText('RIVAL SENTINEL');
    await expect(page.locator('.social-feed')).not.toContainText('LEGACY VIRTUAL');
    expect(calls.at(-1).filters.origin).toBe('tracked');
    await page.getByRole('group', { name: 'Result filter', exact: true }).getByRole('button', { name: 'Pending', exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await expect(page.locator('.social-bet-card')).toHaveCount(0);
    await page.getByRole('group', { name: 'Result filter', exact: true }).getByRole('button', { name: 'Settled', exact: true }).click();
    await expect(page.locator('.social-bet-card')).toHaveCount(4);
    release();
    await page.getByRole('group', { name: 'Market filter', exact: true }).getByRole('button', { name: 'Spreads', exact: true }).click();
    await expect(page.locator('.social-bet-card')).toHaveCount(3);
    await expect(page.locator('.social-content')).toContainText('Filtered summary');
    await page.getByRole('group', { name: 'Market filter', exact: true }).getByRole('button', { name: 'Props', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/social/read'), route => route.fulfill({ status: 503, json: { error: 'Fixture read unavailable' } }), { times: 1 });
    await page.getByRole('group', { name: 'Result filter', exact: true }).getByRole('button', { name: 'Pending', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Fixture read unavailable');
    await expect(page.locator('.social-bet-card')).toHaveCount(0);
    await page.getByRole('group', { name: 'Result filter', exact: true }).getByRole('button', { name: 'All', exact: true }).click();
    await page.getByLabel('Competition week').selectOption('all');
    await expect(page.locator('.social-bet-card')).toHaveCount(6);
    expect(calls.at(-1).filters.playerId).toBe(ACCOUNTS.luke.id);
    await page.getByLabel('Competition week').selectOption(season + ':' + (week - 1));
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    await expect(page.locator('.social-feed')).toContainText('PREVIOUS OWNER');
    expect(calls.at(-1).filters.playerId).toBe(ACCOUNTS.luke.id);
    await page.getByLabel('Competition week').selectOption('all');
    await page.getByRole('button', { name: 'All bets', exact: true }).click();
    await expect(page.locator('.social-bet-card')).toHaveCount(8);
    await expect(page.locator('.social-feed')).toContainText('LEGACY VIRTUAL');
    await expect(page.locator('.social-feed')).toContainText('RIVAL SENTINEL');
  }
  finally {
    release?.();
    await world.db.close();
  }
});

test('an inclusion save finishing after a filter change does not invalidate the active read', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  let releaseSave, releaseRead;
  let saveHeld = false, readHeld = false;
  try {
    await openBets(page);
    const editor = await fillTicket(page, world.state.games[0].id);
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/social/include'), async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.text();
      expect(response.status).toBe(200);
      saveHeld = true;
      await new Promise(resolve => releaseSave = resolve);
      await route.fulfill({ status: response.status, contentType: 'application/json', body });
    });
    await page.locator('.social-bet-card').getByText('Details & history', { exact: true }).click();
    await page.getByRole('button', { name: /Exclude from records/ }).click();
    await expect.poll(() => saveHeld).toBe(true);
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/social/read'), async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      const body = await response.text();
      if (req.postDataJSON().filters?.outcome === 'pending') {
        readHeld = true;
        await new Promise(resolve => releaseRead = resolve);
      }
      await route.fulfill({ status: response.status, contentType: 'application/json', body });
    });
    await page.getByRole('group', { name: 'Result filter', exact: true }).getByRole('button', { name: 'Pending', exact: true }).click();
    await expect.poll(() => readHeld).toBe(true);
    releaseSave();
    await expect(page.locator('.social-notice')).toBeVisible();
    releaseRead();
    await expect(page.locator('.social-loading')).toHaveCount(0);
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    await expect(page.locator('.social-data-note')).toContainText('1 excluded');
    expect(world.errors).toEqual([]);
  } finally {
    releaseSave?.();
    releaseRead?.();
    await world.db.close();
  }
});
