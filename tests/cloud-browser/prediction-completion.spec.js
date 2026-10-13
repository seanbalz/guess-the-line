import { test as base, expect } from '@playwright/test';
import { seed } from '../../server/store.mjs';
import { createEngine } from '../../server/engine.mjs';
import { SubmissionOddsError } from '../../cloud/submission-odds.mjs';
import { emptySocialRead } from './social-read-fixture.mjs';
import { picker, pickSpread, pickTotal, expectPick, expectNoPick, MINUS } from '../chip-entry.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';

// Synthetic authenticated group fixtures only; no hosted data or odds requests.
const accountId = '11111111-1111-4111-8111-111111111111';
const leagueId = '22222222-2222-4222-8222-222222222222';
const test = base.extend({
  entry: async ({ page, baseURL }, use) => {
    const state = seed(); state.games = state.games.slice(0, 3);
    state.league = { ...state.league, id: leagueId, name: 'Entry test duel', format: 'duel', practice: false, maxMembers: 2,
      roster: [{ id: accountId, name: 'Avery Chen', role: 'Commissioner' }, { id: 'other-player', name: 'Jordan Lee', role: 'Player' }] };
    state.ballots = {}; state.bets = {}; state.results = {}; state.audit = []; state.history = []; state.consensusHistory = [];
    const report = { state, now: '2026-10-08T18:06:00Z', revision: 0, attempts: [], committed: 0, failure: null, errors: [] };
    report.view = mode => ({ ...createEngine(state, { clock: () => Date.parse(report.now) }).view(accountId, mode),
      revision: report.revision, weeklyRevision: report.revision, predictionRevision: report.revision, ballotScope: 'weekly', localOnly: false });
    const user = { id: accountId, aud: 'authenticated', role: 'authenticated', email: 'avery@example.test',
      app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: report.now };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: accountId, aud: 'authenticated', exp: expires })).toString('base64url')}.test-signature`;
    const session = { access_token: token, refresh_token: 'test-only', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
    page.on('pageerror', error => report.errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      if (isWebfont(url)) return route.abort(); if (url.origin !== 'https://gtl-frontend-check.supabase.co') { report.errors.push(`Unexpected external origin: ${url.origin}`); return route.abort(); }
      const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (url.pathname === '/auth/v1/token') return reply(200, session);
      if (url.pathname === '/auth/v1/user') return reply(200, user);
      // D-21 community routes are not part of these fixtures; answer as an undeployed function.
      if (url.pathname.includes('/gtl-api/community/')) return reply(404, { error: 'Not found.' });
      if (url.pathname === '/auth/v1/logout') return reply(200, {});
      const endpoint = url.pathname.replace('/functions/v1/gtl-api/', '');
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      if (endpoint === 'social/read') return reply(200, await emptySocialRead(request, accountId,
        [{ season: state.league.season, week: state.league.week, games: state.games }]));
      if (endpoint === 'lobby') return reply(200, { profile: { id: accountId, displayName: 'Avery Chen' }, pendingInvites: [],
        leagues: [{ id: leagueId, name: state.league.name, format: 'duel', role: 'commissioner', memberCount: 2, maxMembers: 2, practice: false }] });
      const mode = url.searchParams.get('mode') || 'guess_spread';
      if (endpoint === 'state') return reply(200, report.view(mode));
      if (endpoint === 'ballot') {
        const body = request.postDataJSON(); report.attempts.push(body);
        if (report.failure) { const error = new SubmissionOddsError(report.failure); report.failure = null; return reply(error.status, { error: error.message, code: error.code, submitted: false }); }
        expect(body.revision).toBe(report.revision);
        const references = Object.fromEntries(state.games.map(game => [game.id, { status: 'available', value: body.picks[game.id],
          source: 'Synthetic submission reference', savedAt: report.now, capturedAt: report.now, observedAt: report.now }]));
        state.ballots[accountId] ||= {};
        state.ballots[accountId][mode] = { picks: structuredClone(body.picks), submittedAt: body.submit ? report.now : null,
          updatedAt: report.now, scoringReferences: body.submit ? references : {}, scoringPolicy: 'submission-time' };
        report.revision++; if (body.submit) report.committed++;
        return reply(200, report.view(mode));
      }
      report.errors.push(`Unexpected endpoint: ${endpoint}`); return reply(404, { error: 'Unexpected fixture request' });
    });
    try { await use(report); expect(report.errors).toEqual([]); } finally { await page.unroute('**/*'); }
  },
});

async function openBallot(page, mode = 'guess_spread') {
  await page.goto('/'); await page.getByLabel('Email', { exact: true }).fill('avery@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.locator('.auth-form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeAttached();
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true }); if (await menu.isVisible()) { await menu.click(); await expect(page.locator('.sidebar')).toHaveClass(/is-open/); }
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  if (mode === 'guess_total') await page.getByRole('button', { name: 'Guess the Total', exact: true }).click();
}

for (const [width, theme] of [[320, 'dark'], [390, 'light']]) test(`missing Total entry keeps chip selection and keyboard progress intact at ${width}px ${theme}`, async ({ page, entry }) => {
  await page.setViewportSize({ width, height: 844 });
  if (theme === 'light') await page.addInitScript(() => localStorage.setItem('gtl.theme', 'light'));
  await openBallot(page, 'guess_total');
  await expect(page.getByRole('heading', { name: 'Where would you set the total?' })).toBeVisible();
  await expect(page.locator('.ballot-header')).toContainText('Guess the sportsbook’s total');
  await page.getByLabel('Filter predictions').selectOption('missing');
  const first = picker(page, 'TB at DAL combined points');
  await expect(first.locator('.number-chip')).toHaveText(['39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49']);
  await first.getByRole('radio', { name: '44', exact: true }).click(); await expect(first.getByRole('radio', { name: '44', exact: true })).toHaveAttribute('aria-checked', 'true');
  await first.getByRole('button', { name: 'Raise by half a point' }).click(); await expectPick(page, 'TB at DAL combined points', '44.5 total points');
  await expect(first.getByRole('button', { name: 'Raise by half a point' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Next game', exact: true }).first()).toBeFocused();
  await page.keyboard.press('Enter'); await expect(picker(page, 'PHI at JAX combined points').locator('.number-chip').first()).toBeFocused();
  await expect(first).toHaveCount(0);
  // Keyboard model (#23): − and + do nothing on an empty row, like the disabled − button. The pointer click that follows lands on the
  // chip it was aimed at while the row shows its key hint: revealing the hint must not reflow the row (the chips once moved between
  // mousedown and mouseup, the click fell on the row, and the pick read 44.5 from the + button instead of 45.5).
  await page.keyboard.press('-'); await page.keyboard.press('+'); await expectNoPick(page, 'PHI at JAX combined points');
  await pickTotal(page, 'PHI at JAX combined points', '45.5');
  await page.getByRole('button', { name: 'Next game', exact: true }).first().click();
  await expect(picker(page, 'CIN at MIA combined points').locator('.number-chip').first()).toBeFocused();
  await pickTotal(page, 'CIN at MIA combined points', '0');
  await expect(picker(page, 'CIN at MIA combined points').locator('.number-chip')).toHaveText(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  await picker(page, 'CIN at MIA combined points').getByRole('button', { name: 'Lower by half a point' }).click(); await expectPick(page, 'CIN at MIA combined points', '0 total points');
  await page.getByRole('button', { name: 'Next game', exact: true }).click();
  await expect(page.getByRole('group', { name: /combined points$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review & submit', exact: true })).toBeFocused();
  await expect(page.locator('.prediction-entry')).toContainText('Every matchup has a valid prediction');
  await page.getByRole('button', { name: 'Show all matchups', exact: true }).click();
  await expect(page.locator('.prediction-entry-controls .chip-summary')).toHaveText(['44.5 total points', '45.5 total points', '0 total points']);
  await page.getByRole('button', { name: 'Review & submit', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Submit your total ballot?' });
  await expect(review).toContainText('your guess of the sportsbook’s total');
  await expect(review.getByRole('listitem').locator('strong')).toHaveText(['44.5', '45.5', '0']);
  expect(entry.attempts).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.local/previews/prediction-completion-total-${width}-${theme}.png`, fullPage: false });
});

