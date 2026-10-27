import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, sendBallot, signIn, storeBookLines } from './community-world.mjs';

test.use({ viewport: { width: 320, height: 844 } });
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required. No hosted data.'));

// Every research result in this spec is synthetic, returned through the real authenticated handler.
function syntheticResearch({ expiry = false, delay = false, historyStatus = 'fresh', multipleBins = false } = {}) {
  const calls = [];
  let release, held, expireAt;
  const gate = new Promise(resolve => { release = resolve; });
  const provider = { read: async ({ board, period = 'recent30', candidateId, ...filters }) => {
    calls.push({ period, candidateId, ...filters });
    if (delay && period === 'recent25') { held = true; await gate; }
    const now = Date.now();
    if (expiry && !expireAt) expireAt = now + 3500;
    const selectedSample = period === 'recent25' ? 25 : 30;
    const sample = { wins: selectedSample - 10, losses: 9, pushes: 1, sample: selectedSample, decisive: selectedSample - 1, hitRate: (selectedSample - 10) / (selectedSample - 1), illustrativeUnits: Number(((selectedSample - 10) / 1.1 - 9).toFixed(2)), actualUnits: null, priceCoverage: { priced: 0, total: selectedSample, complete: false }, coverage: { from: '2025-09-01T00:00:00Z', to: '2026-10-20T00:00:00Z' }, exclusions: { invalid: 0 } };
    const definitions = ['A', 'B', 'C', 'Opposition', 'Emerging'];
    const open = board.games.filter(g => g.total.visible);
    const candidates = open.length ? definitions.map((name, i) => ({ id: `synthetic-${name.toLowerCase()}`, title: `Synthetic pattern ${name}`, version: 1, market: 'total', family: i === 4 ? 'rest' : 'schedule', period, sourceState: 'computed', conditions: ['Synthetic verified schedule condition'], conditionDescriptions: ['Synthetic verified schedule condition'], qualification: { qualifies: i < 4, label: i < 4 ? 'Consistent, not proven' : 'Emerging', reasons: [] }, record: sample, applications: open.map(g => ({ gameId: g.id, direction: i === 3 ? 'under' : 'over', whyApplies: ['Synthetic schedule'] })), registeredAt: '2026-10-21T00:00:00Z', ...(i < 3 || candidateId === `synthetic-${name.toLowerCase()}` ? { series: { points: [{ from: sample.coverage.from, to: sample.coverage.to, ...sample }], binned: true, selectedSample }, recent: sample, historical: sample, retrospective: sample, prospective: { ...sample, sample: 0, wins: 0, losses: 0, pushes: 0 }, seasonRecord: sample, inputCoverage: {} } : {}) })) : [];
    if (multipleBins) for (const candidate of candidates.filter(c => c.series)) candidate.series.points = [
      { from: sample.coverage.from, to: '2025-10-20T00:00:00Z', wins: 2, losses: 1, pushes: 1, sample: 4, illustrativeUnits: 0.82 },
      { from: '2025-10-21T00:00:00Z', to: sample.coverage.to, wins: sample.wins - 2, losses: 8, pushes: 0, sample: selectedSample - 4, illustrativeUnits: sample.illustrativeUnits },
    ];
    const group = (id, member, direction, role) => ({ id, memberIds: [`synthetic-${member}`], direction, role, mixed: false, overlaps: [] });
    const supporting = [group('support-a', 'a', 'over', 'support'), group('support-b', 'b', 'over', 'support')], alternatives = [group('opposition', 'opposition', 'under', 'alternative')];
    const ids = candidates.map(c => c.id), shortlist = ids.slice(0, 3);
    return { version: 'synthetic-browser-v1', now: new Date(now).toISOString(), season: board.season, week: board.week, shortlist, candidates, explore: ids.filter(id => !filters.family || candidates.find(c => c.id === id).family === filters.family), history: { status: historyStatus, snapshotAsOf: '2026-10-21T00:00:00Z', periodAnchor: '2026-10-21T00:00:00Z', source: { credit: 'Fixture nflverse credit', url: 'https://example.test/history', modified: 'Fixture derived historical records.', caveat: 'Fixture estimates are not forecasts.', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' } }, sources: [{ id: 'synthetic-source', name: 'Synthetic source', status: 'unavailable', checkedAt: null, plays: [] }], trent: { id: 'bookitwithtrent', name: 'Book It With Trent', status: 'unavailable', checkedAt: null, plays: [] }, filters: { families: ['rest', 'schedule'] }, games: board.games.map(g => ({ id: g.id, kickoff: expiry && expiry !== 'quote' ? new Date(expireAt).toISOString() : g.kickoff, spread: { visible: false }, total: !g.total.visible ? { visible: false } : { visible: true, ownGuess: g.mine?.total?.guess, savedReference: g.mine?.total?.lineAtGuess, currentReference: { ...g.total, observedAt: new Date(expiry === 'quote' ? expireAt - 12 * 3600000 : now - 60000).toISOString() }, guessGap: { value: 2 }, candidateIds: ids, shortlist, lean: { state: expiry && now >= expireAt ? 'unavailable' : 'lean', label: expiry && now >= expireAt ? 'Research unavailable' : 'Research lean: over', direction: 'over', reasons: expiry && now >= expireAt ? [expiry === 'quote' ? 'reference_stale' : 'not_pregame'] : [], supporting, alternatives, groups: [...supporting, ...alternatives], context: ['synthetic-emerging'] } } })) };
  } };
  return { provider, calls, release, get held() { return held; } };
}
async function setup(page, baseURL, options) {
  const synthetic = syntheticResearch(options);
  const world = await communityWorld(page, baseURL, { migrations: ALL, research: synthetic.provider });
  const ids = world.state.games.map(g => g.id);
  await storeBookLines(world, { spread: Object.fromEntries(ids.map(id => [id, -3])), total: Object.fromEntries(ids.map(id => [id, 44])) });
  await sendBallot(world, 'luke', 'guess_total', Object.fromEntries(ids.map(id => [id, 42])));
  await signIn(page, 'luke');
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('about:blank'); await page.goto('/#lines');
  await expect(page.getByRole('heading', { name: 'Lines', exact: true })).toBeVisible();
  return { world, synthetic, ids };
}
const sheet = page => page.getByRole('dialog', { name: 'Trends', exact: true });
async function openResearch(page) {
  await page.getByRole('button', { name: 'Open weekly research', exact: true }).click();
  await expect(sheet(page).locator('[data-research-card]')).toHaveCount(3);
}
async function phoneAndAxe(page, theme, testInfo) {
  await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const small = await sheet(page).locator('button,select,a,summary').evaluateAll(nodes => nodes.filter(n => n.getClientRects().length && !n.closest('details:not([open])')).map(n => ({ name: n.textContent.slice(0, 45), width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height })).filter(r => r.width < 44 || r.height < 44));
  expect(small).toEqual([]);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`synthetic-research-${theme}.png`) });
}

