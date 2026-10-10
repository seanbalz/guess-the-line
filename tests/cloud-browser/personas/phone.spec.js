// Persona (b): casual phone user at 390px on a slow connection (every request delayed),
// interrupted mid-ballot: tab switch, reload, back button. Does the draft survive?
import { test, expect, pgliteAvailable, id } from './harness.mjs';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

// Persona audit #3: the tab copy of unsaved Community picks lives in sessionStorage under one account, season, week and market.
const DRAFT_PREFIX = 'gtl.community-tab-draft.';
const draftKeys = page => page.evaluate(prefix => Object.keys(sessionStorage).filter(key => key.startsWith(prefix)), DRAFT_PREFIX);
const ballotRequests = persona => persona.net.requests.filter(r => r.endpoint === 'personal/ballot').length;
const hash = page => new URL(page.url()).hash;
const pick = async (card, team, line) => { await card.getByRole('button', { name: team, exact: true }).click(); await card.getByRole('button', { name: line, exact: true }).click(); };

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
  const nav = page.getByRole('navigation', { name: 'Community sections' });
  const cards = page.locator('.week-pick'), ready = page.locator('.save-bar strong'), recovery = page.locator('.picks-recovery');

  // Start the ballot. Persona audit #3: the Picks tab is a history entry of its own (#picks).
  await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).click();
  const t1 = Date.now();
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  expect(hash(page)).toBe('#picks-spread'); // The entry names the market once the week is known: Spread, the first market still due.
  persona.finding({ screen: 'picks', severity: 4, experience: `Opening Picks re-fetches the week (${((Date.now() - t1) / 1000).toFixed(1)} s on the slow link) and shows "Loading this week…" even though the feed call already knew the week, the deadline and the counts.`, fix: 'Reuse the feed payload for the header and show the game list as soon as it arrives; prefetch /personal when the picks-due card renders.' });
  for (const [i, [team, line]] of [['Cowboys', '−3'], ['Eagles', '−2.5'], ['Bears', '−1'], ['Dolphins', '−6'], ['Jets', '−3.5']].entries()) await pick(cards.nth(i), team, line);
  await expect(ready).toHaveText('5/14 ready');
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
  // The five picks are a tab copy for this account only; nothing has been sent to the service.
  expect(await draftKeys(page)).toEqual([`${DRAFT_PREFIX}v1.${encodeURIComponent(id(1))}.${persona.state.league.season}.${persona.state.league.week}.guess_spread`]);
  expect(ballotRequests(persona)).toBe(0);

  // Interruption 1: tapping Feed with five unsaved picks. Persona audit #3: the picks stay in this tab and are offered back on return,
  // the explicit way the group ballot and Solo do it ("Restore" / "Discard"), never silently and never as a saved ballot.
  await nav.getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.locator('.picks-due')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.picks-due')).toContainText('Spread 0/14');
  expect(hash(page)).toBe('#feed');
  await nav.getByRole('button', { name: /^Picks/ }).click();
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  expect(hash(page)).toBe('#picks-spread');
  await expect(ready).toHaveText('0/14 ready');
  await expect(recovery).toContainText('Unsaved Spread picks found in this tab');
  await expect(recovery).toContainText('5 picks');
  await persona.shot('picks-recovery');
  await persona.axe('picks-recovery');
  await recovery.getByRole('button', { name: 'Restore picks' }).click();
  await expect(ready).toHaveText('5/14 ready');
  await expect(cards.first().locator('.chip-summary')).toHaveText('Cowboys −3');
  await expect(cards.nth(4).locator('.chip-summary')).toHaveText('Jets −3.5');
  await expect(recovery).toHaveCount(0);
  await expect(page.locator('.save-bar .save-notice')).toHaveText('Unsaved picks restored. Save or submit to keep them.');
  // Restore removed its own card, so focus moves on to the first chip rather than dropping to <body>.
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: 'Buccaneers' });
  expect(ballotRequests(persona)).toBe(0);

  // Interruption 2: reload with five unsaved picks (a phone browser evicting the tab). The URL hash keeps the tab and the market, so
  // the reload lands on Picks · Spread, and the tab copy brings the five picks back.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible({ timeout: 15000 });
  expect(hash(page)).toBe('#picks-spread');
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.picks-due')).toHaveCount(0);
  await expect(recovery).toContainText('5 picks');
  await persona.shot('after-reload');
  await recovery.getByRole('button', { name: 'Restore picks' }).click();
  await expect(ready).toHaveText('5/14 ready');
  await expect(cards.nth(3).locator('.chip-summary')).toHaveText('Dolphins −6');
  expect(ballotRequests(persona)).toBe(0);

  // Draft recovery: a saved draft survives reload on the account, and saving clears the tab copy.
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
  expect(await draftKeys(page)).toEqual([]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(cards.first().locator('.chip-summary')).toHaveText('Cowboys −3', { timeout: 15000 });
  await expect(ready).toHaveText('5/14 ready');
  await expect(recovery).toHaveCount(0); // Saved picks are account data, not a recovery copy.

  // Interruption 2, Total: half of every week's required picks are Total (D-21). The market is part of the Picks history entry
  // (#picks-total), so a reload mid-Total ballot lands on Total with the Total pick offered back, not on Spread with the copy out of
  // sight behind the Total button.
  const market = page.getByRole('group', { name: 'Market' }), totalButton = market.getByRole('button', { name: 'Total', exact: true }), spreadButton = market.getByRole('button', { name: 'Spread', exact: true });
  await totalButton.click();
  await expect(totalButton).toHaveAttribute('aria-pressed', 'true');
  expect(hash(page)).toBe('#picks-total');
  await expect(ready).toHaveText('0/14 ready');
  await cards.first().getByRole('button', { name: '44', exact: true }).click();
  await expect(ready).toHaveText('1/14 ready');
  await expect(cards.first().locator('.chip-summary')).toHaveText('44 total points');
  expect(await draftKeys(page)).toEqual([`${DRAFT_PREFIX}v1.${encodeURIComponent(id(1))}.${persona.state.league.season}.${persona.state.league.week}.guess_total`]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible({ timeout: 15000 });
  expect(hash(page)).toBe('#picks-total');
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  await expect(totalButton).toHaveAttribute('aria-pressed', 'true');
  await expect(spreadButton).toHaveAttribute('aria-pressed', 'false');
  await expect(ready).toHaveText('0/14 ready');
  await expect(recovery).toContainText('Unsaved Total picks found in this tab');
  await expect(recovery).toContainText('1 pick from');
  await expect(cards.first().locator('.number-chip.selected')).toHaveCount(0); // Offered back, never applied silently.
  await recovery.getByRole('button', { name: 'Restore picks' }).click();
  await expect(ready).toHaveText('1/14 ready');
  await expect(cards.first().locator('.chip-summary')).toHaveText('44 total points');
  await expect(recovery).toHaveCount(0);
  // Back to Spread: switching markets saves the open draft first (#5), so the Total pick becomes account data and its tab copy goes;
  // the five saved Spread picks are untouched, and the entry names Spread again.
  await spreadButton.click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved. Now showing Spread.' })).toBeVisible({ timeout: 15000 });
  await expect(spreadButton).toHaveAttribute('aria-pressed', 'true');
  expect(hash(page)).toBe('#picks-spread');
  await expect(ready).toHaveText('5/14 ready');
  await expect(cards.first().locator('.chip-summary')).toHaveText('Cowboys −3');
  expect(await draftKeys(page)).toEqual([]);
  await nav.getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.locator('.picks-due')).toContainText('Spread 5/14', { timeout: 15000 });
  await expect(page.locator('.picks-due')).toContainText('Total 1/14');
  // The Picks tab opens bare (#picks) and settles on the first market still due, Spread, once the week is known.
  await nav.getByRole('button', { name: /^Picks/ }).click();
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  expect(hash(page)).toBe('#picks-spread');

  // Interruption 3: the phone's back button. Persona audit #3: each screen is a history entry, so Back returns to the feed instead of
  // leaving Guess The Line, Forward returns to Picks, and the unsaved sixth pick is waiting in this tab.
  await pick(cards.nth(5), 'Titans', '−7');
  await expect(ready).toHaveText('6/14 ready');
  const origin = new URL(page.url()).origin;
  await page.goBack();
  await expect(page.locator('.picks-due')).toBeVisible({ timeout: 15000 });
  expect(new URL(page.url()).origin).toBe(origin);
  expect(hash(page)).toBe('#feed');
  await expect(page.locator('.picks-due')).toContainText('Spread 5/14');
  await page.goForward();
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  expect(hash(page)).toBe('#picks-spread');
  await expect(recovery).toContainText('1 pick');
  await recovery.getByRole('button', { name: 'Restore picks' }).click();
  await expect(ready).toHaveText('6/14 ready');
  await expect(cards.nth(5).locator('.chip-summary')).toHaveText('Titans −7');
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  expect(await persona.noOverflow()).toBe(true);

  // Sign-out and account switch: the tab copy belongs to Ben alone. Signing out clears it, and even a copy that survived under
  // Ben's key is never offered to Troy, whose Picks start empty.
  const [benKey, benCopy] = await page.evaluate(prefix => Object.entries(sessionStorage).find(([key]) => key.startsWith(prefix)), DRAFT_PREFIX);
  expect(benKey).toContain(encodeURIComponent(id(1)));
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your games. Any device.' })).toBeVisible({ timeout: 15000 });
  expect(await draftKeys(page)).toEqual([]);
  persona.user.id = id(2); // Troy Fixture signs in on the same phone.
  await persona.signIn();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.hub-bottom')).toContainText('Signed in as Troy Fixture');
  await page.evaluate(([key, value]) => sessionStorage.setItem(key, value), [benKey, benCopy]);
  await expect(page.locator('.picks-due')).toBeVisible({ timeout: 15000 });
  await nav.getByRole('button', { name: /^Picks/ }).click();
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  await expect(ready).toHaveText('0/14 ready');
  await expect(recovery).toHaveCount(0);
  await expect(cards.first().locator('.team-chip.selected')).toHaveCount(0);
  await pick(cards.first(), 'Buccaneers', '−1');
  expect((await draftKeys(page)).filter(key => key !== benKey)).toEqual([`${DRAFT_PREFIX}v1.${encodeURIComponent(id(2))}.${persona.state.league.season}.${persona.state.league.week}.guess_spread`]);
  expect(await persona.noOverflow()).toBe(true);
});
