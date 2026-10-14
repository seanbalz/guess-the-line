import { test as base, expect } from '@playwright/test';
import { seed } from '../../server/store.mjs';
import { createCloudHandler } from '../../cloud/handler.mjs';
import { providerResultError } from '../../cloud/results.mjs';
import { emptySocialRead } from './social-read-fixture.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';
import { HOSTED, PRELUDE, migrationSql } from '../migrations.mjs';

let PGlite;
try { ({ PGlite } = await import('../../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit local-only skip. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// The old app on the schema players actually have (tests/migrations.mjs).
const migrations = HOSTED;
const test = base.extend({
  results: async ({ page, baseURL }, use) => {
    test.skip(!PGlite, 'Local PGlite is required; never contacts hosted data.');
    const db = new PGlite(), report = { errors: [], requests: [], failAfterCommit: false, failReads: false, failState: false, failRefreshAfterCommit: false, actor: id(1) };
    await db.exec(PRELUDE);
    await db.exec(migrationSql(migrations[0]));
    const state = seed(), now = Date.now(), iso = stamp => new Date(stamp).toISOString();
    state.games = state.games.slice(0, 2); state.league.deadline = iso(now - 5 * 3600000);
    state.games.forEach((game, i) => { game.kickoff = iso(now + (i ? 3600000 : -4 * 3600000)); });
    await db.query('insert into auth.users values($1),($2)', [id(1), id(2)]);
    await db.query("insert into public.gtl_leagues(id,state) values('sean-troy-luke',$1)", [state]);
    await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner'),($2,'sean-troy-luke','troy','player')", [id(1), id(2)]);
    for (const file of migrations.slice(1)) await db.exec(migrationSql(file));
    const asService = (sql, args = []) => db.transaction(async tx => { await tx.exec('set local role service_role'); return tx.query(sql, args); });
    report.review = async body => (await asService('select public.gtl_review_final_result($1,$2) value', [id(1), body])).rows[0].value;
    report.defaultBody = { requestId: id(500), season: 2026, week: 5, gameId: state.games[0].id, home: 24, away: 21, source: 'Local scoreboard fixture', sourceURL: 'https://example.com/final-score-fixture', observedAt: iso(now - 60000), expectedVersion: 0, reason: 'Reviewed a completed ordinary game' };
    report.db = db; report.games = state.games;
    const user = { id: id(1), aud: 'authenticated', role: 'authenticated', email: 'commissioner@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', exp: expires })).toString('base64url')}.test`;
    const session = { access_token: token, refresh_token: 'test-only', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
    const handler = createCloudHandler({ clock: Date.now, authenticate: async value => value === token ? { ...user, id: report.actor, emailConfirmed: true } : null,
      storage: { membership: async actor => (await db.query("select player_id,role,active from public.gtl_memberships where user_id=$1 and league_id='sean-troy-luke'", [actor])).rows[0] || null },
      weekly: { load: async actor => (await asService("select public.gtl_read_weekly_state($1,'sean-troy-luke') value", [actor])).rows[0].value },
      results: {
        read: async actor => { if (report.failReads) throw Error('Local read outage'); return (await asService("select public.gtl_read_reviewed_results($1,'sean-troy-luke') value", [actor])).rows[0].value; },
        review: async (actor, body) => { try { return (await asService('select public.gtl_review_final_result($1,$2) value', [actor, body])).rows[0].value; } catch (error) { throw providerResultError(error.message); } },
      },
    });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      const reply = (status, body) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
      if (isWebfont(url)) return route.abort(); if (url.origin !== 'https://gtl-frontend-check.supabase.co') { report.errors.push(`Unexpected external request ${url.origin}`); return route.abort(); }
      if (url.pathname === '/auth/v1/token') return reply(200, session);
      if (url.pathname === '/auth/v1/user') return reply(200, user);
      // D-21 community routes are not part of these fixtures; answer as an undeployed function.
      if (url.pathname.includes('/gtl-api/community/')) return reply(404, { error: 'Not found.' });
      if (url.pathname === '/auth/v1/logout') return reply(200, {});
      const endpoint = url.pathname.replace('/functions/v1/gtl-api/', '');
      report.requests.push({ endpoint, query: url.search, body: req.method() === 'POST' ? req.postDataJSON() : null });
      if (endpoint === 'social/read') {
        expect(req.headers().authorization).toBe(`Bearer ${token}`);
        return reply(200, await emptySocialRead(req, report.actor,
          [{ season: state.league.season, week: state.league.week, games: state.games }]));
      }
      if (endpoint === 'lobby') return reply(200, { profile: { id: user.id, displayName: 'Commissioner fixture' }, leagues: [{ id: 'sean-troy-luke', name: state.league.name, format: 'triple-threat', role: report.actor === id(1) ? 'commissioner' : 'player', memberCount: 3, maxMembers: 3, practice: false }], pendingInvites: [] });
      if (endpoint === 'state' && report.failState) return reply(503, { error: 'Local refresh unavailable. Final-result receipt remains saved.' });
      const response = await handler(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}) }));
      if (endpoint === 'results/review' && response.status === 200) {
        if (report.failRefreshAfterCommit) { report.failRefreshAfterCommit = false; report.failState = true; }
        if (report.failAfterCommit) { report.failAfterCommit = false; return reply(503, { error: 'Local lost save response. Retry this review.' }); }
      }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    try { await use(report); expect(report.errors).toEqual([]); } finally { await db.close(); }
  },
});

const panel = page => page.locator('.result-review-controls');
const writes = report => report.requests.filter(request => request.endpoint === 'results/review');
async function openSettings(page) {
  await page.goto('/'); await page.getByLabel('Email', { exact: true }).fill('commissioner@example.test'); await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click(); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeAttached();
  const menu = page.getByRole('button', { name: 'Open navigation' }); if (await menu.isVisible()) { await menu.click(); await expect(page.locator('.sidebar')).toHaveClass(/is-open/); }
  await page.getByRole('button', { name: 'Settings & setup', exact: true }).click();
}
async function fillFinal(page, report, patch = {}) {
  const body = { ...report.defaultBody, ...patch }, controls = panel(page);
  await controls.getByLabel(/^Away ·/).fill(String(body.away)); await controls.getByLabel(/^Home ·/).fill(String(body.home));
  await controls.getByLabel('Final-score source name').fill(body.source); await controls.getByLabel('Final-score source URL · HTTPS').fill(body.sourceURL);
  const localTime = await page.evaluate(value => { const d = new Date(value), two = value => String(value).padStart(2, '0'); // Chromium normalizes a datetime-local value by dropping ":00" seconds, and Playwright's fill rejects a value the input rewrites.
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}${d.getSeconds() ? `:${two(d.getSeconds())}` : ''}`; }, body.observedAt);
  await controls.getByLabel(/^Final observed ·/).fill(localTime); await controls.getByLabel('Review or correction reason').fill(body.reason);
  await controls.getByRole('checkbox').check();
}
async function reviewFinal(page) { await panel(page).getByRole('button', { name: /^Review (corrected )?final result$/ }).click(); await expect(page.getByRole('dialog')).toBeVisible(); }
async function confirmFinal(page) { await page.getByRole('dialog').getByRole('button', { name: 'Confirm commissioner-reported final' }).click(); }
async function ledger(report) { return (await report.db.query('select version,result,previous_result from public.gtl_reviewed_result_events order by version')).rows; }

