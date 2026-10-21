import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn, sendBallot, storeBookLines } from './community-world.mjs';
import { HOSTED } from '../migrations.mjs';

// These recommendations use fictional saved guesses, retained three-book quotes, the hosted schema plus this
// release's additive writer on PGlite. The network fixture rejects unmocked external traffic; no real bet is placed.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const view = (page, name) => page.getByRole('group', { name: 'Bets view' }).getByRole('button', { name, exact: true });
const cards = page => page.locator('.recommended-bet-card');
async function openTotal(page, gameId) {
  const card = page.locator(`.recommended-bet-card[data-game-id="${gameId}"][data-market="total"]`);
  if (await card.count() === 0) await page.getByRole('button', { name: /Show all/i }).click();
  await card.locator('summary').click();
  return card;
}
async function playTotal(page, world) {
  await (await openTotal(page, world.state.games[0].id)).getByRole('button', { name: 'Play with Virtual Units', exact: true }).click();
}
function requests(page) {
  const calls = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === SUPABASE && url.pathname.includes('/gtl-api/')) calls.push({
      path: url.pathname.split('/gtl-api/')[1], query: url.search,
      body: request.method() === 'POST' ? request.postDataJSON() : null,
    });
  });
  return calls;
}
const placements = calls => calls.filter(call => call.path === 'bets/recommendations/place');
const picksCount = async world => Number((await world.db.query('select count(*) as n from public.gtl_virtual_units_picks where user_id=$1', [ACCOUNTS.luke.id])).rows[0].n);
const migrations = [...new Set([...HOSTED, '20261015143006_gtl_recommended_virtual_pick.sql'])].sort();

async function fixture(page, baseURL, { games = 4, spread = true, total = true } = {}) {
  const world = await communityWorld(page, baseURL, { games, groupScreens: true, virtualUnits: true, optionalRpc: true, migrations });
  world.lines = {
    spread: Object.fromEntries(world.state.games.map(game => [game.id, -3.5])),
    total: Object.fromEntries(world.state.games.map(game => [game.id, 44.5])),
  };
  world.observedAt = await storeBookLines(world, world.lines);
  world.guesses = {
    spread: Object.fromEntries(world.state.games.map((game, i) => [game.id, [-10, -7, -5, -3][i]])),
    total: Object.fromEntries(world.state.games.map((game, i) => [game.id, [55, 49, 43, 44.5][i]])),
  };
  if (spread) await sendBallot(world, 'luke', 'guess_spread', world.guesses.spread);
  if (total) await sendBallot(world, 'luke', 'guess_total', world.guesses.total);
  return world;
}