test.describe('source time presentation', () => {
test.use({ timezoneId: 'Asia/Tokyo' });
test('Research source times are readable in Pacific time without changing historical dates or market gates', async ({ page, baseURL }, testInfo) => {
  const { world, synthetic } = await setup(page, baseURL);
  const read = synthetic.provider.read;
  synthetic.provider.read = async request => {
    const result = await read(request);
    result.trent = { id: 'bookitwithtrent', name: 'Book It With Trent', status: 'reviewed', checkedAt: '2026-11-02T01:30:00Z', plays: [{
      id: 'synthetic-source-time', event: 'Synthetic matchup', selection: 'Synthetic selection', market: 'total', status: 'source-reported',
      originalTerms: 'Synthetic original terms', postedAt: '2026-10-21T11:00:00Z', capturedAt: '2026-10-21T11:30:00Z', sourceUrl: 'https://example.test/source',
    }] };
    return result;
  };
  try {
    await openResearch(page);
    const dialog = sheet(page), reference = dialog.locator('.gx-r-references').first();
    await dialog.getByRole('button', { name: 'About research data', exact: true }).click();
    const provenance = page.getByRole('dialog', { name: 'About research data', exact: true });
    await expect(provenance).toContainText('Period anchored to Tue Oct 20, 2026 · 5:00 PM PT');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await provenance.locator('time').last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`research-provenance-times-${theme}.png`) });
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    }
    await page.keyboard.press('Escape');
    await expect(reference).toContainText('Saved scoring reference');
    await expect(reference).toContainText('Current market reference');
    await expect(reference.locator('time')).toHaveCount(2);
    for (const timestamp of await reference.locator('time').allTextContents()) expect(timestamp).toMatch(/2026 · .* [AP]M PT$/);
    await expect(dialog.locator('[data-research-market="spread"]')).toHaveCount(0);
    await expect(dialog).toContainText('Spread research is locked');
    const first = dialog.locator('[data-research-card]').first();
    await first.getByRole('button', { name: 'View evidence', exact: true }).click();
    await expect(first.getByRole('table')).toContainText('2025-09-01');
    await expect(first.getByRole('table')).toContainText('2026-10-20');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await reference.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`research-reference-times-${theme}.png`) });
    }
    await dialog.getByRole('button', { name: 'Book It With Trent', exact: true }).click();
    await expect(dialog).toContainText('Source checked: Sun Nov 1, 2026 · 5:30 PM PT');
    await expect(dialog).toContainText('Posted: Wed Oct 21, 2026 · 4:00 AM PT');
    await expect(dialog).toContainText('Captured: Wed Oct 21, 2026 · 4:30 AM PT');
    await expect(dialog.locator('time').first()).toHaveAttribute('datetime', '2026-11-02T01:30:00Z');
    await expect(dialog).toContainText('Source-reported · not verified');
    await expect(dialog.getByRole('link', { name: 'Original source post' })).toHaveAttribute('href', 'https://example.test/source');
    for (const theme of ['light', 'dark']) await phoneAndAxe(page, theme, testInfo);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
});

