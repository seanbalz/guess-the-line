// Persona (e): motor-impaired keyboard-only user. No mouse at all: every screen is reached by
// Tab/Enter/Space/Escape, 44px targets are measured, and keyboard traps are checked.
import { test, expect, pgliteAvailable } from './harness.mjs';

test.use({ viewport: { width: 1024, height: 768 } });

test('motor: keyboard-only journey, 44px targets and no keyboard traps', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start({ games: 3 });
  await page.goto('/');
  await persona.smallTargets('sign-in');
  // Sign in without a pointer.
  await persona.tabTo(f => f.tag === 'input');
  await page.keyboard.type('ben@example.test');
  await page.keyboard.press('Tab'); await page.keyboard.type('test-password'); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();

  // Skip link: first Tab must land on it, it must be visible, and Enter must move focus into main.
  await page.keyboard.press('Tab');
  const skip = await persona.focused();
  expect(skip.name).toBe('Skip to main content');
  persona.finding({ screen: 'feed', severity: skip.visible ? 4 : 2, wcag: '2.4.1', experience: skip.visible ? 'The skip link is the first tab stop and becomes visible on focus. Good.' : 'The skip link takes focus but is not visible.', fix: skip.visible ? 'Keep it.' : 'Show the link on focus.' });
  await page.keyboard.press('Enter');
  const afterSkip = await page.evaluate(() => ({ hash: location.hash, active: document.activeElement?.id || document.activeElement?.tagName }));
  persona.finding({ screen: 'feed', severity: 3, wcag: '2.4.1', experience: `Activating the skip link sets ${afterSkip.hash} and focus goes to "${afterSkip.active}". <main id="main"> has no tabindex on the Community screen, so the next Tab continues from the top of main: the theme select and six league chips still come before the Feed/Picks tabs and the picks-due card.`, fix: 'Give main tabindex="-1" (the game screen already does) and target the skip link at the first primary action.' });
  await persona.smallTargets('feed');
  await persona.shot('feed');

  // Trap check: tab through the whole home screen and confirm focus leaves to the browser chrome.
  let steps = 0, trapped = false; const seen = new Set();
  for (; steps < 300; steps++) {
    await page.keyboard.press('Tab');
    const f = await persona.focused();
    if (f.tag === 'body') break;
    const key = `${f.tag}:${f.name}`;
    if (seen.has(key) && steps > 10 && f.name === 'Skip to main content') { trapped = true; break; }
    seen.add(key);
  }
  persona.finding({ screen: 'feed', severity: trapped ? 1 : 4, wcag: '2.1.2', experience: trapped ? 'Focus cycled back to the skip link without ever leaving the page: a keyboard trap.' : `Tabbing through the home screen reaches ${steps} stops (with ${persona.state.games.length} games and three members) and then leaves the document. No trap.`, fix: trapped ? 'Remove the focus loop.' : 'Keep it; reduce the stop count with roving tabindex in chip rows and the league switcher.' });

  // Picks by keyboard: team chip with Space, number with Enter, fine-tune with the − button.
  await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).focus();
  await page.keyboard.press('Enter');
  const first = page.locator('.week-pick').first();
  await expect(first).toBeVisible();
  await persona.smallTargets('picks');
  await persona.tabTo(f => f.name === 'Cowboys');
  await page.keyboard.press('Space');
  await persona.tabTo(f => f.name === '−3');
  await page.keyboard.press('Enter');
  await persona.tabTo(f => f.name === 'Lower by half a point');
  await page.keyboard.press('Enter');
  await expect(first.locator('output')).toHaveText('Cowboys −2.5');
  // The − button stays enabled at the floor and the + button at the ceiling; repeated presses do nothing silently.
  for (let i = 0; i < 6; i++) await page.keyboard.press('Enter');
  const atFloor = await first.locator('output').innerText();
  persona.finding({ screen: 'picks', severity: 4, experience: `Pressing "Lower by half a point" repeatedly stops at "${atFloor}" (floor 0.5) while the button stays enabled and the live region repeats the same value. Pick'em (0) is reachable only through the middle team chip.`, fix: 'Disable the stepper at the floor/ceiling or let the floor step into Pick\'em.' });
  // Chip spacing: 8px gaps between 44px chips; chips are 56px wide minimum.
  const chipBox = await first.locator('.number-chip').first().boundingBox();
  const gap = await first.locator('.chip-numbers').evaluate(el => getComputedStyle(el).gap);
  persona.finding({ screen: 'picks', severity: 4, experience: `Number chips are ${Math.round(chipBox.width)}×${Math.round(chipBox.height)}px with ${gap} gaps; 21 chips in a row of a 1024px screen wrap to two lines. Sizes meet the 44px minimum. Good.`, fix: 'Keep sizes; consider 12px gaps on touch devices to reduce mis-taps between adjacent half-point values.' });
  await persona.shot('picks');

  // Groups screen: the New game dialog must trap focus inside and release on Escape.
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: 'Feed', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Groups & games/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await persona.smallTargets('groups');
  await persona.shot('groups');
  await page.getByRole('button', { name: 'New game', exact: true }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Start a new game' });
  await expect(dialog).toBeVisible();
  const dialogFocus = await persona.focused();
  persona.finding({ screen: 'new-game-dialog', severity: dialogFocus.name === 'Close dialog' ? 4 : 3, wcag: '2.4.3', experience: `Opening "New game" moves focus to "${dialogFocus.name || dialogFocus.tag}". The native <dialog> keeps Tab inside it and Escape closes it, which is right; focus should start on the Game name field rather than the close button.`, fix: 'Autofocus the first field in dialogs.' });
  await persona.smallTargets('new-game-dialog');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  const released = await persona.focused();
  persona.finding({ screen: 'groups', severity: 4, wcag: '2.4.3', experience: `After Escape, focus returns to "${released.name || released.tag}".`, fix: released.name === 'New game' ? 'Keep it.' : 'Return focus to the New game button.' });

  // Open a game: the game shell has a mobile navigation trap by design; at 1024px the sidebar is fixed.
  await page.getByRole('button', { name: 'Create your first game' }).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Game name').fill('Keyboard duel');
  await page.getByLabel('Make this a practice game', { exact: false }).check();
  await page.getByRole('button', { name: 'Create game', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'The weekly huddle.' })).toBeVisible();
  await persona.smallTargets('game-dashboard');
  await persona.shot('game-dashboard');
  // Game navigation by keyboard: the sidebar buttons come after the brand and league chip.
  const toPicks = await persona.tabTo(f => f.name === 'My picks');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Trust your read.' })).toBeVisible();
  persona.finding({ screen: 'game-dashboard', severity: 3, experience: `Inside a group game the Community chip entry is not used: "My picks" (${toPicks} Tabs from the top) opens the older dropdown-and-typed-number form (PredictionEntry). A keyboard user therefore learns two different entry patterns for the same ballot.`, fix: 'Reuse ChipPicker inside PredictionEntry (noted as a follow-up in SOCIAL_COMMUNITY.md).' });
  await persona.smallTargets('game-picks');
  await persona.shot('game-picks');
  expect(await persona.noOverflow()).toBe(true);
});
