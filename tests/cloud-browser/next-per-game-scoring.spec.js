import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL, HOSTED } from '../migrations.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// UI contract checks use fictional reads/writes over a local account fixture. SQL authority is tested separately.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));
const routeName = name => `${SUPABASE}/functions/v1/gtl-api/${name}`;
const tabs = page => page.getByRole('navigation', { name: 'Main' });

async function fixture(page, baseURL, { beforePlay } = {}) {
  const world = await communityWorld(page, baseURL, { migrations: HOSTED, optionalRpc: true });
  const personal = structuredClone((await world.api('luke', 'personal')).body);
  personal.rules = { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true };
  personal.ballots = {}; personal.scoring = {}; personal.optOuts = [];
  const writes = [], control = { lose: false };
  const reply = (route, body) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(routeName('personal'), route => reply(route, personal));
  await page.route(routeName('personal/read'), route => reply(route, personal));
  await page.route(routeName('personal/ballot'), async route => {
    const body = route.request().postDataJSON(); writes.push(body);
    const old = personal.ballots[body.mode] || { picks: {}, lockedAt: {} }, locked = { ...old.lockedAt };
    for (const id of body.lockIn || []) locked[id] ||= personal.now;
    personal.ballots[body.mode] = { ...old, picks: body.picks, lockedAt: locked };
    personal.weeklyRevision += 1;
    personal.scoring[body.mode] = { season: personal.season, week: personal.week, mode: body.mode, games: Object.entries(locked).map(([gameId, lockedAt]) => ({ gameId, guess: body.picks[gameId], lockedAt, lockedIn: true, eligible: true, points: 8, reference: { value: body.picks[gameId] + 2, source: 'Synthetic three-book median', observedAt: personal.now } })), weekPoints: Object.keys(locked).length * 8, weekScored: Object.keys(locked).length, standingsPoints: 0, awaitingKickoffPoints: Object.keys(locked).length * 8 };
    if (control.lose) { control.lose = false; return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{unreadable' }); }
    return reply(route, { ok: true });
  });
  await page.route(routeName('community/history'), route => reply(route, { viewer: ACCOUNTS.luke.id, season: personal.season, seasons: [personal.season], weeks: [
    { season: personal.season, week: personal.week, games: personal.games, entries: Object.entries(personal.scoring).map(([mode, receipt]) => ({ userId: ACCOUNTS.luke.id, mode, status: 'draft', eligible: true, scoreTiming: 'immediate', ...receipt, picks: receipt.games })) },
    { season: personal.season, week: personal.week - 1, games: [{ ...personal.games[0] }], entries: [] },
  ] }));
  await signIn(page, 'luke');
  if (beforePlay) { await expect(tabs(page)).toBeVisible(); await beforePlay(personal); }
  await tabs(page).getByRole('button', { name: /^Play(,|$)/ }).click();
  await page.getByRole('button', { name: 'Continue guessing', exact: true }).click();
  await expect(page.locator('.gx-per-game')).toBeVisible();
  return { ...world, personal, writes, control };
}

async function choose(page, id, value = 3) {
  const card = page.locator(`.gx-per-game [data-game="${id}"]`);
  await card.locator('[data-side="home"]').click();
  await card.locator(`.gx-guess-num[data-value="${value}"]`).click();
  return card;
}

test('one guess locks after confirmation, keeps the other market open, and links to a filtered weekly receipt', async ({ page, baseURL }, info) => {
  const world = await fixture(page, baseURL);
  try {
    const game = world.personal.games[0];
    const card = await choose(page, game.id);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(axe.violations.map(item => item.id)).toEqual([]);
        await page.screenshot({ path: info.outputPath(`per-game-picks-${width}-${theme}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });

    await card.getByRole('button', { name: 'Lock in Spread', exact: true }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Lock in Spread?' });
    await expect(dialog).toContainText('This guess is final.');
    await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Confirm lock-in' }).click();
    await expect(card.getByRole('region', { name: /Spread receipt/ })).toContainText('8 / 10');
    await expect(card.locator('.gx-guess')).toHaveCount(0);
    expect(world.writes).toHaveLength(1); expect(world.writes[0].lockIn).toEqual([game.id]); expect(world.writes[0].submit).toBe(false);
    await page.getByRole('group', { name: 'Market', exact: true }).getByRole('button', { name: 'Total', exact: true }).click();
    await expect(page.locator(`.gx-per-game [data-game="${game.id}"]`).getByRole('button', { name: 'Lock in Total' })).toBeDisabled();
    await expect(page.locator(`.gx-per-game [data-game="${game.id}"] .gx-guess-num[data-value="44"]`)).toBeEnabled();
    await page.getByRole('group', { name: 'Market', exact: true }).getByRole('button', { name: 'Spread', exact: true }).click();
    await page.getByRole('button', { name: 'View weekly score', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Personal score summary' })).toContainText('8 points');
    await page.getByText('Standings · games started', { exact: true }).click();
    await expect(page.getByText('8 personal points waiting for kickoff', { exact: true })).toBeVisible();
    await page.getByText('Filter games', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Team', exact: true }).selectOption(game.homeCode);
    await expect(page.getByRole('heading', { name: 'Selected games' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Matchup', exact: true }).selectOption(world.personal.games[1].id);
    await expect(page.getByText('No games match both filters. Clear filters to see this week.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByRole('button', { name: 'Previous week' }).click();
    await expect(page.getByText('No saved Spread guesses for this week.')).toBeVisible();
    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(page.getByRole('region', { name: 'Personal score summary' })).toContainText('8 points');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(axe.violations.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(' ')).join(', ')}`)).toEqual([]);
        await page.screenshot({ path: info.outputPath(`weekly-score-${width}-${theme}.png`), fullPage: true });
      }
    }
  } finally { await world.db.close(); }
});

test('a lost response needs readback, then shows the committed lock without a second save', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const card = await choose(page, world.personal.games[0].id);
    world.control.lose = true;
    await card.getByRole('button', { name: 'Lock in Spread' }).click();
    await page.getByRole('button', { name: 'Confirm lock-in' }).click();
    await expect(page.getByRole('alert')).toContainText('Your save is unconfirmed');
    await expect(page.getByRole('button', { name: 'Retry same save' })).toBeDisabled();
    await page.getByRole('button', { name: 'Check saved picks', exact: true }).click();
    await expect(card.getByRole('region', { name: /Spread receipt/ })).toContainText('8 / 10');
    await expect(page.getByRole('button', { name: 'Retry same save' })).toHaveCount(0);
    expect(world.writes).toHaveLength(1);
  } finally { await world.db.close(); }
});

