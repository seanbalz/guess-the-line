// Persona (e): motor-impaired keyboard-only user. No mouse at all: every screen is reached by
// Tab/Enter/Space/Escape, 44px targets are measured, and keyboard traps are checked.
import { test, expect, pgliteAvailable } from './harness.mjs';

test.use({ viewport: { width: 1024, height: 768 } });

test('motor: keyboard-only journey, 44px targets and no keyboard traps', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start({ games: 3 });
  await page.goto('/');
  // Bigger changes (#19, #31, #32): no interactive target under 44px on any screen of this journey. A labelled radio or checkbox is
  // measured by its label (the press target); the 20×20 control itself stays native.
  expect(await persona.smallTargets('sign-in')).toEqual([]);
  // Sign in without a pointer.
  await persona.tabTo(f => f.tag === 'input');
  await page.keyboard.type('ben@example.test');
  await page.keyboard.press('Tab'); await page.keyboard.type('test-password'); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  // The skip link names the picks-due card only once the feed has arrived (the heading paints first), so wait for the card before
  // the first Tab: this asserts the link's text for the screen it describes, not for a race against the feed request.
  await expect(page.locator('.picks-due')).toBeVisible();

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
  expect(await persona.smallTargets('feed')).toEqual([]);
  expect(await page.locator('.feed-actions [data-action="like"]').evaluateAll(buttons => buttons.map(b => Math.round(b.getBoundingClientRect().width)).filter(w => w < 44))).toEqual([]);
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

  // Picks by keyboard (#9): the team row is one Tab stop (End jumps to the home team, Space chooses), the number row is a
  // radiogroup (a typed 3 checks −3), and the − / + keys step half a point like the − / + buttons.
  await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).focus();
  await page.keyboard.press('Enter');
  const first = page.locator('.week-pick').first();
  await expect(first).toBeVisible();
  expect(await persona.smallTargets('picks')).toEqual([]);
  // The Community helper sentence (PR #34) is the one the group ballot must share (#31).
  const communityHelp = await page.locator('.chip-help p').innerText();
  await persona.tabTo(f => f.name === 'Buccaneers');
  await page.keyboard.press('End');
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: 'Cowboys', pressed: 'false' });
  await page.keyboard.press('Space');
  await expect(first.getByRole('button', { name: 'Cowboys', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Tab');
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: '−1' });
  // − and + do nothing until a number is chosen, like the disabled − button: the focused chip is not a value.
  await page.keyboard.press('-'); await page.keyboard.press('+');
  await expect(first.locator('.chip-summary')).toHaveText('No pick yet');
  await expect(first.getByRole('radio', { checked: true })).toHaveCount(0);
  await page.keyboard.press('3');
  await expect(first.locator('.chip-summary')).toHaveText('Cowboys −3');
  await page.keyboard.press('-');
  await expect(first.locator('.chip-summary')).toHaveText('Cowboys −2.5');
  // Every chip is still reachable without a pointer: End and Right walk onto the More page (19 chips on the first page, 20 on More: 10.5–20), Home and Left
  // walk back, and nothing is trapped. The − / + keys share the buttons' 0.5 floor and 20 ceiling.
  const summary = first.locator('.chip-summary');
  await page.keyboard.press('End'); await expect(summary).toHaveText('Cowboys −10');
  await page.keyboard.press('ArrowRight'); await expect(summary).toHaveText('Cowboys −10.5');
  await expect(first.getByRole('radio', { name: '−10.5', exact: true })).toBeFocused();
  await expect(first.getByRole('radio')).toHaveCount(20);
  await page.keyboard.press('End'); await expect(summary).toHaveText('Cowboys −20');
  await page.keyboard.press('+'); await expect(summary).toHaveText('Cowboys −20');
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowLeft'); await expect(summary).toHaveText('Cowboys −10');
  await expect(first.getByRole('radio', { name: '−10', exact: true })).toBeFocused();
  // More, − and + keep their 44px targets and pointer behaviour but are no longer Tab stops: one Tab leaves the row for the next game
  // and Shift+Tab comes back to the checked chip.
  const aux = await first.locator('.more-chip, .icon-chip').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { name: node.getAttribute('aria-label') || node.textContent, tabIndex: node.tabIndex, big: r.width >= 44 && r.height >= 44 }; }));
  expect(aux).toEqual([{ name: 'More', tabIndex: -1, big: true }, { name: 'Lower by half a point', tabIndex: -1, big: true }, { name: 'Raise by half a point', tabIndex: -1, big: true }]);
  await page.keyboard.press('Tab');
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: 'Eagles', pressed: 'false' });
  await page.keyboard.press('Shift+Tab');
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: '−10' });
  // Left (or −) stays enabled at the floor; repeated presses do nothing silently.
  for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowLeft');
  const atFloor = await summary.innerText();
  persona.finding({ screen: 'picks', severity: 4, experience: `Holding Left (or the − key and button) stops at "${atFloor}" (floor 0.5) while the live region repeats the same value. Pick'em (0) is reachable only through the middle team chip.`, fix: 'Let the floor step into Pick\'em, or announce the floor once.' });
  // Bigger change #40 (docs/PERSONA_AUDIT_2026_10_09.md): the final opt-out is a text link below the ballot, so the tab order is
  // Save draft, Submit, then "Sit out this week", and the link is not inside the save bar where a mis-press could land on it.
  await persona.tabTo(f => f.name === 'Save draft');
  await page.keyboard.press('Tab');
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: 'Submit Spread' });
  await page.keyboard.press('Tab');
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: 'Sit out this week' });
  await expect(page.locator('.save-bar').getByRole('button', { name: 'Sit out this week' })).toHaveCount(0);
  const sitOutLink = page.locator('.sit-out-row').getByRole('button', { name: 'Sit out this week' });
  await expect(sitOutLink).toHaveClass(/text-button/);
  await expect(page.locator('.sit-out-row')).toHaveText("Not playing Week 5 Spread? Sit out this week · Final: it forfeits this week's Spread score (recorded as sat out, not zero).");
  expect(await sitOutLink.evaluate(el => el.compareDocumentPosition(document.querySelector('.save-bar [data-action="submit"]')) & Node.DOCUMENT_POSITION_PRECEDING)).toBeTruthy();
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: 'Save draft' });
  // Review of PR #34 (2.4.3): the pressed save-bar button goes aria-disabled, not disabled, so focus stays on it while it reads
  // "Saving…" and after the save, when it has nothing left to save. No control in the bar or the opt-out row is natively disabled,
  // "Sit out this week" included: the save request is held for a second so the bar can be inspected mid-flight.
  persona.net.delay = 1000;
  await page.keyboard.press('Enter');
  await expect(page.locator('.save-bar [data-action="draft"]')).toHaveText('Saving…');
  await expect(page.locator('.save-bar button[aria-disabled="true"]')).toHaveCount(2);
  await expect(page.locator('.save-bar button:disabled')).toHaveCount(0);
  await expect(sitOutLink).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.sit-out-row button:disabled')).toHaveCount(0);
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: 'Saving…', disabled: false });
  persona.net.delay = 0;
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
  expect(await persona.smallTargets('groups')).toEqual([]);
  await persona.shot('groups');
  await page.getByRole('button', { name: 'New game', exact: true }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Start a new game' });
  await expect(dialog).toBeVisible();
  // #32: the dialog opens on its first field (Game name), not on the close button; the native <dialog> keeps Tab inside and Escape closes it.
  expect(await persona.focused()).toMatchObject({ tag: 'input', visible: true });
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('game-name');
  // #32: the Duel / Group radios and the practice checkbox stay native 20×20 controls; their press target is the padded label
  // around each, and every label is at least 44px tall and wide.
  expect(await persona.smallTargets('new-game-dialog')).toEqual([]);
  const dialogLabels = await dialog.locator('label:has(input[type=radio]), label:has(input[type=checkbox])').evaluateAll(labels => labels.map(label => { const r = label.getBoundingClientRect(), input = label.querySelector('input').getBoundingClientRect(); return { label: [Math.round(r.width), Math.round(r.height)], control: [Math.round(input.width), Math.round(input.height)], padding: parseFloat(getComputedStyle(label).paddingLeft) }; }));
  expect(dialogLabels).toHaveLength(3);
  for (const { label, control, padding } of dialogLabels) { expect(label[0]).toBeGreaterThanOrEqual(44); expect(label[1]).toBeGreaterThanOrEqual(44); expect(control).toEqual([20, 20]); expect(padding).toBeGreaterThanOrEqual(12); }
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
  // #31: the mode tabs and the sidebar card's "How to play" reach 44px; the dashboard's layout radios and module checkboxes are
  // measured by their labels.
  expect(await persona.smallTargets('game-dashboard')).toEqual([]);
  expect(await page.locator('.mode-tabs button').evaluateAll(tabs => tabs.map(t => Math.round(t.getBoundingClientRect().height)))).toEqual([44, 44]);
  expect(await page.locator('.season-card button').evaluate(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width) >= 44, Math.round(r.height) >= 44]; })).toEqual([true, true]);
  await persona.shot('game-dashboard');
  // Game navigation by keyboard: the sidebar buttons come after the brand and league chip.
  const toPicks = await persona.tabTo(f => f.name === 'My picks');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Trust your read.' })).toBeVisible();
  // Since main 5a96c80 (PR #19) the group ballot uses ChipPicker too, with a "Next game" link per row. Bigger changes (#31): its
  // header opens with the same helper sentence the Community Picks tab shows (ChipPicker's CHIP_HELP), so both surfaces explain
  // the favorite, the points and Pick'em in one wording; the group-only chip mechanics follow it.
  const helper = await page.locator('.ballot-header p').innerText();
  expect(helper.startsWith(communityHelp)).toBe(true);
  expect(helper).toContain('More covers 10.5–20');
  // The group ballot rows carry the same labelled number row and "Your call" line as the Community tab (ChipPicker is shared):
  // choose the home favorite by keyboard and the row label and call line appear, using the team codes this screen passes in.
  const groupPicker = page.locator('.prediction-entry-controls').first();
  await groupPicker.locator('.team-chip').nth(2).focus();
  await page.keyboard.press('Enter');
  await expect(groupPicker.locator('.chip-row-label')).toHaveText('DAL win by…');
  await groupPicker.getByRole('radio', { name: '−3', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(groupPicker.locator('.chip-call')).toHaveText('Your call: DAL by 3');
  await expect(groupPicker.locator('.chip-summary')).toHaveText('DAL −3');
  persona.finding({ screen: 'game-picks', severity: 4, experience: `Inside a group game "My picks" (${toPicks} Tabs from the top) opens the same chip entry as the Community tab, with per-row "Next game" links and the same helper sentence. Good.`, fix: 'Keep it.' });
  // Regression check: at 1024px the matchup column is so narrow that full team names break mid-word.
  const names = await page.locator('.prediction-matchup .team-matchup__name strong').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(), line = parseFloat(getComputedStyle(node).lineHeight) || 20; return { text: node.textContent, width: Math.round(r.width), lines: Math.round(r.height / line) }; }));
  const broken = names.filter(n => n.lines > n.text.split(' ').length + 1);
  if (broken.length) persona.finding({ screen: 'game-picks', severity: 2, wcag: '1.4.10 (reflow)', experience: `Regression on main (chip entry in PredictionEntry): at 1024px the matchup column is ${broken[0].width}px wide and full team names wrap letter by letter ("${broken[0].text}" over ${broken[0].lines} lines; ${broken.length} of ${names.length} names). The row is three times taller than its chips and the kickoff/records lines sit under a column of single syllables.`, fix: 'Give the matchup column a min-width (or use the compact code names at <1200px) and let the chip cell take the remaining width.', evidence: broken.slice(0, 4) });
  // Bigger change #40: on the group ballot too, the final opt-out is a text link below the save bar, never a button beside Save draft.
  // Tabbing from Save draft skips the (incomplete, so disabled) "Review & submit" and lands on the link only after the bar's buttons.
  const sitOut = page.getByRole('button', { name: 'Sit out this week' });
  if (await sitOut.count()) {
    await expect(page.locator('.save-bar').getByRole('button', { name: 'Sit out this week' })).toHaveCount(0);
    await expect(page.locator('.sit-out-row').getByRole('button', { name: 'Sit out this week' })).toHaveClass(/text-button/);
    expect(await sitOut.evaluate(el => el.compareDocumentPosition(document.querySelector('.save-bar .primary')) & Node.DOCUMENT_POSITION_PRECEDING)).toBeTruthy();
    await page.locator('.save-bar').getByRole('button', { name: 'Save draft', exact: true }).focus();
    await page.keyboard.press('Tab');
    expect(await persona.focused()).toMatchObject({ tag: 'button', name: 'Sit out this week' });
  }
  expect(await persona.smallTargets('game-picks')).toEqual([]);
  expect(await page.locator('.mode-tabs button').evaluateAll(tabs => tabs.map(t => Math.round(t.getBoundingClientRect().height)))).toEqual([44, 44, 44]);
  // The group ballot's sticky save bar never hides the row that was just scrolled or focused into view (#24 parity).
  const lastRow = page.locator('.picks-table tbody tr').last();
  await lastRow.evaluate(el => el.scrollIntoView({ block: 'end' }));
  const groupBar = await page.locator('.save-bar').boundingBox();
  expect((await lastRow.boundingBox()).y + (await lastRow.boundingBox()).height).toBeLessThanOrEqual(groupBar.y + 1);
  await persona.shot('game-picks');
  expect(await persona.noOverflow()).toBe(true);
});
