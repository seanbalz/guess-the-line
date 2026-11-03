// Personas on the new app, the only app since D-65: a phone player (390 px), a low-vision player (200% zoom: 640 CSS px
// at deviceScaleFactor 2) and a keyboard-only player. Each signs in, walks the four tabs and the menu, and records axe,
// small-text and small-target findings (harness.mjs); the assertions are what must hold today: the new app opens, no
// screen scrolls sideways, every tab is reachable, and no old-app screen or way into one appears.
import { test, expect, pgliteAvailable } from './harness.mjs';

const TABS = ['Home', 'Play', 'Bets', 'Research'];
const nav = page => page.getByRole('navigation', { name: 'Main' });
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

async function walk(page, persona, label) {
  await expect(nav(page)).toBeVisible();
  await expect(page.locator('.hub-shell')).toHaveCount(0);
  for (const tab of TABS) {
    await nav(page).getByRole('button', { name: new RegExp(`^${tab}`) }).click();
    await expect(page.locator('.gx-screen').first()).toBeVisible();
    expect(await noSideScroll(page), `${label} ${tab}: no side scroll`).toBe(true);
    await persona.axe(`${label}-${tab.toLowerCase()}`);
    await persona.smallText(`${label}-${tab.toLowerCase()}`);
    await persona.smallTargets(`${label}-${tab.toLowerCase()}`);
    await persona.shot(`${label}-${tab.toLowerCase()}`);
  }
  await page.getByRole('button', { name: 'Your menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await expect(menu.getByText(/old app|Older records and tools/i)).toHaveCount(0);
  await persona.axe(`${label}-menu`);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
}

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('phone: the new app opens and every tab works at 390 px', async ({ page, persona }) => {
    test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
    await persona.start({ games: 4 });
    await persona.signIn();
    await walk(page, persona, 'phone');
  });
});

test.describe('low vision', () => {
  test.use({ viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 });
  test('low vision: the new app at 200% zoom, every tab reachable without side scroll', async ({ page, persona }) => {
    test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
    await persona.start({ games: 4 });
    await persona.signIn();
    await walk(page, persona, 'zoom');
  });
});

test('keyboard: every tab is reached and opened from the keyboard', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start({ games: 4 });
  await persona.signIn();
  await expect(nav(page)).toBeVisible();
  for (const tab of TABS) {
    const button = nav(page).getByRole('button', { name: new RegExp(`^${tab}`) });
    const alreadyCurrent = await button.getAttribute('aria-current') === 'page';
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-current', 'page');
    const heading = page.getByRole('heading', { name: tab, level: 1, exact: true });
    await expect(heading).toBeVisible();
    // Wait for the route's focus handoff before focusing the next tab. Any visible
    // screen can be the outgoing page, and its pending frame can otherwise win.
    // Activating the already-current Home tab does not perform a route handoff.
    if (!alreadyCurrent) await expect(heading).toBeFocused();
  }
  await persona.axe('keyboard-research');
});
