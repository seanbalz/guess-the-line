// Persona (f): impatient user. What happens on network failure, on a 409 conflict and on an
// expired session? Are the errors actionable, or does the screen just go quiet?
import { test, expect, pgliteAvailable } from './harness.mjs';

test.use({ viewport: { width: 390, height: 844 } });

test('impatient: offline load, offline save, real 409 conflict, injected 409, expired session, 503', async ({ page, persona }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await persona.start({ games: 3 });

  // 1. The feed cannot load (503 right after sign-in). Quick win 5 (#7): the Community shell stays, with the error and a Retry;
  //    only a 404 from an undeployed function falls back to My games.
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('ben@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  persona.net.fail = endpoint => endpoint.startsWith('community/') ? { status: 503, body: { error: 'Service unavailable.' } } : null;
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Service unavailable.');
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toHaveCount(0);
  await persona.shot('feed-503');
  persona.net.fail = null;
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('.picks-due')).toBeVisible();
  await expect(alert).toHaveCount(0);

  // 2. Offline while saving a draft. Quick win 6 (#8): a plain offline message with Retry, beside the save bar; the picks stay on screen.
  await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).click();
  const first = page.locator('.week-pick').first();
  await first.getByRole('button', { name: 'Cowboys', exact: true }).click();
  await first.getByRole('button', { name: '−3', exact: true }).click();
  persona.net.offline = true;
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('No connection. Your picks are kept on this screen; reconnect and tap Retry.');
  await expect(page.locator('.save-bar').getByRole('alert')).toHaveCount(1);
  await expect(first.locator('.chip-summary')).toHaveText('Cowboys −3');
  await persona.shot('save-offline');
  persona.net.offline = false;
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  await expect(alert).toHaveCount(0);

  // 3. A real conflict: the same account saves from another device, then this screen saves stale picks.
  //    "Load latest" brings in the other device's ballot and keeps this screen's unsaved edit on top of it.
  await persona.saveBallot('guess_spread', { 'TB-DAL': -7 }, false);
  await first.getByRole('button', { name: '−4', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(alert).toBeVisible();
  const conflictText = await alert.innerText();
  await persona.shot('save-409');
  expect(conflictText).toMatch(/changed|Refresh/);
  await alert.getByRole('button', { name: 'Load latest' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Latest saved picks loaded.' })).toBeVisible();
  await expect(first.locator('.chip-summary')).toHaveText('Cowboys −4');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  const merged = (await persona.db.query("select ballot from public.gtl_weekly_ballots where user_id=$1 and mode='guess_spread'", [persona.user.id])).rows[0].ballot;
  expect(merged.picks['TB-DAL']).toBe(-4);
  persona.finding({ screen: 'save-409', severity: 4, experience: `After the same account saved from another device, saving here fails with "${conflictText.replace(/\n/g, ' ').trim()}" and "Load latest" merges the other device's ballot under this screen's unsaved edit. The merge is silent: nothing highlights which games changed on the other device.`, fix: 'Mark the games whose saved value changed since this screen loaded, so the player can compare before resaving.' });

  // 4. The session expires between loading and saving: the banner says so and offers "Sign in again".
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).click();
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: 'Cowboys', exact: true }).click();
  await first.getByRole('button', { name: '−5', exact: true }).click();
  persona.net.expireSession = true;
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Your session has expired. The picks on this screen are not saved yet; sign in again to continue.');
  await expect(alert.getByRole('button', { name: 'Sign in again' })).toBeVisible();
  await persona.shot('save-expired');
  persona.finding({ screen: 'save-expired', severity: 4, experience: 'With an expired or revoked session the save fails with "Your session has expired…" and a "Sign in again" button, while the footer still reads "Signed in as Ben Fixture". The unsaved picks live only on this screen until the player signs back in.', fix: 'Prefill the email on the sign-in form and keep the unsaved picks in sessionStorage so they survive the round trip.' });
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
  persona.finding({ screen: 'submit-no-quotes', severity: 2, experience: `When the market reference cannot be refreshed, Submit fails with "${quotesText.replace(/\n/g, ' ').trim()}". The sentence is honest but assumes the player knows what a "market reference" is; it does not say whether the draft was saved (it was not: the three picks are only on this screen), when to retry, or that Save draft would keep them.`, fix: 'Save the draft automatically before the reference check, then say: "Your 3 picks are saved as a draft. We could not fetch fresh sportsbook lines to lock in your submission; try again in a few minutes."' });
  expect(quotesText).toContain('not submitted');
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
  persona.net.quotesUnavailable = false;

  // 7. Like a post while the service is briefly failing. Quick win 6 (#26): the error sits inside the post with a Retry.
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.locator('.feed-post').first()).toBeVisible();
  persona.net.fail = endpoint => endpoint === 'community/like' ? { status: 500, body: { error: 'Something went wrong.' } } : null;
  const post = page.locator('.feed-post').first();
  await post.getByRole('button', { name: /likes/ }).click();
  await expect(post.getByRole('alert')).toContainText('Something went wrong.');
  await expect(alert).toHaveCount(1);
  await expect(post.getByRole('button', { name: /likes/ })).toHaveAttribute('aria-pressed', 'false');
  await persona.shot('like-500');
  persona.net.fail = null;
  await post.getByRole('alert').getByRole('button', { name: 'Retry' }).click();
  await expect(post.getByRole('button', { name: /likes/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(alert).toHaveCount(0);
  expect(await persona.noOverflow()).toBe(true);
});
