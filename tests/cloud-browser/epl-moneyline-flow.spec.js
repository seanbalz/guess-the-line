import { test, expect } from '@playwright/test';
import { createEplService } from '../../cloud/epl.mjs';
import { pgliteAvailable, signIn } from './community-world.mjs';
import { moneylineFlowWorld, moneylineRest, MONEYLINE_OWNERS } from './epl-moneyline-flow-fixture.mjs';

async function fixture(page, baseURL) {
  const world = await moneylineFlowWorld(page, baseURL, ({ db, rpc }) => createEplService({ rpc, ...moneylineRest(db) }));
  const books = Object.fromEntries(['draftkings', 'fanduel', 'betmgm'].map(book => [book, { ARS: -150, CHE: 130 }]));
  await world.db.query(`insert into public.gtl_epl_job_runs(job,slot_start,capability_hash,status,detail)
    values('dnb-check',now(),$1,'succeeded',$2)`, ['0'.repeat(64), {
    season: 2026, week: 9, dnbAvailable: true, checked: 3, priced: 3,
    events: ['flow-ars-che', 'flow-liv-eve', 'flow-tot-ful'].map(eventId => ({ eventId, books })),
  }]);
  return world;
}

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
  const world = await fixture(page, baseURL);
  try {
    await page.goto('/#epl/play/guess');
    await signIn(page, 'troy', { navigate: false });
    const price = page.getByLabel('Your moneyline price', { exact: true });
    await expect(price).toBeVisible();
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
    await expect(page.getByRole('button', { name: 'Lock in', exact: true })).toBeDisabled();
    expect(world.calls.filter(c => c.path === 'epl/guess/save' && c.body.lock)).toHaveLength(1);
    world.controls.blockGuessReads = false;
    await page.getByRole('button', { name: 'Check saved guesses', exact: true }).click();
    await expect(page.getByRole('img', { name: '1 of 3 matches locked', exact: true })).toBeVisible();
    expect(world.calls.filter(c => c.path === 'epl/guess/save' && c.body.lock)).toHaveLength(1);
    expect((await world.db.query("select count(*)::int n from public.gtl_epl_guess_history where action='lock'")).rows[0].n).toBe(1);
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
