import { test as base, expect } from '@playwright/test';
import { seed } from '../../server/store.mjs';
import { createEngine } from '../../server/engine.mjs';
import { applyProvisionalAnalysisView } from '../../cloud/total-analysis-view.mjs';
import { emptySocialRead } from './social-read-fixture.mjs';
import { picker, pickSpread, pickTotal, expectPick, expectPickEnabled, spreadText, totalText } from '../chip-entry.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';
const MATCHUPS = [['TB', 'DAL'], ['PHI', 'JAX'], ['CIN', 'MIA']];

const accountId = '11111111-1111-4111-8111-111111111111';
const duelId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const inviteToken = 'a'.repeat(64);
const inviteId = '44444444-4444-4444-8444-444444444444';
const expiration = '2026-10-15T16:00:00Z';
const makeEngine = (id, name, practice = false, format = 'duel') => {
  const state = seed();
  state.games = state.games.slice(0, 3);
  state.league = { ...state.league, id, name, format, practice, maxMembers: format === 'duel' ? 2 : 20, roster: [{ id: accountId, name: 'Avery Chen', role: 'Commissioner' }, { id: 'other-player', name: 'Jordan Lee', role: 'Player' }] };
  state.ballots = {}; state.bets = {}; state.history = []; state.audit = []; state.results = {}; state.archivedCount = 0;
  return createEngine(state, { clock: () => Date.parse('2026-10-08T16:00:00Z') });
};

const test = base.extend({
  hub: async ({ page, baseURL }, use) => {
    const hub = { profile: '', leagues: [], pending: [], invitations: [], requests: [], errors: [], resets: 0, resends: 0, signups: 0, passwordUpdates: 0, failCreateOnce: false, failAcceptance: false, revisions: {}, weeklyEnabled: false, weeklyRevision: 0, weeklyBallots: {}, weeklyBets: {}, selectionOriginPractice: false, eligibilityRulings: {}, oddsResponses: [], marketOverlay: null, marketOverlayMode: 'guess_spread', benchmarkViews: {}, freezeResponses: [], serverNow: null, oddsSchedule: null };
    hub.engines = { [duelId]: makeEngine(duelId, 'Weekend duel', true), [otherId]: makeEngine(otherId, 'Office rivalry') };
    function engineFor(id) {
      const engine = hub.engines[id];
      if (!engine || !hub.weeklyEnabled) return engine;
      const snapshot = engine.snapshot();
      snapshot.ballots[accountId] = structuredClone(hub.weeklyBallots);
      snapshot.bets[accountId] = structuredClone(hub.weeklyBets);
      return createEngine(snapshot, { clock: () => Date.parse('2026-10-08T16:00:00Z') });
    }
    function responseView(engine, id, mode) {
      const view = engine.view(accountId, mode), revision = hub.revisions[id] || 0;
      if (view.revealed && mode === hub.marketOverlayMode && hub.marketOverlay) {
        Object.assign(view, hub.marketOverlay);
        view.games = engine.view(accountId, mode).games.map(game => ({ ...game, analysisMarket: hub.marketOverlay.analysisMarkets?.[game.id] || null, lastMarketReference: hub.marketOverlay.lastMarketReferences?.[game.id] || null }));
      }
      if(hub.serverNow)view.now=hub.serverNow;
      if(hub.scoreComparisonHistory&&view.revealed)view.scoreComparisonHistory=hub.scoreComparisonHistory;
      if(hub.decisionAnalysis&&view.revealed)view.games=view.games.map(game=>({...game,decisionAnalysis:hub.decisionAnalysis[game.id]}));
      if(hub.viewPatch)Object.assign(view,hub.viewPatch(view));
      if(hub.quoteReceipts&&mode==='betting_challenge') view.games=view.games.map(game=>({...game,quoteReceipts:hub.quoteReceipts[game.id]||[]}));
      if(view.revealed&&mode!=='betting_challenge'&&hub.oddsSchedule)view.oddsSchedule=hub.oddsSchedule;
      const benchmark=hub.benchmarkViews[id];
      // Explicit archived-policy fixtures keep compatibility coverage. Ordinary
      // account/entry fixtures use the engine's current submission-time policy.
      if (benchmark || hub.marketOverlay?.marketLineHistory || hub.scoreComparisonHistory) view.scoringPolicy = 'legacy-common-reference';
      if(view.revealed&&mode==='guess_spread'&&benchmark){
        view.scoringBenchmark=benchmark.scoringBenchmark;view.score=benchmark.score;
        view.games=view.games.map(game=>({...game,...benchmark.gameValues?.[game.id]}));
        view.standings=view.standings.map(player=>({...player,...benchmark.standings?.[player.id]}));
      }
      if (!hub.weeklyEnabled) return applyProvisionalAnalysisView({ ...view, localOnly: false, revision }, Date.parse(view.now));
      for (const market of ['guess_spread','guess_total']) view.statuses[market] = { ...view.statuses[market], originPractice: !!hub.weeklyBallots[market]?.originPractice, officialEligible: !view.league.practice && !hub.weeklyBallots[market]?.originPractice };
      for (const market of ['guess_spread','guess_total']) if (hub.eligibilityRulings[id]?.[market]?.eligible) Object.assign(view.statuses[market], { officialEligible: !view.league.practice, eligibilityRuling: hub.eligibilityRulings[id][market] });
      const eligibilityRuling = hub.eligibilityRulings[id]?.[mode];
      view.standings = view.standings.map(player => ({ ...player, officialEligible: !view.league.practice && eligibilityRuling?.eligible === true || !view.league.practice && (player.id !== accountId || !(mode === 'betting_challenge' ? hub.selectionOriginPractice : hub.weeklyBallots[mode]?.originPractice)) }));
      return applyProvisionalAnalysisView({ ...view, localOnly: false, ballotScope: 'weekly', selectionScope: 'weekly', selectionOriginPractice: hub.selectionOriginPractice, weeklyRevision: hub.weeklyRevision, predictionRevision: hub.weeklyRevision, leagueRevision: revision, revision: hub.weeklyRevision, eligibilityRuling, officialEligible: !view.league.practice && eligibilityRuling?.eligible === true || !view.league.practice && !(mode==='betting_challenge'?hub.selectionOriginPractice:hub.weeklyBallots[mode]?.originPractice) }, Date.parse(view.now));
    }
    const user = { id: accountId, aud: 'authenticated', role: 'authenticated', email: 'avery@example.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-10-08T00:00:00Z' };
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: accountId, aud: 'authenticated', exp })).toString('base64url')}.test-signature`;
    hub.recoveryFragment = `#access_token=${token}&refresh_token=local_test_refresh&expires_in=3600&token_type=bearer&type=recovery`;
    const session = { access_token: token, refresh_token: 'local_test_refresh', expires_in: 3600, expires_at: exp, token_type: 'bearer', user };
    const summary = (id, name, practice = false) => ({ id, name, format: 'duel', role: 'commissioner', memberCount: 2, maxMembers: 2, practice });
    hub.addGame = (id = duelId, name = 'Weekend duel', practice = true) => hub.leagues.push(summary(id, name, practice));
    page.on('pageerror', error => hub.errors.push(error.message));
    await page.addInitScript(() => { window.testCopiedLink = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.testCopiedLink = value; } } }); });
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      if (isWebfont(url)) return route.abort(); if (url.origin !== 'https://gtl-frontend-check.supabase.co') { hub.errors.push(`Unexpected external request: ${url.origin}`); return route.abort(); }
      const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (url.pathname === '/auth/v1/token') return reply(200, session);
      if (url.pathname === '/auth/v1/signup') { hub.signups++; return reply(200, { user, session: null }); }
      if (url.pathname === '/auth/v1/logout') return reply(200, {});
      if (url.pathname === '/auth/v1/recover') { hub.resets++; return reply(200, {}); }
      if (url.pathname === '/auth/v1/resend') { hub.resends++; return reply(200, {}); }
      if (url.pathname === '/auth/v1/user') { if (request.method() === 'PUT') hub.passwordUpdates++; return reply(200, user); }
      // D-21 community routes are not part of these fixtures; answer as an undeployed function.
      if (url.pathname.includes('/gtl-api/community/')) return reply(404, { error: 'Not found.' });
      const endpoint = url.pathname.replace('/functions/v1/gtl-api/', '');
      const body = request.method() === 'POST' ? request.postDataJSON() : null;
      const entry = { endpoint, query: url.search, body, referer: request.headers().referer };
      hub.requests.push(entry);
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      expect(url.searchParams.has('player')).toBe(false);
      expect(url.searchParams.has('token')).toBe(false);
      if (['profile', 'leagues', 'invites', 'invite/accept', 'invite/revoke'].includes(endpoint) && body) expect(body).not.toHaveProperty('revision');
      if (endpoint === 'social/read') return reply(200, await emptySocialRead(request, accountId,
        Object.values(hub.engines).map(engine => { const state = engine.snapshot(); return { season: state.league.season, week: state.league.week, games: state.games }; })));
      if (endpoint === 'lobby') return reply(200, { profile: { id: accountId, displayName: hub.profile }, leagues: hub.leagues, pendingInvites: hub.pending });
      if (endpoint === 'profile') { hub.profile = body.displayName; return reply(200, { profile: { id: accountId, displayName: hub.profile } }); }
      if (endpoint === 'leagues') {
        expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
        if (!hub.leagues.some(league => league.id === duelId)) {
          hub.leagues.push({ ...summary(duelId, body.name, body.practice), format: body.format, memberCount: 1 });
          hub.engines[duelId] = makeEngine(duelId, body.name, body.practice, body.format);
        }
        if (hub.failCreateOnce) { hub.failCreateOnce = false; return reply(503, { error: 'Temporary test connection failure. Try creating again.' }); }
        return reply(200, { leagueId: duelId });
      }
      if (endpoint === 'invites') {
        expect(url.searchParams.get('league')).toBe(duelId);
        if (!body) return reply(200, { invites: hub.invitations });
        expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
        hub.invitations.push({ id: inviteId, email: body.email, status: 'pending', expiresAt: expiration, createdAt: '2026-10-08T16:00:00Z' });
        return reply(200, { inviteId, inviteUrl: `https://guess-the-line.pages.dev/#invite=${inviteToken}`, expiresAt: expiration, delivery: 'link_only' });
      }
      if (endpoint === 'invite/revoke') { hub.invitations.find(invite => invite.id === body.inviteId).status = 'revoked'; return reply(200, { revoked: true }); }
      if (endpoint === 'invite/accept') {
        expect(Object.keys(body)).toHaveLength(1);
        if (hub.failAcceptance) return reply(409, { error: 'This game is full. Ask the host for a new game.' });
        if (!hub.leagues.length) hub.addGame();
        hub.pending = []; return reply(200, { leagueId: duelId });
      }
      if(endpoint==='benchmark/freeze'){
        expect(Object.keys(body).sort()).toEqual(['actualKickoff','requestId','sourceURL']);expect(url.searchParams.get('league')).toBe(duelId);
        const result=hub.freezeResponses.shift();if(!result){hub.errors.push('Unexpected freeze request');return reply(500,{error:'No mock result'});}
        if(result.body.status==='frozen')Object.assign(hub.benchmarkViews[duelId].scoringBenchmark,{status:'frozen',actualKickoff:body.actualKickoff,stale:false});
        return reply(result.http||200,{requestId:body.requestId,...result.body});
      }
      if (endpoint === 'odds/preflight' || endpoint === 'odds/collect') {
        expect(Object.keys(body)).toEqual(['requestId']); expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
        expect(url.search).toBe('');
        const result = hub.oddsResponses.shift();
        if (!result) { hub.errors.push('Unexpected manual provider request'); return reply(500, { error: 'No mock result' }); }
        return reply(result.http || 200, { requestId: body.requestId, operation: endpoint.split('/')[1], ...result.body });
      }
      if (endpoint === 'bet') {
        const id = url.searchParams.get('league'), engine = engineFor(id);
        expect(body.revision).toBe(hub.weeklyRevision);
        expect(url.searchParams.has('mode')).toBe(false);
        try {
          engine.saveBet(accountId, body); hub.engines[id] = engine;
          hub.weeklyBets = engine.snapshot().bets[accountId]; hub.selectionOriginPractice ||= engine.snapshot().league.practice || !!hub.weeklyBallots[body.market === 'total' ? 'guess_total' : 'guess_spread']?.originPractice; hub.weeklyRevision++;
          return reply(200, responseView(engine, id, 'betting_challenge'));
        } catch(error) { return reply(400, {error: error.message}); }
      }
      if (endpoint === 'ballot') {
        const id = url.searchParams.get('league'), engine = engineFor(id), mode = url.searchParams.get('mode');
        expect(body.revision).toBe(hub.weeklyEnabled ? hub.weeklyRevision : hub.revisions[id] || 0);
        try {
          engine.saveBallot(accountId, mode, body.picks, body.submit);
          hub.engines[id] = engine;
          if(hub.weeklyEnabled){const prior=hub.weeklyBallots[mode];hub.weeklyBallots=engine.snapshot().ballots[accountId];hub.weeklyBallots[mode].originPractice=prior?.originPractice || engine.snapshot().league.practice;hub.weeklyRevision++}else hub.revisions[id] = (hub.revisions[id] || 0) + 1;
          return reply(200, responseView(engine, id, mode));
        } catch (error) { return reply(400, { error: error.message }); }
      }
      if (endpoint === 'state') {
        const engine = engineFor(url.searchParams.get('league'));
        if (!engine) return reply(403, { error: 'This account cannot access that game.' });
        return reply(200, responseView(engine, url.searchParams.get('league'), url.searchParams.get('mode') || 'guess_spread'));
      }
      hub.errors.push(`Unexpected endpoint: ${endpoint}`); return reply(404, { error: 'Unknown test endpoint' });
    });
    await use(hub);
    expect(hub.errors).toEqual([]);
  },
});

