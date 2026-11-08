import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACCOUNTS, SUPABASE, pgliteAvailable, signIn } from './community-world.mjs';
import { historyWorld, addOlderRecords } from './history-world.mjs';
import { setCaptureTheme, themedScreenshot } from './theme-capture.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

test.setTimeout(120000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

async function capture(page, info, label, themes = ['dark', 'light']) {
  for (const theme of themes) {
    await setCaptureTheme(page, theme);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(layoutProblems), `${label} ${theme} ${width}`).toEqual([]);
      expect(await page.locator('.gx-history').evaluate(root => [...root.querySelectorAll('button,select,input,summary')].filter(el => el.getClientRects().length && (el.textContent.trim() || el.matches('input,select'))).flatMap(el => {
        const r = el.getBoundingClientRect(), font = parseFloat(getComputedStyle(el).fontSize);
        return r.height < 43.5 || r.width < 43.5 || font < 16 ? [`${el.tagName}: ${r.width}x${r.height}, ${font}px`] : [];
      })), `${label} native controls ${theme} ${width}`).toEqual([]);
      if (label === 'history-older') await assertOlderIcons(page, width);
      await themedScreenshot(page, info, `${label}-${theme}-${width}.png`, theme, { fullPage: true });
      if (label === 'guess-scorecard') {
        const card = page.locator('[data-pick-scorecard]').first();
        await card.evaluate(el => el.scrollIntoView({ block: 'center' }));
        await card.screenshot({ path: info.outputPath(`pick-card-${theme}-${width}.png`) });
        const parts = await card.evaluate(el => { const team = el.querySelector('.gx-pc-team').getBoundingClientRect(), value = el.querySelector('.gx-pc-value').getBoundingClientRect(); return { teamTop: team.top, valueBottom: value.bottom, teamRight: team.right, valueLeft: value.left }; });
        expect(parts.valueLeft, 'Pick team and saved guess retain the paired composition').toBeGreaterThanOrEqual(parts.teamRight);
      }
    }
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await setCaptureTheme(page, 'dark', { forcedColors: 'active' });
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  if (label === 'history-older') await assertOlderIcons(page, 320, true);
  await themedScreenshot(page, info, `${label}-forced-320.png`, 'dark', { fullPage: true });
  await page.emulateMedia({ forcedColors: 'none' });
}

async function assertOlderIcons(page, width, forced = false) {
  const icons = await page.locator('.gx-history .gx-link-row').evaluateAll((rows, { width, forced }) => rows.map(row => {
    const leading = row.querySelector(':scope > .gx-ic:first-child'), trailing = row.querySelector(':scope > .gx-ic:last-child');
    const a = getComputedStyle(leading), z = getComputedStyle(trailing);
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    probe.style.cssText = `color:${forced ? 'CanvasText' : 'var(--gx-accent-ink)'};background:${forced ? 'Canvas' : 'var(--gx-card-face)'};border:1px solid ${forced ? 'CanvasText' : 'var(--gx-glass-line)'};box-shadow:${forced ? 'none' : 'var(--gx-glass-shadow)'}`;
    row.insertBefore(probe, trailing); const expected = getComputedStyle(probe);
    const result = { size: [a.width, a.height], padding: a.padding, radius: a.borderRadius, box: a.boxSizing, border: [a.borderWidth, a.borderStyle], color: a.color === expected.color, borderColor: a.borderColor === expected.borderColor, background: a.background === expected.background, shadow: a.boxShadow === expected.boxShadow, trailingSize: [z.width, z.height], trailingPadding: z.padding, trailingBorder: z.borderWidth };
    probe.style.color = 'var(--gx-text-3)';
    result.trailingMuted = z.color === getComputedStyle(probe).color;
    probe.remove(); return result;
  }), { width, forced });
  expect(icons.length).toBeGreaterThan(0);
  for (const icon of icons) expect(icon).toEqual({ size: ['21px', '21px'], padding: width < 359 ? '8px' : '10px', radius: '15px', box: 'content-box', border: ['1px', 'solid'], color: true, borderColor: true, background: true, shadow: true, trailingSize: ['20px', '20px'], trailingPadding: '0px', trailingBorder: '0px', trailingMuted: true });
}