test('favorite chips set the sign, Pick’em zeroes the spread, and the range stays inside 0.5–20 without any invalid state', async ({ page, entry }) => {
  await openBallot(page);
  const group = picker(page, 'TB at DAL home spread'), chip = name => group.getByRole('button', { name, exact: true }).or(group.getByRole('radio', { name, exact: true }));
  await expect(group.locator('.number-chip')).toHaveCount(0);
  await chip('DAL').click(); await expect(group.locator('.number-chip')).toHaveCount(19);
  await expect(group.getByRole('button', { name: 'Raise by half a point' })).toBeDisabled();
  await expect(group.locator('.number-chip').first()).toHaveText(`${MINUS}1`); await expect(group.locator('.number-chip').last()).toHaveText(`${MINUS}10`);
  await chip(`${MINUS}1`).click(); await expectPick(page, 'TB at DAL home spread', 'DAL −1');
  await group.getByRole('button', { name: 'Lower by half a point' }).click(); await expectPick(page, 'TB at DAL home spread', 'DAL −0.5');
  await group.getByRole('button', { name: 'Lower by half a point' }).click(); await expectPick(page, 'TB at DAL home spread', 'DAL −0.5');
  await chip("Pick'em").click(); await expect(group.locator('.chip-summary')).toHaveText("Pick'em"); await expect(group.locator('.number-chip')).toHaveCount(0);
  await expect(page.locator('.picks-table tbody tr').first().getByText('Unsaved', { exact: true })).toBeVisible();
  await chip('TB').click(); await expect(chip('TB')).toHaveAttribute('aria-pressed', 'true'); await expect(group.locator('.number-chip')).toHaveCount(19);
  await expect(page.locator('.picks-table tbody tr').first().getByText('Not entered', { exact: true })).toBeVisible();
  await chip(`${MINUS}3.5`).click(); await expectPick(page, 'TB at DAL home spread', 'TB −3.5');
  await chip('DAL').click(); await expectPick(page, 'TB at DAL home spread', 'DAL −3.5');
  await chip('More').click(); await expect(group.locator('.number-chip').first()).toHaveText(`${MINUS}10.5`); await expect(group.locator('.number-chip').last()).toHaveText(`${MINUS}20`);
  await chip(`${MINUS}20`).click(); await expectPick(page, 'TB at DAL home spread', 'DAL −20');
  await group.getByRole('button', { name: 'Raise by half a point' }).click(); await expectPick(page, 'TB at DAL home spread', 'DAL −20');
  await expect(page.locator('.form-error')).toHaveCount(0);
  await expect(page.locator('.prediction-entry-controls input, .prediction-entry-controls select')).toHaveCount(0);
  expect(entry.attempts).toHaveLength(0);
});