test('320px commissioner reviews exact final with keyboard-safe confirmation before one persisted write', async ({ page, results }) => {
  await page.setViewportSize({ width: 320, height: 844 }); await openSettings(page);
  await panel(page).getByRole('combobox', { name: 'Matchup', exact: true }).selectOption(results.games[1].id);
  await expect(panel(page).getByLabel(/^Away ·/)).toBeDisabled(); await expect(panel(page)).toContainText('Review opens after scheduled kickoff');
  await panel(page).getByRole('combobox', { name: 'Matchup', exact: true }).selectOption(results.games[0].id);
  await fillFinal(page, results, { sourceURL: 'http://example.com/final' });
  await panel(page).getByRole('button', { name: 'Review final result', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('Use an HTTPS source URL'); expect(writes(results)).toHaveLength(0);
  await fillFinal(page, results); await reviewFinal(page); expect(writes(results)).toHaveLength(0);
  await expect(page.getByRole('dialog')).toContainText('not independently verified'); await expect(page.getByRole('dialog')).toContainText(results.defaultBody.source);
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Confirm final result', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Close final-result review' })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('button', { name: 'Confirm commissioner-reported final' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(panel(page).getByRole('button', { name: 'Review final result', exact: true })).toBeFocused();
  await reviewFinal(page);
  const buttonSizes = await page.getByRole('dialog').locator('.review-actions button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
  for (const height of buttonSizes) { expect(height).toBeGreaterThanOrEqual(44); expect(height).toBeLessThanOrEqual(100); }
  expect(await page.getByRole('dialog').evaluate(dialog => dialog.scrollTop)).toBe(0);
  await page.screenshot({ path: '.local/previews/final-result-confirmation-320.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('dialog').evaluate(dialog => { dialog.scrollTop = dialog.scrollHeight; });
  await page.screenshot({ path: '.local/previews/final-result-actions-320.png' });
  await confirmFinal(page); await expect(panel(page)).toContainText('Final result saved · Version 1'); await expect(panel(page)).toContainText('Currently recorded · Version 1');
  expect(writes(results)).toHaveLength(1); expect(Object.keys(writes(results)[0].body).sort()).toEqual(['away', 'expectedVersion', 'gameId', 'home', 'observedAt', 'reason', 'requestId', 'season', 'source', 'sourceURL', 'week']);
  expect(writes(results)[0].query).toBe(''); expect(writes(results)[0].body.expectedVersion).toBe(0); expect(await ledger(results)).toHaveLength(1);
  const controlSize = await panel(page).getByLabel(/^Away ·/).evaluate(element => ({ height: element.getBoundingClientRect().height, font: getComputedStyle(element).fontSize }));
  expect(controlSize.height).toBeGreaterThanOrEqual(44); expect(controlSize.font).toBe('16px');
  await panel(page).evaluate(element => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: '.local/previews/final-result-saved-320.png' });
});

test('ambiguous final save retries with the same request ID and creates only one audit version', async ({ page, results }) => {
  await openSettings(page); await fillFinal(page, results); await reviewFinal(page); results.failAfterCommit = true; await confirmFinal(page);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Local lost save response'); expect(await ledger(results)).toHaveLength(1);
  await confirmFinal(page); await expect(panel(page)).toContainText('Final result saved · Version 1');
  expect(writes(results)).toHaveLength(2); expect(writes(results)[0].body).toEqual(writes(results)[1].body); expect(await ledger(results)).toHaveLength(1);
  await fillFinal(page, results, { home: 28, reason: 'Source corrected the home final score' }); await reviewFinal(page); await confirmFinal(page);
  await expect(panel(page)).toContainText('Final result saved · Version 2'); expect(writes(results)[2].body.requestId).not.toBe(writes(results)[1].body.requestId); expect(writes(results)[2].body.expectedVersion).toBe(1);
  const history = await ledger(results); expect(history).toHaveLength(2); expect(history[1].previous_result.home).toBe(24); expect(history[1].result.home).toBe(28);
});

test('stale correction requires refreshing and explicitly reviewing the changed version before saving', async ({ page, results }) => {
  await openSettings(page); await fillFinal(page, results, { home: 28 }); await reviewFinal(page);
  await results.review({ ...results.defaultBody, requestId: id(510), home: 27 }); await confirmFinal(page);
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(panel(page).getByRole('alert')).toContainText('Refresh');
  await expect(panel(page).getByLabel(/^Home ·/)).toHaveValue('28'); await expect(panel(page).getByRole('button', { name: 'Review final result', exact: true })).toBeDisabled();
  await panel(page).getByRole('button', { name: 'Refresh results', exact: true }).click(); await expect(panel(page)).toContainText('Currently recorded · Version 1');
  expect(writes(results)).toHaveLength(1); await panel(page).getByRole('button', { name: 'Use version 1 for a new review' }).click();
  await expect(panel(page).getByRole('checkbox')).not.toBeChecked(); await expect(panel(page).getByLabel(/^Home ·/)).toHaveValue('28');
  await panel(page).getByRole('checkbox').check(); await reviewFinal(page); await expect(page.getByRole('dialog')).toContainText('1 → 2'); await confirmFinal(page);
  await expect(panel(page)).toContainText('Final result saved · Version 2'); expect(writes(results)[1].body.expectedVersion).toBe(1); expect(writes(results)[1].body.requestId).not.toBe(writes(results)[0].body.requestId);
  const history = await ledger(results); expect(history).toHaveLength(2); expect(history[1].previous_result.home).toBe(27);
});

test('acknowledged final remains saved when the refreshed view fails', async ({ page, results }) => {
  await openSettings(page); await fillFinal(page, results); await reviewFinal(page); results.failRefreshAfterCommit = true; await confirmFinal(page);
  await expect(panel(page)).toContainText('Final result saved · Version 1'); await expect(page.getByRole('alert')).toContainText('Local refresh unavailable');
  await expect(page.getByRole('dialog')).toHaveCount(0); expect(writes(results)).toHaveLength(1); expect(await ledger(results)).toHaveLength(1);
  results.failState = false; await panel(page).getByRole('button', { name: 'Refresh results', exact: true }).click(); await expect(panel(page)).toContainText('Currently recorded · Version 1');
  expect(writes(results)).toHaveLength(1);
});

test('unavailable results disable entry until a current read succeeds', async ({ page, results }) => {
  results.failReads = true; await openSettings(page); await expect(panel(page)).toContainText('reviewed-results service is unavailable'); await expect(panel(page).locator('form')).toHaveCount(0);
  results.failReads = false; await panel(page).getByRole('button', { name: 'Refresh results', exact: true }).click(); await expect(panel(page).getByLabel(/^Away ·/)).toBeEnabled(); expect(writes(results)).toHaveLength(0);
});

test('ordinary members never receive commissioner result controls', async ({ page, results }) => {
  results.actor = id(2); await openSettings(page); await expect(page.getByRole('heading', { name: 'League rules' })).toBeVisible(); await expect(panel(page)).toHaveCount(0); expect(writes(results)).toHaveLength(0);
});