async function signIn(page) {
  await page.getByLabel('Email', { exact: true }).fill('avery@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.locator('.auth-form').getByRole('button', { name: 'Sign in', exact: true }).click();
}

for (const width of [320, 390]) test(`an invitation survives signup and refresh without leaving the fragment in requests at ${width}px`, async ({ page, hub }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`/#invite=${inviteToken}`);
  await expect(page.getByText('Your invitation is saved in this tab.', { exact: false })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await page.locator('.auth-tabs').getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Email', { exact: true }).fill('avery@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  expect(hub.signups).toBe(0);
  await page.locator('.auth-form').getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Check your email');
  await page.reload(); await signIn(page);
  // Persona audit #29: the name step is the whole screen until a display name is saved; the invitation waits behind it.
  await expect(page.getByRole('heading', { name: 'First, what should we call you?' })).toBeVisible();
  await expect(page.getByText('Your invitation is saved. Save a display name to accept it.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Accept invitation', exact: true })).toHaveCount(0);
  await page.getByLabel('Your display name').fill('Avery Chen');
  await page.getByRole('button', { name: 'Save display name' }).click();
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Your display name has been saved. Playing as Avery Chen.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept invitation', exact: true })).toBeEnabled();
  expect(hub.requests.filter(request => request.endpoint === 'invite/accept')).toHaveLength(0);
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.' })).toBeVisible();
  await expect(page.getByText('Practice game · No official scores')).toBeVisible();
  await expect(page.locator('.visual-scoreboard .visual-score-footer')).toContainText('Practice comparison · No official scores');
  await expect(page.locator('.visual-scoreboard .visual-score-footer')).not.toContainText('Official benchmark pending');
  await expect(page.locator('.topbar-location')).toContainText('Weekend duel');
  await expect(page.locator('main')).not.toContainText('Sean');
  await expect(page.locator('.visual-actions .game-option').first()).toContainText('0/3 entered');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem('gtl.pendingInvitation'))).toBeNull();
  const accepted = hub.requests.find(request => request.endpoint === 'invite/accept');
  expect(accepted.body).toEqual({ token: inviteToken });
  expect(accepted.query).toBe(''); expect(accepted.referer).toBeUndefined();
  await page.screenshot({ path: `.local/previews/onboarding-game-${width}.png`, fullPage: true });
});

