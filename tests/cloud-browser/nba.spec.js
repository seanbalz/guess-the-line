import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createCloudHandler } from '../../cloud/handler.mjs';
import { providerNbaError } from '../../cloud/nba.mjs';
import { normalizeNbaTicket } from '../../shared/nba-bets.mjs';
import { prepareNbaImport } from '../../scripts/nba-private-import.mjs';
import { ALL } from '../migrations.mjs';
import { createCommunityWorld, pgliteAvailable, SUPABASE, signIn, ACCOUNTS } from './community-world.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';
test.use({ actionTimeout: 10000 });

async function fixture(page, baseURL) {
  const world = await createCommunityWorld({ migrations: ALL, optionalRpc: true });
  const calls = [], controls = { loseSave: false, loseBefore: false, failGames: false, unavailable: false, empty: false, failRead: false, holdRead: null };
  const rpc = async (name, args) => {
    try { return await world.db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query(`select public.${name}(${Object.keys(args).map((key, index) => `${key}=>$${index + 1}`).join(',')}) result`, Object.values(args))).rows[0].result; }); }
    catch (error) { throw providerNbaError(error.message); }
  };
  const games = async body => {
    if (controls.failGames) throw new Error('Fixture refresh failed');
    const observedAt = new Date(Date.now() - 600000).toISOString();
    return { ...body, source: 'BALLDONTLIE', observedAt, stale: true, unavailable: controls.unavailable,
      games: controls.empty || controls.unavailable ? [] : ['scheduled', 'in_progress', 'final', 'postponed', 'canceled', 'unknown'].map((status, i) => ({ id: `NBA:synthetic:${i + 1}`, sourceDate: body.date, startTime: i ? null : `${body.date}T23:00:00Z`, away: { id: '1', name: 'Synthetic Away', abbreviation: 'AWY' }, home: { id: '2', name: 'Synthetic Home', abbreviation: 'HOM' }, status, statusText: status.replace('_', ' '), homeScore: ['in_progress', 'final'].includes(status) ? 10 : null, awayScore: ['in_progress', 'final'].includes(status) ? 0 : null, observedAt })) };
  };
  const handler = createCloudHandler({ authenticate: async token => world.users.has(token) ? { ...world.users.get(token), emailConfirmed: true } : null, nba: { rpc }, nbaGames: { read: games }, storage: { membership() { throw new Error('NBA requested NFL membership'); } } });
  page.on('pageerror', error => world.errors.push(error.message));
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === new URL(baseURL).origin) return route.continue();
    const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (isWebfont(url)) return route.abort();
    if (url.origin !== SUPABASE) { world.errors.push(`Unexpected origin ${url.origin}`); return route.abort(); }
    if (url.pathname === '/auth/v1/token') return reply(200, world.sessions[req.postDataJSON().email]);
    if (url.pathname === '/auth/v1/user') return reply(200, world.users.get(req.headers().authorization.replace('Bearer ', '')));
    if (url.pathname === '/auth/v1/logout') return reply(200, {});
    const path = url.pathname.split('/gtl-api/')[1];
    calls.push({ path, body: req.method() === 'POST' ? req.postDataJSON() : null });
    if (path === 'nba/read' && controls.failRead) return reply(503, { error: 'Fixture unavailable' });
    if (path === 'nba/save' && controls.loseBefore) { controls.loseBefore = false; return route.abort('failed'); }
    const response = await (path?.startsWith('nba/') ? handler : world.handler)(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}) }));
    if (path === 'nba/read' && controls.holdRead) { const held = controls.holdRead; controls.readHeld = true; await held; }
    if (path === 'nba/save' && controls.loseSave) { controls.loseSave = false; return route.abort('failed'); }
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }).catch(() => {});
  });
  const directSave = async (ticket, revision = 0, owner = ACCOUNTS.luke.id) => rpc('gtl_nba_save_bet', { p_user_id: owner, p_operation_id: randomUUID(), p_ticket: normalizeNbaTicket(ticket), p_expected_revision: revision, p_reason: revision ? 'Another device correction' : null });
  return { ...world, controls, calls, directSave };
}
async function enter(page, hash = '#nba/games?date=2026-10-21', view = 'next') {
  await page.goto(`/${hash}`); await signIn(page, 'luke', { navigate: false });
  await expect(page.getByRole('heading', { name: 'NBA Games' })).toBeVisible();
}
async function fillTicket(page, { label = 'Synthetic single', parlay = false } = {}) {
  await page.getByLabel('Ticket label', { exact: true }).fill(label);
  await page.getByLabel('Event date', { exact: true }).fill('2026-10-21');
  if (parlay) await page.getByRole('combobox', { name: 'Ticket type' }).selectOption('parlay');

  if (!await page.getByLabel('Matchup 1', { exact: true }).getAttribute('readonly').then(value => value !== null)) await page.getByLabel('Matchup 1', { exact: true }).fill('AWY at HOM');
  await page.getByLabel('Team 1', { exact: true }).fill('AWY');
  if (parlay) {

    await page.getByLabel('Matchup 2', { exact: true }).fill('AAA at BBB');
    await page.getByRole('combobox', { name: 'Market 2' }).selectOption('total');
    await page.getByLabel('Line 2', { exact: true }).fill('220.5');
  }
  await page.getByLabel(parlay ? 'Quoted combined price' : 'Ticket price', { exact: true }).fill(parlay ? '333.3333' : '-110.1234');
  await page.getByLabel('Stake (Units)', { exact: true }).fill('0.12345678');
}
async function reviewSave(page) {
  await page.getByRole('button', { name: 'Review ticket', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review your ticket' })).toBeVisible();
  await page.getByRole('button', { name: 'Save ticket', exact: true }).click();
}
async function checkLayout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bad = await page.locator('.gx-nba').evaluate(root => [...root.querySelectorAll('button,input,select,textarea,summary')].filter(el => el.getClientRects().length && !el.closest('details:not([open]) :not(summary)')).flatMap(el => {
    const r = el.getBoundingClientRect(), css = getComputedStyle(el);
    return r.width < 43.9 || r.height < 43.9 || Number.parseFloat(css.fontSize) < 16 ? [{ text: el.textContent.slice(0, 50), width: r.width, height: r.height, font: css.fontSize }] : [];
  }));
  expect(bad).toEqual([]);
}

test('cold NBA entry, actual SQL single/parlay lifecycle, receipts, History, exact accounting and screenshots', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  test.setTimeout(120000);
  const world = await fixture(page, baseURL);
  try {
    await enter(page);
    await expect(page.getByText('Time unavailable', { exact: false }).first()).toBeVisible();
    expect(world.calls.every(row => ['nba/games', 'lobby'].includes(row.path))).toBe(true);
    await expect(page.getByText('LIVE', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Cached · BALLDONTLIE', { exact: false })).toBeVisible();
    fs.mkdirSync('.local/previews/nba', { recursive: true });
    for (const width of [320, 390, 1440]) for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByText('Account and appearance', { exact: true }).click();
      await page.getByLabel('Color theme').selectOption(theme);
      await page.getByText('Account and appearance', { exact: true }).click();
      await checkLayout(page);
      await page.screenshot({ path: `.local/previews/nba/games-${width}-${theme}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    world.controls.failGames = true;
    await page.getByRole('button', { name: 'Refresh games', exact: true }).click();
    await expect(page.getByText('Refresh failed.', { exact: false })).toBeVisible();
    await expect(page.getByText('Cached · BALLDONTLIE', { exact: false })).toBeVisible();
    world.controls.failGames = false;
    await page.getByRole('button', { name: 'Track bet', exact: true }).first().click();
    await expect(page.getByLabel('Ticket price', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Stake (Units)', { exact: true })).toHaveValue('');
    await fillTicket(page);
    await page.screenshot({ path: '.local/previews/nba/editor-390-light.png', fullPage: true });
    await checkLayout(page);
    const axeEditor = await new AxeBuilder({ page }).include('.gx-nba').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axeEditor.violations).toEqual([]);
    world.controls.loseSave = true;
    await reviewSave(page);
    await expect(page.getByRole('button', { name: 'Check saved ticket' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save ticket', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Check saved ticket' }).click();
    await expect(page.getByRole('heading', { name: 'My NBA Bets' })).toBeVisible();
    expect(world.calls.filter(row => row.path === 'nba/save')).toHaveLength(1);
    const singleSave = world.calls.find(row => row.path === 'nba/save').body;
    expect(world.calls.some(row => row.path === 'nba/read' && row.body.ticketId === singleSave.ticket.id)).toBe(true);
    await page.reload(); await expect(page.getByText('Synthetic single', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit terms or confirm result' }).click();
    await expect(page.getByLabel('Ticket price', { exact: true })).toHaveValue('-110.1234');
    await expect(page.getByLabel('Stake (Units)', { exact: true })).toHaveValue('0.12345678');
    await page.getByLabel('Owner-confirmed result').selectOption('win');
    await page.getByLabel('Correction reason (required)').fill('Confirmed with bookmaker');
    await reviewSave(page); await expect(page.getByRole('heading', { name: 'My NBA Bets' })).toBeVisible();
    const settled = (await world.db.query('select net_units from nba_private.bets where id=$1', [singleSave.ticket.id])).rows[0].net_units;
    await expect(page.getByText(`Net ${settled} U`, { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Edit terms or confirm result' }).click();
    await page.getByLabel('Owner-confirmed result').selectOption('push');
    await page.getByLabel('Correction reason (required)').fill('Bookmaker correction'); await reviewSave(page);
    await expect(page.getByRole('heading', { name: 'My NBA Bets' })).toBeVisible();
    await page.getByRole('button', { name: 'Track a bet', exact: true }).click();
    await fillTicket(page, { label: 'Synthetic parlay', parlay: true });
    await page.getByLabel('Matchup 2', { exact: true }).fill('AWY at HOM');
    await reviewSave(page);
    await expect(page.getByText('Synthetic parlay', { exact: true })).toBeVisible();
    const parlaySave = world.calls.filter(row => row.path === 'nba/save').at(-1).body;
    expect(parlaySave.ticket.legs[0].gameId).toMatch(/^NBA:manual:/);
    expect(parlaySave.ticket.legs[1].gameId).toBe(parlaySave.ticket.legs[0].gameId);
    await expect(page.getByText('Game ID', { exact: false })).toHaveCount(0);
    await page.screenshot({ path: '.local/previews/nba/bets-390-light.png', fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 }); await checkLayout(page);
    await page.getByText('Account and appearance', { exact: true }).click(); await page.getByLabel('Color theme').selectOption('dark'); await page.getByText('Account and appearance', { exact: true }).click();
    await page.screenshot({ path: '.local/previews/nba/bets-320-dark.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: '.local/previews/nba/bets-desktop-dark.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const cards = page.locator('main .gx-card').filter({ has: page.getByText('Synthetic parlay', { exact: true }) });
    await cards.getByRole('button', { name: 'Edit terms or confirm result' }).click();
    await expect(page.getByLabel('Quoted combined price')).toHaveValue('333.3333');
    await page.getByLabel('Owner-confirmed result').selectOption('void');
    await page.getByLabel('Correction reason (required)').fill('Owner confirmed void'); await reviewSave(page);
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Result', exact: true })).toHaveValue('settled');
    await expect(page.getByText('Filtered totals · 2 tickets', { exact: true })).toBeVisible();
    await expect(page.getByText('0 wins · 0 losses · 1 push · 1 void')).toBeVisible();
    await page.locator('main .gx-card').filter({ has: page.getByText('Synthetic single', { exact: true }) }).getByText('Ticket details and correction history', { exact: true }).click();
    await expect(page.getByText('Bookmaker correction', { exact: false })).toBeVisible();
    await page.reload(); await expect(page.getByText('Filtered totals · 2 tickets', { exact: true })).toBeVisible();
    const summaryAxe = await new AxeBuilder({ page }).include('.gx-nba').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(summaryAxe.violations).toEqual([]);
    await page.getByText('Account and appearance', { exact: true }).click(); await page.getByLabel('Color theme').selectOption('light'); await page.getByText('Account and appearance', { exact: true }).click();
    await page.screenshot({ path: '.local/previews/nba/history-390-light.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByText('Account and appearance', { exact: true }).click(); await page.getByLabel('Color theme').selectOption('light'); await page.getByText('Account and appearance', { exact: true }).click();
    await page.screenshot({ path: '.local/previews/nba/history-desktop-light.png', fullPage: true });
    expect((await world.db.query('select count(*)::int n from nba_private.bets')).rows[0].n).toBe(2);
    expect((await world.db.query('select count(*)::int n from nba_private.bet_changes')).rows[0].n).toBe(5);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

const syntheticTicket = (changes = {}) => ({ id: randomUUID(), season: '2026-27', eventDate: '2026-10-21', kind: 'single', label: 'Synthetic archived terms', legs: [{ gameId: 'NBA:synthetic:1', matchup: 'AWY at HOM', market: 'spread', team: 'AWY', line: -2.5 }], priceInput: { format: 'american', value: -110.1234 }, stakeUnits: 0.12345678, outcome: 'pending', ...changes });

test('uncertain absent receipt retries identical payload; concurrent edit retains draft and requires reconciliation', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  const world = await fixture(page, baseURL);
  try {
    await enter(page); await page.getByRole('button', { name: 'Track bet', exact: true }).first().click();
    await fillTicket(page);
    await page.getByRole('combobox', { name: 'Odds format' }).selectOption('probability');
    await page.getByLabel('Ticket price', { exact: true }).fill('100');
    await page.getByRole('button', { name: 'Review ticket', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('valid odds');
    expect(world.calls.filter(row => row.path === 'nba/save')).toHaveLength(0);
    await page.getByLabel('Ticket price', { exact: true }).fill('79.52');
    world.controls.loseBefore = true; await reviewSave(page);
    await page.getByRole('button', { name: 'Check saved ticket' }).click();
    await expect(page.getByRole('button', { name: 'Retry same save' })).toBeEnabled();
    await expect(page.getByLabel('Ticket label', { exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Retry same save' }).click();
    await expect(page.getByText('Synthetic single', { exact: true })).toBeVisible();
    const saves = world.calls.filter(row => row.path === 'nba/save');
    expect(saves).toHaveLength(2); expect(saves[1].body).toEqual(saves[0].body);
    expect(saves[0].body.ticket.priceInput).toEqual({ format: 'probability', value: 79.52 });
    await page.getByRole('button', { name: 'Edit terms or confirm result' }).click();
    await page.getByLabel('Ticket label', { exact: true }).fill('Retained correction draft');
    await page.getByLabel('Correction reason (required)').fill('Reconcile correction');
    await world.directSave({ ...saves[0].body.ticket, outcome: 'win' }, 1);
    await reviewSave(page);
    await expect(page.getByRole('button', { name: 'Load latest saved ticket' })).toBeVisible();
    await expect(page.getByLabel('Ticket label', { exact: true })).toHaveValue('Retained correction draft');
    await page.getByRole('button', { name: 'Load latest saved ticket' }).click();
    await expect(page.getByText('Latest revision 2:', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Reconcile my draft with this revision' }).click();
    await expect(page.getByLabel('Ticket label', { exact: true })).toHaveValue('Retained correction draft');
    await reviewSave(page); await expect(page.getByText('Retained correction draft', { exact: true })).toBeVisible();
    expect(world.calls.filter(row => row.path === 'nba/save').at(-1).body.expectedRevision).toBe(2);
    expect((await world.db.query('select count(*)::int n from nba_private.bets')).rows[0].n).toBe(1);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('imported terms without matchup stay editable, keep original precision and source records; keyboard and reduced motion work', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  const world = await fixture(page, baseURL);
  try {
    const original = { ...syntheticTicket({ label: 'Synthetic imported ticket' }), odds: -132.5581, sport: 'nba', netUnits: null, oddsBasis: 'Synthetic source price', stakeBasis: 'Synthetic source stake' };
    delete original.priceInput; delete original.legs[0].matchup;
    const prepared = prepareNbaImport(JSON.stringify({ entries: [original] }), { ownerId: ACCOUNTS.luke.id, importId: randomUUID() });
    await world.db.exec(prepared.sql);
    const source = (await world.db.query('select source_record,provenance,import_id,imported_at from nba_private.bets')).rows;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enter(page);
    await page.getByRole('button', { name: 'My Bets', exact: true }).click();
    await page.getByRole('button', { name: 'Edit terms or confirm result' }).click();
    await expect(page.getByLabel('Ticket price', { exact: true })).toHaveValue('-132.5581');
    await expect(page.getByLabel('Stake (Units)', { exact: true })).toHaveValue('0.12345678');
    await expect(page.getByLabel('Matchup 1', { exact: true })).toHaveValue('');
    await expect(page.getByText('Game ID', { exact: false })).toHaveCount(0);
    await page.getByLabel('Ticket label', { exact: true }).focus(); await page.keyboard.press('Tab');
    await expect(page.getByLabel('Event date', { exact: true })).toBeFocused();
    await page.getByLabel('Owner-confirmed result').selectOption('loss');
    await page.getByLabel('Correction reason (required)').fill('Owner confirmed imported result');
    await page.getByRole('button', { name: 'Review ticket', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Review your ticket' })).toBeVisible();
    await page.getByRole('button', { name: 'Save ticket', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByText('Synthetic imported ticket', { exact: true })).toBeVisible();
    const request = world.calls.find(row => row.path === 'nba/save').body;
    expect(request.ticket.id).toBe(original.id); expect(request.ticket.legs[0].gameId).toBe(original.legs[0].gameId);
    expect(request.ticket.priceInput).toEqual({ format: 'american', value: -132.5581 }); expect(request.ticket.stakeUnits).toBe(0.12345678);
    expect((await world.db.query('select source_record,provenance,import_id,imported_at from nba_private.bets')).rows).toEqual(source);
    expect(await page.locator('.gx-nba').evaluate(root => root.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('server full-set pagination, date filters, empty/unavailable/read failures and stale account response isolation', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.'); test.setTimeout(60000);
  const world = await fixture(page, baseURL);
  let release;
  try {
    const seed = syntheticTicket({ outcome: 'win', eventDate: '2026-10-01', priceInput: { format: 'american', value: 125 }, stakeUnits: 1 });
    for (let i = 0; i < 103; i++) await world.directSave({ ...seed, id: randomUUID(), label: `Synthetic page ticket ${i}` });
    await world.directSave(syntheticTicket({ label: 'Older pending sentinel', eventDate: '2026-10-01' }));
    await enter(page);
    world.controls.empty = true; await page.getByRole('button', { name: 'Tomorrow', exact: true }).click();
    await expect(page.getByText('No games on this date.')).toBeVisible();
    world.controls.unavailable = true; await page.getByRole('button', { name: 'Refresh games', exact: true }).click();
    await expect(page.getByText('Games are unavailable.', { exact: false })).toBeVisible();
    await expect(page.getByText('No games on this date.')).toHaveCount(0);
    await page.getByRole('button', { name: 'My Bets', exact: true }).click();
    await expect(page.getByText('Older pending sentinel', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.getByText('Filtered totals · 103 tickets')).toBeVisible();
    await expect(page.getByText('Net 128.75 U', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit terms or confirm result' })).toHaveCount(100);
    await page.getByRole('button', { name: 'Load more tickets' }).click();
    await expect(page.getByRole('button', { name: 'Edit terms or confirm result' })).toHaveCount(103);
    await expect(page.getByText('Net 128.75 U', { exact: true })).toBeVisible();
    await page.getByLabel('From', { exact: true }).fill('2026-10-20');
    await expect(page.getByText('No tickets match these filters.')).toBeVisible();
    await page.getByRole('button', { name: 'All dates', exact: true }).click();
    await expect(page.getByText('Filtered totals · 103 tickets')).toBeVisible();
    world.controls.failRead = true;
    await page.getByRole('button', { name: 'Refresh tickets' }).click();
    await expect(page.getByText('Could not load tickets.', { exact: false })).toBeVisible();
    await expect(page.getByText('No tickets match these filters.')).toHaveCount(0);
    world.controls.failRead = false;
    world.controls.holdRead = new Promise(resolve => { release = resolve; });
    await page.getByRole('button', { name: 'Refresh tickets' }).click();
    await expect(page.getByText('Loading tickets…')).toBeVisible();
    await expect.poll(() => world.controls.readHeld).toBe(true);
    // Hold the first owner's already-computed reply across a genuine AuthGate account change.
    world.controls.holdRead = null;
    await page.getByText('Account and appearance', { exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'troy', { navigate: false });
    await expect(page.getByText('No tickets match these filters.')).toBeVisible();
    release();
    await expect(page.getByText('Filtered totals · 0 tickets')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Synthetic page ticket');
    await expect(page.locator('body')).not.toContainText('Older pending sentinel');
    expect(world.errors).toEqual([]);
  } finally { release?.(); await world.db.close(); }
});

for (const view of ['next']) test(`${view} sport entry/return, NFL and NBA draft guards, browser Back and account isolation`, async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.'); test.setTimeout(60000);
  const world = await fixture(page, baseURL);
  try {
    await enter(page, '#nba/games?date=2026-10-21', view);
    expect(world.calls.every(row => row.path === 'nba/games')).toBe(true);
    // The skip link moves focus into NBA's main region and leaves the address alone, so it never reads as a sport change.
    await page.locator('.gx-nba-skip').focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#nba-main')).toBeFocused();
    await expect(page.getByRole('heading', { name: 'NBA Games' })).toBeVisible();
    expect(new URL(page.url()).hash).toBe('#nba/games?date=2026-10-21');
    // Defense in depth: a non-route #nba fragment reached any other way keeps NBA mounted (no NFL reads, no guards).
    await page.evaluate(() => new Promise(resolve => {
      addEventListener('hashchange', () => requestAnimationFrame(() => requestAnimationFrame(resolve)), { once: true });
      location.hash = '#nba-main';
    }));
    await expect(page.locator('.gx-nba')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'NBA Games' })).toBeVisible();
    await page.goBack();
    expect(new URL(page.url()).hash).toBe('#nba/games?date=2026-10-21');
    await expect(page.getByRole('heading', { name: 'NBA Games' })).toBeVisible();
    expect(world.calls.every(row => row.path === 'nba/games')).toBe(true);
    await page.getByRole('button', { name: 'NFL', exact: true }).click();
    await expect(page.locator('.gx-nba')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    // The sport row sits outside the sticky top bar, which keeps its token height: sticky Research group headings
    // and Play's focus scroll margin are offset by --gx-size-topbar.
    await page.setViewportSize({ width: 390, height: 844 });
    const bar = await page.locator('.gx-topbar').evaluate(el => {
      const css = getComputedStyle(el);
      return { height: el.getBoundingClientRect().height, expected: parseFloat(css.getPropertyValue('--gx-size-topbar')) + parseFloat(css.paddingTop) + parseFloat(css.borderBottomWidth) };
    });
    expect(bar.expected).toBeGreaterThanOrEqual(56);
    expect(bar.height).toBe(bar.expected);
    await expect(page.locator('.gx-topbar .gx-sport-controls')).toHaveCount(0);
    await expect(page.locator('.gx-sport-controls').getByRole('group', { name: 'Sport', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Play/ }).click();
    // The four-tab Play landing (c6afb02) opens the per-game editor from its one primary action.
    await page.getByRole('button', { name: 'Continue guessing', exact: true }).click();
    // The current per-game entry owns the Shell dirty registry.
    await page.getByRole('button', { name: /Pick'em/i }).first().click();
    let confirms = 0;
    page.on('dialog', dialog => { confirms++; dialog.dismiss(); });
    await page.getByRole('group', { name: 'Sport', exact: true }).getByRole('button', { name: 'NBA', exact: true }).click();
    expect(confirms).toBe(1); await expect(page.locator('.gx-nba')).toHaveCount(0);
    const nflHash = new URL(page.url()).hash;
    page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.accept());
    await page.getByRole('group', { name: 'Sport', exact: true }).getByRole('button', { name: 'NBA', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'NBA Games' })).toBeVisible();
    await page.getByRole('button', { name: 'NFL', exact: true }).click();
    await expect(page.locator('.gx-nba')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe(nflHash);
    await page.getByRole('group', { name: 'Sport', exact: true }).getByRole('button', { name: 'NBA', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'NBA Games' })).toBeVisible();
    await page.getByRole('button', { name: 'Track bet', exact: true }).first().click();
    await page.getByLabel('Ticket label', { exact: true }).fill('Cross-sport back draft');
    page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.dismiss());
    await page.goBack();
    await expect(page.getByLabel('Ticket label', { exact: true })).toHaveValue('Cross-sport back draft');
    expect(new URL(page.url()).hash).toBe('#nba/games');
    page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Cancel editor' }).click();
    await page.getByLabel('Game date').fill('2026-10-21');
    await page.getByRole('button', { name: 'Tomorrow', exact: true }).click();
    await expect(page.getByLabel('Game date')).toHaveValue('2026-10-22');
    await page.getByRole('button', { name: 'Track bet', exact: true }).first().click();
    await page.getByLabel('Ticket label', { exact: true }).fill('PRIVATE DRAFT SENTINEL');
    page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'NFL', exact: true }).click();
    await expect(page.getByLabel('Ticket label', { exact: true })).toHaveValue('PRIVATE DRAFT SENTINEL');
    await page.goBack();
    await expect(page.getByLabel('Ticket label', { exact: true })).toHaveValue('PRIVATE DRAFT SENTINEL');
    expect(new URL(page.url()).hash).toContain('date=2026-10-22');
    page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.accept());
    await page.getByText('Account and appearance', { exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await signIn(page, 'troy', { navigate: false });
    await expect(page.getByRole('heading', { name: 'NBA Games' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('PRIVATE DRAFT SENTINEL');
    await page.getByRole('button', { name: 'My Bets', exact: true }).click();
    await expect(page.getByText('No tickets match these filters.')).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
