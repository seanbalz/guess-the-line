// Persona (f): impatient user. What happens on network failure, on a 409 conflict and on an
// expired session? Are the errors actionable, or does the screen just go quiet?
import { test, expect, pgliteAvailable } from './harness.mjs';

test.use({ viewport: { width: 390, height: 844 } });

test('impatient: offline load, offline save, real 409 conflict, injected 409, expired session, 503', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start({ games: 3 });

  // 1. The feed cannot load (offline right after sign-in).
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('ben@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  persona.net.fail = endpoint => endpoint.startsWith('community/') ? { status: 503, body: { error: 'Service unavailable.' } } : null;
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  const alert = page.getByRole('alert');
  const silent = (await alert.count()) === 0;
  await persona.shot('feed-503');
  if (silent) persona.finding({ screen: 'feed-503', severity: 2, experience: 'When the community service answers 503 (or 404, or the request never leaves the phone), the app silently shows "My games" instead of the home feed. There is no message, no "Try again", and the "← Community" link is hidden, so the player believes the product has no feed and no picks due this week.', fix: 'Show the Community shell with an error banner and a Retry button; fall back to My games only for a 404 from an undeployed function, and say so.' });
  persona.net.fail = null;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();

  // 2. Offline while saving a draft.
  await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).click();
  const first = page.locator('.week-pick').first();
  await first.getByRole('button', { name: 'Cowboys', exact: true }).click();
  await first.getByRole('button', { name: '−3', exact: true }).click();
  persona.net.offline = true;
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(alert).toBeVisible();
  const offlineText = await alert.innerText();
  await persona.shot('save-offline');
  persona.finding({ screen: 'save-offline', severity: 2, experience: `Saving with no connection shows the raw browser error "${offlineText.trim()}" in the red banner. There is no "you are offline", no retry button, and the picks stay only in memory. The banner sits above the list, so a player scrolled to game 3 sees the chips re-enable and nothing else.`, fix: 'Map TypeError/AbortError to "No connection. Your picks are kept on this screen; tap Save again when you are back online." and add a Retry button to the banner; keep the draft in sessionStorage.' });
  persona.net.offline = false;
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();

  // 3. A real conflict: the same account saves from another device, then this screen saves stale picks.
  await persona.saveBallot('guess_spread', { 'TB-DAL': -7 }, false);
  await first.getByRole('button', { name: '−4', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(alert).toBeVisible();
  const conflictText = await alert.innerText();
  const refreshButton = await alert.getByRole('button').count();
  await persona.shot('save-409');
  persona.finding({ screen: 'save-409', severity: 2, experience: `After the same account saved from another device, saving here fails with "${conflictText.trim()}". The banner has ${refreshButton ? 'a button' : 'no button'}; the only "Refresh" is a small text button at the very bottom of the page, and tapping it (or reloading) discards the picks on this screen. The player cannot see what changed on the other device before deciding.`, fix: 'Put "Load the latest saved picks" in the banner, merge: keep this screen\'s unsaved picks highlighted against the newly loaded ballot, and let the player resave.' });
  expect(conflictText).toMatch(/changed|Refresh/);

  // 4. The session expires between loading and saving.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).click();
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: 'Cowboys', exact: true }).click();
  await first.getByRole('button', { name: '−5', exact: true }).click();
  persona.net.expireSession = true;
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(alert).toBeVisible();
  const expiredText = await alert.innerText();
  await persona.shot('save-expired');
  persona.finding({ screen: 'save-expired', severity: 2, experience: `With an expired or revoked session the save fails with "${expiredText.trim()}". The player still looks signed in ("Signed in as Ben Fixture" at the bottom), there is no sign-in form or button in the banner, and the "Sign out" control is at the end of the page. Reloading keeps the dead session, so the loop repeats.`, fix: 'On 401 from the API, show "Your session expired" with a "Sign in again" button that signs out locally and returns to the sign-in form with the email prefilled; keep the unsaved picks in sessionStorage.' });
  persona.net.expireSession = false;

  // 5. Double-tap protection on Save and Submit.
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  const requestsBefore = persona.net.requests.filter(r => r.endpoint === 'personal/ballot').length;
  await page.getByRole('button', { name: 'Save draft' }).isDisabled();
  persona.finding({ screen: 'save-expired', severity: 4, experience: `After a successful save, "Save draft" is disabled until a pick changes (${requestsBefore} ballot requests so far, one per tap), and each save carries a request id so a retried tap cannot double-write. Good.`, fix: 'Keep it.' });

  // 6. Submitting when fresh sportsbook quotes cannot be verified (D-17 rejects the save).
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: /^Picks/ }).click();
  await expect(first).toBeVisible();
  for (const [i, pick] of [['Cowboys', '−3'], ['Eagles', '−2.5'], ['Dolphins', '−1']].entries()) { const card = page.locator('.week-pick').nth(i); await card.getByRole('button', { name: pick[0], exact: true }).click(); await card.getByRole('button', { name: pick[1], exact: true }).click(); }
  persona.net.quotesUnavailable = true;
  await page.getByRole('button', { name: 'Submit Spread' }).click();
  await expect(alert).toBeVisible();
  const quotesText = await alert.innerText();
  await persona.shot('submit-no-quotes');
  persona.finding({ screen: 'submit-no-quotes', severity: 2, experience: `When the market reference cannot be refreshed, Submit fails with "${quotesText.trim()}". The sentence is honest but assumes the player knows what a "market reference" is; it does not say whether the draft was saved (it was not: the three picks are only on this screen), when to retry, or that Save draft would keep them.`, fix: 'Save the draft automatically before the reference check, then say: "Your 3 picks are saved as a draft. We could not fetch fresh sportsbook lines to lock in your submission; try again in a few minutes."' });
  expect(quotesText).toContain('not submitted');
  persona.net.quotesUnavailable = false;

  // 7. Like a post while the service is briefly failing: the busy flag greys out every control on the feed.
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.locator('.feed-post').first()).toBeVisible();
  persona.net.fail = endpoint => endpoint === 'community/like' ? { status: 500, body: { error: 'Something went wrong.' } } : null;
  await page.locator('.feed-post').first().getByRole('button', { name: /likes/ }).click();
  await expect(alert).toBeVisible();
  const likeText = await alert.innerText();
  const alertBox = await alert.boundingBox();
  const postBox = await page.locator('.feed-post').first().boundingBox();
  await persona.shot('like-500');
  persona.finding({ screen: 'like-500', severity: 3, experience: `A failed like shows "${likeText.trim()}" ${alertBox && postBox && alertBox.y < postBox.y - 200 ? `${Math.round(postBox.y - alertBox.y)}px above the post that was tapped` : 'near the post'}, and the heart does not change. On a phone the banner is off-screen when the post is further down the feed; the tap simply appears to do nothing.`, fix: 'Show action errors inline under the post (or as a toast) and keep the heart in an "unsaved" state with a retry.' });
  persona.net.fail = null;
  expect(await persona.noOverflow()).toBe(true);
});
