import { test as base, expect } from '@playwright/test';
import { seed } from '../../server/store.mjs';
import { createCloudHandler } from '../../cloud/handler.mjs';
import { emptySocialRead } from './social-read-fixture.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';
import { communityWorld, pgliteAvailable, sendBallot, signIn, storeBookLines } from './community-world.mjs';

// D-26: the Virtual Units screen with settled, pending and voided picks. The real
// cloud handler serves /state, /virtual-units and /virtual-units/settle over
// in-memory fixtures; no hosted account, provider request or production write.
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const COMMISSIONER = id(1), MEMBER = id(2);
const now = Date.now(), iso = value => new Date(value).toISOString();
const finalsCsv = ['game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score,location',
  '2026_05_TB_DAL,2026,REG,5,2026-10-08,20:15,TB,14,DAL,31,Home', '2026_05_PHI_JAX,2026,REG,5,2026-10-11,09:30,PHI,21,JAX,24,Neutral', '2026_05_CIN_MIA,2026,REG,5,2026-10-11,13:00,CIN,,MIA,,Home'].join('\n');

function fixture(games, settled) {
  const stamp = iso(now - 3600000), quote = iso(now - 9 * 3600000);
  const selection = (game, market, side, line, odds, units) => ({ gameId: game.id, market, side, line, odds, units, source: 'DraftKings', quotedAt: quote, selectedAt: quote, riskDollars: units * 100 });
  const graded = (outcome, home, away, netUnits, extra = {}) => settled ? { outcome, status: home == null ? 'postponed' : 'final', reason: home == null ? 'postponed' : null, home, away, netUnits, returnedUnits: outcome === 'loss' ? 0 : 1 + netUnits, payoutDecimal: 1.9091, version: 1, settledAt: stamp, observedAt: stamp, source: 'nflverse fixture', sourceUrl: 'https://example.invalid/games.csv', previous: null, ...extra } : null;
  const status = outcome => settled ? outcome : 'pending';
  const picks = [
    { gameId: games[0].id, market: 'spread', selection: selection(games[0], 'spread', 'home', -9.5, -110, 1), status: status('win'), result: graded('win', 31, 14, 0.9091), audit: [], createdAt: quote, updatedAt: quote },
    { gameId: games[0].id, market: 'total', selection: selection(games[0], 'total', 'over', 45.5, -110, 1), status: status('loss'), result: graded('loss', 31, 14, -1), audit: [], createdAt: quote, updatedAt: quote },
    { gameId: games[1].id, market: 'spread', selection: selection(games[1], 'spread', 'away', 3, 100, 2), status: status('push'), result: graded('push', 24, 21, 0, { payoutDecimal: 2 }), audit: [], createdAt: quote, updatedAt: quote },
    { gameId: games[2].id, market: 'total', selection: selection(games[2], 'total', 'under', 44.5, -110, 1), status: status('void'), result: graded('void', null, null, 0, { returnedUnits: 1 }), audit: [], createdAt: quote, updatedAt: quote },
  ];
  const results = settled ? {
    [games[0].id]: { status: 'final', home: 31, away: 14, version: 1, settledAt: stamp, observedAt: stamp, source: 'nflverse fixture', sourceUrl: 'https://example.invalid/games.csv' },
    [games[1].id]: { status: 'final', home: 24, away: 21, version: 1, settledAt: stamp, observedAt: stamp, source: 'nflverse fixture', sourceUrl: 'https://example.invalid/games.csv' },
    [games[2].id]: { status: 'postponed', home: null, away: null, version: 1, settledAt: stamp, observedAt: stamp, source: 'nflverse fixture', sourceUrl: 'https://example.invalid/games.csv' },
  } : {};
  const summary = settled ? { wins: 1, losses: 1, pushes: 1, pending: 0, voids: 1, riskUnits: 4, netUnits: -0.0909, roi: -2.27, qualificationPicks: 4, qualificationUnits: 5 }
    : { wins: 0, losses: 0, pushes: 0, pending: 4, voids: 0, riskUnits: 0, netUnits: 0, roi: null, qualificationPicks: 4, qualificationUnits: 5 };
  return { picks, results, summary, settlement: { settledGames: settled ? 3 : 0, lastSettledAt: settled ? stamp : null, settledPicks: settled ? 4 : 0, pendingPicks: settled ? 0 : 4 } };
}

