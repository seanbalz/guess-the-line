// The gtl-nba-jobs worker: NBA build-out milestone N2 (docs/superpowers/specs/2026-11-10-nba-buildout-design.md, "N2"; D-85
// item 3). Server only; players see nothing. A machine-only endpoint that pg_cron dispatches (supabase/admin/nba_jobs_cron.sql)
// with a one-run capability verified in SQL (gtl_nba_claim_job), the gtl-epl-jobs / M-30 pattern. Each run does one job:
//   slate  9:00 AM and 3:00 PM Pacific. One BALLDONTLIE Games request for the Pacific date - 1 to + 1 through the existing NBA
//          lease and cooldown (gtl_nba_claim_games: 5-minute TTL, 15 s lease, 35 s global cooldown; a fresh cached range is
//          reused without a request), and one free Odds API /events read for the same days. shared/nba-slate.mjs links the two
//          by team and start time; gtl_nba_publish_slate stores the games (never deleting one) and counts unmatched events.
//   lines  once per Pacific game day, 90 minutes before its first tip-off, with one retry 30 minutes later only if the first
//          read spent no credit (gtl_nba_lines_plan decides). gtl_nba_begin_lines_read reserves 1 credit under the shared
//          budget row and lease, or records why NBA is refused (31-credit monthly cap, pause below 100, another collector's
//          lease); only a reservation makes the one 1-credit basketball_nba spreads request (DraftKings, FanDuel, BetMGM, with
//          BetRivers standing in, D-74). gtl_nba_finish_lines_read stores every game's line, qualified or not. A read never
//          begins in the hour before an NFL kickoff (D-85 item 7): SQL moves it earlier, or the run stops as nfl_window.
// Nothing due means no provider request at all. Every write goes through service RPCs; HTTP replies and logs carry counts and
// fixed reasons only, never a key, URL, provider text or line.
import { readRunBody } from './odds-refresh.mjs';
import { createOddsProvider } from './odds-provider.mjs';
import { cachedSnapshot, fetchNbaGameRange } from './nba-games.mjs';
import { nbaOddsApiName } from '../shared/nba-teams.mjs';
import { addDays, linkNbaSlate, nbaSpreadLine, pacificDate, pacificMidnight } from '../shared/nba-slate.mjs';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });

export const NBA_JOBS = Object.freeze(['slate', 'lines']);
/** The admitted RPCs: the run queue, the existing NBA BALLDONTLIE lease, the slate writer and the lines reservation pair. */
export const NBA_JOBS_RPCS = Object.freeze(['gtl_nba_claim_job', 'gtl_nba_finish_job', 'gtl_nba_claim_games', 'gtl_nba_finish_games',
  'gtl_nba_publish_slate', 'gtl_nba_lines_due', 'gtl_nba_begin_lines_read', 'gtl_nba_finish_lines_read']);
/** Kept in step with gtl_nba_finish_job (tests/nba-jobs.test.mjs checks the SQL names every one). */
export const NBA_SKIP_REASONS = Object.freeze(['not_due', 'nothing_due', 'source_busy', 'nba_paused', 'cost_review', 'budget_unknown', 'shared_paused',
  'nba_cap', 'nba_pause', 'odds_busy', 'nfl_window']);
export const NBA_FAIL_REASONS = Object.freeze(['source_unavailable', 'write_failed', 'provider_failed', 'job_failed']);
/** gtl_nba_begin_lines_read's refusals, as run reasons. */
export const NBA_REFUSALS = Object.freeze({ nba_paused: 'nba_paused', cost_review: 'cost_review', budget_unknown: 'budget_unknown',
  shared_paused: 'shared_paused', cap: 'nba_cap', pause: 'nba_pause', busy: 'odds_busy', nfl_window: 'nfl_window' });
/** The approved limits (D-85 item 3). SQL is the authority; the worker never asks for more. */
export const NBA_MONTHLY_CAP = 31;
export const NBA_PAUSE_BELOW = 100;
export const NBA_LINES_COST = 1;
/** BALLDONTLIE's lease lasts 15 seconds; a reservation older than that is never spent. */
const NBA_LEASE_MS = 15_000;
/** A cached BALLDONTLIE range this fresh is reused instead of a request (the board's TTL). */
const NBA_CACHE_TTL_MS = 5 * 60_000;
const SPORT = 'basketball_nba';

