import { test, expect } from '@playwright/test';

// "Your guess vs. the market" must read as stacked cards on phones and stay a table on desktop.
async function fixture(page) {
  const state = await (await page.request.get('/api/state?player=sean&mode=guess_spread')).json();
  state.scoringPolicy = 'submission-time'; state.revealed = true; state.locked = false;
  state.submittedAt = '2026-10-08T15:00:00Z'; state.now = '2026-10-08T16:00:00Z'; state.league.deadline = '2026-10-09T00:15:00Z';
  state.provisionalAnalysis = null; state.scoringBenchmark = null;
  const reference = value => ({ status:'stale', value, source:'The Odds API', bookCount:3, capturedAt:'2026-10-08T14:59:00Z', observedAt:'2026-10-08T14:58:30Z', savedAt:state.submittedAt });
  state.games = state.games.map((game, index) => ({ ...game, prediction:-3, scoringReference:{ ...reference(-4), status:'available' }, currentConsensus:reference(-7 + index * 0.5) }));
  await page.route('**/api/state?**', route => route.fulfill({ json: state }));
  await page.goto('/');
  return state;
}

for (const width of [320, 390, 1440]) test(`market comparison fits ${width}px without mid-word team wraps or clipped gaps`, async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 }); const state = await fixture(page);
  if (width <= 720) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Edge board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your guess vs. the market', exact: true })).toBeVisible();
  const table = page.locator('.market-comparison');
  await expect(table.locator('tbody tr')).toHaveCount(state.games.length);
  await expect(table.locator('tbody tr').first()).toContainText('Stale saved reference');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const names = table.locator('.team-matchup__name strong');
  expect(await names.count()).toBe(state.games.length * 2);
  const tall = await names.evaluateAll(nodes => nodes.filter(node => { const style = getComputedStyle(node); const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.35; return node.getBoundingClientRect().height > line * 2 + 1; }).map(node => node.textContent));
  expect(tall).toEqual([]);
  const overlaps = await table.locator('.team-matchup').evaluateAll(nodes => nodes.filter(node => { const at = node.querySelector('.team-matchup__at').getBoundingClientRect(); return [...node.querySelectorAll('.team-matchup__name small')].some(label => { const box = label.getBoundingClientRect(); return at.left < box.right && at.right > box.left && at.top < box.bottom && at.bottom > box.top; }); }).length);
  expect(overlaps).toBe(0);
  const gap = table.locator('.gap-pill').first(); await expect(gap).toBeVisible(); await expect(gap).toHaveText(/\d(\.\d)? pts/);
  expect(await gap.evaluate(node => { const box = node.getBoundingClientRect(); const row = node.closest('tr').getBoundingClientRect(); return box.right <= innerWidth && box.right <= row.right + 1 && node.scrollWidth <= node.clientWidth + 1; })).toBe(true);
  if (width <= 720) {
    await expect(table.locator('thead')).toBeHidden();
    expect(await table.locator('tbody tr').first().evaluate(node => getComputedStyle(node).display)).toBe('grid');
    const labels = await table.locator('tbody tr').first().evaluate(node => [...node.querySelectorAll('[data-label]')].map(cell => getComputedStyle(cell, '::before').content));
    expect(labels).toEqual(['"Saved guess"', '"Current consensus"', '"Gap"']);
    const minFont = await table.locator('tbody tr').first().evaluate(node => Math.min(...[...node.querySelectorAll('strong, .mono, .market-consensus-value, .gap-pill')].map(child => parseFloat(getComputedStyle(child).fontSize))));
    expect(minFont).toBeGreaterThanOrEqual(16);
  } else {
    await expect(table.locator('thead')).toBeVisible();
    expect(await table.locator('tbody tr').first().evaluate(node => getComputedStyle(node).display)).toBe('table-row');
  }
  await table.screenshot({ path: `.local/previews/market-table-${width}.png` });
  expect(errors).toEqual([]);
});
