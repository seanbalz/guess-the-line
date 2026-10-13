import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// The Community History tab (Sean's October 12, 2026 ruling) on the real handler, every migration and PGlite. Luke views; Troy
// has pre-D-17 Week 5 Spread and Total ballots with no saved line. Luke sees Troy's ballots as hidden until he sits out a
// market (D-23); the revealed Total shows each guess with "No line stored" and stays unscored. Below 720px the game rows are
// cards, not a table, and the page never scrolls sideways.
const MIGRATIONS = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && !/scheduler_extension/.test(f)).sort();

for (const width of [390, 1280]) test(`community history: player buttons, newest week first, hidden until revealed, no line invented at ${width}px`, async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: MIGRATIONS });
  const { db, errors, state } = world;
  try {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, 'luke');
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page).toHaveURL(/#history$/);
    const players = page.getByRole('group', { name: 'Player' });
    await expect(players.getByRole('button')).toHaveText(['Luke Fixture · You', 'Sean Fixture', 'Troy Fixture']);
    await expect(players.getByRole('button', { name: 'Luke Fixture · You' })).toHaveAttribute('aria-pressed', 'true');
    const week = page.locator('.history-week').first();
    await expect(week).toContainText('Week 5 · 2026');
    await expect(week.locator('.history-market').nth(0)).toContainText('No spreads ballot yet.');
    await expect(week.locator('.history-market').nth(1)).toContainText('No totals ballot yet.');

    await players.getByRole('button', { name: 'Troy Fixture' }).click();
    await expect(players.getByRole('button', { name: 'Troy Fixture' })).toHaveAttribute('aria-pressed', 'true');
    for (const market of ['Spread', 'Total']) await expect(week).toContainText(`Hidden until you submit your Week 5 ${market} picks or sit out.`);
    await expect(week).toContainText('Submitted Oct 8, 11:00 AM PT');
    await expect(week).not.toContainText('47.5');
    await expect(week).not.toContainText('2.5');

    // Luke sits out Total from another device (D-23); Refresh reveals Troy's Total guesses. A pre-D-17 ballot has no saved line and no
    // snapshot exists for the week, so each guess reads "No line stored" and the ballot stays unscored. Spread stays hidden.
    const satOut = await world.api('luke', 'community/sit-out', { season: state.league.season, week: state.league.week, mode: 'guess_total' });
    expect(satOut.status).toBe(200);
    await page.locator('.history-toolbar').getByRole('button', { name: 'Refresh' }).click();
    const total = week.locator('.history-market').nth(1);
    await expect(total).toContainText('Total · Troy Fixture');
    await expect(total).toContainText('Unscoredno saved line for this ballot');
    await expect(total).toContainText('No line was saved with these guesses');
    const cells = total.locator(width < 720 ? '.history-cards dd.mono' : '.history-table tbody td:nth-child(2) strong');
    await expect(cells).toHaveText(['44', '47.5']);
    await expect(total).toContainText('No line stored');
    await expect(total).not.toContainText('Hidden until');
    await expect(week.locator('.history-market').nth(0)).toContainText('Hidden until you submit your Week 5 Spread picks or sit out.');
    await expect(week.locator('.history-market').nth(0)).not.toContainText('2.5');
    // Below 720px the game rows are cards; above it a table with 13px headers.
    await expect(total.locator('.history-table')).toBeVisible({ visible: width >= 720 });
    await expect(total.locator('.history-cards')).toBeVisible({ visible: width < 720 });
    if (width >= 720) expect(await total.locator('.history-table th[scope=col]').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.local/previews/community-history-${width}.png`, fullPage: true });

    // Luke's own row records the opt-out as sat out, not zero.
    await players.getByRole('button', { name: 'Luke Fixture · You' }).click();
    await expect(week.locator('.history-market').nth(1)).toContainText('Sat out');
    await expect(week.locator('.history-market').nth(1)).toContainText('Recorded as sat out, not zero.');

    // Persona audit #3: Back returns to the feed.
    await page.goBack();
    await expect(page.locator('.picks-due')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Feed', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});