test('Prism History native scorecard: saved values, authoritative zero, pending, drafts, hidden, ineligible and Total', async ({ page, baseURL }, info) => {
  const world = await historyWorld(page, baseURL);
  try {
    const original = (await world.api('luke', 'community/history', {})).body;
    const week = original.weeks.find(w => w.week === 5), games = week.games.slice(0, 4);
    const now = original.now;
    const picks = [
      { gameId: games[0].id, guess: -3.5, lockedIn: true, points: 0, reference: { value: -4, source: 'Fictional saved reference' } },
      { gameId: games[1].id, guess: 1.5, lockedIn: true, points: null, reference: { value: null, status: 'pending' } },
      { gameId: games[2].id, guess: 4.5, lockedIn: false, points: null },
      { gameId: games[3].id, hidden: true, guess: 934, points: 9, reference: { value: 999, source: 'HIDDEN SENTINEL' } },
    ];
    const own = { userId: ACCOUNTS.luke.id, mode: 'guess_spread', status: 'draft', eligible: true, games: 4, weekPoints: 0, weekScored: 1, picks };
    const data = { ...original, weeks: [{ ...week, games, entries: [own, { ...own, mode: 'guess_total', picks: [{ ...picks[0], guess: 48, points: 3, reference: { value: 44.5 } }] }, { ...own, userId: ACCOUNTS.sean.id, eligible: false }] }] };
    await page.route(`${SUPABASE}/functions/v1/gtl-api/community/history`, route => route.fulfill({ json: data }));
    await page.addInitScript(() => { if (location.origin !== 'null') localStorage.setItem('gtl.app', 'next'); });
    await page.goto('/#history');
    await signIn(page, 'luke', { navigate: false });
    await page.locator('[data-week="5"]').click();
    const first = page.locator(`[data-game="${games[0].id}"]`);
    await first.locator('summary').click();
    const card = first.locator('[data-pick-scorecard]');
    await expect(card.getByRole('img', { name: '0 of 10 points', exact: true })).toBeVisible();
    await expect(card).toContainText('0.5');
    await expect(card.locator('.gx-team')).toHaveCount(2);
    await expect(card.locator('.gx-pc-chart')).toContainText('signed spread');
    await capture(page, info, 'guess-scorecard');
    for (const theme of ['dark', 'light']) {
      await setCaptureTheme(page, theme);
      const scan = await new AxeBuilder({ page }).include('.gx-history').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(scan.violations.map(v => v.id)).toEqual([]);
    }
    const pending = page.locator(`[data-game="${games[1].id}"]`);
    await pending.locator('summary').click();
    await expect(pending.locator('.gx-pc-chart')).toHaveCount(0);
    await expect(pending.locator('[data-pick-scorecard]')).toContainText('Comparison unavailable');
    const hidden = page.locator(`[data-game="${games[3].id}"]`);
    await hidden.locator('summary').click();
    await expect(hidden.locator('[data-pick-scorecard]')).toHaveCount(0);
    await expect(page.locator('.gx-history')).not.toContainText(/934|999|HIDDEN SENTINEL/);
    await page.getByRole('group', { name: 'Market', exact: true }).getByRole('button', { name: 'Total', exact: true }).click();
    await expect(first.locator('[data-pick-scorecard]')).toContainText('Combined points');
    await expect(first.getByRole('img', { name: '3 of 10 points', exact: true })).toBeVisible();
    await setCaptureTheme(page, 'light');
    await themedScreenshot(page, info, 'guess-total-light-320.png', 'light', { fullPage: true });
    await page.getByRole('group', { name: 'Market', exact: true }).getByRole('button', { name: 'Spread', exact: true }).click();
    await page.getByRole('group', { name: 'Player', exact: true }).getByRole('button', { name: 'Sean Fixture', exact: true }).click();
    await expect(first.locator('.gx-pc-points')).toHaveAttribute('aria-label', 'Points unavailable');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Prism History records: Bets, Older, own read-only journal and unavailable records retain native controls', async ({ page, baseURL }, info) => {
  const world = await historyWorld(page, baseURL);
  try {
    await addOlderRecords(world);
    await page.addInitScript(() => { if (location.origin !== 'null') localStorage.setItem('gtl.app', 'next'); });
    await page.goto('/#history/bets');
    await signIn(page, 'sean', { navigate: false });
    await expect(page.locator('[data-bets-player]').first()).toBeVisible();
    await expect(page.locator('.gx-history [data-pick-scorecard]')).toHaveCount(0);
    await capture(page, info, 'history-bets');
    await page.getByRole('group', { name: 'History view' }).getByRole('button', { name: 'Older', exact: true }).click();
    await expect(page.locator('[data-older="journal"]')).toBeVisible();
    await capture(page, info, 'history-older');
    await page.locator('[data-older="journal"]').click();
    await page.locator('[data-journal] summary').first().click();
    await expect(page.locator('[data-older-section="journal"]').getByRole('button', { name: /save|correct|archive|add/i })).toHaveCount(0);
    await capture(page, info, 'history-journal');
    await page.route(`${SUPABASE}/functions/v1/gtl-api/me/records`, route => route.fulfill({ status: 503, json: { error: 'Older records are not available yet. Every record is kept.' } }));
    await page.goto('about:blank');
    await page.goto('/#history/older');
    await expect(page.locator('.gx-history')).toContainText('Older records are not available yet');
    await expect(page.locator('[data-older="slips"]')).toBeVisible();
    for (const theme of ['dark', 'light']) {
      await setCaptureTheme(page, theme);
      await themedScreenshot(page, info, `history-records-off-${theme}-320.png`, theme, { fullPage: true });
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
