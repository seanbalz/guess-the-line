import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createEplService } from '../../cloud/epl.mjs';
import { createEplMoneylineCollector } from '../../cloud/epl-moneyline-collector.mjs';
import { fetchEplDrawNoBet } from '../../cloud/epl-sources.mjs';
import { EPL_CLUBS } from '../../shared/epl-clubs.mjs';
import { pgliteAvailable, signIn, ACCOUNTS } from './community-world.mjs';
import { moneylineFlowWorld, moneylineRest, MONEYLINE_OWNERS } from './epl-moneyline-flow-fixture.mjs';

async function fixture(page, baseURL) {
  const provider = { calls: [], mode: 'valid', homePrice: -150, awayPrice: 130 };
  const clock = () => provider.now ?? Date.now();
  let collector;
  const world = await moneylineFlowWorld(page, baseURL, async ({ db, rpc }) => {
    await db.exec("update public.gtl_odds_budget set conservative_remaining=100,paused=false where provider='the-odds-api'; insert into public.gtl_epl_jobs_schedule(job,enabled) values('moneyline',true)");
    const fetchImpl = async target => {
      const url = new URL(target);
      if (url.origin !== 'https://api.the-odds-api.com') throw new Error('Unexpected fixture provider');
      const eventId = url.pathname.split('/').at(-2);
      provider.calls.push(eventId);
      const fx = (await db.query('select * from public.gtl_epl_fixtures where event_id=$1', [eventId])).rows[0];
      if (!fx) return Response.json({}, { status: 404 });
      await new Promise(resolve => setTimeout(resolve, 5));
      const name = code => EPL_CLUBS.find(club => club.code === code).oddsApiNames[0];
      const stamp = new Date(clock()).toISOString();
      return Response.json({ id: eventId, sport_key: 'soccer_epl', home_team: name(fx.home), away_team: name(fx.away),
        commence_time: new Date(fx.commence_time).toISOString(), bookmakers: provider.mode === 'missing' ? [] :
          ['draftkings', 'fanduel', 'betmgm'].map(key => ({ key, last_update: stamp, markets: [{ key: 'draw_no_bet', last_update: stamp,
            outcomes: [{ name: name(fx.home), price: provider.homePrice }, { name: name(fx.away), price: provider.awayPrice }] }] })),
      }, { headers: { 'x-requests-remaining': String(100 - provider.calls.length), 'x-requests-used': String(provider.calls.length), 'x-requests-last': '1' } });
    };
    collector = createEplMoneylineCollector({ rpc, clock, drawNoBet: args => fetchEplDrawNoBet({ ...args, apiKey: 'synthetic-test-only', fetchImpl, clock }) });
    const refreshForLock = async args => { await new Promise(resolve => setTimeout(resolve, 5)); return collector.refreshForLock(args); };
    return createEplService({ rpc, ...moneylineRest(db), refreshForLock });
  });
  const books = Object.fromEntries(['draftkings', 'fanduel', 'betmgm'].map(book => [book, { ARS: -150, CHE: 130 }]));
  await world.db.query(`insert into public.gtl_epl_job_runs(job,slot_start,capability_hash,status,detail)
    values('dnb-check',now(),$1,'succeeded',$2)`, ['0'.repeat(64), {
    season: 2026, week: 9, dnbAvailable: true, checked: 3, priced: 3,
    events: ['flow-ars-che', 'flow-liv-eve', 'flow-tot-ful'].map(eventId => ({ eventId, books })),
  }]);
  return { ...world, collector, provider };
}

test('new moneyline guesses stay within representable distance bounds before any write', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  const world = await fixture(page, baseURL);
  try {
    for (const price of [2147383848, -2147383848, 2147483647, -2147483647]) {
      const result = await world.api('troy', 'guess/save', { eventId: 'flow-ars-che', club: 'ARS', price, lock: true });
      expect(result).toMatchObject({ status: 400, body: { code: 'GTL_EPL_GUESS_INVALID' } });
    }
    expect((await world.db.query('select count(*)::int n from public.gtl_epl_guesses')).rows[0].n).toBe(0);
    expect((await world.db.query('select count(*)::int n from public.gtl_epl_guess_history')).rows[0].n).toBe(0);
  } finally { await world.db.close(); }
});

