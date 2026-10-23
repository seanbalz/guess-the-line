import { handleTrends, TRENDS_METHODS, TrendsError, createTrendsService, createSeasonReader } from './trends.mjs';
import { handleFantasy, FANTASY_METHODS, FantasyError, createFantasyService } from './fantasy.mjs';
import { handlePersonal, PERSONAL_METHODS, PersonalError, providerPersonalError } from './personal.mjs';
import { handleSocial, SOCIAL_METHODS, SocialError, providerSocialError } from './social.mjs';
import { socialBetExport } from '../shared/social-export.mjs';
import { handleCommunity, COMMUNITY_METHODS, CommunityError, providerCommunityError, readForfeit, withForfeit } from './community.mjs';
import { handleOfficials, OFFICIALS_METHODS, OfficialsError, providerOfficialsError } from './officials.mjs';
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
import { weeklyView, WeeklyError, providerWeeklyError, BALLOT_LOCKED, BALLOT_LOCKED_MESSAGE } from './weekly.mjs';
import { handleLobby, LOBBY_METHODS, LobbyError, normalizeEmail, providerLobbyError } from './lobby.mjs';
import { handleVirtualUnits, VIRTUAL_METHODS, VirtualUnitsError, providerVirtualError } from './virtual-units.mjs';
// Kickoff wind forecast (D-34): the member read route and the server-only Open-Meteo provider.
import { handleWind, WIND_METHODS, WindError, providerWindError } from './wind.mjs';
import { createOpenMeteoProvider } from './open-meteo.mjs';
import { handlePush, PUSH_METHODS, PushError, providerPushError, validVapidPublicKey } from './push.mjs';
// Redesign route groups and the optional-RPC reader (build plan, stage 4).
import { handleLines, LINES_METHODS, LinesError, providerLinesError } from './lines.mjs';
import { createResearchProvider } from './trends-research.mjs';
import { TRENDS_SOURCE } from '../shared/trends.mjs';
import researchVenues from '../shared/nfl-venues.json' with { type: 'json' };
import researchCorrections from '../shared/trends-corrections.json' with { type: 'json' };
import { handleBets, BETS_METHODS, BetsError, providerBetsError } from './bets.mjs';
import { handleLeague, LEAGUE_METHODS, LeagueError, providerLeagueError } from './league.mjs';
import { handleMe, ME_METHODS, MeError, providerMeError } from './me.mjs';
import { createOptionalRpc, FUNCTION_NOT_FOUND } from './optional-rpc.mjs';
import { parseFeatureOff } from './feature-off.mjs';
import { readLiveRules } from './live-rules.mjs';
import { handleNba, NBA_METHODS, NbaError, providerNbaError } from './nba.mjs';
import { createNbaGamesCache } from './nba-games.mjs';

const MAX_BODY_BYTES = 32 * 1024;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Community RPCs whose migration may not be applied yet: a missing function answers 503 "not available right now". */
const OPTIONAL_COMMUNITY_RPCS = new Set(['gtl_read_guess_picks', 'gtl_forfeit_guess_week']);
const SAFE_VALIDATION_ERRORS = new Set([
  'Unknown game mode.', 'Unknown prediction game.', 'Unknown matchup.', 'Invalid ballot.',
  'The prediction deadline has passed. Commissioner adjudication is required.',
  // M-02 (redesign stage 18): the engine mirror's refusal of a change to a locked-in guess, answered 409 with its code.
  'Sent picks are final.',
  'Enter a number in half-point increments.', 'Combined points must be between 0 and 200.',
  'Spread must be between −100 and +100.', 'Choose a spread side or an over/under side.',
  'Enter American odds, such as −110 or +120.', 'A named quote source is required.',
  'Use a pre-kickoff quote from the last six hours.', 'Selections are closed after scheduled kickoff.',
  'Submit the matching prediction ballot before viewing or selecting this market.',
  'One selection per game. The recorded quote is immutable.',
  'Invalid selection.', 'Choose a spread or total market.',
  'You sat out this week for that market. Its picks are closed.',
]);

