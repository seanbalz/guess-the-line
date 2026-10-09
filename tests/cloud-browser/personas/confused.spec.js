// Persona (g): confused user. Opens the app after the deadline, before a week is published,
// with one market submitted and the other sat out, and with no groups. Are the states explained?
import { test, expect, pgliteAvailable } from './harness.mjs';

test.use({ viewport: { width: 390, height: 844 } });

test('confused: after the deadline', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start({ games: 3, deadline: '2026-10-09T00:15:00Z' });
  await persona.signIn();
  await expect(page.locator('.picks-due')).toContainText('picks closed');
  await persona.shot('feed-closed');
  await persona.axe('feed-closed');
  const card = await page.locator('.picks-due').innerText();
  const tab = await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: /^Picks/ }).innerText();
  persona.finding({ screen: 'feed-closed', severity: 2, experience: `After the deadline the card says "${card.replace(/\n/g, ' · ')}" while the tab next to it still says "${tab}". Nothing says what missing both ballots means (no points this week? zero? a forfeit?) or when the next week opens.`, fix: 'Change the tab label to "Picks (closed)", and add one line to the card: "You did not submit Spread or Total, so you score 0 this week. Week 6 opens when the commissioner publishes it."', evidence: { card, tab } });
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: /^Picks/ }).click();
  const first = page.locator('.week-pick').first();
  await expect(first).toBeVisible();
  await persona.shot('picks-closed');
  await persona.axe('picks-closed');
  const header = await page.locator('.week-picks > p.muted').innerText();
  const chipsDisabled = await first.locator('.chip').first().isDisabled();
  const saveBar = await page.locator('.save-bar').count();
  persona.finding({ screen: 'picks-closed', severity: 2, experience: `The closed ballot shows "${header}" and ${chipsDisabled ? 'greyed-out chips' : 'live chips'} for every game with ${saveBar ? 'the save bar' : 'no save bar'}. "Closed" is one word in grey; the disabled chips at 40% opacity look like a loading state, and there is no explanation, no link to the feed to see what others picked, and no scores.`, fix: 'Replace the chip list with a closed-week summary: your picks (or "no picks"), others\' picks once revealed, and a pointer to the leaderboard.' });
  expect(chipsDisabled).toBe(true);
  expect(await persona.noOverflow()).toBe(true);
});

test('confused: before the week is published (no slate)', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start({ slate: false });
  await persona.signIn();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await expect(page.locator('.feed-post').first()).toBeVisible();
  await expect(page.locator('.picks-due')).toHaveCount(0);
  await persona.shot('feed-no-week');
  await persona.axe('feed-no-week');
  const leaderboard = await page.locator('.community-leaderboard h2').innerText();
  persona.finding({ screen: 'feed-no-week', severity: 2, experience: `With no week published the home screen shows a leaderboard titled "${leaderboard}" full of dashes, the "joined" posts and the Coming soon cards, but no card saying that nothing is due. The Picks tab is still offered.`, fix: 'Show a quiet state card: "No week is open yet. The commissioner publishes each week\'s games; you will see Picks due here."' });
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: /^Picks/ }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  const error = await page.getByRole('alert').innerText();
  await persona.shot('picks-no-week');
  persona.finding({ screen: 'picks-no-week', severity: 2, experience: `Opening Picks before a week is published shows only a red error banner: "${error.trim()}". It is styled as a failure, not a state; a player will retry, reload and assume the app is broken.`, fix: 'Return the empty week as data (games: []) and render "Week 6 has not been published yet" in the normal muted style, without the error banner.' });
  expect(error).toContain('schedule is not available');
  expect(await persona.noOverflow()).toBe(true);
});

