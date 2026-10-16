import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { pickSpread, expectPick, expectPickEnabled } from '../chip-entry.mjs';
import { ACCOUNTS, communityWorld, pgliteAvailable, sendBallot, signIn } from './community-world.mjs';
import { ALL, migrationSql } from '../migrations.mjs';

// Redesign stage 18 (M-02) in the old app, on the real handler, migrations and PGlite: the day M-02 is applied while a tab still holds
// the rules from before it. Luke sent Spread under D-16 (editable until the deadline), the tab shows it editable, then M-02 is applied
// and the edit he saves is refused with GTL_BALLOT_LOCKED. The screen says "Sent picks are final." and reloads to the final state;
// it is not an uncoded 409 ("Load latest", "Conflict · review saved changes"). The live rules come from the database
// (gtl_live_rules through the optional-RPC read), so they switch with the apply. Fixture accounts and values only.
const M02 = '20261015030000_gtl_sent_picks_final.sql';
// These stage-18 tests exercise the M-02 transition and the original classic editor. M-07 later replaces that
// writer and editor; its native per-game behavior is covered by next-per-game-scoring.spec.js.
const BEFORE_M07 = ALL.filter(file => file !== '20261015190710_gtl_guess_write_window.sql');
const BEFORE = BEFORE_M07.filter(file => file !== M02);
const { luke } = ACCOUNTS;
const NOTICE = 'Sent picks are final. Your saved picks are shown.';

/** Community → Groups & games → Triple Threat → My picks (the Spread ballot), as tests/cloud-browser/d23.spec.js opens it. */
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
const storedSpread = async db => (await db.query("select ballot->'picks' picks from public.gtl_weekly_ballots where user_id=$1 and mode='guess_spread'", [luke.id])).rows[0].picks;

test('Community Picks at 390px: an edit refused once M-02 is applied shows "Sent picks are final." and the final ballot, with no conflict step', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: BEFORE, optionalRpc: true });
  const { db, errors, state } = world, [first, second] = state.games.map(g => g.id);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await sendBallot(world, 'luke', 'guess_spread', { [first]: -3, [second]: 2.5 });
    const sent = await storedSpread(db);
    await signIn(page, 'luke');
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Picks/ }).click();
    const spread = page.getByRole('group', { name: 'Market' }).getByRole('button', { name: /^Spread/ });
    await spread.click();
    await expect(spread).toHaveAttribute('aria-pressed', 'true');
    // Before the apply: today's rule (D-16), the submitted ballot is editable until the deadline.
    await expect(page.getByText(/Submitted, editable until the deadline/)).toBeVisible();
    const card = page.locator('.week-pick').first();
    await expect(card.locator('.chip-summary')).toHaveText('Cowboys −3');

    // Sean's "apply M-02": the database rule changes under the open tab. Luke edits and saves.
    await db.exec(migrationSql(M02));
    await card.getByRole('radio', { name: '−3.5', exact: true }).click();
    await expect(card.locator('.chip-summary')).toHaveText('Cowboys −3.5');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();

    // The refusal is explained and the final ballot is shown: the saved pick, read-only, "Submitted · final", nothing left to save.
    await expect(page.getByRole('status').filter({ hasText: NOTICE })).toBeVisible();
    await expect(page.getByText(/Submitted · final/).first()).toBeVisible();
    await expect(card.locator('.chip-summary')).toHaveText('Cowboys −3');
    for (const chip of await card.locator('.team-chip, .number-chip').all()) await expect(chip).toBeDisabled();
    await expect(page.locator('.save-bar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Load latest' })).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText(/another device|another group/)).toHaveCount(0);
    expect(await storedSpread(db)).toEqual(sent);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '.local/previews/sent-final-refusal-community-390.png', fullPage: true });
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});

