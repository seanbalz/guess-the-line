// Persona (g): confused user. Opens the app after the deadline, before a week is published,
// with one market submitted and the other sat out, and with no groups. Are the states explained?
import { test, expect, pgliteAvailable, futureDeadline, id } from './harness.mjs';
import { weekOpenAt } from '../../../shared/nfl-schedule.mjs';

test.use({ viewport: { width: 390, height: 844 } });

const DAY = 86_400_000;
const pacific = (iso, options = {}) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...options });

test('confused: after the deadline', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start({ games: 3, deadline: '2026-10-09T00:15:00Z' });
  await persona.signIn();
  await expect(page.locator('.picks-due')).toContainText('picks closed');
  await persona.shot('feed-closed');
  await persona.axe('feed-closed');
  // Quick win 9 (#13): the tab agrees with the card, and the card names the next Monday open (D-24).
  const card = await page.locator('.picks-due').innerText();
  const tab = page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: /^Picks/ });
  await expect(tab).toHaveText('Picks (closed)');
  // Review of PR #34: after the deadline the card says whether each ballot was submitted, never a count that looks as if it scores.
  await expect(page.locator('.picks-due')).toContainText('Spread not submitted · Total not submitted · Deadline passed · Week 6 opens Mon, Oct 12, 12:00 AM PT');
  persona.finding({ screen: 'feed-closed', severity: 3, experience: `After the deadline the card says "${card.replace(/\n/g, ' · ')}" and the tab says "Picks (closed)". Nothing yet says what missing both ballots means for the score (no points this week, not zero? a forfeit?).`, fix: 'Add one line to the card: "You did not submit Spread or Total, so you score 0 this week."', evidence: { card } });
  await tab.click();
  const first = page.locator('.week-pick').first();
  await expect(first).toBeVisible();
  await persona.shot('picks-closed');
  await persona.axe('picks-closed');
  const header = await page.locator('.week-picks > p.muted').innerText();
  await expect(page.locator('.week-closed')).toHaveText('Week 5 Spread picks are closed. You made no Spread picks this week. Week 6 opens Mon, Oct 12, 12:00 AM PT.');
  const chipsDisabled = await first.locator('.chip').first().isDisabled();
  const saveBar = await page.locator('.save-bar').count();
  persona.finding({ screen: 'picks-closed', severity: 3, experience: `The closed ballot shows "${header}", a closed-week note with the next open, and ${chipsDisabled ? 'greyed-out chips' : 'live chips'} for every game with ${saveBar ? 'the save bar' : 'no save bar'}. The disabled chips at 40% opacity still look like a loading state, and there is no link to the feed to see what others picked, and no scores.`, fix: 'Replace the chip list with a closed-week summary: your picks (or "no picks"), others\' picks once revealed, and a pointer to the leaderboard.' });
  expect(chipsDisabled).toBe(true);
  expect(saveBar).toBe(0);
  expect(await persona.noOverflow()).toBe(true);
});

