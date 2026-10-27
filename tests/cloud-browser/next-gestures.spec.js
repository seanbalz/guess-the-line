import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { boardOrder } from '../../web/src/next/lines/gameOrder.js';

// Design upgrade ("game feel"): touch interaction in the new app at 390 x 844, on the real app (main.jsx, AuthGate, the
// lazy NextApp) and the real handler with every migration (ALL) on local PGlite, with real pointer drags (page.mouse,
// and touch through the browser's own touch input). Checked, each as what a player sees:
// 1. press feedback: a pressed card, button and icon button dip to 0.97 and dim on the tap tokens, spring back on
//    release, and keep only the dim under reduced motion (the device's or the app's); the primary button ticks once;
// 2. swipe to close: the sheet follows a downward drag of its handle or head (transform on the sheet itself, never on
//    an ancestor of the fixed bars), snaps back from a short drag, closes from a long one and gives focus back; the close
//    button and Escape still work;
// 3. swipe between games: the game sheet shows "1 of 4" and 44px previous and next buttons, follows a sideways drag,
//    turns past the threshold, snaps back from a short drag, resists at the first and last game, leaves vertical drags and
//    touch scrolling alone, and never scrolls the page sideways;
// 4. skeletons: while the week or a game's market lines load, token-tinted blocks (a static tint, no loop) stand in,
//    with the words kept as a role=status a screen reader hears.
// Every state: no side scroll at 390 and 320, 44px targets, no text under 12px, axe clean in Dark and Light.
// Fictional accounts only; never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });
test.beforeEach(() => { test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'); });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const sheet = (page, name) => page.getByRole('dialog', { name, exact: true });
const card = (page, id) => page.locator(`.gx-l-card[data-game="${id}"]`);
const place = page => page.locator('.gx-sheet [aria-live="polite"]');
const pageButton = (page, which) => page.locator('.gx-sheet .gx-sheet-page').nth(which === 'prev' ? 0 : 1);

async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
}

/** The app's fonts never load here (Google Fonts is blocked); measure in DejaVu Sans, as CI's runner does (next-lines.spec.js). */
async function ciFonts(page) {
  await page.evaluate(() => {
    if (document.getElementById('ci-fonts')) return;
    const style = document.createElement('style');
    style.id = 'ci-fonts';
    style.textContent = 'html .gx { --gx-font-body: "DejaVu Sans", sans-serif; --gx-font-num: "DejaVu Sans", sans-serif; --gx-font-display: "DejaVu Sans", sans-serif; }';
    document.head.append(style);
  });
}

/** Phone rules (build plan 4.1): no side scroll, 44px targets, no text under 12px, nothing clipped. */
async function phoneChecks(page, where) {
  await ciFonts(page);
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}: no side scroll`).toBe(true);
  const report = await page.locator('.gx').first().evaluate(scope => {
    const visible = el => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && el.getClientRects().length > 0 && !el.closest('[inert], [hidden], dialog:not([open])'); };
    const targets = [...scope.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button]')].filter(visible)
      .filter(el => !el.closest('.gx-scrim') && el.getAttribute('aria-hidden') !== 'true')
      .map(el => { const r = el.getBoundingClientRect(); return { name: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w < 44 || r.h < 44);
    const small = [], clipped = [];
    for (const el of [scope, ...scope.querySelectorAll('*')]) {
      if (!visible(el) || el.closest('.gx-sr-only') || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 12) small.push(el.textContent.trim().slice(0, 40));
      if (!el.closest('.gx-truncate') && el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 40));
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 0.5 || r.left < -0.5) clipped.push(`off screen: ${el.textContent.trim().slice(0, 40)}`);
    }
    return { targets, small, clipped };
  });
  expect(report, where).toEqual({ targets: [], small: [], clipped: [] });
}

async function axe(page) {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return result.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target.join(' ')).join(', ')}`);
}

/** Both themes and both widths: the phone rules and axe, for the state on screen now. */
async function everyLook(page, where, testInfo) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 640 });
      await phoneChecks(page, `${where} ${theme} ${width}`);
      expect(await axe(page), `${where}: axe in ${theme} at ${width}`).toEqual([]);
      if (width === 390) await page.screenshot({ path: testInfo.outputPath(`${where.replace(/\W+/g, '-')}-390-${theme}.png`) });
    }
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.setViewportSize({ width: 390, height: 844 });
}

