// Persona (c): power user at 1280px who wants speed. Keyboard only: tab order through chips,
// Enter/Space, focus visibility, and how many taps or key presses it takes to finish 14 games.
import { test, expect, pgliteAvailable } from './harness.mjs';

test.use({ viewport: { width: 1280, height: 900 } });

const HOME = ['Cowboys', 'Jaguars', 'Packers', 'Dolphins', 'Jets', 'Titans', 'Steelers', 'Patriots', 'Saints', 'Commanders', 'Chargers', 'Cardinals', 'Seahawks', 'Falcons'];

test('power user: keyboard-only ballot, tab counts, focus visibility and tap budget', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start();
  await page.goto('/');
  // Keyboard sign-in.
  const toEmail = await persona.tabTo(f => f.tag === 'input' && f.name === '');
  await page.keyboard.type('ben@example.test');
  await page.keyboard.press('Tab'); await page.keyboard.type('test-password'); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  persona.finding({ screen: 'sign-in', severity: 4, experience: `${toEmail} Tab presses reach the email field (theme select, Sign in tab and Create account tab come first). Enter submits the form, which is right.`, fix: 'Autofocus the email field on the sign-in screen.' });
  await persona.shot('feed');
  await persona.axe('feed');

  // How far is "Make picks" by keyboard from the top of the home screen?
  const toMakePicks = await persona.tabTo(f => f.name === 'Make picks');
  // Quick win 11 (#17): Appearance moved to the foot of the page, so the skip link, six league chips and three tabs are all that precede the card.
  expect(toMakePicks).toBeLessThanOrEqual(11);
  persona.finding({ screen: 'feed', severity: 3, experience: `From page load it takes ${toMakePicks} Tab presses to reach "Make picks" (skip link, six league chips, three tabs, then the card). The skip link now lands on the picks-due card, but tabbing from the top still crosses the league switcher.`, fix: 'Collapse the league switcher to "NFL · Live · More leagues" while only NFL is live.' });
  await page.keyboard.press('Enter');
  const cards = page.locator('.week-pick');
  await expect(cards.first()).toBeVisible();
  await persona.shot('picks');
  await persona.axe('picks');

  // Complete all 14 spread picks with the keyboard only, counting presses.
  // Bigger change (#9): each chip row is one Tab stop. The team row keeps its toggle buttons (arrows move, Enter or Space
  // chooses); the number row is a radiogroup where arrows select the next half point and a typed digit jumps straight to that
  // number. More, − and + are pointer targets whose functions live on the row's keys, so they no longer cost a Tab each between
  // games: one Tab leaves a finished number row on the next game's team row.
  let presses = 0, missingRing = 0;
  for (const [i, home] of HOME.entries()) {
    const away = await cards.nth(i).locator('.team-chip').first().innerText();
    const toRow = await persona.tabTo(f => f.name === away && f.pressed === 'false');
    expect(toRow, `reach ${away}`).toBeGreaterThan(0);
    if (i) expect(toRow, `one Tab from the previous game's number row to ${away}`).toBe(1);
    presses += toRow;
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); presses += 2;
    const focus = await persona.focused();
    expect(focus).toMatchObject({ tag: 'button', name: home, pressed: 'false' });
    if (!focus.ring) missingRing++;
    await page.keyboard.press(i % 2 ? 'Space' : 'Enter'); presses++;
    await expect(cards.nth(i).getByRole('button', { name: home, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Tab'); presses++;
    expect(await persona.focused(), `the number row of ${home} is the next stop`).toMatchObject({ tag: 'button', name: '−1' });
    await page.keyboard.press('3'); presses++;
    await expect(cards.nth(i).getByRole('radio', { name: '−3', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(cards.nth(i).locator('.chip-summary')).toHaveText(`${home} −3`);
  }
  await expect(page.locator('.save-bar strong')).toHaveText('14/14 ready');
  const toSubmit = await persona.tabTo(f => f.name.startsWith('Submit'));
  presses += toSubmit;
  // The audit measured 382 presses with every chip a tab stop; six per game plus the save bar now.
  expect(toSubmit).toBeLessThanOrEqual(3);
  expect(presses).toBeLessThanOrEqual(100);
  console.log(`power: 14-game spread ballot in ${presses} key presses (${toSubmit} to Submit)`);
  persona.finding({ screen: 'picks', severity: missingRing ? 2 : 4, wcag: '2.4.7', experience: missingRing ? `${missingRing} of 14 focused team chips painted no focus ring.` : 'Every focused chip shows the 2px cyan focus ring (outline-offset 4px); Enter and Space both toggle a chip. Good.', fix: missingRing ? 'Ensure :focus-visible is not overridden on .chip.' : 'Keep it.' });
  await persona.shot('picks-complete');

  // Mouse/touch tap budget: 2 taps per game plus Submit = 29; the More chip adds one for lines over 10.
  persona.finding({ screen: 'picks', severity: 3, experience: 'With a pointer the minimum is 29 taps for a spread ballot (team + number per game, then Submit) and 15 for a total ballot; a line over 10 needs the More chip first (3 taps). Fourteen tall cards mean roughly six screens of scrolling at 1280×900; there is no compact or table view for a player who already knows their numbers.', fix: 'Offer a dense "grid" layout at ≥1024px: one row per game with team toggle and an inline number stepper, and remember the last used layout.' });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  persona.finding({ screen: 'picks-complete', severity: 4, experience: `The completed ballot page is ${height}px tall at 1280px wide; the cards stack in one column and use roughly half the width.`, fix: 'Use a two-column card grid at ≥960px.', evidence: { height } });

  // Submit and read the confirmation.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Spread picks submitted.' })).toBeVisible();
  await persona.shot('submitted');
  const submittedFocus = await persona.focused();
  // Review of PR #34 (2.4.3): the pressed button stays focused through the submit; it now reads "Save changes" with nothing to save.
  expect(submittedFocus).toMatchObject({ tag: 'button', name: 'Save changes' });
  persona.finding({ screen: 'submitted', severity: 3, experience: `After submitting, focus is on "${submittedFocus.name || submittedFocus.tag}" and the only confirmation is the one-line status "Spread picks submitted." at the top of the list. Nothing says what was captured (14 picks, time, scoring reference), how to see opponents' picks, or that the Total ballot is still due.`, fix: 'Show a receipt panel after submit: picks count, saved time, "Total still due", and buttons "Make Total picks" / "See everyone\'s Spread picks".' });
  // The Total tab is still owed; is that clear from the picks screen?
  const header = await page.locator('.week-picks > p.muted').innerText();
  expect(header).toContain('Submitted, editable until the deadline');
  // Review of PR #34: on a submitted ballot an edit that leaves a game empty (Pick'em, then a team) cannot be saved, because the
  // server needs a complete ballot. "Save changes" and the Total market button both explain instead of posting a partial ballot
  // that would fail with a 400; the hint is the live region that describes the primary button.
  await cards.first().getByRole('button', { name: "Pick'em", exact: true }).focus(); await page.keyboard.press('Enter');
  await cards.first().getByRole('button', { name: 'Cowboys', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(cards.first().locator('.chip-summary')).toHaveText('No pick yet');
  const ballotRequests = persona.net.requests.filter(r => r.endpoint === 'personal/ballot').length;
  const saveChanges = page.getByRole('button', { name: 'Save changes' });
  await expect(saveChanges).toBeEnabled();
  await saveChanges.focus(); await page.keyboard.press('Enter');
  const hint = page.locator('.save-bar .save-hint');
  await expect(hint).toHaveText('Pick the remaining 1 game to save your Spread changes. Your submitted Spread picks stay as they were until you do.');
  expect(await saveChanges.getAttribute('aria-describedby')).toBe(await hint.getAttribute('id'));
  const market = page.getByRole('group', { name: 'Market' }), totalTab = market.getByRole('button', { name: 'Total' });
  await totalTab.focus(); await page.keyboard.press('Enter');
  await expect(hint).toHaveText('Pick the remaining 1 game to save your Spread changes before switching to Total. Your submitted Spread picks stay as they were until you do.');
  await expect(market.getByRole('button', { name: 'Spread ✓' })).toHaveAttribute('aria-pressed', 'true');
  expect(persona.net.requests.filter(r => r.endpoint === 'personal/ballot').length).toBe(ballotRequests);
  await expect(page.getByRole('alert')).toHaveCount(0);
  // Restoring the game clears the hint; the ballot then matches what was submitted, so the switch needs no save.
  const minus3 = cards.first().getByRole('radio', { name: '−3', exact: true }), summary = cards.first().locator('.chip-summary');
  await minus3.focus(); await page.keyboard.press('Enter');
  await expect(minus3).toHaveAttribute('aria-checked', 'true');
  await expect(hint).toBeEmpty();
  // Keys on a spread row (#9): arrows step half a point and move focus with the check; "12" typed quickly lands on the More page
  // (the More chip reads "1–10" there), Home and End walk the page shown, Left at −10.5 returns to the first page, and "=" opens a
  // typed field that produces the same signed value as the chips and hands focus back to the checked chip.
  await page.keyboard.press('ArrowRight'); await expect(summary).toHaveText('Cowboys −3.5');
  await expect(cards.first().getByRole('radio', { name: '−3.5', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await expect(summary).toHaveText('Cowboys −3');
  await page.keyboard.press('1'); await page.keyboard.press('2'); await expect(summary).toHaveText('Cowboys −12');
  await expect(cards.first().getByRole('button', { name: '1–10', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(cards.first().getByRole('radio', { name: '−12', exact: true })).toBeFocused();
  await page.keyboard.press('End'); await expect(summary).toHaveText('Cowboys −20');
  await page.keyboard.press('Home'); await expect(summary).toHaveText('Cowboys −10.5');
  await page.keyboard.press('ArrowLeft'); await expect(summary).toHaveText('Cowboys −10');
  await expect(cards.first().getByRole('button', { name: 'More', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Home'); await expect(summary).toHaveText('Cowboys −1');
  await page.keyboard.press('=');
  const typed = cards.first().getByRole('textbox', { name: 'Cowboys win by (type a number)' });
  await expect(typed).toBeFocused();
  await page.keyboard.type('3'); await page.keyboard.press('Enter');
  await expect(typed).toHaveCount(0);
  await expect(summary).toHaveText('Cowboys −3');
  await expect(minus3).toHaveAttribute('aria-checked', 'true');
  await expect(minus3).toBeFocused();
  await expect(hint).toBeEmpty();
  await totalTab.focus(); await page.keyboard.press('Enter');
  await expect(totalTab).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.first().locator('.number-chip').first()).toBeVisible();

  // Bigger change (#23): a Total ballot by keyboard. One Tab per game lands on the row's first chip. A single digit picks the total
  // ending in that digit nearest the current pick (from the 44 centre, 7 gives 47), two quick digits set an exact total, and "="
  // opens the typed field for a half point (no chip is checked at 44.5; the live summary carries the value).
  let totalPresses = 0;
  for (let i = 0; i < HOME.length; i++) {
    const row = cards.nth(i), total = row.locator('.chip-summary');
    const toRow = await persona.tabTo(f => f.tag === 'button' && f.name === '39');
    expect(toRow, `reach the total row of ${HOME[i]}`).toBeGreaterThan(0);
    if (i) expect(toRow).toBe(1);
    totalPresses += toRow;
    if (i === 0) {
      await page.keyboard.press('5'); await page.keyboard.press('1'); totalPresses += 2;
      await expect(total).toHaveText('51 total points');
      await expect(row.getByRole('radio', { name: '51', exact: true })).toHaveAttribute('aria-checked', 'true');
      await expect(row.getByRole('radio', { name: '51', exact: true })).toBeFocused();
    } else if (i === 1) {
      await page.keyboard.press('='); await page.keyboard.type('44.5'); await page.keyboard.press('Enter'); totalPresses += 6;
      await expect(total).toHaveText('44.5 total points');
      await expect(row.getByRole('radio', { checked: true })).toHaveCount(0);
      await expect(row.getByRole('radio', { name: '44', exact: true })).toBeFocused(); // the Tab stop is the nearest chip, the lower one on a tie
    } else {
      await page.keyboard.press('7'); totalPresses++;
      await expect(total).toHaveText('47 total points');
      await expect(row.getByRole('radio', { name: '47', exact: true })).toHaveAttribute('aria-checked', 'true');
    }
  }
  await expect(page.locator('.save-bar strong')).toHaveText('14/14 ready');
  const toSubmitTotal = await persona.tabTo(f => f.name.startsWith('Submit'));
  totalPresses += toSubmitTotal;
  expect(toSubmitTotal).toBeLessThanOrEqual(3);
  expect(totalPresses).toBeLessThanOrEqual(60);
  console.log(`power: 14-game Total ballot in ${totalPresses} key presses (${toSubmitTotal} to Submit)`);
  expect(await persona.noOverflow()).toBe(true);
});
