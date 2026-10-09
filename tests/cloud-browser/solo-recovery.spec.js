import { test as base, expect } from '@playwright/test';
import { seed } from '../../server/store.mjs';
import { soloDraftScope } from '../../web/src/soloDraft.js';

// UI recovery coverage uses explicit synthetic authenticated responses. It does
// not submit real picks, consume provider credits or replace SQL integration tests.
const accountId = '11111111-1111-4111-8111-111111111111';
const test = base.extend({
  solo: async ({ page, baseURL }, use) => {
    const games = seed().games.slice(0, 2);
    const data = { scope: 'account_private', season: 2026, week: 5, revision: 0, weeklyRevision: 0,
      now: '2026-10-08T18:00:00Z', deadline: '2026-10-09T00:15:00Z', slates: [{ season: 2026, week: 5 }],
      games, ballots: {}, favorites: [], forecasts: [], journal: [] };
    const report = { data, failures: [], reads: 0, readFailure: false, attempts: [], errors: [] };
    const user = { id: accountId, aud: 'authenticated', role: 'authenticated', email: 'solo@example.test',
      app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', exp: expires })).toString('base64url')}.test`;
    const session = { access_token: token, refresh_token: 'test-only', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      if (url.origin !== 'https://gtl-frontend-check.supabase.co') { report.errors.push(`Unexpected origin ${url.origin}`); return route.abort(); }
      const reply = (status, body) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/auth/v1/token') return reply(200, session);
      if (url.pathname === '/auth/v1/user') return reply(200, user);
      if (url.pathname === '/auth/v1/logout') return reply(200, {});
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      expect(url.search).toBe('');
      const endpoint = url.pathname.replace('/functions/v1/gtl-api/', '');
      if (endpoint === 'lobby') return reply(200, { profile: { id: accountId, displayName: 'Solo Tester' }, pendingInvites: [], leagues: [] });
      if (endpoint === 'personal' || endpoint === 'personal/read') {
        expect(request.method()).toBe(endpoint === 'personal' ? 'GET' : 'POST');
        if (endpoint === 'personal/read') expect(request.postDataJSON()).toEqual({ season: 2026, week: 5, includeArchived: false });
        report.reads++;
        if (report.readFailure) return reply(503, { error: 'Saved data is temporarily unavailable.' });
        return reply(200, data);
      }
      if (endpoint === 'personal/ballot') {
        const body = request.postDataJSON(); report.attempts.push(body);
        expect(Object.keys(body).sort()).toEqual(['mode', 'picks', 'requestId', 'revision', 'season', 'submit', 'week', 'weeklyRevision'].sort());
        expect(body.revision).toBe(data.revision); expect(body.weeklyRevision).toBe(data.weeklyRevision);
        const failure = report.failures.shift();
        if (failure && !['commit-and-drop', 'ack-read-fail'].includes(failure)) return reply(failure.status, failure.body);
        data.ballots[body.mode] = { picks: body.picks, submittedAt: body.submit ? data.now : null };
        data.revision++; data.weeklyRevision++;
        if (failure === 'commit-and-drop') return route.abort('failed');
        if (failure === 'ack-read-fail') report.readFailure = true;
        return reply(200, { saved: true });
      }
      report.errors.push(`Unexpected endpoint ${endpoint}`); return reply(404, { error: 'Unexpected fixture request' });
    });
    try { await use(report); expect(report.errors).toEqual([]); } finally { await page.unroute('**/*'); }
  },
});

async function signIn(page) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('solo@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open Solo' }).click();
  await page.getByRole('button', { name: 'Guesses', exact: true }).click();
}
async function openGuessesAfterReload(page, mode = 'Spread') {
  await page.reload();
  await page.getByRole('button', { name: 'Guesses', exact: true }).click();
  if (mode === 'Total') await page.getByRole('button', { name: 'Total', exact: true }).click();
}
const recoveryKey = mode => soloDraftScope({ accountId, season: 2026, week: 5, mode });
const readCopy = (page, mode = 'guess_spread') => page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), recoveryKey(mode));

