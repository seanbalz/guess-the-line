// Bets › Everyone (M-10, redesign stage 40; D-36) in the real app on the real handler with every migration (ALL) on
// local PGlite. Contracts, for Luke viewing Troy's and Sean's Virtual Units picks:
// - before Luke locks in anything, a friend's pick shows its side and units and a lock sentence; the line, price and
//   book appear nowhere: not in the /bets/read reply, not in the page's text or attributes;
// - Luke's own pick always shows in full;
// - after Luke sends his Spread guesses, Troy's Spread terms show and Sean's Total stays closed;
// - a private league sends its id, and the screen names it;
// - the landing row and the Your picks / Everyone switch reach the screen; nothing is written while browsing;
// - the phone rules (layoutProblems) hold at 320 Light and 390 Dark, and axe passes in both themes.
// Fixture values only (never live odds); never contacts hosted data.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { ACCOUNTS, communityWorld, pgliteAvailable, sendBallot, signIn, storeBookLines } from './community-world.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(120000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const READ = '/functions/v1/gtl-api/bets/read';
// The terms each friend saved. Closed to Luke until his gate opens; none of these strings may reach him early.
const TROY_SECRETS = ['13.5', 'BetMGM', '115'];
const SEAN_SECRETS = ['44.5', 'FanDuel', '105'];

async function seedPicks(world) {
  const { db, state } = world, { season, week } = state.league, [g0, g1] = state.games;
  await storeBookLines(world, { spread: { [g0.id]: -13.5, [g1.id]: 2.5 }, total: { [g0.id]: 51.5, [g1.id]: 44.5 } });
  const now = new Date().toISOString();
  const rows = [
    ['troy', g0.id, 'spread', { side: 'home', line: -13.5, odds: -115, units: 1.5, source: 'BetMGM' }],
    ['sean', g1.id, 'total', { side: 'over', line: 44.5, odds: -105, units: 1, source: 'FanDuel' }],
    ['luke', g0.id, 'total', { side: 'under', line: 51.5, odds: -110, units: 2, source: 'DraftKings' }],
  ];
  for (const [who, gameId, market, selection] of rows) {
    await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing', [ACCOUNTS[who].id, season, week]);
    await db.query('insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection) values($1,$2,$3,$4,$5,$6)',
      [ACCOUNTS[who].id, season, week, gameId, market, { gameId, market, ...selection, quotedAt: now, selectedAt: now }]);
  }
  return { g0, g1 };
}

const row = (page, who, market) => page.locator(`[data-pick="${ACCOUNTS[who].id}:${market}"]`);
// The reads this screen and the frame make; any other request would be a write.
const READS = ['GET /functions/v1/gtl-api/lobby', 'GET /functions/v1/gtl-api/personal', 'POST /functions/v1/gtl-api/community/read', 'POST /functions/v1/gtl-api/me/preferences',
  'POST /functions/v1/gtl-api/social/read', 'POST /functions/v1/gtl-api/trends/week', 'POST /functions/v1/gtl-api/bets/read'];
const writes = calls => calls.filter(call => !READS.includes(`${call.method} ${call.path}`));

async function openEveryone(page) {
  const reply = page.waitForResponse(response => new URL(response.url()).pathname === READ);
  await page.goto('about:blank');
  await page.goto('/#bets/everyone');
  const response = await reply;
  await expect(page.getByRole('heading', { name: 'Everyone’s picks', level: 1 })).toBeVisible();
  await expect(page.locator('[data-bets="everyone"]')).toBeVisible();
  return { response, body: await response.text(), request: response.request().postDataJSON() };
}

async function pageText(page) {
  return page.evaluate(() => `${document.body.innerText}\n${[...document.querySelectorAll('*')].flatMap(el => [...el.attributes].map(a => a.value)).join('\n')}`);
}

