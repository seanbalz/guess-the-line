import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn, SUPABASE } from './community-world.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.skip(!pgliteAvailable, 'Install the local PGlite test runtime.');
test.setTimeout(120000);
const endpoint = path => url => url.origin === SUPABASE && url.pathname.endsWith(`/${path}`);
const results = page => page.getByRole('region', { name: 'Saved results', exact: true });
async function setup(page, baseURL) {
  const world = await communityWorld(page, baseURL, { virtualUnits: true, groupScreens: true, prepare: state => {
    state.games.forEach(game => game.kickoff = new Date(Date.now() - 4 * 3600000).toISOString());
  } });
  const [first, second] = world.state.games;
  let home = 31;
  world.schedule = async () => `season,game_type,week,away_team,away_score,home_team,home_score\n2026,REG,5,${first.awayCode},14,${first.homeCode},${home}\n2026,REG,5,${second.awayCode},,${second.homeCode},\n`;
  await world.db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,5) on conflict do nothing', [ACCOUNTS.sean.id]);
  const savedAt = new Date(Date.now() - 5 * 3600000).toISOString();
  const selection = { gameId: first.id, market: 'spread', side: 'home', line: -9.5, odds: -110, units: 1, riskDollars: 100, source: 'DraftKings', selectedAt: savedAt, quotedAt: savedAt };
  await world.db.query("insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection,audit,created_at,updated_at) values($1,2026,5,$2,'spread',$3,'[]',$4,$4)", [ACCOUNTS.sean.id, first.id, selection, savedAt]);
  return { world, first, selection, correct: value => { home = value; } };
}
async function open(page, account = 'sean') {
  await page.goto('/'); await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('about:blank'); await page.goto('/'); await signIn(page, account, { navigate: false });
  await page.getByRole('button', { name: 'Your menu', exact: true }).click();
}
async function consoleOpen(page) {
  await page.getByRole('button', { name: 'Settlement', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Published week' })).toHaveValue('2026:5');
}
async function confirm(page) {
  await page.getByRole('button', { name: 'Review settlement', exact: true }).click();
  await page.getByRole('button', { name: 'Settle published finals', exact: true }).click();
}
const ledger = db => db.query('select game_id,version,home,away,previous from public.gtl_virtual_units_settlements order by version').then(r => r.rows);

test('manual settlement, unchanged rerun and corrections preserve saved terms and prior versions', async ({ page, baseURL }, testInfo) => {
  const { world, first, selection, correct } = await setup(page, baseURL);
  try {
    const chunks = [];
    page.on('request', request => { if (/\/assets\/Settlement-[^/]+\.js$/.test(new URL(request.url()).pathname)) chunks.push(request.url()); });
    await open(page); expect(chunks).toHaveLength(0);
    await consoleOpen(page); expect(chunks).toHaveLength(1);
    await expect(page.getByText('Automatic schedule status is not available here.', { exact: false })).toBeVisible();
    expect(await ledger(world.db)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('settlement-list.png') });
    await page.getByRole('button', { name: 'Review settlement', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('settlement-review.png') });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await ledger(world.db)).toEqual([]);
    await confirm(page);
    await expect(results(page)).toContainText(`Final · ${first.awayCode} 14 – ${first.homeCode} 31`);
    await expect(page.getByLabel('Settlement report')).toContainText('Published finals: 1 · 1 new · 0 corrected · 0 unchanged · 1 picks graded');
    await expect(results(page)).toContainText('No stored result');
    await confirm(page);
    await expect(page.getByLabel('Settlement report')).toContainText('0 new · 0 corrected · 1 unchanged');
    expect(await ledger(world.db)).toHaveLength(1);
    correct(20); await confirm(page);
    await expect(results(page)).toContainText(`Final · ${first.awayCode} 14 – ${first.homeCode} 20`);
    const history = await ledger(world.db);
    expect(history).toHaveLength(2); expect(history[1].previous.home).toBe(31);
    const pick = (await world.db.query('select selection,status,result from public.gtl_virtual_units_picks where user_id=$1', [ACCOUNTS.sean.id])).rows[0];
    expect(pick.selection).toEqual(selection); expect(pick.status).toBe('loss'); expect(pick.result.previous).toBeTruthy();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width: 320, height: 740 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`settlement-${theme}.png`) });
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('only the Community commissioner can settle; final scores cannot be supplied by the client', async ({ page, baseURL }) => {
  const { world } = await setup(page, baseURL);
  try {
    await open(page, 'troy');
    await expect(page.getByRole('button', { name: 'Settlement', exact: true })).toHaveCount(0);
    expect((await world.api('troy', 'virtual-units/settle', { season: 2026, week: 5 })).status).toBe(403);
    expect((await world.api('sean', 'virtual-units/settle', { season: 2026, week: 5, finals: [] })).status).toBe(400);
    expect(await ledger(world.db)).toEqual([]);
  } finally { await world.db.close(); }
});

test('a lost settlement reply plus failed read recovers on reload without repeating settlement', async ({ page, baseURL }) => {
  const { world } = await setup(page, baseURL);
  try {
    await open(page); await consoleOpen(page);
    let writes = 0, fail = false;
    await page.route(endpoint('bets/recommendations'), route => fail ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Reader unavailable' }) }) : route.fallback());
    await page.route(endpoint('virtual-units/settle'), async route => {
      writes++; expect((await world.api('sean', 'virtual-units/settle', route.request().postDataJSON())).status).toBe(200);
      fail = true; await route.abort('failed');
    });
    await confirm(page);
    await expect(page.getByText('Reader unavailable', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Check saved results', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Check saved results', exact: true })).toBeEnabled();
    expect(writes).toBe(1); fail = false;
    await page.reload(); await page.getByRole('button', { name: 'Your menu', exact: true }).click(); await consoleOpen(page);
    await expect(results(page)).toContainText('Version 1');
    await expect(page.getByText('Current saved results loaded. Review them before deciding whether to settle again.', { exact: true })).toBeVisible();
    expect(writes).toBe(1); expect(await ledger(world.db)).toHaveLength(1);
  } finally { await world.db.close(); }
});

