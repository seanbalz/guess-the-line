import { test, expect } from '@playwright/test';
import { expectPick, expectPickEnabled, pickTotal } from '../chip-entry.mjs';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn, switchAccount } from './community-world.mjs';

// D-23 on the real handler, migrations and PGlite: (1) "Sit out this week" from the group
// ballot screen (PredictionEntry) is final for that mode only and reveals the other
// players' picks; (2) commissioner removal hides nothing a member entered and blocks only
// the removed account. Luke is the signed-in member; Troy has submitted Week 5 Spread and
// Total ballots; Sean is the sean-troy-luke commissioner.
const { luke, troy, sean } = ACCOUNTS;

/** Community → Groups & games → Triple Threat → My picks (the Spread ballot). */
async function openGroupBallot(page) {
  await page.getByRole('button', { name: /Groups & games/ }).click();
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await page.locator('.hub-game').filter({ hasText: 'Triple Threat' }).getByRole('button', { name: 'Open game' }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.' })).toBeVisible();
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trust your read.' })).toBeVisible();
}

for (const width of [390, 1280]) test(`D-23: sitting out Spread from the group ballot closes that ballot, reveals the other players' picks and leaves Total editable at ${width}px`, async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { groupScreens: true });
  const { db, errors, troyPicks } = world;
  try {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, 'luke');
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    await openGroupBallot(page);
    await expect(page.getByRole('button', { name: 'Guess the Spread', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const badge = page.locator('.ballot-header .badge'), saveBar = page.locator('.save-bar');
    await expect(badge).toHaveText('BLIND PREDICTIONS');
    await expectPickEnabled(page, 'TB at DAL home spread');
    await expect(page.locator('.hidden-value')).toHaveCount(2);
    await expect(page.locator('.opponent-picks')).toHaveCount(0);
    await expect(saveBar.getByRole('button', { name: 'Save draft', exact: true })).toBeVisible();
    await expect(saveBar.getByRole('button', { name: 'Review & submit', exact: true })).toBeVisible();

    // Persona audit #40: the opt-out is a text link below the save bar, after Save draft and Review & submit, never a button in the bar.
    const sitOut = page.locator('.sit-out-row').getByRole('button', { name: 'Sit out this week' });
    await expect(saveBar.getByRole('button', { name: 'Sit out this week' })).toHaveCount(0);
    await expect(sitOut).toHaveClass(/text-button/);
    expect(await sitOut.evaluate(el => el.compareDocumentPosition(document.querySelector('.save-bar .primary')) & Node.DOCUMENT_POSITION_PRECEDING)).toBeTruthy();
    await sitOut.click();
    const dialog = page.getByRole('dialog', { name: 'Sit out Week 5 Spread?' });
    await expect(dialog).toContainText('This is final for Week 5 Spread. You forfeit this week\'s Spread score, which is recorded as sat out, not zero.');
    await expect(dialog).toContainText('Total is not affected.');
    await dialog.getByRole('button', { name: 'Sit out Spread' }).click();
    await expect(dialog).toHaveCount(0);

    // The Spread ballot is closed for good: badge, copy, no entry controls, chips disabled, others' picks shown.
    await expect(badge).toHaveText('SAT OUT');
    await expect(page.locator('.callout').first()).toContainText("You sat out Week 5 Spread. This week's Spread score is recorded as sat out, and the other players' picks are visible below.");
    await expect(page.locator('.draft-save-state strong')).toHaveText("Sat out · others' picks visible");
    await expect(saveBar.locator('strong')).toHaveText('Sat out this week');
    await expect(saveBar.getByRole('button', { name: 'View analysis' })).toBeVisible();
    for (const name of ['Save draft', 'Review & submit', 'Sit out this week', 'Next game']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    await expectPickEnabled(page, 'TB at DAL home spread', false);
    await expectPickEnabled(page, 'PHI at JAX home spread', false);
    await expect(page.locator('.hidden-value')).toHaveCount(0);
    const opponents = page.locator('.opponent-picks');
    await expect(opponents).toHaveCount(2);
    await expect(opponents.first()).toContainText('Troy: −3');
    await expect(opponents.first()).toContainText('Sean: —');
    await expect(opponents.nth(1)).toContainText('Troy: +2.5');
    expect((await db.query('select user_id,season,week,mode from public.gtl_weekly_optouts')).rows).toEqual([{ user_id: luke.id, season: 2026, week: 5, mode: 'guess_spread' }]);
    expect((await db.query('select event from public.gtl_access_audit where actor_id=$1', [luke.id])).rows.map(r => r.event)).toEqual(['sit_out:2026:5:guess_spread']);
    // The database refuses any later Spread ballot for the sat-out player, whatever the screen.
    await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,5) on conflict do nothing', [luke.id]);
    await expect(db.query("insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot) values($1,2026,5,'guess_spread','{\"picks\":{}}')", [luke.id])).rejects.toThrow(/GTL_COMMUNITY_SAT_OUT/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.local/previews/group-sit-out-${width}.png`, fullPage: true });

    // Total is untouched: hidden market, no opponents, chips enabled, sit-out offered, a draft saves.
    await page.getByRole('button', { name: 'Guess the Total', exact: true }).click();
    await expect(badge).toHaveText('BLIND PREDICTIONS');
    await expect(page.locator('.hidden-value')).toHaveCount(2);
    await expect(page.locator('.opponent-picks')).toHaveCount(0);
    await expect(page.locator('.sit-out-row').getByRole('button', { name: 'Sit out this week' })).toBeEnabled();
    await expect(saveBar.getByRole('button', { name: 'Sit out this week' })).toHaveCount(0);
    await expectPickEnabled(page, 'TB at DAL combined points');
    await pickTotal(page, 'TB at DAL combined points', 45);
    await expectPick(page, 'TB at DAL combined points', '45 total points');
    await saveBar.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'saved to your account' })).toBeVisible();
    const saved = (await db.query("select ballot from public.gtl_weekly_ballots where user_id=$1 and mode='guess_total'", [luke.id])).rows[0].ballot;
    expect(saved.picks).toEqual({ 'TB-DAL': 45 });
    expect(saved.submittedAt).toBeNull();
    await page.getByRole('button', { name: 'Guess the Spread', exact: true }).click();
    await expect(badge).toHaveText('SAT OUT');

    // The community feed agrees: Spread is no longer due, Troy's Spread picks are revealed, Total stays gated.
    const feed = (await world.api('luke', 'community/read', {})).body;
    expect(feed.optOuts).toEqual(['guess_spread']);
    expect(feed.picksDue.modes.map(m => m.mode)).toEqual(['guess_total']);
    const posts = Object.fromEntries(feed.posts.filter(p => p.kind === 'ballot_submitted').map(p => [p.mode, p]));
    expect([posts.guess_spread.picksHidden, posts.guess_spread.picks]).toEqual([false, troyPicks.guess_spread]);
    expect([posts.guess_total.picksHidden, posts.guess_total.picks]).toEqual([true, null]);
    // M-01 (DP-1): a sit-out has no ballot, so its week and season points are null, never 0; the board reads "Sat out".
    expect(feed.standings.find(s => s.userId === luke.id && s.mode === 'guess_spread')).toMatchObject({ satOut: true, weekPoints: null, seasonPoints: null });
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});

test('D-23: removing a member hides nothing from the others and blocks only the removed account at 390px', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL);
  const { db, errors } = world;
  try {
    const lukeJoined = (await db.query('select id from public.gtl_feed_posts where dedupe_key=$1', [`joined:${luke.id}`])).rows[0].id;
    expect((await world.api('troy', 'community/comment', { requestId: crypto.randomUUID(), postId: lukeJoined, body: 'Welcome aboard, Luke' })).status).toBe(200);
    await page.setViewportSize({ width: 390, height: 900 });
    await signIn(page, 'luke');
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    // Redesign stage 17 (D-36, DP-2): Spread and Total are two boards, one row each.
    const troyRow = page.getByRole('table', { name: 'Spread', exact: true }).locator('tbody tr').filter({ hasText: 'Troy Fixture' });
    const troyTotalRow = page.getByRole('table', { name: 'Total', exact: true }).locator('tbody tr').filter({ hasText: 'Troy Fixture' });
    const byTroy = page.locator('.feed-post').filter({ has: page.locator('.feed-post-head', { hasText: 'Troy Fixture' }) });
    const spreadPost = page.locator('.feed-post').filter({ hasText: 'Troy Fixture submitted Week 5 Spread picks.' });
    const welcome = page.locator('.feed-post').filter({ hasText: 'Luke Fixture joined Guess The Line.' });
    await expect(troyRow).toHaveCount(1);
    await expect(troyRow).not.toContainText('Removed');
    await expect(troyRow.locator('td')).toHaveText(['0', '0']);
    await expect(troyTotalRow.locator('td')).toHaveText(['0', '0']);
    // M-01 (DP-1): Troy's sent ballots are 0 before any kickoff; Luke and Sean have no ballot, so their rows read "—", never 0.
    for (const table of ['Spread', 'Total']) for (const who of ['Luke Fixture', 'Sean Fixture']) {
      await expect(page.getByRole('table', { name: table, exact: true }).locator('tbody tr').filter({ hasText: who }).locator('td')).toHaveText(['—', '—']);
    }
    await expect(page.locator('.feed-post')).toHaveCount(5);
    await expect(byTroy).toHaveCount(3);
    // M-01 (D-39, hosted since October 14, 2026): Troy's Spread opens to Luke game by game at kickoff, or once Luke locks in his
    // Spread or sits out; the deadline alone opens nothing.
    const hiddenSpread = "Submit your Week 5 Spread picks to see these, or wait for each game's kickoff.";
    await expect(spreadPost.locator('.post-picks-hidden')).toHaveText(hiddenSpread);
    await expect(welcome.locator('.feed-comments')).toContainText('Troy Fixture Welcome aboard, Luke');

    // Only the commissioner can remove; a member's attempt is refused.
    const refused = await world.api('luke', 'community/member', { userId: troy.id, member: false });
    expect([refused.status, refused.body.error]).toEqual([403, 'Only the commissioner can change community membership.']);
    const removed = await world.api('sean', 'community/member', { userId: troy.id, member: false });
    expect([removed.status, removed.body]).toEqual([200, { userId: troy.id, member: false }]);
    expect((await db.query('select user_id,removed_by from public.gtl_community_removals')).rows).toEqual([{ user_id: troy.id, removed_by: sean.id }]);
    expect((await db.query('select event from public.gtl_access_audit where actor_id=$1', [sean.id])).rows.map(r => r.event)).toEqual([`community_remove:${troy.id}`]);

    // Luke refreshes: Troy's posts, comment, submissions and standings row are all still there, the row flagged.
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(troyRow).toContainText('Troy Fixture · Removed');
    await expect(troyTotalRow).toContainText('Troy Fixture · Removed');
    await expect(troyRow.locator('td')).toHaveText(['0', '0']);
    await expect(troyTotalRow.locator('td')).toHaveText(['0', '0']);
    await expect(page.locator('.feed-post')).toHaveCount(5);
    await expect(byTroy).toHaveCount(3);
    await expect(spreadPost.locator('.post-picks-hidden')).toHaveText(hiddenSpread);
    await expect(welcome.locator('.feed-comments')).toContainText('Troy Fixture Welcome aboard, Luke');
    const troyJoined = page.locator('.feed-post').filter({ hasText: 'Troy Fixture joined Guess The Line.' });
    await troyJoined.getByRole('button', { name: /likes/ }).click();
    await expect(troyJoined.getByRole('button', { name: /likes/ })).toHaveAttribute('aria-pressed', 'true');
    const feed = (await world.api('luke', 'community/read', {})).body;
    expect(feed.members.map(m => [m.displayName, m.removed])).toEqual([['Luke Fixture', false], ['Sean Fixture', false], ['Troy Fixture', true]]);
    expect(feed.submissions.filter(s => s.userId === troy.id).map(s => s.mode)).toEqual(['guess_spread', 'guess_total']);
    expect(feed.standings.filter(s => s.userId === troy.id).map(s => s.mode).sort()).toEqual(['guess_spread', 'guess_total']);
    expect(feed.posts.filter(p => p.actorId === troy.id).map(p => p.kind).sort()).toEqual(['ballot_submitted', 'ballot_submitted', 'joined']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '.local/previews/removed-member-390.png', fullPage: true });

    // The removed account is shut out of every community read and write with the documented message.
    const denied = await world.api('troy', 'community/read', {});
    expect([denied.status, denied.body]).toEqual([403, { error: 'Open My games and save your display name to join the community.' }]);
    for (const [route, body] of [['community/like', { postId: lukeJoined, like: true }], ['community/comment', { requestId: crypto.randomUUID(), postId: lukeJoined, body: 'Still here?' }],
      ['community/sit-out', { season: 2026, week: 5, mode: 'guess_spread' }], ['community/interest', { league: 'nba', notify: true }]]) {
      expect([route, (await world.api('troy', route, body)).status]).toEqual([route, 403]);
    }
    expect((await db.query('select count(*)::int n from public.gtl_feed_comments')).rows[0].n).toBe(1);
    await switchAccount(page, 'troy');
    await expect(page.getByRole('alert')).toHaveText('Open My games and save your display name to join the community.');
    await expect(page.locator('.feed-post')).toHaveCount(0);

    // Restoring returns access; nothing was deleted in between.
    expect((await world.api('sean', 'community/member', { userId: troy.id, member: true })).body).toEqual({ userId: troy.id, member: true });
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.locator('.feed-post')).toHaveCount(5);
    await expect(troyRow).not.toContainText('Removed');
    await expect(troyTotalRow).not.toContainText('Removed');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});
