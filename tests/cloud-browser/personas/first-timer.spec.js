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
  const intro = await page.locator('.auth-card').innerText();
  if (!/spread|total|pick|NFL/i.test(intro)) persona.finding({ screen: 'sign-in', severity: 3, experience: 'The sign-in card never says what the game is. A newcomer sees "Your games. Any device." and a lock icon, with no sentence about guessing NFL spreads and totals against friends.', fix: 'Add one line under the heading: "Guess the NFL spread and total each week. Closest to the number wins." Link to the rules.' });

  await persona.signIn();
  await expect(page.getByRole('heading', { name: 'First, what should we call you?' })).toBeVisible();
  await persona.shot('display-name');
  await persona.axe('display-name');
  // The whole My games page renders around the name prompt with every action disabled.
  const disabled = await page.locator('button:disabled').count();
  if (disabled) persona.finding({ screen: 'display-name', severity: 3, experience: `Before saving a name the newcomer sees the full "My games" page with ${disabled} greyed-out buttons (New game, Create your first game) and the Solo / Bet Tracker cards. The one required step is a small form in the middle of a page that looks finished.`, fix: 'Render the name prompt alone (a focused onboarding step), then show My games / Community after it is saved.' });
  await page.getByLabel('Your display name').fill('Ben Fixture');
  await page.getByRole('button', { name: 'Save display name' }).click();
  // Saving the name goes straight to the Community home; the "saved" confirmation never shows.
  await persona.shot('after-name');
  persona.finding({ screen: 'after-name', severity: 4, experience: 'Saving the display name jumps straight to the Community home. The "Your display name has been saved." confirmation is set on the My games screen, which is no longer shown, so the newcomer gets no acknowledgement that the name stuck.', fix: 'Carry the notice into the Community home (role=status) or show "Welcome, Ben" in the header on first arrival.' });
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await expect(page.locator('.picks-due')).toBeVisible();
  await persona.shot('feed');
  await persona.axe('feed');
  await persona.smallText('feed');
  // Bigger changes (#19): the like button is at least 44px wide.
  expect(await persona.smallTargets('feed')).toEqual([]);
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
  // "Got it" is at least 44px wide too.
  expect(await persona.smallTargets('picks-cold')).toEqual([]);
  // Quick win 2 (#4): one helper line per market explains the favorite, the points and Pick'em; it can be dismissed.
  const help = page.locator('.chip-help');
  await expect(help).toContainText('Tap the team you think wins (the favorite), then how many points they win by.');
  await expect(help).toContainText('Pick’em means an even game with no favorite.');
  await expect(help.getByRole('button', { name: 'Got it, hide this tip' })).toBeVisible();
  const picksText = await page.locator('.week-picks').innerText();
  expect(/favorite|favou?red|points? better|home team|what is a spread|how to/i.test(picksText)).toBe(true);
  expect(/toss-?up|even|no favorite/i.test(picksText)).toBe(true);
  // Bigger changes (#21): team chips are sized by their name, so "Buccaneers" and "Commanders" are never cut to "Command…" at 390px;
  // the shorter chips in the row give way and, when a row cannot hold all three, it wraps to a second line instead of clipping.
  const truncated = await page.locator('.team-chip').evaluateAll(chips => chips.filter(chip => chip.scrollWidth > chip.clientWidth).map(chip => chip.textContent));
  expect(truncated).toEqual([]);
  const fitsBefore = new Set(await page.locator('.team-chip').evaluateAll(chips => chips.filter(chip => chip.scrollWidth <= chip.clientWidth).map(chip => chip.textContent)));
  expect(fitsBefore.has('Buccaneers') && fitsBefore.has('Commanders')).toBe(true);
  await expect(page.locator('.team-chip', { hasText: 'Commanders' })).toHaveCSS('text-overflow', 'ellipsis'); // Still the last resort below 320px.
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

  // What is due and when? Bigger changes (#24): the header names the weekday and says how far off the deadline is, and the sticky
  // save bar repeats the due time beside the ready count so it is on screen wherever the player is scrolled.
  const status = await page.locator('.week-picks > p.muted').innerText();
  const deadline = persona.state.league.deadline, pt = { timeZone: 'America/Los_Angeles' };
  const dueLong = new Date(deadline).toLocaleString('en-US', { ...pt, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const dueShort = new Date(deadline).toLocaleString('en-US', { ...pt, weekday: 'short', hour: 'numeric', minute: '2-digit' });
  expect(status).toBe(`Week 5 · 1/14 picked · Due ${dueLong} PT (today)`);
  await expect(page.locator('.save-bar .save-due')).toHaveText(`Due ${dueShort} PT (today)`);
  await expect(page.locator('.save-bar strong')).toHaveText('1/14 ready');
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