test('failed preflight and changed saved versions block stale confirmation', async ({ page, baseURL }) => {
  const { world } = await setup(page, baseURL);
  try {
    await open(page); await consoleOpen(page);
    await page.getByRole('button', { name: 'Review settlement', exact: true }).click();
    let fail = true, writes = 0;
    await page.route(endpoint('bets/recommendations'), route => fail ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Read unavailable' }) }) : route.fallback());
    await page.route(endpoint('virtual-units/settle'), route => { writes++; return route.fallback(); });
    await page.getByRole('button', { name: 'Settle published finals', exact: true }).click();
    await expect(page.getByText('Read unavailable', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settle published finals', exact: true })).toBeDisabled();
    expect(writes).toBe(0); fail = false;
    await page.getByRole('button', { name: 'Refresh results', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Settle published finals', exact: true })).toBeEnabled();
    expect((await world.api('sean', 'virtual-units/settle', { season: 2026, week: 5 })).status).toBe(200);
    await page.getByRole('button', { name: 'Settle published finals', exact: true }).click();
    await expect(page.getByText(/Saved results changed since your review/)).toBeVisible();
    expect(writes).toBe(0);
  } finally { await world.db.close(); }
});

test('busy settlement prevents duplicate requests and closing; a known reply survives a failed readback', async ({ page, baseURL }) => {
  const { world } = await setup(page, baseURL);
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  try {
    await open(page); await consoleOpen(page);
    let writes = 0, failRead = false;
    await page.route(endpoint('bets/recommendations'), route => failRead ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Readback unavailable' }) }) : route.fallback());
    await page.route(endpoint('virtual-units/settle'), async route => {
      writes++; await hold;
      const reply = await world.api('sean', 'virtual-units/settle', route.request().postDataJSON());
      failRead = true;
      await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) });
    });
    await confirm(page);
    await expect(page.getByRole('button', { name: 'Check saved results', exact: true })).toBeDisabled();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Settlement', exact: true })).toBeVisible();
    expect(writes).toBe(1); release();
    await expect(page.getByText('Readback unavailable', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Settlement report')).toContainText('Week 5 completed');
    await expect(page.getByRole('button', { name: 'Check saved results', exact: true })).toBeEnabled();
    failRead = false; await page.getByRole('button', { name: 'Check saved results', exact: true }).click();
    await expect(results(page)).toContainText('Version 1');
    expect(writes).toBe(1); expect(await ledger(world.db)).toHaveLength(1);
  } finally { release(); await world.db.close(); }
});

test('an older selected week stays selected after a failed read and recovery', async ({ page, baseURL }) => {
  const { world } = await setup(page, baseURL);
  try {
    const kickoff = Math.floor(Date.now() / 1000) + 7 * 86400;
    await world.db.query('insert into public.gtl_weekly_slates(season,week,signature) values(2026,6,$1)', [{ season: 2026, week: 6, deadline: kickoff, games: [{ id: 'KC-LV', away: 'KC', home: 'LV', kickoff }] }]);
    await open(page); await page.getByRole('button', { name: 'Settlement', exact: true }).click();
    const select = page.getByRole('combobox', { name: 'Published week' });
    await expect(select).toHaveValue('2026:6');
    let fail = true; const reads = [], writes = [];
    await page.route(endpoint('bets/recommendations'), route => {
      reads.push(route.request().postDataJSON());
      return fail ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Older week unavailable' }) }) : route.fallback();
    });
    await page.route(endpoint('virtual-units/settle'), route => { writes.push(route.request().postDataJSON()); return route.fallback(); });
    await select.selectOption('2026:5');
    await expect(page.getByText('Older week unavailable', { exact: true })).toBeVisible();
    fail = false; await page.getByRole('button', { name: 'Refresh results', exact: true }).click();
    await expect(select).toHaveValue('2026:5');
    await confirm(page); await expect(results(page)).toContainText('Version 1');
    expect(reads.every(value => value.season === 2026 && value.week === 5)).toBe(true);
    expect(writes).toEqual([{ season: 2026, week: 5 }]);
    expect((await world.db.query('select distinct week from public.gtl_virtual_units_settlements')).rows).toEqual([{ week: 5 }]);
  } finally { await world.db.close(); }
});

test('a fresh response without commissioner access blocks an open settlement review', async ({ page, baseURL }) => {
  const { world } = await setup(page, baseURL);
  try {
    await open(page); await consoleOpen(page);
    await page.getByRole('button', { name: 'Review settlement', exact: true }).click();
    // Simulate a changed read grant; the separate direct-handler test proves actual non-admin denial.
    await page.route(endpoint('community/read'), async route => {
      const reply = await world.api('sean', 'community/read', {});
      await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify({ ...reply.body, admin: false }) });
    });
    let writes = 0;
    await page.route(endpoint('virtual-units/settle'), route => { writes++; return route.fallback(); });
    await page.getByRole('button', { name: 'Settle published finals', exact: true }).click();
    await expect(page.getByText('Only the Community commissioner can settle results.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settle published finals', exact: true })).toBeDisabled();
    expect(writes).toBe(0); expect(await ledger(world.db)).toEqual([]);
  } finally { await world.db.close(); }
});
