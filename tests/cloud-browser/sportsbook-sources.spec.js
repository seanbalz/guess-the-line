import { test as base, expect } from '@playwright/test';
import { seed } from '../../server/store.mjs';
import { createEngine } from '../../server/engine.mjs';
import { applyMarketView } from '../../cloud/market-view.mjs';
import { applySportsbookSources } from '../../cloud/sportsbook-sources.mjs';
import { SubmissionOddsError } from '../../cloud/submission-odds.mjs';
import { emptySocialRead } from './social-read-fixture.mjs';
import { pickSpread, expectPick, spreadText } from '../chip-entry.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';

// Authenticated frontend integration with synthetic, in-memory source evidence.
// No hosted account, real provider request, or production write is used here.
const accountId = '11111111-1111-4111-8111-111111111111';
const leagueId = '22222222-2222-4222-8222-222222222222';
const oldObserved = '2026-10-08T18:00:12.000Z';
const oldCollected = '2026-10-08T18:01:34.000Z';
const oldSaved = '2026-10-08T18:02:56.000Z';
const newObserved = '2026-10-08T18:05:12.000Z';
const newCollected = '2026-10-08T18:05:34.000Z';
const books = ['draftkings', 'fanduel', 'betmgm'];

function sourceSnapshot(games, historical = false) {
  const observed = historical ? oldObserved : newObserved, collected = historical ? oldCollected : newCollected;
  const spread = historical ? -3.5 : -6.5, total = historical ? 44.5 : 46.5;
  return { id: historical ? 'old-source-snapshot' : 'latest-source-snapshot', createdAt: collected,
    payload: { provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: collected,
      games: games.map(game => ({ ...game, gameId: game.id, matchStatus: 'matched', providerEventId: `provider-${game.id}`,
        markets: Object.fromEntries([['spread', spread], ['total', total]].map(([market, value]) => [market, { quotes: books.map((book, index) => {
          const line = value + (index - 1) * .5;
          return { book, market, value: line, provider: 'the-odds-api', providerEventId: `provider-${game.id}`,
            timeBasis: 'provider_market_last_update', providerObservedAt: observed, collectedAt: collected,
            outcomes: market === 'spread' ? { home: { line }, away: { line: -line } } : { over: { line }, under: { line } } };
        }) }])) })) } };
}

