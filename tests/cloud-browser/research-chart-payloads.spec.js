import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, sendBallot, signIn, storeBookLines } from './community-world.mjs';
import { createResearchSnapshot } from '../../shared/trends-research-candidates.mjs';
import { createResearchProvider } from '../../cloud/trends-research.mjs';
import { row, registry, venues, corrections, T, historyCsv } from '../trends-fixture.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required. No hosted data.'));
const hash = text => createHash('sha256').update(text).digest('hex');

// Chart results are unmodified committed public nflverse history, not fabricated
// research replies. Only the future test slate, accounts and reference are fixtures.
async function setup(page, baseURL) {
  let provider, mode = 'normal';
  const pending = [];
  const calls = [];
  const research = { read: async request => {
    calls.push({ period: request.period, candidateId: request.candidateId });
    const result = await provider.read(request);
    if (mode === 'hold' && request.candidateId) await new Promise(resolve => { pending.push(resolve); });
    return result;
  } };
  const world = await communityWorld(page, baseURL, { migrations: ALL, research });
  const history = T.parseCsvRows(historyCsv).rows.filter(r => Number(r.season) >= 2021);
  const targets = world.state.games.map(g => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long' }).formatToParts(new Date(g.kickoff)).map(p => [p.type, p.value]));
    return row({ season: world.state.league.season, week: world.state.league.week, gameday: `${parts.year}-${parts.month}-${parts.day}`, gametime: `${parts.hour}:${parts.minute}`, weekday: parts.weekday,
      away_team: g.id.split('-')[0], home_team: g.id.split('-')[1] });
  });
  const csv = T.writeCompactCsv([...history, ...targets]), now = new Date(Date.now() - 1000).toISOString();
  const snapshot = await createResearchSnapshot({ csv, now, season: world.state.league.season, registry, venues, corrections });
  provider = createResearchProvider({ loadSchedule: async () => csv, loadSnapshot: async () => snapshot, venues, corrections });
  const ids = world.state.games.map(g => g.id);
  await storeBookLines(world, { spread: Object.fromEntries(ids.map(id => [id, -3])), total: Object.fromEntries(ids.map(id => [id, 44])) });
  await sendBallot(world, 'luke', 'guess_total', Object.fromEntries(ids.map(id => [id, 42])));
  await signIn(page, 'luke');
  await page.goto('/#research/trends');
  const list = page.getByRole('region', { name: 'Historical trends', exact: true });
  await expect(list.getByRole('combobox', { name: 'Evidence period' })).toBeVisible();
  await list.getByRole('combobox', { name: 'Evidence period' }).selectOption('all');
  await expect(list.locator('[data-research-card]')).toHaveCount(12);
  return { world, snapshot, list, calls, source: { publicHistorySha256: hash(historyCsv), controlledCsvSha256: hash(csv), publicRows: history.length, fixtureTargets: targets.length, generatedAt: now }, hold() { mode = 'hold'; }, release() { mode = 'normal'; pending.splice(0).forEach(resolve => resolve()); } };
}
async function theme(page, theme) {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.evaluate(theme => {
    localStorage.setItem('gtl.theme', theme);
    window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: theme }));
  }, theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  // Computed token proves the preference has propagated through native effects.
  await expect.poll(() => page.locator('.gx').first().evaluate(el => getComputedStyle(el).getPropertyValue('--gx-text-1').trim())).toBe(theme === 'dark' ? '#F3E9D7' : '#243128');
}

