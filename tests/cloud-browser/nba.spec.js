// NBA in the Prism shell (milestone N1; D-85). Actual SQL ticket store in disposable PGlite, the real cloud handler and
// a synthetic board (nba-fixture.mjs). Each test names the contract it protects.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { prepareNbaImport } from '../../scripts/nba-private-import.mjs';
import { pgliteAvailable, signIn, ACCOUNTS } from './community-world.mjs';
import { nbaFixture, NBA_NOW } from './nba-fixture.mjs';
test.use({ actionTimeout: 10000, timezoneId: 'America/Los_Angeles' });

const NBA_PATHS = ['lobby', 'nba/games', 'nba/read'];
async function enter(page, hash) {
  await page.clock.setFixedTime(NBA_NOW);
  await page.goto(`/${hash}`); await signIn(page, 'luke', { navigate: false });
}
const hashOf = page => new URL(page.url()).hash;
const tab = (page, name) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
async function signOut(page) {
  await page.getByRole('button', { name: 'Your menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Sign out', exact: true }).click();
}
async function axe(page) {
  const result = await new AxeBuilder({ page }).include('.gx-nba').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations).toEqual([]);
}

test('contract: a cold v1 link lands on its new place in the Prism shell with official logos, reading no NFL data', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  const world = await nbaFixture(page, baseURL);
  try {
    await enter(page, '#nba/games?date=2026-11-10');
    await expect(page.getByRole('heading', { name: 'NBA games', exact: true })).toBeVisible();
    expect(hashOf(page)).toBe('#nba/research/games?date=2026-11-10');
    // The compact Prism frame: the NBA circle is selected, with the official league mark; no v1 header, panel or nav.
    await expect(page.locator('.gx.gx-nba[data-frame-context="nba-research"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'National Basketball Association', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Account and appearance', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'NBA navigation' })).toHaveCount(0);
    await expect(page.getByText('LIVE', { exact: true })).toHaveCount(1);
    // Every team shows its own decoded NBA logo; nothing in NBA draws an NFL team mark.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const logos = () => page.locator('main .gx-nba-badge img').evaluateAll(images => images.map(image => ({ src: new URL(image.src).pathname, ok: image.complete && image.naturalWidth > 0 })));
    await expect.poll(async () => (await logos()).filter(logo => logo.ok).length).toBe(12);
    for (const logo of await logos()) expect(logo.src).toMatch(/^\/team-logos\/nba\/[A-Z]{3}\.png$/);
    await expect(page.locator('main .gx-nba-badge[data-mark="nba-logo"].gx-team--loaded')).toHaveCount(12);
    expect(await page.locator('.gx-nba img[src*="/team-logos/"]').evaluateAll(images => images.filter(image => !new URL(image.src).pathname.startsWith('/team-logos/nba/')).length)).toBe(0);
    const league = await page.getByRole('button', { name: 'National Basketball Association', exact: true }).locator('img').evaluate(async image => { await image.decode().catch(() => {}); return image.naturalWidth; });
    expect(league).toBeGreaterThan(0);
    // Mount isolation: the NBA mount starts no NFL week, roster or community read.
    await tab(page, 'Home'); await expect(page.getByRole('heading', { name: 'NBA', exact: true })).toBeVisible();
    await tab(page, 'Bets'); await expect(page.getByRole('heading', { name: 'NBA bets', exact: true })).toBeVisible();
    await tab(page, 'Play'); await expect(page.getByText('NBA Guess the Spread is coming', { exact: true })).toBeVisible();
    expect(world.calls.map(call => call.path).filter(path => !NBA_PATHS.includes(path))).toEqual([]);
    await axe(page);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('contract: following a v1 link inside NBA replaces it (no Back loop); unknown fragments go to NBA Home', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  const world = await nbaFixture(page, baseURL);
  try {
    await enter(page, '#nba/home');
    await expect(page.getByRole('heading', { name: 'NBA', exact: true })).toBeVisible();
    for (const [legacy, target, heading] of [['#nba/bets', '#nba/bets/open', 'NBA bets'], ['#nba/history?status=win', '#nba/bets/history?status=win', 'NBA bets'], ['#nba/games', '#nba/research/games', 'NBA games']]) {
      await page.evaluate(hash => { location.hash = hash; }, legacy);
      await expect.poll(() => hashOf(page)).toBe(target);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await page.goBack();
      await expect.poll(() => hashOf(page)).toBe('#nba/home');
      await expect(page.getByRole('heading', { name: 'NBA', exact: true })).toBeVisible();
    }
    await page.evaluate(() => { location.hash = '#nba/not-a-place'; });
    await expect.poll(() => hashOf(page)).toBe('#nba/home');
    // The Bets root keeps its last pane and filters, as every tab root does.
    await tab(page, 'Bets');
    await expect.poll(() => hashOf(page)).toBe('#nba/bets/history?status=win');
    // Open/History and filters change the address in place: Back leaves Bets instead of looping between panes.
    await page.getByRole('group', { name: 'Bets view' }).getByRole('button', { name: 'Open', exact: true }).click();
    await expect.poll(() => hashOf(page)).toBe('#nba/bets/open');
    await page.getByRole('group', { name: 'Bets view' }).getByRole('button', { name: 'History', exact: true }).click();
    await expect.poll(() => hashOf(page)).toBe('#nba/bets/history');
    await page.getByRole('combobox', { name: 'Market' }).selectOption('total');
    await expect.poll(() => hashOf(page)).toBe('#nba/bets/history?market=total');
    await page.goBack();
    await expect.poll(() => hashOf(page)).toBe('#nba/home');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('contract: Track bet saves through /nba/save with uncertain-receipt recovery; Confirm result is one audited tap that keeps the stored price', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  test.setTimeout(90000);
  const world = await nbaFixture(page, baseURL);
  try {
    await enter(page, '#nba/research/games');
    const card = page.getByRole('article', { name: 'Philadelphia 76ers at Miami Heat' });
    await card.getByRole('button', { name: 'Track bet', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Track NBA bet' });
    await expect(sheet.getByLabel('Matchup 1', { exact: true })).toHaveValue('PHI at MIA');
    await sheet.getByLabel('Ticket label', { exact: true }).fill('76ers moneyline');
    await sheet.getByLabel('Team 1', { exact: true }).fill('PHI');
    await sheet.getByRole('group', { name: 'Odds format' }).getByRole('button', { name: 'Novig %', exact: true }).click();
    await sheet.getByLabel('Ticket price', { exact: true }).fill('49.5');
    await expect(sheet.getByText('49.5% Novig = +102 American. The value you type is stored as entered.')).toBeVisible();
    await sheet.getByLabel('Stake (Units)', { exact: true }).fill('1');
    await sheet.getByRole('button', { name: 'Review ticket', exact: true }).click();
    world.controls.loseSave = true;
    await sheet.getByRole('button', { name: 'Save ticket', exact: true }).click();
    await sheet.getByRole('button', { name: 'Check saved ticket', exact: true }).click();
    await expect(page.getByText('NBA ticket saved.', { exact: true })).toBeVisible();
    await expect(sheet).toHaveCount(0);
    expect(world.calls.filter(call => call.path === 'nba/save')).toHaveLength(1);
    const saved = world.calls.find(call => call.path === 'nba/save').body;
    expect(saved.ticket.priceInput).toEqual({ format: 'probability', value: 49.5 });
    expect(saved.ticket.legs[0].gameId).toBe('NBA:balldontlie:1001');

    await tab(page, 'Home');
    const queue = page.locator('.gx-nba-queue');
    await expect(queue.getByText('Final PHI 112–108 · Suggested: Win', { exact: false })).toBeVisible();
    // A suggestion never settles on its own.
    expect((await world.db.query('select outcome from nba_private.bets where id=$1', [saved.ticket.id])).rows[0].outcome).toBe('pending');
    await queue.getByRole('button', { name: 'Confirm result', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Confirm result' });
    await expect(confirm.getByRole('textbox', { name: 'Reason' })).toHaveValue('Confirmed from final score');
    await axe(page);
    await confirm.getByRole('button', { name: 'Confirm Win', exact: true }).click();
    await expect(page.getByText(/^Result saved · Win/)).toBeVisible();
    const confirmed = world.calls.filter(call => call.path === 'nba/save').at(-1).body;
    expect(confirmed).toMatchObject({ expectedRevision: 1, reason: 'Confirmed from final score' });
    expect(confirmed.ticket.outcome).toBe('win');
    expect(confirmed.ticket.priceInput).toEqual({ format: 'probability', value: 49.5 });
    const row = (await world.db.query('select outcome,net_units::text net from nba_private.bets where id=$1', [saved.ticket.id])).rows[0];
    expect(row).toEqual({ outcome: 'win', net: '1.02020200' });
    expect((await world.db.query('select count(*)::int n from nba_private.bet_changes')).rows[0].n).toBe(2);
    await expect(queue).toHaveCount(0);

    await tab(page, 'Bets');
    await page.getByRole('group', { name: 'Bets view' }).getByRole('button', { name: 'History', exact: true }).click();
    const ticket = page.getByRole('article', { name: '76ers moneyline, Won' });
    await ticket.getByText('Ticket details and correction history', { exact: true }).click();
    await expect(ticket.getByText('Original price: 49.5% Novig (shown as +102) · stored value unchanged')).toBeVisible();
    await expect(ticket.getByText('Revision 2 · Confirmed from final score')).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('contract: an unsaved ticket draft asks once before a tab, Back, sport change or close, and Cancel keeps it', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  const world = await nbaFixture(page, baseURL);
  try {
    await enter(page, '#nba/bets/open');
    await page.getByRole('button', { name: 'Track a bet', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Track NBA bet' });
    await sheet.getByLabel('Ticket label', { exact: true }).fill('PRIVATE DRAFT SENTINEL');
    let asked = 0;
    page.on('dialog', dialog => { asked += 1; dialog.dismiss(); });
    for (const [attempt, leave] of [['tab', () => page.evaluate(() => { location.hash = '#nba/play'; })], ['sport', () => page.evaluate(() => { location.hash = '#home'; })], ['back', () => page.goBack()], ['close', () => page.keyboard.press('Escape')]]) {
      const before = asked;
      await leave();
      await expect.poll(() => asked, { message: attempt }).toBe(before + 1);
      await expect(sheet.getByLabel('Ticket label', { exact: true })).toHaveValue('PRIVATE DRAFT SENTINEL');
      await expect(page.locator('.gx.gx-nba')).toHaveCount(1);
    }
    expect(world.calls.filter(call => call.path === 'nba/save')).toHaveLength(0);
    page.removeAllListeners('dialog'); page.on('dialog', dialog => { asked += 1; dialog.accept(); });
    await sheet.getByRole('button', { name: 'Cancel editor', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    // Once the draft is gone, leaving asks nothing.
    const settled = asked;
    await tab(page, 'Play');
    await expect(page.getByText('NBA Guess the Spread is coming', { exact: true })).toBeVisible();
    expect(asked).toBe(settled);
    await signOut(page); await signIn(page, 'troy', { navigate: false });
    await expect(page.getByText('NBA Guess the Spread is coming', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('PRIVATE DRAFT SENTINEL');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('server full-set pagination, filters, empty/unavailable/read failures, imported terms and account isolation', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.'); test.setTimeout(90000);
  const world = await nbaFixture(page, baseURL);
  let release;
  try {
    const seed = { id: randomUUID(), season: '2026-27', eventDate: '2026-10-01', kind: 'single', label: 'Synthetic page ticket', legs: [{ gameId: 'NBA:synthetic:1', matchup: 'AWY at HOM', market: 'spread', team: 'AWY', line: -2.5 }], priceInput: { format: 'american', value: 125 }, stakeUnits: 1, outcome: 'win' };
    for (let i = 0; i < 103; i++) await world.directSave({ ...seed, id: randomUUID(), label: `Synthetic page ticket ${i}` });
    await world.directSave({ ...seed, id: randomUUID(), label: 'Older pending sentinel', outcome: 'pending' });
    const original = { ...seed, id: randomUUID(), label: 'Synthetic imported ticket', outcome: 'pending', odds: -132.5581, sport: 'nba', netUnits: null, oddsBasis: 'Synthetic source price', stakeBasis: 'Synthetic source stake', stakeUnits: 0.12345678 };
    delete original.priceInput; original.legs = [{ gameId: 'NBA:synthetic:2', market: 'spread', team: 'AWY', line: -2.5 }];
    await world.db.exec(prepareNbaImport(JSON.stringify({ entries: [original] }), { ownerId: ACCOUNTS.luke.id, importId: randomUUID() }).sql);
    await enter(page, '#nba/research/games');
    world.controls.empty = true;
    await page.getByRole('group', { name: 'Game day' }).getByRole('button', { name: 'Yesterday', exact: true }).click();
    await expect(page.getByText(/^No NBA games on /)).toBeVisible();
    world.controls.unavailable = true; await page.getByRole('button', { name: 'Refresh games', exact: true }).click();
    await expect(page.getByText('Games are unavailable.', { exact: false })).toBeVisible();
    await expect(page.getByText(/^No NBA games on /)).toHaveCount(0);
    world.controls.failGames = true; await page.getByRole('button', { name: 'Refresh games', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Couldn’t refresh.' })).toBeVisible();
    world.controls.failGames = false; world.controls.empty = false; world.controls.unavailable = false;
    await tab(page, 'Bets');
    await expect(page.getByRole('article', { name: 'Older pending sentinel, Open' })).toBeVisible();
    // Imported terms show a whole price; the original stays in the details and the save path.
    const imported = page.getByRole('article', { name: 'Synthetic imported ticket, Open' });
    await expect(imported.getByText('AWY −2.5 · −133', { exact: false })).toBeVisible();
    await page.getByRole('group', { name: 'Bets view' }).getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.getByText('Filtered totals · 103 tickets')).toBeVisible();
    await expect(page.getByText('+128.75 U', { exact: true })).toBeVisible();
    await expect(page.locator('.gx-nba-ticket')).toHaveCount(100);
    await page.getByRole('button', { name: 'Load more tickets' }).click();
    await expect(page.locator('.gx-nba-ticket')).toHaveCount(103);
    await expect(page.getByText('+128.75 U', { exact: true })).toBeVisible();
    await page.getByLabel('From', { exact: true }).fill('2026-10-20');
    await expect(page.getByText('No tickets match these filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(page.getByText('Filtered totals · 103 tickets')).toBeVisible();
    world.controls.failRead = true;
    await page.getByRole('button', { name: 'Refresh tickets' }).click();
    await expect(page.getByText('History couldn’t load. Your filters are kept.', { exact: false })).toBeVisible();
    world.controls.failRead = false;
    world.controls.holdRead = new Promise(resolve => { release = resolve; });
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect.poll(() => world.controls.readHeld).toBe(true);
    // Hold the first owner's already-computed reply across a genuine account change.
    world.controls.holdRead = null;
    await signOut(page);
    await signIn(page, 'troy', { navigate: false });
    await expect(page.getByText('No settled NBA tickets yet.')).toBeVisible();
    release();
    await expect(page.getByText('Filtered totals · 0 tickets')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Synthetic page ticket');
    await expect(page.locator('body')).not.toContainText('Older pending sentinel');
    expect(world.errors).toEqual([]);
  } finally { release?.(); await world.db.close(); }
});

test('sport entry and return: the NFL circle leaves NBA, an NFL draft guards the way back, and NBA stays off the NFL switch', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.'); test.setTimeout(60000);
  const world = await nbaFixture(page, baseURL);
  try {
    await page.goto('/#nba/home'); await signIn(page, 'luke', { navigate: false });
    await expect(page.getByRole('heading', { name: 'NBA', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'National Football League', exact: true }).click();
    await expect(page.locator('.gx.gx-nba')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.gx-topbar .gx-home-sports')).toBeVisible();
    await expect(page.getByRole('button', { name: 'National Football League', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // NBA_ON_SWITCH is false: no NBA circle on NFL.
    await expect(page.getByRole('button', { name: 'National Basketball Association', exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Play/ }).click();
    await page.getByRole('group', { name: 'Guess market', exact: true }).getByRole('button', { name: 'Spread', exact: true }).click();
    await page.locator('.gx-per-game [data-tile]').first().click();
    await page.getByRole('button', { name: /Pick'em/i }).first().click();
    let confirms = 0;
    page.on('dialog', dialog => { confirms++; dialog.dismiss(); });
    await page.evaluate(() => { location.hash = '#nba/home'; });
    await expect.poll(() => confirms).toBe(1); await expect(page.locator('.gx.gx-nba')).toHaveCount(0);
    const nflHash = hashOf(page);
    page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.accept());
    await page.evaluate(() => { location.hash = '#nba/home'; });
    await expect(page.getByRole('heading', { name: 'NBA', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'National Football League', exact: true }).click();
    await expect(page.locator('.gx.gx-nba')).toHaveCount(0);
    expect(hashOf(page)).toBe(nflHash);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
