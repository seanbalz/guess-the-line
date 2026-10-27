import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { HOSTED } from '../migrations.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn, storeBookLines } from './community-world.mjs';

// Historical D-16 compatibility before M-02; current per-game locking and scoring are
// covered by next-per-game-scoring.spec.js using the current hosted migrations.
const D16_MIGRATIONS = HOSTED.filter(file => file < '20261015030000_gtl_sent_picks_final.sql');
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const dock = page => page.getByRole('navigation', { name: 'Main' });
const tab = (page, name) => dock(page).getByRole('button', { name: new RegExp(`^${name}(, .+)?$`) });
const editor = page => page.locator('.gx-live-play .week-picks');
const cards = page => editor(page).locator('.week-pick');
const market = (page, label) => editor(page).getByRole('group', { name: 'Market', exact: true }).getByRole('button', { name: new RegExp(`^${label}`) });
async function pickSpread(page, index, value) {
  const card = cards(page).nth(index);
  await card.locator('[data-side="home"]').click();
  await card.locator(`.number-chip[data-value="${value}"]`).click();
}
async function fixture(page, baseURL, options = {}) {
  const world = await communityWorld(page, baseURL, { migrations: D16_MIGRATIONS, optionalRpc: true, ...options });
  const lines = values => Object.fromEntries(world.state.games.map((g, i) => [g.id, values[i]]));
  await storeBookLines(world, { spread: lines([-2.5, 6.5]), total: lines([41.5, 47.5]) });
  expect((await world.api('luke', 'personal')).body.rules.sentFinal).toBe(false);
  return world;
}
async function enterSpread(page) {
  await tab(page, 'Play').click();
  await expect(page.locator('[data-landing="play"]')).toBeVisible();
  const spread = page.getByRole('button', { name: 'Guess the Spread', exact: true });
  if (await spread.isVisible()) await spread.click();
  else await page.getByRole('button', { name: 'Continue guessing', exact: true }).click();
}
async function openPlay(page) {
  await signIn(page, 'luke');
  await enterSpread(page);
  await expect(editor(page)).toBeVisible();
  await expect(page).toHaveURL(/#play\/picks/);
}
async function ballot(world, mode = 'guess_spread') {
  const row = (await world.db.query('select ballot from public.gtl_weekly_ballots where user_id=$1 and mode=$2', [ACCOUNTS.luke.id, mode])).rows[0];
  return row?.ballot ?? null;
}

test('Play saves drafts, restores tab edits, submits a whole market and still edits under historical D-16', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL, { groupScreens: true });
  expect((await world.api('luke', 'leagues', { name: 'Play fixture group', format: 'group', practice: false, requestId: randomUUID() })).status).toBe(200);
  const writes = [];
  page.on('request', request => { if (request.url().endsWith('/personal/ballot')) writes.push(request.postDataJSON()); });
  try {
    await openPlay(page);
    await expect(editor(page).locator('.line-at-guess')).toHaveCount(0);
    await expect(editor(page).locator('.revealed-picks')).toHaveCount(0);
    await pickSpread(page, 0, 3);
    await editor(page).getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(editor(page).getByText('Draft saved.', { exact: true })).toBeVisible();
    expect((await ballot(world)).submittedAt).toBeNull();
    expect((await ballot(world)).picks[world.state.games[0].id]).toBe(-3);

    await pickSpread(page, 0, 4);
    await tab(page, 'Home').click();
    await enterSpread(page);
    await expect(editor(page).getByRole('heading', { name: 'Unsaved Spread picks found in this tab' })).toBeVisible();
    await editor(page).getByRole('button', { name: 'Restore picks', exact: true }).click();
    await expect(cards(page).first().locator('.number-chip[data-value="4"]')).toHaveAttribute('aria-checked', 'true');

    await market(page, 'Total').click();
    await expect(cards(page).first().locator('.chip-summary')).toHaveText('No pick yet');
    expect((await ballot(world)).picks[world.state.games[0].id]).toBe(-4);
    await cards(page).first().locator('.number-chip[data-value="44"]').click();
    await market(page, 'Spread').click();
    expect((await ballot(world, 'guess_total')).picks[world.state.games[0].id]).toBe(44);
    await pickSpread(page, 1, 7);
    await editor(page).getByRole('button', { name: 'Submit Spread', exact: true }).click();
    await expect(editor(page).locator('.submit-receipt')).toContainText('Spread submitted · 2 picks');
    await expect(editor(page)).toContainText('Submitted, editable until the deadline');
    const sent = await ballot(world);
    expect(sent.submittedAt).toBeTruthy();
    expect(Object.keys(sent.scoringReferences)).toHaveLength(2);

    // The receipt promises Community picks even when the shell currently shows a private group.
    await page.getByRole('button', { name: 'League: Community. Switch league', exact: true }).click();
    await page.getByRole('dialog', { name: 'Your leagues' }).getByRole('list', { name: 'Leagues' }).getByRole('button', { name: /^Play fixture group/ }).click();
    await editor(page).getByRole('button', { name: "See everyone's Spread picks", exact: true }).click();
    await expect(page.getByRole('group', { name: 'League sections' })).toBeVisible();
    await expect(page.locator('.gx-league-post').filter({ hasText: 'submitted Week 5 Spread picks.' }).first()).toBeVisible();
    await expect(page.getByRole('list', { name: 'Private group members' })).toHaveCount(0);
    await enterSpread(page);
    await expect(market(page, 'Spread')).toHaveAttribute('aria-pressed', 'true');

    await pickSpread(page, 0, 5);
    await expect(cards(page).first().locator('.gx-play-pick-state')).toHaveText('Unsaved edit');
    await editor(page).getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(editor(page).getByText('Spread picks submitted.', { exact: true })).toBeVisible();
    const edited = await ballot(world);
    expect(edited.picks[world.state.games[0].id]).toBe(-5);
    expect(edited.submittedAt).toBe(sent.submittedAt);
    expect((await ballot(world, 'guess_total')).submittedAt).toBeNull();
    await tab(page, 'Home').click();
    await expect(page.locator('[data-home="hero"]')).toContainText('Spread sent');
    await expect(tab(page, 'Play')).toHaveAccessibleName('Play, 1 ballot due');

    await enterSpread(page);
    await market(page, 'Total').click();
    await page.reload();
    await expect(market(page, 'Total')).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page).first().locator('.number-chip[data-value="44"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page).toHaveURL(/#play\/picks/);
    expect(writes.length).toBeGreaterThan(3);
    expect(writes.every(body => !Object.hasOwn(body, 'lockIn'))).toBe(true);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Play keeps typed picks through in-place sign-in and retries an uncertain save with the same request id', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  const writes = [];
  let nextFailure = 'auth';
  await page.route(`${SUPABASE}/functions/v1/gtl-api/personal/ballot`, async route => {
    const request = route.request();
    writes.push(request.postDataJSON());
    if (nextFailure === 'auth') {
      nextFailure = null;
      return route.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: 'Sign in to continue.' }) });
    }
    if (nextFailure === 'reply') {
      nextFailure = null;
      const response = await world.handler(new Request(request.url(), { method: 'POST', headers: request.headers(), body: request.postData() }));
      expect(response.status).toBe(200);
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{lost reply' });
    }
    return route.fallback();
  });
  try {
    await openPlay(page);
    await pickSpread(page, 0, 3);
    await editor(page).getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(editor(page)).toContainText('Your session has expired. Your picks are kept on this screen');
    await editor(page).getByRole('button', { name: 'Sign in again', exact: true }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Sign in again', exact: true });
    await dialog.getByLabel('Password', { exact: true }).fill('test-password');
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(cards(page).first().locator('.number-chip[data-value="3"]')).toHaveAttribute('aria-checked', 'true');
    await editor(page).getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(editor(page).getByText('Draft saved.', { exact: true })).toBeVisible();
    expect(writes[0].requestId).toBe(writes[1].requestId);

    nextFailure = 'reply';
    await pickSpread(page, 0, 4);
    await editor(page).getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(editor(page)).toContainText('We could not confirm whether your save completed');
    const revision = (await world.api('luke', 'personal')).body.weeklyRevision;
    await editor(page).getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(editor(page).getByText('Draft saved.', { exact: true })).toBeVisible();
    expect(writes[2].requestId).toBe(writes[3].requestId);
    expect((await world.api('luke', 'personal')).body.weeklyRevision).toBe(revision);
    expect((await ballot(world)).picks[world.state.games[0].id]).toBe(-4);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Play remains readable and usable in both themes on a phone; sit-out keeps the other market open', async ({ page, baseURL }, testInfo) => {
  const world = await fixture(page, baseURL);
  try {
    await openPlay(page);
    await pickSpread(page, 0, 3);
    await pickSpread(page, 1, 7);
    await expect(cards(page).first().locator('[data-side="away"]')).toHaveText('TB');
    await expect(cards(page).first().locator('[data-side="away"]')).toHaveAccessibleName('Buccaneers (TB)');
    await expect(cards(page).first().locator('[data-side="home"]')).toHaveText('DAL');
    await expect(cards(page).first().locator('[data-side="home"]')).toHaveAccessibleName('Cowboys (DAL)');
    await expect(cards(page).first().locator('.chip-summary')).toHaveText('Cowboys −3');
    const details = cards(page).first().locator('.gx-play-details');
    await expect(details.locator('.team-facts')).not.toBeVisible();
    await details.locator('summary').click();
    await expect(details.locator('.team-facts')).toBeVisible();
    await details.locator('summary').click();
    await expect(cards(page).first().locator('.number-chip[data-value="3"]')).toHaveAttribute('aria-checked', 'true');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        const lastControl = cards(page).last().getByRole('button', { name: 'Raise by half a point', exact: true });
        await lastControl.evaluate(el => el.scrollIntoView({ block: 'center' }));
        await expect.poll(() => page.evaluate(() => {
          const screen = document.querySelector('.gx-live-play'), dock = screen.querySelector('.save-bar');
          return parseFloat(getComputedStyle(screen).getPropertyValue('--gx-play-dock-height')) >= dock.getBoundingClientRect().height;
        })).toBe(true);
        const dimensions = await page.evaluate(() => {
          const save = document.querySelector('.gx-live-play .save-bar').getBoundingClientRect();
          const tabs = document.querySelector('.gx-tabbar').getBoundingClientRect();
          const buttons = [...document.querySelectorAll('.gx-live-play button')].filter(el => el.getClientRects().length && !el.closest('dialog:not([open])'));
          const game = document.querySelector('.gx-play-game'), entry = game.querySelector('.gx-play-entry');
          const control = [...document.querySelectorAll('.gx-play-game .chip-fine button')].at(-1);
          const box = control.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          const teamLabels = [...document.querySelectorAll('.gx-play-game .team-chip')].map(button => {
            const rects = [...button.childNodes].flatMap(node => {
              if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return [];
              const range = document.createRange(); range.selectNodeContents(node);
              return [...range.getClientRects()].filter(rect => rect.width && rect.height);
            });
            // Font fallback may split one line into several glyph runs. Only
            // vertically separate text boxes indicate a wrapped label.
            const lines = [];
            for (const rect of rects) {
              if (!lines.some(line => Math.min(line.bottom, rect.bottom) - Math.max(line.top, rect.top) > 1)) lines.push(rect);
            }
            const bounds = button.getBoundingClientRect(), style = getComputedStyle(button);
            const left = bounds.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
            const right = bounds.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
            return { text: button.textContent, wrapped: lines.length > 1,
              overflow: rects.some(rect => rect.left < left - 0.5 || rect.right > right + 0.5) };
          });
          const wrappedTeamLabels = teamLabels.filter(label => label.wrapped).map(label => label.text);
          const overflowingTeamLabels = teamLabels.filter(label => label.overflow).map(label => label.text);
          return { scroll: document.documentElement.scrollWidth > innerWidth, overlap: save.bottom > tabs.top, wrappedTeamLabels, overflowingTeamLabels,
            finalControlClear: box.bottom <= save.top && (hit === control || control.contains(hit)),
            padding: getComputedStyle(game).paddingLeft, insetSurface: getComputedStyle(game).backgroundColor !== getComputedStyle(entry).backgroundColor,
            small: buttons.map(el => ({ text: el.textContent, box: el.getBoundingClientRect() })).filter(({ box }) => box.width < 43.5 || box.height < 43.5).map(({ text }) => text) };
        });
        await cards(page).first().evaluate(el => el.scrollIntoView({ block: 'center' }));
        await cards(page).first().screenshot({
          path: testInfo.outputPath(`next-play-card-${width}-${theme}.png`),
          style: '.gx-topbar, .gx-tabbar, .gx-play-save-dock { visibility: hidden !important; }',
        });
        expect(dimensions).toEqual({ scroll: false, overlap: false, wrappedTeamLabels: [], overflowingTeamLabels: [], finalControlClear: true, padding: '16px', insetSurface: true, small: [] });
        const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(accessibility.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
        if (width === 390) {
          await page.screenshot({ path: testInfo.outputPath(`next-play-${theme}.png`), fullPage: true });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: `.local/previews/formatting/play-final/play-390-${theme}-top.png` });
        }
      }
    }
    await editor(page).getByRole('button', { name: 'Sit out this week', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sit out Spread', exact: true }).click();
    await expect(editor(page)).toContainText("Sat out · others' picks visible");
    await expect(editor(page).getByRole('button', { name: 'Submit Spread', exact: true })).toHaveCount(0);
    await market(page, 'Total').click();
    await expect(editor(page).getByRole('button', { name: 'Submit Total', exact: true })).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Play honors the historical Thursday deadline instead of offering per-game late guesses', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL, { deadline: new Date(Date.now() - 60 * 60_000).toISOString() });
  const writes = [];
  page.on('request', request => { if (request.url().endsWith('/personal/ballot')) writes.push(request.postDataJSON()); });
  try {
    await openPlay(page);
    await expect(editor(page)).toContainText('Spread picks are closed.');
    await expect(editor(page).getByRole('button', { name: /^(Save draft|Submit Spread|Save changes)$/ })).toHaveCount(0);
    await expect(editor(page).locator('.chip:not(:disabled)')).toHaveCount(0);
    await market(page, 'Total').click();
    await expect(editor(page)).toContainText('Total picks are closed.');
    await expect(editor(page).getByRole('button', { name: 'Submit Total', exact: true })).toHaveCount(0);
    expect(writes).toEqual([]);
    expect(await ballot(world)).toBeNull();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
