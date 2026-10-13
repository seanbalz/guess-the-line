import { test as base, expect } from '@playwright/test';
import { createStore, seed } from '../../server/store.mjs';
import { withSyntheticLocalQuotes } from '../fixtures/local-quotes.mjs';
import { emptySocialRead } from './social-read-fixture.mjs';
import { pickTotal, expectPick, expectNoPick, expectPickEnabled } from '../chip-entry.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isWebfont } from '../fixtures/webfonts.mjs';

// All Supabase traffic is intercepted locally. These tests never use real accounts,
// send confirmation emails, or exercise a deployed Supabase project.
const test = base.extend({
  league: async ({ page, baseURL }, use) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-cloud-browser-'));
    const file = path.join(directory, 'state.json'), now = Date.parse('2026-10-08T16:00:00Z');
    fs.writeFileSync(file, JSON.stringify(withSyntheticLocalQuotes(seed(), now)));
    const store = createStore(file, () => now);
    const league = { store, member: false, revision: 1, conflictNext: false, conflictSubmit: false, signups: 0, requests: [], browserErrors: [] };
    const user = {
      id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'player@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { player: 'sean' }, // User-editable metadata must never select the player.
      created_at: '2026-10-08T00:00:00Z',
    };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: user.id, aud: user.aud, role: user.role, email: user.email, exp: expires })).toString('base64url'),
      'test-signature',
    ].join('.');
    const session = { access_token: token, refresh_token: 'local_test_refresh', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
    page.on('pageerror', error => league.browserErrors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      if (isWebfont(url)) return route.abort(); if (url.origin !== 'https://gtl-frontend-check.supabase.co') {
        league.browserErrors.push(`Unexpected external request: ${url.origin}`);
        return route.abort();
      }
      const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (url.pathname === '/auth/v1/signup') { league.signups++; return reply(200, { user, session: null }); }
      if (url.pathname === '/auth/v1/token') return reply(200, session);
      if (url.pathname === '/auth/v1/logout') return reply(200, {});
      if (url.pathname === '/auth/v1/user') return reply(200, user);
      // D-21 community routes are not part of these fixtures; answer as an undeployed function.
      if (url.pathname.includes('/gtl-api/community/')) return reply(404, { error: 'Not found.' });
      if (!url.pathname.startsWith('/functions/v1/gtl-api/')) {
        league.browserErrors.push(`Unexpected mocked endpoint: ${url.pathname}`);
        return reply(404, { error: 'Unexpected test endpoint' });
      }
      const endpoint = url.pathname.replace('/functions/v1/gtl-api/', '');
      const routeName = endpoint === 'social/read' ? endpoint : url.pathname.split('/').at(-1);
      const body = request.method() === 'POST' ? request.postDataJSON() : null;
      league.requests.push({ route: routeName, query: url.search, body });
      expect(url.searchParams.has('player')).toBe(false);
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      expect(request.headers().apikey).toBe('sb_publishable_frontend_test_only');
      if (endpoint === 'social/read') {
        const state = store.view('troy', 'guess_spread');
        return reply(200, await emptySocialRead(request, user.id,
          [{ season: state.league.season, week: state.league.week, games: state.games }]));
      }
      if (routeName !== 'lobby') expect(url.searchParams.get('league')).toBe('sean-troy-luke');
      if (['bet', 'export'].includes(routeName)) expect(url.searchParams.has('mode')).toBe(false);
      if (routeName === 'lobby') return reply(200, {profile:{id:user.id,displayName:'Troy Jun'},leagues:league.member?[{id:'sean-troy-luke',name:'Triple Threat',format:'triple-threat',role:'player',memberCount:3,maxMembers:3,practice:false}]:[],pendingInvites:[]});
      if (!league.member) return reply(403, { error: 'League membership is required.' });
      const mode = url.searchParams.get('mode') || 'guess_spread';
      if (body) {
        expect(body.revision).toBe(league.revision);
        expect(body).not.toHaveProperty('player');
        expect(body).not.toHaveProperty('league');
        if (league.conflictNext) {
          league.conflictNext = false;
          league.revision++;
          if(league.conflictSubmit){const picks=Object.fromEntries(store.view('troy',mode).games.map(game=>[game.id,47.5]));store.saveBallot('troy',mode,picks,true)}else store.saveBallot('troy', mode, { 'PHI-JAX': 48 });
          return reply(409, { error: 'Another device changed the saved data.' });
        }
        const result = routeName === 'bet' ? store.saveBet('troy', body) : store.saveBallot('troy', mode, body.picks, body.submit);
        league.revision++;
        return reply(200, { ...result, localOnly: false, revision: league.revision });
      }
      return reply(200, { ...(routeName === 'export' ? store.export('troy') : store.view('troy', mode)), localOnly: false, revision: league.revision });
    });
    try { await use(league); expect(league.browserErrors).toEqual([]); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
  },
});

