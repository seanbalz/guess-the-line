import { handlePersonal, PERSONAL_METHODS, PersonalError, providerPersonalError } from './personal.mjs';
import { handleSocial, SOCIAL_METHODS, SocialError, providerSocialError } from './social.mjs';
import { handleCommunity, COMMUNITY_METHODS, CommunityError, providerCommunityError } from './community.mjs';
import { NFLVERSE_SCHEDULE_URL } from '../shared/nfl-schedule.mjs';
import { applyDecisionAnalysisView } from './decision-analysis.mjs';
import { RESULTS_METHODS, ResultError, providerResultError, handleResultReview, applyReviewedResults } from './results.mjs';
import { applyMarketView } from './market-view.mjs';
import { applySportsbookSources } from './sportsbook-sources.mjs';
import { runSubmissionWithFreshOdds, SubmissionOddsError } from './submission-odds.mjs';
import { collectSubmissionOdds } from './submission-collection.mjs';
import { applyScoringBenchmark } from './scoring-view.mjs';
import { applyProvisionalAnalysisView } from './total-analysis-view.mjs';
import { BENCHMARK_METHODS, BenchmarkError, handleBenchmarkFreeze, providerBenchmarkError } from './benchmark.mjs';
import { createEngine } from '../server/engine.mjs';
import { MODES } from '../server/domain.mjs';
import { handleOddsCollection, ODDS_METHODS, OddsCollectionError, providerCollectionError } from './odds-collection.mjs';
import { weeklyView, WeeklyError, providerWeeklyError } from './weekly.mjs';
import { handleLobby, LOBBY_METHODS, LobbyError, normalizeEmail, providerLobbyError } from './lobby.mjs';
import { handleVirtualUnits, VIRTUAL_METHODS, VirtualUnitsError, providerVirtualError } from './virtual-units.mjs';
import { handlePush, PUSH_METHODS, PushError, providerPushError } from './push.mjs';

const MAX_BODY_BYTES = 32 * 1024;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_VALIDATION_ERRORS = new Set([
  'Unknown game mode.', 'Unknown prediction game.', 'Unknown matchup.', 'Invalid ballot.',
  'The prediction deadline has passed. Commissioner adjudication is required.',
  'This ballot is submitted and permanently locked. Competition guesses cannot be changed.',
  'Enter a number in half-point increments.', 'Combined points must be between 0 and 200.',
  'Spread must be between −100 and +100.', 'Choose a spread side or an over/under side.',
  'Enter American odds, such as −110 or +120.', 'A named quote source is required.',
  'Use a pre-kickoff quote from the last six hours.', 'Selections are closed after scheduled kickoff.',
  'Submit the matching prediction ballot before viewing or selecting this market.',
  'One selection per game. The recorded quote is immutable.',
  'Invalid selection.', 'Choose a spread or total market.',
  'You sat out this week for that market. Its picks are closed.',
]);

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new RequestError(status, message); };
const json = (value, status = 200, extraHeaders = {}) => new Response(JSON.stringify(value), {
  status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
});
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

async function readJson(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    fail(415, 'Send the request as JSON.');
  }
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) fail(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'A JSON object is required.');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        fail(413, 'Request is too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail(400, 'A valid JSON object is required.'); }
  if (!isRecord(body)) fail(400, 'A JSON object is required.');
  return body;
}

function onlyKeys(value, allowed) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(400, 'Unexpected request field. Player identity comes from sign-in.');
}

/**
 * authenticate verifies the token with the identity provider, never by merely decoding it.
 * storage returns private records; this handler authenticates and checks active membership first.
 * weekly saves atomically validate and advance the shared user/week revision.
 * Legacy league entry JSON is never written by this handler.
 */
