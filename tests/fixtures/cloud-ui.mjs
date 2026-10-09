import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore, seed } from '../../server/store.mjs';
import { withSyntheticLocalQuotes } from './local-quotes.mjs';
import { handleSocial } from '../../cloud/social.mjs';
import { emptySocialState } from '../../shared/social-bets.mjs';

// Real built chunks, synthetic account and slate. No hosted reads or writes.
export const test = base.extend({
  fixture: async ({ page, baseURL }, use) => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-chunks-'));
    const file = path.join(temporary, 'state.json');
    const now = Date.parse('2026-10-08T16:00:00Z');
    fs.writeFileSync(file, JSON.stringify(withSyntheticLocalQuotes(seed(), now)));
    const store = createStore(file, () => now);
    const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'player@example.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-10-08T00:00:00Z' };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expires })).toString('base64url'), 'test-signature'].join('.');
    const session = { access_token: token, refresh_token: 'chunk_test_refresh', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
    const fixture = { chunks: [], apiRequests: [], unexpected: [], state: store.view('troy', 'guess_spread') };
    page.on('request', request => { const url = new URL(request.url()); if (url.pathname.endsWith('.js')) fixture.chunks.push(url.pathname); });
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      if (url.origin !== 'https://gtl-frontend-check.supabase.co') { fixture.unexpected.push(url.origin); return route.abort(); }
      const reply = body => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (url.pathname === '/auth/v1/token') return reply(session);
      if (url.pathname === '/auth/v1/user') return reply(user);
      if (url.pathname === '/auth/v1/logout') return reply({});
      // D-21 community routes are not part of this fixture; answer as an undeployed function so the lobby falls back to My games.
      if (url.pathname.includes('/gtl-api/community/')) return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: 'Not found.' }) });
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      expect(request.headers().apikey).toBe('sb_publishable_frontend_test_only');
      fixture.apiRequests.push({ pathname: url.pathname, method: request.method() });
      if (url.pathname === '/functions/v1/gtl-api/lobby' && request.method() === 'GET') return reply({ profile: { id: user.id, displayName: 'Troy Jun' }, leagues: [{ id: 'sean-troy-luke', name: 'Triple Threat', format: 'triple-threat', role: 'player', memberCount: 3, maxMembers: 3, practice: false }], pendingInvites: [] });
      if (url.pathname === '/functions/v1/gtl-api/state' && request.method() === 'GET') {
        expect(url.searchParams.get('league')).toBe('sean-troy-luke');
        return reply({ ...store.view('troy', url.searchParams.get('mode') || 'guess_spread'), localOnly: false });
      }
      if (url.pathname === '/functions/v1/gtl-api/social/read') {
        expect(request.method()).toBe('POST'); expect(url.search).toBe('');
        const body = request.postDataJSON(), { season, week } = fixture.state.league;
        expect(body.season).toBe(season); expect(body.week).toBe(week);
        if (body.filters) expect(body.filters).toEqual({ following: false, counts: 'all', includeParlays: true, includeTailed: true, includeTracked: true });
        return reply(await handleSocial({ route: '/social/read', body, user, service: { rpc: async (name, args) => {
          expect(name).toBe('gtl_read_social'); expect(args).toEqual({ p_user: user.id, p_season: season, p_week: week, p_all: false });
          return { season, week, profiles: [{ id: user.id, displayName: 'Troy Jun' }], availableWeeks: [{ season, week }], following: [], weeks: [{ season, week, revision: 0, state: emptySocialState(), games: fixture.state.games }] };
        } } }));
      }
      fixture.unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    });
    try { await use(fixture); expect(fixture.unexpected).toEqual([]); }
    finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  },
});

export async function signIn(page) {
  await page.getByLabel('Email', { exact: true }).fill('player@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
}