test('real collector resolves a pending lock once and later captures preserve that reference', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  const world = await fixture(page, baseURL);
  try {
    await world.db.exec("update public.gtl_odds_budget set conservative_remaining=50 where provider='the-odds-api'");
    const pending = await world.api('troy', 'guess/save', { eventId: 'flow-ars-che', club: 'ARS', price: -125, lock: true });
    expect(pending).toMatchObject({ status: 200, body: { state: 'pending', referencePrice: null } });
    expect(world.provider.calls).toHaveLength(0);
    await world.db.exec("update public.gtl_odds_budget set conservative_remaining=100 where provider='the-odds-api'");
    expect(await world.collector.refreshForLock({ userId: ACCOUNTS.troy.id, eventId: 'flow-ars-che' })).toEqual({ status: 'refreshed' });
    const scored = (await world.api('troy', 'guess/read')).body.guesses.find(g => g.ownerId === MONEYLINE_OWNERS.troy);
    expect(scored).toMatchObject({ state: 'scored', referencePrice: -150, referenceSource: 'first-after', distance: 25 });
    const other = await world.api('sean', 'guess/save', { eventId: 'flow-ars-che', club: 'CHE', price: 120, lock: true });
    expect(other).toMatchObject({ status: 200, body: { referencePrice: 130, referenceSource: 'at-lock', distance: 10 } });
    expect(world.provider.calls).toHaveLength(1);
    world.provider.now = Date.now() + 6 * 60_000;
    world.provider.homePrice = -180; world.provider.awayPrice = 150;
    const run = (await world.db.query("insert into public.gtl_epl_job_runs(job,slot_start,capability_hash,status,claim_token,claimed_at) values('moneyline',clock_timestamp(),repeat('a',64),'running',gen_random_uuid(),clock_timestamp()) returning id,claim_token")).rows[0];
    expect(await world.collector.collectForJob({ eventId: 'flow-ars-che', run: { p_run: run.id, p_claim: run.claim_token } })).toEqual({ status: 'refreshed' });
    const final = (await world.api('troy', 'guess/read')).body.guesses.find(g => g.ownerId === MONEYLINE_OWNERS.troy);
    expect(final).toMatchObject({ referencePrice: -150, referenceObservedAt: scored.referenceObservedAt, distance: 25 });
    expect(world.provider.calls).toHaveLength(2);
    expect((await world.db.query('select count(*)::int n from public.gtl_epl_moneyline_collections')).rows[0].n).toBe(2);
    expect((await world.db.query("select conservative_remaining n from public.gtl_odds_budget where provider='the-odds-api'")).rows[0].n).toBe(98);
  } finally { await world.db.close(); }
});

test('concurrent real API locks share one provider request and one reserved credit', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  const world = await fixture(page, baseURL);
  try {
    const results = await Promise.all([
      world.api('troy', 'guess/save', { eventId: 'flow-ars-che', club: 'ARS', price: -125, lock: true }),
      world.api('sean', 'guess/save', { eventId: 'flow-ars-che', club: 'CHE', price: 120, lock: true }),
    ]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    expect(results.every(r => r.body.status === 'locked')).toBe(true);
    expect(world.provider.calls).toEqual(['flow-ars-che']);
    expect((await world.db.query('select count(*)::int n from public.gtl_epl_moneyline_attempts')).rows[0].n).toBe(1);
    expect((await world.db.query('select count(*)::int n from public.gtl_epl_moneyline_collections')).rows[0].n).toBe(1);
    expect((await world.db.query("select conservative_remaining n from public.gtl_odds_budget where provider='the-odds-api'")).rows[0].n).toBe(99);
    expect((await world.api('troy', 'guess/read')).body.guesses).toHaveLength(2);
    expect((await world.api('luke', 'guess/read')).body.guesses).toEqual([]);
  } finally { await world.db.close(); }
});