test('confused: after the deadline with an unsubmitted draft and a submitted ballot', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start({ games: 3 });
  // While the week was open the player drafted two Spread picks without submitting them and submitted all three Total picks, both
  // through the real save (the D-17 guard refuses a closed week and a hand-made submitted row). The week then closes the way the
  // "after the deadline" fixture is closed: the slate's deadline moves into the past (the feed and the Picks tab both read it).
  await persona.saveBallot('guess_spread', { 'TB-DAL': -3, 'PHI-JAX': 2.5 }, false);
  await persona.saveBallot('guess_total', { 'TB-DAL': 44, 'PHI-JAX': 47.5, 'CIN-MIA': 41 }, true);
  const { season, week } = persona.state.league, closedAt = '2026-10-09T00:15:00Z';
  await persona.db.query("update public.gtl_weekly_slates set signature=jsonb_set(signature,'{deadline}',to_jsonb($3::numeric)) where season=$1 and week=$2", [season, week, String(Date.parse(closedAt) / 1000)]);
  await persona.db.query("update public.gtl_leagues set state=jsonb_set(state,'{league,deadline}',to_jsonb($1::text))", [closedAt]);
  await persona.signIn();
  // Review of PR #34 (#13): only a submitted ballot scores (D-21). The card and the closed-week note on each market say which it was,
  // so a draft that was never submitted is not mistaken for picks that count.
  await expect(page.locator('.picks-due')).toContainText('Spread draft (not submitted) · Total ✓ submitted · Deadline passed · Week 6 opens Mon, Oct 12, 12:00 AM PT');
  await persona.shot('feed-closed-draft');
  await persona.axe('feed-closed-draft');
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: /^Picks/ }).click();
  const first = page.locator('.week-pick').first();
  await expect(first).toBeVisible();
  const market = page.getByRole('group', { name: 'Market' });
  await expect(market.getByRole('button', { name: 'Spread', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.week-closed')).toHaveText('Week 5 Spread picks are closed. Your Spread draft was never submitted, so it does not score this week. Week 6 opens Mon, Oct 12, 12:00 AM PT.');
  await expect(page.locator('.week-picks > p.muted')).toHaveText('Week 5 · 2/3 picked · Closed');
  await expect(first.locator('.chip-summary')).toHaveText('Cowboys −3');
  await persona.shot('picks-closed-draft');
  await persona.axe('picks-closed-draft');
  await market.getByRole('button', { name: 'Total ✓', exact: true }).click();
  await expect(page.locator('.week-closed')).toHaveText('Week 5 Total picks are closed. Your submitted Total picks stay below. Week 6 opens Mon, Oct 12, 12:00 AM PT.');
  await expect(page.locator('.week-picks > p.muted')).toHaveText('Week 5 · 3/3 picked · Closed · Submitted');
  await expect(first.locator('.chip-summary')).toHaveText('44 total points');
  await expect(page.locator('.save-bar')).toHaveCount(0);
  await persona.shot('picks-closed-submitted');
  expect(await persona.noOverflow()).toBe(true);
});

test('confused: before the week is published (no slate)', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start({ slate: false });
  await persona.signIn();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await expect(page.locator('.feed-post').first()).toBeVisible();
  await expect(page.locator('.picks-due')).toHaveCount(0);
  // Quick win 9 (#14): a quiet "no week is open yet" state on the feed and on the Picks tab, never a red error.
  await expect(page.locator('.week-unpublished')).toContainText('No week is open yet. Weeks open automatically Monday 12:00 AM PT once the schedule is published; picks due will show here.');
  await persona.shot('feed-no-week');
  await persona.axe('feed-no-week');
  const leaderboard = await page.locator('.community-leaderboard h2').innerText();
  persona.finding({ screen: 'feed-no-week', severity: 4, experience: `With no week published the home screen shows the quiet "No week is open yet" card, then a leaderboard titled "${leaderboard}" full of dashes, the "joined" posts and the Coming soon cards.`, fix: 'Hide the dash-filled leaderboard until a week has been scored, or show last season\'s final table.' });
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: /^Picks/ }).click();
  await expect(page.locator('.week-unpublished')).toContainText('No week is open yet');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.week-pick')).toHaveCount(0);
  await persona.shot('picks-no-week');
  expect(await persona.noOverflow()).toBe(true);
});