test('shared weekly/matchup shortlist, full opposition, periods, chart/table, Trent and 320px themes', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(60000); // Two complete axe scans plus the real database/auth fixture.
  const { world, ids } = await setup(page, baseURL);
  try {
    await openResearch(page);
    const dialog = sheet(page);
    await expect(dialog.locator('.gx-r-alternative')).toContainText('Synthetic pattern Opposition');
    await expect(dialog.locator('.gx-r-support').first()).toContainText('Supports the lean');
    await expect(dialog.getByText('Spread research is locked.', { exact: false }).first()).toBeVisible();
    await expect(dialog.locator('[data-research-market="spread"]')).toHaveCount(0);
    await expect(dialog.getByText('History: fresh', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Snapshot:/)).toHaveCount(0);
    const dataInfo = dialog.getByRole('button', { name: 'About research data', exact: true });
    await dataInfo.click();
    const provenance = page.getByRole('dialog', { name: 'About research data', exact: true });
    await expect(provenance).toContainText('Snapshot: Tue Oct 20, 2026 · 5:00 PM PT');
    await expect(provenance.locator('time').first()).toHaveAttribute('datetime', '2026-10-21T00:00:00Z');
    await expect(provenance).toContainText('Period anchored to');
    await expect(provenance).toContainText('Filters change this list');
    await expect(provenance).toContainText('Fixture derived historical records.');
    await expect(provenance).toContainText('Fixture estimates are not forecasts.');
    await expect(provenance.getByRole('link', { name: 'Fixture nflverse credit', exact: true })).toHaveAttribute('href', 'https://example.test/history');
    await expect(provenance.getByRole('link', { name: 'CC BY 4.0', exact: true })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
    await provenance.getByRole('button', { name: 'Close', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(provenance.getByRole('link').first()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(provenance.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dataInfo).toBeFocused();
    const first = dialog.locator('[data-research-card]').first();
    const canonicalId = await first.getAttribute('data-research-card');
    await first.getByRole('button', { name: 'View evidence', exact: true }).click();
    await expect(first.getByRole('table')).toBeVisible();
    // D-55: the caveats are behind the card's ⓘ.
    await first.getByRole('button', { name: 'About this research', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'About this research' })).toContainText('Historical consistency does not establish a betting advantage.');
    await page.getByRole('dialog', { name: 'About this research' }).getByRole('button', { name: 'Close', exact: true }).click();
    await expect(first.getByRole('table').getByRole('cell', { name: '30', exact: true })).toBeVisible();
    await expect(first.locator('[data-zero-baseline]')).toHaveCount(1);
    const tooltipBottom = await first.locator('.gx-tc-tip').evaluate(el => el.getBoundingClientRect().bottom);
    const plotTop = await first.locator('.gx-tc-plot').evaluate(el => el.getBoundingClientRect().top);
    expect(tooltipBottom).toBeLessThanOrEqual(plotTop);
    for (const theme of ['light', 'dark']) await phoneAndAxe(page, theme, testInfo);
    await dialog.locator('.gx-r-tabs').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('research-overview-dark.png') });
    await dialog.getByLabel('Evidence period', { exact: true }).selectOption('recent25');
    await expect(dialog.locator('[data-research-card]').first()).toContainText('15–9–1');
    await dialog.getByRole('button', { name: 'Explore', exact: true }).click();
    await dialog.getByRole('button', { name: 'Emerging', exact: true }).click();
    await expect(dialog.locator('[data-research-card]')).toHaveCount(1);
    await expect(dialog.locator('[data-research-card]')).toContainText('Synthetic pattern Emerging');
    await dialog.getByLabel('Supported situation', { exact: true }).selectOption('rest');
    await expect(dialog.locator('[data-research-card]')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Book It With Trent', exact: true }).click();
    await expect(dialog.getByText('Source unavailable', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Original plays/)).toBeVisible();
    await expect(dialog.getByText(/Synthetic pattern/)).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator(`.gx-l-card[data-game="${ids[0]}"]`).click();
    const gameDialog = page.getByRole('dialog');
    await expect(gameDialog.locator(`[data-research-card="${canonicalId}"]`)).toHaveCount(1);
    await gameDialog.getByRole('button', { name: 'Open matchup research', exact: true }).click();
    await expect(page.getByRole('dialog').locator(`[data-research-card="${canonicalId}"]`)).toHaveCount(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('filter changes synchronously hide old scope and ignore delayed older replies; focus clears evidence before refetch', async ({ page, baseURL }) => {
  const { world, synthetic } = await setup(page, baseURL, { delay: true });
  try {
    await openResearch(page);
    await sheet(page).getByLabel('Evidence period').selectOption('recent25');
    await expect.poll(() => synthetic.held).toBe(true);
    await expect(sheet(page).locator('[data-research-card]')).toHaveCount(0);
    await sheet(page).getByLabel('Evidence period').selectOption('season');
    await expect(sheet(page).locator('[data-research-card]')).toHaveCount(3);
    synthetic.release();
    await expect(sheet(page).getByLabel('Evidence period')).toHaveValue('season');
    await expect(sheet(page).getByText(/15–9–1/)).toHaveCount(0);
    const before = synthetic.calls.length;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => synthetic.calls.length).toBeGreaterThan(before);
    expect(world.errors).toEqual([]);
  } finally { synthetic.release(); await world.db.close(); }
});

test('an open sheet removes its research lean at kickoff using a monotonic timer', async ({ page, baseURL }) => {
  const { world, synthetic } = await setup(page, baseURL, { expiry: true });
  try {
    await openResearch(page);
    await expect(sheet(page).getByText('Research lean: Over', { exact: true }).first()).toBeVisible();
    await page.evaluate(() => { const realNow = Date.now; Date.now = () => realNow() - 86400000; });
    await expect(sheet(page).getByText('Research lean: Over', { exact: true })).toHaveCount(0, { timeout: 8000 });
    await expect(sheet(page).getByText('Research unavailable', { exact: true }).first()).toBeVisible();
    expect(synthetic.calls.length).toBeGreaterThan(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a refreshed week suppresses previous-week evidence before a delayed older read can finish', async ({ page, baseURL }) => {
  const { world, synthetic } = await setup(page, baseURL);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    await openResearch(page);
    const original = synthetic.provider.read;
    let held = false;
    synthetic.provider.read = async request => { if (request.week === world.state.league.week) { held = true; await gate; } return original(request); };
    await page.route('**/functions/v1/gtl-api/personal', async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers() }));
      const body = await response.json(); body.week += 1;
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(body) });
    });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => held).toBe(true);
    await expect(sheet(page).locator('[data-research-card]')).toHaveCount(0);
    release();
    await expect.poll(() => synthetic.calls.some(call => call.week === world.state.league.week + 1)).toBe(true);
    await expect(sheet(page).getByText('No qualifying research in this view. Explore other situations.', { exact: true })).toBeVisible();
    await expect(sheet(page).getByText('Synthetic pattern A', { exact: true })).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { release?.(); await world.db.close(); }
});