const CODES = new Set(['GTL_SCHEDULE_AUTH', 'GTL_SCHEDULE_RUN', 'GTL_SCHEDULE_EXPIRED', 'GTL_NBA_INVALID']);
class NbaJobsError extends Error { constructor(code) { super('Scheduled NBA jobs request failed.'); this.code = code; } }
class JobStop extends Error { constructor(reason, detail = {}) { super(reason); this.reason = reason; this.detail = detail; } }
const stop = (reason, detail) => { throw new JobStop(reason, detail); };
const list = value => (Array.isArray(value) ? value : []);

export function createNbaJobsAdapter({ url, serviceRoleKey, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password || !serviceRoleKey) throw new Error('Invalid NBA jobs configuration.');
  return {
    async rpc(name, body) {
      if (!NBA_JOBS_RPCS.includes(name)) throw new Error('Invalid NBA jobs operation.');
      const response = await fetchImpl(new URL(`/rest/v1/rpc/${name}`, base), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        let data;
        try { data = await response.json(); } catch { /* No raw provider error escapes. */ }
        throw new NbaJobsError(CODES.has(data?.message) ? data.message : 'UNAVAILABLE');
      }
      return response.json();
    },
  };
}

const validKey = key => typeof key === 'string' && key.length >= 8 && key.length <= 256 && !/\s/.test(key);

/** The worker's sources. A missing key fails only the job that needs it, before anything is reserved. */
export function createNbaSources({ oddsApiKey, ballDontLieKey, fetchImpl = fetch, clock = Date.now } = {}) {
  const odds = options => createOddsProvider({ apiKey: oddsApiKey, fetchImpl, clock, sport: SPORT, ...options });
  return {
    oddsReady: validKey(oddsApiKey),
    ballDontLieReady: typeof ballDontLieKey === 'string' && Boolean(ballDontLieKey.trim()),
    games: ({ date, observedAt }) => fetchNbaGameRange({ apiKey: ballDontLieKey, fetchImpl, date, observedAt }),
    // Free: the adapter stops on any reported cost.
    events: ({ commenceTimeFrom, commenceTimeTo }) => odds({ markets: ['spreads'] }).listEvents({ commenceTimeFrom, commenceTimeTo }),
    // One spreads market in one region: 1 credit, whatever the number of games.
    lines: ({ games, remainingCredits, reserveCredits }) => odds({ markets: ['spreads'], bookmakers: ['draftkings', 'fanduel', 'betmgm'], backupBooks: ['betrivers'] })
      .collect({ games, remainingCredits, reserveCredits }),
  };
}

const write = async (ctx, name, args) => { try { return await ctx.service.rpc(name, args); } catch { stop('write_failed'); } };
const quotaOf = quota => (quota && typeof quota === 'object'
  ? Object.fromEntries(['remaining', 'used', 'last'].map(key => [key, Number.isSafeInteger(quota[key]) && quota[key] >= 0 ? quota[key] : null]))
  : null);

/** The BALLDONTLIE range for `date` through the existing lease: `{games, observedAt, requested}`, or a reason to stop. */
async function ballDontLie(ctx, date) {
  if (!ctx.sources.ballDontLieReady) stop('source_unavailable');
  let snapshot;
  try { snapshot = cachedSnapshot(await ctx.service.rpc('gtl_nba_claim_games', { p_date: date, p_refresh: true })); } catch { stop('write_failed'); }
  if (snapshot.leaseToken) {
    const release = games => ctx.service.rpc('gtl_nba_finish_games', { p_date: date, p_token: snapshot.leaseToken, p_games: games }).catch(() => false);
    const age = ctx.clock() - Date.parse(snapshot.leasedAt);
    if (!Number.isFinite(age) || age < 0 || age >= NBA_LEASE_MS) { await release(null); stop('source_busy'); }
    let games;
    try { games = await ctx.sources.games({ date, observedAt: snapshot.leasedAt }); } catch { await release(null); stop('source_unavailable'); }
    // The board cache gets the same observation. A lease that ran out keeps the cache as it was, but this read stands.
    await release(games);
    return { games, observedAt: snapshot.leasedAt, requested: true };
  }
  if (Array.isArray(snapshot.games) && ctx.clock() - Date.parse(snapshot.observedAt) < NBA_CACHE_TTL_MS) {
    return { games: snapshot.games, observedAt: snapshot.observedAt, requested: false };
  }
  stop('source_busy');
}