/** Where an element sits now (its computed transform): translate x and y, and its scale. */
const moved = locator => locator.evaluate(el => { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return { x: Math.round(m.m41), y: Math.round(m.m42), scale: Math.round(m.a * 1000) / 1000 }; });
const opacity = locator => locator.evaluate(el => Number(getComputedStyle(el).opacity));

/** What would make a fixed bar scroll away: a transform, filter or will-change on any of its ancestors. */
const barTraps = page => page.evaluate(() => {
  const out = [];
  for (const selector of ['.gx-tabbar', '.gx-topbar']) {
    for (let n = document.querySelector(selector)?.parentElement; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.transform !== 'none' || s.filter !== 'none' || s.translate !== 'none' || s.scale !== 'none' || /transform|filter/.test(s.willChange) || (s.backdropFilter && s.backdropFilter !== 'none')) {
        out.push(`${selector} inside ${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]}`);
      }
    }
  }
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) out.push('the page scrolls sideways');
  return out;
});

const center = async locator => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };

/** A mouse drag from `from` by (dx, dy), held at the end so the test can look, then released (unless `hold`). */
async function drag(page, from, dx, dy, { steps = 8, look, release = true } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps });
  const seen = look ? await look() : null;
  if (release) await page.mouse.up();
  return seen;
}

/** A touch drag through the browser's own touch input (so touch-action and native scrolling apply). */
async function touchDrag(page, cdp, from, dx, dy, steps = 10) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function week(page, baseURL, options = {}) {
  const world = await communityWorld(page, baseURL, { migrations: ALL, games: 4, ...options });
  const order = boardOrder((await world.api('luke', 'personal')).body);
  expect(order.map(g => g.id)).toHaveLength(4);
  return { world, order };
}

async function openLines(page) {
  await signIn(page, 'luke');
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('about:blank');
  await page.goto('/#lines');
  await expect(page.getByRole('heading', { name: 'Lines', level: 1, exact: true })).toBeVisible();
}

async function openGame(page, game) {
  await card(page, game.id).click();
  await expect(sheet(page, game.title)).toBeVisible();
  await settle(page);
}

