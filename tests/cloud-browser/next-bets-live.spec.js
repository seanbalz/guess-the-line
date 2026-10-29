import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn, sendBallot, storeBookLines } from './community-world.mjs';
import { ALL } from '../migrations.mjs';

// The new Bets tab on the schema players have today, using the existing social and virtual routes.
// All accounts, tickets, prices and writes are local fixtures. No hosted account or provider is contacted.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(60000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));
const tab = (page, name) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true });
const view = (page, name) => page.getByRole('group', { name: 'Bets view' }).getByRole('button', { name, exact: true });
async function openBets(page) {
  await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('/#bets/tracked');
  await signIn(page, 'luke', { navigate: false });
  await expect(page.getByRole('heading', { name: 'Tracked bets', level: 1, exact: true })).toBeVisible();
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

test('Bets roots open creation from fresh all-week lists and remembered Add scope without saving', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    const calls = callsFrom(page);
    await openBets(page);
    for (const destination of ['Active tickets', 'Settled tickets']) {
      await tab(page, 'Bets').click();
      await page.getByRole('button', { name: destination, exact: true }).click();
      await expect(page.getByLabel('Competition week')).toHaveValue('all');
      await expect(page.getByRole('button', { name: 'Add bet', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Add bet', exact: true }).click();
      const editor = page.getByRole('dialog', { name: 'Add a tracked bet' });
      await expect(editor).toBeVisible();
      await expect(page.getByLabel('Competition week')).toHaveValue(`${world.state.league.season}:${world.state.league.week}`);
      await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    await tab(page, 'Bets').click();
    await page.getByRole('button', { name: 'Add a bet', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Add a tracked bet' });
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByLabel('Competition week').selectOption('all');
    await tab(page, 'Bets').click();
    await page.getByRole('button', { name: 'Add a bet', exact: true }).click();
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Save tracked bet', exact: true })).toBeDisabled();
    expect(calls.filter(call => call.path === 'social/create')).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Community tracked bets work without private membership; create, own week and history retain the same ticket', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    await world.db.query('delete from public.gtl_memberships where user_id=$1', [ACCOUNTS.luke.id]);
    await world.db.query('insert into public.gtl_favorites(user_id,season,week,game_id,saved,notes) values($1,$2,$3,$4,true,$5)', [ACCOUNTS.luke.id, world.state.league.season, world.state.league.week, world.state.games[0].id, 'PRIVATE NOTE SENTINEL']);
    const calls = callsFrom(page);
    await openBets(page);
    await expect(page.locator('body')).not.toContainText('PRIVATE NOTE SENTINEL');
    // D-55: the sharing note is behind the title's ⓘ.
    await expect(page.locator('.gx-bets')).not.toContainText('Tracked bets are shared with all signed-in players');
    await page.getByRole('button', { name: 'About tracked bets', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'About tracked bets' })).toContainText('Tracked bets are shared with all signed-in players');
    await page.getByRole('dialog', { name: 'About tracked bets' }).getByRole('button', { name: 'Close', exact: true }).click();
    await view(page, 'Virtual Units').click();
    await expect(page.locator('[data-bets="place"]')).toBeVisible();
    expect(calls.filter(call => call.path.startsWith('virtual-'))).toEqual([]);
    await view(page, 'Tracked bets').click();
    const editor = await fillTicket(page, world.state.games[0].id);
    // Choosing a matchup, side, line, price and book is entirely taps and does not write until Save.
    expect(calls.filter(call => call.path === 'social/create')).toEqual([]);
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    await page.getByLabel('Bet tracker view', { exact: true }).selectOption('myweek');
    await expect(page.getByRole('heading', { name: 'Your weekly bet card' })).toBeVisible();
    await expect.poll(() => calls.filter(call => call.path === 'social/read').at(-1)?.body.filters.playerId).toBe(ACCOUNTS.luke.id);
    await page.getByLabel('Bet tracker view', { exact: true }).selectOption('history');
    await expect(page.getByRole('heading', { name: 'Bet history', exact: true })).toBeVisible();
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    const writes = calls.filter(call => call.path === 'social/create');
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({ kind: 'single', odds: -110, stakeUnits: 1, source: 'DraftKings',
      legs: [{ gameId: world.state.games[0].id, market: 'spread', side: 'home', line: -3.5 }] });
    // Opening Virtual Units above reads /bets/read (D-67); a tracked ticket never calls another Bets route.
    expect(calls.some(call => call.path === 'state' || (call.path.startsWith('bets/') && call.path !== 'bets/read'))).toBe(false);
    await page.getByLabel('Bet tracker view', { exact: true }).selectOption('mybets');
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

// Stages 43 and 44 (Sean, October 28, 2026): Your picks is the account-level placing screen, writing through M-11.
test('Your picks places two bets, confirms a lost reply without a duplicate, edits, and refuses a bet changed elsewhere', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { optionalRpc: true, migrations: ALL });
  try {
    const games = world.state.games, [g0, g1] = games;
    await storeBookLines(world, { spread: Object.fromEntries(games.map(game => [game.id, -3.5])), total: Object.fromEntries(games.map(game => [game.id, 44.5])) });
    await sendBallot(world, 'luke', 'guess_spread', Object.fromEntries(games.map(game => [game.id, -3])));
    const calls = callsFrom(page);
    const saved = async () => (await world.db.query('select game_id,selection,audit from public.gtl_virtual_units_picks where user_id=$1 order by game_id', [ACCOUNTS.luke.id])).rows;
    await openBets(page);
    await view(page, 'Virtual Units').click();
    const place = page.locator('[data-bets="place"]');
    await expect(place).toBeVisible();
    expect(calls.filter(call => call.path.startsWith('virtual-'))).toEqual([]);
    // Spread is locked in, so its prices show; Total is not, so every game's Total is a lock sentence with no line.
    await expect(place.locator('[data-market="total"]').getByText('Lock in your Total guess', { exact: false })).toHaveCount(games.length);
    expect((await place.locator('[data-market="total"]').allTextContents()).join(' ')).not.toContain('44.5');
    const chip = (game, side) => place.locator(`[data-game="${game.id}"] [data-market="spread"] .gx-chip`).nth(side === 'away' ? 0 : 1);
    await chip(g0, 'home').click();
    await chip(g1, 'home').click();
    await expect(chip(g0, 'home')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Review slip', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Your slip' });
    await sheet.locator(`[data-slip="${g0.id}:spread"]`).getByRole('button', { name: '2 units', exact: true }).click();
    await loseReplyAfterCommit(page, world, 'bets/place');
    await sheet.getByRole('button', { name: /^Place 2 bets/ }).click();
    await expect(sheet.getByRole('alert')).toContainText('could not confirm');
    await sheet.getByRole('button', { name: 'Retry the same save', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    let writes = calls.filter(call => call.path === 'bets/place');
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toEqual(writes[0].body);
    expect(writes[0].body.bets.map(bet => [bet.gameId, bet.units, bet.expected])).toEqual([[g0.id, 2, null], [g1.id, 1, null]]);
    expect((await saved()).map(row => row.audit.length)).toEqual([1, 1]);
    await expect(place.locator(`[data-game="${g0.id}"] [data-market="spread"] .gx-tag`)).toContainText('2U');

    // Another device edits the second bet. This screen still holds the old terms, so its edit is refused and nothing is overwritten.
    const other = (await saved()).find(row => row.game_id === g1.id).selection;
    const expected = { side: other.side, line: other.line, odds: other.odds, units: other.units, source: other.source, quotedAt: other.quotedAt };
    const elsewhere = await world.api('luke', 'bets/place', { season: world.state.league.season, week: world.state.league.week, requestId: crypto.randomUUID(),
      bets: [{ gameId: g1.id, market: 'spread', side: other.side, line: other.line, odds: other.odds, units: 3, source: other.source, quotedAt: other.quotedAt, expected }] });
    expect(elsewhere.status, JSON.stringify(elsewhere.body)).toBe(200);
    await chip(g1, 'away').click();
    await page.getByRole('button', { name: 'Review slip', exact: true }).click();
    await sheet.getByRole('button', { name: /^Place 1 bet/ }).click();
    await expect(sheet.getByRole('alert')).toContainText('A bet changed since you opened it');
    expect((await saved()).find(row => row.game_id === g1.id).selection.units).toBe(3);
    // The refreshed read carries the new terms; placing again edits on top of them with a full audit.
    await sheet.getByRole('button', { name: /^Place 1 bet/ }).click();
    await expect(sheet).toHaveCount(0);
    const edited = (await saved()).find(row => row.game_id === g1.id);
    expect(edited.selection.side).toBe('away');
    expect(edited.audit.map(event => event.type)).toEqual(['placed', 'edited', 'edited']);
    expect(calls.some(call => call.path === 'virtual-pick')).toBe(false);

    // A slip holds the leave guard; dismissing the confirmation keeps it.
    await chip(g0, 'away').click();
    // The board, the dock and the open slip fit a phone in both themes.
    for (const width of [390, 320]) for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}px board fits`).toBe(true);
      await page.screenshot({ path: `.local/previews/next-bets-place-${theme}-${width}.png` });
      await page.getByRole('button', { name: 'Review slip', exact: true }).click();
      await expect(sheet).toBeVisible();
      await page.waitForTimeout(400); // the sheet's entrance animation, for the screenshot only
      expect(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${theme} ${width}px slip fits`).toBe(true);
      await page.screenshot({ path: `.local/previews/next-bets-slip-${theme}-${width}.png` });
      await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    page.once('dialog', dialog => dialog.dismiss());
    await tab(page, 'Home').click();
    await expect(page.getByRole('heading', { name: 'Virtual Units', level: 1, exact: true })).toBeVisible();
    await expect(chip(g0, 'away')).toHaveAttribute('aria-pressed', 'true');
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
    await expect(page.getByLabel('Bet tracker view', { exact: true })).toHaveValue('mybets');
    await expect(page.getByRole('button', { name: 'Following', exact: true })).toHaveCount(0);
    await expect(page.locator('.social-bet-card')).toHaveCount(5);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      for (const width of [390, 320, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await page.locator('.social-feed').screenshot({ path: `.local/previews/tracked-list-${theme}-${width}.png` });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.gx-tracked-row > summary').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.gx-tracked-row').first()).toHaveAttribute('open', '');
    const scan = await new AxeBuilder({ page }).include('.gx-bets').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(scan.violations.map(issue => issue.id)).toEqual([]);
    await page.locator('.gx-tracked-row').first().screenshot({ path: '.local/previews/tracked-row-expanded.png' });
    await expect(page.locator('.social-feed')).not.toContainText('RIVAL SENTINEL');
    await expect(page.locator('.social-feed')).not.toContainText('LEGACY VIRTUAL');
    expect(calls.at(-1).filters.origin).toBe('tracked');
    await page.getByRole('group', { name: 'Result filter', exact: true }).getByRole('button', { name: 'Pending', exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await expect(page.locator('.social-bet-card')).toHaveCount(0);
    await page.getByRole('group', { name: 'Result filter', exact: true }).getByRole('button', { name: 'Settled', exact: true }).click();
    await expect(page.locator('.social-bet-card')).toHaveCount(4);
    release();
    await page.locator('.social-filters > summary').click();
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
    await page.reload();
    await expect(page.getByLabel('Competition week')).toHaveValue(season + ':' + (week - 1));
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    await expect(page.locator('.social-feed')).toContainText('PREVIOUS OWNER');
    await page.evaluate(({ season, week }) => { location.hash = `bets/tracked?season=${season}&week=${week}`; }, { season, week });
    await expect(page.getByLabel('Competition week')).toHaveValue(season + ':' + week);
    await expect(page.locator('.social-bet-card')).toHaveCount(5);
    await page.goBack();
    await expect(page.getByLabel('Competition week')).toHaveValue(season + ':' + (week - 1));
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    await page.getByLabel('Competition week').selectOption('all');
    await page.getByLabel('Bet tracker view', { exact: true }).selectOption('feed');
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
    await page.locator('.gx-tracked-row > summary').click();
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

// Contract: on a phone, every tracker toolbar control keeps its whole label and icon inside its own box and inside
// the screen, and no two controls overlap, in every view, both themes, at 320 and 390 (Sean's October 21 screenshot:
// "Following" was squeezed into the 44px refresh column and spilled over the Player select).
test('the tracked-bet toolbar fits a phone in every view: Following, Player and refresh never clip or overlap', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    await openBets(page);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        for (const value of ['mybets', 'feed', 'myweek', 'compare', 'history']) {
          await page.getByLabel('Bet tracker view').selectOption(value);
          const toolbar = page.locator('.social-toolbar');
          await expect(toolbar.getByRole('button', { name: 'Refresh bet tracker', exact: true })).toBeVisible();
          if (value !== 'mybets') await expect(toolbar.getByRole('button', { name: 'Following', exact: true })).toBeVisible();
          const problems = await toolbar.evaluate(bar => {
            const out = [], vw = document.documentElement.clientWidth;
            const controls = [...bar.querySelectorAll('button, select')].filter(el => el.getClientRects().length);
            for (const el of controls) {
              const r = el.getBoundingClientRect(), name = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30);
              if (el.scrollWidth > el.clientWidth + 1) out.push(`${name}: content wider than its box`);
              if (r.left < 0 || r.right > vw + 0.5) out.push(`${name}: outside the screen`);
              for (const child of el.querySelectorAll('svg')) { const c = child.getBoundingClientRect(); if (c.left < r.left - 0.5 || c.right > r.right + 0.5) out.push(`${name}: icon outside its box`); }
              for (const other of controls) {
                if (other === el) continue;
                const q = other.getBoundingClientRect();
                if (Math.min(r.right, q.right) - Math.max(r.left, q.left) > 1 && Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > 1) out.push(`${name}: overlaps ${other.getAttribute('aria-label') || other.textContent.trim().slice(0, 30)}`);
              }
            }
            const refresh = bar.querySelector('.icon-button').getBoundingClientRect();
            if (refresh.width > 48) out.push(`refresh: ${Math.round(refresh.width)}px wide, expected the 44px icon button`);
            return [...new Set(out)];
          });
          expect(problems, `${theme} ${width}px ${value}`).toEqual([]);
        }
      }
    }
  } finally {
    await world.db.close();
  }
});