test('a pending guess with no eligible capture is unscored at kickoff and excluded from averages', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  const world = await fixture(page, baseURL);
  try {
    await world.db.exec("update public.gtl_odds_budget set conservative_remaining=50 where provider='the-odds-api'");
    expect((await world.api('troy', 'guess/save', { eventId: 'flow-ars-che', club: 'ARS', price: -125, lock: true })).body.state).toBe('pending');
    await world.db.exec("update public.gtl_epl_fixtures set commence_time=now()-interval '1 minute' where event_id='flow-ars-che'; update public.gtl_odds_budget set conservative_remaining=100 where provider='the-odds-api'");
    expect(await world.collector.refreshForLock({ userId: ACCOUNTS.troy.id, eventId: 'flow-ars-che' })).toEqual({ status: 'unavailable' });
    expect(world.provider.calls).toHaveLength(0);
    const row = (await world.api('troy', 'guess/read')).body.guesses.find(g => g.ownerId === MONEYLINE_OWNERS.troy);
    expect(row).toMatchObject({ state: 'unscored', referencePrice: null, distance: null });
    const board = await world.api('luke', 'guess/leaderboard');
    expect(board.status).toBe(200);
    expect(board.body.rows.find(g => g.ownerId === MONEYLINE_OWNERS.troy)).toMatchObject({ guessed: 0, unscored: 1, average: null });
  } finally { await world.db.close(); }
});

