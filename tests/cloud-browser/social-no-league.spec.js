import { test, expect } from '@playwright/test';
import { seed } from '../../server/store.mjs';
import { createCloudHandler } from '../../cloud/handler.mjs';
import { handleSocial, providerSocialError } from '../../cloud/social.mjs';
import { providerPersonalError } from '../../cloud/personal.mjs';
import { providerLobbyError } from '../../cloud/lobby.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';
import { ALL, HOSTED, PRELUDE, migrationSql } from '../migrations.mjs';
let PGlite;
try { ({ PGlite } = await import('../../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit local-only skip below. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('a signed-in player without a league opens shared Bet Tracker while Solo notes stay private', async ({ page, baseURL }) => {
  test.skip(!PGlite, 'Local PGlite required; never contacts hosted data.');
  const db = new PGlite(), requests = [], errors = [], responses = [];
  try {
    await db.exec(PRELUDE);
    // The old app on the schema players actually have (tests/migrations.mjs).
    const migrations = HOSTED;
    await db.exec(migrationSql(migrations[0]));
    const state = seed(); state.ballots = {}; state.bets = {}; state.audit = []; state.games = state.games.slice(0, 2); state.league.deadline = '2099-10-09T00:15:00Z'; state.games.forEach(game => { game.kickoff = game.kickoff.replace('2026-', '2099-'); });
    await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state]);
    await db.query('insert into auth.users values($1),($2)', [id(1), id(2)]);
    for (const file of migrations.slice(1)) await db.exec(migrationSql(file));
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
      if (isWebfont(url)) return route.abort(); if (url.origin !== 'https://gtl-frontend-check.supabase.co') { errors.push(`Unexpected external request ${url.origin}`); return route.abort(); }
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

// Redesign stage 21 (M-04; D-36 as amended by D-39): on the schema with M-04 (ALL), another player's real-slip leg shows a lock
// and no line until this player locks in that game's Guess the Line pick for that market, sits it out, or it kicks off; Tail
// waits for it; the player's own slip stays whole. DP-3: the tracker opens on the current published week, not Week 5.
test('real slips: a locked leg shows no line and Tail waits until the player sits out; the tracker opens on the current week', async ({ page, baseURL }) => {
  test.skip(!PGlite, 'Local PGlite required; never contacts hosted data.');
  const db = new PGlite(), errors = [], responses = [];
  try {
    await db.exec(PRELUDE);
    const migrations = ALL;
    await db.exec(migrationSql(migrations[0]));
    const state = seed(); state.ballots = {}; state.bets = {}; state.audit = []; state.games = state.games.slice(0, 2); state.league.deadline = '2099-10-09T00:15:00Z'; state.games.forEach(game => { game.kickoff = game.kickoff.replace('2026-', '2099-'); });
    await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state]);
    await db.query('insert into auth.users values($1),($2)', [id(1), id(2)]);
    for (const file of migrations.slice(1)) await db.exec(migrationSql(file));
    await db.query("insert into public.gtl_profiles(user_id,display_name) values($1,'Social Tester'),($2,'Troy Fixture')", [id(1), id(2)]);
    // The community has published Week 6 (fixture games, kickoffs far ahead); the league state still says Week 5.
    const kickoff = Math.floor(Date.parse('2099-10-16T00:15:00Z') / 1000), next = { id: 'KC-LV', away: 'KC', home: 'LV', kickoff };
    await db.query('insert into public.gtl_weekly_slates(season,week,signature) values(2026,6,$1)', [{ season: 2026, week: 6, deadline: kickoff, games: [next] }]);
    const rpc = mapper => async (name, args) => {
      try { return await db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query(`select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value; }); }
      catch (error) { throw mapper(error.message); }
    };
    const social = { rpc: rpc(providerSocialError) };
    const slip = (user, requestId, weekRevision, line, notes) => handleSocial({ route: '/social/create', body: { season: 2026, week: 6, weekRevision, requestId: id(requestId), kind: 'single', legs: [{ gameId: next.id, market: 'spread', side: 'home', line }], odds: -110, stakeUnits: 1, source: 'Synthetic browser fixture', notes }, user: { id: user }, service: social });
    await slip(id(2), 200, 0, -6.5, 'Troy took LV -6.5 early');
    await slip(id(1), 201, 1, -7.5, '');
    const user = { id: id(1), aud: 'authenticated', role: 'authenticated', email: 'social@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', exp: expires })).toString('base64url')}.test`;
    const session = { access_token: token, refresh_token: 'test-only', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
    const handler = createCloudHandler({ authenticate: async value => value === token ? { ...user, emailConfirmed: true } : null, social, personal: { rpc: rpc(providerPersonalError) }, lobby: { rpc: rpc(providerLobbyError) }, storage: { membership() { throw new Error('No-league social routes must not require membership.'); } } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      const reply = (status, body) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
      if (isWebfont(url)) return route.abort(); if (url.origin !== 'https://gtl-frontend-check.supabase.co') { errors.push(`Unexpected external request ${url.origin}`); return route.abort(); }
      if (url.pathname === '/auth/v1/token') return reply(200, session);
      if (url.pathname === '/auth/v1/user') return reply(200, user);
      if (url.pathname === '/auth/v1/logout') return reply(200, {});
      if (url.pathname.includes('/gtl-api/community/')) return reply(404, { error: 'Not found.' });
      const response = await handler(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}) }));
      const text = await response.text(); responses.push({ path: url.pathname, body: req.method() === 'POST' ? req.postDataJSON() : null, status: response.status, text });
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: text });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill('social@example.test');
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Open Bet Tracker', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bet Tracker', exact: true })).toBeVisible();
    // DP-3: the first read names no week, and the tracker shows the newest published week.
    const firstRead = responses.find(item => item.path.endsWith('/social/read'));
    expect(firstRead.body.season).toBeUndefined(); expect(firstRead.body.week).toBeUndefined();
    await expect(page.getByLabel('Competition week')).toHaveValue('2026:6');
    await expect(page.locator('.social-section-heading p').first()).toContainText('2026, Week 6');
    const cards = page.locator('.social-bet-card'), troy = cards.filter({ hasText: 'Troy Fixture' }), own = cards.filter({ hasText: /YOU/ });
    await expect(cards).toHaveCount(2);
    // Troy's leg: a lock and the way in, no line, no note, Tail disabled. The player's own slip keeps its line.
    await expect(troy.locator('[data-locked="true"]').first()).toBeVisible();
    await expect(troy).toContainText('Line locked');
    await expect(troy).toContainText('Submit your Spread picks to see this line.');
    await expect(troy).toContainText('The ticket note shows with the line.');
    await expect(troy.getByRole('button', { name: /^Tail/ })).toBeDisabled();
    await expect(troy).toContainText('Tail opens with the line.');
    await expect(own).toContainText('LV -7.5');
    await expect(page.locator('.social-feed')).not.toContainText('6.5');
    for (const item of responses.filter(r => r.path.endsWith('/social/read'))) expect(item.text.includes('6.5')).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '.local/previews/social-line-lock-390.png', fullPage: true });
    // A sit-out of Week 6 Spread (D-23) opens that line: Troy's leg, note and Tail come back.
    await db.query("insert into public.gtl_weekly_optouts(user_id,season,week,mode) values($1,2026,6,'guess_spread')", [id(1)]);
    await page.getByRole('button', { name: 'Refresh bet tracker', exact: true }).click();
    await expect(troy).toContainText('LV -6.5');
    await expect(troy).toContainText('Troy took LV -6.5 early');
    await expect(troy.getByRole('button', { name: /^Tail/ })).toBeEnabled();
    await expect(troy.locator('[data-locked="true"]')).toHaveCount(0);
    // The week picker still reaches last week.
    await page.getByLabel('Competition week').selectOption('2026:5');
    await expect(page.locator('.social-section-heading p').first()).toContainText('2026, Week 5');
    await expect(cards).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});