test('confused: week published but not open yet (D-24)', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const deadline = futureDeadline(), opensAt = weekOpenAt(deadline);
  await persona.start({ games: 3, deadline });
  await persona.signIn();
  await expect(page.locator('.picks-due')).toContainText('opens');
  const card = await page.locator('.picks-due').innerText();
  const tab = await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: /^Picks/ }).innerText();
  await persona.shot('feed-not-open');
  await persona.axe('feed-not-open');
  await expect(page.locator('.picks-due').getByRole('button', { name: 'Make picks' })).toHaveCount(0);
  // Quick win 9 (#43): a relative hint and the due time instead of 0/3 counts for a ballot nobody can touch.
  const days = Math.ceil((Date.parse(opensAt) - Date.now()) / DAY);
  await expect(page.locator('.picks-due')).toContainText(`${days > 1 ? `In ${days} days` : 'Tomorrow'} · Picks due ${pacific(deadline, { weekday: 'short' })} PT`);
  await expect(page.locator('.picks-due')).not.toContainText('0/3');
  expect(tab).toBe('Picks');
  persona.finding({ screen: 'feed-not-open', severity: 4, experience: `Before the Monday open the card reads "${card.replace(/\n/g, ' · ')}" with no button. The open is "Mon, … 12:00 AM PT" with a relative hint; nothing explains that the week opens by itself at that time.`, fix: 'Add "opens automatically" to the card so nobody waits for an announcement.', evidence: { card, tab } });
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: /^Picks/ }).click();
  const first = page.locator('.week-pick').first();
  await expect(first).toBeVisible();
  // Quick win 9 (#44): the slate is a read-only schedule with the open time as the headline; no chips to retry.
  await expect(page.locator('.week-not-open h3')).toHaveText(`Week 5 opens ${pacific(opensAt, { weekday: 'short' })} PT`);
  await expect(page.locator('.week-not-open')).toContainText('Nobody can pick before then.');
  await expect(page.locator('.week-picks > p.muted')).toContainText(`Not open yet · Picks due ${pacific(deadline, { weekday: 'short' })} PT`);
  await expect(page.locator('.week-pick')).toHaveCount(3);
  await expect(first).toContainText('Tampa Bay Buccaneers @ Dallas Cowboys');
  await expect(first.locator('.team-facts')).toBeVisible();
  await expect(page.locator('.week-pick button.chip')).toHaveCount(0);
  await expect(page.locator('.save-bar')).toHaveCount(0);
  await expect(page.locator('.chip-help')).toHaveCount(0);
  await persona.shot('picks-not-open');
  await persona.axe('picks-not-open');
  expect(await persona.noOverflow()).toBe(true);
});