export function createCloudHandler({ authenticate, storage, weekly, lobby, personal, social, community, results, odds, oddsProvider, virtual, push, pushPublicKey, leagueId: defaultLeagueId = 'sean-troy-luke', siteUrl, clock = Date.now, uuid = () => crypto.randomUUID() }) {
  // October 12, 2026: a refresh is attempted when useful and never required; commit() is the authority.
  async function submitWithFreshOdds(user, intent, commit) {
    if (!odds?.rpc) return commit();
    return runSubmissionWithFreshOdds({
      preflight: () => odds.rpc('gtl_preflight_submission', { p_user: user.id, p_intent: intent }),
      collect: ({ requestId }) => collectSubmissionOdds({ user, intent, service: odds, provider: oddsProvider, requestId, uuid }),
      requestId: uuid(), commit,
    });
  }
  async function loadResultState(saved, userId, leagueId) {
    if (!results?.read) return saved;
    try {
      const document = await results.read(userId, leagueId);
      if (!document || document.season !== saved.state.league.season || document.week !== saved.state.league.week || !isRecord(document.games)) throw new Error('Invalid result scope.');
      return { ...saved, state: applyReviewedResults({ ...saved.state, results: {} }, document, clock()), resultServiceStatus: 'available' };
    } catch {
      // A failed correction read must not present an obsolete result as current.
      return { ...saved, state: { ...saved.state, results: {} }, resultServiceStatus: 'unavailable' };
    }
  }
  function resultView(view, saved, member, leagueId) {
    const result = { ...view, ...(saved.resultServiceStatus ? { resultServiceStatus: saved.resultServiceStatus } : {}) };
    if (leagueId === 'sean-troy-luke' && member.player_id === 'sean' && member.role === 'commissioner') {
      result.resultReview = { available: saved.resultServiceStatus === 'available', games: saved.resultServiceStatus === 'available' ? saved.state.results : {}, verification: 'Commissioner-reported final; not independently verified' };
    }
    return result;
  }
  async function marketView(view, userId, leagueId) {
    const challenge = view.mode === 'betting_challenge';
    if (challenge ? !(view.marketAccess?.spread || view.marketAccess?.total) : !view.revealed || !['guess_spread', 'guess_total'].includes(view.mode)) return view;
    let result = view;
    if (odds?.marketSnapshot) {
      try {
        const snapshot = await odds.marketSnapshot(userId, leagueId);
        result = applySportsbookSources(applyMarketView(view, snapshot, clock()), snapshot, clock());
      }
      catch { result = { ...applySportsbookSources(view, null, clock()), marketFeed: { status: 'unavailable', source: 'The Odds API', automatic: false, officialVerified: false } }; }
    }
    if (challenge) return result;
    if (view.scoringPolicy !== 'submission-time' && view.mode === 'guess_spread' && odds?.scoringBenchmark) {
      try { result = applyScoringBenchmark(result, await odds.scoringBenchmark(userId, leagueId), clock()); }
      catch { /* A benchmark read must never undo or hide a successfully saved entry. */ }
    }
    result = applyProvisionalAnalysisView(result, clock());
    if (personal?.readForecasts) {
      try {
        result = applyDecisionAnalysisView(result, {
          forecasts: await personal.readForecasts(userId, view.league.season, view.league.week),
          ownerId: userId,
        }, clock());
      } catch { /* A missing personal forecast must not hide saved picks or market evidence. */ }
    }
    if (odds?.scheduleMetadata) {
      try { result = { ...result, oddsSchedule: await odds.scheduleMetadata(userId, leagueId) }; }
      catch { /* Absence means unknown; never invent an active scheduler. */ }
    }
    return result;
  }
  return async function handle(request) {
    try {
      const url = new URL(request.url);
      const route = url.pathname.replace(/^\/(?:functions\/v1\/)?gtl-api(?=\/)/, '');
      const methods = { '/state': ['GET'], '/export': ['GET'], '/ballot': ['POST'], '/bet': ['POST'], ...LOBBY_METHODS, ...PERSONAL_METHODS, ...SOCIAL_METHODS, ...COMMUNITY_METHODS, ...RESULTS_METHODS, ...ODDS_METHODS, ...BENCHMARK_METHODS, ...VIRTUAL_METHODS, ...PUSH_METHODS };
      if (!Object.hasOwn(methods, route)) return json({ error: 'Not found.' }, 404);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (!methods[route].includes(request.method)) return json({ error: 'Method not allowed.' }, 405, { Allow: [...methods[route], 'OPTIONS'].join(', ') });
      const gameRoute = ['/state', '/export', '/ballot', '/bet'].includes(route);
      const allowedQueries = [...(gameRoute || ['/invites', '/invite/revoke', '/benchmark/freeze', '/virtual-units', '/virtual-pick'].includes(route) ? ['league'] : []), ...(['/state', '/ballot'].includes(route) ? ['mode'] : [])];
      for (const key of url.searchParams.keys()) {
        if (!allowedQueries.includes(key) || url.searchParams.getAll(key).length !== 1) fail(400, 'Unexpected query parameter. Player identity comes from sign-in.');
      }
      const mode = url.searchParams.get('mode') || 'guess_spread';
      if (!MODES.includes(mode)) fail(400, 'Unknown game mode.');
      const leagueId = url.searchParams.get('league') || defaultLeagueId;
      if (!/^(?:sean-troy-luke|g_[0-9a-f]{32})$/.test(leagueId)) fail(400, 'Invalid game identifier.');
      const match = /^Bearer ([^\s,]+)$/i.exec(request.headers.get('authorization') || '');
      if (!match || match[1].length > 16384) fail(401, 'Sign in to continue.');
      const user = await authenticate(match[1]);
      if (!user || !UUID.test(user.id || '') || user.is_anonymous === true) fail(401, 'Sign in to continue.');
      if (user.emailConfirmed !== true || !normalizeEmail(user.email)) fail(403, 'Confirm your email address before using private games.');

      let body;
      if (request.method === 'POST') {
        body = await readJson(request);
      }
      if (Object.hasOwn(SOCIAL_METHODS, route)) return json(await handleSocial({ route, body, user, service: social, clock }));
      if (Object.hasOwn(COMMUNITY_METHODS, route)) return json(await handleCommunity({ route, body, user, service: community, clock }));
      if (Object.hasOwn(PUSH_METHODS, route)) return json(await handlePush({ route, body, user, service: push, publicKey: pushPublicKey }));
      if (Object.hasOwn(PERSONAL_METHODS, route)) return json(await handlePersonal({ route, body, user, service: personal, clock,
        submitBallot: (payload, commit) => submitWithFreshOdds(user, {
          season: payload.season, week: payload.week, mode: payload.mode, revision: payload.weeklyRevision,
          picks: payload.picks, submit: payload.submit, personalRevision: payload.revision, requestId: payload.requestId,
        }, commit),
      }));
      if (Object.hasOwn(RESULTS_METHODS, route)) {
        const commissioner = await storage.membership(user.id, 'sean-troy-luke');
        if (!commissioner || commissioner.active !== true || commissioner.player_id !== 'sean' || commissioner.role !== 'commissioner') throw providerResultError('GTL_RESULT_FORBIDDEN');
        return json(await handleResultReview({ body, user, service: results, clock }));
      }
      if (Object.hasOwn(ODDS_METHODS, route)) {
        const commissioner = await storage.membership(user.id, 'sean-troy-luke');
        if (!commissioner || commissioner.active !== true || commissioner.player_id !== 'sean' || commissioner.role !== 'commissioner') fail(403, 'Only the original league commissioner can collect market data.');
        return json(await handleOddsCollection({ route, body, user, service: odds, provider: oddsProvider }));
      }
      if (Object.hasOwn(BENCHMARK_METHODS, route)) {
        const commissioner = await storage.membership(user.id, 'sean-troy-luke');
        if (!commissioner || commissioner.active !== true || commissioner.player_id !== 'sean' || commissioner.role !== 'commissioner') throw providerBenchmarkError('GTL_ODDS_FORBIDDEN');
        return json(await handleBenchmarkFreeze({ body, user, leagueId, service: odds }));
      }
      if (Object.hasOwn(VIRTUAL_METHODS, route)) {
        const member = await storage.membership(user.id, leagueId);
        if (!member || member.active !== true) throw providerVirtualError('GTL_FORBIDDEN');
        return json(await handleVirtualUnits({ route, body, user, leagueId, service: virtual, weekly, odds, clock }));
      }
      if (!gameRoute) return json(await handleLobby({ route, method: request.method, body, user, leagueId, service: lobby, siteUrl }));
      if (request.method === 'POST') {
        onlyKeys(body, route === '/ballot' ? ['revision', 'picks', 'submit'] : ['revision', 'gameId', 'market', 'side', 'line', 'odds', 'source', 'quotedAt', 'quoteReceipt']);
        if (!Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision === Number.MAX_SAFE_INTEGER) fail(400, 'A valid saved revision is required.');
        if (route === '/ballot' && Object.hasOwn(body, 'submit') && typeof body.submit !== 'boolean') fail(400, 'Submit must be true or false.');
      }
      const member = await storage.membership(user.id, leagueId);
      if (!member || member.active !== true || typeof member.player_id !== 'string') fail(403, 'Your account has not been added to this league.');
      let saved = await weekly.load(user.id, leagueId);
      if (!saved) fail(503, 'League data is not available yet.');
      if (saved.state?.league?.id !== leagueId || !Number.isSafeInteger(saved.revision) || saved.revision < 0) throw new Error('Invalid stored league.');
      if (!saved.state.league.roster.some(player => player.id === member.player_id)) fail(403, 'Your account has not been added to this league.');
      saved = await loadResultState(saved, user.id, leagueId);
      const engine = createEngine(saved.state, { clock, uuid });
      if (route === '/state') return json(await marketView(resultView(weeklyView(engine.view(member.player_id, mode), saved), saved, member, leagueId), user.id, leagueId));
      if (route === '/export') return json(weeklyView(engine.export(member.player_id), saved));
      if (body.revision !== saved.revision) fail(409, 'Your weekly entries changed on another device or in another group. Refresh before saving again.');

      try {
        route === '/ballot'
          ? engine.saveBallot(member.player_id, mode, body.picks, body.submit ?? false)
          : engine.saveBet(member.player_id, body);
      } catch (error) {
        if (SAFE_VALIDATION_ERRORS.has(error?.message) || /^Complete all \d{1,4} predictions before submitting\.$/.test(error?.message || '')) fail(400, error.message);
        throw error;
      }
      const commitBallot = () => weekly.saveBallot(user.id, leagueId, mode, saved.revision, body.picks, body.submit ?? false);
      const isSubmittedEdit = !!saved.state.ballots?.[member.player_id]?.[mode]?.submittedAt;
      const committed = route === '/ballot'
        ? body.submit === true || isSubmittedEdit
          ? await submitWithFreshOdds(user, { leagueId, mode, revision: saved.revision, picks: body.picks, submit: body.submit ?? false }, commitBallot)
          : await commitBallot()
        : await weekly.saveSelection(user.id, leagueId, saved.revision, Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'revision')));
      if (committed === null) fail(409, 'Your weekly entries changed on another device or in another group. Refresh before saving again.');
      if (committed !== saved.revision + 1) throw new Error('Invalid committed revision.');
      // Re-read the authoritative database timestamp, provenance, and shared revision.
      const refreshed = await loadResultState(await weekly.load(user.id, leagueId), user.id, leagueId);
      const freshEngine = createEngine(refreshed.state, { clock, uuid });
      return json(await marketView(resultView(weeklyView(freshEngine.view(member.player_id, route === '/bet' ? 'betting_challenge' : mode), refreshed), refreshed, member, leagueId), user.id, leagueId));
    } catch (error) {
      if (error instanceof RequestError || error instanceof PersonalError || error instanceof SocialError || error instanceof CommunityError || error instanceof ResultError || error instanceof LobbyError || error instanceof WeeklyError || error instanceof OddsCollectionError || error instanceof BenchmarkError || error instanceof SubmissionOddsError || error instanceof VirtualUnitsError || error instanceof PushError) return json({ error: error.message, ...(error instanceof SubmissionOddsError ? { code: error.code, submitted: false } : {}) }, error.status);
      // Provider payloads and internal errors may contain secrets or private state.
      return json({ error: 'The saved data service is temporarily unavailable. Please try again.' }, 503);
    }
  };
}