test('all public-source row curves stay compact; exact detail seasons and table share selection in both themes', async ({ page, baseURL }, info) => {
  test.setTimeout(120000);
  const { world, snapshot, list, calls, source } = await setup(page, baseURL);
  try {
    const cards = list.locator('[data-research-card]');
    await expect(list.locator('.gx-tc-mini')).toHaveCount(12);
    expect(calls.filter(c => c.candidateId)).toHaveLength(0);
    const id = await cards.first().getAttribute('data-research-card');
    const exact = snapshot.candidates.find(c => c.id === id).periods.all;
    expect(exact.series.points.length).toBeGreaterThan(exact.rowSeries.points.length);
    for (const width of [320, 390]) for (const name of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 844 }); await theme(page, name); await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`public-rows-${width}-${name}.png`), fullPage: true });
    }
    await cards.first().getByRole('button', { expanded: false }).click();
    const first = cards.first();
    await expect(first.getByRole('button', { name: 'By season', exact: true })).toBeVisible();
    await expect(first.getByRole('slider')).toHaveAttribute('max', String(exact.series.points.length));
    const detailReads = calls.filter(c => c.candidateId === id).length;
    expect(detailReads).toBeLessThanOrEqual(1);
    for (const name of ['dark', 'light']) {
      await theme(page, name);
      await first.getByRole('button', { name: 'By season', exact: true }).click();
      const seasonTable = first.getByRole('region', { name: /Season results/ }).getByRole('table');
      await expect(seasonTable.locator('tbody tr')).toHaveCount(exact.perSeason.length);
      const season = exact.perSeason[0];
      await first.getByRole('button', { name: `Show ${season.season} season on chart` }).click();
      await expect(first.getByRole('slider')).toHaveAttribute('aria-valuetext', new RegExp(`^${season.season}:`));
      await expect(seasonTable.locator('tr[data-selected="true"]')).toContainText(String(season.season));
      await first.locator('[data-trend-detail]').evaluate(el => { el.scrollIntoView({ block: 'start' }); scrollBy(0, -80); });
      await page.screenshot({ path: info.outputPath(`public-seasons-${name}.png`) });
      await seasonTable.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await page.screenshot({ path: info.outputPath(`public-season-table-${name}.png`) });
      await first.getByRole('button', { name: /^Since / }).click();
      await first.locator('[data-trend-detail]').evaluate(el => { el.scrollIntoView({ block: 'start' }); scrollBy(0, -80); });
      await page.screenshot({ path: info.outputPath(`public-line-${name}.png`) });
      await first.getByRole('button', { name: 'View evidence', exact: true }).click();
      const table = first.locator('.gx-r-table');
      await expect(table.locator('tbody tr')).toHaveCount(exact.series.points.length);
      await table.getByRole('button').first().click();
      await expect(first.getByRole('slider')).toHaveValue('1');
      await expect(table.locator('tr[data-selected="true"]')).toContainText(new Date(exact.series.points[0].to).toISOString().slice(0, 10));
      await first.getByRole('slider').focus(); await page.keyboard.press('End');
      await expect(table.locator('tr[data-selected="true"]')).toContainText(new Date(exact.series.points.at(-1).to).toISOString().slice(0, 10));
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await first.getByRole('button', { name: 'Hide evidence', exact: true }).click();
    }
    expect(calls.filter(c => c.candidateId === id)).toHaveLength(detailReads || 1);
    const texts = await cards.allTextContents();
    expect(texts.some(t => t.includes('Illustrative units at -110'))).toBe(true);
    await fs.writeFile(info.outputPath('source-receipt.json'), JSON.stringify({ ...source, candidateId: id, rows: exact.perSeason, fullBins: exact.series.points.length, rowBins: exact.rowSeries.points.length, detailReads: calls.filter(c => c.candidateId === id).length }, null, 2));
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('an opened non-shortlist detail cannot survive a period or account change', async ({ page, baseURL }) => {
  test.setTimeout(120000);
  const run = await setup(page, baseURL);
  try {
    const first = run.list.locator('[data-research-card]').first();
    run.hold(); await first.getByRole('button', { expanded: false }).click();
    await expect.poll(() => run.calls.filter(c => c.candidateId).length).toBe(1);
    await run.list.getByRole('combobox', { name: 'Evidence period' }).selectOption('previousSeason');
    await expect(run.list.locator('[data-research-card]')).toHaveCount(12);
    await expect(run.list.locator('[data-trend-detail]')).toHaveCount(0);
    run.release();
    await first.getByRole('button', { expanded: false }).click();
    await expect.poll(() => run.calls.filter(c => c.candidateId && c.period === 'previousSeason').length).toBe(1);
    await expect(first.getByRole('button', { name: 'By season', exact: true })).toBeVisible();
    await first.getByRole('button', { name: 'By season', exact: true }).click();
    await expect(first.locator('.gx-tc-table tbody tr')).toHaveCount(1);
    await expect(first.locator('.gx-tc-table')).toContainText('2025');
    await first.locator('.gx-tc-row').click(); run.hold(); await first.locator('.gx-tc-row').click();
    await expect.poll(() => run.calls.filter(c => c.candidateId && c.period === 'previousSeason').length).toBe(2);
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'sean', { navigate: false });
    run.release();
    await page.goto('/#research/trends');
    await expect(page.locator('[data-research-card]')).toHaveCount(0);
    expect(run.world.errors).toEqual([]);
  } finally { run.release(); await run.world.db.close(); }
});
