// Me › History › Older records (redesign build plan stage 74; D-23, D-35, D-36, Q8), on the real handler, every migration and
// local PGlite with the 2026 Week 5 replay plus stored older records (history-world.mjs addOlderRecords). Contracts, at 390:
// - the retired Betting Challenge lists every player's record, and each record equals the old Betting Challenge screen's
//   (server/engine.mjs standings: gradeBet over the same selections and finals);
// - saved games and notes, forecasts and the journal are read-only and the owner's alone; an archived journal record is
//   listed with its label and its changes in plain words, never left out;
// - the real slips record by week, the older group scoring views with dates on every row (the archived totals to the
//   commissioner seat only) and the Week 5 benchmark freeze record for its group;
// - no side scroll, 44px targets, no text under 12px, nothing clipped; axe clean at 390 and 320, Dark and Light.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { ACCOUNTS, pgliteAvailable, signIn } from './community-world.mjs';
import { addOlderRecords, historyWorld, FINALS, SELECTIONS } from './history-world.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { createEngine } from '../../server/engine.mjs';
import { seed } from '../../server/store.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(180000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const AXE = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const history = page => page.locator('[data-page="history"]');
const section = (page, id) => history(page).locator(`[data-older-section="${id}"]`);

async function openOlder(page, account) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('about:blank'); await page.goto('/#history/older');
  await signIn(page, account, { navigate: false });
  await expect(history(page).getByRole('group', { name: 'History view' }).getByRole('button', { name: 'Older' })).toHaveAttribute('aria-pressed', 'true');
}
const open = async (page, id) => {
  await history(page).locator(`[data-older="${id}"]`).click();
  await expect(section(page, id)).toBeVisible();
};
const back = page => history(page).getByRole('button', { name: 'Older records', exact: true }).click();
async function phoneChecks(page, label, testInfo) {
  const found = {};
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => window.scrollTo(0, 0));
      const problems = await page.evaluate(layoutProblems);
      if (problems.length) found[`${label} ${theme} ${width}`] = problems;
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} ${theme} ${width} side scroll`).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(AXE).analyze()).violations, `${label} ${theme} ${width}`).toEqual([]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath(`history-older-${label}-${theme}.png`), fullPage: true });
  }
  expect(found).toEqual({});
}

/** The old Betting Challenge screen's standings for the same selections and finals (server/engine.mjs, gradeBet). */
function oldScreenRecords() {
  const state = seed();
  state.bets = {};
  for (const [who, gameId, market, side, line] of SELECTIONS) (state.bets[who] ??= {})[gameId] = { gameId, market, side, line, odds: -110, source: 'DraftKings' };
  state.results = Object.fromEntries(Object.entries(FINALS).map(([id, score]) => [id, { status: 'final', ...score }]));
  const standings = createEngine(state, { uuid: randomUUID }).view('sean', 'betting_challenge').standings;
  return Object.fromEntries(standings.map(row => [row.id, { record: `${row.betRecord.W}–${row.betRecord.L}–${row.betRecord.P}`, winRate: row.winRate }]));
}

test('older records for the commissioner seat: the retired Betting Challenge matches the old screen; every record read-only', async ({ page, baseURL }, testInfo) => {
  const world = await historyWorld(page, baseURL);
  try {
    await addOlderRecords(world);
    await openOlder(page, 'sean');
    await expect(history(page).locator('[data-older]')).toHaveText(['Betting Challenge · retired', 'Saved games and notes', 'Forecasts', 'Journal',
      'Real slips by week', 'Older group scoring views', 'Week 5 benchmark freeze']);
    await phoneChecks(page, 'list', testInfo);

    // Betting Challenge · retired: every player's record, the same as the old screen's.
    await open(page, 'challenge');
    const old = oldScreenRecords();
    expect(old.troy).toEqual({ record: '2–0–0', winRate: 100 });
    expect(old.luke).toEqual({ record: '0–1–0', winRate: 0 });
    const challenge = section(page, 'challenge');
    const record = id => challenge.locator(`[data-challenge-record="${id}"]`);
    await expect(record(ACCOUNTS.troy.id)).toContainText(old.troy.record);
    await expect(record(ACCOUNTS.troy.id)).toContainText('100.0%');
    await expect(record(ACCOUNTS.luke.id)).toContainText(old.luke.record);
    await expect(record(ACCOUNTS.luke.id)).toContainText('0.0%');
    await expect(challenge.locator(`[data-selection="${ACCOUNTS.troy.id}:TB-DAL"]`)).toContainText(/Troy Fixture · Tampa Bay Buccaneers at Dallas Cowboys[A-Z@]* · DAL −8\.5 · −110/); // D-62 marks
    await expect(challenge.locator(`[data-selection="${ACCOUNTS.troy.id}:TB-DAL"]`)).toContainText('Won · Final · TB 17, DAL 31 · DraftKings');
    await expect(challenge.locator(`[data-selection="${ACCOUNTS.luke.id}:TB-DAL"]`)).toContainText('Over 48.5');
    await expect(challenge.locator(`[data-selection="${ACCOUNTS.luke.id}:TB-DAL"]`)).toContainText('Lost');
    await phoneChecks(page, 'challenge', testInfo);
    await back(page);

    // Saved games and notes: a saved game and a note on a game never saved (D-40), both kept whole.
    await open(page, 'saved');
    await expect(section(page, 'saved').locator('[data-saved="TB-DAL"]')).toContainText('Saved');
    await expect(section(page, 'saved').locator('[data-saved="TB-DAL"]')).toContainText('Dallas at home after the bye.');
    await expect(section(page, 'saved').locator('[data-saved="SF-SEA"]')).toContainText('Not saved');
    await expect(section(page, 'saved').locator('[data-saved="SF-SEA"]')).toContainText('Wind check before kickoff.');
    await back(page);

    // Forecasts with each saved value.
    await open(page, 'forecasts');
    await expect(section(page, 'forecasts').locator('[data-forecast="BUF-LAR:total"]')).toContainText(/Buffalo Bills at Los Angeles Rams[A-Z@]* · Total/);
    await expect(section(page, 'forecasts').locator('[data-forecast="BUF-LAR:total"]')).toContainText('47 → 49.5');
    await back(page);

    // Journal (Q8): read-only, the archived record listed with its label and changes; the summary counts active placed bets.
    await open(page, 'journal');
    const journal = section(page, 'journal');
    await expect(journal.locator('[data-journal]')).toHaveCount(2);
    await expect(journal.locator('[data-journal-summary]')).toContainText('2 records · 0 placed bets · 0–0–0');
    const archived = journal.locator('[data-journal]').filter({ hasText: 'Archived' });
    await expect(archived).toContainText('Placed bet · DAL −8.5 −110 · FanDuel');
    await expect(archived).toContainText('Stake USD 11.00 · returned USD 21.00');
    await archived.locator('summary').click();
    await expect(archived).toContainText('Recorded');
    await expect(archived).toContainText('Archived: Recorded twice by mistake');
    await expect(journal.getByRole('button', { name: /save|correct|archive|add/i })).toHaveCount(0);
    await phoneChecks(page, 'journal', testInfo);
    await back(page);

    // Real slips by week: Troy's tracked slip, marked Real slip, with its result.
    await open(page, 'slips');
    const slip = section(page, 'slips').locator('[data-slip]');
    await expect(slip).toHaveCount(1);
    await expect(slip).toContainText('Troy Fixture');
    await expect(slip).toContainText('Real slip');
    await expect(slip).toContainText('WIN');
    await expect(slip).toContainText('DAL -8.5');
    await back(page);

    // Older group scoring views: the commissioner seat's archived score movement, a date on every row (DP-17).
    await open(page, 'archives');
    const archive = section(page, 'archives').locator('[data-archive="sean-troy-luke"]');
    await expect(archive.locator('[data-archived-count]')).toHaveText('2 historical predictions with invalid matchups remain archived and excluded from scoring.');
    await expect(archive.locator('[data-snapshot]')).toHaveCount(3);
    for (const row of await archive.locator('[data-snapshot] summary').all()) await expect(row).toContainText(/PT/);
    await expect(archive.locator('[data-snapshot]').first()).toContainText('pts');
    await archive.locator('[data-snapshot] summary').first().click();
    await expect(archive.locator('[data-snapshot]').first()).toContainText('your pick');
    await phoneChecks(page, 'archives', testInfo);
    await back(page);

    // The Week 5 benchmark freeze record (DP-4), read-only.
    await open(page, 'benchmark');
    const freeze = section(page, 'benchmark').locator('[data-benchmark]');
    await expect(freeze).toContainText('Frozen');
    await expect(freeze).toContainText(/Tampa Bay Buccaneers at Dallas Cowboys[A-Z@]* · DAL −8\.5/);
    await expect(freeze).toContainText(/San Francisco 49ers at Seattle Seahawks[A-Z@]* · SEA −3/);
    expect(world.errors).toEqual([]);
  } finally {
    await world.db.close();
  }
});

test('another member reads the same Betting Challenge record, none of Sean\'s private records and no archived totals', async ({ page, baseURL }) => {
  const world = await historyWorld(page, baseURL);
  try {
    await addOlderRecords(world);
    await openOlder(page, 'luke');
    await open(page, 'challenge');
    await expect(section(page, 'challenge')).toContainText('2–0–0');
    await back(page);
    for (const id of ['saved', 'forecasts', 'journal', 'benchmark']) {
      await open(page, id);
      await expect(section(page, id)).toContainText('Nothing recorded.');
      await back(page);
    }
    await open(page, 'archives');
    const archive = section(page, 'archives').locator('[data-archive="sean-troy-luke"]');
    await expect(archive.locator('[data-snapshot]')).toHaveCount(3);
    await expect(archive).not.toContainText('pts');
    await archive.locator('[data-snapshot] summary').first().click();
    await expect(archive).not.toContainText('your pick');
    const text = await history(page).textContent();
    for (const secret of ['Dallas at home after the bye.', 'Wind check before kickoff.', 'Recorded twice by mistake', '49.5']) expect(text).not.toContain(secret);
    expect(world.errors).toEqual([]);
  } finally {
    await world.db.close();
  }
});
