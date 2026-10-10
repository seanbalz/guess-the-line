import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { seed } from '../../server/store.mjs';
import { createCloudHandler } from '../../cloud/handler.mjs';
import { handleSocial, providerSocialError } from '../../cloud/social.mjs';
import { providerPersonalError } from '../../cloud/personal.mjs';
import { providerLobbyError } from '../../cloud/lobby.mjs';
let PGlite;
try { ({ PGlite } = await import('../../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit local-only skip below. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('a signed-in player without a league opens shared Bet Tracker while Solo notes stay private', async ({ page, baseURL }) => {
  test.skip(!PGlite, 'Local PGlite required; never contacts hosted data.');
  const db = new PGlite(), requests = [], errors = [], responses = [];
  try {
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;');
    const migrations = ['20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql', '20261008185715_gtl_weekly_eligibility_rulings.sql', '20261008185738_gtl_manual_odds_collection.sql', '20261008224444_gtl_personal_workspace.sql', '20261009005145_gtl_social_bet_tracker.sql'];
    await db.exec(fs.readFileSync(`supabase/migrations/${migrations[0]}`, 'utf8'));
    const state = seed(); state.ballots = {}; state.bets = {}; state.audit = []; state.games = state.games.slice(0, 2); state.league.deadline = '2099-10-09T00:15:00Z'; state.games.forEach(game => { game.kickoff = game.kickoff.replace('2026-', '2099-'); });
    await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state]);
    await db.query('insert into auth.users values($1),($2)', [id(1), id(2)]);
    for (const file of migrations.slice(1)) await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Social Tester'),($2,'Troy Fixture')", [id(1), id(2)]);
    const privateNote = 'PRIVATE SOLO SENTINEL: never include this in the shared feed';
    await db.query('insert into public.gtl_favorites(user_id,season,week,game_id,saved,notes) values($1,2026,5,$2,true,$3)', [id(1), state.games[0].id, privateNote]);
    const rpc = mapper => async (name, args) => {
      try { return await db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query(`select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value; }); }
      catch (error) { throw mapper(error.message); }
    };
    const social = { rpc: rpc(providerSocialError) };
    await handleSocial({ route: '/social/create', body: { season: 2026, week: 5, weekRevision: 0, requestId: id(100), kind: 'single', legs: [{ gameId: state.games[0].id, market: 'spread', side: 'home', line: -6.5 }], odds: -140, stakeUnits: 1, source: 'Synthetic browser fixture' }, user: { id: id(2) }, service: social });
    const user = { id: id(1), aud: 'authenticated', role: 'authenticated', email: 'social@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', exp: expires })).toString('base64url')}.test`;
    const session = { access_token: token, refresh_token: 'test-only', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
    const handler = createCloudHandler({ authenticate: async value => value === token ? { ...user, emailConfirmed: true } : null, social, personal: { rpc: rpc(providerPersonalError) }, lobby: { rpc: rpc(providerLobbyError) }, storage: { membership() { throw new Error('No-league social and Solo routes must not require membership.'); } } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      const reply = (status, body) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.origin !== 'https://gtl-frontend-check.supabase.co') { errors.push(`Unexpected external request ${url.origin}`); return route.abort(); }
      if (url.pathname === '/auth/v1/token') return reply(200, session);
      if (url.pathname === '/auth/v1/user') return reply(200, user);
      if (url.pathname === '/auth/v1/logout') return reply(200, {});
      // D-21 community routes are not part of this fixture; answer as an undeployed function so the lobby falls back to My games (persona audit #7 keeps any other failure in the Community shell).
      if (url.pathname.includes('/gtl-api/community/')) return reply(404, { error: 'Not found.' });
      requests.push({ path: url.pathname, body: req.method() === 'POST' ? req.postDataJSON() : null });
      expect(req.headers().authorization).toBe(`Bearer ${token}`);
      const response = await handler(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}) }));
      const text = await response.text(); responses.push({ path: url.pathname, status: response.status, text });
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: text });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill('social@example.test');
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Bet Tracker', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Solo', exact: true })).toBeVisible();
    expect((await db.query('select count(*)::integer n from public.gtl_memberships')).rows[0].n).toBe(0);
    await page.getByRole('button', { name: 'Open Bet Tracker', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bet Tracker', exact: true })).toBeVisible();
    await expect(page.locator('.social-bet-card')).toHaveCount(1);
    await expect(page.locator('.social-bet-card')).toContainText('Troy Fixture');
    await expect(page.locator('.social-bet-card')).toContainText('DAL -6.5');
    await expect(page.locator('.social-bet-card')).toContainText('Synthetic browser fixture');
    await expect(page.locator('body')).not.toContainText(privateNote);
    expect(requests.some(req => /\/(personal|state|leagues)(\/|$)/.test(req.path))).toBe(false);
    expect(responses.filter(item => item.path.includes('/social/')).every(item => item.status === 200 && !item.text.includes(privateNote))).toBe(true);
    await page.locator('.social-bet-card').getByRole('button', { name: 'Follow Troy Fixture', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Following preference saved');
    const follow = requests.find(req => req.path.endsWith('/social/follow'));
    expect(Object.keys(follow.body).sort()).toEqual(['following', 'requestId', 'targetUserId']);
    expect((await db.query('select user_id,target_user_id from public.gtl_social_follows')).rows).toEqual([{ user_id: id(1), target_user_id: id(2) }]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '.local/previews/social-no-league-390.png', fullPage: true });
    await page.getByRole('button', { name: 'My games', exact: true }).click();
    await page.getByRole('button', { name: 'Open Solo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Favorites and private notes' })).toBeVisible();
    await expect(page.getByLabel(`Private note for ${state.games[0].id}`)).toHaveValue(privateNote);
    await expect(page.locator('.personal-workspace')).not.toContainText('Troy Fixture');
    expect((await db.query('select count(*)::integer n from public.gtl_memberships')).rows[0].n).toBe(0);
    expect(requests.some(req => req.path.endsWith('/leagues'))).toBe(false);
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});