const test = base.extend({
  virtual: async ({ page, baseURL }, use) => {
    const state = seed(); state.games = state.games.slice(0, 3); state.bets = {}; state.audit = []; state.league.deadline = iso(now - 30 * 3600000);
    state.games.forEach((game, index) => { game.kickoff = iso(now - (30 - index) * 3600000); });
    const report = { errors: [], requests: [], settleCalls: [], actor: COMMISSIONER, settled: true, games: state.games };
    const user = { id: COMMISSIONER, aud: 'authenticated', role: 'authenticated', email: 'commissioner@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', exp: expires })).toString('base64url')}.test`;
    const session = { access_token: token, refresh_token: 'test-only', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
    const handler = createCloudHandler({ clock: Date.now,
      authenticate: async value => value === token ? { ...user, id: report.actor, emailConfirmed: true } : null,
      storage: { membership: async actor => ({ player_id: actor === COMMISSIONER ? 'sean' : 'troy', role: actor === COMMISSIONER ? 'commissioner' : 'player', active: true }) },
      weekly: { load: async () => ({ state, revision: 0, leagueRevision: 0 }) },
      odds: { marketSnapshot: async () => { throw new Error('No retained quotes in this fixture.'); } },
      virtual: {
        read: async actor => ({ season: 2026, week: 5, revision: 0, playerId: actor === COMMISSIONER ? 'sean' : 'troy', league: state.league, games: state.games, ...fixture(state.games, report.settled) }),
        save: async () => { throw new Error('No placements in this fixture.'); },
        admin: async actor => actor === COMMISSIONER,
        schedule: async () => finalsCsv,
        settle: async (season, week, payload) => { report.settleCalls.push({ season, week, payload }); report.settled = true; return { settledAt: iso(now), settled: 2, corrected: 0, unchanged: 0, picksSettled: 3, skipped: ['MIA-NYJ'], games: [{ gameId: 'TB-DAL', status: 'final', version: 1, changed: true, picksSettled: 2, previous: null }, { gameId: 'PHI-JAX', status: 'final', version: 1, changed: true, picksSettled: 1, previous: null }], picks: [], players: [] }; },
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
      if (url.pathname.includes('/gtl-api/community/')) return reply(404, { error: 'Not found.' });
      if (url.pathname === '/auth/v1/logout') return reply(200, {});
      const endpoint = url.pathname.replace('/functions/v1/gtl-api/', '');
      report.requests.push({ endpoint, query: url.search, body: req.method() === 'POST' ? req.postDataJSON() : null });
      if (endpoint === 'social/read') return reply(200, await emptySocialRead(req, report.actor, [{ season: state.league.season, week: state.league.week, games: state.games }]));
      if (endpoint === 'lobby') return reply(200, { profile: { id: report.actor, displayName: 'Fixture player' }, leagues: [{ id: 'sean-troy-luke', name: state.league.name, format: 'triple-threat', role: report.actor === COMMISSIONER ? 'commissioner' : 'player', memberCount: 3, maxMembers: 3, practice: false }], pendingInvites: [] });
      const response = await handler(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}) }));
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    try { await use(report); expect(report.errors).toEqual([]); } finally { await page.unroute('**/*'); }
  },
});

async function openVirtualUnits(page) {
  await page.goto('/'); await page.getByLabel('Email', { exact: true }).fill('commissioner@example.test'); await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click(); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  // The game shell is a lazy chunk (PR #30): wait for it to mount before deciding whether the navigation is collapsed.
  await expect(page.getByRole('heading', { name: 'The weekly huddle.' })).toBeVisible();
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Virtual Units', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Virtual Units', exact: true })).toBeVisible();
}
const card = (page, game) => page.locator('.virtual-game-card').filter({ hasText: `${game.away} at ${game.home}` });

for (const width of [1280, 390]) test(`settled picks show W, L, push and void with the final score and a record from settled picks only at ${width}px`, async ({ page, virtual }) => {
  await page.setViewportSize({ width, height: 1000 }); await openVirtualUnits(page);
  const stats = page.locator('.stats-row');
  await expect(stats).toContainText('1–1–1'); await expect(stats).toContainText('0 pending · 1 void');
  await expect(stats).toContainText('−0.09U'); await expect(stats).toContainText('Settled results only');
  await expect(stats).toContainText('-2.27%'); await expect(stats).toContainText('4U settled risk');
  await expect(stats).toContainText('Qualified'); await expect(stats).toContainText('4 picks · 5U this week');
  await expect(page.locator('.virtual-settlement-note')).toContainText('3 settled picks');
  const [first, second, third] = virtual.games;
  await expect(card(page, first)).toContainText('Final · TB 14, DAL 31'); await expect(card(page, first).locator('.badge', { hasText: 'FINAL' })).toBeVisible();
  const won = card(page, first).locator('.virtual-result[data-outcome="win"]'); await expect(won).toContainText('W'); await expect(won).toContainText('Won +0.91U · Final TB 14, DAL 31');
  const lost = card(page, first).locator('.virtual-result[data-outcome="loss"]'); await expect(lost).toContainText('Lost −1U · Final TB 14, DAL 31');
  await expect(card(page, second).locator('.virtual-result[data-outcome="push"]')).toContainText('Push 0U · Final PHI 21, JAX 24');
  await expect(card(page, third)).toContainText('Postponed · picks voided, stakes returned');
  await expect(card(page, third).locator('.virtual-result[data-outcome="void"]')).toContainText('Void · moved to another day · 1U returned');
  await expect(card(page, first)).toContainText('Saved home −9.5 (−110) · 1U · DraftKings · win');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.local/previews/virtual-units-settled-${width}.png`, fullPage: width === 390 });
});