async function signIn(page) {
  await page.getByLabel('Email', { exact: true }).fill('player@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('signup requires an explicit submit and shows confirmation, membership and signout states on mobile', async ({ page, league }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your games. Any device.' })).toBeVisible();
  expect(league.signups).toBe(0);
  expect(league.requests).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.getByLabel('Email', { exact: true }).evaluate(element => getComputedStyle(element).fontSize)).toBe('16px');
  await page.locator('.auth-tabs').getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Email', { exact: true }).fill('player@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  expect(league.signups).toBe(0);
  await page.locator('form').getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Check your email');
  expect(league.signups).toBe(1);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'My games', exact:true })).toBeVisible();
  await expect(page.getByLabel('Local player view')).toHaveCount(0);
  await expect(page.locator('.score-number')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your games. Any device.' })).toBeVisible();
});

test('persisted sign-in uses the server roster identity and private exports carry no persona query', async ({ page, league }) => {
  await page.goto('/'); await signIn(page);
  await expect(page.getByRole('heading', { name: 'My games', exact:true })).toBeVisible();
  league.member = true;
  await page.getByRole('button', { name: 'Refresh games' }).click();
  await page.getByRole('button', { name: 'Open game' }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.' })).toBeVisible();
  await expect(page.locator('.signed-in-player')).toContainText('Troy Jun');
  await expect(page.getByLabel('Local player view')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.' })).toBeVisible();
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await expectNoPick(page,'TB at DAL home spread');
  await expect(page.locator('.hidden-value')).toHaveCount(15);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my data' }).click();
  expect((await download).suggestedFilename()).toBe('gtl-sean-troy-luke-troy-week-05-audit.json');
  expect(league.requests.find(request => request.route === 'export')?.query).toBe('?league=sean-troy-luke');
});

test('a stale save preserves the draft while refresh merges unedited remote picks, then saves the new revision', async ({ page, league }) => {
  league.member = true;
  await page.goto('/'); await signIn(page);
  await page.getByRole('button', { name: 'Open game' }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.' })).toBeVisible();
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await page.getByRole('button', { name: 'Guess the Total', exact: true }).click();
  await pickTotal(page,'TB at DAL combined points','44.5');
  league.conflictNext = true;
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Saved data changed');
  await expectPick(page,'TB at DAL combined points','44.5 total points');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Refresh saved data' }).click();
  await expect(page.getByRole('status')).toContainText('unsaved changes are preserved');
  await expectPick(page,'TB at DAL combined points','44.5 total points');
  await expectPick(page,'PHI at JAX combined points','48 total points');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('saved to your account');
  const saved = league.store.view('troy', 'guess_total');
  expect(saved.games.find(game => game.id === 'TB-DAL').prediction).toBe(44.5);
  expect(saved.games.find(game => game.id === 'PHI-JAX').prediction).toBe(48);
  expect(league.requests.filter(request => request.route === 'ballot').map(request => request.body.revision)).toEqual([1, 2]);
});

test('another device submission preserves a local edit and requires resolving the changed field', async ({ page, league }) => {
  league.member = true;
  await page.goto('/'); await signIn(page);
  await page.getByRole('button', { name: 'Open game' }).click();
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await page.getByRole('button', { name: 'Guess the Total', exact: true }).click();
  await pickTotal(page,'TB at DAL combined points','44.5');
  league.conflictNext = true; league.conflictSubmit = true;
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Saved data changed');
  await expectPick(page,'TB at DAL combined points','44.5 total points');
  await page.getByRole('button', { name: 'Refresh saved data' }).click();
  await expect(page.getByRole('status')).toContainText('unsaved changes are preserved');
  await expectPick(page,'TB at DAL combined points','44.5 total points');
  await expectPickEnabled(page,'TB at DAL combined points');
  await expect(page.getByText('SUBMITTED · EDITABLE', { exact: true })).toBeVisible();
  await expect(page.getByText('Changed on another device',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Review & save changes',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Keep my edit',exact:true}).click();
  await expect(page.getByRole('button',{name:'Review & save changes',exact:true})).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(0);
  expect(league.requests.filter(request => request.route === 'ballot')).toHaveLength(1);
});