async function slateJob(ctx) {
  const date = pacificDate(ctx.now);
  const { games, observedAt, requested } = await ballDontLie(ctx, date);
  let events = [], eventsRead = false, eventsCost = 0, quota = null, eventsInvalid = 0;
  if (ctx.sources.oddsReady) {
    try {
      const reply = await ctx.sources.events({ commenceTimeFrom: new Date(pacificMidnight(addDays(date, -1))).toISOString(),
        commenceTimeTo: new Date(pacificMidnight(addDays(date, 2))).toISOString() });
      events = list(reply?.events); eventsInvalid = Number(reply?.invalid) || 0; quota = quotaOf(reply?.quota); eventsRead = true;
    } catch (error) {
      // An unexpected cost on a free read is recorded, so SQL pauses NBA's paid reads for the month (cost_review).
      quota = quotaOf(error?.quota);
      if (error?.code === 'ODDS_QUOTA_COST') eventsCost = Math.max(1, quota?.last ?? 1);
    }
  }
  const { rows, counts } = linkNbaSlate({ games, events });
  const summary = { events: counts.events, linkedEvents: counts.linkedEvents, unmatchedEvents: counts.unmatchedEvents,
    unknownTeamEvents: counts.unknownTeamEvents, eventsCost, eventsRead, quota };
  const stored = await write(ctx, 'gtl_nba_publish_slate', { ...ctx.run, p_date: date, p_observed_at: observedAt, p_games: rows, p_summary: summary });
  return { date, requested, eventsRead, games: counts.games, unknownGames: counts.unknownGames, linkedGames: counts.linkedGames,
    unlinkedGames: counts.unlinkedGames, ambiguousGames: counts.ambiguousGames, events: counts.events, eventsInvalid,
    unmatchedEvents: counts.unmatchedEvents, unknownTeamEvents: counts.unknownTeamEvents, reversedEvents: counts.reversedEvents,
    inserted: Number(stored?.inserted) || 0, updated: Number(stored?.updated) || 0, keptFinal: Number(stored?.keptFinal) || 0,
    keptStart: Number(stored?.keptStart) || 0, linkConflicts: Number(stored?.linkConflicts) || 0 };
}

const providerId = gameId => `nba-${String(gameId).split(':')[2]}`;