const test = base.extend({
  sources: async ({ page, baseURL }, use) => {
    const state = seed(); state.games = state.games.slice(0, 3);
    state.league = { ...state.league, id: leagueId, name: 'Sources test duel', format: 'duel', practice: false, maxMembers: 2,
      roster: [{ id: accountId, name: 'Avery Chen', role: 'Commissioner' }, { id: 'other-player', name: 'Jordan Lee', role: 'Player' }] };
    state.ballots = {}; state.bets = {}; state.results = {}; state.audit = []; state.history = []; state.consensusHistory = []; state.archivedCount = 0;
    const report = { state, errors: [], requests: [], responses: [], revision: 0, personalRevision: 0, committed: 0,
      now: '2026-10-08T18:06:00.000Z', failure: null };
    const historical = sourceSnapshot(state.games, true), latest = sourceSnapshot(state.games); latest.history = [historical];
    report.submit = (mode, picks, historicalSave = false) => {
      const sample = historicalSave ? historical : latest, savedAt = historicalSave ? oldSaved : report.now;
      const market = mode === 'guess_total' ? 'total' : 'spread';
      const references = Object.fromEntries(sample.payload.games.map(game => {
        const quotes = game.markets[market].quotes.map(q => ({ book: q.book, value: q.value, observedAt: q.providerObservedAt, collectedAt: q.collectedAt }));
        return [game.id, { status: 'available', value: quotes[1].value, source: 'The Odds API · 3-book median', sourceUrl: 'https://the-odds-api.com/',
          snapshotId: sample.id, observedAt: quotes[0].observedAt, capturedAt: sample.payload.fetchedAt, savedAt, quotes }];
      }));
      state.ballots[accountId] ||= {};
      state.ballots[accountId][mode] = { picks: structuredClone(picks), submittedAt: savedAt, updatedAt: savedAt, scoringReferences: references, scoringPolicy: 'submission-time' };
    };
    report.view = mode => {
      const view = createEngine(state, { clock: () => Date.parse(report.now) }).view(accountId, mode);
      return applySportsbookSources(applyMarketView({ ...view, localOnly: false, revision: report.revision, weeklyRevision: report.revision,
        predictionRevision: report.revision, ballotScope: 'weekly' }, latest, Date.parse(report.now)), latest, Date.parse(report.now));
    };
    const personal = () => ({ scope: 'account_private', revision: report.personalRevision, weeklyRevision: report.revision,
      season: state.league.season, week: state.league.week, now: report.now, deadline: state.league.deadline,
      slates: [{ season: state.league.season, week: state.league.week }], games: state.games,
      ballots: structuredClone(state.ballots[accountId] || {}), favorites: [], forecasts: [], journal: [], nextCursor: null });
    const user = { id: accountId, aud: 'authenticated', role: 'authenticated', email: 'avery@example.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-10-08T00:00:00Z' };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: accountId, aud: 'authenticated', exp: expires })).toString('base64url')}.test-signature`;
    const session = { access_token: token, refresh_token: 'test-only', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
    page.on('pageerror', error => report.errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      if (isWebfont(url)) return route.abort(); if (url.origin !== 'https://gtl-frontend-check.supabase.co') { report.errors.push(`Unexpected external origin: ${url.origin}`); return route.abort(); }
      const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (url.pathname === '/auth/v1/token') return reply(200, session);
      if (url.pathname === '/auth/v1/user') return reply(200, user);
      // D-21 community routes are not part of these fixtures; answer as an undeployed function.
      if (url.pathname.includes('/gtl-api/community/')) return reply(404, { error: 'Not found.' });
      if (url.pathname === '/auth/v1/logout') return reply(200, {});
      const endpoint = url.pathname.replace('/functions/v1/gtl-api/', '');
      const body = request.method() === 'POST' ? request.postDataJSON() : null;
      report.requests.push({ endpoint, body });
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      if (endpoint === 'social/read') return reply(200, await emptySocialRead(request, accountId,
        [{ season: state.league.season, week: state.league.week, games: state.games }]));
      if (endpoint === 'lobby') return reply(200, { profile: { id: accountId, displayName: 'Avery Chen' }, pendingInvites: [],
        leagues: [{ id: leagueId, name: state.league.name, format: 'duel', role: 'commissioner', memberCount: 2, maxMembers: 2, practice: false }] });
      if (endpoint === 'state') { const view = report.view(url.searchParams.get('mode') || 'guess_spread'); report.responses.push(view); return reply(200, view); }
      if (endpoint === 'personal' || endpoint === 'personal/read') return reply(200, personal());
      if (endpoint === 'ballot' || endpoint === 'personal/ballot') {
        if (report.failure) { const failure = new SubmissionOddsError(report.failure); report.failure = null; return reply(failure.status, { error: failure.message, code: failure.code, submitted: false }); }
        const mode = body.mode || url.searchParams.get('mode');
        expect(body.submit).toBe(true);
        expect(body.revision).toBe(endpoint === 'personal/ballot' ? report.personalRevision : report.revision);
        report.submit(mode, body.picks); report.revision++; report.committed++;
        if (endpoint === 'personal/ballot') { report.personalRevision++; return reply(200, { saved: true }); }
        return reply(200, report.view(mode));
      }
      report.errors.push(`Unexpected endpoint: ${endpoint}`); return reply(404, { error: 'Unexpected test request' });
    });
    try { await use(report); expect(report.errors).toEqual([]); } finally { await page.unroute('**/*'); }
  },
});

async function signIn(page) {
  await page.goto('/'); await page.getByLabel('Email', { exact: true }).fill('avery@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.locator('.auth-form').getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function openGame(page) { await signIn(page); await page.getByRole('button', { name: 'Open game', exact: true }).click(); await expect(page.locator('.sidebar')).toBeAttached(); }
async function navigate(page, label) {
  await expect(page.locator('.sidebar')).toBeAttached();
  const toggle = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await toggle.isVisible()) { await toggle.click(); await expect(page.locator('.sidebar')).toHaveClass(/is-open/); }
  await page.getByRole('button', { name: label, exact: true }).first().click();
}

for (const width of [1440, 320]) test(`dashboard reveals exact sportsbook evidence with distinct saved and stale latest values at ${width}px`, async ({ page, sources }) => {
  sources.submit('guess_spread', Object.fromEntries(sources.state.games.map(game => [game.id, -3])), true);
  sources.now = '2026-10-08T18:12:00.000Z';
  await page.setViewportSize({ width, height: 1000 }); await openGame(page);
  const matchup = page.locator('.gap-game').filter({ hasText: 'TB' }).first();
  await matchup.locator(':scope > summary').click();
  const panel = matchup.getByRole('region', { name: 'Spread sportsbook sources for TB at DAL', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Saved scoring consensus', exact: true })).toContainText('DAL −3.5');
  await expect(panel.getByRole('region', { name: 'Saved scoring consensus', exact: true })).toContainText('Line at your guess');
  await expect(panel.getByRole('region', { name: 'Latest collected consensus', exact: true })).toContainText('DAL −6.5');
  await expect(panel).toContainText('Stale collection');
  const details = panel.locator('.sportsbook-source-details'); await details.locator(':scope > summary').press('Enter');
  await expect(details).toHaveAttribute('open', '');
  const rows = details.locator('tbody tr'); await expect(rows).toHaveCount(4);
  await expect(rows.locator('th > strong')).toHaveText(['DraftKings', 'FanDuel', 'BetMGM', 'Caesars']);
  await expect(rows.first()).toContainText('Included when saved'); await expect(rows.first()).toContainText('Excluded from new scoring');
  await expect(rows.first()).toContainText('not a fresh scoring reference now');
  await expect(rows.first().locator('time').first()).toHaveAttribute('datetime', oldObserved);
  await expect(rows.first().locator('time').last()).toHaveAttribute('title', newCollected);
  await expect(rows.last()).toContainText('Unavailable on the current free provider plan');
  await expect(panel.getByRole('complementary', { name: 'Action Network consensus status' })).toContainText('Not connected');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.screenshot({ path: `.local/previews/sportsbook-integrated-${width}-dark.png` });
  await navigate(page, 'Settings & setup'); await page.getByLabel('Color theme').selectOption('light'); await navigate(page, 'Dashboard');
  await page.locator('.gap-game').filter({ hasText: 'TB' }).first().locator(':scope > summary').click();
  const light = page.getByRole('region', { name: 'Spread sportsbook sources for TB at DAL', exact: true });
  await light.locator('.sportsbook-source-details > summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await light.screenshot({ path: `.local/previews/sportsbook-integrated-${width}-light.png` });
  expect(sources.committed).toBe(0);
});

test('unsubmitted Total cannot receive or render the Spread sportsbook projection', async ({ page, sources }) => {
  sources.submit('guess_spread', Object.fromEntries(sources.state.games.map(game => [game.id, -3])), true);
  await openGame(page); await page.locator('.dashboard-market-tabs').getByRole('button', { name: 'Total', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your ballot comes first', exact: true })).toBeVisible();
  await expect(page.locator('.sportsbook-sources')).toHaveCount(0);
  const hidden = sources.responses.find(view => view.mode === 'guess_total');
  expect(hidden.revealed).toBe(false); expect(hidden.games.every(game => !game.sportsbookSources && !game.currentConsensus && !game.scoringReference)).toBe(true);
});

// October 12, 2026 (D-27): a refresh limit never refuses a save; these are the only coded refusals the server still returns.
for (const code of ['GTL_SUBMISSION_QUOTES_REQUIRED', 'GTL_SUBMISSION_CHECK_UNAVAILABLE']) test(`failed group submission ${code} preserves full draft and review; manual retry reveals`, async ({ page, sources }) => {
  sources.failure = code; await page.setViewportSize({ width: 390, height: 844 }); await openGame(page); await navigate(page, 'My picks');
  const values = ['-3.5', '2', '-1'], games = sources.state.games;
  for (const [index, game] of games.entries()) await pickSpread(page, `${game.awayCode} at ${game.homeCode} home spread`, values[index]);
  await page.getByRole('button', { name: 'Review & submit', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Submit your spread ballot?' });
  const submit = review.getByRole('button', { name: 'Submit & reveal analysis', exact: true });
  await submit.click(); await expect(review.getByRole('alert')).toContainText('Your guesses were not submitted');
  await expect(review).toBeVisible(); await expect(review.getByRole('listitem')).toHaveCount(3);
  await expect(page.locator('.sportsbook-sources')).toHaveCount(0);
  for (const [index, game] of games.entries()) await expectPick(page, `${game.awayCode} at ${game.homeCode} home spread`, spreadText(game.awayCode, game.homeCode, values[index]));
  expect(sources.state.ballots).toEqual({}); expect(sources.committed).toBe(0); expect(sources.revision).toBe(0);
  const tabDraft = await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('gtl.tab-draft.v1.')).map(key => JSON.parse(sessionStorage.getItem(key))));
  expect(tabDraft).toHaveLength(1); expect(Object.values(tabDraft[0].draft)).toEqual(values);
  await expect(submit).toBeEnabled(); await submit.click();
  await expect(page.getByRole('heading', { name: 'Your spread analysis', exact: true })).toBeVisible();
  expect(sources.committed).toBe(1); expect(sources.revision).toBe(1);
  const attempts = sources.requests.filter(request => request.endpoint === 'ballot');
  expect(attempts).toHaveLength(2); expect(attempts[0].body).toEqual(attempts[1].body);
  expect(sources.view('guess_spread').revealed).toBe(true); expect(sources.view('guess_total').revealed).toBe(false);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('gtl.tab-draft.v1.')))).toEqual([]);
});

test('Solo quote failure preserves typed guesses and review in the mounted form; retry commits once', async ({ page, sources }) => {
  sources.failure = 'GTL_SUBMISSION_QUOTES_REQUIRED'; await page.setViewportSize({ width: 320, height: 844 }); await signIn(page);
  await page.getByRole('button', { name: 'Open Solo', exact: true }).click(); await page.getByRole('button', { name: 'Guesses', exact: true }).click();
  const values = ['-2.5', '3', '-4'];
  for (const [index, game] of sources.state.games.entries()) await page.getByLabel(`${game.id} Spread guess`).fill(values[index]);
  await page.getByRole('button', { name: 'Review full ballot', exact: true }).click();
  const review = page.getByRole('region', { name: 'Review full ballot', exact: true });
  await review.getByRole('button', { name: 'Submit Spread guesses', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be verified'); await expect(review).toBeVisible();
  for (const [index, game] of sources.state.games.entries()) await expect(page.getByLabel(`${game.id} Spread guess`)).toHaveValue(values[index]);
  expect(sources.state.ballots).toEqual({}); expect(sources.committed).toBe(0);
  await expect(page.locator('.line-at-guess')).toHaveCount(0);
  // Solo retention is in mounted React state, not an account save or tab-recovery guarantee.
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('gtl.tab-draft.v1.')))).toEqual([]);
  await review.getByRole('button', { name: 'Submit Spread guesses', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Spread ballot saved with scoring references');
  expect(sources.committed).toBe(1);
  const attempts = sources.requests.filter(request => request.endpoint === 'personal/ballot');
  expect(attempts).toHaveLength(2); expect(attempts[0].body).toEqual(attempts[1].body);
  expect(sources.state.ballots[accountId].guess_total).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
