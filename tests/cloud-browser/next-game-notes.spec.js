import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// Stage 35 uses HOSTED (the default fixture), including M-09/M-29. Real handlers and local SQL only.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(60000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; no production data is contacted.'));
const note = page => page.locator('.gx-game-note');
const textbox = page => note(page).getByRole('textbox', { name: 'Your note', exact: true });
const save = page => note(page).getByRole('button', { name: 'Save note', exact: true });
const target = world => ({ season: world.state.league.season, week: world.state.league.week, gameId: world.state.games[0].id });
const rows = async (world, account = 'luke') => (await world.api(account, 'personal/notes', { season: target(world).season, week: target(world).week })).body.notes;
const put = (world, text, revision, account = 'luke') => world.api(account, 'personal/note', { ...target(world), note: text, revision, requestId: randomUUID() });
async function openSheet(page) {
  await page.locator('.gx-l-card').first().click();
  await expect(textbox(page)).toBeVisible();
  await expect(note(page)).toHaveAttribute('aria-busy', 'false');
}
async function openNotes(page) {
  await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('/#lines');
  await signIn(page, 'luke', { navigate: false });
  await openSheet(page);
}
function writes(page) {
  const calls = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/functions/v1/gtl-api/personal/note') calls.push(request.postDataJSON()); });
  return calls;
}
async function loseSave(page, world, commit) {
  await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/personal/note'), async route => {
    if (commit) {
      const request = route.request();
      const response = await world.handler(new Request(request.url(), { method: 'POST', headers: request.headers(), body: request.postData() }));
      expect(response.status).toBe(200); await response.text();
    }
    await route.abort('failed');
  }, { times: 1 });
}

test('private notes preserve 2,000 UTF-16 characters, never create Favorites, clear without deletion, and stay owner-only', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    const calls = writes(page);
    await openNotes(page);
    expect(calls).toEqual([]);
    const exact = ` \n${'🏈'.repeat(997)}\n   `;
    expect(exact.length).toBe(2000);
    await expect(textbox(page)).toHaveAttribute('maxlength', '2000');
    await textbox(page).fill(exact);
    await save(page).click();
    await expect(note(page)).toContainText('Private note saved.');
    expect((await rows(world))[0].note).toBe(exact);
    expect((await rows(world))[0].saved).toBe(false);
    expect(await rows(world, 'troy')).toEqual([]);
    expect(await rows(world, 'sean')).toEqual([]);
    expect((await world.api('luke', 'personal')).body.favorites).toEqual([]);
    expect(calls[0]).toEqual({ ...target(world), requestId: expect.any(String), note: exact, revision: 0 });
    await textbox(page).fill('');
    await save(page).click();
    await expect(save(page)).toBeDisabled();
    expect((await rows(world))[0]).toMatchObject({ note: '', saved: false });
    expect((await world.db.query("select count(*)::int as n from public.gtl_personal_events where user_id=$1 and action='personal/note'", [ACCOUNTS.luke.id])).rows[0].n).toBe(2);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await textbox(page).scrollIntoViewIfNeeded();
        expect(await note(page).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        expect(await textbox(page).evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
        const results = await new AxeBuilder({ page }).include('.gx-game-note').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(results.violations).toEqual([]);
        await page.screenshot({ path: `.local/previews/next-note-${theme}-${width}.png` });
      }
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a conflict preserves the draft, and replaying an earlier receipt never replaces a newer saved note', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    const first = await put(world, 'Original', 0); expect(first.status).toBe(200);
    const calls = writes(page);
    await openNotes(page);
    await textbox(page).fill('My draft');
    expect((await put(world, 'Other device', first.body.revision)).status).toBe(200);
    await save(page).click();
    await expect(note(page).getByRole('alert')).toBeVisible();
    await expect(textbox(page)).toHaveValue('My draft');
    await expect(save(page)).toBeDisabled();
    await note(page).getByRole('button', { name: 'Check saved note' }).click();
    await expect(note(page).locator('.gx-game-note-saved')).toHaveText('Other device');
    const beforeReview = calls.length;
    await note(page).getByRole('button', { name: 'Keep editing my draft' }).click();
    expect(calls).toHaveLength(beforeReview);
    await save(page).click();
    await expect(note(page)).toContainText('Private note saved.');
    expect((await rows(world))[0].note).toBe('My draft');

    await textbox(page).fill('Lost save A');
    await loseSave(page, world, true);
    await save(page).click();
    await expect(note(page).getByRole('alert')).toContainText('could not confirm');
    const committed = (await rows(world))[0];
    expect(committed.note).toBe('Lost save A');
    expect((await put(world, 'Newer saved B', committed.revision)).status).toBe(200);
    await note(page).getByRole('button', { name: 'Check saved note' }).click();
    await expect(note(page).locator('.gx-game-note-saved')).toHaveText('Newer saved B');
    // A failed fresh read after the receipt must still keep the newer version we already verified.
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/personal/notes'), route => route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture read unavailable.' }) }), { times: 1 });
    await note(page).getByRole('button', { name: 'Retry same save' }).click();
    await expect(note(page)).toContainText('A newer saved note is preserved below');
    await expect(note(page).locator('.gx-game-note-saved')).toHaveText('Newer saved B');
    await expect(textbox(page)).toHaveValue('Lost save A');
    await expect(save(page)).toBeDisabled();
    expect(calls.at(-1)).toEqual(calls.at(-2));
    expect((await rows(world))[0].note).toBe('Newer saved B');
    await note(page).getByRole('button', { name: 'Use saved note' }).click();
    await expect(textbox(page)).toHaveValue('Newer saved B');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('an uncommitted request survives closing and reopening, retries only on demand, and account change purges private drafts', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    const calls = writes(page);
    await openNotes(page);
    await textbox(page).fill('Recovered exact request');
    await loseSave(page, world, false);
    await save(page).click();
    await expect(note(page).getByRole('alert')).toContainText('could not confirm');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(textbox(page)).toHaveValue('Recovered exact request');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await openSheet(page);
    await expect(textbox(page)).toHaveValue('Recovered exact request');
    expect(calls).toHaveLength(1);
    await note(page).getByRole('button', { name: 'Retry same save' }).click();
    await expect(note(page)).toContainText('Private note saved.');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect((await rows(world))[0].note).toBe('Recovered exact request');
    await textbox(page).fill('PRIVATE UNSAVED SENTINEL');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Your menu' }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    // Sign-out awaits the auth service. Assert the completed transition before inspecting its purge side effect.
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('gtl.next.draft.v1.')))).toEqual([]);
    await signIn(page, 'troy', { navigate: false });
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Lines', exact: true }).click();
    await openSheet(page);
    await expect(textbox(page)).toHaveValue('');
    await expect(page.locator('body')).not.toContainText('PRIVATE UNSAVED SENTINEL');
    await expect(page.locator('body')).not.toContainText('Recovered exact request');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
