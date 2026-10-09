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
  // Review of PR #34 (2.4.4): the link names its target. With a picks-due card it reads "Skip to picks due" and lands on the card.
  expect(skip.name).toBe('Skip to picks due');
  persona.finding({ screen: 'feed', severity: skip.visible ? 4 : 2, wcag: '2.4.1', experience: skip.visible ? 'The skip link is the first tab stop and becomes visible on focus. Good.' : 'The skip link takes focus but is not visible.', fix: skip.visible ? 'Keep it.' : 'Show the link on focus.' });
  await page.keyboard.press('Enter');
  // Quick win 11 (#17, #18): the skip link targets the picks-due card (tabindex -1), so the next Tab is "Make picks"; main carries tabindex -1 too.
  const afterSkip = await page.evaluate(() => ({ hash: location.hash, active: document.activeElement?.id || document.activeElement?.tagName, mainTabIndex: document.getElementById('main')?.tabIndex }));
  expect(afterSkip).toEqual({ hash: '#picks-due', active: 'picks-due', mainTabIndex: -1 });
  await page.keyboard.press('Tab');
  expect((await persona.focused()).name).toBe('Make picks');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
  await persona.smallTargets('feed');
  await persona.shot('feed');

  // Trap check: tab through the whole home screen and confirm focus leaves to the browser chrome.
  let steps = 0, trapped = false; const seen = new Set();
  for (; steps < 300; steps++) {
    await page.keyboard.press('Tab');
    const f = await persona.focused();
    if (f.tag === 'body') break;
    const key = `${f.tag}:${f.name}`;
    if (seen.has(key) && steps > 10 && f.name.startsWith('Skip to')) { trapped = true; break; }
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
  await expect(first.locator('.chip-summary')).toHaveText('Cowboys −2.5');
  // The − button stays enabled at the floor and the + button at the ceiling; repeated presses do nothing silently.
  for (let i = 0; i < 6; i++) await page.keyboard.press('Enter');
  const atFloor = await first.locator('.chip-summary').innerText();
  persona.finding({ screen: 'picks', severity: 4, experience: `Pressing "Lower by half a point" repeatedly stops at "${atFloor}" (floor 0.5) while the button stays enabled and the live region repeats the same value. Pick'em (0) is reachable only through the middle team chip.`, fix: 'Disable the stepper at the floor/ceiling or let the floor step into Pick\'em.' });
  // Review of PR #34 (2.4.3): the pressed save-bar button goes aria-disabled, not disabled, so focus stays on it while it reads
  // "Saving…" and after the save, when it has nothing left to save. No control in the bar is natively disabled.
  await persona.tabTo(f => f.name === 'Save draft');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: 'Save draft', disabled: false });
  await expect(page.locator('.save-bar [data-action="draft"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.save-bar button:disabled')).toHaveCount(0);
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
  // Since main 5a96c80 (PR #19) the group ballot uses ChipPicker too, with a "Next game" link per row and a helper
  // sentence that the Community Picks tab still lacks.
  const helper = await page.locator('.ballot-header').innerText();
  expect(helper).toContain('Tap the favorite or Pick');
  // The group ballot rows carry the same labelled number row and "Your call" line as the Community tab (ChipPicker is shared):
  // choose the home favorite by keyboard and the row label and call line appear, using the team codes this screen passes in.
  const groupPicker = page.locator('.prediction-entry-controls').first();
  await groupPicker.locator('.team-chip').nth(2).focus();
  await page.keyboard.press('Enter');
  await expect(groupPicker.locator('.chip-row-label')).toHaveText('DAL win by…');
  await groupPicker.getByRole('button', { name: '−3', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(groupPicker.locator('.chip-call')).toHaveText('Your call: DAL by 3');
  await expect(groupPicker.locator('.chip-summary')).toHaveText('DAL −3');
  persona.finding({ screen: 'game-picks', severity: 4, experience: `Inside a group game "My picks" (${toPicks} Tabs from the top) opens the same chip entry as the Community tab, with per-row "Next game" links and a helper sentence ("${helper.split('\n').find(line => line.startsWith('Tap'))}"). The Community Picks tab now has its own dismissible helper; the two sentences are worded differently.`, fix: 'Share one helper sentence between the two surfaces.' });
  // Regression check: at 1024px the matchup column is so narrow that full team names break mid-word.
  const names = await page.locator('.prediction-matchup .team-matchup__name strong').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(), line = parseFloat(getComputedStyle(node).lineHeight) || 20; return { text: node.textContent, width: Math.round(r.width), lines: Math.round(r.height / line) }; }));
  const broken = names.filter(n => n.lines > n.text.split(' ').length + 1);
  if (broken.length) persona.finding({ screen: 'game-picks', severity: 2, wcag: '1.4.10 (reflow)', experience: `Regression on main (chip entry in PredictionEntry): at 1024px the matchup column is ${broken[0].width}px wide and full team names wrap letter by letter ("${broken[0].text}" over ${broken[0].lines} lines; ${broken.length} of ${names.length} names). The row is three times taller than its chips and the kickoff/records lines sit under a column of single syllables.`, fix: 'Give the matchup column a min-width (or use the compact code names at <1200px) and let the chip cell take the remaining width.', evidence: broken.slice(0, 4) });
  const sitOut = page.getByRole('button', { name: 'Sit out this week' });
  if (await sitOut.count()) persona.finding({ screen: 'game-picks', severity: 3, experience: '"Sit out this week" (final, forfeits the week) sits in the save bar as a secondary button directly beside "Save draft", with the same size and weight. A keyboard user tabbing to Save draft lands on Sit out first.', fix: 'Move the opt-out below the ballot as a text link ("Not playing this week? Sit out…"), keep the confirmation dialog.' });
  await persona.smallTargets('game-picks');
  await persona.shot('game-picks');
  expect(await persona.noOverflow()).toBe(true);
});