/**
 * The redesign's route groups (build plan, sections 3.1 and 3.3), wired here once. Each module owns its methods
 * map, handler and error map, so a later stage edits only its own module. Group routes take POST JSON bodies
 * and no query parameters; each handler gets the signed-in user, its own service and the optional-RPC reader.
 */
const ROUTE_GROUPS = Object.freeze([
  Object.freeze({ service: 'trends', methods: TRENDS_METHODS, handle: handleTrends, Error: TrendsError }),
  Object.freeze({ service: 'fantasy', methods: FANTASY_METHODS, handle: handleFantasy, Error: FantasyError }),
  Object.freeze({ service: 'lines', methods: LINES_METHODS, handle: handleLines, Error: LinesError }),
  Object.freeze({ service: 'bets', methods: BETS_METHODS, handle: handleBets, Error: BetsError }),
  Object.freeze({ service: 'league', methods: LEAGUE_METHODS, handle: handleLeague, Error: LeagueError }),
  Object.freeze({ service: 'me', methods: ME_METHODS, handle: handleMe, Error: MeError }),
]);
const GAME_METHODS = Object.freeze({ '/state': ['GET'], '/export': ['GET'], '/ballot': ['POST'], '/bet': ['POST'] });
/** Every module's methods map; a route belongs to exactly one (tests/route-modules.test.mjs). */
export const ROUTE_MODULES = Object.freeze({
  game: GAME_METHODS, lobby: LOBBY_METHODS, personal: PERSONAL_METHODS, social: SOCIAL_METHODS, community: COMMUNITY_METHODS,
  officials: OFFICIALS_METHODS, results: RESULTS_METHODS, odds: ODDS_METHODS, benchmark: BENCHMARK_METHODS, virtual: VIRTUAL_METHODS,
  wind: WIND_METHODS, push: PUSH_METHODS, nba: NBA_METHODS, ...Object.fromEntries(ROUTE_GROUPS.map(group => [group.service, group.methods])),
});
/** The merged route map: route → allowed methods. */
export const ROUTE_METHODS = Object.freeze(Object.assign({}, ...Object.values(ROUTE_MODULES)));

class RequestError extends Error {
  constructor(status, message, code) { super(message); this.status = status; if (code) this.code = code; }
}
/**
 * Refusal codes a reply carries beside its sentence, so a client can act on them (build plan stage 18): GTL_BALLOT_LOCKED
 * tells both apps the picks they hold are older than the final ones, and they reload instead of offering a retry.
 */
