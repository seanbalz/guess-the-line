import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { HOSTED } from '../migrations.mjs';
import { SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { gameCard, openGame, openWeek } from './play-nest.mjs';

// D-69 Play › Your guesses as nesting cards (docs/superpowers/specs/2026-11-02-play-picks-nesting-cards-design.md):
// the week's game tiles, then one game's card, on the real shell and router. Fictional /personal reads and writes over
// the local account fixture (the next-per-game-scoring.spec.js pattern); SQL authority is tested separately.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(120000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));
const routeName = name => `${SUPABASE}/functions/v1/gtl-api/${name}`;
const tabs = page => page.getByRole('navigation', { name: 'Main' });
const reply = (route, body) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });

async function fixture(page, baseURL) {
  const world = await communityWorld(page, baseURL, { migrations: HOSTED, optionalRpc: true, games: 4 });
  const personal = structuredClone((await world.api('luke', 'personal')).body);
  personal.rules = { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true };
  personal.ballots = {}; personal.scoring = {}; personal.optOuts = [];
  const writes = [];
  await page.route(routeName('personal'), route => reply(route, personal));
  await page.route(routeName('personal/read'), route => reply(route, personal));
  await page.route(routeName('personal/ballot'), route => {
    const body = route.request().postDataJSON(); writes.push(body);
    const old = personal.ballots[body.mode] || { picks: {}, lockedAt: {} }, locked = { ...old.lockedAt };
    for (const id of body.lockIn || []) locked[id] ||= personal.now;
    personal.ballots[body.mode] = { ...old, picks: body.picks, lockedAt: locked };
    personal.weeklyRevision += 1;
    personal.scoring[body.mode] = { season: personal.season, week: personal.week, mode: body.mode, games: Object.entries(locked).map(([gameId, lockedAt]) => ({ gameId, guess: body.picks[gameId], lockedAt, lockedIn: true, eligible: true, points: 8, reference: { value: body.picks[gameId] + 2, source: 'Synthetic three-book median', observedAt: personal.now } })) };
    return reply(route, { ok: true });
  });
  const dialogs = [];
  page.on('dialog', dialog => { dialogs.push(dialog.message()); return dialog.dismiss(); });
  await signIn(page, 'luke');
  await tabs(page).getByRole('button', { name: /^Play(,|$)/ }).click();
  await page.getByRole('button', { name: 'Continue guessing', exact: true }).click();
  await expect(page.locator('.gx-per-game [data-tile]').first()).toBeVisible();
  return { ...world, personal, writes, dialogs };
}

/** Waits for every finite animation to end (the lock-in settle scales the card for 240ms); never a sleep. */
const settled = page => page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => null))));

/** No sideways scroll, 44px targets and axe clean, in both themes at 390 and 320. */
async function phoneMatrix(page, label) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await settled(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} ${theme} ${width}`).toBe(true);
      // Layout size, not the painted box: a chip's 160ms selection pop (gx-pop) dips just under scale 1 as it settles.
      const small = await page.evaluate(() => [...document.querySelectorAll('.gx-per-game button')].filter(el => el.getClientRects().length && !el.closest('dialog:not([open])'))
        .filter(el => el.offsetWidth < 44 || el.offsetHeight < 44).map(el => `${el.getAttribute('aria-label') || el.textContent.trim()} ${el.offsetWidth}x${el.offsetHeight}`));
      expect(small, `${label} ${theme} ${width}`).toEqual([]);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(axe.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), `${label} ${theme} ${width}`).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
}

test('the week is one tile per game; a tile opens its card; Lock in then Next swaps games; Back keeps the week under them', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const [first, second] = world.personal.games;
    const tiles = page.locator('.gx-per-game [data-tile]');
    await expect(tiles).toHaveCount(world.personal.games.length);
    await expect(page.locator('[data-play="count"]')).toHaveText(`0 of ${world.personal.games.length} locked`);
    await expect(page.getByRole('heading', { name: `Week ${world.personal.week}`, exact: true })).toBeVisible();
    await expect(page.locator('.gx-per-game [data-game]')).toHaveCount(0); // no game card, line or guess until a tap
    await phoneMatrix(page, 'week');

    const card = await openGame(page, first.id);
    expect(new URL(page.url()).hash).toContain(`pickGame=${first.id}`);
    await expect(page.getByRole('heading', { name: `${first.awayCode} @ ${first.homeCode}`, exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: `Back to Week ${world.personal.week} · Spread`, exact: true })).toBeVisible();
    await card.locator('[data-side="home"]').click();
    await card.locator('.gx-guess-num[data-value="3"]').click();
    await phoneMatrix(page, 'game');
    await card.getByRole('button', { name: 'Lock in Spread', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Lock in Spread?' }).getByRole('button', { name: 'Confirm lock-in' }).click();
    await expect(card.getByRole('region', { name: /Spread receipt/ })).toContainText('8 / 10');
    const next = page.getByRole('button', { name: /^Next to lock · / });
    await expect(next).toHaveClass(/gx-btn--primary/);
    await phoneMatrix(page, 'locked game');

    await next.click();
    const second_ = gameCard(page, second.id);
    await expect(second_).toBeVisible();
    await expect(page.getByRole('heading', { name: `${second.awayCode} @ ${second.homeCode}`, exact: true })).toBeFocused();
    await second_.locator('[data-side="away"]').click();
    await second_.locator('.gx-guess-num[data-value="4"]').click();
    await second_.getByRole('button', { name: 'Lock in Spread', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm lock-in' }).click();
    await expect(second_.getByRole('region', { name: /Spread receipt/ })).toBeVisible();
    expect(world.writes.map(write => write.lockIn)).toEqual([[first.id], [second.id]]);

    // Next replaced the first game: Back goes to the week, then out of Your guesses.
    await page.goBack();
    await expect(tiles).toHaveCount(world.personal.games.length);
    expect(new URL(page.url()).hash).not.toContain('pickGame=');
    await expect(page.locator('[data-play="count"]')).toHaveText(`2 of ${world.personal.games.length} locked`);
    await expect(page.locator(`[data-tile="${first.id}"]`)).toHaveAttribute('data-state', 'locked');
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Continue guessing', exact: true })).toBeVisible();
    expect(world.dialogs).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a reload reopens the game; moving inside Your guesses keeps a draft quietly; leaving Play with it still asks', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const [, game] = world.personal.games;
    await openGame(page, game.id);
    await page.reload(); // before any draft, so the page's own unload warning stays out of it
    const card = gameCard(page, game.id);
    await expect(card).toBeVisible();
    await expect(page.getByRole('heading', { name: `${game.awayCode} @ ${game.homeCode}`, exact: true })).toBeFocused();

    await card.locator('[data-side="home"]').click();
    await card.locator('.gx-guess-num[data-value="2"]').click();
    await openWeek(page);
    await expect(page.locator(`[data-tile="${game.id}"]`)).toHaveAttribute('data-state', 'draft');
    await openGame(page, game.id);
    await page.goBack();
    await expect(page.locator(`[data-tile="${game.id}"]`)).toBeVisible();
    expect(world.dialogs).toEqual([]); // the week and its games are one editor: no "Leave without saving?"
    await page.locator(`[data-tile="${game.id}"]`).click();
    await expect(card.locator('.gx-guess-num[data-value="2"]')).toHaveAttribute('aria-checked', 'true');

    await tabs(page).getByRole('button', { name: /^Home(,|$)/ }).click();
    await expect.poll(() => world.dialogs).toEqual(['Leave without saving your changes?']);
    await expect(gameCard(page, game.id)).toBeVisible(); // dismissed: still on the game, draft kept
    expect(world.writes).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