/** Native HTTP adapter. Service-role credentials never leave the server. */
export function createSupabaseAdapter({ url, anonKey, serviceRoleKey, fetchImpl = fetch, clock = Date.now }) {
  const base = new URL(url);
  if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) || base.username || base.password || base.pathname !== '/' || base.search || base.hash || !anonKey || !serviceRoleKey) throw new Error('Invalid service configuration.');
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' };
  async function request(path, options = {}) {
    return fetchImpl(new URL(path, base), { redirect: 'error', signal: AbortSignal.timeout(10000), ...options });
  }
  async function rest(table, query, options = {}) {
    const response = await request(`/rest/v1/${table}?${new URLSearchParams(query)}`, { ...options, headers: { ...headers, ...options.headers } });
    if (!response.ok) throw new Error('Storage request failed.');
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('Invalid storage response.');
    return rows[0] || null;
  }
  // The free public nflverse schedule file: slates (D-21/D-24) and Virtual Units finals (D-26) read the same bytes.
  async function publicSchedule() {
    const response = await fetchImpl(NFLVERSE_SCHEDULE_URL, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Public schedule unavailable.');
    return response.text();
  }
  async function weeklyRpc(name, body) {
    const response = await request(`/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) {
      let message;
      try { message = (await response.json())?.message; } catch { /* No provider payload leaks. */ }
      if (message === 'GTL_SUBMISSION_ODDS_REQUIRED') throw new SubmissionOddsError('GTL_SUBMISSION_QUOTES_REQUIRED');
      throw providerWeeklyError(message);
    }
    return response.json();
  }
  return {
    async authenticate(token) {
      const response = await request('/auth/v1/user', { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
      if ([401, 403].includes(response.status)) return null;
      if (!response.ok) throw new Error('Authentication service unavailable.');
      const user = await response.json();
      if (!UUID.test(user?.id || '') || user.is_anonymous === true || user.role !== 'authenticated') return null;
      return { id: user.id, is_anonymous: false, email: normalizeEmail(user.email), emailConfirmed: Number.isFinite(Date.parse(user.email_confirmed_at || '')) };
    },
    storage: {
      membership(userId, leagueId) {
        return rest('gtl_memberships', { select: 'player_id,active,role', user_id: `eq.${userId}`, league_id: `eq.${leagueId}`, active: 'eq.true', limit: '2' });
      },
      load(leagueId) {
        return rest('gtl_leagues', { select: 'state,revision', id: `eq.${leagueId}`, limit: '2' });
      },
      compareAndSwap(leagueId, revision, state) {
        return rest('gtl_leagues', { select: 'revision', id: `eq.${leagueId}`, revision: `eq.${revision}` }, {
          method: 'PATCH', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ state, revision: revision + 1, updated_at: new Date(clock()).toISOString() }),
        });
      },
    },
    odds: {
      async rpc(name, body) {
        const response = await request(`/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) {
          let message;
          try { message = (await response.json())?.message; } catch { /* No provider body in errors. */ }
          if (message === 'GTL_SUBMISSION_ODDS_REQUIRED') throw new SubmissionOddsError('GTL_SUBMISSION_QUOTES_REQUIRED');
          if (name === 'gtl_preflight_submission' || name.startsWith('gtl_begin_submission_') || name.startsWith('gtl_finish_submission_')) {
            for (const error of [providerWeeklyError(message), providerPersonalError(message), providerCollectionError(message)]) {
              if (error.status) { error.code = message; throw error; }
            }
          }
          const error = providerCollectionError(message); error.code = message; throw error;
        }
        return response.json();
      },
      async marketSnapshot(userId, leagueId) {
        const response = await request('/rest/v1/rpc/gtl_read_market_snapshot', { method: 'POST', headers, body: JSON.stringify({ p_user: userId, p_league: leagueId }) });
        if (!response.ok) throw new Error('Market snapshot unavailable.');
        return response.json();
      },
      async scoringBenchmark(userId, leagueId) {
        const response = await request('/rest/v1/rpc/gtl_read_scoring_benchmark', { method: 'POST', headers, body: JSON.stringify({ p_user: userId, p_league: leagueId }) });
        if (!response.ok) throw new Error('Scoring benchmark unavailable.');
        return response.json();
      },
      async scheduleMetadata(userId, leagueId) {
        const response = await request('/rest/v1/rpc/gtl_read_odds_schedule', { method: 'POST', headers, body: JSON.stringify({ p_user: userId, p_league: leagueId }) });
        if (!response.ok) throw new Error('Refresh metadata unavailable.');
        return response.json();
      },
      async freezeBenchmark(userId, leagueId, requestId, actualKickoff, sourceURL) {
        const response = await request('/rest/v1/rpc/gtl_freeze_benchmark', { method: 'POST', headers, body: JSON.stringify({ p_user: userId, p_league: leagueId, p_request: requestId, p_actual: actualKickoff, p_source: sourceURL }) });
        if (!response.ok) {
          let message;
          try { message = (await response.json())?.message; } catch { /* Never expose provider internals. */ }
          throw providerBenchmarkError(message);
        }
        return response.json();
      },
    },
    weekly: {
      load: (userId, leagueId) => weeklyRpc('gtl_read_weekly_state', { p_user: userId, p_league: leagueId }),
      saveBallot: (userId, leagueId, mode, revision, picks, submit) => weeklyRpc('gtl_save_weekly_ballot', {
        p_user: userId, p_league: leagueId, p_mode: mode, p_revision: revision, p_picks: picks, p_submit: submit,
      }),
      saveSelection: (userId, leagueId, revision, selection) => weeklyRpc('gtl_save_weekly_selection', {
        p_user: userId, p_league: leagueId, p_revision: revision, p_selection: selection,
      }),
    },
    virtual: {
      async read(userId, leagueId) {
        const response = await request('/rest/v1/rpc/gtl_read_virtual_units', { method: 'POST', headers, body: JSON.stringify({ p_user: userId, p_league: leagueId }) });
        if (!response.ok) { let message; try { message = (await response.json())?.message; } catch {} throw providerVirtualError(message); }
        return response.json();
      },
      async save(userId, leagueId, revision, body) {
        const response = await request('/rest/v1/rpc/gtl_save_virtual_units_pick', { method: 'POST', headers, body: JSON.stringify({ p_user: userId, p_league: leagueId, p_revision: revision, p_body: body }) });
        if (!response.ok) { let message; try { message = (await response.json())?.message; } catch {} throw providerVirtualError(message); }
        return response.json();
      },
      // D-26 settlement: the community commissioner check, the public finals file and the service-only RPC.
      async admin(userId) {
        const response = await request('/rest/v1/rpc/gtl_community_admin', { method: 'POST', headers, body: JSON.stringify({ p_user: userId }) });
        if (!response.ok) throw new Error('Commissioner check unavailable.');
        return (await response.json()) === true;
      },
      schedule: publicSchedule,
      async settle(season, week, results) {
        const response = await request('/rest/v1/rpc/gtl_settle_virtual_units', { method: 'POST', headers, body: JSON.stringify({ p_season: season, p_week: week, p_results: results }) });
        if (!response.ok) {
          let message; try { message = (await response.json())?.message; } catch { /* Provider details remain private. */ }
          const error = providerVirtualError(message); error.code = message; throw error;
        }
        return response.json();
      },
    },
    results: {
      async review(userId, body) {
        const response = await request('/rest/v1/rpc/gtl_review_final_result', { method: 'POST', headers, body: JSON.stringify({ p_user: userId, p_body: body }) });
        if (!response.ok) {
          let message; try { message = (await response.json())?.message; } catch { /* Private provider details stay server-side. */ }
          throw providerResultError(message);
        }
        return response.json();
      },
      async read(userId, leagueId) {
        const response = await request('/rest/v1/rpc/gtl_read_reviewed_results', { method: 'POST', headers, body: JSON.stringify({ p_user: userId, p_league: leagueId }) });
        if (!response.ok) throw new Error('Reviewed results unavailable.');
        return response.json();
      },
    },
    community: {
      schedule: publicSchedule,
      async rpc(name, body) {
        const response = await request(`/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) {
          let message;
          try { message = (await response.json())?.message; } catch { /* Provider details remain private. */ }
          throw providerCommunityError(message);
        }
        return response.json();
      },
    },
    social: {
      async rpc(name, body) {
        const response = await request(`/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) {
          let message;
          try { message = (await response.json())?.message; } catch { /* Provider details remain private. */ }
          throw providerSocialError(message);
        }
        return response.json();
      },
    },
    personal: {
      async readForecasts(userId, season, week) {
        if (!UUID.test(userId || '') || !Number.isInteger(season) || season < 2000 || season > 2200 || !Number.isInteger(week) || week < 1 || week > 25) throw new Error('Invalid forecast scope.');
        const query = new URLSearchParams({ select: 'game_id,market,value,saved_at,revision', user_id: `eq.${userId}`, season: `eq.${season}`, week: `eq.${week}`, limit: '65' });
        const response = await request(`/rest/v1/gtl_personal_forecasts?${query}`, { headers });
        if (!response.ok) throw new Error('Personal forecasts unavailable.');
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length > 64) throw new Error('Invalid forecast response.');
        return rows.map(row => ({ ownerId: userId, season, week, gameId: row.game_id, market: row.market, value: row.value, savedAt: row.saved_at, revision: row.revision }));
      },
      async rpc(name, body) {
        const response = await request(`/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) {
          let message;
          try { message = (await response.json())?.message; } catch { /* Private provider response is never returned. */ }
          if (message === 'GTL_SUBMISSION_ODDS_REQUIRED') throw new SubmissionOddsError('GTL_SUBMISSION_QUOTES_REQUIRED');
          throw providerPersonalError(message);
        }
        return response.json();
      },
    },
    // D-28 device subscriptions for web push reminders (service-only table and RPCs).
    push: {
      async rpc(name, body) {
        if (!['gtl_push_status', 'gtl_push_subscribe', 'gtl_push_unsubscribe'].includes(name)) throw new Error('Invalid reminder operation.');
        const response = await request(`/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) {
          let message;
          try { message = (await response.json())?.message; } catch { /* Provider details remain private. */ }
          throw providerPushError(message);
        }
        return response.json();
      },
    },
    lobby: {
      async rpc(name, body) {
        const response = await request(`/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) {
          let message;
          try { message = (await response.json())?.message; } catch { /* Never expose a provider error page. */ }
          throw providerLobbyError(message);
        }
        return response.json();
      },
    },
  };
}
