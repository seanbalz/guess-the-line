import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL, HOSTED } from '../migrations.mjs';
import { expectPickEnabled, pickSpread } from '../chip-entry.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// UI contract checks use fictional reads/writes over a local account fixture. SQL authority is tested separately.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));
const routeName = name => `${SUPABASE}/functions/v1/gtl-api/${name}`;
const tabs = page => page.getByRole('navigation', { name: 'Main' });

async function fixture(page, baseURL) {
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
  await page.getByRole('button', { name: 'Try the new app', exact: true }).click();
  await tabs(page).getByRole('button', { name: /^Play(,|$)/ }).click();
  await page.getByRole('button', { name: 'Continue guessing', exact: true }).click();
  await expect(page.locator('.gx-per-game')).toBeVisible();
  return { ...world, personal, writes, control };
}

async function choose(page, id, value = 3) {
  const card = page.locator(`.gx-per-game [data-game="${id}"]`);
  await card.locator('[data-side="home"]').click();
  await card.locator(`.number-chip[data-value="${value}"]`).click();
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
    await expect(card.locator('.chip')).toHaveCount(0);
    expect(world.writes).toHaveLength(1); expect(world.writes[0].lockIn).toEqual([game.id]); expect(world.writes[0].submit).toBe(false);
    await page.getByRole('group', { name: 'Market', exact: true }).getByRole('button', { name: 'Total', exact: true }).click();
    await expect(page.locator(`.gx-per-game [data-game="${game.id}"]`).getByRole('button', { name: 'Lock in Total' })).toBeDisabled();
    await expect(page.locator(`.gx-per-game [data-game="${game.id}"] .number-chip[data-value="44"]`)).toBeEnabled();
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

test('classic group keeps a started draft read-only and submits upcoming games after Thursday', async ({ page, baseURL }) => {
  const now = Date.now();
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, groupScreens: true, troyBallots: false, prepare: state => {
    state.league.deadline = new Date(now - 3600_000).toISOString();
    state.games.forEach((game, i) => game.kickoff = new Date(now + (i === 0 ? -1800_000 : 3600_000)).toISOString());
  } });
  const [closed, open] = world.state.games, { season, week } = world.state.league;
  try {
    // Local-only historical fixture: the first guess was saved as a draft before that game started.
    await world.db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing', [ACCOUNTS.luke.id, season, week]);
    await world.db.exec('alter table public.gtl_weekly_ballots disable trigger user');
    await world.db.query('insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,$2,$3,$4,$5)', [ACCOUNTS.luke.id, season, week, 'guess_spread', { picks: { [closed.id]: -2 }, submittedAt: null, updatedAt: new Date(now - 7200_000).toISOString() }]);
    await world.db.exec('alter table public.gtl_weekly_ballots enable trigger user');
    await signIn(page, 'luke');
    await page.getByRole('button', { name: /Groups & games/ }).click();
    await page.locator('.hub-game').filter({ hasText: 'Triple Threat' }).getByRole('button', { name: 'Open game' }).click();
    await expect(page.getByRole('region', { name: 'Next action' })).not.toContainText('Picks closed');
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    await expect(menu).toBeVisible(); await menu.click();
    await page.getByRole('button', { name: 'My picks', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Trust your read.' })).toBeVisible();
    await expectPickEnabled(page, `${closed.awayCode} at ${closed.homeCode} home spread`, false);
    await expectPickEnabled(page, `${open.awayCode} at ${open.homeCode} home spread`, true);
    await pickSpread(page, `${open.awayCode} at ${open.homeCode} home spread`, -3);
    await page.getByRole('button', { name: 'Review & submit', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Submit & reveal analysis', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Find the difference.' })).toBeVisible();
    const saved = (await world.db.query("select ballot from public.gtl_weekly_ballots where user_id=$1 and season=$2 and week=$3 and mode='guess_spread'", [ACCOUNTS.luke.id, season, week])).rows[0].ballot;
    expect(saved.picks[closed.id]).toBe(-2); expect(saved.closedAtKickoff).toContain(closed.id); expect(saved.lockedAt[closed.id]).toBeUndefined();
    expect(saved.picks[open.id]).toBe(-3); expect(saved.lockedAt[open.id]).toBeTruthy();
    expect(world.errors).toEqual([]);
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
    await page.getByRole('button', { name: /^Picks( \(|$)/ }).click();
    await expect(page.locator('.gx-legacy-per-game .gx-per-game')).toBeVisible();
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('classic-community-per-game-320.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Try the new app', exact: true }).click();
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
    await expect(page.locator(`[data-game="${second.id}"] .number-chip[data-value="4"]`)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator(`[data-game="${second.id}"] .number-chip[data-value="4"]`)).toBeDisabled();
    const personal = (await world.api('luke', 'personal')).body;
    expect(personal.scoring.guess_spread.satOut).toBe(true); expect(personal.scoring.guess_spread.games).toHaveLength(1);
    expect(personal.ballots.guess_spread.picks[first.id]).toBe(-3); expect(personal.scoring.guess_total.satOut).toBe(false);
    expect(sitOutWrites).toBe(1);
    await page.getByRole('group', { name: 'Market', exact: true }).getByRole('button', { name: 'Total', exact: true }).click();
    await expect(page.locator(`[data-game="${first.id}"] .number-chip[data-value="44"]`)).toBeEnabled();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
