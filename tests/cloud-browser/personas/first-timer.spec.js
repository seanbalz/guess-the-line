// Persona (a): first-time player who has never made a spread pick. Reads the Picks tab cold.
// Questions: is it clear what −3 means, which team, what "total" means, what is due and when?
import { test, expect, pgliteAvailable } from './harness.mjs';

test.use({ viewport: { width: 390, height: 844 } });

test('first-timer: sign in, name prompt, feed, and the Picks tab read cold', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  // No display name yet: the account is brand new.
  await persona.start({ profile: false });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your games. Any device.' })).toBeVisible();
  await persona.shot('sign-in');
  await persona.axe('sign-in');
  // Bigger change: onboarding step (#33). One line under the heading says what the game is, in the brand voice, within 20 words.
  const pitch = page.locator('.auth-card .auth-pitch');
  await expect(pitch).toHaveText('Guess every NFL game’s spread and total each week. Closest to the number scores. No real-money wagers.');
  expect((await pitch.innerText()).trim().split(/\s+/).length).toBeLessThanOrEqual(20);
  expect((await pitch.boundingBox()).y).toBeGreaterThan((await page.getByRole('heading', { name: 'Your games. Any device.' }).boundingBox()).y);
  // The pitch stays on the create-account screen, where a newcomer most needs it, and leaves the password screens alone.
  await page.locator('.auth-tabs').getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('.auth-card .auth-pitch')).toHaveCount(1);
  await page.locator('.auth-tabs').getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.locator('.auth-card .auth-pitch')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to sign in' }).click();

  // Review of the onboarding step: the neutral shell that waits for the lobby has a heading, so the error state that persists until
  // Try again is not a page without a title; the My games chrome still never paints before the lobby answers.
  persona.net.fail = endpoint => endpoint === 'lobby' ? { status: 500, body: { error: 'Something went wrong.' } } : null;
  await persona.signIn();
  await expect(page.getByRole('heading', { name: 'Your games', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Something went wrong.');
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toHaveCount(0);
  persona.net.fail = null;
  await page.getByRole('button', { name: 'Try again' }).click();
  // Bigger change: onboarding step (#29). The name prompt is the whole screen: no My games page behind it, no greyed-out buttons,
  // no promo cards, and the step's heading takes focus so a screen reader hears the one required step (2.4.3).
  const nameStep = page.getByRole('heading', { name: 'First, what should we call you?' });
  await expect(nameStep).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toHaveCount(0);
  await expect(page.locator('.hub-heading, .invitation-card, .hub-empty, .hub-games, .theme-selector')).toHaveCount(0);
  await expect(page.locator('main').getByRole('button')).toHaveText(['Save display name']);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  expect(await persona.focused()).toMatchObject({ tag: 'h1', name: 'First, what should we call you?' });
  await persona.shot('display-name');
  await persona.axe('display-name');
  // Review of the onboarding step: the shell's main carries tabIndex -1 (as the Community home does, #18), so "Skip to main content"
  // moves focus onto main instead of dropping it on body.
  await page.locator('.skip-link').focus();
  expect(await persona.focused()).toMatchObject({ tag: 'a', name: 'Skip to main content' });
  await page.keyboard.press('Enter');
  expect(await persona.focused()).toMatchObject({ tag: 'main' });
  // The fragment jump scrolled main under the header; back to the top so the save below starts from scrollY 0.
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByLabel('Your display name').fill('Ben Fixture');
  await page.getByRole('button', { name: 'Save display name' }).click();
  // Saving lands on the Community home with the confirmation visible (role=status) and focus on main, not on <body>.
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  const welcome = page.locator('.community-home > .hub-main > .auth-notice');
  await expect(welcome).toHaveText('Your display name has been saved. Playing as Ben Fixture.');
  await expect(page.getByRole('status').filter({ hasText: 'Your display name has been saved. Playing as Ben Fixture.' })).toBeVisible();
  // PR #34 pattern: the status is an always-mounted live region whose text changes, not a node inserted with its text.
  await expect(welcome).toHaveAttribute('aria-live', 'polite');
  expect((await persona.focused()).tag).toBe('main');
  // Focus arrives without scrolling: the brand and the player's name stay in view above the notice.
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await persona.shot('after-name');
  await expect(page.locator('.picks-due')).toBeVisible();
  // Review of the onboarding step: the welcome fires once. A later edit from Groups & games keeps its plain notice on My games, and
  // "← Community" brings the player back with the live region empty and no focus jump.
  await page.getByRole('button', { name: /Groups & games/ }).click();
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit display name' }).click();
  await page.getByLabel('Your display name').fill('Ben Edited');
  await page.getByRole('button', { name: 'Save display name' }).click();
  await expect(page.getByRole('status').filter({ hasText: /display name/ })).toHaveText(['Your display name has been saved.']);
  await page.getByRole('button', { name: '← Community' }).click();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await expect(page.locator('.hub-account')).toContainText('Ben Edited');
  await expect(page.locator('.picks-due')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /display name/ })).toHaveCount(0);
  await expect(welcome).toHaveCount(1);
  await expect(welcome).toBeEmpty();
  expect((await persona.focused()).tag).toBe('body');
  await persona.shot('feed');
  await persona.axe('feed');
  await persona.smallText('feed');
  await persona.smallTargets('feed');
  const due = await page.locator('.picks-due').innerText();
  persona.finding({ screen: 'feed', severity: 4, experience: `The picks-due card reads "${due.replace(/\n/g, ' / ')}". "Spread 0/14 · Total 0/14" is counts without a noun; a newcomer does not know that Spread and Total are two separate ballots that both must be finished.`, fix: 'Say "2 ballots due: Spread (0 of 14 games) and Total (0 of 14 games)".' });
  // Quick win 11 (#17): Appearance sits with the account controls at the foot of the page, below the title and the picks-due card.
  const theme = await page.locator('.theme-selector').boundingBox();
  const title = await page.getByRole('heading', { name: 'Community', exact: true }).boundingBox();
  const dueBox = await page.locator('.picks-due').boundingBox();
  expect(theme.y).toBeGreaterThan(title.y);
  expect(theme.y).toBeGreaterThan(dueBox.y);
  await expect(page.locator('.hub-main > *').first()).toHaveClass(/hub-heading/);
  const switcher = await page.getByRole('group', { name: 'League' }).boundingBox();
  const tabs = await page.getByRole('navigation', { name: 'Community sections' }).boundingBox();
  if (switcher && tabs && switcher.y < tabs.y) persona.finding({ screen: 'feed', severity: 3, experience: 'The first thing under the page title is a six-button league switcher (NFL Live, NBA Coming soon, …) that occupies two rows at 390px before the Feed/Picks tabs and before the picks-due card. Five of the six buttons do nothing useful yet.', fix: 'Move the league switcher below the picks-due card or collapse it to a single "NFL · Live" chip with a "More leagues" link while only NFL is live.' });

  // Picks tab, read cold.
  await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).click();
  await expect(page.locator('.week-pick').first()).toBeVisible();
  await persona.shot('picks-cold');
  await persona.axe('picks-cold');
  await persona.smallText('picks-cold');
  await persona.smallTargets('picks-cold');
  // Quick win 2 (#4): one helper line per market explains the favorite, the points and Pick'em; it can be dismissed.
  const help = page.locator('.chip-help');
  await expect(help).toContainText('Tap the team you think wins (the favorite), then how many points they win by.');
  await expect(help).toContainText('Pick’em means an even game with no favorite.');
  await expect(help.getByRole('button', { name: 'Got it, hide this tip' })).toBeVisible();
  const picksText = await page.locator('.week-picks').innerText();
  expect(/favorite|favou?red|points? better|home team|what is a spread|how to/i.test(picksText)).toBe(true);
  expect(/toss-?up|even|no favorite/i.test(picksText)).toBe(true);
  const truncated = await page.locator('.team-chip').evaluateAll(chips => chips.filter(chip => chip.scrollWidth > chip.clientWidth).map(chip => chip.textContent));
  const fitsBefore = new Set(await page.locator('.team-chip').evaluateAll(chips => chips.filter(chip => chip.scrollWidth <= chip.clientWidth).map(chip => chip.textContent)));
  if (truncated.length) persona.finding({ screen: 'picks-cold', severity: 3, wcag: '1.4.10 (reflow)', experience: `Team chips clip long names with an ellipsis at 390px: ${truncated.join(', ')} ("Command…"). The chip is the control that picks the favorite, so the name a player taps is cut off.`, fix: 'Use the team abbreviation plus nickname only when it fits (e.g. "WAS" / "Commanders" on two lines), or let the chip wrap to two lines.', evidence: truncated });
  const first = page.locator('.week-pick').first();
  await first.getByRole('button', { name: 'Cowboys', exact: true }).click();
  await persona.shot('picks-team-chosen');
  const chips = await first.locator('.number-chip').allInnerTexts();
  expect(chips[0]).toBe('−1');
  // The chips keep the sportsbook sign (the favorite gives points); the row label says what it means in plain words.
  await expect(first.locator('.chip-row-label')).toHaveText('Cowboys win by…');
  await expect(first.getByRole('group', { name: 'Cowboys win by' })).toBeVisible();
  await first.getByRole('button', { name: '−3', exact: true }).click();
  // Quick win 2 (#22): the headline confirms the call in plain words; the signed mono token stays as the secondary line.
  await expect(first.locator('.chip-call')).toHaveText('Your call: Cowboys by 3');
  const summary = await first.locator('.chip-summary').innerText();
  expect(summary).toBe('Cowboys −3');
  await expect(first.locator('.number-chip.selected')).toHaveText('−3');
  await expect(first.locator('.number-chip.selected svg')).toHaveCount(1);
  // Pick'em reads as an even game in the call line.
  await page.locator('.week-pick').nth(1).getByRole('button', { name: "Pick'em", exact: true }).click();
  await expect(page.locator('.week-pick').nth(1).locator('.chip-call')).toHaveText("Your call: Even (pick'em)");
  // Review of PR #34 (D-21): the check icon sits outside the name's text flow, so choosing a team never clips a name that fit before.
  // Chargers, Cardinals and Seahawks are the longest names that fit at 390px; a team chip alone does not change the ballot.
  for (const [i, home] of [[10, 'Chargers'], [11, 'Cardinals'], [12, 'Seahawks']]) await page.locator('.week-pick').nth(i).getByRole('button', { name: home, exact: true }).click();
  const clippedOnSelect = await page.locator('.team-chip.selected').evaluateAll(chips => chips.filter(chip => chip.scrollWidth > chip.clientWidth).map(chip => chip.textContent));
  expect(clippedOnSelect.filter(name => fitsBefore.has(name))).toEqual([]);
  expect(clippedOnSelect).not.toContain('Cowboys');
  // Team facts line under the matchup
  const facts = await first.locator('.team-facts').innerText();
  persona.finding({ screen: 'picks-cold', severity: 4, experience: `Each card shows "${facts.replace(/\n/g, ' | ')}". The record line is dense mono text; "road"/"home" splits read as code to a first-timer.`, fix: 'Format as two short lines: "Buccaneers 3–1 overall · 1–1 away" and "Cowboys 2–2 overall · 1–1 at home".' });

  // Quick win 3 (#5): with unsaved spread picks the Total market stays enabled; switching saves the draft first.
  const totalTab = page.getByRole('group', { name: 'Market' }).getByRole('button', { name: 'Total' });
  await expect(totalTab).toBeEnabled();
  await totalTab.click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved. Now showing Total.' })).toBeVisible();
  await expect(totalTab).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.week-pick').first().locator('.number-chip').first()).toBeVisible();
  expect(persona.net.requests.filter(r => r.endpoint === 'personal/ballot').map(r => r.body.picks)).toEqual([{ 'TB-DAL': -3, 'PHI-JAX': 0 }]);
  await persona.shot('picks-total');
  await persona.axe('picks-total');
  await expect(page.locator('.chip-help')).toContainText('Total = both teams’ points combined.');
  const totalText = await page.locator('.week-picks').innerText();
  expect(/combined|both teams|points scored/i.test(totalText)).toBe(true);
  await expect(page.locator('.week-pick').first().locator('.chip-row-label')).toHaveText('Combined points');
  const totalChips = await page.locator('.week-pick').first().locator('.number-chip').allInnerTexts();
  // Regression guard. Before main 5a96c80, switching from a saved spread draft (Cowboys −3) to Total left eight
  // stale "0" chips in front of 39–49 on that game (duplicate React keys from Math.max(0, center − 5 + i)).
  // ChipPicker now shifts the window instead of clamping, so the keys stay distinct and the row reconciles.
  const zeros = totalChips.filter(chip => chip === '0').length;
  expect(zeros).toBe(0);
  expect(totalChips).toEqual(['39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49']);
  persona.finding({ screen: 'picks-total', severity: 3, experience: `The Total chips (${totalChips[0]}–${totalChips.at(-1)}) are whole numbers centered on 44 for every game regardless of matchup, so a newcomer has no idea whether 44 is high or low for this game.`, fix: 'Center the chips on the matchup\'s typical total (last season average or a neutral 45) and show the chosen value in the summary line as "Over/under 44 points".' });
  await page.locator('.week-pick').first().getByRole('button', { name: '44', exact: true }).click();
  await expect(page.locator('.week-pick').first().locator('.chip-summary')).toHaveText('44 total points');
  await expect(page.locator('.week-pick').first().locator('.chip-call')).toHaveText('Your call: 44 combined points');

  // What is due and when?
  const status = await page.locator('.week-picks > p.muted').innerText();
  expect(status).toContain('Due');
  persona.finding({ screen: 'picks-total', severity: 3, experience: `The due line says "${status}". It is grey 14px text above the list. There is no time zone explanation beyond "PT", no day name, and no countdown.`, fix: 'Show "Due Thursday 5:15 PM PT (in 2 days)" in the sticky save bar as well as the header.' });
  // Quick win 4 (#6): Submit stays enabled with one of fourteen picked and explains what is missing instead of saving.
  const submit = page.getByRole('button', { name: 'Submit Total' });
  await expect(submit).toBeEnabled();
  // Review of PR #34: the hint is an always-mounted live region (empty until needed) that describes the Submit button, so the
  // explanation is announced as a change rather than inserted with its text.
  const hint = page.locator('.save-bar .save-hint');
  await expect(hint).toHaveCount(1);
  await expect(hint).toBeEmpty();
  await expect(hint).toHaveAttribute('aria-live', 'polite');
  expect(await submit.getAttribute('aria-describedby')).toBe(await hint.getAttribute('id'));
  const ballotRequests = persona.net.requests.filter(r => r.endpoint === 'personal/ballot').length;
  await submit.click();
  await expect(hint).toHaveText('Pick the remaining 13 games to submit Total. Save draft keeps the 1 you have.');
  expect(persona.net.requests.filter(r => r.endpoint === 'personal/ballot').length).toBe(ballotRequests);
  // Can the newcomer get back to the feed? There is no back control inside the picks view other than the tab bar at the top.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const tabsVisible = await page.getByRole('navigation', { name: 'Community sections' }).evaluate(el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
  if (!tabsVisible) persona.finding({ screen: 'picks-total', severity: 3, experience: 'At the bottom of fourteen cards the only navigation is the sticky save bar; the Feed/Picks tabs are off-screen at the top. There is no "Back to feed" or header on the picks screen.', fix: 'Make the Feed/Picks tab bar sticky or add a compact back link to the sticky save bar.' });
  await persona.shot('picks-bottom');
  // The helper can be dismissed and stays dismissed on this device. "Got it" removes its own container, so focus moves to the first chip.
  await page.getByRole('button', { name: 'Got it, hide this tip' }).click();
  await expect(page.locator('.chip-help')).toHaveCount(0);
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: '39' });
  // Review of PR #34 (#4): dismissal is per market. Hiding the Total tip leaves the Spread tip in place, and each market remembers its own choice.
  const market = page.getByRole('group', { name: 'Market' });
  await market.getByRole('button', { name: 'Spread' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved. Now showing Spread.' })).toBeVisible();
  await expect(page.locator('.chip-help')).toContainText('Tap the team you think wins (the favorite)');
  await page.getByRole('button', { name: 'Got it, hide this tip' }).click();
  await expect(page.locator('.chip-help')).toHaveCount(0);
  await market.getByRole('button', { name: 'Total' }).click();
  await expect(market.getByRole('button', { name: 'Total' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.chip-help')).toHaveCount(0);
  expect(await page.evaluate(() => ['guess_spread', 'guess_total'].map(m => localStorage.getItem(`gtl.chipHelp.${m}`)))).toEqual(['off', 'off']);
  expect(await persona.noOverflow()).toBe(true);
});
