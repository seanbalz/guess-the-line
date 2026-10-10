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
  let presses = 0, missingRing = 0;
  for (const [i, home] of HOME.entries()) {
    const toTeam = await persona.tabTo(f => f.name === home && f.pressed !== null);
    expect(toTeam, `reach ${home}`).toBeGreaterThan(0);
    presses += toTeam;
    const focus = await persona.focused(); if (!focus.ring) missingRing++;
    await page.keyboard.press(i % 2 ? 'Space' : 'Enter'); presses++;
    await expect(cards.nth(i).getByRole('button', { name: home, exact: true })).toHaveAttribute('aria-pressed', 'true');
    const toNumber = await persona.tabTo(f => f.name === '−3');
    expect(toNumber, `reach −3 for ${home}`).toBeGreaterThan(0);
    presses += toNumber;
    await page.keyboard.press('Enter'); presses++;
    await expect(cards.nth(i).locator('.chip-summary')).toHaveText(`${home} −3`);
  }
  await expect(page.locator('.save-bar strong')).toHaveText('14/14 ready');
  const toSubmit = await persona.tabTo(f => f.name.startsWith('Submit'));
  presses += toSubmit;
  persona.finding({ screen: 'picks', severity: 2, experience: `Finishing 14 spread picks with the keyboard took ${presses} key presses (Tab, Enter or Space). After each team choice the tab stops run through all 20 number chips, More, − and + before the next game's team chips, so reaching "−3" on game 2 costs a dozen presses and reaching the Submit button another ${toSubmit}. Every chip is a separate tab stop; there is no arrow-key movement inside a chip row and no "next game" shortcut.`, fix: 'Make each chip row a radiogroup with roving tabindex (one tab stop per row, arrows move within), and give the row a numeric type-ahead: typing "3" selects −3.' });
  persona.finding({ screen: 'picks', severity: missingRing ? 2 : 4, wcag: '2.4.7', experience: missingRing ? `${missingRing} of 14 focused team chips painted no focus ring.` : 'Every focused chip shows the 2px cyan focus ring (outline-offset 4px); Enter and Space both toggle a chip. Good.', fix: missingRing ? 'Ensure :focus-visible is not overridden on .chip.' : 'Keep it.' });
  await persona.shot('picks-complete');

  // Mouse/touch tap budget: 2 taps per game plus Submit = 29; the More chip adds one for lines over 10.
  persona.finding({ screen: 'picks', severity: 3, experience: 'With a pointer the minimum is 29 taps for a spread ballot (team + number per game, then Submit) and 15 for a total ballot; a line over 10 needs the More chip first (3 taps). Fourteen tall cards mean roughly six screens of scrolling at 1280×900; there is no compact or table view for a player who already knows their numbers.', fix: 'Offer a dense "grid" layout at ≥1024px: one row per game with team toggle and an inline number stepper, and remember the last used layout.' });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  persona.finding({ screen: 'picks-complete', severity: 4, experience: `The completed ballot page is ${height}px tall at 1280px wide; the cards stack in one column and use roughly half the width.`, fix: 'Use a two-column card grid at ≥960px.', evidence: { height } });

  // Submit and read the confirmation.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Spread picks submitted.' })).toBeVisible();
  // Bigger change (#25): one receipt takes focus after the submit (2.4.3). Its heading names the market and the count; it shows the
  // submission time in PT, what is still due with a button that opens it, the feed reveal for Spread only (D-23) and Edit picks
  // (edits stay open until the deadline, D-16). The save bar's status line above stays as the live-region announcement.
  const receipt = page.getByRole('region', { name: 'Spread submitted · 14 picks' });
  await expect(receipt).toBeVisible();
  expect(await receipt.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await expect(receipt.getByRole('heading', { level: 3 })).toHaveText('Spread submitted · 14 picks');
  await expect(receipt).toContainText(/Submitted \w{3} \d{1,2}, \d{1,2}:\d{2} [AP]M PT/);
  await expect(receipt).toContainText('Total: 0/14 still due');
  await expect(receipt.getByRole('button', { name: 'Make Total picks' })).toBeVisible();
  await expect(receipt.getByRole('button', { name: "See everyone's Spread picks" })).toBeVisible();
  await expect(receipt.getByRole('button', { name: "See everyone's Total picks" })).toHaveCount(0);
  await expect(receipt.getByRole('button', { name: 'Edit picks' })).toBeVisible();
  await persona.shot('submitted');
  await persona.axe('submitted');
  // "See everyone's Spread picks" lands on the feed's first Spread post, where the picks are revealed; Total posts stay hidden.
  await receipt.getByRole('button', { name: "See everyone's Spread picks" }).focus(); await page.keyboard.press('Enter');
  const spreadPost = page.locator('.feed-post').filter({ hasText: 'Ben Fixture submitted Week 5 Spread picks.' });
  await expect(spreadPost).toBeVisible();
  expect(await spreadPost.evaluate(el => el === document.activeElement)).toBe(true);
  await expect(spreadPost.locator('.post-picks')).toContainText('Cowboys −3');
  await persona.shot('feed-revealed');
  // Back on Picks the first market still due (Total) opens; the submitted market keeps its receipt as its status, without a focus move.
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: /^Picks/ }).focus(); await page.keyboard.press('Enter');
  await expect(cards.first().locator('.number-chip').first()).toBeVisible();
  await expect(page.locator('.submit-receipt')).toHaveCount(0);
  const spreadTab = page.getByRole('group', { name: 'Market' }).getByRole('button', { name: 'Spread ✓' });
  await spreadTab.focus(); await page.keyboard.press('Enter');
  await expect(receipt).toBeVisible();
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: 'Spread ✓' });
  // Edit picks lands on the first chip; the receipt stays, because the submitted picks stand until a full ballot is saved.
  await receipt.getByRole('button', { name: 'Edit picks' }).focus(); await page.keyboard.press('Enter');
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: 'Buccaneers', pressed: 'false' });
  await expect(receipt).toBeVisible();
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
  await cards.first().getByRole('button', { name: '−3', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(hint).toBeEmpty();
  // A real edit (−3 → −3.5) saved with "Save changes" is a new submit of the full ballot (D-16: the changed pick gets a new reference
  // at save time; the original submission time is kept). The receipt takes focus again and adds the change time to it.
  await expect(receipt).not.toContainText('changed');
  await cards.first().getByRole('button', { name: '−3.5', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(cards.first().locator('.chip-summary')).toHaveText('Cowboys −3.5');
  await saveChanges.focus(); await page.keyboard.press('Enter');
  await expect(receipt).toContainText(/ · changed \w{3} \d{1,2}, \d{1,2}:\d{2} [AP]M PT\./);
  expect(persona.net.requests.filter(r => r.endpoint === 'personal/ballot').length).toBe(ballotRequests + 1);
  expect(await receipt.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await expect(receipt.getByRole('heading', { level: 3 })).toHaveText('Spread submitted · 14 picks');
  await expect(cards.first().locator('.chip-summary')).toHaveText('Cowboys −3.5');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await totalTab.focus(); await page.keyboard.press('Enter');
  await expect(totalTab).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.first().locator('.number-chip').first()).toBeVisible();
  // No receipt on a market that is not submitted.
  await expect(page.locator('.submit-receipt')).toHaveCount(0);
  // Keyboard on total chips: eleven chips plus −/+; no arrows.
  const toFirstTotal = await persona.tabTo(f => f.name === '44');
  persona.finding({ screen: 'picks-total', severity: 3, experience: `On the Total ballot it takes ${toFirstTotal} Tab presses to reach the first game's "44" chip; the − / + buttons step by 0.5 only, so moving from 44 to 51.5 is either a More-less chip tap (49 max) plus five presses on +, or two chip taps. Typing a number is not possible.`, fix: 'Allow typing on the focused chip row and widen the total range per matchup.' });
  expect(await persona.noOverflow()).toBe(true);
});