test('switching accounts cannot restore the prior account’s delayed expected-market guess', async ({ page, baseURL }) => {
  const { world, synthetic } = await setup(page, baseURL, { delay: true });
  try {
    await openResearch(page);
    await sheet(page).getByLabel('Evidence period', { exact: true }).selectOption('recent25');
    await expect.poll(() => synthetic.held).toBe(true);
    await sheet(page).getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'troy', { navigate: false });
    await page.goto('/#lines');
    await expect(page.getByRole('heading', { name: 'Lines', exact: true })).toBeVisible();
    await openResearch(page);
    const expectedLine = sheet(page).locator('.gx-r-references > div').first();
    await expect(expectedLine).toContainText('44');
    synthetic.release();
    await expect(expectedLine).not.toContainText('42');
    expect(world.errors).toEqual([]);
  } finally { synthetic.release(); await world.db.close(); }
});


test('quote expiry removes the live lean while retaining the dated reference', async ({ page, baseURL }) => {
  const { world, synthetic } = await setup(page, baseURL, { expiry: 'quote' });
  try {
    await openResearch(page);
    await expect(sheet(page).getByText('Research lean: Over', { exact: true })).toBeVisible();
    await expect(sheet(page).getByText('Research lean: Over', { exact: true })).toHaveCount(0, { timeout: 8000 });
    await expect(sheet(page).getByText('Current reference is older than twelve hours.', { exact: true })).toBeVisible();
    await expect(sheet(page).locator('.gx-r-references > div').nth(2)).toContainText('44');
    expect(synthetic.calls.length).toBeGreaterThan(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});


test('compact research keeps stale-history warnings visible before opening its information', async ({ page, baseURL }) => {
  const { world } = await setup(page, baseURL, { historyStatus: 'stale' });
  try {
    await openResearch(page);
    await expect(sheet(page).getByText('History: stale', { exact: true })).toBeVisible();
    await expect(sheet(page).getByText('Current leans may be unavailable; dated historical evidence remains descriptive.', { exact: true })).toBeVisible();
    await expect(sheet(page).getByText(/Snapshot:/)).toHaveCount(0);
    await sheet(page).getByRole('button', { name: 'About research data', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'About research data', exact: true })).toContainText('Snapshot: Tue Oct 20, 2026 · 5:00 PM PT');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

// Two bins deliberately have different period and cumulative records. A single-bin
// fixture cannot detect a tooltip accidentally pairing period W-L-P with total units.
test('research chart records accumulate with units while the evidence table keeps period records', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(60000);
  const { world } = await setup(page, baseURL, { multipleBins: true });
  try {
    await openResearch(page);
    const first = sheet(page).locator('[data-research-card]').first();
    const slider = first.getByRole('slider', { name: 'Move along the line' });
    await expect(slider).toHaveAttribute('aria-valuetext', '+9.2 U, 20–9–1 total · through 2026-10-20');
    await slider.focus(); await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuetext', '0.0 U, Start, 2025-09-01');
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuetext', '+0.8 U, 2–1–1 total · through 2025-10-20');
    await page.keyboard.press('End');
    await expect(first.locator('.gx-tc-tip-label')).toHaveText('20–9–1 total · through 2026-10-20');
    await first.getByRole('button', { name: 'View evidence', exact: true }).click();
    const table = first.getByRole('table');
    await expect(table.getByRole('columnheader', { name: 'Period W-L-P', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Total units', exact: true })).toBeVisible();
    await expect(table.getByRole('cell', { name: '18-8-0', exact: true })).toBeVisible();
    await expect(table.getByRole('cell', { name: '9.18', exact: true })).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await first.locator('.gx-tc-line').scrollIntoViewIfNeeded();
      await phoneAndAxe(page, theme, testInfo);
      expect(await first.locator('.gx-tc-tip').evaluate(el => el.getBoundingClientRect().bottom))
        .toBeLessThanOrEqual(await first.locator('.gx-tc-plot').evaluate(el => el.getBoundingClientRect().top));
      await page.screenshot({ path: testInfo.outputPath(`cumulative-record-${theme}.png`) });
      await table.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`period-record-${theme}.png`) });
    }
    await sheet(page).getByLabel('Evidence period', { exact: true }).selectOption('recent25');
    await expect(slider).toHaveAttribute('aria-valuetext', '+4.6 U, 15–9–1 total · through 2026-10-20');
    await expect(sheet(page).getByText('Spread research is locked.', { exact: false }).first()).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
