import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { HOSTED } from '../migrations.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, id, pgliteAvailable, signIn } from './community-world.mjs';

// Play's game feel (design upgrade): the lock-in moment, the week progress strip, the reveal moment, the native guess
// control and Play's quiet states, at 390 × 844. Fictional reads and writes over the local account fixture (the
// next-per-game-scoring.spec.js pattern); the SQL authority for locks and reveals is tested separately.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(120000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const routeName = name => `${SUPABASE}/functions/v1/gtl-api/${name}`;
const tabs = page => page.getByRole('navigation', { name: 'Main' });
const PREVIEWS = path.resolve('.local/previews/play-moments');
const MINUTE = 60_000;
const json = (route, body, status = 200) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
/** A promise the test resolves itself: the route waits on it, so "before the server answers" is a state, not a sleep. */
const gate = () => { let open; const promise = new Promise(resolve => { open = resolve; }); return { promise, open }; };

/**
 * Four games: the first kicked off 30 minutes ago with Luke's locked guess (its guesses are open), the other three still
 * open. /personal, /personal/read, /personal/ballot and /community/picks are answered from this fixture; everything
 * else goes to the real handler on PGlite.
 */
async function fixture(page, baseURL, { open = true, beforeOpen } = {}) {
  const world = await communityWorld(page, baseURL, { migrations: HOSTED, optionalRpc: true, games: 4 });
  const personal = structuredClone((await world.api('luke', 'personal')).body);
  const now = Date.parse(personal.now), [kicked] = personal.games;
  personal.rules = { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true };
  personal.optOuts = [];
  kicked.kickoff = new Date(now - 30 * MINUTE).toISOString();
  const locked = new Date(now - 120 * MINUTE).toISOString();
  personal.ballots = { guess_spread: { picks: { [kicked.id]: -3 }, lockedAt: { [kicked.id]: locked } } };
  const receipt = (gameId, guess, lockedAt) => ({ gameId, guess, lockedAt, lockedIn: true, eligible: true, points: 8, reference: { value: guess + 1, source: 'Synthetic three-book median', observedAt: lockedAt } });
  personal.scoring = { guess_spread: { season: personal.season, week: personal.week, mode: 'guess_spread', games: [receipt(kicked.id, -3, locked)] } };
  const writes = [], reads = { picks: [], personal: 0 }, control = { ballot: null, picks: null, personalRead: null, failRead: 0 };
  await page.route(routeName('personal'), route => json(route, personal));
  await page.route(routeName('personal/read'), async route => {
    reads.personal += 1;
    if (control.personalRead) await control.personalRead.promise;
    if (control.failRead > 0) { control.failRead -= 1; return json(route, { error: 'Picks are temporarily unavailable.' }, 503); }
    return json(route, personal);
  });
  await page.route(routeName('personal/ballot'), async route => {
    const body = route.request().postDataJSON(); writes.push(body);
    if (control.ballot) await control.ballot.promise;
    const old = personal.ballots[body.mode] || { picks: {}, lockedAt: {} }, lockedAt = { ...old.lockedAt };
    for (const gameId of body.lockIn || []) lockedAt[gameId] ||= personal.now;
    personal.ballots[body.mode] = { ...old, picks: { ...old.picks, ...body.picks }, lockedAt };
    personal.weeklyRevision += 1;
    personal.scoring[body.mode] = { season: personal.season, week: personal.week, mode: body.mode, games: Object.entries(lockedAt).map(([gameId, at]) => receipt(gameId, personal.ballots[body.mode].picks[gameId], at)) };
    return json(route, { ok: true });
  });
  // Everyone's guesses: open for a game Luke locked or that kicked off; before that the server withholds them.
  await page.route(routeName('community/picks'), async route => {
    const body = route.request().postDataJSON(); reads.picks.push(body);
    if (control.picks) await control.picks.promise;
    const ballot = personal.ballots[body.mode] ?? { picks: {}, lockedAt: {} };
    const games = personal.games.map(game => {
      const mine = ballot.lockedAt?.[game.id], started = Date.parse(game.kickoff) <= now, shown = open && (Boolean(mine) || started);
      const row = (userId, status, pick, extra = {}) => ({ userId, status, lockedIn: ['in', 'late'].includes(status), pick: shown ? pick : null, hidden: !shown && ['in', 'late'].includes(status), late: null, eligible: true, error: null, points: null, rank: null, tied: false, closest: false, removed: false, ...extra });
      return { gameId: game.id, kickoff: game.kickoff, started, open: shown, rows: [
        row(ACCOUNTS.luke.id, mine ? 'in' : 'not_yet', mine ? ballot.picks[game.id] : null),
        row(ACCOUNTS.troy.id, 'in', -2.5),
        row(ACCOUNTS.sean.id, 'late', 1.5, { late: { deadline: personal.deadline, minutes: 12 } }),
        // A guess the server keeps hidden even in an open game: it must never be drawn.
        { ...row(id(9), 'in', null), pick: null, hidden: true },
      ] };
    });
    return json(route, { viewer: ACCOUNTS.luke.id, season: personal.season, week: personal.week, mode: body.mode, now: personal.now, deadline: personal.deadline, games });
  });
  await page.addInitScript(() => {
    window.__vibrations = [];
    Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: pattern => { window.__vibrations.push(pattern); return true; } });
  });
  await beforeOpen?.({ personal, control });
  await signIn(page, 'luke');
  await tabs(page).getByRole('button', { name: /^Play(,|$)/ }).click();
  await page.getByRole('button', { name: 'Continue guessing', exact: true }).click();
  // That primary button gave its own 10ms press tick (the kit's haptic); the lock-in buzz is counted from here.
  await page.evaluate(() => { window.__vibrations = []; });
  return { ...world, personal, writes, reads, control, kicked };
}

