// Persona (b): casual phone user at 390px on a slow connection (every request delayed),
// interrupted mid-ballot: tab switch, reload, back button. Does the draft survive?
import { test, expect, pgliteAvailable } from './harness.mjs';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('phone: slow network, interrupted ballot, reload and back button', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start();
  persona.net.delay = 400; // Slow-3G-like latency on every request, static and API.
  const t0 = Date.now();
  await persona.signIn();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  const loading = page.getByRole('status').filter({ hasText: 'Loading the feed' });
  const sawLoading = await loading.isVisible().catch(() => false);
  await expect(page.locator('.picks-due')).toBeVisible({ timeout: 15000 });
  const toFeed = Date.now() - t0;
  persona.finding({ screen: 'feed-slow', severity: 4, experience: `With 400 ms added to every request the home screen took ${(toFeed / 1000).toFixed(1)} s from tapping Sign in to the picks-due card. During that time the player sees "${sawLoading ? 'Loading the feed…' : 'nothing (the loading line was too brief to see)'}" under the title; the header, theme card and league switcher render first, so the page looks finished before the feed arrives.`, fix: 'Show skeleton rows for the picks-due card, leaderboard and three posts instead of a one-line status; keep the chrome from settling before the content.' });
  await persona.shot('feed');
  // Bigger changes (#19): the like button is at least 44px wide for a thumb.
  expect(await persona.smallTargets('feed')).toEqual([]);

  // Start the ballot.
  await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).click();
  const t1 = Date.now();
  await expect(page.locator('.week-pick').first()).toBeVisible({ timeout: 15000 });
  persona.finding({ screen: 'picks', severity: 4, experience: `Opening Picks re-fetches the week (${((Date.now() - t1) / 1000).toFixed(1)} s on the slow link) and shows "Loading this week…" even though the feed call already knew the week, the deadline and the counts.`, fix: 'Reuse the feed payload for the header and show the game list as soon as it arrives; prefetch /personal when the picks-due card renders.' });
  const cards = page.locator('.week-pick');
  for (const [i, team] of [['Cowboys', '−3'], ['Eagles', '−2.5'], ['Bears', '−1'], ['Dolphins', '−6'], ['Jets', '−3.5']].entries()) {
    const card = cards.nth(i);
    await card.getByRole('button', { name: team[0], exact: true }).click();
    await card.getByRole('button', { name: team[1], exact: true }).click();
  }
  await expect(page.locator('.save-bar strong')).toHaveText('5/14 ready');
  // Review of PR #34 (D-21): with the check outside the text flow, none of the five chosen team names is clipped at 390px.
  expect(await page.locator('.team-chip.selected').evaluateAll(chips => chips.filter(chip => chip.scrollWidth > chip.clientWidth).map(chip => chip.textContent))).toEqual([]);
  await persona.shot('picks-5-of-14');
  await persona.axe('picks-5-of-14');
  // Bigger changes (#24): the sticky bar carries the due time beside the ready count ("Due Fri 11:59 PM PT (today)"), and it
  // covers nothing that was scrolled or focused into view: scroll-padding keeps the last card, and a chip that receives
  // focus from the keyboard, above the bar instead of under it (WCAG 2.4.11).
  const bar = page.locator('.save-bar');
  const deadline = persona.state.league.deadline;
  const dueShort = new Date(deadline).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit' });
  await expect(bar.locator('.save-due')).toHaveText(`Due ${dueShort} PT (today)`);
  const bottomOf = async locator => { const box = await locator.boundingBox(); return box.y + box.height; };
  const lastCard = cards.last();
  await lastCard.evaluate(el => el.scrollIntoView({ block: 'end' }));
  expect(await bottomOf(lastCard)).toBeLessThanOrEqual((await bar.boundingBox()).y + 1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await lastCard.locator('.team-chip').last().focus();
  expect(await bottomOf(lastCard.locator('.team-chip').last())).toBeLessThanOrEqual((await bar.boundingBox()).y + 1);
  const barBox = await bar.boundingBox();
  persona.finding({ screen: 'picks-5-of-14', severity: 4, experience: `The sticky save bar is ${Math.round(barBox.height)}px tall at the bottom with the ready count, the due time and the three buttons; a card or chip scrolled or focused into view stops above it. Good.`, fix: 'Keep it.' });

  // Interruption 1: tapping Feed with five unsaved picks. Nothing warns; the picks are gone.
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.locator('.picks-due')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.picks-due')).toContainText('Spread 0/14');
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: /^Picks/ }).click();
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.save-bar strong')).toHaveText('0/14 ready');
  persona.finding({ screen: 'picks-5-of-14', severity: 2, experience: 'After picking five games, tapping the Feed tab (or "Groups & games") discards all five picks with no warning and no way back. Returning to Picks shows 0/14. On a phone the Feed tab sits right above the first card, so a stray tap wipes the work.', fix: 'Keep unsaved picks in component state across tab switches (or sessionStorage like the group screens do), or confirm before leaving with unsaved changes.' });

  // Interruption 2: reload with unsaved picks (a phone browser evicting the tab).
  for (const [i, team] of [['Cowboys', '−3'], ['Eagles', '−2.5']].entries()) { const card = cards.nth(i); await card.getByRole('button', { name: team[0], exact: true }).click(); await card.getByRole('button', { name: team[1], exact: true }).click(); }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible({ timeout: 15000 });
  const landedOnFeed = !(await page.locator('.week-pick').first().isVisible().catch(() => false));
  if (landedOnFeed) persona.finding({ screen: 'picks-reload', severity: 2, experience: 'Reloading the page mid-ballot (iOS Safari does this when you switch apps) lands on the Feed, not on Picks, and the two unsaved picks are gone. The URL never changes (no hash or path per tab), so the browser cannot restore the screen either.', fix: 'Put the tab in the URL hash (#picks) and persist unsaved picks per account in sessionStorage; restore both on load.' });
  await persona.shot('after-reload');

  // Draft recovery: a saved draft does survive reload.
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: /^Picks/ }).click();
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  for (const [i, team] of [['Cowboys', '−3'], ['Eagles', '−2.5']].entries()) { const card = cards.nth(i); await card.getByRole('button', { name: team[0], exact: true }).click(); await card.getByRole('button', { name: team[1], exact: true }).click(); }
  const t2 = Date.now();
  await page.getByRole('button', { name: 'Save draft' }).click();
  // Quick win 6 (#26): the button reads "Saving…" while the request is out, and the confirmation lands in the sticky bar by the thumb.
  await expect(page.locator('.save-bar').getByRole('button', { name: 'Saving…' })).toBeVisible();
  const saved = page.getByRole('status').filter({ hasText: 'Draft saved.' });
  await expect(saved).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.save-bar .save-notice')).toHaveText('Draft saved.');
  const saveMs = Date.now() - t2;
  persona.finding({ screen: 'picks-draft-saved', severity: 4, experience: `"Save draft" took ${(saveMs / 1000).toFixed(1)} s on the slow link. While waiting, the button reads "Saving…" with a spinner and every chip greys out (busy); the confirmation "Draft saved." then appears inside the sticky save bar, so it is on screen wherever the player is scrolled.`, fix: 'Keep it; consider leaving the chips enabled while a draft saves so the player can keep picking.' });
  await persona.shot('picks-draft-saved');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.picks-due')).toContainText('Spread 2/14', { timeout: 15000 });
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: /^Picks/ }).click();
  await expect(cards.first().locator('.chip-summary')).toHaveText('Cowboys −3', { timeout: 15000 });
  await expect(page.locator('.save-bar strong')).toHaveText('2/14 ready');

  // Interruption 3: the phone's back button. The app has no history entries, so back leaves the site.
  const before = page.url();
  await page.goBack().catch(() => {});
  const after = page.url();
  if (after !== before) persona.finding({ screen: 'picks-back', severity: 2, experience: `Pressing the browser back button from the Picks tab leaves Guess The Line entirely (${before} → ${after}) instead of returning to the Feed, because tabs and screens never push history. On Android the hardware back button does the same.`, fix: 'Push a history entry per screen (feed, picks, groups, game) and handle popstate; a hash router is enough.' });
  await page.goForward().catch(() => {});
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible({ timeout: 15000 });
  expect(await persona.noOverflow()).toBe(true);
});