test('a friend’s pick shows side and units until Luke’s gate opens; then only that market’s terms show', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, troyBallots: false });
  const calls = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname.includes('/functions/v1/')) calls.push({ method: request.method(), path: url.pathname }); });
  try {
    const { g0, g1 } = await seedPicks(world);
    await page.addInitScript(() => { try { localStorage.setItem('gtl.app', 'next'); } catch { /* about:blank has no storage */ } });
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible();

    // Closed: the reply and the page carry Troy's and Sean's side and units only.
    let opened = await openEveryone(page);
    expect(opened.request).toEqual({});
    for (const secret of [...TROY_SECRETS, ...SEAN_SECRETS]) expect(opened.body, `reply: ${secret}`).not.toContain(secret);
    await expect(row(page, 'troy', 'spread')).toHaveAttribute('data-open', 'false');
    await expect(row(page, 'troy', 'spread')).toContainText(g0.homeCode);
    await expect(row(page, 'troy', 'spread')).toContainText('1.5U');
    await expect(row(page, 'troy', 'spread')).toContainText('Lock in your Spread guess for this game');
    await expect(row(page, 'sean', 'total')).toContainText('Over');
    await expect(row(page, 'sean', 'total')).toContainText('Lock in your Total guess for this game');
    for (const secret of [...TROY_SECRETS, ...SEAN_SECRETS]) expect(await pageText(page), `page: ${secret}`).not.toContain(secret);
    // Luke's own pick, in full.
    await expect(row(page, 'luke', 'total')).toHaveAttribute('data-open', 'true');
    await expect(row(page, 'luke', 'total')).toContainText('Under 51.5');
    await expect(row(page, 'luke', 'total')).toContainText('−110 · DraftKings');
    await expect(page.getByText('Friends’ lines and prices show after you lock in that game’s guess, or at kickoff.')).toHaveCount(1);

    // Luke sends his Spread guesses: every Spread market opens for him; Totals stay closed.
    await sendBallot(world, 'luke', 'guess_spread', { [g0.id]: -3, [g1.id]: 2 });
    opened = await openEveryone(page);
    await expect(row(page, 'troy', 'spread')).toHaveAttribute('data-open', 'true');
    await expect(row(page, 'troy', 'spread')).toContainText(`${g0.homeCode} −13.5`);
    await expect(row(page, 'troy', 'spread')).toContainText('−115 · BetMGM');
    await expect(row(page, 'sean', 'total')).toHaveAttribute('data-open', 'false');
    for (const secret of SEAN_SECRETS) {
      expect(opened.body, `reply after Spread: ${secret}`).not.toContain(secret);
      expect(await pageText(page), `page after Spread: ${secret}`).not.toContain(secret);
    }
    expect(writes(calls), 'browsing writes nothing').toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the landing row and the Virtual switch reach Everyone; a private league sends its id', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, troyBallots: false });
  try {
    await seedPicks(world);
    await page.addInitScript(() => { try { localStorage.setItem('gtl.app', 'next'); } catch { /* about:blank has no storage */ } });
    await page.goto('/#bets');
    await signIn(page, 'luke', { navigate: false });
    await page.getByRole('button', { name: /Everyone’s picks/ }).click();
    await expect(page.getByRole('heading', { name: 'Everyone’s picks', level: 1 })).toBeVisible();
    expect(new URL(page.url()).hash).toMatch(/^#bets\/everyone(\?|$)/);
    await page.getByRole('group', { name: 'Virtual Units view' }).getByRole('button', { name: 'Your picks' }).click();
    await expect(page.getByRole('heading', { name: 'Virtual Units', level: 1 })).toBeVisible();
    await page.getByRole('group', { name: 'Virtual Units view' }).getByRole('button', { name: 'Everyone' }).click();
    await expect(page.locator('[data-bets="everyone"]')).toBeVisible();
    await expect(page.locator('[data-bets="everyone"]')).toContainText('Community · Week');

    // The private league: its id goes with the read and the screen names it.
    await page.evaluate(id => localStorage.setItem(`gtl.next.league.v1.${encodeURIComponent(id)}`, JSON.stringify({ id: 'sean-troy-luke', name: 'Triple Threat' })), ACCOUNTS.luke.id);
    const opened = await openEveryone(page);
    expect(opened.request).toEqual({ leagueId: 'sean-troy-luke' });
    expect(opened.response.status()).toBe(200);
    await expect(page.locator('[data-bets="everyone"]')).not.toContainText('Community · Week');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Everyone fits a phone and passes axe in Dark at 390 and Light at 320', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, troyBallots: false });
  try {
    await seedPicks(world);
    await page.addInitScript(() => { try { localStorage.setItem('gtl.app', 'next'); } catch { /* about:blank has no storage */ } });
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible();
    for (const { theme, width } of [{ theme: 'dark', width: 390 }, { theme: 'light', width: 320 }]) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      await page.setViewportSize({ width, height: 844 });
      await openEveryone(page);
      expect(await page.evaluate(layoutProblems), `${theme} ${width}`).toEqual([]);
      const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), `${theme} ${width}`).toEqual([]);
      await page.screenshot({ path: `.local/cloud-browser-results/bets-everyone-${theme}-${width}.png`, fullPage: true });
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