const card = (page, gameId) => page.locator(`.gx-per-game [data-game="${gameId}"]`);
async function choose(page, gameId, value = 3) {
  const game = card(page, gameId);
  await game.locator('[data-side="home"]').click();
  await game.locator(`.gx-guess-num[data-value="${value}"]`).click();
  return game;
}
/** Waits for every finite animation on the page to end (never a sleep); the LIVE dot's loop is left running. */
const settled = page => page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => null))));

/** The phone contract: no sideways scroll, 44px targets, no text under 12px, no reveal row whose name or guess spills
 * out of its box (the overlap CI’s wider fallback fonts showed at 320), and axe clean. */
async function phoneChecks(page, label) {
  await settled(page);
  const layout = await page.evaluate(() => {
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('dialog:not([open])') && !el.closest('.gx-sr-only');
    const targets = [...document.querySelectorAll('.gx-screen button, .gx-screen summary, .gx-screen a[href], .gx-screen input, .gx-screen select')].filter(visible);
    const small = targets.map(el => ({ el, box: el.getBoundingClientRect() })).filter(({ box }) => box.width < 43.5 || box.height < 43.5).map(({ el }) => el.getAttribute('aria-label') || el.textContent.trim());
    const walker = document.createTreeWalker(document.querySelector('.gx-screen'), NodeFilter.SHOW_TEXT);
    const tiny = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!node.textContent.trim() || !visible(parent)) continue;
      if (Number.parseFloat(getComputedStyle(parent).fontSize) < 12) tiny.push(node.textContent.trim());
    }
    // Name what sticks out past the viewport, so a sideways scroll says where it comes from.
    const wide = document.documentElement.scrollWidth > innerWidth ? [...document.querySelectorAll('.gx *')].filter(el => el.getBoundingClientRect().right > innerWidth + 0.5 && !el.closest('.gx-chip-rail, [role="region"][tabindex]'))
      .map(el => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ')[0]} ${Math.round(el.getBoundingClientRect().right)}`).slice(0, 6) : [];
    const spills = [...document.querySelectorAll('.gx-play-reveal .gx-row-title, .gx-play-reveal .gx-row-end')].filter(visible).filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent.trim());
    return { sideways: wide, small, tiny, spills };
  });
  expect(layout, label).toEqual({ sideways: [], small: [], tiny: [], spills: [] });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), label).toEqual([]);
}
async function matrix(page, name, shoot) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await phoneChecks(page, `${name} ${theme} ${width}`);
      if (width === 390 && shoot) await shoot(theme);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
}
async function shot(locator, info, file) {
  await locator.scrollIntoViewIfNeeded();
  const out = info.outputPath(file);
  await locator.screenshot({ path: out, style: '.gx-topbar, .gx-tabbar { visibility: hidden !important; }' });
  fs.mkdirSync(PREVIEWS, { recursive: true }); fs.copyFileSync(out, path.join(PREVIEWS, file));
}
/** A still of a moment for review: every finite animation held at `at` ms, photographed, then run to its end. */
async function still(page, locator, info, file, at = 150) {
  const finite = 'document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity)';
  await page.evaluate(`${finite}.forEach(a => { a.pause(); a.currentTime = ${at}; })`);
  await shot(locator, info, file);
  await page.evaluate(`${finite}.forEach(a => a.finish())`);
}