test('moneyline real-handler flow locks once, preserves draft on kickoff refusal and isolates viewers', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  const world = await fixture(page, baseURL);
  try {
    const opened = await world.api('troy', 'guess/read');
    expect(opened.status).toBe(200);
    expect(opened.body).toMatchObject({ available: true, season: 2026, week: 9, ownerId: MONEYLINE_OWNERS.troy });
    const draft = { eventId: 'flow-ars-che', club: 'ARS', price: -125, lock: false };
    expect((await world.api('troy', 'guess/save', draft)).status).toBe(200);
    expect((await world.api('luke', 'guess/save', draft)).status).toBe(403);
    expect((await world.api('sean', 'guess/read')).body.guesses.some(g => g.ownerId === MONEYLINE_OWNERS.troy)).toBe(false);
    const locked = await world.api('troy', 'guess/save', { ...draft, lock: true });
    expect(locked.status).toBe(200);
    expect(locked.body).toMatchObject({ status: 'locked', club: 'ARS', price: -125 });
    const replay = await world.api('troy', 'guess/save', { ...draft, price: -130, lock: true });
    expect(replay).toMatchObject({ status: 409, body: { code: 'GTL_EPL_GUESS_LOCKED' } });
    expect((await world.db.query("select count(*)::int n from public.gtl_epl_guess_history where event_id='flow-ars-che' and action='lock'")).rows[0].n).toBe(1);
    const laterDraft = { eventId: 'flow-liv-eve', club: 'LIV', price: 120, lock: false };
    expect((await world.api('troy', 'guess/save', laterDraft)).status).toBe(200);
    await world.db.exec("update public.gtl_epl_fixtures set commence_time=now()-interval '1 minute' where event_id='flow-liv-eve'");
    const closed = await world.api('troy', 'guess/save', { ...laterDraft, lock: true });
    expect(closed).toMatchObject({ status: 409, body: { code: 'GTL_EPL_GUESS_CLOSED' } });
    expect(closed.body.draft).toMatchObject({ eventId: laterDraft.eventId, ownerId: MONEYLINE_OWNERS.troy, status: 'draft', price: 120 });
    const spoofedClock = await world.api('troy', 'guess/save', { ...laterDraft, lock: true, now: '2000-01-01T00:00:00Z' });
    expect([400, 409]).toContain(spoofedClock.status);
    const saved = (await world.db.query("select status,price from public.gtl_epl_guesses where event_id='flow-liv-eve'")).rows;
    expect(saved).toEqual([{ status: 'draft', price: 120 }]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('moneyline screen steps across even odds and recovers a committed lock without replay', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('gtl.theme', 'dark'));
  const world = await fixture(page, baseURL);
  try {
    await page.goto('/#epl/play/guess');
    await signIn(page, 'troy', { navigate: false });
    const price = page.getByLabel('Your moneyline price', { exact: true });
    await expect(price).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'ARS', exact: true }).click();
    await price.fill('-105');
    await page.getByRole('button', { name: 'Increase price by 5', exact: true }).click();
    await expect(price).toHaveValue('100');
    await page.getByRole('button', { name: 'Increase price by 5', exact: true }).click();
    await expect(price).toHaveValue('105');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect.poll(async () => (await world.db.query("select price from public.gtl_epl_guesses where event_id='flow-ars-che'")).rows[0]?.price).toBe(105);
    world.controls.dropNextSaveReply = true;
    world.controls.blockGuessReads = true;
    await page.getByRole('button', { name: 'Lock in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Check saved guesses', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entry paused', exact: true })).toBeDisabled();
    expect(world.calls.filter(c => c.path === 'epl/guess/save' && c.body.lock)).toHaveLength(1);
    world.controls.blockGuessReads = false;
    await page.getByRole('button', { name: 'Check saved guesses', exact: true }).click();
    await expect(page.getByRole('img', { name: '1 of 3 matches locked', exact: true })).toBeVisible();
    expect(world.calls.filter(c => c.path === 'epl/guess/save' && c.body.lock)).toHaveLength(1);
    expect((await world.db.query("select count(*)::int n from public.gtl_epl_guess_history where action='lock'")).rows[0].n).toBe(1);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '.local/epl-moneyline-flow-390-dark.png', fullPage: true });
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('switching from a linked manager to an unlinked account clears saved moneyline entry', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  await page.setViewportSize({ width: 320, height: 812 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('gtl.theme', 'light'));
  const world = await fixture(page, baseURL);
  try {
    await page.goto('/#epl/play/guess');
    await signIn(page, 'troy', { navigate: false });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'ARS', exact: true }).click();
    await page.getByLabel('Your moneyline price', { exact: true }).fill('-133');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'luke', { navigate: false });
    await page.goto('/#epl/play/guess');
    await expect(page.getByText('You’re viewing read-only. Link an FEPL manager in Pick a Team to enter guesses.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Your moneyline price', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Lock in', exact: true })).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '.local/epl-moneyline-flow-320-light.png', fullPage: true });
    expect((await world.api('luke', 'guess/read')).body.guesses).toEqual([]);
    expect((await world.db.query("select price,status from public.gtl_epl_guesses where event_id='flow-ars-che'")).rows)
      .toEqual([{ price: -133, status: 'draft' }]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('kickoff between opening the card and submitting retains the unsaved browser draft', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  const world = await fixture(page, baseURL);
  try {
    await page.goto('/#epl/play/guess');
    await signIn(page, 'troy', { navigate: false });
    await page.getByRole('button', { name: 'ARS', exact: true }).click();
    await page.getByLabel('Your moneyline price', { exact: true }).fill('-137');
    await world.db.exec("update public.gtl_epl_fixtures set commence_time=now()-interval '1 minute' where event_id='flow-ars-che'");
    await page.getByRole('button', { name: 'Lock in', exact: true }).click();
    await expect(page.getByText("This match has kicked off. Your draft wasn't locked.", { exact: true })).toBeVisible();
    await expect(page.getByText(/Your unsaved draft: ARS.*137/)).toBeVisible();
    expect((await world.db.query("select count(*)::int n from public.gtl_epl_guesses where event_id='flow-ars-che'")).rows[0].n).toBe(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('moneyline board uses the EPL week and exposes no other manager draft or unrevealed lock', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  const world = await fixture(page, baseURL);
  try {
    const draft = { eventId: 'flow-tot-ful', club: 'TOT', price: -140, lock: false };
    expect((await world.api('troy', 'guess/save', draft)).status).toBe(200);
    const outsider = await world.api('luke', 'guess/read');
    expect(outsider.status).toBe(200);
    expect(outsider.body).toMatchObject({ season: 2026, week: 9, ownerId: null });
    expect(outsider.body.guesses).toEqual([]);
    expect((await world.api('troy', 'guess/save', { ...draft, lock: true })).status).toBe(200);
    expect((await world.api('sean', 'guess/read')).body.guesses).toEqual([]);
    expect((await world.api('sean', 'guess/save', { ...draft, club: 'FUL', price: 120, lock: true })).status).toBe(200);
    const revealed = await world.api('sean', 'guess/read');
    expect(revealed.body.guesses.filter(g => g.eventId === draft.eventId).map(g => g.ownerId).sort())
      .toEqual(Object.values(MONEYLINE_OWNERS).sort());
    expect((await world.api('luke', 'guess/read')).body.guesses).toEqual([]);
    await world.db.exec("update public.gtl_epl_fixtures set commence_time=now()-interval '1 minute' where event_id='flow-tot-ful'");
    const publicAfterKickoff = await world.api('luke', 'guess/read');
    expect(publicAfterKickoff.body.guesses.filter(g => g.eventId === draft.eventId)).toHaveLength(2);
    // A different NFL week in the common lobby must never silently choose the EPL round.
    expect(world.state.league.week).not.toBe(9);
    expect(publicAfterKickoff.body.week).toBe(9);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