test('new Duel creation retries the same intent and prepares a recipient-bound share link with revoke controls', async ({ page, hub }) => {
  hub.profile = 'Avery Chen'; hub.failCreateOnce = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await signIn(page);
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Game name').fill('Weekend duel');
  await page.getByLabel('Make this a practice game', { exact: false }).check();
  await page.getByRole('button', { name: 'Create game', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Temporary test connection failure');
  await page.getByRole('button', { name: 'Create game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.' })).toBeVisible();
  const attempts = hub.requests.filter(request => request.endpoint === 'leagues');
  expect(attempts).toHaveLength(2); expect(attempts[0].body.requestId).toBe(attempts[1].body.requestId);
  expect(attempts[0].body).toMatchObject({ name: 'Weekend duel', format: 'duel', practice: true });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Invite players', exact: true }).click();
  await page.getByLabel('Their email address').fill('friend@example.test');
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  await expect(page.getByText('Email delivery is not enabled.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => window.testCopiedLink)).toBe('');
  await page.getByRole('button', { name: 'Copy invitation link' }).click();
  await expect(page.getByRole('status')).toContainText('Invitation link copied');
  expect(await page.evaluate(() => window.testCopiedLink)).toBe(`https://guess-the-line.pages.dev/#invite=${inviteToken}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.local/previews/onboarding-invite-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Invitation revoked');
  await expect(page.getByLabel('Invitation link', { exact: true })).toHaveCount(0);
  expect(hub.resets + hub.resends + hub.signups).toBe(0);
});

test('pending email invitations show full-game errors honestly and switching keeps games separate', async ({ page, hub }) => {
  hub.profile = 'Avery Chen'; hub.failAcceptance = true;
  hub.pending = [{ id: inviteId, leagueId: duelId, leagueName: 'Weekend duel', format: 'duel', inviterName: 'Jordan Lee', expiresAt: expiration }];
  await page.goto('/'); await signIn(page);
  await page.getByRole('button', { name: 'Join game', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This game is full');
  await expect(page.getByRole('alert')).not.toContainText('Saved data changed');
  expect(hub.requests.find(request => request.endpoint === 'invite/accept').body).toEqual({ inviteId });
  hub.failAcceptance = false; hub.addGame(otherId, 'Office rivalry', false); hub.addGame();
  await page.getByRole('button', { name: 'Join game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.' })).toBeVisible();
  await page.getByLabel('Current game').selectOption(otherId);
  await expect(page.locator('.topbar-location')).toContainText('Office rivalry');
  await expect(page.locator('.visual-scoreboard .visual-score-footer')).toContainText('Each guess uses its saved scoring reference');
  await expect(page.getByText('Practice game · No official scores')).toHaveCount(0);
  await page.getByRole('button', { name: 'My games', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await expect(page.locator('.hub-game')).toHaveCount(2);
  expect(hub.requests.filter(request => request.endpoint === 'state').map(request => new URLSearchParams(request.query).get('league'))).toContain(otherId);
});

test('Group creation stays separate from practice and shows its own roster and slate sizes', async ({ page, hub }) => {
  hub.profile = 'Avery Chen';
  await page.goto('/'); await signIn(page);
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByLabel('Game name').fill('Sunday group');
  await page.getByRole('radio', { name: 'Group Bring a group of friends' }).check();
  await expect(page.getByLabel('Make this a practice game', { exact: false })).not.toBeChecked();
  await page.getByRole('button', { name: 'Create game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.' })).toBeVisible();
  expect(hub.requests.find(request => request.endpoint === 'leagues').body).toMatchObject({ name: 'Sunday group', format: 'group', practice: false });
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await expect(page.locator('.stat').filter({ hasText: 'League format' })).toContainText('Group');
  await expect(page.locator('.stat').filter({ hasText: 'Available accuracy points' })).toContainText('30');
  await expect(page.locator('main')).not.toContainText('Sean');
  await expect(page.getByText('Practice game · No official scores')).toHaveCount(0);
});

test('password help only requests mail after a user action and recovery changes the password explicitly', async ({ page, hub }) => {
  hub.profile = 'Avery Chen';
  await page.goto('/');
  expect(hub.resets + hub.resends).toBe(0);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email', { exact: true }).fill('avery@example.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('password reset link');
  expect(hub.resets).toBe(1);
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await page.getByRole('button', { name: 'Resend confirmation email' }).click();
  await expect(page.getByRole('status')).toContainText('confirmation link');
  expect(hub.resends).toBe(1);
  // A real recovery email visits the provider before redirecting to this app.
  await page.goto('about:blank');
  await page.goto(`/${hub.recoveryFragment}`);
  await expect(page.getByRole('heading', { name: 'Choose a new password.' })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('new-local-test-password');
  await page.getByLabel('Confirm new password', { exact: true }).fill('different-local-password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('alert')).toContainText('passwords do not match');
  expect(hub.passwordUpdates).toBe(0);
  await page.getByLabel('Confirm new password', { exact: true }).fill('new-local-test-password');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  expect(hub.passwordUpdates).toBe(1);
});

for (const [mode, width] of [['guess_spread', 320], ['guess_total', 390]]) test(`${mode} final review is explicit, editable until deadline, and independent at ${width}px`, async ({ page, hub }) => {
  const total = mode === 'guess_total', label = total ? 'Guess the Total' : 'Guess the Spread', otherLabel = total ? 'Guess the Spread' : 'Guess the Total';
  hub.profile = 'Avery Chen'; hub.addGame();
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/'); await signIn(page);
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  async function picks() { await page.getByRole('button', { name: 'Open navigation', exact: true }).click(); await page.getByRole('button', { name: 'My picks', exact: true }).click(); }
  await picks();
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(picker(page, total ? 'TB at DAL combined points' : 'TB at DAL home spread')).toBeVisible();
  await expect(page.locator('.hidden-value')).toHaveCount(3);
  const values = total ? ['44.5', '48', '46'] : ['-3.5', '2', '-1'];
  const entryLabel = ([away, home]) => `${away} at ${home} ${total ? 'combined points' : 'home spread'}`;
  for (const [index, matchup] of MATCHUPS.entries()) await (total ? pickTotal : pickSpread)(page, entryLabel(matchup), values[index]);
  await page.getByRole('button', { name: 'Review & submit', exact: true }).click();
  const review = page.getByRole('dialog', { name: `Submit your ${total ? 'total' : 'spread'} ballot?` });
  await expect(review).toBeVisible();
  await expect(review).toContainText('You can edit until the deadline');
  await expect(review.getByRole('listitem')).toHaveCount(3);
  await expect(review.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  expect(hub.requests.filter(request => request.endpoint === 'ballot')).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.local/previews/final-review-${width}.png`, fullPage: false });
  await review.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.locator('.hidden-value')).toHaveCount(3);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('saved to your account');
  await page.getByRole('button', { name: 'Review & submit', exact: true }).click();
  await review.getByRole('button', { name: 'Submit & reveal analysis' }).click();
  await expect(page.getByRole('heading', { name: `Your ${total ? 'total' : 'spread'} analysis`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.data-connections')).not.toHaveAttribute('open');
  await page.locator('.data-connections > summary').click();
  await expect(page.locator('.analysis-source')).toHaveCount(5);
  await expect(page.locator('.analysis-source .badge')).toHaveText(Array(5).fill('Unavailable'));
  await expect(page.locator('.analysis-sources')).toContainText('not the entire market');
  await expect(page.locator('.analysis-sources')).toContainText('Not connected');
  await expect(page.locator('main')).toContainText('not positive expected value');
  expect(hub.requests.filter(request => request.endpoint === 'ballot').map(request => request.body.submit)).toEqual([false, true]);
  expect(hub.engines[duelId].view(accountId, mode).lockReason).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path: `.local/previews/submitted-analysis-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: otherLabel, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your ballot comes first' })).toBeVisible();
  await expect(page.locator('.analysis-source')).toHaveCount(0);
  await page.getByRole('button', { name: 'Complete your ballot' }).click();
  await expectPickEnabled(page, `TB at DAL ${total ? 'home spread' : 'combined points'}`);
  await expect(page.locator('.hidden-value')).toHaveCount(3);
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByText('SUBMITTED · EDITABLE', { exact: true })).toBeVisible();
  await expectPickEnabled(page, entryLabel(MATCHUPS[0]));
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review & submit', exact: true })).toHaveCount(0);
  await page.reload(); await picks();
  await page.getByRole('button', { name: label, exact: true }).click();
  await expectPickEnabled(page, entryLabel(MATCHUPS[0]));
  await expectPick(page, entryLabel(MATCHUPS[0]), total ? totalText(values[0]) : spreadText('TB', 'DAL', values[0]));
});

for (const width of [320, 390]) test(`Light and System appearance persist across account and game screens at ${width}px`, async ({ page, hub }) => {
  hub.profile = 'Avery Chen'; hub.addGame();
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Color theme').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByText('Saved on this device, not your account.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: `.local/previews/light-login-${width}.png`, fullPage: true });
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await expect(page.getByLabel('Color theme')).toHaveValue('light');
  await page.screenshot({ animations: 'disabled', path: `.local/previews/light-games-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Start a new game' })).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.getByLabel('Game name').fill('Appearance preview');
  await page.screenshot({ animations: 'disabled', path: `.local/previews/light-dialog-${width}.png`, fullPage: false });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.locator('.panel').first().evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.screenshot({ animations: 'disabled', path: `.local/previews/light-dashboard-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Settings & setup', exact: true }).click();
  await expect(page.getByLabel('Color theme')).toHaveValue('light');
  await page.getByLabel('Color theme').selectOption('system');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Settings & setup', exact: true }).click();
  await page.getByLabel('Color theme').selectOption('light');
  await expect(page.locator('.sidebar-overlay')).toHaveCount(0);
  await page.screenshot({ animations: 'disabled', path: `.local/previews/light-settings-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Color theme')).toHaveValue('light');
  await page.reload();
  await expect(page.getByLabel('Color theme')).toHaveValue('light');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('one weekly draft and submitted ballot follow the player across groups while comparisons stay scoped', async ({ page, hub }) => {
  hub.profile = 'Avery Chen'; hub.weeklyEnabled = true;
  hub.addGame(); hub.addGame(otherId, 'Office rivalry', false);
  const other = hub.engines[otherId].snapshot(); other.league.roster[1].name = 'Morgan Reyes'; other.league.roster[1].id = 'office-player';
  hub.engines[otherId] = createEngine(other, { clock: () => Date.parse('2026-10-08T16:00:00Z') });
  hub.revisions[duelId] = 9; hub.revisions[otherId] = 17;
  await page.goto('/'); await signIn(page);
  await page.locator('.hub-game').filter({ hasText: 'Weekend duel' }).getByRole('button', { name: 'Open game' }).click();
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await expect(page.getByText('One weekly spread ballot across all groups.')).toBeVisible();
  await pickSpread(page, 'TB at DAL home spread', '-3.5');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('saved to your account');
  await page.getByLabel('Current game').selectOption(otherId);
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await expectPick(page, 'TB at DAL home spread', 'DAL −3.5');
  await expect(page.locator('.hidden-value')).toHaveCount(3);
  await pickSpread(page, 'PHI at JAX home spread', '2');
  await pickSpread(page, 'CIN at MIA home spread', '-1');
  await page.getByRole('button', { name: 'Review & submit', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('shared across every group');
  await page.getByRole('button', { name: 'Submit & reveal analysis' }).click();
  await expect(page.getByRole('heading', { name: 'Your spread analysis', exact: true })).toBeVisible();
  await expect(page.getByText('Practice-origin weekly ballot · No official scores')).toBeVisible();
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await expect(page.locator('.opponent-picks').first()).toContainText('Morgan');
  await expect(page.locator('.opponent-picks').first()).not.toContainText('Jordan');
  await page.getByLabel('Current game').selectOption(duelId);
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await expectPick(page, 'TB at DAL home spread', 'DAL −3.5');
  await expectPickEnabled(page, 'TB at DAL home spread');
  await expect(page.locator('.opponent-picks').first()).toContainText('Jordan');
  await expect(page.locator('.opponent-picks').first()).not.toContainText('Morgan');
  await page.getByRole('button', { name: 'Guess the Total', exact: true }).click();
  await expectPickEnabled(page, 'TB at DAL combined points');
  await expect(page.locator('.hidden-value')).toHaveCount(3);
  expect(hub.requests.filter(request => request.endpoint === 'ballot').map(request => request.body.revision)).toEqual([0,1]);
  // A standard group must inherit the submitted matching ballot's practice history.
  await page.getByLabel('Current game').selectOption(otherId);
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await page.getByRole('button', { name: 'Betting Challenge', exact: true }).click();
  await page.getByRole('button', { name: 'Record selection', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('reused across all your groups');
  await page.getByLabel('Selected team’s spread').fill('-3');
  await page.getByLabel('American odds').fill('-110');
  await page.getByLabel('Quote source').fill('Verified test fixture, not live odds');
  const quotedAt = '2026-10-08T15:59:00.000Z';
  const localTime = await page.evaluate(value => {const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)},quotedAt);
  await page.getByLabel('Quote timestamp', { exact: false }).fill(localTime);
  await page.getByRole('dialog').getByRole('button', { name: 'Review selection', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm immutable selection', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.recorded-bet')).toHaveCount(1);
  const recorded = await page.locator('.recorded-bet').innerText();
  await expect(page.getByText('Practice-origin weekly selections · No official scores')).toBeVisible();
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await expect(page.getByLabel('Avery Chen: practice comparison, not eligible for official scoring')).toBeVisible();
  await expect(page.getByLabel('Morgan Reyes: practice comparison, not eligible for official scoring')).toHaveCount(0);
  await page.getByLabel('Current game').selectOption(duelId);
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await page.getByRole('button', { name: 'Betting Challenge', exact: true }).click();
  await expect(page.locator('.recorded-bet')).toHaveText(recorded, { useInnerText: true });
  await expect(page.getByText('Practice game · No official scores')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record selection', exact: true })).toHaveCount(2);
  expect(hub.requests.find(request => request.endpoint === 'bet').body).toMatchObject({ revision: 2, market: 'spread', side: 'home', line: -3, odds: -110, quotedAt });

  await page.reload(); await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await expectPickEnabled(page, 'TB at DAL home spread');
  await expectPick(page, 'TB at DAL home spread', 'DAL −3.5');
});

for (const [mode, width] of [['guess_spread', 320], ['guess_total', 390]]) test(`comparison reveals only submitted ${mode} picks and preserves its market-history gate at ${width}px`, async ({ page, hub }) => {
  hub.profile = 'Avery Chen'; hub.addGame();
  const state = hub.engines[duelId].snapshot();
  state.history = [
    { id: 'fixture-a', quotedAt: '2026-10-08T14:00:00Z', capturedAt: '2026-10-08T14:01:00Z', timeBasis: 'publication', source: 'Browser fixture, not live odds', sourceUrl: 'https://source.example.test/a', games: { 'TB-DAL': { value: 0 }, 'PHI-JAX': { value: 2 } } },
    { id: 'fixture-b', quotedAt: '2026-10-08T15:00:00Z', capturedAt: '2026-10-08T15:01:00Z', timeBasis: 'capture', source: 'Browser fixture, not live odds', sourceUrl: 'https://source.example.test/b', games: { 'TB-DAL': { value: -.5 }, 'PHI-JAX': { value: 2.5 } } },
  ];
  const engine = createEngine(state, { clock: () => Date.parse('2026-10-08T16:00:00Z') });
  const total = mode === 'guess_total';
  const own = { 'TB-DAL': total ? 44.5 : 0, 'PHI-JAX': total ? 0 : 2, 'CIN-MIA': total ? 46 : -1 };
  const opponent = { 'TB-DAL': total ? 48 : 8, 'PHI-JAX': total ? 47 : 7, 'CIN-MIA': total ? 46 : 6 };
  engine.saveBallot(accountId, mode, own, true);
  engine.saveBallot('other-player', mode, opponent, false);
  hub.engines[duelId] = engine;
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/'); await signIn(page);
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  if (total) await page.locator('.dashboard-market-tabs').getByRole('button', { name: 'Total', exact: true }).click();
  await page.locator('.heading-actions').getByRole('button', { name: 'Compare picks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your picks, side by side.' })).toBeVisible();
  const first = page.getByRole('article', { name: 'TB at DAL predictions' });
  await expect(first.locator('dd')).toHaveText([total ? '44.5' : 'PK', '—']);
  await expect(first).toContainText('Not submitted');
  engine.saveBallot('other-player', mode, opponent, true);
  await page.getByRole('button', { name: 'Refresh picks', exact: true }).click();
  await expect(first.locator('dd')).toHaveText([total ? '44.5' : 'PK', total ? '48' : '+8']);
  await expect(first).not.toContainText('Not submitted');
  await expect(page.locator('.comparison-next')).toContainText('Review your guesses');
  await expect(first.getByRole('region', { name: 'Current consensus TB at DAL' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.local/previews/compare-picks-${width}.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'View market movement' }).click();
  if (total) {
    await expect(page.getByRole('heading', { name: 'Line movement is not available' })).toBeVisible();
    await expect(page.locator('.line-chart svg')).toHaveCount(0);
  } else {
    await expect(page.locator('.line-chart svg')).toHaveAccessibleName(/PK at .*−0.5 at/);
    await page.getByLabel('Matchup', { exact: true }).selectOption('PHI-JAX');
    await expect(page.locator('.line-chart svg')).toHaveAccessibleName(/\+2 at .*\+2.5 at/);
    await page.getByText('View 2 recorded source values', { exact: true }).click();
    await expect(page.locator('.line-source-values')).toContainText('Browser fixture, not live odds');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '.local/previews/line-movement-320.png', fullPage: true, animations: 'disabled' });
    await page.getByLabel('Matchup', { exact: true }).selectOption('CIN-MIA');
    await expect(page.getByRole('heading', { name: 'Line movement is not available' })).toBeVisible();
  }
  await page.getByRole('button', { name: total ? 'Guess the Spread' : 'Guess the Total', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Submit your ${total ? 'spread' : 'total'} ballot first`, exact: true })).toBeVisible();
  await expect(page.locator('.line-chart svg')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Compare picks', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Submit your ${total ? 'spread' : 'total'} ballot to compare` })).toBeVisible();
  await expect(page.locator('.comparison-mobile')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('a scoped commissioner ruling counts exposed weekly guesses without declaring the benchmark verified', async ({ page, hub }) => {
  hub.profile = 'Avery Chen'; hub.weeklyEnabled = true;
  hub.addGame(duelId, 'Weekend duel', false); hub.addGame(otherId, 'Office rivalry', false);
  hub.engines[duelId] = makeEngine(duelId, 'Weekend duel', false);
  hub.weeklyBallots = {
    guess_spread: { picks: { 'TB-DAL': 0, 'PHI-JAX': 2, 'CIN-MIA': -1 }, submittedAt: '2026-10-08T15:00:00Z', originPractice: true },
    guess_total: { picks: { 'TB-DAL': 44, 'PHI-JAX': 45, 'CIN-MIA': 46 }, submittedAt: '2026-10-08T15:10:00Z', originPractice: true },
  };
  hub.selectionOriginPractice = true;
  const ruling = { eligible: true, reason: 'Prior line exposure accepted for this weekly competition.', recordedAt: '2026-10-08T15:30:00Z' };
  hub.eligibilityRulings[duelId] = { guess_spread: ruling };
  // Canonical ruling metadata can remain attached even when a practice group excludes scoring.
  const practiceId = '55555555-5555-4555-8555-555555555555';
  hub.addGame(practiceId, 'Practice review', true);
  hub.engines[practiceId] = makeEngine(practiceId, 'Practice review', true);
  hub.eligibilityRulings[practiceId] = { guess_spread: ruling };
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/'); await signIn(page);
  await page.locator('.hub-game').filter({ hasText: 'Weekend duel' }).getByRole('button', { name: 'Open game' }).click();
  await expect(page.getByText('Week 5 counts · Commissioner ruling')).toBeVisible();
  await expect(page.locator('.visual-scoreboard .visual-score-footer')).toContainText('Each guess uses its saved scoring reference');
  await expect(page.locator('.practice-banner')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await expect(page.getByLabel('Avery Chen: practice comparison, not eligible for official scoring')).toHaveCount(0);
  await page.getByRole('button', { name: 'Guess the Total', exact: true }).click();
  await expect(page.getByText('Week 5 counts · Commissioner ruling')).toHaveCount(0);
  await expect(page.getByText('Practice-origin weekly ballot · No official scores')).toBeVisible();
  await page.getByRole('button', { name: 'Betting Challenge', exact: true }).click();
  await expect(page.getByText('Week 5 counts · Commissioner ruling')).toHaveCount(0);
  await expect(page.getByText('Practice-origin weekly selections · No official scores')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByLabel('Current game').selectOption(otherId);
  await expect(page.getByText('The weekly huddle.', { exact: true })).toBeVisible();
  await expect(page.getByText('Week 5 counts · Commissioner ruling')).toHaveCount(0);
  await expect(page.getByText('Practice-origin weekly ballot · No official scores')).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByLabel('Current game').selectOption(practiceId);
  await expect(page.getByText('Practice game · No official scores')).toBeVisible();
  await expect(page.getByText('Week 5 counts · Commissioner ruling')).toHaveCount(0);
  expect(hub.requests.some(request => request.endpoint === 'ballot' || request.endpoint === 'bet')).toBe(false);
});


test('manual collection requires an explicit successful quota check, reuses ambiguous requests, and never displays quotes', async ({ page, hub }) => {
  hub.profile = 'Avery Chen'; hub.addGame('sean-troy-luke', 'Triple Threat', false);
  hub.engines['sean-troy-luke'] = makeEngine('sean-troy-luke', 'Triple Threat', false);
  hub.oddsResponses = [
    { body: { status: 'succeeded', matchedEvents: 0, quota: { remaining: null, used: null, last: 0 }, officialVerified: false } },
    { body: { status: 'succeeded', matchedEvents: 3, quota: { remaining: 500, used: 0, last: 0 }, officialVerified: false } },
    { http: 503, body: { error: 'Temporary fixture interruption; retry the saved request.' } },
    { body: { status: 'running', matchedEvents: 0, quota: { remaining: 498, used: 2, last: 2 }, officialVerified: false } },
    { body: { status: 'succeeded', snapshotId: 'synthetic-fixture', matchedEvents: 3, availableQuotes: 0, quota: { remaining: 498, used: 2, last: 2 }, officialVerified: false, games: [{ line: 'PRIVATE-QUOTE-SENTINEL' }] } },
    { body: { status: 'failed', errorCode: 'ODDS_AUTH', quota: { remaining: null, used: null, last: null }, officialVerified: false } },
  ];
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Settings & setup', exact: true }).click();
  const control = page.getByRole('region', { name: 'Manual market connection' });
  const check = control.getByRole('button', { name: 'Check connection (zero-credit)', exact: true });
  const collect = control.getByRole('button', { name: 'Fetch current lines', exact: true });
  await expect(collect).toBeDisabled();
  expect(hub.requests.filter(request => request.endpoint.startsWith('odds/'))).toHaveLength(0);
  await check.click();
  await expect(control.getByRole('alert')).toContainText('measured quota');
  await expect(collect).toBeDisabled();
  await expect(control.locator('dd')).toHaveText(['0', 'Unavailable', '0']);
  await check.click(); await expect(collect).toBeEnabled();
  await expect(control.locator('dd')).toHaveText(['3', '500', '0']);
  await collect.click(); await expect(control.getByRole('alert')).toContainText('Temporary fixture interruption');
  await collect.click(); await expect(control.getByRole('status')).toContainText('Request not completed');
  await collect.click(); await expect(control.getByRole('status')).toContainText('Manual fetch completed');
  await expect(control.locator('dd')).toHaveText(['3', '0', '498', '2']);
  await expect(page.getByText('PRIVATE-QUOTE-SENTINEL', { exact: false })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.local/previews/manual-provider-320.png', fullPage: true, animations: 'disabled' });
  const calls = hub.requests.filter(request => request.endpoint === 'odds/collect');
  expect(calls).toHaveLength(3); expect(new Set(calls.map(request => request.body.requestId)).size).toBe(1);
  await check.click(); await expect(control.getByRole('alert')).toContainText('did not accept');
  await expect(collect).toBeDisabled();
  await expect(control).toContainText('Refresh schedule unavailable');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('manual provider controls are hidden outside the original commissioner account', async ({ page, hub }) => {
  hub.profile = 'Avery Chen'; hub.addGame('sean-troy-luke', 'Triple Threat', false);
  const state = makeEngine('sean-troy-luke', 'Triple Threat').snapshot(); state.league.roster[0].role = 'Player';
  hub.engines['sean-troy-luke'] = createEngine(state);
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await page.getByRole('button', { name: 'Settings & setup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Manual market connection' })).toHaveCount(0);
  expect(hub.requests.filter(request => request.endpoint.startsWith('odds/'))).toHaveLength(0);
});

test('manually collected market medians and history stay separate from scores and from hidden totals', async ({ page, hub }) => {
  hub.profile = 'Avery Chen'; hub.addGame();
  hub.engines[duelId].saveBallot(accountId, 'guess_spread', { 'TB-DAL': 0, 'PHI-JAX': 2, 'CIN-MIA': -1 }, true);
  const timestamp = '2026-10-08T15:59:00Z';
  hub.marketOverlay = {
    marketFeed: { status: 'partial', source: 'The Odds API', collectedAt: timestamp, automatic: false },
    analysisMarkets: { 'TB-DAL': { value: 0, source: 'The Odds API · 3-book median', observedAt: timestamp, collectedAt: timestamp, bookCount: 3, officialVerified: false } },
    marketLineHistory: [
      { id: 'manual-a', quotedAt: '2026-10-08T15:00:00Z', capturedAt: '2026-10-08T15:00:00Z', timeBasis: 'collection', source: 'The Odds API · book median', sourceUrl: 'https://the-odds-api.com/', verified: false, status: 'collected', games: { 'TB-DAL': { value: -1 } } },
      { id: 'manual-b', quotedAt: timestamp, capturedAt: timestamp, timeBasis: 'collection', source: 'The Odds API · book median', sourceUrl: 'https://the-odds-api.com/', verified: false, status: 'collected', games: { 'TB-DAL': { value: 0 } } },
    ],
  };
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await page.getByRole('button', { name: 'Edge board', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Buccaneers' })).toContainText('0 pts');
  await expect(page.getByRole('row').filter({ hasText: 'Buccaneers' })).toContainText('3 books');
  await expect(page.locator('.source-note')).toContainText('Partial collected quotes');
  await expect(page.locator('.source-note')).toContainText('Refresh schedule unavailable');
  await page.getByRole('button', { name: 'History & audit', exact: true }).click();
  await expect(page.locator('.line-chart svg')).toHaveAccessibleName(/collected home spread: −1 at .*PK at/);
  await expect(page.getByText('COLLECTED · UNVERIFIED', { exact: true })).toBeVisible();
  await expect(page.getByText('0 SNAPSHOTS', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Guess the Total', exact: true }).click();
  await expect(page.locator('.line-chart svg')).toHaveCount(0);
  await expect(page.getByText('COLLECTED · UNVERIFIED', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Submit your total ballot first' })).toBeVisible();
});


test('first Total submission immediately opens collected total analysis while Spread stays hidden', async ({ page, hub }) => {
  hub.profile = 'Avery Chen'; hub.addGame(); hub.marketOverlayMode = 'guess_total';
  const timestamp = '2026-10-08T15:59:00Z';
  hub.marketOverlay = {
    marketFeed: { status: 'partial', source: 'The Odds API', collectedAt: timestamp, automatic: false },
    analysisMarkets: { 'TB-DAL': { value: 44.5, source: 'The Odds API · 3-book median', observedAt: timestamp, collectedAt: timestamp, bookCount: 3, officialVerified: false } }, marketLineHistory: [],
  };
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await page.getByRole('button', { name: 'Guess the Total', exact: true }).click();
  await pickTotal(page, 'TB at DAL combined points', '44.5');
  await pickTotal(page, 'PHI at JAX combined points', '45');
  await pickTotal(page, 'CIN at MIA combined points', '46');
  await page.getByRole('button', { name: 'Review & submit', exact: true }).click();
  await page.getByRole('button', { name: 'Submit & reveal analysis', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your total analysis', exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Buccaneers' })).toContainText('0 pts');
  await expect(page.getByRole('row').filter({ hasText: 'Buccaneers' })).toContainText('3 books');
  await expect(page.locator('.source-note')).toContainText('Partial collected quotes');
  await page.getByRole('button', { name: 'Guess the Spread', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your ballot comes first' })).toBeVisible();
  await expect(page.getByText('Partial collected quotes', { exact: false })).toHaveCount(0);
});


test('stale saved references preserve zero ahead of archived markets without claiming a current line or EV', async ({ page, hub }) => {
  hub.profile = 'Avery Chen'; hub.addGame();
  const state = hub.engines[duelId].snapshot();
  state.history = [{ id: 'old-fixture', quotedAt: '2026-10-08T13:00:00Z', capturedAt: '2026-10-08T13:01:00Z', source: 'Older browser fixture', sourceUrl: 'https://source.example.test/old', games: { 'TB-DAL': { value: 9.5 }, 'PHI-JAX': { value: 8 }, 'CIN-MIA': { value: 7 } } }];
  hub.engines[duelId] = createEngine(state, { clock: () => Date.parse('2026-10-08T16:00:00Z') });
  hub.engines[duelId].saveBallot(accountId, 'guess_spread', { 'TB-DAL': 0, 'PHI-JAX': 2, 'CIN-MIA': -1 }, true);
  const timestamp = '2026-10-08T15:00:00Z';
  const saved = { value: 0, source: 'The Odds API · 3-book median', observedAt: timestamp, collectedAt: timestamp, bookCount: 3, officialVerified: false, status: 'stale' };
  hub.marketOverlay = {
    marketFeed: { status: 'partial', source: 'The Odds API', collectedAt: timestamp, automatic: false },
    analysisMarkets: { 'PHI-JAX': { ...saved, value: 2, observedAt: '2026-10-08T15:59:00Z', collectedAt: '2026-10-08T15:59:00Z', status: 'fresh' } },
    lastMarketReferences: { 'TB-DAL': saved, 'PHI-JAX': saved }, marketLineHistory: [],
  };
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await page.getByRole('button', { name: 'Edge board', exact: true }).click();
  const staleRow = page.getByRole('row').filter({ hasText: 'Buccaneers' });
  await expect(staleRow.locator('td').nth(2)).toContainText('Stale saved reference');
  await expect(staleRow.locator('td').nth(2)).toContainText('PK');
  await expect(staleRow.locator('td').nth(2)).toContainText('Observed Oct 8, 8:00 AM PT');
  await expect(staleRow.locator('td').nth(2)).toContainText('Collected Oct 8, 8:00 AM PT');
  await expect(staleRow.locator('td').nth(2)).not.toContainText('9.5');
  await expect(staleRow).toContainText('0 pts');
  const freshRow = page.getByRole('row').filter({ hasText: 'Eagles' });
  await expect(freshRow.locator('td').nth(2)).toContainText('+2');
  await expect(freshRow).not.toContainText('Stale saved reference');
  await expect(page.getByText('They are not current betting lines.', { exact: false })).toBeVisible();
  await expect(page.locator('.callout').getByText('A guess-to-market gap measures disagreement, not positive expected value.', { exact: false })).toBeVisible();
  await expect(page.getByText('No betting recommendation is generated from these gaps.', { exact: false })).toBeVisible();
});


function benchmarkFixture(status='provisional') {
  return { scoringBenchmark: { policyId: 'd09-browser-fixture', leagueId: duelId, season: 2026, week: 5, mode: 'guess_spread', status, source: 'DraftKings / FanDuel / BetMGM median', sourceUrl: 'https://the-odds-api.com/', capturedAt: '2026-10-08T23:59:00Z', quotedAt: '2026-10-08T23:58:00Z', actualKickoff: status==='frozen'?'2026-10-09T00:16:00Z':null, stale: status!=='frozen' }, score: 26, gameValues: { 'TB-DAL': {market:0,points:10}, 'PHI-JAX':{market:1,points:8}, 'CIN-MIA':{market:0,points:8} }, standings: { [accountId]:{points:26,error:2,exact:1,record:{W:1,L:2,T:0}}, 'other-player':{points:28,error:1,exact:2,record:{W:2,L:1,T:0}} } };
}
function submittedBenchmarkGame(hub) {
  hub.profile='Avery Chen';hub.addGame(duelId,'Weekend duel',false);
  hub.engines[duelId]=makeEngine(duelId,'Weekend duel',false);
  hub.engines[duelId].saveBallot(accountId,'guess_spread',{'TB-DAL':0,'PHI-JAX':2,'CIN-MIA':-1},true);
  hub.engines[duelId].saveBallot('other-player','guess_spread',{'TB-DAL':1,'PHI-JAX':1,'CIN-MIA':0},true);
}
for(const [status,width] of [['provisional',320],['frozen',390]]) test(`approved ${status} benchmark and scores are visible across the submitted Duel at ${width}px`,async({page,hub})=>{
  submittedBenchmarkGame(hub);hub.benchmarkViews[duelId]=benchmarkFixture(status);hub.serverNow='2026-10-09T00:17:00Z';
  await page.setViewportSize({width,height:844});await page.goto('/');await signIn(page);await page.getByRole('button',{name:'Open game',exact:true}).click();
  const label=status==='frozen'?'Frozen':'Provisional';
  await expect(page.getByRole('region',{name:'Spread scoring benchmark'})).toContainText(`${label} spread benchmark`);
  await expect(page.locator('.visual-scoreboard .visual-panel-heading')).toContainText(status.toUpperCase());
  await expect(page.locator('.score-number')).toContainText('26');
  await expect(page.locator('.visual-scoreboard .visual-score-footer')).not.toContainText('Official benchmark pending');
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'My picks',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open spread analysis',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Spread scoring benchmark'})).toContainText(`Your ${status} score`);
  await expect(page.getByRole('row').filter({hasText:'Buccaneers'})).toContainText(`${label} · Three-book median`);
  await expect(page.getByRole('row').filter({hasText:'Buccaneers'}).locator('.benchmark-mobile-data')).toContainText('Your score: 10 / 10 pts');
  await expect(page.locator('.source-note')).toContainText(`${label} scoring benchmark`);
  await page.getByRole('button',{name:'Open spread analysis',exact:true}).click();await expect(page.getByRole('heading',{name:'Your spread analysis',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.locator('.sidebar').getByRole('button',{name:'Compare picks',exact:true}).click();
  const first=page.getByRole('article',{name:'TB at DAL predictions'});
  await expect(first).toContainText(`${label} benchmark · DAL PK`);await expect(first).toContainText('Your score: 10 / 10 pts');
  await expect(page.locator('.comparison-players')).toContainText(`28 / 30 pts · ${label}`);
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Leaderboard',exact:true}).click();
  await expect(page.getByRole('row').filter({hasText:'Avery Chen'})).toContainText('26');
  await expect(page.getByRole('row').filter({hasText:'Jordan Lee'}).locator('.benchmark-mobile-data')).toBeVisible();
  await expect(page.getByText(`${label} accuracy and closest-pick records against the approved three-book benchmark.`)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`.local/previews/benchmark-${status}-${width}.png`,fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Guess the Total',exact:true}).click();await expect(page.getByRole('region',{name:'Spread scoring benchmark'})).toHaveCount(0);
  await expect(page.getByText(`${label} scoring benchmark`,{exact:false})).toHaveCount(0);
});

test('benchmark freeze needs the kickoff window, observed-time confirmation and irreversible review before a retry-safe request',async({page,hub})=>{
  submittedBenchmarkGame(hub);hub.benchmarkViews[duelId]=benchmarkFixture();
  hub.freezeResponses=[{http:503,body:{error:'Temporary fixture interruption; retry this saved request.'}},{body:{status:'frozen',policyId:'d09-browser-fixture',actualKickoff:'2026-10-09T00:16:00Z',sourceURL:'https://www.nfl.com/test-observed-kickoff',gameCount:3,replayed:true}}];
  await page.setViewportSize({width:320,height:844});await page.goto('/');await signIn(page);await page.getByRole('button',{name:'Open game',exact:true}).click();
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Settings & setup',exact:true}).click();
  await expect(page.getByLabel(/^Observed actual kickoff/)).toHaveValue('');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByRole('button',{name:'Review permanent freeze',exact:true})).toBeDisabled();
  const actual='2026-10-09T00:16:00Z';const deviceTime=await page.evaluate(value=>{const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)},actual);
  await page.getByLabel(/^Observed actual kickoff/).fill(deviceTime);await page.getByLabel('Official kickoff source URL').fill('https://www.nfl.com/test-observed-kickoff');await page.getByRole('checkbox').check();
  await expect(page.getByRole('button',{name:'Review permanent freeze',exact:true})).toBeDisabled();
  expect(hub.requests.filter(request=>request.endpoint==='benchmark/freeze')).toHaveLength(0);
  hub.serverNow='2026-10-09T00:17:00Z';await page.getByRole('button',{name:'Refresh kickoff window',exact:true}).click();
  await page.getByRole('button',{name:'Review permanent freeze',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('cannot be replaced or edited');
  await expect(page.getByRole('button',{name:'Keep editing',exact:true})).toBeFocused();
  expect(hub.requests.filter(request=>request.endpoint==='benchmark/freeze')).toHaveLength(0);
  await page.getByRole('button',{name:'Freeze benchmark permanently',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Temporary fixture interruption');
  await page.getByRole('button',{name:'Freeze benchmark permanently',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Benchmark frozen.',{exact:true})).toBeVisible();await expect(page.getByLabel(/^Observed actual kickoff/)).toHaveCount(0);
  const requests=hub.requests.filter(request=>request.endpoint==='benchmark/freeze');expect(requests).toHaveLength(2);expect(requests[0].body).toEqual(requests[1].body);
  expect(requests[0].body.actualKickoff).toBe('2026-10-09T00:16:00.000Z');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

const scheduleFixture = () => ({configured:true,enabled:true,operationalStatus:'active',pauseReason:null,cadenceHours:12,timeZone:'UTC',utcTimes:['08:15','20:15'],nextRunAt:'2026-10-09T08:15:00Z',lastRunAt:'2026-10-08T20:15:00Z',lastStatus:'succeeded',lastReason:null,slateStatus:'eligible',referenceOnly:true});
const historyPoint = (id, time, value) => ({id,quotedAt:time,capturedAt:time,timeBasis:'collection',source:'Browser fixture · book median',verified:false,status:'collected',games:{'TB-DAL':{value}}});
for(const [width,theme] of [[320,'dark'],[390,'light']]) test(`visual dashboard has accessible real-value drilldowns and honest history at ${width}px ${theme}`,async({page,hub})=>{
  // Pin the browser clock so the fixture's 08:15Z scheduled run stays in the future regardless of wall-clock time.
  await page.clock.install({time:new Date('2026-10-09T00:17:00Z')});
  submittedBenchmarkGame(hub);hub.benchmarkViews[duelId]=benchmarkFixture();hub.serverNow='2026-10-09T00:17:00Z';hub.oddsSchedule=scheduleFixture();
  hub.marketOverlay={marketFeed:{status:'stale',source:'Browser fixture',collectedAt:'2026-10-08T23:59:00Z'},marketLineHistory:[historyPoint('one','2026-10-08T23:59:00Z',0)]};
  await page.setViewportSize({width,height:844});await page.goto('/');await page.getByLabel('Color theme').selectOption(theme);await signIn(page);await page.getByRole('button',{name:'Open game',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await expect(page.locator('.accuracy-player')).toHaveCount(2);
  await expect(page.locator('.accuracy-row strong')).toHaveText(['26 / 30','28 / 30']);
  await expect(page.locator('.visual-source-line')).toContainText('Stale saved reference');
  const ownSummary=page.getByLabel('Expand Avery Chen accuracy details');await ownSummary.focus();await page.keyboard.press('Enter');
  await expect(page.locator('.accuracy-player').first()).toHaveAttribute('open');await expect(page.locator('.accuracy-player').first().locator('.visual-drilldown')).toContainText('1–2–0');await page.keyboard.press('Enter');
  const gapSummary=page.getByLabel('Expand TB at DAL gap details');await gapSummary.focus();await page.keyboard.press('Enter');
  const gap=page.locator('.gap-game').filter({has:gapSummary});await expect(gap).toHaveAttribute('open');await expect(gap).toContainText('0 · Exact');await expect(gap.locator('dd')).toHaveText(['PK','+1','10 / 10 pts']);
  await expect(page.getByRole('heading',{name:'One recorded observation'})).toBeVisible();await expect(page.locator('.single-line-point')).toContainText('PK');await expect(page.locator('.line-chart polyline')).toHaveCount(0);
  await expect(page.locator('.visual-refresh')).toContainText('12-hour refresh enabled');await expect(page.locator('.visual-refresh')).toContainText('Next update');
  await expect(page.locator('.data-connections')).not.toHaveAttribute('open');await page.locator('.data-connections > summary').focus();await page.keyboard.press('Enter');await expect(page.locator('.analysis-source')).toHaveCount(5);await expect(page.locator('.connection-caution')).toContainText('not positive expected value');await page.keyboard.press('Enter');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>document.activeElement?.blur());
  await page.screenshot({path:`.local/previews/visual-dashboard-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
  const reads=hub.requests.filter(r=>r.endpoint==='state').length;
  hub.marketOverlay.marketLineHistory.push(historyPoint('two','2026-10-09T00:10:00Z',-0.5));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(()=>hub.requests.filter(r=>r.endpoint==='state').length).toBeGreaterThan(reads);
  await expect(page.locator('.line-chart svg')).toHaveAccessibleName(/PK at .*−0.5 at/);
  await expect(page.locator('.line-chart polyline')).toHaveCount(1);
  expect(hub.requests.filter(r=>r.endpoint.startsWith('odds/'))).toHaveLength(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>document.activeElement?.blur());
  await page.screenshot({path:`.local/previews/visual-dashboard-trend-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
  await page.locator('.visual-actions .game-option').filter({hasText:'Total'}).click();await pickTotal(page,'TB at DAL combined points','47');
  const draftReads=hub.requests.filter(r=>r.endpoint==='state').length;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(1100);
  expect(hub.requests.filter(r=>r.endpoint==='state')).toHaveLength(draftReads);await expectPick(page,'TB at DAL combined points','47 total points');await expect(page.locator('.accuracy-bars,.gap-bars,.line-chart')).toHaveCount(0);
});

test('visual bars distinguish zero from missing values and never expose an opponent draft',async({page,hub})=>{
  hub.profile='Avery Chen';hub.addGame(duelId,'Weekend duel',false);hub.engines[duelId]=makeEngine(duelId,'Weekend duel',false);
  hub.engines[duelId].saveBallot(accountId,'guess_spread',{'TB-DAL':0,'PHI-JAX':2,'CIN-MIA':-1},true);
  hub.engines[duelId].saveBallot('other-player','guess_spread',{'TB-DAL':19,'PHI-JAX':18,'CIN-MIA':17},false);
  hub.benchmarkViews[duelId]=benchmarkFixture();hub.benchmarkViews[duelId].standings[accountId].points=0;hub.benchmarkViews[duelId].gameValues['PHI-JAX']={market:null,points:null};
  hub.oddsSchedule={...scheduleFixture(),enabled:false,operationalStatus:'blocked',pauseReason:'budget_paused',nextRunAt:null};
  await page.goto('/');await signIn(page);await page.getByRole('button',{name:'Open game',exact:true}).click();
  await expect(page.locator('.score-number')).toHaveText('0 / 30');await expect(page.locator('.accuracy-player').last()).toContainText('Ballot not submitted');
  const missing=page.locator('.gap-game').filter({has:page.getByLabel('Expand PHI at JAX gap details')});await expect(missing).toContainText('Reference unavailable');await expect(missing).toContainText('Not submitted');
  await page.getByLabel('Expand PHI at JAX gap details').click();await expect(missing.locator('dd')).toHaveText(['+2','Not submitted','Unscored']);
  await expect(page.locator('.visual-refresh')).toContainText('provider cost needs review');await expect(page.locator('.visual-refresh')).not.toContainText('refresh enabled');
  await expect(page.locator('.visual-dashboard')).not.toContainText('+18');
});

test('scheduled private-view refresh updates once without calling the provider and leaves Settings untouched',async({page,hub})=>{
  await page.clock.install({time:new Date('2026-10-09T00:17:00Z')});
  submittedBenchmarkGame(hub);hub.benchmarkViews[duelId]=benchmarkFixture();hub.oddsSchedule={...scheduleFixture(),nextRunAt:'2026-10-09T00:18:00Z'};
  await page.goto('/');await signIn(page);await page.getByRole('button',{name:'Open game',exact:true}).click();await expect(page.locator('.score-number')).toContainText('26');
  const before=hub.requests.filter(r=>r.endpoint==='state').length;hub.benchmarkViews[duelId].standings[accountId].points=25;
  await page.clock.fastForward(121000);await expect(page.locator('.score-number')).toContainText('25');expect(hub.requests.filter(r=>r.endpoint==='state')).toHaveLength(before+1);
  await page.clock.fastForward(121000);expect(hub.requests.filter(r=>r.endpoint==='state')).toHaveLength(before+1);
  await page.getByRole('button',{name:'Settings & setup',exact:true}).click();const settingsReads=hub.requests.filter(r=>r.endpoint==='state').length;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.clock.fastForward(2000);expect(hub.requests.filter(r=>r.endpoint==='state')).toHaveLength(settingsReads);
  expect(hub.requests.filter(r=>r.endpoint.startsWith('odds/'))).toHaveLength(0);
});

// Decision 5 (October 12): three layouts; Market rows and Social league were removed.
const presentationLayouts = [['command', 'Command center'], ['matchups', 'Matchup cards'], ['analytics', 'Analytics lab']];
function presentationGame(hub) {
  submittedBenchmarkGame(hub);
  hub.benchmarkViews[duelId] = benchmarkFixture();
  hub.serverNow = '2026-10-09T00:17:00Z';
  hub.oddsSchedule = scheduleFixture();
  hub.marketOverlay = {
    marketFeed: { status: 'stale', source: 'Browser presentation fixture', collectedAt: '2026-10-08T23:59:00Z' },
    marketLineHistory: [historyPoint('presentation-one', '2026-10-08T23:00:00Z', -0.5), historyPoint('presentation-two', '2026-10-08T23:59:00Z', 0)],
  };
}
async function openDashboardOptions(page) {
  const controls = page.locator('.dashboard-preferences');
  if (await controls.getAttribute('open') === null) await controls.locator(':scope > summary').click();
  return controls;
}
async function chooseDashboardLayout(page, id, label) {
  const controls = await openDashboardOptions(page);
  const radio = controls.getByRole('radio', { name: new RegExp(`^${label}`) });
  await radio.focus(); await page.keyboard.press('Space');
  await expect(page.locator('.visual-dashboard')).toHaveAttribute('data-layout', id);
  await expect(radio).toBeChecked();
  await controls.locator(':scope > summary').click();
}
async function refreshDashboardFixture(page, hub) {
  const before = hub.requests.filter(request => request.endpoint === 'state').length;
  await page.clock.fastForward(1100);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => hub.requests.filter(request => request.endpoint === 'state').length).toBeGreaterThan(before);
}

test('selected identity and three dashboard layouts render real arrangements with keyboard controls', async ({ page, hub }) => {
  presentationGame(hub);
  await page.clock.install({ time: new Date(hub.serverNow) });
  await page.goto('/');
  await expect(page).toHaveTitle('Guess The Line');
  await expect(page.locator('.auth-card .gtl-brand').getByRole('img', { name: 'Guess The Line', exact: true })).toBeVisible();
  await expect(page.locator('.auth-card .gtl-brand-wordmark')).toHaveCount(0);
  await expect(page.locator('.auth-card .gtl-brand')).toHaveText('');
  const selectedPath = 'M86 20H54L32 40v33h54V46H60v12h13v3H46V46l16-14h24z';
  await expect(page.locator('.auth-card .gtl-yardline-mark path').first()).toHaveAttribute('d', selectedPath);
  const favicon = await page.request.get('/favicon.svg');
  expect(favicon.ok()).toBe(true); expect(await favicon.text()).toContain(selectedPath);
  await signIn(page);
  await expect(page.locator('.hub-header .gtl-brand').getByRole('img', { name: 'Guess The Line', exact: true })).toBeVisible();
  await expect(page.locator('.hub-header .gtl-brand-wordmark')).toHaveCount(0);
  await expect(page.locator('.hub-header .gtl-brand')).toHaveText('');
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(page.locator('.sidebar .gtl-brand').getByRole('img', { name: 'Guess The Line', exact: true })).toBeVisible();
  await expect(page.locator('.sidebar .gtl-brand-wordmark')).toHaveCount(0);
  await expect(page.locator('.sidebar .gtl-brand')).toHaveText('');
  await expect(page.locator('.sidebar .gtl-yardline-mark path').first()).toHaveAttribute('d', selectedPath);
  await expect(page.locator('.accuracy-row strong')).toHaveText(['26 / 30', '28 / 30']);
  for (const [id, label] of presentationLayouts) {
    await chooseDashboardLayout(page, id, label);
    const scores = await page.locator('.visual-scoreboard').boundingBox();
    const gaps = await page.locator('.visual-gaps').boundingBox();
    const history = await page.locator('.visual-history').boundingBox();
    if (id === 'command') { expect(scores.y).toBeLessThan(gaps.y); expect(history.x).toBeGreaterThan(gaps.x); }
    if (id === 'matchups') {
      expect(gaps.y).toBeLessThan(scores.y);
      const first = await page.locator('.gap-game').nth(0).boundingBox(), second = await page.locator('.gap-game').nth(1).boundingBox();
      expect(second.x).toBeGreaterThan(first.x); expect(Math.abs(second.y - first.y)).toBeLessThan(2);
    }
    if (id === 'analytics') { expect(history.y).toBeLessThan(gaps.y); expect(gaps.y).toBeLessThan(scores.y); }
    await expect(page.locator('.accuracy-row strong')).toHaveText(['26 / 30', '28 / 30']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(hub.requests.filter(request => ['ballot', 'bet'].includes(request.endpoint))).toHaveLength(0);
});

test('dashboard section, layout, motion and notice preferences persist without changing any ballots', async ({ page, hub }) => {
  presentationGame(hub);
  const originalBallots = structuredClone(hub.engines[duelId].snapshot().ballots);
  await page.clock.install({ time: new Date(hub.serverNow) });
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await chooseDashboardLayout(page, 'matchups', 'Matchup cards');
  let controls = await openDashboardOptions(page);
  await expect(controls).toContainText('Saved in this browser on this device');
  for (const name of ['Player scores', 'Line history', 'Data connections']) await controls.getByRole('checkbox', { name: new RegExp(`^${name}`) }).uncheck();
  await expect(controls.getByRole('checkbox', { name: /^Matchup differences/ })).toBeDisabled();
  await controls.getByLabel('Animation preference').selectOption('reduced');
  await controls.getByRole('checkbox', { name: /^New saved market update/ }).uncheck();
  await controls.getByRole('checkbox', { name: /^Data availability notices/ }).uncheck();
  await expect(page.locator('.visual-scoreboard,.visual-history,.data-connections,.dashboard-notices')).toHaveCount(0);
  await expect(page.locator('.visual-gaps')).toBeVisible();
  await page.reload();
  await expect(page.locator('.visual-dashboard')).toHaveAttribute('data-layout', 'matchups');
  await expect(page.locator('.visual-dashboard')).toHaveAttribute('data-dashboard-motion', 'reduced');
  await expect(page.locator('.visual-scoreboard,.visual-history,.data-connections,.dashboard-notices')).toHaveCount(0);
  controls = await openDashboardOptions(page);
  await expect(controls.getByRole('checkbox', { name: /^Matchup differences/ })).toBeChecked();
  await expect(controls.getByRole('checkbox', { name: /^Matchup differences/ })).toBeDisabled();
  await expect(controls.getByRole('checkbox', { name: /^New saved market update/ })).not.toBeChecked();
  await expect(controls.getByRole('checkbox', { name: /^Data availability notices/ })).not.toBeChecked();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('gtl.dashboard.preferences.v1')));
  expect(stored).toEqual({ version: 1, layout: 'matchups', modules: { scores: false, gaps: true, history: false, connections: false }, motion: 'reduced', notices: { marketUpdates: false, dataIssues: false } });
  await controls.getByRole('button', { name: 'Reset dashboard preferences' }).click();
  await expect(page.locator('.visual-dashboard')).toHaveAttribute('data-layout', 'command');
  await expect(page.locator('.visual-scoreboard,.visual-gaps,.visual-history,.data-connections')).toHaveCount(4);
  expect(hub.engines[duelId].snapshot().ballots).toEqual(originalBallots);
  expect(hub.requests.filter(request => ['ballot', 'bet'].includes(request.endpoint))).toHaveLength(0);
});

for (const removed of ['markets', 'social']) test(`a stored ${removed} layout reads as Command center and stays in storage until the player picks again`, async ({ page, hub }) => {
  presentationGame(hub);
  await page.clock.install({ time: new Date(hub.serverNow) });
  const stored = { version: 1, layout: removed, modules: { scores: true, gaps: true, history: true, connections: true }, motion: 'system', notices: { marketUpdates: true, dataIssues: true } };
  await page.goto('/'); await page.evaluate(value => localStorage.setItem('gtl.dashboard.preferences.v1', value), JSON.stringify(stored));
  await page.reload(); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(page.locator('.visual-dashboard')).toHaveAttribute('data-layout', 'command');
  const controls = await openDashboardOptions(page);
  await expect(controls.getByRole('radio')).toHaveCount(3);
  await expect(controls.getByRole('radio', { name: /^Command center/ })).toBeChecked();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gtl.dashboard.preferences.v1')).layout)).toBe(removed);
});

test('dashboard reduced-motion preference and the device setting override chart and panel animation', async ({ page, hub }) => {
  presentationGame(hub);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date(hub.serverNow) });
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  const controls = await openDashboardOptions(page);
  await controls.getByLabel('Animation preference').selectOption('subtle');
  await expect(page.locator('.visual-dashboard')).toHaveAttribute('data-dashboard-motion', 'reduced');
  await expect(page.locator('.accuracy-track i').first()).toHaveCSS('transition-duration', '0s');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.visual-dashboard')).toHaveAttribute('data-dashboard-motion', 'subtle');
  await expect(page.locator('.accuracy-track i').first()).toHaveCSS('transition-duration', '0.22s');
  await page.getByLabel('Expand Avery Chen accuracy details').click();
  await expect(page.locator('.accuracy-player').first().locator('.visual-drilldown')).toHaveCSS('animation-name', 'dashboard-reveal');
  await controls.getByLabel('Animation preference').selectOption('reduced');
  await expect(page.locator('.visual-dashboard')).toHaveAttribute('data-dashboard-motion', 'reduced');
  await expect(page.locator('.accuracy-player').first().locator('.visual-drilldown')).toHaveCSS('animation-name', 'none');
});

test('dashboard notices report only newly received newer snapshots and honor independent switches', async ({ page, hub }) => {
  presentationGame(hub);
  await page.clock.install({ time: new Date(hub.serverNow) });
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(page.locator('.visual-dashboard')).toBeVisible();
  await expect(page.locator('.market-update-notice')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Dashboard notices' })).toHaveCount(0);
  await refreshDashboardFixture(page, hub);
  await expect(page.locator('.market-update-notice')).toHaveCount(0);
  hub.marketOverlay.marketFeed.collectedAt = '2026-10-08T23:30:00Z';
  await refreshDashboardFixture(page, hub);
  await expect(page.locator('.market-update-notice')).toHaveCount(0);
  hub.marketOverlay.marketFeed.collectedAt = '2026-10-09T00:10:00Z';
  hub.marketOverlay.marketLineHistory.push(historyPoint('presentation-three', '2026-10-09T00:10:00Z', -1));
  await refreshDashboardFixture(page, hub);
  await expect(page.locator('.market-update-notice')).toContainText('collected Oct 8, 5:10 PM PT');
  await expect(page.locator('.line-chart svg')).toHaveAccessibleName(/−0.5 at .*PK at .*−1 at/);
  hub.oddsSchedule.lastStatus = 'failed';
  await refreshDashboardFixture(page, hub);
  await expect(page.getByRole('region', { name: 'Dashboard notices' })).toContainText('Last automatic update failed · showing saved references');
  const controls = await openDashboardOptions(page);
  await controls.getByRole('checkbox', { name: /^New saved market update/ }).uncheck();
  await expect(page.locator('.market-update-notice')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Dashboard notices' })).toBeVisible();
  await controls.getByRole('checkbox', { name: /^Data availability notices/ }).uncheck();
  await expect(page.getByRole('region', { name: 'Dashboard notices' })).toHaveCount(0);
  await expect(page.locator('.visual-source-line')).toContainText('Stale saved reference');
  await controls.getByRole('checkbox', { name: /^New saved market update/ }).check();
  await expect(page.locator('.market-update-notice')).toContainText('collected Oct 8, 5:10 PM PT');
  expect(hub.requests.filter(request => request.endpoint.startsWith('odds/'))).toHaveLength(0);
});

test('dashboard team identifiers load approved local artwork and retain names with an accessible fallback', async ({ page, hub }) => {
  presentationGame(hub);
  await page.clock.install({ time: new Date(hub.serverNow) });
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  const matchup = page.getByLabel('Expand TB at DAL gap details', { exact: true }).locator('.team-matchup');
  const logo = matchup.locator('img[src="/team-logos/dal.svg"]');
  await expect(logo).toHaveCount(1);
  await expect.poll(() => logo.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(matchup.locator('.team-identity').nth(1)).toHaveAttribute('data-logo-status', 'approved');
  const badge = matchup.locator('img[src="/team-logos/badges/tb.svg"]');
  await expect(badge).toHaveCount(1);
  await expect.poll(() => badge.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(matchup.locator('.team-identity').first()).toHaveAttribute('data-logo-status', 'original');
  await expect(matchup.locator('[data-logo-status="fallback"]')).toHaveCount(0);
  await expect(matchup.locator('.team-matchup__accessible-name')).toHaveText(['Tampa Bay Buccaneers', 'Dallas Cowboys']);
  for (const mark of await matchup.locator('.team-identity').all()) await expect(mark).toHaveAttribute('aria-hidden', 'true');
});

test('dashboard team badge keeps the abbreviation fallback when its image fails to load', async ({ page, hub }) => {
  presentationGame(hub);
  await page.route('**/team-logos/badges/tb.svg', route => route.abort());
  await page.clock.install({ time: new Date(hub.serverNow) });
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  const matchup = page.getByLabel('Expand TB at DAL gap details', { exact: true }).locator('.team-matchup');
  await expect(matchup.locator('[data-logo-status="fallback"]')).toHaveText('TB');
  await expect(matchup.locator('img[src="/team-logos/dal.svg"]')).toHaveCount(1);
  await expect(matchup.locator('.team-matchup__accessible-name')).toHaveText(['Tampa Bay Buccaneers', 'Dallas Cowboys']);
});

for (const width of [320, 390]) for (const theme of ['dark', 'light']) test(`dashboard controls and all layouts fit ${width}px ${theme} without hiding content`, async ({ page, hub }) => {
  presentationGame(hub);
  await page.clock.install({ time: new Date(hub.serverNow) });
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/'); await page.getByLabel('Color theme').selectOption(theme); await signIn(page);
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  for (const [id, label] of presentationLayouts) {
    const controls = await openDashboardOptions(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await chooseDashboardLayout(page, id, label);
    const first = await page.locator('.gap-game').first().boundingBox(), second = await page.locator('.gap-game').nth(1).boundingBox();
    expect(Math.abs(first.x - second.x)).toBeLessThan(2); expect(second.y).toBeGreaterThan(first.y);
    await expect(page.locator('.accuracy-row strong')).toHaveText(['26 / 30', '28 / 30']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(controls).not.toHaveAttribute('open');
  }
  await page.screenshot({ path: `.local/previews/dashboard-preferences-${width}-${theme}.png`, fullPage: true, animations: 'disabled' });
});

function totalPresentationGame(hub, { weekly = false, spreadSubmitted = true } = {}) {
  if (spreadSubmitted) submittedBenchmarkGame(hub);
  else { hub.profile = 'Avery Chen'; hub.addGame(duelId, 'Weekend duel', false); hub.engines[duelId] = makeEngine(duelId, 'Weekend duel', false); }
  hub.serverNow = '2026-10-08T16:00:00Z';
  const own = { 'TB-DAL': 44, 'PHI-JAX': 45, 'CIN-MIA': 46 };
  const opponent = { 'TB-DAL': 46, 'PHI-JAX': 45.5, 'CIN-MIA': 47 };
  hub.engines[duelId].saveBallot(accountId, 'guess_total', own, true);
  hub.engines[duelId].saveBallot('other-player', 'guess_total', opponent, true);
  if (weekly) { hub.weeklyEnabled = true; hub.weeklyBallots = structuredClone(hub.engines[duelId].snapshot().ballots[accountId]); }
  if (spreadSubmitted) {
    hub.benchmarkViews[duelId] = benchmarkFixture();
    Object.assign(hub.benchmarkViews[duelId].scoringBenchmark, { capturedAt: '2026-10-08T15:59:00Z', quotedAt: '2026-10-08T15:58:00Z' });
  }
  const snapshot = (id, time, values) => ({ id, capturedAt: time, quotedAt: time, timeBasis: 'collection', source: 'Total browser fixture · three-book median', status: 'collected', verified: false, games: Object.fromEntries(Object.entries(values).map(([game, value]) => [game, { value }])) });
  const latest = { 'TB-DAL': 44.5, 'PHI-JAX': 45.5, 'CIN-MIA': 46 };
  hub.marketOverlayMode = 'guess_total';
  hub.marketOverlay = {
    marketFeed: { status: 'fresh', source: 'Total browser fixture', collectedAt: '2026-10-08T15:59:00Z' },
    marketLineHistory: [snapshot('total-first', '2026-10-08T15:00:00Z', { 'TB-DAL': 43.5, 'PHI-JAX': 45, 'CIN-MIA': 46 }), snapshot('total-latest', '2026-10-08T15:59:00Z', latest)],
    analysisMarkets: Object.fromEntries(Object.entries(latest).map(([id, value]) => [id, { value, source: 'Total browser fixture · three-book median', bookCount: 3, observedAt: '2026-10-08T15:58:30Z', collectedAt: '2026-10-08T15:59:00Z', status: 'fresh', officialVerified: false }])),
  };
}

for (const weekly of [false, true]) test(`Total dashboard uses a complete provisional total reference with ${weekly ? 'weekly' : 'league'} fixture scope`, async ({ page, hub }) => {
  totalPresentationGame(hub, { weekly });
  const originalBallots = structuredClone(hub.engines[duelId].snapshot().ballots);
  await page.clock.install({ time: new Date(hub.serverNow) });
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(page.locator('.accuracy-row strong')).toHaveText(['26 / 30', '28 / 30']);
  await page.locator('.dashboard-market-tabs').getByRole('button', { name: 'Total', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Total provisional accuracy comparison' })).toBeVisible();
  await expect(page.locator('.accuracy-row strong')).toHaveText(['28 / 30', '25 / 30']);
  await expect(page.locator('.visual-source-line')).toContainText('Provisional total comparison · Not official scoring');
  await expect(page.locator('.visual-score-footer').first()).toContainText('Official Total policy and freeze pending');
  await expect(page.getByRole('region', { name: 'Spread scoring benchmark' })).toHaveCount(0);
  await expect(page.locator('.line-chart svg')).toHaveAccessibleName(/43.5 at .*44.5 at/);
  await page.getByLabel('Expand Avery Chen accuracy details').click();
  await expect(page.locator('.accuracy-player').first().locator('.visual-drilldown')).toContainText('2–1–0');
  await page.getByLabel('Expand TB at DAL gap details').click();
  const gap = page.locator('.gap-game').filter({ has: page.getByLabel('Expand TB at DAL gap details') });
  await expect(gap).toContainText('Combined-points reference · 44.5');
  await expect(gap.locator('dd')).toHaveText(['44', '46', '9 / 10 pts']);
  await page.locator('.dashboard-market-tabs').getByRole('button', { name: 'Spread', exact: true }).click();
  await expect(page.locator('.accuracy-row strong')).toHaveText(['26 / 30', '28 / 30']);
  await expect(page.locator('.visual-dashboard')).not.toContainText('Total browser fixture');
  expect(hub.engines[duelId].snapshot().ballots).toEqual(originalBallots);
  expect(hub.requests.filter(request => ['ballot', 'bet', 'benchmark/freeze'].includes(request.endpoint))).toHaveLength(0);
});

test('submitted Total analysis never opens an unsubmitted Spread dashboard', async ({ page, hub }) => {
  totalPresentationGame(hub, { weekly: true, spreadSubmitted: false });
  await page.clock.install({ time: new Date(hub.serverNow) });
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your ballot comes first', exact: true })).toBeVisible();
  await expect(page.locator('.accuracy-bars,.gap-bars,.line-chart')).toHaveCount(0);
  await expect(page.locator('.visual-dashboard')).not.toContainText('Total browser fixture');
  await page.locator('.dashboard-market-tabs').getByRole('button', { name: 'Total', exact: true }).click();
  await expect(page.locator('.accuracy-row strong')).toHaveText(['28 / 30', '25 / 30']);
  await expect(page.locator('.line-chart svg')).toHaveAccessibleName(/43.5 at .*44.5 at/);
  await page.locator('.dashboard-market-tabs').getByRole('button', { name: 'Spread', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your ballot comes first', exact: true })).toBeVisible();
  await expect(page.locator('.accuracy-bars,.gap-bars,.line-chart')).toHaveCount(0);
  await expect(page.locator('.visual-dashboard')).not.toContainText('Total browser fixture');
});

for (const triple of [false, true]) test(`saved Spread data supplies provisional accuracy in a non-policy ${triple ? 'Triple Threat with an unsubmitted player' : 'Duel'}`, async ({ page, hub }) => {
  hub.profile = 'Avery Chen'; hub.addGame(duelId, triple ? 'Three player group' : 'Independent duel', false);
  const state = makeEngine(duelId, triple ? 'Three player group' : 'Independent duel', false).snapshot();
  if (triple) {
    state.league.format = 'triple-threat';
    state.league.roster.push({ id: 'third-player', name: 'Casey Harper', role: 'Player' });
  }
  const engine = createEngine(state, { clock: () => Date.parse('2026-10-08T16:00:00Z') });
  engine.saveBallot(accountId, 'guess_spread', { 'TB-DAL': 0, 'PHI-JAX': 2, 'CIN-MIA': -1 }, true);
  engine.saveBallot('other-player', 'guess_spread', { 'TB-DAL': 1, 'PHI-JAX': 1, 'CIN-MIA': 0 }, true);
  if (triple) engine.saveBallot('third-player', 'guess_spread', { 'TB-DAL': 19, 'PHI-JAX': 18, 'CIN-MIA': 17 }, false);
  hub.engines[duelId] = engine;
  const original = structuredClone(engine.snapshot().ballots);
  hub.serverNow = '2026-10-09T00:17:00Z';
  const point = (id, time, values) => ({ id, quotedAt: time, capturedAt: time, timeBasis: 'collection', source: 'Shared canonical slate · browser fixture', verified: false, status: 'collected', games: Object.fromEntries(Object.entries(values).map(([game, value]) => [game, { value }])) });
  const values = { 'TB-DAL': 0, 'PHI-JAX': 1, 'CIN-MIA': 0 };
  hub.marketOverlay = {
    marketFeed: { status: 'stale', source: 'Shared canonical slate · browser fixture', collectedAt: '2026-10-08T23:59:00Z' },
    marketLineHistory: [point('shared-earlier', '2026-10-08T23:00:00Z', { 'TB-DAL': -.5, 'PHI-JAX': 1.5, 'CIN-MIA': .5 }), point('shared-latest', '2026-10-08T23:59:00Z', values)],
    lastMarketReferences: Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value, source: 'Shared canonical slate · browser fixture', collectedAt: '2026-10-08T23:59:00Z', observedAt: '2026-10-08T23:58:30Z', bookCount: 3, status: 'stale', officialVerified: false }])),
  };
  await page.clock.install({ time: new Date(hub.serverNow) });
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(page.locator('.accuracy-row strong')).toHaveText(triple ? ['26 / 30', '28 / 30', '— / 30'] : ['26 / 30', '28 / 30']);
  await expect(page.locator('.visual-source-line')).toContainText('Provisional spread comparison');
  await expect(page.locator('.visual-scoreboard')).not.toContainText('Accuracy reference pending');
  await expect(page.getByRole('region', { name: 'Spread scoring benchmark' })).toHaveCount(0);
  await expect(page.locator('.line-chart svg')).toHaveAccessibleName(/−0.5 at .*PK at/);
  await page.getByLabel('Expand Avery Chen accuracy details').click();
  if (triple) {
    await expect(page.locator('.accuracy-player').first().locator('.visual-drilldown')).toContainText('Awaiting eligible ballots');
    await expect(page.locator('.accuracy-player').last()).toContainText('Ballot not submitted');
    await expect(page.locator('.visual-dashboard')).not.toContainText('+19');
  } else await expect(page.locator('.accuracy-player').first().locator('.visual-drilldown')).toContainText('1–2–0');
  await page.getByLabel('Expand TB at DAL gap details').click();
  const gap = page.locator('.gap-game').filter({ has: page.getByLabel('Expand TB at DAL gap details') });
  await expect(gap).toContainText('DAL home-spread reference · PK');
  await expect(gap.locator('dd')).toHaveText(triple ? ['PK', '+1', 'Not submitted', '10 / 10 pts'] : ['PK', '+1', '10 / 10 pts']);
  await page.locator('.dashboard-market-tabs').getByRole('button', { name: 'Total', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your ballot comes first', exact: true })).toBeVisible();
  await expect(page.locator('.accuracy-bars,.gap-bars,.line-chart')).toHaveCount(0);
  await expect(page.locator('.visual-dashboard')).not.toContainText('Shared canonical slate');
  expect(engine.snapshot().ballots).toEqual(original);
  expect(hub.requests.filter(request => ['ballot', 'bet', 'benchmark/freeze'].includes(request.endpoint))).toHaveLength(0);
});

async function openDashboardGameFilter(page) {
  await openDashboardOptions(page);
  const filter = page.locator('.dashboard-matchup-filter');
  if (await filter.getAttribute('open') === null) await filter.locator(':scope > summary').click();
  return filter;
}

test('dashboard matchup selection filters comparisons only and persists across Spread Total and refresh', async ({ page, hub }) => {
  totalPresentationGame(hub, { weekly: true });
  const original = structuredClone(hub.engines[duelId].snapshot().ballots);
  await page.clock.install({ time: new Date(hub.serverNow) });
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  let filter = await openDashboardGameFilter(page);
  await filter.getByRole('radio', { name: 'Selected games', exact: true }).check();
  await expect(filter.getByRole('status')).toContainText('No games selected');
  await expect(page.locator('.gap-game')).toHaveCount(0);
  await expect(page.locator('.visual-gaps')).toContainText('Your full-slate scores are unchanged');
  await expect(page.locator('.visual-history')).toContainText('Choose at least one dashboard matchup');
  await expect(page.locator('.accuracy-row strong')).toHaveText(['26 / 30', '28 / 30']);
  await filter.getByRole('checkbox', { name: 'Show TB at DAL', exact: true }).check();
  await expect(page.locator('.gap-game')).toHaveCount(1);
  await expect(page.locator('.gap-game > summary')).toHaveAttribute('aria-label', 'Expand TB at DAL gap details');
  await expect(page.locator('.visual-history').getByLabel('Matchup', { exact: true }).locator('option')).toHaveText(['TB at DAL']);
  await page.locator('.dashboard-market-tabs').getByRole('button', { name: 'Total', exact: true }).click();
  await expect(page.locator('.accuracy-row strong')).toHaveText(['28 / 30', '25 / 30']);
  await expect(page.locator('.gap-game')).toHaveCount(1);
  await expect(page.locator('.line-chart svg')).toHaveAccessibleName(/TB at DAL collected total: 43.5 at .*44.5 at/);
  await expect(page.locator('.visual-actions .game-option').filter({ hasText: 'Total' })).toContainText('Submitted');
  await page.reload();
  await expect(page.locator('.gap-game')).toHaveCount(1);
  await expect(page.locator('.gap-game > summary')).toHaveAttribute('aria-label', 'Expand TB at DAL gap details');
  await expect(page.locator('.accuracy-row strong')).toHaveText(['26 / 30', '28 / 30']);
  await page.locator('.dashboard-market-tabs').getByRole('button', { name: 'Total', exact: true }).click();
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await expect(page.locator('.picks-table .chip-picker')).toHaveCount(3);
  for (const chip of await page.locator('.picks-table .team-chip, .picks-table .number-chip').all()) await expect(chip).toBeEnabled();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.gap-game')).toHaveCount(1);
  filter = await openDashboardGameFilter(page);
  await expect(filter.getByRole('checkbox', { name: 'Show TB at DAL', exact: true })).toBeChecked();
  await filter.getByRole('button', { name: 'Show all games', exact: true }).click();
  await expect(page.locator('.gap-game')).toHaveCount(3);
  await expect(page.locator('.visual-history').getByLabel('Matchup', { exact: true }).locator('option')).toHaveCount(3);
  await expect(page.locator('.accuracy-row strong')).toHaveText(['28 / 30', '25 / 30']);
  expect(hub.engines[duelId].snapshot().ballots).toEqual(original);
  expect(hub.requests.filter(request => ['ballot', 'bet', 'benchmark/freeze'].includes(request.endpoint))).toHaveLength(0);
});

test('dashboard matchup filtering cannot reveal another market or shrink its required ballot', async ({ page, hub }) => {
  presentationGame(hub);
  const original = structuredClone(hub.engines[duelId].snapshot().ballots);
  await page.clock.install({ time: new Date(hub.serverNow) });
  await page.goto('/'); await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click();
  let filter = await openDashboardGameFilter(page);
  await filter.getByRole('radio', { name: 'Selected games', exact: true }).check();
  await filter.getByRole('checkbox', { name: 'Show TB at DAL', exact: true }).check();
  await page.locator('.dashboard-market-tabs').getByRole('button', { name: 'Total', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your ballot comes first', exact: true })).toBeVisible();
  await expect(page.locator('.visual-actions .game-option').filter({ hasText: 'Total' })).toContainText('0/3 entered');
  await expect(page.locator('.accuracy-bars,.gap-bars,.line-chart')).toHaveCount(0);
  filter = await openDashboardGameFilter(page);
  await expect(filter.getByRole('checkbox', { name: 'Show TB at DAL', exact: true })).toBeChecked();
  await expect(filter.getByRole('checkbox')).toHaveCount(3);
  await expect(filter).not.toContainText('Browser presentation fixture');
  await expect(filter).not.toContainText('The Odds API');
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await expect(page.locator('.picks-table .chip-picker')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Review & submit', exact: true })).toBeDisabled();
  await expect(page.locator('.picks-table')).toContainText('Hidden');
  expect(hub.engines[duelId].snapshot().ballots).toEqual(original);
  expect(hub.requests.filter(request => ['ballot', 'bet'].includes(request.endpoint))).toHaveLength(0);
});

test('dashboard matchup filter follows season and week across groups without retaining another roster', async ({ page, hub }) => {
  presentationGame(hub);
  hub.addGame(otherId, 'Different players', false);
  const other = structuredClone(hub.engines[duelId].snapshot());
  other.league = { ...other.league, id: otherId, name: 'Different players', roster: [other.league.roster[0], { id: 'replacement-player', name: 'Morgan Reyes', role: 'Player' }] };
  delete other.ballots['other-player'];
  hub.engines[otherId] = createEngine(other, { clock: () => Date.parse('2026-10-08T16:00:00Z') });
  const nextId = '55555555-5555-4555-8555-555555555555';
  hub.addGame(nextId, 'Synthetic next-week fixture', false);
  const next = makeEngine(nextId, 'Synthetic next-week fixture', false).snapshot();
  next.league.week = 6;
  next.league.deadline = new Date(Date.parse(next.league.deadline) + 7 * 86400_000).toISOString();
  next.games = next.games.map(game => ({ ...game, kickoff: new Date(Date.parse(game.kickoff) + 7 * 86400_000).toISOString() }));
  hub.engines[nextId] = createEngine(next, { clock: () => Date.parse('2026-10-08T16:00:00Z') });
  await page.clock.install({ time: new Date(hub.serverNow) });
  await page.goto('/'); await signIn(page);
  await page.locator('.hub-game').filter({ hasText: 'Weekend duel' }).getByRole('button', { name: 'Open game', exact: true }).click();
  let filter = await openDashboardGameFilter(page);
  await filter.getByRole('radio', { name: 'Selected games', exact: true }).check();
  await filter.getByRole('checkbox', { name: 'Show TB at DAL', exact: true }).check();
  await page.getByLabel('Current game').selectOption(otherId);
  await expect(page.locator('.topbar-location')).toContainText('Different players');
  await expect(page.locator('.gap-game')).toHaveCount(1);
  await expect(page.locator('.accuracy-bars')).toContainText('Morgan Reyes');
  await expect(page.locator('.visual-dashboard')).not.toContainText('Jordan Lee');
  await page.getByLabel('Current game').selectOption(nextId);
  await expect(page.locator('.topbar-location')).toContainText('Synthetic next-week fixture');
  filter = await openDashboardGameFilter(page);
  await expect(filter.locator(':scope > summary')).toContainText('All 3 games · Week 6');
  await expect(filter.getByRole('radio', { name: 'All games', exact: true })).toBeChecked();
  await filter.getByRole('radio', { name: 'Selected games', exact: true }).check();
  await expect(filter.getByRole('status')).toContainText('No games selected');
  await page.getByLabel('Current game').selectOption(duelId);
  await expect(page.locator('.gap-game')).toHaveCount(1);
  filter = await openDashboardGameFilter(page);
  await expect(filter.getByRole('checkbox', { name: 'Show TB at DAL', exact: true })).toBeChecked();
  expect(hub.requests.filter(request => ['ballot', 'bet'].includes(request.endpoint))).toHaveLength(0);
});

test('install manifest and device guidance add no subscriptions or private caches',async({page,hub})=>{
 hub.profile='Avery Chen';hub.addGame();await page.setViewportSize({width:320,height:844});await page.goto('/');await signIn(page);await page.getByRole('button',{name:'Open game',exact:true}).click();await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Settings & setup',exact:true}).click();
 const panel=page.getByRole('region',{name:'Add Guess The Line to your device'});await expect(panel).toContainText('Installation does not enable notifications');await panel.locator('summary').click();await expect(panel).toContainText('Add to Home Screen');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const response=await page.request.get('/manifest.webmanifest');expect(response.ok()).toBe(true);const manifest=await response.json();expect(manifest.start_url).toBe('/');expect(manifest.display).toBe('standalone');expect(manifest.icons.map(icon=>icon.sizes)).toEqual(['192x192','512x512']);for(const icon of manifest.icons)expect((await page.request.get(icon.src)).ok()).toBe(true);
 expect(await page.evaluate(()=>caches.keys())).toEqual([]);expect(await page.evaluate(async()=>navigator.serviceWorker?(await navigator.serviceWorker.getRegistrations()).length:0)).toBe(0);expect(hub.requests.some(request=>/push|subscription|notification/.test(request.endpoint))).toBe(false);await page.screenshot({path:'.local/previews/install-guide-320.png',fullPage:false});
});
test('fresh named-book receipt prefills explicit Challenge review and preserves exact provider timestamp',async({page,hub})=>{
 submittedBenchmarkGame(hub);hub.quoteReceipts={'TB-DAL':[{snapshotId:'fixture-snapshot',provider:'the-odds-api',providerEventId:'fixture-event',gameId:'TB-DAL',book:'draftkings',source:'DraftKings',market:'spread',side:'away',line:3.5,odds:-115,quotedAt:'2026-10-08T15:59:01.123Z',collectedAt:'2026-10-08T15:59:20Z',expiresAt:'2026-10-08T16:04:01.123Z',tradability:'not_confirmed'}]};
 await page.goto('/');await signIn(page);await page.getByRole('button',{name:'Open game',exact:true}).click();await page.getByRole('button',{name:'My picks',exact:true}).click();await page.getByRole('button',{name:'Betting Challenge',exact:true}).click();await page.getByRole('button',{name:'Record selection',exact:true}).first().click();await page.getByText('Use a collected named-book quote',{exact:true}).click();await page.getByRole('button',{name:/DraftKings · Tampa Bay/}).click();await expect(page.getByLabel('Selected team’s spread')).toHaveValue('3.5');await expect(page.getByLabel('American odds')).toHaveValue('-115');await page.getByRole('button',{name:'Review selection',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('2026-10-08T15:59:01.123Z');await expect(page.getByRole('dialog')).toContainText('preserves its source receipt');expect(hub.requests.filter(request=>request.endpoint==='bet')).toHaveLength(0);
 await page.getByRole('button',{name:'Confirm immutable selection',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(hub.requests.find(request=>request.endpoint==='bet').body.quoteReceipt).toEqual(hub.quoteReceipts['TB-DAL'][0]);
});
test('D16 player distributions disclose individual reference samples without changing scores',async({page,hub})=>{
 submittedBenchmarkGame(hub);hub.viewPatch=view=>({games:view.games.map((game,index)=>({...game,scoringReference:{status:'available',value:index===0?-2:0,savedAt:'2026-10-08T15:00:00Z',source:'Saved fixture'},opponents:game.opponents.map(player=>({...player,scoringReference:{status:'available',value:index===0?-3:0,savedAt:'2026-10-08T15:01:00Z',source:'Saved fixture'}}))}))});const before=structuredClone(hub.engines[duelId].snapshot().ballots);await page.setViewportSize({width:390,height:844});await page.goto('/');await signIn(page);await page.getByRole('button',{name:'Open game',exact:true}).click();await page.locator('.dashboard-detail-comparison > summary').click();const panel=page.getByRole('region',{name:'Comparable player error distributions'});await expect(panel).toContainText('Each player’s own submission or edit-time reference');await expect(panel).toContainText('3/3 compared');await panel.locator('.distribution-player > summary').first().click();await expect(panel).toContainText('Median error 2');await panel.locator('.comparison-difference > summary').click();await expect(panel.getByRole('region',{name:'Per-game error differences'})).toContainText('TB at DAL');await expect(panel).toContainText('Negative means your guess was closer');await expect(panel).toContainText('Saved with guess Oct 8');await expect(panel).toContainText('−2');await expect(panel.locator('.comparison-history')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(hub.engines[duelId].snapshot().ballots).toEqual(before);await page.screenshot({path:'.local/previews/player-distributions-390.png',fullPage:true});
});
test('browser install offer is retained until Settings and requires an explicit click',async({page,hub})=>{
 hub.profile='Avery Chen';hub.addGame();await page.goto('/');await page.evaluate(()=>{window.installClicks=0;const event=new Event('beforeinstallprompt',{cancelable:true});Object.assign(event,{prompt:async()=>{window.installClicks++;},userChoice:Promise.resolve({outcome:'dismissed'})});window.dispatchEvent(event)});await signIn(page);await page.getByRole('button',{name:'Open game',exact:true}).click();await page.getByRole('button',{name:'Settings & setup',exact:true}).click();await expect(page.getByRole('button',{name:'Install app',exact:true})).toBeVisible();expect(await page.evaluate(()=>window.installClicks)).toBe(0);await page.getByRole('button',{name:'Install app',exact:true}).click();await expect(page.getByRole('status')).toContainText('Installation cancelled');expect(await page.evaluate(()=>window.installClicks)).toBe(1);
});
test('personal decision analysis displays sourced fields only in the submitted matching market',async({page,hub})=>{
 submittedBenchmarkGame(hub);hub.decisionAnalysis={'TB-DAL':{market:'spread',savedGuess:0,reference:{value:-3,source:'Recorded fixture book median',observedAt:'2026-10-08T15:59:00Z',collectedAt:'2026-10-08T16:00:00Z',status:'stale'},guessDiscrepancy:3,personalForecast:{kind:'personal_outcome_forecast',value:-7.5,savedAt:'2026-10-08T15:30:00Z',revision:2},model:null,explanation:'No eligible current independent forecast; a sportsbook-number guess is not an outcome forecast.'}};
 await page.goto('/');await signIn(page);await page.getByRole('button',{name:'Open game',exact:true}).click();await page.locator('.data-connections > summary').click();const panel=page.getByRole('region',{name:'Your forecast and the recorded market'});await expect(panel).toContainText('Stale saved market reference');await expect(panel).toContainText('Recorded fixture book median');await expect(panel).toContainText('−7.5');await expect(panel).toContainText('Revision 2');await expect(panel).toContainText('Independent outcome forecastUnavailable');await expect(panel).toContainText('No automated selection is made');await page.locator('.dashboard-market-tabs').getByRole('button',{name:'Total',exact:true}).click();await page.locator('.data-connections > summary').click();await expect(page.getByRole('region',{name:'Your forecast and the recorded market'})).toHaveCount(0);await expect(page.locator('.external-research')).toHaveCount(0);
});