test('lock-in moment: the stamp, the "Locked in" line and a 20ms buzz come only after the server confirms; the write is unchanged', async ({ page, baseURL }, info) => {
  const world = await fixture(page, baseURL);
  try {
    const [, target] = world.personal.games;
    const progress = page.locator('[data-play="progress"]');
    await expect(progress).toContainText('1 of 4 locked');
    const game = await choose(page, target.id);
    await expect(game).toHaveAttribute('data-state', 'draft');
    await game.getByRole('button', { name: 'Lock in Spread', exact: true }).click();
    world.control.ballot = gate();
    await page.getByRole('alertdialog', { name: 'Lock in Spread?' }).getByRole('button', { name: 'Confirm lock-in' }).click();
    // The request is out; the server has not answered. Nothing plays and nothing says "Locked in" yet.
    await expect.poll(() => world.writes.length).toBe(1);
    await expect(game).not.toHaveClass(/gx-play-stamp/);
    await expect(page.locator('[data-play="notice"]')).toHaveText('');
    expect(await page.evaluate(() => window.__vibrations)).toEqual([]);
    world.control.ballot.open();
    await expect(game).toHaveClass(/gx-play-stamp/);
    await still(page, game, info, 'lockin-moment-390-dark.png');
    const notice = page.getByRole('status').filter({ hasText: 'Locked in ·' });
    await expect(notice).toHaveText(new RegExp(`^Locked in · ${target.awayCode} at ${target.homeCode} · \\w+ −3\\. Your saved receipt is below\\.$`));
    expect(await page.evaluate(() => window.__vibrations)).toEqual([20]);
    await expect(game).toHaveAttribute('data-state', 'locked');
    await expect(game.locator('.gx-play-card-pill')).toHaveText('Locked in');
    await expect(progress).toContainText('2 of 4 locked');
    // Tokens only: the card settles in base with the pop easing, its edge flashes once over "big", the pill stamps in.
    const motion = await game.evaluate(el => {
      const pick = style => ({ name: style.animationName, duration: style.animationDuration, easing: style.animationTimingFunction, count: style.animationIterationCount });
      return { card: pick(getComputedStyle(el)), flash: pick(getComputedStyle(el, '::after')), pill: pick(getComputedStyle(el.querySelector('.gx-play-card-pill'))) };
    });
    expect(motion).toEqual({
      card: { name: 'gx-play-settle', duration: '0.24s', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', count: '1' },
      flash: { name: 'gx-play-flash', duration: '0.6s', easing: 'cubic-bezier(0.2, 0, 0, 1)', count: '1' },
      pill: { name: 'gx-play-stamp', duration: '0.24s', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', count: '1' },
    });
    // The same request as before the design upgrade: one game, not submitted, the full draft and a request id.
    expect(Object.keys(world.writes[0]).sort()).toEqual(['lockIn', 'mode', 'picks', 'requestId', 'revision', 'season', 'submit', 'week', 'weeklyRevision']);
    expect(world.writes[0]).toMatchObject({ mode: 'guess_spread', lockIn: [target.id], submit: false, picks: { [target.id]: -3 } });
    await expect(game.getByRole('region', { name: /Spread receipt/ })).toContainText('8 / 10');
    await expect(game.locator('.gx-guess')).toHaveCount(0);
    // An ancestor of the fixed tab bar never carries a transform, filter or will-change.
    const ancestors = await page.evaluate(() => {
      const out = [];
      for (let el = document.querySelector('.gx-tabbar')?.parentElement; el; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (style.transform !== 'none' || style.filter !== 'none' || style.willChange !== 'auto') out.push(el.className || el.tagName);
      }
      return out;
    });
    expect(ancestors).toEqual([]);
    await matrix(page, 'lock-in', theme => shot(game, info, `lockin-390-${theme}.png`));
    expect(world.writes).toHaveLength(1);
    // The same moment in Light, on the next game (its stamp plays once, on its own card only).
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    const third = await choose(page, world.personal.games[2].id, 6);
    await third.getByRole('button', { name: 'Lock in Spread', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm lock-in' }).click();
    await expect(third).toHaveClass(/gx-play-stamp/);
    await expect(game).not.toHaveClass(/gx-play-stamp/);
    await still(page, third, info, 'lockin-moment-390-light.png');
    await expect(progress).toContainText('3 of 4 locked');
    expect(await page.evaluate(() => window.__vibrations)).toEqual([20, 20]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('lock-in under reduced motion: no movement, the words still change; a refused lock-in never celebrates', async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const world = await fixture(page, baseURL);
  try {
    const [, first, second] = world.personal.games;
    let game = await choose(page, first.id);
    await game.getByRole('button', { name: 'Lock in Spread', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm lock-in' }).click();
    await expect(game).toHaveClass(/gx-play-stamp/);
    await expect(page.getByRole('status').filter({ hasText: 'Locked in ·' })).toBeVisible();
    await expect(game.locator('.gx-play-card-pill')).toHaveText('Locked in');
    expect(await game.evaluate(el => [getComputedStyle(el).animationName, getComputedStyle(el, '::after').animationName, getComputedStyle(el.querySelector('.gx-play-card-pill')).animationName])).toEqual(['none', 'none', 'none']);
    // A refusal: the server says no, the fresh read shows no lock, so there is no stamp, no line and no buzz.
    await page.route(routeName('personal/ballot'), route => { world.writes.push(route.request().postDataJSON()); return json(route, { error: 'This game is closed.', code: 'GTL_BALLOT_LOCKED' }, 409); });
    game = await choose(page, second.id, 4);
    await game.getByRole('button', { name: 'Lock in Spread', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm lock-in' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'This game is closed.' })).toBeVisible();
    await expect(game).not.toHaveClass(/gx-play-stamp/);
    await expect(game).toHaveAttribute('data-state', 'draft');
    expect(await page.evaluate(() => window.__vibrations)).toEqual([20]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('week progress: one tile per game shows locked, draft, open and kicked off at a glance; Next moves to the game', async ({ page, baseURL }, info) => {
  const world = await fixture(page, baseURL, { beforeOpen: ({ personal }) => {
    // The fourth game kicked off without a lock; it keeps its place and says so.
    personal.games[3].kickoff = new Date(Date.parse(personal.now) - 10 * MINUTE).toISOString();
  } });
  try {
    const [kicked, draft, open, late] = world.personal.games;
    await choose(page, draft.id, 4);
    const progress = page.locator('[data-play="progress"]');
    await expect(progress.locator('[data-state]')).toHaveCount(4);
    expect(await progress.locator('[data-state]').evaluateAll(tiles => tiles.map(tile => tile.dataset.state))).toEqual(['locked', 'draft', 'open', 'kicked']);
    await expect(progress.getByRole('list', { name: 'Games by state' }).getByRole('listitem')).toHaveText(['1Locked', '1Draft', '1Open', '1Kicked off']);
    await expect(progress).toContainText('1 of 4 locked');
    // Each card says its own state in words, so the strip is never the only place a state is told.
    for (const [game, word] of [[kicked, 'Locked in'], [draft, 'Draft'], [open, 'To pick'], [late, 'Closed at kickoff']]) await expect(card(page, game.id).locator('.gx-play-card-pill')).toHaveText(word);
    await progress.getByRole('button', { name: `Next to lock · ${draft.awayCode} at ${draft.homeCode}` }).click();
    await expect(card(page, draft.id)).toBeFocused();
    await expect(card(page, draft.id)).toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, 0));
    await matrix(page, 'progress', async theme => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(progress, info, `progress-390-${theme}.png`);
      await shot(card(page, draft.id), info, `picker-390-${theme}.png`);
    });
    // Saving a draft is unchanged: no lockIn, "Draft saved.", and no stamp.
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
    expect(world.writes.at(-1).lockIn).toBeUndefined();
    await expect(page.locator('.gx-play-stamp')).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('reveal moment: opened guesses rise in once per device, never before the server sends them, never a hidden one', async ({ page, baseURL }, info) => {
  const world = await fixture(page, baseURL, { beforeOpen: ({ control }) => { control.picks = gate(); } });
  try {
    const { kicked } = world, [, next] = world.personal.games;
    const reveal = card(page, kicked.id).locator('[data-play="reveal"]');
    await expect.poll(() => world.reads.picks.length).toBeGreaterThan(0);
    // The read is out and unanswered: no guess, no list, nothing that could only come from the reply.
    await expect(reveal).toHaveCount(0);
    await expect(page.locator('.gx-per-game')).not.toContainText('Troy Fixture');
    world.control.picks.open(); world.control.picks = null;
    await expect(reveal).toBeVisible();
    const rows = reveal.getByRole('list', { name: /Other players/ }).getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Troy Fixture'); await expect(rows.nth(0)).toContainText('Cowboys −2.5');
    await expect(rows.nth(1)).toContainText('Sean Fixture'); await expect(rows.nth(1)).toContainText('Late · 12 min');
    await expect(reveal).not.toContainText('Community player');
    // First sight on this device: the strip, then each row, rise in one stagger step (half a tap) apart.
    const motion = await reveal.locator('.gx-play-reveal-in').evaluateAll(nodes => nodes.map(node => [getComputedStyle(node).animationName, getComputedStyle(node).animationDelay, getComputedStyle(node).animationDuration]));
    expect(motion).toEqual([['gx-rise-in', '0s', '0.24s'], ['gx-rise-in', '0.05s', '0.24s'], ['gx-rise-in', '0.1s', '0.24s']]);
    const seen = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), `gtl.play.reveal-seen.v1.${ACCOUNTS.luke.id}`);
    expect(seen[`${world.personal.season}-${world.personal.week}-guess_spread-${kicked.id}`].sort()).toEqual([ACCOUNTS.sean.id, ACCOUNTS.troy.id].sort());
    await matrix(page, 'reveal', theme => shot(card(page, kicked.id), info, `reveal-390-${theme}.png`));
    // A lock-in opens that game's guesses: the read runs again and the new game's rows rise in too.
    const before = world.reads.picks.length;
    const game = await choose(page, next.id);
    await game.getByRole('button', { name: 'Lock in Spread', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm lock-in' }).click();
    await expect(game.locator('[data-play="reveal"]')).toBeVisible();
    expect(world.reads.picks.length).toBeGreaterThan(before);
    await expect(game.locator('[data-play="reveal"] .gx-play-reveal-in')).toHaveCount(3);
    // Seen once on this device: after a reload the same rows are simply there.
    await page.reload();
    await expect(reveal).toBeVisible();
    await expect(reveal.getByRole('listitem')).toHaveCount(2);
    await expect(page.locator('.gx-play-reveal-in')).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('reveal under reduced motion shows every opened row at once, with no movement', async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const world = await fixture(page, baseURL);
  try {
    const reveal = card(page, world.kicked.id).locator('[data-play="reveal"]');
    await expect(reveal.getByRole('listitem')).toHaveCount(2);
    expect(await reveal.locator('.gx-play-reveal-in').evaluateAll(nodes => nodes.map(node => [getComputedStyle(node).animationName, getComputedStyle(node).opacity]))).toEqual([['none', '1'], ['none', '1'], ['none', '1']]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a game the server keeps closed draws no reveal, whatever the device clock or the lock say', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL, { open: false });
  try {
    await expect.poll(() => world.reads.picks.length).toBeGreaterThan(0);
    await expect(page.locator('[data-play="progress"]')).toContainText('1 of 4 locked');
    await expect(card(page, world.kicked.id).getByRole('region', { name: /Spread receipt/ })).toBeVisible();
    await expect(page.locator('[data-play="reveal"]')).toHaveCount(0);
    await expect(page.locator('.gx-per-game')).not.toContainText('Troy Fixture');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the native guess control keeps the classic keyboard model: one Tab stop a row, arrows, type-ahead and "="', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const [, game] = world.personal.games, entry = card(page, game.id);
    const summary = entry.locator('.gx-guess-summary');
    await entry.locator('[data-side="away"]').focus();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    await expect(entry.locator('[data-side="home"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(entry.locator('[data-side="home"]')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Tab');
    await expect(entry.locator('.gx-guess-num[data-value="1"]')).toBeFocused();
    await page.keyboard.type('3');
    await expect(entry.locator('.gx-guess-num[data-value="3"]')).toHaveAttribute('aria-checked', 'true');
    await expect(entry.locator('.gx-guess-num[data-value="3"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(summary).toHaveText(/ −3\.5$/);
    await page.keyboard.press('=');
    const typed = entry.getByRole('textbox');
    await expect(typed).toBeFocused();
    await typed.fill('12.5'); await page.keyboard.press('Enter');
    await expect(summary).toHaveText(/ −12\.5$/);
    await expect(entry.locator('.gx-guess-num[data-value="12.5"]')).toBeFocused();
    await entry.getByRole('button', { name: 'Raise by half a point' }).click();
    await expect(summary).toHaveText(/ −13$/);
    // The guess the editor keeps is the classic value: home favored by 13 is −13, and Save draft sends exactly that.
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
    expect(world.writes.at(-1).picks[game.id]).toBe(-13);
    expect(world.writes.at(-1).lockIn).toBeUndefined();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('quiet states: loading is one line, a failed read is one line with Try again, and the retry loads the week', async ({ page, baseURL }, info) => {
  const world = await fixture(page, baseURL, { beforeOpen: ({ control }) => { control.personalRead = gate(); control.failRead = 1; } });
  try {
    const loading = page.locator('[data-play-state="loading"]');
    await expect(loading).toHaveText('Loading your picks…');
    await expect(loading).toHaveAttribute('role', 'status');
    await matrix(page, 'loading', theme => shot(loading, info, `state-loading-390-${theme}.png`));
    world.control.personalRead.open(); world.control.personalRead = null;
    const failed = page.getByRole('alert').filter({ hasText: 'could not be loaded' });
    await expect(failed).toContainText('Your picks could not be loaded. Picks are temporarily unavailable.');
    await expect(failed.locator('p')).toHaveCount(1);
    await matrix(page, 'error', theme => shot(failed, info, `state-error-390-${theme}.png`));
    await failed.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.locator('.gx-per-game')).toBeVisible();
    await expect(page.locator('[data-play="progress"]')).toContainText('1 of 4 locked');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
