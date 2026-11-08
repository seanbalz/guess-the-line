import { test, expect } from '@playwright/test';
import { communityWorld, pgliteAvailable, signIn, SUPABASE } from './community-world.mjs';
import { captureCommissioner } from './commissioner-capture.mjs';

test.skip(!pgliteAvailable, 'Install the local PGlite test runtime.');
test.setTimeout(120000);
const endpoint = path => url => url.origin === SUPABASE && url.pathname.endsWith(`/gtl-api/${path}`);
const sheet = page => page.getByRole('dialog').last();
async function open(page, name) {
  await page.goto('/'); await signIn(page, 'sean', { navigate: false });
  await page.getByRole('button', { name: 'Your menu', exact: true }).click();
  await page.getByRole('button', { name: 'Commissioner tools', exact: true }).click();
  await sheet(page).getByRole('button', { name, exact: true }).click();
}
const reply = (route, body, status = 200) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, json: body });

test('referee hosted clearing, extra options, busy and partial saves keep unsaved drafts', async ({ page, baseURL }, info) => {
  const world = await communityWorld(page, baseURL, { groupScreens: true });
  let release; const held = new Promise(resolve => { release = resolve; });
  try {
    const { season, week } = world.state.league;
    const games = Array.from({ length: 5 }, (_, index) => ({ ...world.state.games[index % world.state.games.length], id: `fixture-referee-${index}`, away: `Fixture away ${index + 1}`, home: `Fixture home ${index + 1}` }));
    await page.route(endpoint('trends/week'), route => reply(route, { season, week, games, refereeOptions: ['Fixture official A','Fixture official B'], assignedReferees: { [games[0].id]: 'Static fixture official' } }));
    await page.route(endpoint('officials/read'), route => reply(route, { season, week, assignments: { [games[0].id]: { referee: null }, [games[1].id]: { referee: 'Unlisted fixture official' } } }));
    const writes = [];
    await page.route(endpoint('officials/set'), async route => {
      const body = route.request().postDataJSON(); writes.push(body);
      if (writes.length === 1) { await held; await reply(route, { referee: body.referee, revision: 1, setAt: new Date().toISOString() }); }
      else await reply(route, { error: 'Fixture partial failure' }, 503);
    });
    await open(page, 'Game referees');
    const fields = sheet(page).getByRole('combobox');
    await expect(fields.nth(0)).toHaveValue('');
    await expect(fields.nth(1)).toHaveValue('Unlisted fixture official');
    await captureCommissioner(page, info, 'referees-current');
    await expect(fields).toHaveCount(3);
    await sheet(page).getByRole('button', { name: 'Show all 5 games', exact: true }).click();
    await expect(fields).toHaveCount(5);
    await fields.nth(0).selectOption('Fixture official A'); await fields.nth(4).selectOption('Fixture official B');
    await captureCommissioner(page, info, 'referees-expanded', { compact: true });
    await sheet(page).getByRole('button', { name: 'Show first 3 games', exact: true }).click();
    await expect(fields).toHaveCount(3);
    await expect(sheet(page).getByRole('button', { name: 'Save 2 referees', exact: true })).toBeVisible();
    await captureCommissioner(page, info, 'referees-drafts', { compact: true });
    await sheet(page).getByRole('button', { name: 'Save 2 referees', exact: true }).click();
    await expect(sheet(page).getByRole('button', { name: 'Saving…', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await captureCommissioner(page, info, 'referees-busy', { compact: true }); release();
    await expect(sheet(page).getByRole('alert')).toContainText('Unsaved choices stay selected.');
    await sheet(page).getByRole('button', { name: 'Show all 5 games', exact: true }).click();
    await expect(fields.nth(4)).toHaveValue('Fixture official B');
    await expect(fields.nth(0)).toHaveValue('Fixture official A');
    await sheet(page).getByRole('button', { name: 'Show first 3 games', exact: true }).click();
    await expect(sheet(page).getByRole('button', { name: 'Save 1 referee', exact: true })).toBeVisible();
    expect(writes.map(body => body.gameId)).toEqual([games[0].id, games[4].id]);
    await captureCommissioner(page, info, 'referees-partial', { compact: true });
  } finally { release(); await world.db.close(); }
});

test('uncertain settlement stays check-only and free-quota pause keeps schedule details', async ({ page, baseURL }, info) => {
  const world = await communityWorld(page, baseURL, { groupScreens: true, virtualUnits: true });
  try {
    await page.route(endpoint('state'), async route => {
      const req = route.request(), response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers() }));
      const body = await response.json(); body.oddsSchedule = { enabled: true, operationalStatus: 'blocked', pauseReason: 'budget_guard' };
      await reply(route, body);
    });
    let writes = 0;
    await page.route(endpoint('virtual-units/settle'), async route => { writes++; await route.abort('failed'); });
    await open(page, 'Schedule and settlement status');
    await expect(sheet(page).getByText('12-hour refresh paused · free quota protected', { exact: true })).toBeVisible();
    await captureCommissioner(page, info, 'status-paused', { compact: true });
    await sheet(page).getByRole('button', { name: 'Settle finals now', exact: true }).click();
    await expect(sheet(page).getByRole('button', { name: 'Check saved results', exact: true })).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: 'Settle finals now', exact: true })).toHaveCount(0);
    await captureCommissioner(page, info, 'settlement-uncertain', { compact: true });
    await sheet(page).getByRole('button', { name: 'Check saved results', exact: true }).click();
    await expect(sheet(page).getByText('Saved results refreshed. Review them before settling again.')).toBeVisible();
    expect(writes).toBe(1);
  } finally { await world.db.close(); }
});