async function openRecommended(page) {
  await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('/#bets');
  await signIn(page, 'luke', { navigate: false });
  await expect(page.getByRole('heading', { name: 'Bets', level: 1, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Recommended', exact: true }).click();
  await expect(page.locator('.virtual-units')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh lines', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Choose league', exact: true })).toHaveCount(0);
}

async function publishNextWeek(world) {
  const { season, week } = world.state.league;
  const signature = (await world.db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
  const next = { ...signature, week: week + 1, deadline: signature.deadline + 7 * 86400,
    games: signature.games.map(game => ({ ...game, kickoff: game.kickoff + 7 * 86400 })) };
  await world.db.query('insert into public.gtl_weekly_slates(season,week,signature) values($1,$2,$3)', [season, week + 1, next]);
  await world.db.query('insert into public.gtl_schedule_templates(id,season,week,games,deadline,schedule_source) values($1,$2,$3,$4,$5,$6)',
    [`fixture-history-${week + 1}`, season, week + 1,
      world.state.games.map(game => ({ ...game, kickoff: new Date(Date.parse(game.kickoff) + 7 * 86400000).toISOString() })),
      new Date(next.deadline * 1000).toISOString(), 'Synthetic recommendation history schedule fixture']);
  return { season, week: week + 1 };
}

async function moveBrowserPastKickoff(page, game) {
  // Only the fictional browser clock moves. The kickoff timer's visibility handler
  // must close the already open card without an API read or an attempted write.
  await page.evaluate(now => {
    Date.now = () => now;
    document.dispatchEvent(new Event('visibilitychange'));
  }, Date.parse(game.kickoff) + 1000);
}

test('a reviewed recommendation becomes one actual tracked ticket and survives reload', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    await openRecommended(page);
    // Returning from a remembered All weeks list must still open the exact recommendation week.
    await view(page, 'Tracked bets').click();
    await page.getByLabel('Competition week').selectOption('all');
    await expect(page.getByLabel('Competition week')).toHaveValue('all');
    await view(page, 'Recommended').click();
    const gameId = world.state.games[0].id, card = await openTotal(page, gameId);
    await card.getByRole('button', { name: 'Track this bet', exact: true }).click();
    await expect(view(page, 'Tracked bets')).toHaveAttribute('aria-pressed', 'true');
    const editor = page.getByRole('dialog', { name: 'Review recommended bet' });
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('group', { name: 'Units risked', exact: true }).getByRole('button', { name: 'Unknown', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(editor.getByRole('button', { name: 'Save tracked bet', exact: true })).toBeDisabled();
    expect(calls.filter(call => call.path === 'social/create')).toHaveLength(0);
    expect(placements(calls)).toHaveLength(0);
    await editor.getByLabel('I placed this bet elsewhere and checked these ticket terms.').check();
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor).toHaveCount(0);
    const writes = calls.filter(call => call.path === 'social/create');
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({
      season: world.state.league.season, week: world.state.league.week,
      origin: 'tracked', kind: 'single', stakeUnits: null, placedAt: null,
      legs: [{ gameId, market: 'total', side: 'over', line: 44.5 }],
    });
    expect(writes[0].body.source).toBeTruthy();
    expect(writes[0].body.quotedAt).toBe(world.observedAt);
    expect(await picksCount(world)).toBe(0);
    await expect(page.locator('.gx-tracked-row')).toHaveCount(1);
    await expect(page.locator('.gx-tracked-row > summary')).toContainText('Over 44.5');
    await page.reload();
    await expect(page.locator('.gx-tracked-row')).toHaveCount(1);
    await page.locator('.gx-tracked-row > summary').click();
    await expect(page.locator('.social-bet-card')).toContainText(writes[0].body.source);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('cancelling a recommendation review writes neither a tracked ticket nor a virtual pick', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    await openRecommended(page);
    await (await openTotal(page, world.state.games[0].id)).getByRole('button', { name: 'Track this bet', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Review recommended bet' });
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(editor).toHaveCount(0);
    expect(calls.filter(call => call.path === 'social/create')).toHaveLength(0);
    expect(placements(calls)).toHaveLength(0);
    await expect(page.locator('.gx-tracked-row')).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('recommendation ticket recovery keeps its original week and does not duplicate a committed save', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), week = world.state.league.week;
    await openRecommended(page);
    await (await openTotal(page, world.state.games[0].id)).getByRole('button', { name: 'Track this bet', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Review recommended bet' });
    await expect(editor).toBeVisible();
    await publishNextWeek(world);
    await editor.getByLabel('I placed this bet elsewhere and checked these ticket terms.').check();
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/social/create'), async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      expect(response.status).toBe(200);
      await response.text();
      await route.abort('failed');
    }, { times: 1 });
    await editor.getByRole('button', { name: 'Save tracked bet', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('could not confirm');
    await editor.getByRole('button', { name: 'Check saved bets', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Retry same save', exact: true })).toBeEnabled();
    await editor.getByRole('button', { name: 'Retry same save', exact: true }).click();
    await expect(editor).toHaveCount(0);
    const writes = calls.filter(call => call.path === 'social/create');
    expect(writes).toHaveLength(2);
    expect(writes[0].body.week).toBe(week);
    expect(writes[1].body).toEqual(writes[0].body);
    await expect(page.locator('.gx-tracked-row')).toHaveCount(1);
    await expect(page.locator('.gx-tracked-row > summary')).toContainText(`Week ${week}`);
    await expect(page.getByLabel('Competition week')).toHaveValue(`${world.state.league.season}:${week}`);
    expect(await picksCount(world)).toBe(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('saved guesses rank the top three; expanding retains small gaps and both sides have text-labelled traffic lights on phones', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    await openRecommended(page);
    await expect(cards(page)).toHaveCount(3);
    await expect(cards(page).nth(0).locator('summary')).toContainText('185.7% gap');
    await expect(cards(page).nth(0).locator('summary')).toContainText('6.5 pt gap');
    await expect(cards(page).nth(1).locator('summary')).toContainText('100.0% gap');
    await expect(cards(page).nth(2).locator('summary')).toContainText('42.9% gap');
    await cards(page).first().locator('summary').click();
    await expect(cards(page).first().locator('[data-side="home"][data-value-color="green"]')).toContainText('Favorable');
    await expect(cards(page).first().locator('[data-side="away"][data-value-color="red"]')).toContainText('Against your guess');
    expect(placements(calls)).toEqual([]);
    expect(await picksCount(world)).toBe(0);
    await page.screenshot({ path: '.local/previews/recommended-bets-top3-dark-390.png', fullPage: true });

    await page.getByRole('button', { name: /Show all/i }).click();
    await expect(cards(page)).toHaveCount(7);
    await expect(cards(page).last().locator('[data-value-color="yellow"]')).toHaveCount(2);
    await expect(cards(page).last()).toContainText('Small gap');
    await expect(cards(page).last().locator('summary')).toContainText('1.5 pt gap');
    expect(calls.filter(call => call.path === 'bets/recommendations').at(-1)?.body).toEqual({});
    expect(calls.some(call => call.path.startsWith('odds/') || call.path === 'virtual-units' || call.path === 'virtual-pick')).toBe(false);

    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}px fits`).toBe(true);
        const scan = await new AxeBuilder({ page }).include('.gx-bets').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(scan.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
        await page.screenshot({ path: `.local/previews/recommended-bets-${theme}-${width}.png`, fullPage: true });
      }
    }
    await page.getByRole('button', { name: /Show top 3/i }).click();
    await expect(cards(page)).toHaveCount(3);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Add to card only prepares the retained quote; explicit placement saves one current-week pick without overwriting it', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    const firstGame = world.state.games[0];
    await openRecommended(page);
    await expect(cards(page)).toHaveCount(3);
    await playTotal(page, world);
    await expect(page.getByRole('button', { name: 'Place virtual pick', exact: true })).toBeVisible();
    expect(placements(calls)).toEqual([]);
    expect(await picksCount(world)).toBe(0);
    await expect(page.locator('.virtual-units')).toContainText('44.5');
    await expect(page.locator('.virtual-units')).toContainText('BetMGM');
    await page.getByRole('button', { name: 'Place virtual pick', exact: true }).click();
    await expect.poll(() => placements(calls).length).toBe(1);
    expect(placements(calls)[0]).toEqual({ path: 'bets/recommendations/place', query: '', body: {
      season: world.state.league.season, week: world.state.league.week, revision: expect.any(Number),
      gameId: firstGame.id, market: 'total', side: 'over', line: 44.5, odds: -110, units: 1,
      source: 'betmgm', quotedAt: world.observedAt,
    } });
    await expect.poll(() => picksCount(world)).toBe(1);
    await expect(page.locator(`.recommended-bet-card[data-game-id="${firstGame.id}"][data-market="total"]`)).toContainText(/Virtual pick saved|On your card|Already saved/);
    await expect(page.locator(`.recommended-bet-card[data-game-id="${firstGame.id}"][data-market="total"]`).getByRole('button', { name: 'Virtual pick saved', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    await expect(cards(page)).toHaveCount(7);
    expect(placements(calls)).toHaveLength(1);
    expect(await picksCount(world)).toBe(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('draft guesses and locked markets never generate recommendations, including when the published week moves ahead', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL, { games: 2, spread: false, total: false });
  try {
    const personal = await world.api('luke', 'personal');
    const { season, week } = world.state.league;
    const draft = await world.api('luke', 'personal/ballot', { season, week, mode: 'guess_spread', picks: world.guesses.spread,
      submit: false, revision: personal.body.revision, weeklyRevision: personal.body.weeklyRevision, requestId: randomUUID() });
    expect(draft.status).toBe(200);
    const calls = requests(page);
    await openRecommended(page);
    await expect(cards(page)).toHaveCount(0);
    await expect(page.locator('.virtual-units')).toContainText(/saved|submit|locked/i);
    await sendBallot(world, 'luke', 'guess_spread', world.guesses.spread);
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).first()).toContainText('Spread');
    await expect(cards(page).last()).toContainText('Spread');
    const nextKickoff = Math.floor(Date.parse(world.state.league.deadline) / 1000) + 7 * 86400;
    await world.db.query('insert into public.gtl_weekly_slates(season,week,signature) values($1,$2,$3)', [season, week + 1,
      { season, week: week + 1, deadline: nextKickoff, games: [{ id: 'KC-LV', away: 'KC', home: 'LV', kickoff: nextKickoff }] }]);
    await world.db.query('insert into public.gtl_schedule_templates(id,season,week,games,deadline,schedule_source) values($1,$2,$3,$4,$5,$6)',
      ['fixture-next-locked', season, week + 1, [{ id: 'KC-LV', away: 'Kansas City Chiefs', awayCode: 'KC', home: 'Las Vegas Raiders', homeCode: 'LV', kickoff: new Date(nextKickoff * 1000).toISOString() }],
        new Date(nextKickoff * 1000).toISOString(), 'Synthetic recommendation schedule fixture']);
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Recommended bets', exact: true })).toContainText(`Week ${week + 1}`);
    await expect(page.getByRole('region', { name: 'Recommended bets', exact: true })).toContainText('No differences to show yet');
    expect(placements(calls)).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a failed recommendation read is explicit and retry plus Refresh lines uses the newest retained quote', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    let reject = true;
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/gtl-api/bets/recommendations'), async route => {
      if (!reject) return route.fallback();
      await route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: 'Saved guesses temporarily unavailable.' }) });
    });
    await openRecommended(page);
    await expect(page.getByRole('alert')).toContainText('Saved guesses temporarily unavailable.');
    await expect(cards(page)).toHaveCount(0);
    reject = false;
    await page.getByRole('alert').getByRole('button', { name: /Try again|Retry/i }).click();
    await expect(cards(page)).toHaveCount(3);
    await page.getByRole('button', { name: /Show all/i }).click();
    const totalCard = page.locator(`.recommended-bet-card[data-game-id="${world.state.games[0].id}"][data-market="total"]`);
    await expect(totalCard.locator('summary')).toContainText('10.5 pt gap');
    await storeBookLines(world, { ...world.lines, total: Object.fromEntries(world.state.games.map(game => [game.id, 46.5])) }, { capturedAt: Date.now() - 5000 });
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    await expect(totalCard).toBeVisible();
    await expect(totalCard.locator('summary')).toContainText('8.5 pt gap');
    await totalCard.locator('summary').click();
    await expect(totalCard).toContainText('46.5');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Community recommendations use the current published week when the private group is a week behind and membership is absent', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL, { spread: false, total: false });
  try {
    const { season, week } = world.state.league;
    const next = week + 1;
    const signature = (await world.db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
    const nextSignature = { ...signature, week: next, deadline: signature.deadline + 3600,
      games: signature.games.map(game => ({ ...game, kickoff: game.kickoff + 3600 })) };
    await world.db.query('insert into public.gtl_weekly_slates(season,week,signature) values($1,$2,$3)', [season, next, nextSignature]);
    const current = { ...world, state: { ...world.state,
      league: { ...world.state.league, week: next, deadline: new Date(nextSignature.deadline * 1000).toISOString() },
      games: world.state.games.map(game => ({ ...game, kickoff: new Date(Date.parse(game.kickoff) + 3600000).toISOString() })),
    } };
    await world.db.query('insert into public.gtl_schedule_templates(id,season,week,games,deadline,schedule_source) values($1,$2,$3,$4,$5,$6)',
      [`fixture-next-${next}`, season, next, current.state.games, current.state.league.deadline, 'Synthetic recommendation schedule fixture']);
    const observedAt = await storeBookLines(current, world.lines);
    await sendBallot(current, 'luke', 'guess_spread', world.guesses.spread);
    await sendBallot(current, 'luke', 'guess_total', world.guesses.total);
    await world.db.query('delete from public.gtl_memberships where user_id=$1', [ACCOUNTS.luke.id]);
    const groupState = (await world.db.query("select state from public.gtl_leagues where id='sean-troy-luke'")).rows[0].state;
    expect(groupState.league.week).toBe(week);
    const calls = requests(page);
    await openRecommended(page);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByRole('region', { name: 'Recommended bets', exact: true })).toContainText(`Week ${next}`);
    await playTotal(page, world);
    await page.getByRole('button', { name: 'Place virtual pick', exact: true }).click();
    await expect.poll(() => picksCount(world)).toBe(1);
    expect(placements(calls)).toHaveLength(1);
    expect(placements(calls)[0].body).toMatchObject({ season, week: next, gameId: world.state.games[0].id,
      market: 'total', side: 'over', line: 44.5, odds: -110, source: 'betmgm', quotedAt: observedAt });
    const saved = (await world.db.query('select season,week from public.gtl_virtual_units_picks where user_id=$1', [ACCOUNTS.luke.id])).rows;
    expect(saved).toEqual([{ season, week: next }]);
    expect(calls.some(call => call.path === 'virtual-units' || call.path === 'virtual-pick')).toBe(false);
    expect((await world.db.query("select state from public.gtl_leagues where id='sean-troy-luke'")).rows[0].state).toEqual(groupState);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a lost successful recommendation reply is confirmed by its exact saved source and terms without a second placement', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    await openRecommended(page);
    await playTotal(page, world);
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/gtl-api/bets/recommendations/place'), async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
      expect(response.status, 'fixture writer commits before its response is lost').toBe(200);
      await response.text();
      await route.abort('failed');
    }, { times: 1 });
    await page.getByRole('button', { name: 'Place virtual pick', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('could not confirm whether your save completed');
    expect(await picksCount(world)).toBe(1);
    expect(placements(calls)).toHaveLength(1);
    await page.getByRole('button', { name: 'Check saved picks', exact: true }).click();
    await expect(page.locator('.auth-notice')).toHaveText('Your saved Virtual Units pick is confirmed.');
    const saved = page.getByRole('region', { name: 'Your virtual card', exact: true });
    await expect(saved).toContainText('Over 44.5 (−110) · 1U');
    await expect(saved).toContainText('BetMGM');
    await expect(page.getByRole('button', { name: 'Place virtual pick', exact: true })).toHaveCount(0);
    expect(placements(calls)).toHaveLength(1);
    expect(await picksCount(world)).toBe(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a pending review retains the chosen terms at kickoff and offers no placement or silent write', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page);
    await openRecommended(page);
    await playTotal(page, world);
    await page.getByRole('button', { name: '2U', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Place virtual pick', exact: true })).toBeVisible();
    await moveBrowserPastKickoff(page, world.state.games[0]);
    const review = page.locator('.recommended-pending-review');
    await expect(review).toContainText('Closed · Kickoff reached');
    await expect(review).toContainText('Over +44.5 (−110) · 2U · BetMGM');
    await expect(page.getByRole('button', { name: 'Place virtual pick', exact: true })).toHaveCount(0);
    expect(placements(calls)).toEqual([]);
    expect(await picksCount(world)).toBe(0);
    await review.getByRole('button', { name: 'Remove from card', exact: true }).click();
    await expect(review).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a saved virtual pick stays visible when its difference disappears and after kickoff', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), first = world.state.games[0];
    await openRecommended(page);
    await playTotal(page, world);
    await page.getByRole('button', { name: 'Place virtual pick', exact: true }).click();
    const saved = page.getByRole('region', { name: 'Your virtual card', exact: true });
    await expect(saved).toContainText('Over 44.5 (−110) · 1U');
    await storeBookLines(world, { ...world.lines, total: { ...world.lines.total, [first.id]: world.guesses.total[first.id] } }, { capturedAt: Date.now() - 5000 });
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    await expect(page.locator(`.recommended-bet-card[data-game-id="${first.id}"][data-market="total"]`)).toHaveCount(0);
    await expect(saved).toContainText('Over 44.5 (−110) · 1U');
    await expect(saved).toContainText('BetMGM');
    await moveBrowserPastKickoff(page, first);
    await expect(page.locator(`.recommended-bet-card[data-game-id="${first.id}"]`)).toHaveCount(0);
    await expect(saved).toContainText('Over 44.5 (−110) · 1U');
    await expect(saved).toContainText('Pending');
    expect(placements(calls)).toHaveLength(1);
    expect(await picksCount(world)).toBe(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the week selector keeps the player’s older saved card readable after Community advances without permitting old-week placement', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    const calls = requests(page), { season, week } = world.state.league;
    await openRecommended(page);
    await playTotal(page, world);
    await page.getByRole('button', { name: 'Place virtual pick', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Your virtual card', exact: true })).toContainText('BetMGM');
    const next = await publishNextWeek(world);
    await page.getByRole('button', { name: 'Refresh lines', exact: true }).click();
    const weekSelect = page.getByRole('combobox', { name: 'Recommendation week', exact: true });
    await expect(weekSelect).toHaveValue('current');
    await expect(page.getByRole('region', { name: 'Recommended bets', exact: true })).toContainText(`Week ${next.week}`);
    await expect(page.getByRole('region', { name: 'Your virtual card', exact: true })).toHaveCount(0);
    await weekSelect.selectOption(`${season}:${week}`);
    await expect(page.locator('.virtual-units')).toContainText('View only · older week');
    const saved = page.getByRole('region', { name: 'Your virtual card', exact: true });
    await expect(saved).toContainText(`1 saved · Week ${week}`);
    await expect(saved).toContainText('Over 44.5 (−110) · 1U');
    await expect(saved).toContainText('BetMGM');
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Play with Virtual Units', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Place virtual pick', exact: true })).toHaveCount(0);
    expect(calls.filter(call => call.path === 'bets/recommendations').at(-1).body).toEqual({ season, week });
    const oldRequest = { ...placements(calls)[0].body, gameId: world.state.games[1].id };
    const refused = await world.api('luke', 'bets/recommendations/place', oldRequest);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/published week changed/i);
    expect(await picksCount(world)).toBe(1);
    expect((await world.db.query("select state from public.gtl_leagues where id='sean-troy-luke'")).rows[0].state.league.week).toBe(week);
    await weekSelect.selectOption('current');
    await expect(page.getByRole('region', { name: 'Recommended bets', exact: true })).toContainText(`Week ${next.week}`);
    await expect(saved).toHaveCount(0);
    expect(placements(calls)).toHaveLength(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