test('native sit-out keeps an existing lock and unsaved draft, confirms through SQL, and leaves Total open', async ({ page, baseURL }, info) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, troyBallots: false });
  try {
    let sitOutWrites = 0;
    await page.route(routeName('community/sit-out'), async route => {
      sitOutWrites += 1;
      expect((await world.api('luke', 'community/sit-out', route.request().postDataJSON())).status).toBe(200);
      await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{lost-response' });
    });
    await signIn(page, 'luke');
    await tabs(page).getByRole('button', { name: /^Play(,|$)/ }).click();
    await page.getByRole('button', { name: 'Continue guessing', exact: true }).click();
    await expect(page.locator('.gx-per-game')).toBeVisible();
    const [first, second] = world.state.games, card = await choose(page, first.id);
    await card.getByRole('button', { name: 'Lock in Spread' }).click();
    await page.getByRole('button', { name: 'Confirm lock-in' }).click();
    await expect(card.getByRole('region', { name: /Spread receipt/ })).toBeVisible();
    await choose(page, second.id, 4);
    await page.getByRole('button', { name: 'Sit out remaining Spread games' }).click();
    const dialog = page.getByRole('alertdialog', { name: /Sit out Week/ });
    await expect(dialog).toContainText('Your locked guesses keep their points');
    await expect(dialog.getByRole('button', { name: 'Keep playing' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Confirm sit-out' }).click();
    await expect(page.getByRole('alert')).toContainText('Your sit-out is unconfirmed');
    await expect(page.getByRole('button', { name: 'Retry sit-out' })).toBeDisabled();
    await page.getByRole('button', { name: 'Check saved picks', exact: true }).click();
    await expect(page.getByText('Sat out · your locked guesses keep counting. Remaining games cannot be locked.')).toBeVisible();
    await expect(card.getByRole('region', { name: /Spread receipt/ })).toBeVisible();
    await expect(page.locator(`[data-game="${second.id}"] .gx-guess-num[data-value="4"]`)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator(`[data-game="${second.id}"] .gx-guess-num[data-value="4"]`)).toBeDisabled();
    const personal = (await world.api('luke', 'personal')).body;
    expect(personal.scoring.guess_spread.satOut).toBe(true); expect(personal.scoring.guess_spread.games).toHaveLength(1);
    expect(personal.ballots.guess_spread.picks[first.id]).toBe(-3); expect(personal.scoring.guess_total.satOut).toBe(false);
    expect(sitOutWrites).toBe(1);
    await page.getByRole('group', { name: 'Market', exact: true }).getByRole('button', { name: 'Total', exact: true }).click();
    await expect(page.locator(`[data-game="${first.id}"] .gx-guess-num[data-value="44"]`)).toBeEnabled();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('an unsaved guess left on a removed group game screen is offered once, read-only, and restores as an unlocked draft', async ({ page, baseURL }) => {
  // RETIRE-01 (D-65): the old group screens kept a 24-hour copy in this tab (predictionDraft.js, gtl.tab-draft.v1.*).
  const world = await fixture(page, baseURL, { beforePlay: personal => page.evaluate(({ id, season, week, games }) => {
    const ids = games.map(game => game.id), blank = Object.fromEntries(ids.map(gameId => [gameId, '']));
    sessionStorage.setItem(`gtl.tab-draft.v1.${encodeURIComponent(id)}.${season}.${week}.guess_spread`, JSON.stringify({
      draft: { ...blank, [ids[0]]: '-3.5' }, base: blank, pendingSave: null, updatedAt: new Date().toISOString() }));
  }, { id: ACCOUNTS.luke.id, season: personal.season, week: personal.week, games: personal.games }) });
  try {
    const game = world.personal.games[0];
    const retained = page.locator('details').filter({ hasText: 'Previous group game draft retained' });
    await expect(retained).toHaveCount(1);
    await retained.locator('summary').click();
    await expect(retained).toContainText(`${game.awayCode} at ${game.homeCode}`);
    await retained.getByRole('button').click();
    await expect(page.getByText('Unlocked draft guesses restored. Review and save them when ready.', { exact: true })).toBeVisible();
    expect(world.writes).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