test('confused: one market submitted, the other sat out', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start({ games: 3 });
  // The player submitted Spread from another device and never touched Total.
  await persona.saveBallot('guess_spread', { 'TB-DAL': -3, 'PHI-JAX': 2.5, 'CIN-MIA': -1 }, true);
  await persona.signIn();
  await expect(page.locator('.picks-due')).toContainText('Total 0/3');
  const card = await page.locator('.picks-due').innerText();
  await persona.shot('feed-half-done');
  await persona.axe('feed-half-done');
  persona.finding({ screen: 'feed-half-done', severity: 3, experience: `With Spread submitted and Total untouched the card reads "${card.replace(/\n/g, ' · ')}": the submitted market disappears from the card, so there is no "Spread ✓" reassurance, and "Total 0/3" does not say that Total is a separate, required ballot.`, fix: 'List both markets on the card with a check for the submitted one: "Spread ✓ submitted · Total 0/3 still due".' });
  const post = page.locator('.feed-post').filter({ hasText: 'submitted Week 5 Spread picks' });
  await expect(post).toBeVisible();
  const picks = await post.locator('.post-picks').innerText();
  persona.finding({ screen: 'feed-half-done', severity: 3, experience: `The feed post for the submission lists the picks as "${picks.replace(/\n/g, ' / ')}" using team codes ("TB @ DAL") and "Cowboys −3", while the Picks tab used full names and the leaderboard uses the player's name only. Pick'em games show "PK" with no explanation anywhere.`, fix: 'Use one team naming scheme across feed, picks and leaderboard (code + nickname), and expand PK to "Pick\'em (even)".', evidence: { picks } });
  // Switching to Picks: the Spread tab shows a check and the Total tab is the open one, but the view opens on Spread.
  await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).click();
  await expect(page.locator('.week-pick').first()).toBeVisible();
  const spreadPressed = await page.getByRole('group', { name: 'Market' }).getByRole('button', { name: /Spread/ }).getAttribute('aria-pressed');
  await persona.shot('picks-half-done');
  if (spreadPressed === 'true') persona.finding({ screen: 'picks-half-done', severity: 2, experience: '"Make picks" on the card that says only Total is due opens the Spread ballot (already submitted, button labelled "Spread ✓") instead of the Total ballot. The player has to notice the ✓ and tap "Total".', fix: 'Open the first market that is still due; show "Submitted · editable" as a badge on the Spread tab.' });
  await page.getByRole('group', { name: 'Market' }).getByRole('button', { name: 'Total' }).click();
  await expect(page.locator('.week-pick').first().locator('.number-chip').first()).toBeVisible();
  expect(await persona.noOverflow()).toBe(true);
});

test('confused: no groups, and what groups are for', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start({ games: 3 });
  await persona.signIn();
  await page.getByRole('button', { name: /Groups & games/ }).click();
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await persona.shot('groups-empty');
  await persona.axe('groups-empty');
  const text = await page.locator('main').innerText();
  persona.finding({ screen: 'groups-empty', severity: 2, experience: 'The groups screen says "My games … Your next rivalry starts here. Create a Duel with one friend or bring a group together" and offers Play Solo and Bet Tracker cards, but never says that the Community already scores every member and that groups are optional filters with separate standings. A player who just came from "Picks (2 due)" cannot tell whether they must create a game to play.', fix: 'Add a sentence under the heading: "You are already in the Community. Groups are optional: a private leaderboard with the same weekly picks." Rename the button "Groups & games" to "Groups (optional)".' });
  expect(text).toContain('Your next rivalry starts here');
  const cardsBefore = await page.locator('.invitation-card').count();
  persona.finding({ screen: 'groups-empty', severity: 3, experience: `${cardsBefore} promo cards ("Play Solo", "Bet Tracker") sit above the empty-games state and each uses a lime primary button, the same weight as "Create your first game". Three equal calls to action on an empty screen.`, fix: 'Demote Solo and Bet Tracker to secondary links until the player has a group, or move them to the Community home tabs.' });
  // The coming-soon league path from the home screen.
  await page.getByRole('button', { name: '← Community' }).click();
  await page.getByRole('group', { name: 'League' }).getByRole('button', { name: /^NBA/ }).click();
  await expect(page.locator('.coming-soon-card')).toHaveCount(1);
  await persona.shot('league-coming-soon');
  await persona.axe('league-coming-soon');
  persona.finding({ screen: 'league-coming-soon', severity: 4, experience: 'Choosing NBA replaces the whole home screen with a single card and "Back to NFL". The feed, tabs and picks-due card vanish; a player who tapped by curiosity loses their place and the picks reminder.', fix: 'Open the coming-soon card as a sheet or inline expansion while keeping the NFL feed behind it.' });
  await page.getByRole('button', { name: 'Back to NFL' }).click();
  await expect(page.locator('.picks-due')).toBeVisible();
  expect(await persona.noOverflow()).toBe(true);
});