test('press feedback: a pressed card, button or icon button dips and dims, then springs back; reduced motion keeps only the dim', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    window.__vibrations = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: pattern => { window.__vibrations.push(pattern); return true; } });
  });
  const { world, order } = await week(page, baseURL);
  try {
    await openLines(page);
    const targets = { card: card(page, order[0].id), button: page.getByRole('button', { name: 'Open weekly research', exact: true }), icon: page.getByRole('button', { name: 'About trends', exact: true }) };
    for (const [kind, target] of Object.entries(targets)) {
      await target.scrollIntoViewIfNeeded();
      await settle(page);
      const at = await center(target);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await expect.poll(() => moved(target), `${kind} dips while pressed`).toMatchObject({ scale: 0.97 });
      await expect.poll(() => opacity(target), `${kind} dims while pressed`).toBe(0.85);
      // Let go somewhere else, so nothing opens: it springs back.
      await page.mouse.move(4, 120);
      await page.mouse.up();
      await expect.poll(() => moved(target), `${kind} springs back`).toMatchObject({ scale: 1 });
      await expect.poll(() => opacity(target)).toBe(1);
    }
    // The press runs on the tap tokens (100ms, standard easing), transform and opacity only.
    expect(await targets.card.evaluate(el => [getComputedStyle(el).transitionProperty, getComputedStyle(el).transitionDuration])).toEqual(['transform, opacity', '0.1s, 0.1s']);
    expect(await page.evaluate(() => window.__vibrations), 'no tick for a card, a secondary button or an icon button').toEqual([]);

    // Reduced motion, from the device: the dim stays, the dip goes, and nothing transitions.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const [kind, target] of Object.entries(targets)) {
      const at = await center(target);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      expect(await moved(target), `${kind}: no dip under reduced motion`).toMatchObject({ scale: 1 });
      expect(await opacity(target), `${kind}: the dim lands at once`).toBe(0.85);
      await page.mouse.move(4, 120);
      await page.mouse.up();
    }
    // Reduced motion, from the app's own setting (data-motion="reduce" on the .gx root).
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => document.querySelector('.gx').setAttribute('data-motion', 'reduce'));
    const at = await center(targets.card);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    expect(await moved(targets.card)).toMatchObject({ scale: 1 });
    expect(await opacity(targets.card)).toBe(0.85);
    await page.mouse.move(4, 120);
    await page.mouse.up();
    await page.evaluate(() => document.querySelector('.gx').removeAttribute('data-motion'));

    // The primary action ticks once (10ms); the Research root's one lime button opens the games.
    await page.goto('/#research');
    const primary = page.locator('.gx-btn--primary').first();
    await expect(primary).toBeVisible();
    await primary.click();
    expect(await page.evaluate(() => window.__vibrations)).toEqual([10]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('swipe to close: the sheet follows its handle or head down, snaps back from a short drag, closes from a long one', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(90000);
  const { world, order } = await week(page, baseURL);
  try {
    await openLines(page);
    const game = order[0];
    await openGame(page, game);
    const panel = sheet(page, game.title);
    const grab = page.locator('.gx-sheet-grab');
    // A short drag: the sheet follows the finger with a transform on itself, the fixed bars stay put, then it snaps back.
    const during = await drag(page, await center(grab), 0, 40, { look: async () => ({ at: await moved(panel), traps: await barTraps(page),
      scrim: await opacity(page.locator('.gx-layer--sheet .gx-scrim')) }) });
    expect(during.at).toMatchObject({ x: 0, y: 40 });
    expect(during.traps, 'no ancestor of the tab bar or top bar moves').toEqual([]);
    expect(during.scrim, 'the scrim fades with the sheet').toBeLessThan(1);
    await expect.poll(() => moved(panel), 'a short drag snaps back').toMatchObject({ y: 0 });
    await expect(panel).toBeVisible();
    // Dragging up does nothing: the sheet never rises above its place.
    expect(await drag(page, await center(grab), 0, -80, { look: () => moved(panel) })).toMatchObject({ y: 0 });
    await expect(panel).toBeVisible();
    // A sideways drag on the head is not a close.
    await drag(page, await center(panel.locator('.gx-sheet-title')), 120, 4);
    await expect(panel).toBeVisible();
    await expect(sheet(page, game.title)).toBeVisible();

    // A long drag from the head (its title): the sheet follows all the way, then closes and focus goes back to the card.
    const far = await drag(page, await center(panel.locator('.gx-sheet-title')), 0, 300, { steps: 12, look: () => moved(panel) });
    expect(far).toMatchObject({ x: 0, y: 300 });
    await expect(sheet(page, game.title)).toHaveCount(0);
    await expect(card(page, game.id)).toBeFocused();
    expect(await barTraps(page)).toEqual([]);

    // The close button and Escape still close it, and focus still returns.
    await openGame(page, game);
    await panel.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet(page, game.title)).toHaveCount(0);
    await expect(card(page, game.id)).toBeFocused();
    await openGame(page, game);
    await page.keyboard.press('Escape');
    await expect(sheet(page, game.title)).toHaveCount(0);
    await expect(card(page, game.id)).toBeFocused();

    // A drag that starts on the close button and moves does not also click it: the sheet snaps back and stays.
    await openGame(page, game);
    await drag(page, await center(panel.getByRole('button', { name: 'Close', exact: true })), 0, 30);
    await expect.poll(() => moved(panel)).toMatchObject({ y: 0 });
    await expect(panel).toBeVisible();

    // Reduced motion: the drag still follows the finger (direct manipulation), and the close lands at once.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await drag(page, await center(grab), 0, 260, { steps: 10 });
    await expect(sheet(page, game.title)).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await openGame(page, game);
    await everyLook(page, 'game sheet with its pager', testInfo);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('swipe between games: the sheet follows a sideways drag, turns past the threshold, resists at the ends, keeps vertical drags', async ({ page, baseURL }) => {
  test.setTimeout(90000);
  const { world, order } = await week(page, baseURL);
  try {
    await openLines(page);
    await openGame(page, order[0]);
    const body = page.locator('.gx-sheet-body');
    const grip = async () => { const box = await body.boundingBox(); return { x: box.x + box.width / 2, y: box.y + 40 }; };
    await expect(place(page)).toHaveText(`${order[0].title}, game 1 of 4`);
    await expect(pageButton(page, 'prev')).toHaveAttribute('aria-disabled', 'true');
    await expect(pageButton(page, 'prev')).toHaveAccessibleName('Previous game');
    await expect(pageButton(page, 'next')).toHaveAccessibleName(`Next game, ${order[1].title}`);
    for (const which of ['prev', 'next']) {
      const box = await pageButton(page, which).boundingBox();
      expect(Math.min(box.width, box.height), `${which} is a 44px target`).toBeGreaterThanOrEqual(44);
    }

    // At the first game a drag toward the previous one is resisted (follows less than the finger) and snaps back.
    const resisted = await drag(page, await grip(), 150, 0, { look: () => moved(body) });
    expect(resisted.x).toBeGreaterThan(0);
    expect(resisted.x).toBeLessThan(75);
    await expect.poll(() => moved(body)).toMatchObject({ x: 0 });
    await expect(place(page)).toHaveText(`${order[0].title}, game 1 of 4`);

    // A sideways drag: the page follows the finger exactly, nothing scrolls sideways, and past the threshold it turns.
    const following = await drag(page, await grip(), -200, 0, { look: async () => ({ at: await moved(body), traps: await barTraps(page) }) });
    expect(following.at).toMatchObject({ x: -200, y: 0 });
    expect(following.traps).toEqual([]);
    await expect(sheet(page, order[1].title)).toBeVisible();
    await expect(place(page)).toHaveText(`${order[1].title}, game 2 of 4`);
    await settle(page);
    await expect.poll(() => moved(body)).toMatchObject({ x: 0 });
    expect(await opacity(body)).toBe(1);

    // A short drag snaps back to the same game.
    await drag(page, await grip(), 30, 0);
    await expect.poll(() => moved(body)).toMatchObject({ x: 0 });
    await expect(place(page)).toHaveText(`${order[1].title}, game 2 of 4`);
    // A vertical mouse drag is not a page turn.
    await drag(page, await grip(), 0, 200);
    await expect(place(page)).toHaveText(`${order[1].title}, game 2 of 4`);
    expect(await moved(body)).toMatchObject({ x: 0 });
    // Back to the previous game, the other way.
    await drag(page, await grip(), 180, 0);
    await expect(place(page)).toHaveText(`${order[0].title}, game 1 of 4`);
    await settle(page);

    // The buttons, for everyone without a touch screen: focus stays on the button; at the last game it is unavailable.
    const next = pageButton(page, 'next');
    for (let i = 1; i < 4; i += 1) {
      await next.click();
      await expect(place(page)).toHaveText(`${order[i].title}, game ${i + 1} of 4`);
      await settle(page);
    }
    await expect(next).toBeFocused();
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    await expect(next).toBeDisabled();
    // Still there and named; a press does nothing (Playwright will not click a disabled control, so the mouse does).
    const nextAt = await center(next);
    await page.mouse.click(nextAt.x, nextAt.y);
    await page.keyboard.press('Enter');
    await expect(place(page)).toHaveText(`${order[3].title}, game 4 of 4`);
    // At the last game a drag toward the next one is resisted too.
    const end = await drag(page, await grip(), -150, 0, { look: () => moved(body) });
    expect(end.x).toBeLessThan(0);
    expect(end.x).toBeGreaterThan(-75);
    await expect(place(page)).toHaveText(`${order[3].title}, game 4 of 4`);
    await pageButton(page, 'prev').click();
    await expect(place(page)).toHaveText(`${order[2].title}, game 3 of 4`);

    // A new game opens at its top.
    await body.evaluate(el => { el.scrollTop = 400; });
    await pageButton(page, 'prev').click();
    await expect(place(page)).toHaveText(`${order[1].title}, game 2 of 4`);
    expect(await body.evaluate(el => el.scrollTop)).toBe(0);

    // Inside an ⓘ dialog the drag belongs to the dialog: the page does not turn.
    await page.locator('.gx-sheet-body .gx-info-btn').first().click();
    const info = page.locator('dialog.gx-info[open]');
    await expect(info).toBeVisible();
    await drag(page, await center(info.locator('.gx-info-panel')), -200, 0);
    await page.keyboard.press('Escape');
    await expect(info).toHaveCount(0);
    await expect(place(page)).toHaveText(`${order[1].title}, game 2 of 4`);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  test('a vertical touch drag scrolls the game sheet natively; a sideways one turns the game; the handle closes it', async ({ page, baseURL }) => {
    test.setTimeout(90000);
    const { world, order } = await week(page, baseURL);
    try {
      await openLines(page);
      await openGame(page, order[0]);
      const cdp = await page.context().newCDPSession(page);
      const body = page.locator('.gx-sheet-body');
      const box = await body.boundingBox();
      const from = { x: box.x + box.width / 2, y: box.y + box.height - 60 };
      // Up the screen: the browser scrolls the body (touch-action pan-y); the game stays.
      const before = await body.evaluate(el => el.scrollTop);
      await touchDrag(page, cdp, from, 0, -300);
      await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(before + 50);
      await expect(place(page)).toHaveText(`${order[0].title}, game 1 of 4`);
      expect(await moved(body)).toMatchObject({ x: 0 });
      // Sideways: the next game.
      await touchDrag(page, cdp, { x: box.x + box.width - 40, y: box.y + 60 }, -220, 6);
      await expect(place(page)).toHaveText(`${order[1].title}, game 2 of 4`);
      await settle(page);
      expect(await body.evaluate(el => el.scrollTop), 'the next game opens at its top').toBe(0);
      // Down from the handle: it closes.
      await touchDrag(page, cdp, await center(page.locator('.gx-sheet-grab')), 0, 320);
      await expect(sheet(page, order[1].title)).toHaveCount(0);
      expect(await barTraps(page)).toEqual([]);
      expect(world.errors).toEqual([]);
    } finally { await world.db.close(); }
  });
});

test('skeletons: while the week and a game\'s market lines load, static token blocks stand in, with the status in words', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(120000);
  const { world, order } = await week(page, baseURL);
  try {
    await openLines(page);
    // Hold the week's read and the game's market lines until the checks are done (then let them through to the handler).
    const gates = {};
    const hold = name => { let open; gates[name] = { promise: new Promise(resolve => { open = resolve; }), open: () => open() }; };
    hold('personal'); hold('lines/game');
    await page.route(url => url.origin === SUPABASE && ['/functions/v1/gtl-api/personal', '/functions/v1/gtl-api/lines/game'].includes(url.pathname), async route => {
      const name = new URL(route.request().url()).pathname.replace('/functions/v1/gtl-api/', '');
      await gates[name].promise;
      await route.fallback();
    });
    await page.goto('about:blank');
    await page.goto('/#lines');
    const board = page.locator('.gx-skel[data-skeleton="cards"]');
    await expect(board).toBeVisible();
    await expect(board).toHaveAttribute('role', 'status');
    await expect(page.getByRole('status').filter({ hasText: 'Loading this week’s games…' })).toHaveCount(1);
    // The words are for screen readers only; the blocks are a static surface-3 tint with no animation (one loop app-wide).
    expect(await board.locator('.gx-sr-only').innerText()).toBe('Loading this week’s games…');
    await expect(board.locator('.gx-skel-art')).toHaveAttribute('aria-hidden', 'true');
    const tint = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.background = 'var(--gx-surface-3)';
      document.querySelector('.gx').append(probe);
      const want = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const bars = [...document.querySelectorAll('.gx-skel-bar, .gx-skel-dot')];
      return { count: bars.length, tinted: bars.every(bar => getComputedStyle(bar).backgroundColor === want), moving: bars.flatMap(bar => bar.getAnimations()).length,
        named: bars.map(bar => getComputedStyle(bar).animationName).filter(name => name !== 'none') };
    });
    expect(tint).toEqual({ count: expect.any(Number), tinted: true, moving: 0, named: [] });
    expect(tint.count).toBeGreaterThan(6);
    await everyLook(page, 'lines board skeleton', testInfo);

    gates.personal.open();
    await expect(card(page, order[0].id)).toBeVisible();
    await expect(board).toHaveCount(0);
    // The game sheet's market lines are still held: skeleton panels stand in inside the sheet.
    await openGame(page, order[0]);
    const market = page.getByRole('region', { name: 'Market lines', exact: true });
    const panels = market.locator('.gx-skel[data-skeleton="panels"]');
    await expect(panels).toBeVisible();
    await expect(panels.locator('.gx-skel-card')).toHaveCount(2);
    await expect(market).toContainText('Loading market lines…');
    await everyLook(page, 'game sheet market skeleton', testInfo);
    gates['lines/game'].open();
    await expect(panels).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
