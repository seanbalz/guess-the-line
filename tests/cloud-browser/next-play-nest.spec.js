import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { HOSTED } from '../migrations.mjs';
import { SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { openPicksWeek, chooseMarket, gameCard, openGame, openWeek } from './play-nest.mjs';

// D-70 Play › Your guesses as nesting cards (docs/superpowers/specs/2026-11-02-play-picks-nesting-cards-design.md):
// the week's game tiles, then one game's card, on the real shell and router. Fictional /personal reads and writes over
// the local account fixture (the next-per-game-scoring.spec.js pattern); SQL authority is tested separately.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(120000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));
const routeName = name => `${SUPABASE}/functions/v1/gtl-api/${name}`;
const tabs = page => page.getByRole('navigation', { name: 'Main' });
const reply = (route, body) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });

async function fixture(page, baseURL, { beforeSignIn } = {}) {
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
  await beforeSignIn?.({ world, personal });
  await signIn(page, 'luke');
  await tabs(page).getByRole('button', { name: /^Play(,|$)/ }).click();
  await openPicksWeek(page);
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
    await expect(page.locator('[data-landing="play"] .gx-play-overview-picks')).toBeVisible();
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

// D-69 step 1, Whole week locked (small): the shared Community read that confirms the last lock-in plays it once, in
// place, on the line that says so. Going back to the week and a reload show the words without the pop (never replays).
test('Whole week locked pops once on the read that confirms the last lock; Back and a reload never replay it', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL, { beforeSignIn: async ({ world, personal }) => {
    // The fixture's /personal writes live in this page, so the Community read's per-game counts follow them.
    await page.route(routeName('community/read'), async route => {
      const request = route.request();
      const response = await world.handler(new Request(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() }));
      const body = await response.json();
      body.due = body.due.map(row => {
        const locked = Object.keys(personal.ballots[row.mode]?.lockedAt ?? {}).length;
        return { ...row, locked, openGames: personal.games.length - locked, games: personal.games.length };
      });
      return reply(route, body);
    });
  } });
  try {
    const games = world.personal.games;
    for (const [i, game] of games.entries()) {
      const card = await openGame(page, game.id);
      await card.locator('[data-side="home"]').click();
      await card.locator('.gx-guess-num[data-value="3"]').click();
      await card.getByRole('button', { name: 'Lock in Spread', exact: true }).click();
      await page.getByRole('alertdialog', { name: 'Lock in Spread?' }).getByRole('button', { name: 'Confirm lock-in' }).click();
      await expect(card.getByRole('region', { name: /Spread receipt/ })).toBeVisible();
      if (i < games.length - 1) await expect(page.locator('[data-moment="pop"]'), `${i + 1} of ${games.length} is not the moment`).toHaveCount(0);
    }
    await expect(page.locator('.gx-per-game p', { hasText: 'Every game is locked in.' })).toHaveAttribute('data-moment', 'pop');
    await openWeek(page);
    await expect(page.locator('[data-play="count"]')).toHaveText(`${games.length} of ${games.length} locked`);
    await expect(page.locator('[data-moment="pop"]')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-play="count"]')).toHaveText(`${games.length} of ${games.length} locked`);
    await expect(page.locator('[data-moment="pop"]')).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

// D-69 step 1, Whole week locked: the moment can wait (the last lock was confirmed while the player was on Your score).
// The picks card holds it, so it must not play while "Loading your picks…" shows with no line mounted to pop.
test('a waiting Whole week locked moment plays on the picks card once its cards mount, not while the picks load', async ({ page, baseURL }) => {
  let holdCommunity = null, holdPicks = null, communityAnswered = false;
  const world = await fixture(page, baseURL, { beforeSignIn: async ({ world, personal }) => {
    await page.route(routeName('community/read'), async route => {
      await holdCommunity;
      const request = route.request();
      const response = await world.handler(new Request(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() }));
      const body = await response.json();
      body.due = body.due.map(row => {
        const locked = Object.keys(personal.ballots[row.mode]?.lockedAt ?? {}).length;
        return { ...row, locked, openGames: personal.games.length - locked, games: personal.games.length };
      });
      await reply(route, body);
      communityAnswered = true;
    });
    // Delays only the picks read the remount makes (set below); the first mount's read is not held.
    await page.route(routeName('personal/read'), async route => { await holdPicks; return route.fallback(); });
  } });
  try {
    const games = world.personal.games;
    for (const [i, game] of games.entries()) {
      let release;
      if (i === games.length - 1) { holdCommunity = new Promise(resolve => { release = resolve; }); communityAnswered = false; }
      const card = await openGame(page, game.id);
      await card.locator('[data-side="home"]').click();
      await card.locator('.gx-guess-num[data-value="3"]').click();
      await card.getByRole('button', { name: 'Lock in Spread', exact: true }).click();
      await page.getByRole('alertdialog', { name: 'Lock in Spread?' }).getByRole('button', { name: 'Confirm lock-in' }).click();
      await expect(card.getByRole('region', { name: /Spread receipt/ })).toBeVisible();
      if (release) {
        // The last lock is saved but the confirming Community read has not arrived: leave for Your score, then let it land.
        await page.getByRole('button', { name: 'Your score', exact: true }).click();
        await expect(page.getByRole('heading', { name: /score/i }).first()).toBeVisible();
        release();
        await expect.poll(() => communityAnswered).toBe(true);
      }
    }
    // Back to the picks with the picks read held: the moment waits while the loading line shows.
    let letPicks;
    holdPicks = new Promise(resolve => { letPicks = resolve; });
    await page.goBack();
    await expect(page.getByText('Loading your picks…')).toBeVisible();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('[data-moment="pop"]')).toHaveCount(0);
    letPicks();
    await expect(page.locator('.gx-per-game')).toBeVisible();
    await expect(page.locator('[data-moment="pop"]')).toHaveCount(1);
    await expect(page.locator('[data-moment="pop"]')).toContainText(/locked/i);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

// Final fix wave F4: a game's card sits two lips deep under the Play lip, so its guess grid narrows. Every guess button
// keeps a 44px layout width (the used CSS width, not the rounded offsetWidth or a painted transform) from 320 to 390px,
// in both markets, with the row gap still 8px.
test('every guess button on a game card is at least 44px wide at 320, 360, 375, 380, 381 and 390px, Spread and Total', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const [game] = world.personal.games;
    for (const market of ['Spread', 'Total']) {
      if (market === 'Total') await chooseMarket(page, 'Total');
      const card = await openGame(page, game.id);
      expect(new URL(page.url()).hash).toBe(`#play/picks?market=${market.toLowerCase()}&season=${world.personal.season}&week=${world.personal.week}&pickGame=${game.id}`);
      if (market === 'Spread') await card.locator('[data-side="home"]').click();
      for (const width of [320, 360, 375, 380, 381, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await settled(page);
        const row = await card.locator('.gx-guess-nums').evaluate(el => {
          const style = getComputedStyle(el);
          const chips = [...el.querySelectorAll('.gx-guess-num, .gx-guess-more')].filter(chip => chip.getClientRects().length);
          return { rowGap: style.rowGap, count: chips.length, narrow: chips.map(chip => [chip.textContent.trim(), parseFloat(getComputedStyle(chip).width)]).filter(([, w]) => w < 44) };
        });
        expect(row.count, `${market} ${width}`).toBeGreaterThan(4);
        expect(row.narrow, `${market} ${width}`).toEqual([]);
        expect(row.rowGap, `${market} ${width}`).toBe('8px');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${market} ${width}`).toBe(true);
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
