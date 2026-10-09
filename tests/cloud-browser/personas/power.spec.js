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
  persona.finding({ screen: 'feed', severity: 3, experience: `From page load it takes ${toMakePicks} Tab presses to reach "Make picks" (skip link, theme select, six league chips, three tabs, then the card). The skip link jumps to <main>, which still starts with the theme select and league switcher.`, fix: 'Point the skip link at the picks-due card or tab list, and move the league switcher below the primary action.' });
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
    await expect(cards.nth(i).locator('output')).toHaveText(`${home} −3`);
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
  await persona.shot('submitted');
  const submittedFocus = await persona.focused();
  persona.finding({ screen: 'submitted', severity: 3, experience: `After submitting, focus is on "${submittedFocus.name || submittedFocus.tag}" and the only confirmation is the one-line status "Spread picks submitted." at the top of the list. Nothing says what was captured (14 picks, time, scoring reference), how to see opponents' picks, or that the Total ballot is still due.`, fix: 'Show a receipt panel after submit: picks count, saved time, "Total still due", and buttons "Make Total picks" / "See everyone\'s Spread picks".' });
  // The Total tab is still owed; is that clear from the picks screen?
  const header = await page.locator('.week-picks > p.muted').innerText();
  expect(header).toContain('Submitted, editable until the deadline');
  await page.getByRole('group', { name: 'Market' }).getByRole('button', { name: 'Total' }).click();
  await expect(cards.first().locator('.number-chip').first()).toBeVisible();
  // Keyboard on total chips: eleven chips plus −/+; no arrows.
  const toFirstTotal = await persona.tabTo(f => f.name === '44');
  persona.finding({ screen: 'picks-total', severity: 3, experience: `On the Total ballot it takes ${toFirstTotal} Tab presses to reach the first game's "44" chip; the − / + buttons step by 0.5 only, so moving from 44 to 51.5 is either a More-less chip tap (49 max) plus five presses on +, or two chip taps. Typing a number is not possible.`, fix: 'Allow typing on the focused chip row and widen the total range per matchup.' });
  expect(await persona.noOverflow()).toBe(true);
});
