// Persona (g): confused user. Opens the app after the deadline, before a week is published,
// with one market submitted and the other sat out, and with no groups. Are the states explained?
import { test, expect, pgliteAvailable, futureDeadline, id } from './harness.mjs';
import { weekOpenAt } from '../../../shared/nfl-schedule.mjs';

test.use({ viewport: { width: 390, height: 844 } });

const DAY = 86_400_000;
/** Another member submits a full ballot through the real save RPC (the handler's commit for /personal/ballot), as from their own device. */
async function submitAs(persona, userId, mode, picks) {
  const { season, week } = persona.state.league;
  const body = { season, week, mode, weeklyRevision: 0, picks, submit: true, requestId: crypto.randomUUID(), revision: 0 };
  await persona.db.transaction(async tx => { await tx.exec('set local role service_role'); await tx.query('select public.gtl_mutate_personal(p_user=>$1,p_action=>$2,p_body=>$3)', [userId, 'personal/ballot', body]); });
}
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
  // The player submitted Spread from another device and never touched Total. Troy submitted Total (D-23 hides his numbers from Ben
  // until Ben submits Total or sits out); Luke submitted nothing.
  await persona.saveBallot('guess_spread', { 'TB-DAL': -3, 'PHI-JAX': 2.5, 'CIN-MIA': -1 }, true);
  await submitAs(persona, id(2), 'guess_total', { 'TB-DAL': 44, 'PHI-JAX': 47.5, 'CIN-MIA': 41 });
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
  const troyTotal = page.locator('.feed-post').filter({ hasText: 'Troy Fixture submitted Week 5 Total picks' });
  await expect(troyTotal).toContainText('Submit your Week 5 Total picks to see these.');
  // "Make picks" opens the first market still due: Total, with Spread shown as submitted.
  await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).click();
  await expect(page.locator('.week-pick').first()).toBeVisible();
  const market = page.getByRole('group', { name: 'Market' });
  await expect(market.getByRole('button', { name: 'Total', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(market.getByRole('button', { name: 'Spread ✓', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await persona.shot('picks-half-done');
  const cards = page.locator('.week-pick');
  await expect(cards.first().locator('.number-chip').first()).toBeVisible();
  // One Total pick saved as a draft before the opt-out: D-23 keeps it, and the sat-out screen still shows it (as not scored).
  await cards.first().getByRole('button', { name: '44', exact: true }).click();
  await page.locator('.save-bar').getByRole('button', { name: 'Save draft' }).click();
  await expect(page.locator('.save-bar .save-notice')).toHaveText('Draft saved.');
  // D-23: sitting out Total is final. Bigger change #40 (docs/PERSONA_AUDIT_2026_10_09.md): the trigger is a text link below the
  // ballot, after Save draft and Submit, with a one-line "final" hint; it is not in the save bar. The dialog, its copy, its initial
  // focus and Escape are unchanged.
  const sitOut = page.locator('.sit-out-row').getByRole('button', { name: 'Sit out this week' });
  await expect(sitOut).toBeVisible();
  await expect(page.locator('.save-bar').getByRole('button', { name: 'Sit out this week' })).toHaveCount(0);
  await expect(page.locator('.sit-out-row')).toHaveText("Not playing Week 5 Total? Sit out this week · Final: it forfeits this week's Total score (recorded as sat out, not zero).");
  await sitOut.click();
  const dialog = page.getByRole('dialog', { name: 'Sit out Week 5 Total?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Keep my ballot' })).toBeFocused();
  await expect(dialog).toContainText("This is final for Week 5 Total. You forfeit this week's Total score, which is recorded as sat out, not zero. You cannot submit Total picks for this week afterwards.");
  await expect(dialog).toContainText('Spread is not affected.');
  await persona.shot('sit-out-dialog', { fullPage: false });
  await persona.axe('sit-out-dialog');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(sitOut).toBeFocused();
  await sitOut.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Sit out Total' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.week-picks > p.muted')).toContainText("Sat out · others' picks visible");
  await expect(page.locator('.save-bar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sit out this week' })).toHaveCount(0);
  // Bigger change #41: the sat-out market shows the other members' revealed Total picks where the chip rows were, as read-only
  // chips: Troy's submitted numbers, Luke as not submitted, and the viewer's own kept draft marked not scored. No chip picker.
  await expect(page.locator('.week-sat-out')).toHaveText("You sat out Week 5 Total. This week's Total score is recorded as sat out, not zero. The other members' Total picks show below once they submit.");
  // The link that had focus is gone, so focus moves to that note rather than stranding on <body> (2.4.3).
  expect(await persona.focused()).toMatchObject({ tag: 'p', name: 'You sat out Week 5 Total. This week\'s To' });
  await expect(cards.first().locator('.chip-picker')).toHaveCount(0);
  const revealed = cards.first().locator('.revealed-picks');
  await expect(revealed).toHaveAttribute('aria-label', 'Tampa Bay Buccaneers at Dallas Cowboys Total picks');
  await expect(revealed.locator('li')).toHaveText(['You · draft (not scored)44', 'Troy Fixture44', 'Luke FixtureNot submitted yet']);
  await expect(revealed.locator('.revealed-chip')).toHaveClass([/chip number-chip selected revealed-chip/, /chip number-chip selected revealed-chip/]);
  await expect(cards.nth(1).locator('.revealed-picks li')).toHaveText(['Troy Fixture47.5', 'Luke FixtureNot submitted yet']);
  await expect(cards.nth(2).locator('.revealed-chip')).toHaveText(['41']);
  await expect(page.locator('.week-pick button.chip')).toHaveCount(0);
  await persona.shot('picks-sat-out');
  await persona.axe('picks-sat-out');
  // Nothing of that on the other market: Spread is the viewer's own submitted ballot, with its chips and no revealed list.
  await market.getByRole('button', { name: 'Spread ✓', exact: true }).click();
  await expect(page.locator('.revealed-picks')).toHaveCount(0);
  await expect(page.locator('.week-sat-out')).toHaveCount(0);
  await expect(cards.first().locator('.chip-picker')).toHaveCount(1);
  await expect(cards.first().locator('.chip-summary')).toHaveText('Cowboys −3');
  await market.getByRole('button', { name: 'Total · Sat out', exact: true }).click();
  await expect(page.locator('.revealed-picks')).toHaveCount(3);
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.locator('.picks-due')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: 'Picks', exact: true })).toBeVisible();
  const totalCell = await page.locator('.community-leaderboard tr.me td').nth(2).innerText();
  expect(totalCell).toBe('Sat out');
  // The D-23 reveal reaches the feed too: Troy's Total post now carries his numbers.
  await expect(troyTotal.locator('.post-picks')).toContainText('44');
  await expect(troyTotal).not.toContainText('Submit your Week 5 Total picks to see these.');
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