test('pending picks show no results and the line that settlement happens after finals', async ({ page, virtual }) => {
  virtual.settled = false; await page.setViewportSize({ width: 390, height: 900 }); await openVirtualUnits(page);
  await expect(page.locator('.stats-row')).toContainText('0–0–0'); await expect(page.locator('.stats-row')).toContainText('4 pending · 0 void');
  await expect(page.locator('.virtual-settlement-note')).toContainText("4 picks pending. Results settle after each game's final score is published; record, net units and ROI count settled picks only.");
  await expect(page.locator('.virtual-result')).toHaveCount(0); await expect(page.locator('.virtual-final')).toHaveCount(0);
  await expect(page.locator('.virtual-game-card').first()).toContainText('Saved home −9.5 (−110) · 1U · DraftKings · pending');
});

test('the commissioner settles a week on demand from the screen; members never see the control', async ({ page, virtual }) => {
  virtual.settled = false; await openVirtualUnits(page);
  await page.getByRole('button', { name: 'Settle finals', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Settled Week 5' })).toContainText('Settled Week 5 from 2 published finals: 2 new, 0 corrected, 0 unchanged, 3 picks graded · 1 game still without a final · 1 game not on this week\'s slate.');
  expect(virtual.settleCalls).toHaveLength(1);
  expect(virtual.settleCalls[0].season).toBe(2026); expect(virtual.settleCalls[0].week).toBe(5);
  expect(virtual.settleCalls[0].payload.games).toEqual([{ gameId: 'TB-DAL', status: 'final', home: 31, away: 14 }, { gameId: 'PHI-JAX', status: 'final', home: 24, away: 21 }]);
  const settleRequest = virtual.requests.find(request => request.endpoint === 'virtual-units/settle');
  expect(settleRequest.query).toBe(''); expect(settleRequest.body).toEqual({ season: 2026, week: 5 });
  await expect(page.locator('.stats-row')).toContainText('1–1–1', { timeout: 10000 });
  virtual.actor = MEMBER; virtual.settled = true;
  // A remembered session resumes straight into the game; a fresh one lands on My games first.
  await page.reload();
  const openGame = page.getByRole('button', { name: 'Open game', exact: true }), openNavigation = page.getByRole('button', { name: 'Open navigation' });
  await expect(openGame.or(page.getByRole('button', { name: 'Virtual Units', exact: true }).first()).or(openNavigation).first()).toBeVisible();
  if (await openGame.isVisible()) await openGame.click();
  if (await openNavigation.isVisible()) await openNavigation.click();
  await page.getByRole('button', { name: 'Virtual Units', exact: true }).first().click();
  await expect(page.locator('.stats-row')).toContainText('1–1–1');
  await expect(page.getByRole('button', { name: 'Settle finals', exact: true })).toHaveCount(0);
  expect(virtual.settleCalls).toHaveLength(1);
});

// Redesign stage 20 line lock (D-36, D-39) on the schema players have (HOSTED): the real handler and migrations on PGlite.
// A market's book lines and consensus stay hidden until the player submits that market's Guess the Line picks (today a
// market is submitted whole), sits out, or the game kicks off; their own saved picks always show in full. Fixture lines are
// unusual half points so neither the page nor the network reply can carry them unnoticed.
const LOCK_LINES = { spread: [-11.5, 13.5], total: [58.5, 31.5] };
const lockSecrets = ['11.5', '13.5', '58.5', '31.5'];
// The reply's ISO times (observedAt, collectedAt) can contain a secret's digits ("13:31:31.512Z" holds "31.5"): drop them first.
const withoutTimes = text => text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g, '');