async function linesJob(ctx) {
  const due = await write(ctx, 'gtl_nba_lines_due', ctx.run);
  if (!due) stop('nothing_due');
  // Inside the hour before an NFL kickoff nothing begins; the read follows once the window has passed (D-85 item 7).
  if (due.state === 'wait') stop('nfl_window', { gameDate: due.gameDate, attempt: due.attempt });
  if (!ctx.sources.oddsReady) stop('source_unavailable');
  const begun = await write(ctx, 'gtl_nba_begin_lines_read', { ...ctx.run, p_game_date: due.gameDate });
  if (begun?.status === 'not_due') stop('nothing_due');
  if (begun?.status === 'refused') stop(NBA_REFUSALS[begun.reason] ?? 'nba_pause', { gameDate: begun.gameDate, attempt: begun.attempt, refusal: begun.reason ?? null });
  if (begun?.status !== 'ready' || typeof begun.attemptId !== 'string' || typeof begun.lease !== 'string') stop('job_failed');
  const stored = list(begun.games);
  const games =stored.map(g => ({ id: providerId(g.gameId), home: nbaOddsApiName(g.home), away: nbaOddsApiName(g.away),
    kickoff: new Date(Date.parse(g.commenceTime)).toISOString() }));
  let reply = null, error = null, quota = null;
  try {
    reply = await ctx.sources.lines({ games, remainingCredits: begun.remainingCredits, reserveCredits: begun.reserveCredits });
    quota = quotaOf(reply?.quota);
  } catch (e) { error = typeof e?.code === 'string' && /^ODDS_[A-Z_]+$/.test(e.code) ? e.code : 'ODDS_UNAVAILABLE'; quota = quotaOf(e?.quota); }
  const collectedAt = reply?.fetchedAt ?? null;
  const lines = reply ? stored.map(g => {
    const providerGame = list(reply.games).find(x => x?.gameId === providerId(g.gameId));
    const line = providerGame ? nbaSpreadLine(providerGame, { lockAt: g.lockAt, collectedAt }) : nbaSpreadLine(null, { lockAt: g.lockAt, collectedAt: null });
    return { gameId: g.gameId, oddsEventId: providerGame?.providerEventId ?? g.oddsEventId ?? null, ...line };
  }) : [];
  const finish = (p_error, p_lines) => ctx.service.rpc('gtl_nba_finish_lines_read', { p_attempt: begun.attemptId, p_lease: begun.lease, p_quota: quota, p_error, p_lines });
  let finished;
  try { finished = await finish(error, lines); } catch {
    // A result SQL refuses is never stored, but the lease and the provider's quota still are.
    try { finished = await finish('invalid_result', []); } catch { stop('write_failed'); }
  }
  const detail = { gameDate: begun.gameDate, attempt: begun.attempt, games: games.length, stored: Number(finished?.stored) || 0,
    qualified: Number(finished?.qualified) || 0, cost: Number.isSafeInteger(finished?.cost) ? finished.cost : null, error: finished?.error ?? null,
    matched: list(reply?.games).filter(x => x?.matchStatus === 'matched').length };
  if (finished?.error) return { reason: 'provider_failed', detail };
  return detail;
}

const JOBS = Object.freeze({ slate: slateJob, lines: linesJob });

/** Runs one claimed job: `{reason, detail}`, where a null reason means the job did its work. Never throws. */
export async function runNbaJob({ job, service, sources, now, clock = () => now, run }) {
  const fn = JOBS[job];
  if (!fn) return { reason: 'job_failed', detail: {} };
  try {
    const out = await fn({ service, sources, now, clock, run });
    if (out && Object.hasOwn(out, 'reason')) return { reason: out.reason, detail: out.detail ?? {} };
    return { reason: null, detail: out ?? {} };
  } catch (error) {
    return error instanceof JobStop ? { reason: error.reason, detail: error.detail ?? {} } : { reason: 'job_failed', detail: {} };
  }
}

const safe = (result, job) => ({ runId: result.runId, job: result.job ?? job, status: result.status, reason: result.reason ?? null });

export function createNbaJobsHandler({ service, sources, clock = Date.now, bodyTimeoutMs = 3000 }) {
  return async request => {
    try {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (new URL(request.url).search) return json({ error: 'Invalid NBA jobs request.' }, 400);
      const match = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') || '');
      if (!match) return json({ error: 'Unauthorized.' }, 401);
      const { runId } = await readRunBody(request, bodyTimeoutMs);
      const claim = await service.rpc('gtl_nba_claim_job', { p_token: match[1], p_run: runId });
      if (claim.replay) return json(safe(claim));
      const run = { p_run: runId, p_claim: claim.claim };
      // The server's clock from the claim decides the Pacific date; the worker's clock only times its own leases.
      const now = Number.isFinite(Date.parse(claim.now)) ? Date.parse(claim.now) : clock();
      const { reason, detail } = await runNbaJob({ job: claim.job, service, sources, now, clock, run });
      const result = await service.rpc('gtl_nba_finish_job', { ...run, p_reason: reason, p_detail: detail });
      console.info(`NBA ${claim.job}: ${result.status}${reason ? ` (${reason})` : ''}.`);
      return json(safe(result, claim.job));
    } catch (error) {
      if (error?.code === 'GTL_SCHEDULE_AUTH') return json({ error: 'Unauthorized.' }, 401);
      if (['INPUT', 'GTL_SCHEDULE_RUN'].includes(error?.code)) return json({ error: 'Invalid NBA jobs request.' }, 400);
      return json({ error: 'The scheduled NBA jobs service is temporarily unavailable.' }, 503);
    }
  };
}