test('confused: one market submitted, the other sat out', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start({ games: 3 });
  // The player submitted Spread from another device and never touched Total.
  await persona.saveBallot('guess_spread', { 'TB-DAL': -3, 'PHI-JAX': 2.5, 'CIN-MIA': -1 }, true);
  await persona.signIn();
  // Quick win 10 (#15): the submitted market stays on the card with a check and the other is marked still due.
  await expect(page.locator('.picks-due')).toContainText('Spread ✓ submitted · Total 0/3 still due');
  const card = await page.locator('.picks-due').innerText();
  await persona.shot('feed-half-done');
  await persona.axe('feed-half-done');
  const post = page.locator('.feed-post').filter({ hasText: 'submitted Week 5 Spread picks' });
  await expect(post).toBeVisible();
  const picks = await post.locator('.post-picks').innerText();
  persona.finding({ screen: 'feed-half-done', severity: 3, experience: `The feed post for the submission lists the picks as "${picks.replace(/\n/g, ' / ')}" using team codes ("TB @ DAL") and "Cowboys −3", while the Picks tab uses full names and the leaderboard uses the player's name only. The card reads "${card.replace(/\n/g, ' · ')}".`, fix: 'Use one team naming scheme across feed, picks and leaderboard (code + nickname).', evidence: { picks } });
  // "Make picks" opens the first market still due: Total, with Spread shown as submitted.
  await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).click();
  await expect(page.locator('.week-pick').first()).toBeVisible();
  const market = page.getByRole('group', { name: 'Market' });
  await expect(market.getByRole('button', { name: 'Total', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(market.getByRole('button', { name: 'Spread ✓', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.submit-receipt')).toHaveCount(0);
  // Bigger change (#25, with the #15 and #30 remainder): the submitted market carries the receipt, which names what was submitted
  // and when, says Total is still due and opens it. A plain market switch keeps focus on the market button; only an in-session
  // submit moves focus into the receipt (power.spec.js).
  await market.getByRole('button', { name: 'Spread ✓', exact: true }).click();
  const receipt = page.getByRole('region', { name: 'Spread submitted · 3 picks' });
  await expect(receipt).toBeVisible();
  const submittedAt = (await persona.db.query("select ballot->>'submittedAt' as submitted_at from public.gtl_weekly_ballots where user_id=$1 and mode='guess_spread'", [id(1)])).rows[0].submitted_at;
  await expect(receipt).toContainText(`Submitted ${pacific(submittedAt)} PT`);
  await expect(receipt).toContainText('Total: 0/3 still due');
  await expect(receipt.getByRole('button', { name: "See everyone's Spread picks" })).toBeVisible();
  await expect(receipt.getByRole('button', { name: "See everyone's Total picks" })).toHaveCount(0);
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: 'Spread ✓' });
  await persona.shot('picks-receipt-half-done');
  await persona.axe('picks-receipt-half-done');
  await receipt.getByRole('button', { name: 'Make Total picks' }).click();
  await expect(market.getByRole('button', { name: 'Total', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.submit-receipt')).toHaveCount(0);
  await persona.shot('picks-half-done');
  await expect(page.locator('.week-pick').first().locator('.number-chip').first()).toBeVisible();
  // D-23: sitting out Total is final. The control, the dialog and the states afterwards.
  const sitOut = page.getByRole('button', { name: 'Sit out this week' });
  await expect(sitOut).toBeVisible();
  await sitOut.click();
  const dialog = page.getByRole('dialog', { name: 'Sit out Week 5 Total?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Keep my ballot' })).toBeFocused();
  const dialogText = await dialog.innerText();
  await persona.shot('sit-out-dialog', { fullPage: false });
  await persona.axe('sit-out-dialog');
  persona.finding({ screen: 'sit-out-dialog', severity: 4, experience: `The sit-out dialog is explicit: "${dialogText.split('\n').find(line => line.startsWith('This is final'))}" Focus starts on "Keep my ballot" and Escape cancels. Good. The trigger itself, "Sit out this week" in the save bar, gives no hint that it is final until the dialog opens.`, fix: 'Keep the dialog; label the trigger "Sit out this week (final)" or move it out of the save bar.' });
  await dialog.getByRole('button', { name: 'Sit out Total' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.week-picks > p.muted')).toContainText("Sat out · others' picks visible");
  await expect(page.locator('.save-bar')).toHaveCount(0);
  await persona.shot('picks-sat-out');
  const satOutHeader = await page.locator('.week-picks > p.muted').innerText();
  const othersVisible = await page.locator('.week-picks').innerText();
  persona.finding({ screen: 'picks-sat-out', severity: 3, experience: `After sitting out, the Picks header reads "${satOutHeader}" and the chips grey out, but the ${persona.state.games.length} game cards still show the full chip rows (disabled) and ${/Troy|Luke/.test(othersVisible) ? 'other players\' picks appear' : 'no other player\'s picks appear on this screen'}; the promise "others' picks visible" points to the feed, not here.`, fix: 'Replace the disabled chip rows with the revealed picks table (or a link to the feed posts) on a sat-out market.' });
  // On the submitted market the receipt now says Total was sat out (final, D-23), with nothing else due and no "Make Total picks".
  await market.getByRole('button', { name: 'Spread ✓', exact: true }).click();
  await expect(receipt).toContainText('Total: sat out (final). Nothing else is due this week.');
  await expect(receipt.getByRole('button', { name: 'Make Total picks' })).toHaveCount(0);
  await persona.shot('picks-receipt-sat-out');
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.locator('.picks-due')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: 'Picks', exact: true })).toBeVisible();
  const totalCell = await page.locator('.community-leaderboard tr.me td').nth(2).innerText();
  expect(totalCell).toBe('Sat out');
  await persona.shot('feed-sat-out');
  persona.finding({ screen: 'feed-sat-out', severity: 4, experience: 'After sitting out Total the picks-due card disappears entirely and the leaderboard shows "Sat out" in the Total week column with a footnote. Nothing on the feed records that the player sat out (no post), so the act is invisible to everyone else until the leaderboard is read.', fix: 'Post "Ben sat out Week 5 Total" to the feed like a submission, so the reveal to others is explained.' });
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
  // Bigger change: onboarding step (#16). One sentence under the heading says what a group is for versus the Community, and the empty
  // screen has one primary action: Solo and Bet Tracker are secondary, and New game is secondary until the player has a game.
  await expect(page.locator('.hub-heading')).toContainText('The Community already scores every member, so a group is optional: a private leaderboard for the people you choose, using the same weekly picks.');
  expect(text).toContain('Your next rivalry starts here');
  await expect(page.locator('.invitation-card')).toHaveCount(2);
  await expect(page.locator('main .primary')).toHaveText(['Create your first game']);
  await expect(page.locator('.hub-empty .primary')).toBeEnabled();
  for (const name of ['New game', 'Open Solo', 'Open Bet Tracker', 'My Unit Betting week']) await expect(page.getByRole('button', { name, exact: true })).toHaveClass(/secondary/);
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