/** Community → Groups & games → Triple Threat → Virtual Units. Resolves to the /virtual-units reply the screen loaded. */
async function openGroupVirtualUnits(page) {
  await page.getByRole('button', { name: /Groups & games/ }).click();
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await page.locator('.hub-game').filter({ hasText: 'Triple Threat' }).getByRole('button', { name: 'Open game' }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.' })).toBeVisible();
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  const loaded = page.waitForResponse(response => response.url().includes('/gtl-api/virtual-units'));
  await page.getByRole('button', { name: 'Virtual Units', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Virtual Units', exact: true })).toBeVisible();
  return (await loaded).json();
}

base('line lock at 390px: every market is locked before a send, the Spread lines open with the Spread send and Total stays locked', async ({ page, baseURL }) => {
  base.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { groupScreens: true, virtualUnits: true });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    const ids = world.state.games.map(game => game.id), byGame = values => Object.fromEntries(ids.map((id, i) => [id, values[i]]));
    await storeBookLines(world, { spread: byGame(LOCK_LINES.spread), total: byGame(LOCK_LINES.total) });
    await signIn(page, 'luke');
    await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
    const reply = await openGroupVirtualUnits(page);
    const text = withoutTimes(JSON.stringify(reply));
    for (const value of lockSecrets) expect(text.includes(value), `the /virtual-units reply carries ${value}`).toBe(false);
    expect(reply.games.map(game => game.locked)).toEqual(ids.map(() => ({ spread: true, total: true })));

    const locks = page.locator('.virtual-lock');
    await expect(locks).toHaveCount(4);
    await expect(locks.filter({ hasText: 'Submit your Spread picks to see this line.' })).toHaveCount(2);
    await expect(locks.filter({ hasText: 'Submit your Total picks to see this line.' })).toHaveCount(2);
    await expect(page.locator('.virtual-side-buttons')).toHaveCount(0);
    await expect(page.locator('.virtual-consensus')).toHaveCount(0);
    await expect(page.locator('.virtual-visibility-note')).toHaveText("Coming soon: everyone in the league will see each other's Virtual Units picks at any time, not only after kickoff.");
    const body = await page.locator('.virtual-units').innerText();
    for (const value of lockSecrets) expect(body.includes(value), `the screen shows ${value}`).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await locks.first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    await page.screenshot({ path: '.local/previews/virtual-units-line-lock-390.png', fullPage: true });

    // Luke submits his Spread picks (the old app's Picks, through the same route); Refresh lines opens the Spread lines only.
    await sendBallot(world, 'luke', 'guess_spread', byGame([-6.5, 2.5]));
    const refreshed = page.waitForResponse(response => response.url().includes('/gtl-api/virtual-units'));
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    const after = withoutTimes(JSON.stringify(await (await refreshed).json()));
    expect(after.includes('11.5') && after.includes('13.5')).toBe(true);
    expect(after.includes('58.5') || after.includes('31.5')).toBe(false);
    await expect(locks).toHaveCount(2);
    await expect(locks.filter({ hasText: 'Submit your Total picks to see this line.' })).toHaveCount(2);
    const first = card(page, world.state.games[0]);
    await expect(first.getByRole('button', { name: /^Dallas Cowboys -11\.5 \(−110\)/ })).toBeVisible();
    await expect(first.locator('.virtual-consensus')).toContainText('Consensus: -11.5 · 3 books');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