test('referee read failure disables assignment changes without inventing a current official', async ({ page, baseURL }, info) => {
  const world = await communityWorld(page, baseURL, { groupScreens: true });
  try {
    const { season, week } = world.state.league;
    await page.route(endpoint('trends/week'), route => reply(route, { season, week, games: world.state.games, refereeOptions: ['Fixture official A'] }));
    await page.route(endpoint('officials/read'), route => reply(route, { error: 'Fixture read failed' }, 503));
    await open(page, 'Game referees');
    await expect(sheet(page).getByRole('combobox').first()).toBeDisabled();
    await expect(sheet(page).getByRole('alert')).toContainText('Fixture read failed');
    await captureCommissioner(page, info, 'referees-read-error', { compact: true });
  } finally { await world.db.close(); }
});

test('final correction keeps explicit assertion, busy review and refresh-adopt conflict gates', async ({ page, baseURL }, info) => {
  const world = await communityWorld(page, baseURL, { groupScreens: true });
  let release; const hold = new Promise(resolve => { release = resolve; });
  try {
    let version = 1, available = true, writes = 0; const requestIds = [];
    await page.route(endpoint('state'), async route => {
      const req = route.request(), response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers() }));
      const body = await response.json(), game = body.games[0];
      game.kickoff = new Date(Date.now() - 3 * 3600000).toISOString();
      body.resultReview = { available, games: { [game.id]: { version, away: 24, home: 17, source: 'Prior fixture source', sourceURL: 'https://example.test/prior', observedAt: new Date(Date.now() - 3600000).toISOString(), reviewedAt: new Date().toISOString() } } };
      await reply(route, body);
    });
    await page.route(endpoint('results/review'), async route => { writes++; requestIds.push(route.request().postDataJSON().requestId); await hold; await reply(route, { error: writes === 1 ? 'Fixture save failure' : 'Fixture version conflict' }, writes === 1 ? 503 : 409); });
    await open(page, 'Final scores');
    await sheet(page).getByLabel('Final-score source name', { exact: true }).fill('Corrected fixture source');
    await sheet(page).getByLabel('Final-score source URL · HTTPS', { exact: true }).fill('https://example.test/correction');
    const observed = await page.evaluate(() => { const at = new Date(Date.now() - 1800000); return new Date(at - at.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
    await sheet(page).getByLabel(/^Final observed · /).fill(observed);
    await sheet(page).getByLabel('Review or correction reason', { exact: true }).fill('Corrected fixture source metadata.');
    const review = sheet(page).getByRole('button', { name: 'Review corrected final result', exact: true });
    await expect(review).toBeDisabled(); await sheet(page).getByRole('checkbox').check();
    await sheet(page).getByLabel(/^Final observed · /).fill('2020-01-01T00:00');
    await sheet(page).getByRole('checkbox').check(); await review.click();
    await expect(sheet(page).getByRole('alert')).toContainText('observation must be after');
    await captureCommissioner(page, info, 'final-validation-error');
    await sheet(page).getByLabel(/^Final observed · /).fill(observed);
    await sheet(page).getByRole('checkbox').check(); await review.click();
    await expect(page.getByRole('heading' , { name: 'Confirm corrected final result', exact: true })).toBeVisible();
    await captureCommissioner(page, info, 'final-correction', { compact: true });
    await page.getByRole('button', { name: 'Confirm commissioner-reported final', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Recording final…', exact: true })).toBeDisabled();
    await captureCommissioner(page, info, 'final-busy', { compact: true }); release();
    await expect(page.locator('dialog[open]').getByRole('alert')).toContainText('Fixture save failure');
    await captureCommissioner(page, info, 'final-save-error');
    await page.getByRole('button', { name: 'Confirm commissioner-reported final', exact: true }).click();
    await expect(sheet(page).getByRole('alert')).toContainText('Fixture version conflict');
    await expect(sheet(page).getByLabel('Final-score source name', { exact: true })).toHaveValue('Corrected fixture source');
    version = 2; await sheet(page).getByRole('button', { name: 'Refresh results', exact: true }).click();
    await expect(sheet(page).getByRole('button', { name: 'Use version 2 for a new review', exact: true })).toBeVisible();
    await expect(review).toBeDisabled();
    await captureCommissioner(page, info, 'final-conflict', { compact: true });
    await sheet(page).getByRole('button', { name: 'Use version 2 for a new review', exact: true }).click();
    await expect(sheet(page).getByRole('checkbox')).not.toBeChecked(); await expect(review).toBeDisabled();
    expect(writes).toBe(2); expect(requestIds[1]).toBe(requestIds[0]);
    available = false; await sheet(page).getByRole('button', { name: 'Refresh results', exact: true }).click();
    await expect(sheet(page).getByText(/reviewed-results service is unavailable/)).toBeVisible();
    await expect(sheet(page).getByRole('spinbutton')).toHaveCount(0);
    await captureCommissioner(page, info, 'final-unavailable');
  } finally { release(); await world.db.close(); }
});

test('correction first load, failed read, missing totals and refreshing retain read-only evidence', async ({ page, baseURL }, info) => {
  const world = await communityWorld(page, baseURL, { groupScreens: true });
  let release; let hold = new Promise(resolve => { release = resolve; });
  let state = 'failed';
  const row = { week: 9, nextWeek: 10, nextPickCount: 0, totalsComplete: false,
    original: { capturedAt: '2026-11-03T02:00:00Z' }, corrected: { capturedAt: '2026-11-03T20:05:00Z' },
    changes: [{ name: 'Fixture manager', before: { points: 500.25, against: 400 }, after: { points: null, against: 399.5 }, pointsChange: null, againstChange: -0.5 }] };
  try {
    const calls = [];
    await page.route(endpoint('epl/admin/corrections/read'), async route => {
      calls.push(route.request().method()); await hold;
      await reply(route, state === 'failed' ? { error: 'Fixture corrections unavailable' } : { available: true, reviews: [row] }, state === 'failed' ? 503 : 200);
    });
    await open(page, 'Premier League stat corrections');
    await expect(sheet(page).getByRole('button', { name: 'Refresh reviews', exact: true })).toBeDisabled(); // Controller data-read state, after the lazy download.
    await expect(sheet(page).locator('[data-skeleton="panels"]')).toBeVisible();
    await expect(sheet(page).getByText('500.25')).toHaveCount(0);
    await captureCommissioner(page, info, 'corrections-loading', { compact: true }); release();
    await expect(sheet(page).getByRole('alert')).toContainText('Premier League correction reviews could not load.');
    await captureCommissioner(page, info, 'corrections-failed', { compact: true });
    state = 'missing'; await sheet(page).getByRole('button', { name: 'Refresh reviews', exact: true }).click();
    await expect(sheet(page).getByText('Some source totals are unavailable. Missing values are shown as —.')).toBeVisible();
    await expect(sheet(page).getByText('-0.5', { exact: true })).toHaveCount(0);
    await expect(sheet(page).getByText('−0.5', { exact: true })).toBeVisible();
    await captureCommissioner(page, info, 'corrections-missing', { compact: true });
    hold = new Promise(resolve => { release = resolve; });
    await sheet(page).getByRole('button', { name: 'Refresh reviews', exact: true }).click();
    await expect(sheet(page).getByText('Refreshing Premier League correction reviews…')).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: 'Refresh reviews', exact: true })).toBeDisabled();
    await expect(sheet(page).getByRole('heading', { name: 'MW9 stat correction needs review' })).toBeVisible();
    await captureCommissioner(page, info, 'corrections-refreshing', { compact: true }); release();
    await expect(sheet(page).getByRole('button', { name: 'Refresh reviews', exact: true })).toBeEnabled();
    expect(calls.every(method => method === 'POST')).toBe(true);
    await expect(sheet(page).getByRole('button')).toHaveCount(3); // Back, Close and read-only Refresh.
  } finally { release(); await world.db.close(); }
});

