// Persona (f): impatient user. What happens on network failure, on a 409 conflict and on an
// expired session? Are the errors actionable, or does the screen just go quiet?
import { test, expect, pgliteAvailable } from './harness.mjs';
import { useOldApp } from '../old-app.mjs';

test.use({ viewport: { width: 390, height: 844 } });

test('impatient: 503 and offline feed, offline save, real 409 conflict, injected 409 with a submission code, expired session, failed and offline like', async ({ page, persona }) => {
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
  // The error banner, not the picks-due card: inside two hours of the fixture's 11:59 PM PT deadline that card is an alert too.
  const alert = page.getByRole('alert').and(page.locator('.error-banner'));
  await expect(alert).toContainText('Service unavailable.');
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toHaveCount(0);
  await persona.shot('feed-503');
  await persona.axe('feed-503');
  persona.net.fail = null;
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('.picks-due')).toBeVisible();
  await expect(alert).toHaveCount(0);
  // Retry removed the banner it sat in, so focus moves to main (the skip link's target) rather than dropping to <body>.
  expect((await persona.focused()).tag).toBe('main');

  // 1b. The feed cannot load because the device is offline (the lobby still answers). Quick win 6 (#8): the raw "Failed to fetch"
  //     is mapped to a plain offline sentence, with the same Retry.
  persona.net.offline = endpoint => endpoint.startsWith('community/');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await expect(alert).toContainText('No connection. Reconnect and tap Retry.');
  await expect(alert).not.toContainText('Failed to fetch');
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toHaveCount(0);
  await persona.shot('feed-offline');
  await persona.axe('feed-offline');
  persona.net.offline = false;
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('.picks-due')).toBeVisible();
  await expect(alert).toHaveCount(0);

  // 2. Offline while saving a draft. Quick win 6 (#8): a plain offline message with Retry, beside the save bar; the picks stay on screen.
  await page.locator('.picks-due').getByRole('button', { name: 'Make picks' }).click();
  const first = page.locator('.week-pick').first();
  await first.getByRole('button', { name: 'Cowboys', exact: true }).click();
  await first.getByRole('radio', { name: '−3', exact: true }).click();
  persona.net.offline = true;
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('No connection. Your picks are kept on this screen; reconnect and tap Retry.');
  await expect(page.locator('.save-bar').getByRole('alert')).toHaveCount(1);
  await expect(first.locator('.chip-summary')).toHaveText('Cowboys −3');
  await persona.shot('save-offline');
  await persona.axe('save-offline');
  persona.net.offline = false;
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  await expect(alert).toHaveCount(0);
  // Retry removed its own banner: focus goes back to the Save draft button that was being retried (aria-disabled until a pick changes).
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: 'Save draft', disabled: false });

  // 3. A real conflict: the same account saves from another device, then this screen saves stale picks.
  //    "Load latest" brings in the other device's ballot and keeps this screen's unsaved edit on top of it.
  await persona.saveBallot('guess_spread', { 'TB-DAL': -7 }, false);
  await first.getByRole('radio', { name: '−4', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(alert).toBeVisible();
  const conflictText = await alert.innerText();
  await persona.shot('save-409');
  await persona.axe('save-409');
  expect(conflictText).toMatch(/changed|Refresh/);
  await expect(alert.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await alert.getByRole('button', { name: 'Load latest' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Latest saved picks loaded.' })).toBeVisible();
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: 'Save draft' });
  await expect(first.locator('.chip-summary')).toHaveText('Cowboys −4');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  const merged = (await persona.db.query("select ballot from public.gtl_weekly_ballots where user_id=$1 and mode='guess_spread'", [persona.user.id])).rows[0].ballot;
  expect(merged.picks['TB-DAL']).toBe(-4);
  persona.finding({ screen: 'save-409', severity: 4, experience: `After the same account saved from another device, saving here fails with "${conflictText.replace(/\n/g, ' ').trim()}" and "Load latest" merges the other device's ballot under this screen's unsaved edit. The merge is silent: nothing highlights which games changed on the other device.`, fix: 'Mark the games whose saved value changed since this screen loaded, so the player can compare before resaving.' });

  // 3b. An injected 409 that is not a revision conflict: since October 12, 2026 (D-27) the only coded 409 left is the
  //     submission guard's failed check of the saved line (GTL_SUBMISSION_QUOTES_REQUIRED); refresh limits never refuse a save.
  //     Review of PR #34: that case keeps its own "Keep your draft and try again" sentence and a Retry, never "Load latest"
  //     (which would reload the week and merge).
  await first.getByRole('radio', { name: '−5', exact: true }).click();
  persona.net.fail = endpoint => endpoint === 'personal/ballot' ? { status: 409, body: { error: 'The line for a changed guess could not be verified. Your guesses were not submitted. Keep your draft and try again.', code: 'GTL_SUBMISSION_QUOTES_REQUIRED', submitted: false } } : null;
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Keep your draft and try again.');
  await expect(alert.getByRole('button', { name: 'Load latest' })).toHaveCount(0);
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
  await persona.shot('save-409-code');
  await persona.axe('save-409-code');
  persona.net.fail = null;
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  await expect(alert).toHaveCount(0);

  // 4. The session expires between loading and saving: the banner says so, puts Retry first and warns that "Sign in again" clears the screen.
  //    Persona audit #3: the tab lives in the URL hash, so the reload lands back on Picks with no "Make picks" tap.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await expect(first).toBeVisible();
  await first.getByRole('button', { name: 'Cowboys', exact: true }).click();
  await first.getByRole('radio', { name: '−6', exact: true }).click();
  persona.net.expireSession = true;
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Your session has expired and these picks are not saved. Retry first; if that fails, note your picks, then sign in again (it clears this screen).');
  await expect(alert.locator('.banner-actions button')).toHaveText(['Retry', 'Sign in again']);
  await persona.shot('save-expired');
  await persona.axe('save-expired');
  persona.finding({ screen: 'save-expired', severity: 4, experience: 'With an expired or revoked session the save fails with "Your session has expired and these picks are not saved…", Retry first and then "Sign in again", while the footer still reads "Signed in as Ben Fixture". The banner is honest: the unsaved picks live only in this screen\'s state and are gone the moment "Sign in again" is pressed, so it tells the player to note them first.', fix: 'Prefill the email on the sign-in form and keep the unsaved picks in sessionStorage so they survive the round trip.' });
  persona.net.expireSession = false;

  // 5. Double-tap protection on Save and Submit.
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  const requestsBefore = persona.net.requests.filter(r => r.endpoint === 'personal/ballot').length;
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  persona.finding({ screen: 'save-expired', severity: 4, experience: `After a successful save, "Save draft" is disabled until a pick changes (${requestsBefore} ballot requests so far, one per tap), and each save carries a request id so a retried tap cannot double-write. Good.`, fix: 'Keep it.' });

  // 6. Submitting when fresh sportsbook quotes cannot be verified. Since October 12, 2026 (D-27) the refresh is advisory:
  //    the submit is never refused; each guess keeps the newest stored line, or the first line collected after it.
  await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: /^Picks/ }).click();
  await expect(first).toBeVisible();
  for (const [i, pick] of [['Cowboys', '−3'], ['Eagles', '−2.5'], ['Dolphins', '−1']].entries()) { const card = page.locator('.week-pick').nth(i); await card.getByRole('button', { name: pick[0], exact: true }).click(); await card.getByRole('radio', { name: pick[1], exact: true }).click(); }
  persona.net.quotesUnavailable = true;
  await page.getByRole('button', { name: 'Submit Spread' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Spread picks submitted.' })).toBeVisible();
  await expect(alert).toHaveCount(0);
  await persona.shot('submit-no-quotes');
  await persona.axe('submit-no-quotes');
  const submitted = (await persona.db.query("select ballot from public.gtl_weekly_ballots where user_id=$1 and mode='guess_spread'", [persona.user.id])).rows[0].ballot;
  expect(submitted.submittedAt).toBeTruthy();
  expect(submitted.picks['TB-DAL']).toBe(-3);
  persona.finding({ screen: 'submit-no-quotes', severity: 4, experience: 'When fresh sportsbook lines cannot be fetched, Submit still succeeds (D-27): the ballot is submitted and each guess keeps the line at the guess, the newest stored line or the first one collected after it. No refusal, no retry loop.', fix: 'Keep it.' });
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
  await persona.axe('like-500');
  persona.net.fail = null;
  await post.getByRole('alert').getByRole('button', { name: 'Retry' }).click();
  await expect(post.getByRole('button', { name: /likes/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(alert).toHaveCount(0);
  // Retry removed the post's banner: focus returns to the like button that was retried.
  expect(await persona.focused()).toMatchObject({ tag: 'button', name: expect.stringMatching(/likes$/) });

  // 7b. Like a post while offline. Quick win 6 (#8, #26): the raw "Failed to fetch" reads as the same plain offline sentence inside the post.
  persona.net.offline = true;
  await post.getByRole('button', { name: /likes/ }).click();
  await expect(post.getByRole('alert')).toContainText('No connection. Reconnect and tap Retry.');
  await expect(post.getByRole('alert')).not.toContainText('Failed to fetch');
  await expect(post.getByRole('button', { name: /likes/ })).toHaveAttribute('aria-pressed', 'true');
  persona.net.offline = false;
  await post.getByRole('alert').getByRole('button', { name: 'Retry' }).click();
  await expect(post.getByRole('button', { name: /likes/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(alert).toHaveCount(0);
  expect(await persona.noOverflow()).toBe(true);
});

// D-60: this spec covers the old app, which now opens only at ?app=classic (Menu › "Older records and tools").
test.beforeEach(({ page }) => useOldApp(page));