for (const [mode, values, width, theme] of [['Spread', ['-9.5', '0'], 320, 'dark'], ['Total', ['44.5', '0'], 390, 'light']]) {
  test(`${width}px ${theme} ${mode} recovery requires explicit restore after quote failure and reload`, async ({ page, solo }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(theme => localStorage.setItem('gtl.theme', theme), theme);
    await signIn(page); if (mode === 'Total') await page.getByRole('button', { name: 'Total', exact: true }).click();
    const modeId = mode === 'Total' ? 'guess_total' : 'guess_spread';
    for (const [index, game] of solo.data.games.entries()) await page.getByLabel(`${game.id} ${mode} guess`).fill(values[index]);
    await expect(page.getByText('Unsaved guesses kept in this tab only.', { exact: false })).toBeVisible();
    solo.failures.push({ status: 429, body: { error: 'Fresh quotes unavailable. Your entries were not submitted.', code: 'GTL_SUBMISSION_REFRESH_LIMIT', submitted: false } });
    await page.getByRole('button', { name: 'Review full ballot', exact: true }).click();
    await page.getByRole('button', { name: `Submit ${mode} guesses`, exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('not submitted');
    await expect(page.getByRole('button', { name: `Submit ${mode} guesses`, exact: true })).toBeEnabled();
    expect(solo.data.ballots).toEqual({}); expect((await readCopy(page, modeId)).draft).toEqual(Object.fromEntries(solo.data.games.map((game, index) => [game.id, values[index]])));
    await openGuessesAfterReload(page, mode);
    await expect(page.getByLabel('Unsaved Solo recovery')).toContainText('not been saved to your account or submitted');
    await expect(page.getByLabel(`${solo.data.games[0].id} ${mode} guess`)).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Restore unsaved guesses' }).press('Enter');
    for (const [index, game] of solo.data.games.entries()) await expect(page.getByLabel(`${game.id} ${mode} guess`)).toHaveValue(values[index]);
    await expect(page.getByLabel(`${solo.data.games[0].id} ${mode} guess`)).toBeFocused();
    expect(solo.attempts).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Guesses', exact: true })).toHaveCSS('background-color', 'rgb(184, 243, 75)');
    await expect(page.getByRole('button', { name: 'Favorites', exact: true })).toHaveCSS('background-color', theme === 'dark' ? 'rgb(32, 43, 67)' : 'rgb(233, 238, 245)');
    await page.screenshot({ path: `.local/previews/solo-recovery-${width}-${theme}.png`, fullPage: true });
    await page.getByRole('button', { name: mode === 'Total' ? 'Spread' : 'Total', exact: true }).click();
    await expect(page.getByLabel('Unsaved Solo recovery')).toHaveCount(0);
    await expect(page.getByLabel(`${solo.data.games[0].id} ${mode === 'Total' ? 'Spread' : 'Total'} guess`)).toHaveValue('');
    expect(solo.data.ballots).toEqual({});
  });
}

test('recovered Solo edits merge remote fields and require a choice for a conflicting saved guess', async ({ page, solo }) => {
  solo.data.ballots.guess_spread = { picks: { 'TB-DAL': -3 }, submittedAt: null };
  await signIn(page); await page.getByLabel('TB-DAL Spread guess').fill('-4');
  solo.data.ballots.guess_spread.picks = { 'TB-DAL': -5, 'PHI-JAX': 2 }; solo.data.weeklyRevision++;
  await openGuessesAfterReload(page);
  await page.getByRole('button', { name: 'Restore unsaved guesses' }).click();
  await expect(page.getByLabel('PHI-JAX Spread guess')).toHaveValue('2');
  await expect(page.getByLabel('TB-DAL recovery conflict')).toContainText('Recovered: -4 · Account: -5');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Use recovered guess' }).click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved to your account');
  expect(solo.data.ballots.guess_spread.picks).toEqual({ 'TB-DAL': -4, 'PHI-JAX': 2 });
  expect(solo.data.ballots.guess_spread.submittedAt).toBeNull();
  expect(await readCopy(page)).toBeNull();
});

test('expired Solo recovery remains readable and can be discarded without enabling a late save', async ({ page, solo }) => {
  await signIn(page); await page.getByLabel('TB-DAL Spread guess').fill('-9.5');
  solo.data.now = '2026-10-10T00:15:00Z';
  await openGuessesAfterReload(page);
  await expect(page.getByLabel('Unsaved Solo recovery')).toContainText('cannot restore it for editing or submission');
  await expect(page.getByLabel('Unsaved Solo recovery')).toContainText('−9.5');
  await expect(page.getByRole('button', { name: 'Restore unsaved guesses' })).toHaveCount(0);
  await expect(page.getByLabel('TB-DAL Spread guess')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(0);
  expect(await readCopy(page)).not.toBeNull();
  await page.getByRole('button', { name: 'Discard recovery copy' }).click();
  expect(await readCopy(page)).toBeNull(); expect(solo.attempts).toHaveLength(0);
});

test('Solo form closes at the server-relative deadline without a reload and keeps unsaved copy', async ({ page, solo }) => {
  await page.clock.install(); solo.data.deadline = '2026-10-08T18:00:05Z';
  await signIn(page); await page.getByLabel('TB-DAL Spread guess').fill('-4');
  await page.clock.fastForward(6000);
  await expect(page.getByLabel('TB-DAL Spread guess')).toBeDisabled();
  await expect(page.getByText('Your unsaved guesses remain in this tab for reference only.', { exact: false })).toBeVisible();
  expect((await readCopy(page)).draft['TB-DAL']).toBe('-4'); expect(solo.attempts).toHaveLength(0);
});

test('uncertain committed Solo response blocks retry through failed readback, then confirms saved data without a duplicate', async ({ page, solo }) => {
  await signIn(page); for (const game of solo.data.games) await page.getByLabel(`${game.id} Spread guess`).fill('-3');
  solo.failures.push('commit-and-drop');
  await page.getByRole('button', { name: 'Review full ballot', exact: true }).click();
  await page.getByRole('button', { name: 'Submit Spread guesses', exact: true }).click();
  await expect(page.getByLabel('Check Solo save')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit Spread guesses', exact: true })).toBeDisabled();
  await expect(page.getByLabel('TB-DAL Spread guess')).toBeDisabled();
  expect(await readCopy(page)).not.toBeNull();
  solo.readFailure = true;
  await page.getByRole('button', { name: 'Check saved guesses' }).click();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page.getByRole('button', { name: 'Submit Spread guesses', exact: true })).toBeDisabled();
  solo.readFailure = false;
  await page.getByRole('button', { name: 'Check saved guesses' }).click();
  await expect(page.getByLabel('Check Solo save')).toHaveCount(0);
  await expect(page.getByText('Submitted · editable until deadline', { exact: false })).toBeVisible();
  await expect(page.getByLabel('TB-DAL Spread guess')).toHaveValue('-3');
  expect(solo.attempts).toHaveLength(1); expect(await readCopy(page)).toBeNull();
});

test('discard and signout erase Solo recovery and never save those copies to the account', async ({ page, solo }) => {
  await signIn(page); await page.getByLabel('TB-DAL Spread guess').fill('-4');
  await openGuessesAfterReload(page);
  await page.getByRole('button', { name: 'Discard recovery copy' }).click();
  await expect(page.getByLabel('TB-DAL Spread guess')).toHaveValue(''); expect(await readCopy(page)).toBeNull();
  await page.getByLabel('TB-DAL Spread guess').fill('-7');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('form').getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await readCopy(page)).toBeNull(); expect(solo.attempts).toHaveLength(0);
});


test('an acknowledged Solo save with failed refresh is identified as saved and read back before editing', async ({ page, solo }) => {
  await signIn(page); await page.getByLabel('TB-DAL Spread guess').fill('-4');
  solo.failures.push('ack-read-fail');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByLabel('Check Solo save')).toContainText('Your account save succeeded');
  await expect(page.getByRole('alert')).toContainText('Your guesses were saved');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  expect(await readCopy(page)).not.toBeNull(); solo.readFailure = false;
  await page.getByRole('button', { name: 'Check saved guesses' }).click();
  await expect(page.getByLabel('Check Solo save')).toHaveCount(0);
  await expect(page.getByLabel('TB-DAL Spread guess')).toHaveValue('-4');
  expect(solo.attempts).toHaveLength(1); expect(await readCopy(page)).toBeNull();
});

test('new edits survive reload while another recovered matchup still needs a conflict choice', async ({ page, solo }) => {
  solo.data.ballots.guess_spread = { picks: { 'TB-DAL': -3, 'PHI-JAX': 1 }, submittedAt: null };
  await signIn(page); await page.getByLabel('TB-DAL Spread guess').fill('-4');
  solo.data.ballots.guess_spread.picks['TB-DAL'] = -5; solo.data.weeklyRevision++;
  await openGuessesAfterReload(page);
  await page.getByRole('button', { name: 'Restore unsaved guesses' }).click();
  await page.getByLabel('PHI-JAX Spread guess').fill('2.5');
  await openGuessesAfterReload(page);
  await page.getByRole('button', { name: 'Restore unsaved guesses' }).click();
  await expect(page.getByLabel('PHI-JAX Spread guess')).toHaveValue('2.5');
  await expect(page.getByLabel('TB-DAL recovery conflict')).toContainText('Recovered: -4 · Account: -5');
  await page.getByRole('button', { name: 'Keep account guess' }).click();
  await expect(page.getByLabel('TB-DAL Spread guess')).toHaveValue('-5');
  expect(solo.attempts).toHaveLength(0);
});