const PUBLIC_CODES = new Set([BALLOT_LOCKED, 'GTL_GAME_CLOSED']);
const fail = (status, message, code) => { throw new RequestError(status, message, code); };
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
export function createCloudHandler({ authenticate, storage, weekly, lobby, personal, social, community, officials, wind, results, odds, oddsProvider, virtual, push, pushPublicKey, lines, bets, nba, nbaGames, league, me, trends, fantasy, optionalRpc, featureOff, leagueId: defaultLeagueId = 'sean-troy-luke', siteUrl, clock = Date.now, uuid = () => crypto.randomUUID() }) {
  // Redesign stage 2 (push guard): reminders show only when this function holds a valid VAPID public key.
  // /community/read carries the boolean; the key itself goes out only on /push/status, as before.
  const pushConfigured = validVapidPublicKey(pushPublicKey);
  // Gate M off switches: the GTL_FEATURE_OFF secret's feature names (cloud/feature-off.mjs); a listed writer refuses.
  const featuresOff = parseFeatureOff(featureOff);
  const groupServices = { lines, bets, league, me, trends, fantasy };
  // The live Guess rules ride along with the views both apps render (build plan, section 3.4).
  // The read fails closed on an outage; only an explicitly missing RPC carries legacy rules.
  async function withRules(view, rules = readLiveRules(optionalRpc)) {
    const [result, live] = await Promise.all([view, rules]);
    return { ...result, rules: live };
  }
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
      const methods = ROUTE_METHODS;
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
      // Private NBA account tickets require verified Auth only, independent of NFL rosters and gates.
      if (Object.hasOwn(NBA_METHODS, route)) return json(await handleNba({ route, body, user, service: nba, gamesService: nbaGames }));
      // Stage 21 (M-04): the slip replies carry the live rules, which word the real-slip line lock.
      if (Object.hasOwn(SOCIAL_METHODS, route)) return json(await handleSocial({ route, body, user, service: social, clock, rules: () => readLiveRules(optionalRpc) }));
      if (Object.hasOwn(COMMUNITY_METHODS, route)) {
        if (route === '/community/read') {
          // One clock reading for the feed and its `forfeit` (M-03, read through the optional-RPC wrapper alongside the feed).
          // While GTL_FEATURE_OFF names `forfeit` the field says no forfeit is possible now (open false), since the writer refuses.
          const at = clock();
          const live = await readLiveRules(optionalRpc);
          const feed = handleCommunity({ route, body, user, service: community, clock: () => at, pushConfigured, featureOff: featuresOff, rules: live });
          return json(await withRules(withForfeit(feed, readForfeit(optionalRpc, user.id, at), { writerOff: featuresOff.has('forfeit') }), live));
        }
        const response = handleCommunity({ route, body, user, service: community, clock, pushConfigured, featureOff: featuresOff });
        return json(await (route === '/community/history' ? withRules(response) : response));
      }
      if (Object.hasOwn(OFFICIALS_METHODS, route)) return json(await handleOfficials({ route, body, user, service: officials }));
      if (Object.hasOwn(WIND_METHODS, route)) return json(await handleWind({ route, body, user, service: wind, uuid }));
      if (Object.hasOwn(PUSH_METHODS, route)) return json(await handlePush({ route, body, user, service: push, publicKey: pushPublicKey }));
      if (Object.hasOwn(PERSONAL_METHODS, route)) {
        // Read rules before a ballot write: a network failure must never silently permit the old editable flow.
        const needsRules = ['/personal', '/personal/read', '/personal/ballot'].includes(route);
        const live = needsRules ? await readLiveRules(optionalRpc) : null;
        if (route === '/personal/ballot' && body?.lockIn?.length && live?.sentFinal !== true) throw providerPersonalError('GTL_FEATURE_OFF');
        const result = handlePersonal({ route, body, user, service: personal, clock, featureOff: featuresOff,
          submitBallot: (payload, commit) => submitWithFreshOdds(user, {
            season: payload.season, week: payload.week, mode: payload.mode, revision: payload.weeklyRevision,
            picks: payload.picks, submit: payload.submit, personalRevision: payload.revision, requestId: payload.requestId,
          }, commit),
        });
        // /personal/read is /personal for a chosen week; both replies replace the same view on the client.
        if (route === '/personal' || route === '/personal/read') {
          const view = await result;
          if (live.perGameScoring === true) {
            const receipts = await Promise.all(['guess_spread', 'guess_total'].map(mode => personal.rpc('gtl_guess_score_receipt', {
              p_user: user.id, p_season: view.season, p_week: view.week, p_mode: mode, p_now: new Date(clock()).toISOString(),
            })));
            view.scoring = { guess_spread: receipts[0], guess_total: receipts[1] };
          }
          return json({ ...view, rules: live });
        }
        return json(await (route === '/personal/ballot' ? withRules(result, live) : result));
      }
      const group = ROUTE_GROUPS.find(candidate => Object.hasOwn(candidate.methods, route));
      if (group) return json(await group.handle({ route, method: request.method, body, user, service: groupServices[group.service], clock, uuid, optionalRpc, featureOff: featuresOff }));
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
        return json(await handleVirtualUnits({ route, body, user, leagueId, service: virtual, weekly, odds, optionalRpc, clock }));
      }
      if (!gameRoute) return json(await handleLobby({ route, method: request.method, body, user, leagueId, service: lobby, siteUrl }));
      if (request.method === 'POST') {
        onlyKeys(body, route === '/ballot' ? ['revision', 'picks', 'submit'] : ['revision', 'gameId', 'market', 'side', 'line', 'odds', 'source', 'quotedAt', 'quoteReceipt']);
        if (!Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision === Number.MAX_SAFE_INTEGER) fail(400, 'A valid saved revision is required.');
        if (route === '/ballot' && Object.hasOwn(body, 'submit') && typeof body.submit !== 'boolean') fail(400, 'Submit must be true or false.');
      }
      const member = await storage.membership(user.id, leagueId);
      if (!member || member.active !== true || typeof member.player_id !== 'string') fail(403, 'Your account has not been added to this league.');
      // The /state view, and the /ballot and /bet replies that replace it on the client, carry the live rules;
      // resolve them before any writer can run. A rules outage must not restore older editing rights.
      const rules = route === '/export' ? null : await readLiveRules(optionalRpc);
      let saved = await weekly.load(user.id, leagueId);
      if (!saved) fail(503, 'League data is not available yet.');
      if (saved.state?.league?.id !== leagueId || !Number.isSafeInteger(saved.revision) || saved.revision < 0) throw new Error('Invalid stored league.');
      if (!saved.state.league.roster.some(player => player.id === member.player_id)) fail(403, 'Your account has not been added to this league.');
      saved = await loadResultState(saved, user.id, leagueId);
      // M-02 mirror (stage 18): the engine refuses a change to a locked-in guess only once the live rules say sent picks are
      // final, so this deploy never runs ahead of the database rule.
      const engineOptions = { clock, uuid, sentFinal: rules?.sentFinal === true, perGameScoring: rules?.perGameScoring === true,
        lateWindow: rules?.lateWindow, eligibility: saved.eligibility };
      const engine = createEngine(saved.state, engineOptions);
      if (route === '/state') return json(await withRules(marketView(resultView(weeklyView(engine.view(member.player_id, mode), saved), saved, member, leagueId), user.id, leagueId), rules));
      if (route === '/export') {
        const shared = await handleSocial({ route: '/social/read', body: { allHistory: true, filters: { playerId: user.id } }, user, service: social, clock });
        return json({ ...weeklyView(engine.export(member.player_id), saved), socialBets: socialBetExport(shared, user.id) });
      }
      if (body.revision !== saved.revision) fail(409, 'Your weekly entries changed on another device or in another group. Refresh before saving again.');

      try {
        route === '/ballot'
          ? engine.saveBallot(member.player_id, mode, body.picks, body.submit ?? false)
          : engine.saveBet(member.player_id, body);
      } catch (error) {
        if (error?.message === BALLOT_LOCKED_MESSAGE) fail(409, error.message, BALLOT_LOCKED);
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
      const freshEngine = createEngine(refreshed.state, { ...engineOptions, eligibility: refreshed.eligibility });
      return json(await withRules(marketView(resultView(weeklyView(freshEngine.view(member.player_id, route === '/bet' ? 'betting_challenge' : mode), refreshed), refreshed, member, leagueId), user.id, leagueId), rules));
    } catch (error) {
      if (error instanceof RequestError || error instanceof NbaError || error instanceof PersonalError || error instanceof SocialError || error instanceof CommunityError || error instanceof OfficialsError || error instanceof ResultError || error instanceof LobbyError || error instanceof WeeklyError || error instanceof OddsCollectionError || error instanceof BenchmarkError || error instanceof SubmissionOddsError || error instanceof VirtualUnitsError || error instanceof WindError || error instanceof PushError || ROUTE_GROUPS.some(group => error instanceof group.Error)) return json({ error: error.message, ...(error instanceof SubmissionOddsError ? { code: error.code, submitted: false } : PUBLIC_CODES.has(error.code) ? { code: error.code } : {}) }, error.status);
      // Provider payloads and internal errors may contain secrets or private state.
      return json({ error: 'The saved data service is temporarily unavailable. Please try again.' }, 503);
    }
  };
}

