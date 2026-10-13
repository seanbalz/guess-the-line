import { test as base, expect } from '@playwright/test';
import { seed } from '../../server/store.mjs';
import { createEngine } from '../../server/engine.mjs';
import { emptySocialRead } from './social-read-fixture.mjs';
import { pickTotal, expectPick, expectNoPick, expectPickEnabled, totalText } from '../chip-entry.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';

const start = '2026-10-08T18:00:00Z', deadline = '2026-10-08T18:01:00Z';
const actorA = '11111111-1111-4111-8111-111111111111', actorB = '33333333-3333-4333-8333-333333333333';
const leagueId = '22222222-2222-4222-8222-222222222222';
const test = base.extend({
  recovery: async ({ page, baseURL }, use) => {
    const report = { actor: actorA, now: start, revision: 0, attempts: [], errors: [], failReads: 0, outcome: 'success' };
    const makeState = () => {
      const state = seed(); state.games = state.games.slice(0, 3);
      state.league = { ...state.league, id: leagueId, name: 'Recovery fixture', deadline, roster: [{ id: 'troy', name: 'Fixture player', role: 'Commissioner' }] };
      state.ballots = { troy: { guess_total: { picks: { 'TB-DAL': 41 }, submittedAt: null } } };
      state.bets = {}; state.audit = []; state.history = []; state.results = {}; state.consensusHistory = [];
      return state;
    };
    report.states = { [actorA]: makeState(), [actorB]: makeState() };
    const session = actor => {
      const expires = Math.floor(Date.now() / 1000) + 3600;
      const user = { id: actor, aud: 'authenticated', role: 'authenticated', email: 'recovery@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: start };
      const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: actor, aud: 'authenticated', exp: expires })).toString('base64url')}.test-signature`;
      return { access_token: token, refresh_token: 'test-only', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
    };
    const sessions = { [actorA]: session(actorA), [actorB]: session(actorB) };
    report.view = mode => ({ ...createEngine(report.states[report.actor], { clock: () => Date.parse(report.now) }).view('troy', mode),
      localOnly: false, ballotScope: 'weekly', revision: report.revision, weeklyRevision: report.revision, predictionRevision: report.revision });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.clock.install({ time: new Date(start) });
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      if (isWebfont(url)) return route.abort(); if (url.origin !== 'https://gtl-frontend-check.supabase.co') { report.errors.push(`Unexpected origin: ${url.origin}`); return route.abort(); }
      const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      const active = sessions[report.actor];
      if (url.pathname === '/auth/v1/token') return reply(200, active);
      if (url.pathname === '/auth/v1/user') return reply(200, active.user);
      if (url.pathname === '/auth/v1/logout') return reply(200, {});
      // D-21 community routes are not part of these fixtures; answer as an undeployed function.
      if (url.pathname.includes('/gtl-api/community/')) return reply(404, { error: 'Not found.' });
      expect(request.headers().authorization).toBe(`Bearer ${active.access_token}`);
      const endpoint = url.pathname.replace('/functions/v1/gtl-api/', ''), state = report.states[report.actor];
      if (endpoint === 'lobby') return reply(200, { profile: { id: report.actor, displayName: 'Fixture player' }, leagues: [{ id: leagueId, name: state.league.name, role: 'commissioner', format: 'duel', memberCount: 1, maxMembers: 2 }], pendingInvites: [] });
      if (endpoint === 'social/read') return reply(200, await emptySocialRead(request, report.actor, [{ season: state.league.season, week: state.league.week, games: state.games }]));
      if (endpoint === 'state') {
        if (report.failReads) { report.failReads--; return reply(503, { error: 'Synthetic read outage. No saved data returned.' }); }
        return reply(200, report.view(url.searchParams.get('mode') || 'guess_spread'));
      }
      if (endpoint === 'ballot') {
        const body = request.postDataJSON(), mode = url.searchParams.get('mode');
        report.attempts.push(structuredClone(body));
        expect(body.revision).toBe(report.revision);
        if (report.outcome !== 'no-commit-lost') {
          state.ballots.troy[mode] = { picks: body.picks, submittedAt: body.submit ? report.now : null, updatedAt: report.now, scoringPolicy: 'submission-time',
            scoringReferences: body.submit ? Object.fromEntries(state.games.map(game => [game.id, { status: 'available', value: body.picks[game.id], source: 'Synthetic saved reference', sourceUrl: 'https://example.test/recorded-fixture', snapshotId: `fixture-${game.id}`, savedAt: report.now, capturedAt: report.now, observedAt: report.now }])) : {} };
          state.audit.push({ timestamp: report.now, type: 'fixture-save' }); report.revision++;
        }
        if (report.outcome !== 'success') return reply(503, { error: 'Synthetic connection failure; save outcome unknown.' });
        return reply(200, report.view(mode));
      }
      report.errors.push(`Unexpected endpoint: ${endpoint}`); return reply(404, { error: 'Unexpected fixture request' });
    });
    try { await use(report); expect(report.errors).toEqual([]); } finally { await page.unroute('**/*'); }
  },
});

async function signIn(page) {
  await page.getByLabel('Email', { exact: true }).fill('recovery@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function navigate(page, label) {
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeAttached();
  const toggle = page.getByRole('button', { name: 'Open navigation', exact: true }); if (await toggle.isVisible()) { await toggle.click(); await expect(page.locator('.sidebar')).toHaveClass(/is-open/); }
  await page.getByRole('button', { name: label, exact: true }).first().click();
}
async function openTotal(page) {
  await page.goto('/'); await signIn(page);
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await navigate(page, 'My picks');
  await page.getByRole('button', { name: 'Guess the Total', exact: true }).click();
  await expectPick(page, 'TB at DAL combined points', totalText(41));
}
const TB = 'TB at DAL combined points', PHI = 'PHI at JAX combined points', CIN = 'CIN at MIA combined points';
async function enterFullTotal(page) {
  for (const [label, value] of [[TB, 44.5], [PHI, 45.5], [CIN, 40]]) await pickTotal(page, label, value);
  await page.getByRole('button', { name: 'Review & submit', exact: true }).click();
}
const expired = page => page.getByRole('region', { name: 'Expired prediction recovery' });

for (const [width, theme] of [[320, 'dark'], [390, 'light']]) test(`chip group draft survives deadline and reload as read-only at ${width}px ${theme}`, async ({ page, recovery }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(value => localStorage.setItem('gtl.theme', value), theme);
  const original = JSON.stringify(recovery.states[actorA].ballots);
  await openTotal(page);
  await pickTotal(page, TB, 44.5); await pickTotal(page, PHI, 45.5);
  recovery.now = '2026-10-08T18:01:01Z'; await page.clock.fastForward(61000);
  await expect(expired(page)).toBeVisible(); await expectPickEnabled(page, TB, false); await expectPick(page, TB, totalText(41));
  await expired(page).locator('summary').click();
  await expect(expired(page)).toContainText('44.5'); await expect(expired(page)).toContainText('45.5'); await expect(expired(page)).toContainText('Saved ballot');
  await expect(page.getByRole('button', { name: 'Restore tab draft' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review & submit' })).toHaveCount(0);
  await expect(page.locator('.hidden-value')).toHaveCount(3); await expect(page.locator('.opponent-picks,.current-consensus')).toHaveCount(0);
  await page.reload(); await navigate(page, 'My picks'); await page.getByRole('button', { name: 'Guess the Total', exact: true }).click();
  await expect(expired(page)).toBeVisible(); await expired(page).locator('summary').click();
  await expect(expired(page)).toContainText('44.5'); await expectPick(page, TB, totalText(41));
  await expectPickEnabled(page, TB, false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expired(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: `.local/previews/expired-group-${width}-${theme}.png`, fullPage: false });
  await page.getByRole('button', { name: 'Guess the Spread', exact: true }).click(); await expect(expired(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Guess the Total', exact: true }).click(); await expect(expired(page)).toBeVisible();
  await expired(page).getByRole('button', { name: 'Discard recovery copy' }).click(); await expect(expired(page)).toHaveCount(0);
  await expect(page.locator('.draft-recovery-notice')).toContainText('Recovery copy discarded');
  await page.reload(); await navigate(page, 'My picks'); await page.getByRole('button', { name: 'Guess the Total', exact: true }).click();
  await expect(expired(page)).toHaveCount(0);
  expect(recovery.attempts).toHaveLength(0); expect(recovery.revision).toBe(0); expect(recovery.states[actorA].audit).toEqual([]);
  expect(JSON.stringify(recovery.states[actorA].ballots)).toBe(original);
});

test('a retained group copy cannot appear for another account with the same legacy roster ID', async ({ page, recovery }) => {
  await openTotal(page); await pickTotal(page, PHI, 49.5);
  recovery.now = '2026-10-08T18:01:01Z'; await page.clock.fastForward(61000); await expect(expired(page)).toBeVisible();
  const stored = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('gtl.tab-draft.v1.')));
  expect(stored).toHaveLength(1); expect(stored[0][0]).toContain(actorA);
  await navigate(page, 'Sign out'); recovery.actor = actorB;
  // An old tab copy is deliberately present despite normal sign-out cleanup.
  await page.evaluate(entries => { for (const [key, value] of entries) sessionStorage.setItem(key, value); }, stored);
  await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click(); await navigate(page, 'My picks');
  await page.getByRole('button', { name: 'Guess the Total', exact: true }).click();
  await expect(expired(page)).toHaveCount(0); await expectNoPick(page, PHI);
  await expect(page.locator('main')).not.toContainText('49.5'); expect(recovery.attempts).toHaveLength(0);
});

test('lost response after a committed submission requires readback and never replays the ballot', async ({ page, recovery }) => {
  recovery.outcome = 'commit-lost'; await openTotal(page); await enterFullTotal(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Submit & reveal analysis' }).click();
  await expect(page.getByRole('dialog')).toContainText('save response was not confirmed');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Submit & reveal analysis' })).toHaveCount(0);
  expect(recovery.attempts).toHaveLength(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Check saved ballot' }).click();
  await expect(page.locator('.draft-recovery-notice')).toContainText('Saved ballot confirmed'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectPick(page, TB, totalText(44.5));
  await expect(page.getByRole('button', { name: 'Review & save changes' })).toBeDisabled();
  expect(recovery.attempts).toHaveLength(1); expect(recovery.revision).toBe(1); expect(recovery.states[actorA].audit).toHaveLength(1);
  expect(await page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith('gtl.tab-draft.v1.')))).toBe(false);
});

test('unknown uncommitted save survives reload and failed read before an explicit reviewed retry', async ({ page, recovery }) => {
  recovery.outcome = 'no-commit-lost'; await openTotal(page); await enterFullTotal(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Submit & reveal analysis' }).click();
  await expect(page.getByRole('dialog')).toContainText('save response was not confirmed');
  page.once('dialog', dialog => dialog.accept()); await page.reload();
  await navigate(page, 'My picks'); await page.getByRole('button', { name: 'Guess the Total', exact: true }).click();
  const check = page.getByRole('region', { name: 'Check unconfirmed save' }); await expect(check).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review & submit' })).toBeDisabled();
  recovery.failReads = 1; await check.getByRole('button', { name: 'Check saved ballot' }).click();
  await expect(check).toBeVisible(); expect(recovery.attempts).toHaveLength(1);
  await check.getByRole('button', { name: 'Check saved ballot' }).click();
  await expect(page.getByRole('button', { name: 'Restore tab draft' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore tab draft' }).click();
  await expectPick(page, TB, totalText(44.5)); await expectPick(page, CIN, totalText(40));
  await expect(page.locator('.hidden-value')).toHaveCount(3); expect(recovery.attempts).toHaveLength(1);
  recovery.outcome = 'success'; await page.getByRole('button', { name: 'Review & submit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit & reveal analysis' }).click();
  await expect.poll(() => recovery.attempts.length).toBe(2); expect(recovery.revision).toBe(1); expect(recovery.states[actorA].audit).toHaveLength(1);
});
