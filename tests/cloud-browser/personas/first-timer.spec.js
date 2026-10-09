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
  await persona.smallTargets('feed');
  const due = await page.locator('.picks-due').innerText();
  persona.finding({ screen: 'feed', severity: 4, experience: `The picks-due card reads "${due.replace(/\n/g, ' / ')}". "Spread 0/14 · Total 0/14" is counts without a noun; a newcomer does not know that Spread and Total are two separate ballots that both must be finished.`, fix: 'Say "2 ballots due: Spread (0 of 14 games) and Total (0 of 14 games)".' });
  const theme = await page.locator('.hub-main > *').first().boundingBox();
  const title = await page.getByRole('heading', { name: 'Community', exact: true }).boundingBox();
  if (theme && title && theme.y < title.y) persona.finding({ screen: 'feed', severity: 3, experience: `The first card on the home screen is "Appearance · Dark · Saved on this device, not your account" (${Math.round(theme.height)}px tall), above the page title. A newcomer reads it as the first thing the product wants from them; it pushes the picks-due card below the fold at 390px.`, fix: 'Move the theme selector into the footer or Settings and leave the home screen to the picks-due card and feed.' });
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
  const picksText = await page.locator('.week-picks').innerText();
  const explains = /favorite|favou?red|points? better|home team|what is a spread|how to/i.test(picksText);
  if (!explains) persona.finding({ screen: 'picks-cold', severity: 2, experience: 'The Picks tab opens on fourteen cards with three team chips (Buccaneers · Pick\'em · Cowboys) and nothing that says what to do. Nowhere on the screen is the word "favorite", "spread" is only the tab name, and no sentence explains that you pick who wins and by how much.', fix: 'Add a one-line helper above the list the first time: "Tap the team you think wins, then how many points they win by. Pick\'em means a toss-up." Keep it dismissible.' });
  const truncated = await page.locator('.team-chip').evaluateAll(chips => chips.filter(chip => chip.scrollWidth > chip.clientWidth).map(chip => chip.textContent));
  if (truncated.length) persona.finding({ screen: 'picks-cold', severity: 3, wcag: '1.4.10 (reflow)', experience: `Team chips clip long names with an ellipsis at 390px: ${truncated.join(', ')} ("Command…"). The chip is the control that picks the favorite, so the name a player taps is cut off.`, fix: 'Use the team abbreviation plus nickname only when it fits (e.g. "WAS" / "Commanders" on two lines), or let the chip wrap to two lines.', evidence: truncated });
  const first = page.locator('.week-pick').first();
  await first.getByRole('button', { name: 'Cowboys', exact: true }).click();
  await persona.shot('picks-team-chosen');
  const chips = await first.locator('.number-chip').allInnerTexts();
  expect(chips[0]).toBe('−1');
  persona.finding({ screen: 'picks-team-chosen', severity: 2, experience: `After tapping Cowboys, the number chips read ${chips.slice(0, 4).join(', ')} … The minus sign is sportsbook notation (favorite gives points) but to a newcomer "−3" looks like "Cowboys lose by 3". Nothing on the card says "Cowboys win by 3".`, fix: 'Label the chip row "Cowboys win by…" and show chips as plain numbers (1, 1.5, 2 …); keep the signed sportsbook form only in the summary line ("Cowboys −3").' });
  await first.getByRole('button', { name: '−3', exact: true }).click();
  const summary = await first.locator('output').innerText();
  expect(summary).toBe('Cowboys −3');
  persona.finding({ screen: 'picks-team-chosen', severity: 3, experience: `The summary line under the chips reads "${summary}" in grey 14px mono. It is the only confirmation of the pick and it repeats the sportsbook sign rather than saying "Cowboys by 3".`, fix: 'Make the summary the headline: "Your call: Cowboys by 3" in body size, and keep "DAL −3" as a secondary mono token.' });
  // No "Pick'em" explanation.
  if (!/toss-?up|even|no favorite/i.test(picksText)) persona.finding({ screen: 'picks-cold', severity: 3, experience: 'The middle chip says "Pick\'em" with no explanation. Newcomers read it as "pick them" (pick a team) rather than "even game, no favorite".', fix: 'Render "Even (pick\'em)" or add title/aria-description "Even game — no favorite".' });
  // Team facts line under the matchup
  const facts = await first.locator('.team-facts').innerText();
  persona.finding({ screen: 'picks-cold', severity: 4, experience: `Each card shows "${facts.replace(/\n/g, ' | ')}". The record line is dense mono text; "road"/"home" splits read as code to a first-timer.`, fix: 'Format as two short lines: "Buccaneers 3–1 overall · 1–1 away" and "Cowboys 2–2 overall · 1–1 at home".' });

  // Switch to Total: with one unsaved spread pick the Total tab is disabled, silently.
  const totalTab = page.getByRole('group', { name: 'Market' }).getByRole('button', { name: 'Total' });
  if (await totalTab.isDisabled()) {
    persona.finding({ screen: 'picks-team-chosen', severity: 2, experience: 'After picking one spread, the "Total" market button goes grey and does nothing. Nothing explains that the unsaved spread draft must be saved first. A newcomer who wants to look at Total gets stuck or abandons the single pick.', fix: 'Keep the tab enabled and either auto-save the draft on switch or show "Save your Spread draft to switch to Total" next to it.' });
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  }
  await totalTab.click();
  await expect(page.locator('.week-pick').first().locator('.number-chip').first()).toBeVisible();
  await persona.shot('picks-total');
  await persona.axe('picks-total');
  const totalText = await page.locator('.week-picks').innerText();
  if (!/combined|both teams|points scored/i.test(totalText)) persona.finding({ screen: 'picks-total', severity: 2, experience: 'Switching to Total shows chips 39–49 around 44 with no sentence saying this is the combined points of both teams. "44" next to "Buccaneers @ Cowboys" could be read as a score for one team.', fix: 'Add "Total = points scored by both teams combined. The line is usually 37–52." above the list, and label the chip row "Combined points".' });
  const totalChips = await page.locator('.week-pick').first().locator('.number-chip').allInnerTexts();
  // Observed today: switching from a saved spread draft (Cowboys −3) to Total leaves eight stale "0" chips
  // in front of 39–49 on that game only. The spread value −3 reaches the Total picker for one render, which
  // builds chips Math.max(0, −8…2) with duplicate React keys "0"; the reset to 39–49 cannot reconcile them.
  const zeros = totalChips.filter(chip => chip === '0').length;
  expect(zeros).toBe(8);
  expect(totalChips.slice(zeros)).toEqual(['39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49']);
  persona.finding({ screen: 'picks-total', severity: 1, wcag: null, experience: 'Bug: after saving a spread draft and switching to Total, the game that had a spread pick shows eight extra "0" chips before 39–49 (19 chips). The zeros are live buttons; tapping one records a total of 0 points. Games without a spread pick render correctly. Cause: WeekPicks keeps the spread values in `picks` for one render after the mode changes, so ChipPicker computes totalChips around center −3 with duplicate keys "0", and React keeps the duplicates when the row re-renders.', fix: 'In WeekPicks derive the initial picks for a mode synchronously (useMemo on [data, mode]) instead of resetting them in an effect, and in ChipPicker key the total chips by index or clamp the center to the 20–200 total range so keys are unique.', evidence: { totalChips } });
  persona.finding({ screen: 'picks-total', severity: 3, experience: `The Total chips (${totalChips[zeros]}–${totalChips.at(-1)}) are whole numbers centered on 44 for every game regardless of matchup, so a newcomer has no idea whether 44 is high or low for this game.`, fix: 'Center the chips on the matchup\'s typical total (last season average or a neutral 45) and show the chosen value in the summary line as "Over/under 44 points".' });
  await page.locator('.week-pick').first().getByRole('button', { name: '44', exact: true }).click();
  await expect(page.locator('.week-pick').first().locator('output')).toHaveText('44 total points');

  // What is due and when?
  const status = await page.locator('.week-picks > p.muted').innerText();
  expect(status).toContain('Due');
  persona.finding({ screen: 'picks-total', severity: 3, experience: `The due line says "${status}". It is grey 14px text above the list. There is no time zone explanation beyond "PT", no day name, and no countdown.`, fix: 'Show "Due Thursday 5:15 PM PT (in 2 days)" in the sticky save bar as well as the header.' });
  // Save bar: Submit is disabled until all 14 picks are in; nothing says why.
  const submit = page.getByRole('button', { name: 'Submit Total' });
  await expect(submit).toBeDisabled();
  persona.finding({ screen: 'picks-total', severity: 2, experience: 'With one of fourteen games picked, "Submit Total" is disabled with no hint; only "1/14 ready" sits beside it. A newcomer will tap the dead button and not know that every game must be picked before submitting, or that "Save draft" keeps a partial ballot.', fix: 'Replace the disabled state with an enabled button that explains: "Pick the remaining 13 games to submit", and put "Save draft" first with "Your draft is kept on this account".' });
  // Can the newcomer get back to the feed? There is no back control inside the picks view other than the tab bar at the top.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const tabsVisible = await page.getByRole('navigation', { name: 'Community sections' }).evaluate(el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
  if (!tabsVisible) persona.finding({ screen: 'picks-total', severity: 3, experience: 'At the bottom of fourteen cards the only navigation is the sticky save bar; the Feed/Picks tabs are off-screen at the top. There is no "Back to feed" or header on the picks screen.', fix: 'Make the Feed/Picks tab bar sticky or add a compact back link to the sticky save bar.' });
  await persona.shot('picks-bottom');
  expect(await persona.noOverflow()).toBe(true);
});