test('saved favorite and restored tab edits retain the visible sign during further entry', async ({ page, entry }) => {
  entry.state.ballots[accountId] = { guess_spread: { picks: { 'TB-DAL': -3.5 }, submittedAt: null } };
  await openBallot(page);
  const group = picker(page, 'TB at DAL home spread'), chip = name => group.getByRole('button', { name, exact: true }).or(group.getByRole('radio', { name, exact: true }));
  await expectPick(page, 'TB at DAL home spread', 'DAL −3.5'); await expect(chip(`${MINUS}3.5`)).toHaveAttribute('aria-checked', 'true');
  await chip(`${MINUS}7.5`).click(); await expectPick(page, 'TB at DAL home spread', 'DAL −7.5');
  await chip('TB').click(); await expectPick(page, 'TB at DAL home spread', 'TB −7.5');
  page.on('dialog', dialog => dialog.accept()); await page.reload();
  await expect(page.locator('.sidebar')).toBeAttached();
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true }); if (await menu.isVisible()) { await menu.click(); await expect(page.locator('.sidebar')).toHaveClass(/is-open/); }
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await page.getByRole('button', { name: 'Restore tab draft', exact: true }).click();
  await expectPick(page, 'TB at DAL home spread', 'TB −7.5'); await chip(`${MINUS}4.5`).click(); await expectPick(page, 'TB at DAL home spread', 'TB −4.5');
  await expect(chip('TB')).toHaveAttribute('aria-pressed', 'true');
  expect(entry.state.ballots[accountId].guess_spread.picks['TB-DAL']).toBe(-3.5);
  expect(entry.attempts).toHaveLength(0);
});

test('quote failure keeps the full review and offers an in-place retry without conflicting refresh instructions', async ({ page, entry }) => {
  entry.failure = 'GTL_SUBMISSION_REFRESH_LIMIT'; await page.setViewportSize({ width: 320, height: 844 }); await openBallot(page);
  for (const [index, value] of ['-3.5', '2', '-1'].entries()) await pickSpread(page, `${entry.state.games[index].awayCode} at ${entry.state.games[index].homeCode} home spread`, value);
  await page.getByRole('button', { name: 'Review & submit', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Submit your spread ballot?' });
  await review.getByRole('button', { name: 'Submit & reveal analysis', exact: true }).click();
  await expect(review.getByRole('alert')).toContainText('Your entries are still here. Retry from this review');
  await expect(review.getByRole('alert')).not.toContainText('Close this review to refresh');
  await expect(review.getByRole('listitem').locator('strong')).toHaveText(['−3.5', '+2', '−1']);
  expect(entry.state.ballots).toEqual({}); expect(entry.committed).toBe(0);
  await expect(page.locator('.hidden-value')).toHaveCount(3);
  await page.screenshot({ path: '.local/previews/prediction-completion-retained-error-320.png', fullPage: false });
  await review.getByRole('button', { name: 'Submit & reveal analysis', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your spread analysis', exact: true })).toBeVisible();
  expect(entry.committed).toBe(1); expect(entry.attempts).toHaveLength(2); expect(entry.attempts[0]).toEqual(entry.attempts[1]);
  expect(entry.view('guess_total').revealed).toBe(false);
});