test('odds busy and rate-limit responses preserve count-only checks and prevent collecting', async ({ page, baseURL }, info) => {
  const world = await communityWorld(page, baseURL, { groupScreens: true });
  let release; const hold = new Promise(resolve => { release = resolve; });
  try {
    const operations = [];
    await page.route(endpoint('odds/preflight'), async route => { operations.push('preflight'); await hold; await reply(route, { status: 'failed', errorCode: 'ODDS_RATE_LIMIT' }); });
    await page.route(endpoint('odds/collect'), async route => { operations.push('collect'); await reply(route, {}); });
    await open(page, 'Odds connection');
    await captureCommissioner(page, info, 'odds-initial', { compact: true });
    await sheet(page).getByRole('button', { name: 'Check connection (zero-credit)', exact: true }).click();
    await expect(sheet(page).getByRole('button', { name: 'Checking…', exact: true })).toBeDisabled();
    await expect(sheet(page).getByRole('button', { name: 'Fetch current lines', exact: true })).toBeDisabled();
    await captureCommissioner(page, info, 'odds-busy', { compact: true }); release();
    await expect(sheet(page).getByRole('alert')).toContainText('temporarily limited requests');
    await captureCommissioner(page, info, 'odds-rate-limit', { compact: true });
    expect(operations).toEqual(['preflight']);
  } finally { release(); await world.db.close(); }
});

test('week opening failure and changed inputs cannot publish an old schedule', async ({ page, baseURL }, info) => {
  const world = await communityWorld(page, baseURL, { groupScreens: true });
  try {
    let writes = 0;
    await page.route(endpoint('community/publish-preview'), route => reply(route, { error: 'Fixture schedule read unavailable' }, 503));
    await page.route(endpoint('community/publish'), async route => { writes++; await reply(route, {}); });
    await open(page, 'Week opening');
    await sheet(page).getByRole('button', { name: 'Review schedule', exact: true }).click();
    await expect(sheet(page).getByRole('alert')).toContainText('Fixture schedule read unavailable');
    await expect(sheet(page).getByRole('button', { name: /^Publish Week/ })).toHaveCount(0);
    await sheet(page).getByLabel('Week', { exact: true }).fill('25');
    await expect(sheet(page).locator('[data-preview]')).toHaveCount(0);
    await captureCommissioner(page, info, 'weeks-error', { compact: true });
    expect(writes).toBe(0);
  } finally { await world.db.close(); }
});