for (const width of [390, 1280]) test(`group ballot at ${width}px: an edit refused once M-02 is applied reloads the final ballot instead of a conflict`, async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: BEFORE, optionalRpc: true, groupScreens: true });
  const { db, errors, state } = world, [first, second] = state.games.map(g => g.id);
  try {
    await page.setViewportSize({ width, height: 900 });
    await sendBallot(world, 'luke', 'guess_spread', { [first]: -3, [second]: 2.5 });
    const sent = await storedSpread(db);
    await signIn(page, 'luke');
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    await openGroupBallot(page);
    const badge = page.locator('.ballot-header .badge');
    await expect(badge).toHaveText('SUBMITTED · EDITABLE');
    await expectPick(page, 'TB at DAL home spread', 'DAL −3');

    await db.exec(migrationSql(M02));
    await pickSpread(page, 'TB at DAL home spread', -3.5);
    await page.getByRole('button', { name: 'Review & save changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save changed guesses' }).click();

    await expect(page.getByRole('alert').filter({ hasText: NOTICE })).toBeVisible();
    await expect(badge).toHaveText('SUBMITTED · FINAL');
    await expect(page.locator('.save-bar strong')).toHaveText('Submitted · final');
    await expectPick(page, 'TB at DAL home spread', 'DAL −3');
    await expectPickEnabled(page, 'TB at DAL home spread', false);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Review & save changes', exact: true })).toHaveCount(0);
    await expect(page.getByText('Conflict · review saved changes')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refresh saved data' })).toHaveCount(0);
    // The edit stays only as this tab's read-only copy (D-23: nothing typed is silently dropped), never as a save.
    await expect(page.getByText('READ-ONLY · SUBMITTED · FINAL')).toBeVisible();
    expect(await storedSpread(db)).toEqual(sent);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.local/previews/sent-final-refusal-group-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});

// Review follow-up (stage 15, D-39): the per-game wiring of Community Picks' chips. With M-02 applied, Luke locks in one Spread game
// on its own (as the new app will, through /personal/ballot's lockIn) and keeps the other game a draft. The locked-in game is
// read-only; the draft game's chips still work, the save bar stays and nothing says "Submitted". The other final-rule specs cover
// only a market with every game locked in, where the whole screen is read-only either way.
test('Community Picks at 390px: a game locked in on its own is read-only, and the rest of the market stays a draft', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: BEFORE_M07, optionalRpc: true });
  const { db, errors, state } = world, [first, second] = state.games.map(g => g.id), { season, week } = state.league;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    const workspace = await world.api('luke', 'personal');
    const saved = await world.api('luke', 'personal/ballot', { season, week, mode: 'guess_spread', picks: { [first]: -3, [second]: 2.5 }, lockIn: [first], submit: false,
      revision: workspace.body.revision, weeklyRevision: workspace.body.weeklyRevision, requestId: randomUUID() });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const stored = async () => (await db.query("select ballot from public.gtl_weekly_ballots where user_id=$1 and mode='guess_spread'", [luke.id])).rows[0].ballot;
    const before = await stored();
    expect([Object.keys(before.lockedAt ?? {}), before.submittedAt ?? null]).toEqual([[first], null]);

    await signIn(page, 'luke');
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Picks/ }).click();
    const spread = page.getByRole('group', { name: 'Market' }).getByRole('button', { name: /^Spread/ });
    await spread.click();
    await expect(spread).toHaveAttribute('aria-pressed', 'true');
    const [locked, draft] = [page.locator('.week-pick').nth(0), page.locator('.week-pick').nth(1)];
    await expect(locked.locator('.chip-summary')).toHaveText('Cowboys −3');
    for (const chip of await locked.locator('.team-chip, .number-chip').all()) await expect(chip).toBeDisabled();
    const draftChips = draft.locator('.team-chip, .number-chip');
    expect(await draftChips.count()).toBeGreaterThan(0);
    for (const chip of await draftChips.all()) await expect(chip).toBeEnabled();
    await expect(page.locator('.save-bar')).toBeVisible();
    const header = page.locator('.week-picks > p.muted');
    await expect(header).toContainText('2/2 picked');
    await expect(header).not.toContainText('Submitted');

    // The draft game still changes and saves; the locked-in game keeps its pick and its lock-in time.
    const summary = await draft.locator('.chip-summary').innerText();
    await draft.locator('.number-chip:not([aria-checked="true"])').first().click();
    await expect(draft.locator('.chip-summary')).not.toHaveText(summary);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
    const after = await stored();
    expect([after.picks[first], after.lockedAt, after.submittedAt ?? null]).toEqual([-3, before.lockedAt, null]);
    expect(after.picks[second]).not.toBe(2.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});