/** Personal RPCs whose migration may be missing on the hosted project (M-09's notes): PostgREST's PGRST202 reads as off. */
const OPTIONAL_PERSONAL_RPCS = new Set(['gtl_read_game_notes', 'gtl_set_game_note']);

/** Native HTTP adapter. Service-role credentials never leave the server. */
export function createSupabaseAdapter({ url, anonKey, serviceRoleKey, fetchImpl = fetch, clock = Date.now, reviewedResearchFeed, researchSnapshotLoader }) {
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
  // Research must validate the same published history used by its offline
  // snapshot. The schedule mirror can contain different historical values.
  async function publicResearchHistory() {
    const response = await fetchImpl(TRENDS_SOURCE.url, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Public research history unavailable.');
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
  // One service-only RPC caller per redesign route group, mapped through that group's own error map (stage 4).
  function groupRpc(providerError, allowedNames) {
    return {
      async rpc(name, body) {
        if (typeof name !== 'string' || !/^gtl_[a-z0-9_]{1,60}$/.test(name) || allowedNames && !allowedNames.includes(name)) throw new Error('Invalid operation.');
        const response = await request(`/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) {
          let message, code;
          try { ({ message, code } = (await response.json()) ?? {}); } catch { /* Provider details remain private. */ }
          // A group RPC the hosted project does not have yet (its migration not applied, or rolled back) reads as off.
          if (response.status === 404 && code === FUNCTION_NOT_FOUND) {
            // The recommendations writer is the only new Bets RPC with an off
            // response. Preserve the untouched future Bets routes' generic error.
            if (providerError === providerBetsError && !['gtl_save_recommended_virtual_pick', 'gtl_read_bets'].includes(name)) throw providerError();
            throw providerError('GTL_FEATURE_OFF');
          }
          throw providerError(message);
        }
        return response.json();
      },
    };
  }
  // Current-account recommendations use only already stored rows. The caller first
  // checks active community membership and obtains the published signature through
  // gtl_personal_context. These exact filters never use a private group's week.
  async function recommendationState({ userId, season, week, signature, now }) {
    if (!UUID.test(userId || '') || !Number.isInteger(season) || !Number.isInteger(week) || !isRecord(signature) || !Number.isFinite(now)) throw new Error('Invalid recommendation scope.');
    const rows = async (table, query, max) => {
      const response = await request(`/rest/v1/${table}?${new URLSearchParams(query)}`, { headers });
      if (!response.ok) throw new Error('Recommendations storage unavailable.');
      const body = await response.json();
      if (!Array.isArray(body) || body.length > max) throw new Error('Invalid recommendations storage response.');
      return body;
    };
    const target = { season: `eq.${season}`, week: `eq.${week}` };
    const [snapshots, picks, settlements] = await Promise.all([
      rows('gtl_market_snapshots', { select: 'id,created_at,payload', ...target, slate_signature: `eq.${JSON.stringify(signature)}`,
        created_at: `lte.${new Date(now).toISOString()}`, order: 'created_at.desc,id.desc', limit: '20' }, 20),
      rows('gtl_virtual_units_picks', { select: 'game_id,market,selection,status,result,created_at,updated_at', user_id: `eq.${userId}`, ...target,
        order: 'game_id.asc,market.asc', limit: '65' }, 64),
      rows('gtl_virtual_units_settlements', { select: 'game_id,status,home,away,version,settled_at,observed_at,source,source_url', ...target,
        order: 'game_id.asc,version.desc', limit: '1001' }, 1000),
    ]);
    const history = snapshots.map(row => ({ id: row.id, createdAt: row.created_at, payload: row.payload }));
    return { snapshot: history.length ? { ...history[0], history } : null, picks, settlements };
  }
  return {
    nba: groupRpc(providerNbaError, ['gtl_nba_read_bets', 'gtl_nba_save_bet']),
    nbaGamesCache: createNbaGamesCache(groupRpc(providerNbaError, ['gtl_nba_claim_games', 'gtl_nba_finish_games'])),
    trends: createTrendsService({ rpc: groupRpc(providerLinesError).rpc, readSeason: createSeasonReader({ fetchImpl }), clock }),
    fantasy: createFantasyService({ fetchImpl, clock }),
    lines: { ...groupRpc(providerLinesError), research: createResearchProvider({ loadSchedule: publicResearchHistory, loadSnapshot: researchSnapshotLoader, reviewedFeed: reviewedResearchFeed, clock, venues: researchVenues, corrections: researchCorrections }) }, bets: { ...groupRpc(providerBetsError), recommendationState }, league: groupRpc(providerLeagueError), me: groupRpc(providerMeError),
    // New fields on old routes (build plan, section 3.3): PostgREST's PGRST202 for a missing function reads as "feature off".
    optionalRpc: createOptionalRpc((name, body) => request(`/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) })),
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
      // Redesign stage 20 line lock (cloud/line-lock.mjs): the newest published community week, the week
      // /community/read shows, and today's per-market reveal gate (D-23) while M-01's gtl_markets_visible is missing.
      async publishedWeek() {
        const row = await rest('gtl_weekly_slates', { select: 'season,week', order: 'season.desc,week.desc', limit: '1' });
        return row ? { season: row.season, week: row.week } : null;
      },
      async weekRevealed(userId, season, week, mode, now) {
        const response = await request('/rest/v1/rpc/gtl_week_revealed', { method: 'POST', headers, body: JSON.stringify({ p_user: userId, p_season: season, p_week: week, p_mode: mode, p_now: now }) });
        if (!response.ok) throw new Error('Line gate unavailable.');
        return (await response.json()) === true;
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
          let message, code;
          try { ({ message, code } = (await response.json()) ?? {}); } catch { /* Provider details remain private. */ }
          // M-08's reader before "apply M-08" and M-03's forfeit writer before "apply M-03" (PostgREST PGRST202) read as off;
          // every other community RPC answers as before.
          if (OPTIONAL_COMMUNITY_RPCS.has(name) && response.status === 404 && code === FUNCTION_NOT_FOUND) throw providerCommunityError('GTL_FEATURE_OFF');
          throw providerCommunityError(message);
        }
        return response.json();
      },
    },
    // Game referees for situational trends: the commissioner check and both RPCs are service-only.
    officials: {
      async rpc(name, body) {
        const response = await request(`/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) {
          let message;
          try { message = (await response.json())?.message; } catch { /* Provider details remain private. */ }
          throw providerOfficialsError(message);
        }
        return response.json();
      },
    },
    // Kickoff wind forecast (D-34): the RPCs are service-only; the provider makes its own Open-Meteo request
    // with Accept only, so the service headers above never leave for api.open-meteo.com. No key or secret.
    wind: {
      async rpc(name, body) {
        const response = await request(`/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) {
          let message;
          try { message = (await response.json())?.message; } catch { /* Provider details remain private. */ }
          throw providerWindError(message);
        }
        return response.json();
      },
      provider: createOpenMeteoProvider({ fetchImpl }),
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
          let message, code;
          try { ({ message, code } = (await response.json()) ?? {}); } catch { /* Private provider response is never returned. */ }
          if (message === 'GTL_SUBMISSION_ODDS_REQUIRED') throw new SubmissionOddsError('GTL_SUBMISSION_QUOTES_REQUIRED');
          // A notes RPC the hosted project does not have (M-09 before "apply M-09", or rolled back) reads as off. Any other
          // personal RPC answers as before: a missing old Solo function is an outage, never "not available right now".
          if (OPTIONAL_PERSONAL_RPCS.has(name) && response.status === 404 && code === FUNCTION_NOT_FOUND) throw providerPersonalError('GTL_FEATURE_OFF');
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
