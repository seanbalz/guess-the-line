// Guess the Points scheduled jobs (D-56 P-03; .superpowers/sdd/p03-design.md, job steps 1-3). A machine-only endpoint,
// gtl-points-jobs, that pg_cron dispatches (supabase/admin/points_jobs_cron.sql) with a one-run capability verified in SQL
// (20261026120000_gtl_points_jobs.sql). Each run claims its capability, then does three steps, each on its own:
//   1. slate     publish a stored draft whose Tuesday 12:00 AM PT open (D-61) has arrived (the scheduler, actor null), or draft
//                the coming week from Track 1's newest estimate snapshot when that week has no slate yet;
//   2. actuals   load nflverse actuals for the newest two published weeks under way and not FINAL;
//   3. finalize  freeze every published week whose FINAL time has come.
// Every write goes through the P-01 functions (gtl_points_publish_slate, gtl_points_load_actuals, gtl_points_finalize),
// which re-check every rule against server time. The run summary, the reply and the logs carry week numbers, actions and
// counts only: never a player, guess, House value, hash, URL or credential.
import { readRunBody } from './odds-refresh.mjs';
import { createAssetReader, createFantasyService } from './fantasy.mjs';
import { fantasySeason } from '../shared/fantasy-refresh.mjs';
import { NFLVERSE, POINTS_RULES, actualsPayload, draftSlate, linesFor, rosterFacts, scheduleGames, weekSnaps, weekStats } from '../shared/points-jobs.mjs';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
const safe = result => ({ runId: result.runId, status: result.status, reason: result.reason ?? null });

/** The only RPCs the worker may call: its run queue, the jobs-state read and the three P-01 writers. */
export const POINTS_JOBS_RPCS = Object.freeze(['gtl_claim_points_jobs', 'gtl_complete_points_jobs', 'gtl_points_jobs_state', 'gtl_points_publish_slate', 'gtl_points_load_actuals', 'gtl_points_finalize']);
const CODES = new Set(['GTL_SCHEDULE_AUTH', 'GTL_SCHEDULE_RUN', 'GTL_SCHEDULE_EXPIRED', 'GTL_POINTS_INVALID', 'GTL_POINTS_FORBIDDEN', 'GTL_POINTS_NO_SLATE',
  'GTL_POINTS_SLATE_FIXED', 'GTL_POINTS_SLATE_INVALID', 'GTL_POINTS_NOT_OPEN', 'GTL_POINTS_TOO_LATE']);
class PointsJobsError extends Error { constructor(code) { super('Scheduled Points jobs request failed.'); this.code = code; } }

const MIB = 1024 * 1024;
/**
 * Fetch caps (design "Limits"): stats 16 MiB / 30 s; snaps and games 8 MiB / 20 s; roster 24 MiB / 30 s. The weekly-roster
 * file holds every week of the season: 5.74 MB through Week 7 of 2026 (about 0.8 MB a week, read October 23), so 8 MiB would
 * refuse it from about Week 10; 24 MiB leaves room for 18 weeks and the postseason.
 */
export const SOURCE_LIMITS = Object.freeze({
  stats: Object.freeze({ maxBytes: 16 * MIB, timeoutMs: 30_000 }),
  snaps: Object.freeze({ maxBytes: 8 * MIB, timeoutMs: 20_000 }),
  rosters: Object.freeze({ maxBytes: 24 * MIB, timeoutMs: 30_000 }),
  games: Object.freeze({ maxBytes: 8 * MIB, timeoutMs: 20_000 }),
});

export function createPointsJobsAdapter({ url, serviceRoleKey, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password || !serviceRoleKey) throw new Error('Invalid Points jobs configuration.');
  return {
    async rpc(name, body) {
      if (!POINTS_JOBS_RPCS.includes(name)) throw new Error('Invalid Points jobs operation.');
      const response = await fetchImpl(new URL(`/rest/v1/rpc/${name}`, base), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        let code;
        try { code = (await response.json()).message; } catch { /* No raw provider error escapes. */ }
        throw new PointsJobsError(CODES.has(code) ? code : 'UNAVAILABLE');
      }
      return response.json();
    },
  };
}

// The nflverse release assets (shared/points-jobs.mjs NFLVERSE): the release tag is the path segment after /download/.
const NFLVERSE_ASSET = /^https:\/\/github\.com\/nflverse\/nflverse-data\/releases\/download\/([A-Za-z0-9._-]+)\/[A-Za-z0-9._-]+$/;
const hex = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');

/**
 * The worker's public sources: Track 1's fantasy service (cloud/fantasy.mjs, read-only) and fetchText for the nflverse
 * release files. fetchText reuses Track 1's bounded asset reader (HTTPS GitHub redirects only, no credentials, the byte cap
 * enforced while reading, one timeout for the whole read) and adds the file's SHA-256, size, Last-Modified (as publishedAt,
 * or null), the retrieval time and the release tag. It never returns the signed redirect URL.
 */
export function createPointsSources({ fetchImpl = fetch, clock = Date.now } = {}) {
  return {
    fantasy: createFantasyService({ fetchImpl, clock }),
    async fetchText(url, { maxBytes, timeoutMs }) {
      const match = NFLVERSE_ASSET.exec(url);
      if (!match) throw new Error('Source refused.');
      let lastModified = null;
      // The reader's last request is the final response (redirects come first), so its Last-Modified is the file's.
      const read = createAssetReader({ fetchImpl: async (target, options) => { const response = await fetchImpl(target, options); lastModified = response.headers.get('last-modified'); return response; } });
      const bytes = await read(url, maxBytes, timeoutMs);
      if (!bytes) throw new Error('Source missing.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const published = Date.parse(lastModified ?? '');
      return { url, text, sha256: await hex(bytes), bytes: bytes.byteLength, publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null,
        retrievedAt: new Date(clock()).toISOString(), release: match[1] };
    },
  };
}

const at = value => Date.parse(value);
const byWeek = (a, b) => a.week - b.week;
const pad = n => String(n).padStart(2, '0');
const DRAFT_REASONS = { stale_snapshot: 'no_fresh_snapshot', kicked_off: 'kicked_off', no_games: 'no_games' };
const FINAL_REASONS = new Set(['unpublished', 'not_yet', 'pending_stats']);

async function publish(ctx, week, prior) {
  try {
    const result = await ctx.service.rpc('gtl_points_publish_slate', { p_actor: null, p_action: 'publish', p_season: ctx.season, p_week: week, p_slate: null });
    if (result?.replayed === true) return { week, action: prior ?? 'kept' };
    ctx.changed = true;
    return { week, action: 'published' };
  } catch (error) {
    // Server time decides: an open not yet reached, or a first kickoff already passed, is a safe no-op for this run.
    const reason = { GTL_POINTS_NOT_OPEN: 'not_open', GTL_POINTS_TOO_LATE: 'kicked_off' }[error?.code];
    if (!reason) ctx.failures.add('worker_error');
    return { week, action: prior ?? 'skipped', reason: reason ?? 'publish_refused' };
  }
}

/** Step 1. A stored draft (the scheduler's or the commissioner's) is never replaced; it is published once its open arrives. */
async function slateStep(ctx, state) {
  const { now, season, service, sources } = ctx;
  // Publishing reads nothing new, so a due draft opens on time even while Track 1 is unavailable.
  const due = state.slates.filter(s => s.status === 'draft' && at(s.opensAt) <= now && at(s.firstKickoff) > now).sort(byWeek).at(-1);
  if (due) return publish(ctx, due.week);
  let found;
  try { found = await sources.fantasy.week({ season, week: null }); } catch (error) {
    // 404: Track 1 has published nothing for the season (yet). Anything else is an unavailable source to look at.
    if (error?.status !== 404) ctx.failures.add('source_unavailable');
    return { action: 'skipped', reason: 'no_fresh_snapshot' };
  }
  const { snapshot, index } = found ?? {};
  const week = snapshot?.week;
  if (!Number.isInteger(week)) return { action: 'skipped', reason: 'no_fresh_snapshot' };
  const existing = state.slates.find(s => s.week === week);
  if (existing) return existing.status === 'draft' && at(existing.firstKickoff) <= now ? { week, action: 'skipped', reason: 'kicked_off' } : { week, action: 'kept' };
  const entry = index?.snapshots?.find(item => item.week === week);
  // No older snapshot is ever substituted (spec 3.1): the snapshot must be this season's week W built from stats through W-1.
  if (snapshot.season !== season || snapshot.statsThroughWeek !== week - 1 || !entry) return { week, action: 'skipped', reason: 'no_fresh_snapshot' };
  let games;
  try { games = (await ctx.games()).list; } catch { ctx.failures.add('source_unavailable'); return { week, action: 'skipped', reason: 'schedule_unavailable' }; }
  const drafted = draftSlate({ snapshot, snapshotFile: entry.file, snapshotSha256: entry.sha256, season, week, games, now });
  if (!drafted.ok) return { week, action: 'skipped', reason: DRAFT_REASONS[drafted.reason] ?? 'no_valid_slate' };
  // A scheduler draft replaces an unpublished slate (P-01), so the stored slates are read again just before it is sent: a
  // commissioner draft stored since the run's first read (while the snapshot and schedule were fetched) is kept. This
  // narrows the race to one round trip; it cannot close it, as P-01 has no compare-and-set for drafts.
  let current;
  try {
    current = await service.rpc('gtl_points_jobs_state', { p_season: season });
    if (!Array.isArray(current?.slates)) throw new Error('Invalid jobs state.');
  } catch { ctx.failures.add('worker_error'); return { week, action: 'skipped', reason: 'state_unavailable' }; }
  if (current.slates.some(s => s.week === week)) return { week, action: 'kept' };
  try {
    await service.rpc('gtl_points_publish_slate', { p_actor: null, p_action: 'draft', p_season: season, p_week: week, p_slate: drafted.slate });
  } catch (error) {
    if (error?.code === 'GTL_POINTS_SLATE_FIXED') return { week, action: 'kept' };
    ctx.failures.add('worker_error');
    return { week, action: 'skipped', reason: 'draft_refused' };
  }
  ctx.changed = true;
  // A draft made after its open (a late snapshot) is published in the same run, still never at or after its first kickoff.
  return now < at(drafted.slate.opensAt) ? { week, action: 'drafted' } : publish(ctx, week, 'drafted');
}

const settled = async task => { try { return { value: await task }; } catch { return { error: true }; } };

/** Every source the actuals step reads, fetched once per run, with every due week's lines pre-filtered in one pass. */
async function actualFiles(ctx, due) {
  const { season, sources } = ctx;
  const [stats, snaps, rosters, games] = await Promise.all([
    settled(sources.fetchText(NFLVERSE.stats(season), SOURCE_LIMITS.stats)), settled(sources.fetchText(NFLVERSE.snaps(season), SOURCE_LIMITS.snaps)),
    settled(sources.fetchText(NFLVERSE.rosters(season), SOURCE_LIMITS.rosters)), settled(ctx.games())]);
  const missing = [['stats', stats], ['snaps', snaps], ['roster', rosters], ['schedule', games]].find(([, file]) => file.error);
  if (missing) return { stats: stats.value, problem: `${missing[0]} unavailable` };
  try {
    // One scan of each season-wide file for all due weeks (Edge CPU); each week's parse then reads only these lines. The
    // trailing newline keeps a header-only result (no rows yet for a week, e.g. snaps after Thursday's kickoff) parseable.
    const weeks = due.map(s => `${season}_${pad(s.week)}_`);
    const narrow = (text, needles) => `${linesFor(text, needles)}\n`;
    return {
      stats: stats.value, snaps: snaps.value, rosters: rosters.value, games: games.value,
      statsLines: narrow(stats.value.text, weeks.map(w => `,${w}`)), snapLines: narrow(snaps.value.text, weeks),
      rosterLines: narrow(rosters.value.text, [...new Set(due.flatMap(s => s.slots.map(slot => slot.playerId)))]),
    };
  } catch { return { stats: stats.value, problem: 'source unreadable' }; }
}

/** Partial: a slate slot this load leaves unresolved (no played evidence, or played without points), or a stats row the loader cannot store. */
function partialCoverage(payload, slots, version) {
  const rows = new Map(payload.players.map(row => [row.playerId, row]));
  const open = slots.some(slot => {
    const row = rows.get(slot.playerId);
    if (!row) return true;
    if (row.played === false || row.team !== slot.team) return false;
    return row.played !== true || typeof row.points[version] !== 'number';
  });
  return open || payload.coverage.rowsWithoutNameOrTeam > 0;
}

function weekPayload({ season, slate, files }) {
  const { week } = slate;
  // Snaps-only players score 0 inside actualsPayload, which needs every player id in the week's stats rows.
  const { rows: statsRows, playerIds: statsPlayerIds, offPosition: statsOffPosition } = weekStats(files.statsLines, { season, week });
  const payload = actualsPayload({
    season, week, statsRows, statsPlayerIds, statsOffPosition, slots: slate.slots, versions: [POINTS_RULES.version], games: files.games.list,
    snaps: weekSnaps(files.snapLines, { season, week }),
    roster: rosterFacts(files.rosterLines, { season, week, playerIds: slate.slots.map(slot => slot.playerId) }),
    source: { url: files.stats.url, release: files.stats.release, publishedAt: files.stats.publishedAt, retrievedAt: files.stats.retrievedAt, sha256: files.stats.sha256 },
    coverage: { snapsSha256: files.snaps.sha256, rosterSha256: files.rosters.sha256, gamesSha256: files.games.sha256 },
  });
  payload.coverage.partial = partialCoverage(payload, slate.slots, POINTS_RULES.version);
  return payload;
}

async function loadWeek(ctx, slate, files) {
  const { season, service, now } = ctx, { week } = slate;
  // A loader that cannot reproduce the slate's pinned rules version writes no points (spec 4.4).
  if (slate.rulesVersion !== POINTS_RULES.version) { ctx.failures.add('worker_error'); return { week, status: 'skipped', rowsSaved: 0, partial: null, reason: 'rules_version' }; }
  let payload, problem = files.problem;
  if (!problem) { try { payload = weekPayload({ season, slate, files }); } catch { problem = 'source unreadable'; } }
  if (problem) {
    // Recorded as a failed load; the last good load stays and nothing is re-graded (spec 7).
    const stats = files.stats, url = NFLVERSE.stats(season);
    const source = { url, release: NFLVERSE_ASSET.exec(url)[1], retrievedAt: stats?.retrievedAt ?? new Date(now).toISOString(), ...(stats ? { publishedAt: stats.publishedAt, sha256: stats.sha256 } : {}) };
    try { await service.rpc('gtl_points_load_actuals', { p_payload: { season, week, status: 'failed', source, error: problem } }); } catch { ctx.failures.add('worker_error'); }
    ctx.failures.add('source_unavailable');
    return { week, status: 'failed', rowsSaved: 0, partial: null };
  }
  try {
    const result = await service.rpc('gtl_points_load_actuals', { p_payload: payload });
    if (result?.replayed === true) return { week, status: 'replayed', rowsSaved: 0, partial: payload.coverage.partial };
    ctx.changed = true;
    return { week, status: result?.status === 'skipped' ? 'skipped' : 'saved', rowsSaved: Number.isInteger(result?.rowsSaved) ? result.rowsSaved : 0, partial: payload.coverage.partial };
  } catch {
    ctx.failures.add('load_failed');
    return { week, status: 'refused', rowsSaved: 0, partial: payload.coverage.partial };
  }
}

/** Step 2: the newest two published weeks whose first kickoff has passed and that are not FINAL. */
async function actualsStep(ctx, state) {
  const due = state.slates.filter(s => s.status === 'published' && !s.final && at(s.firstKickoff) <= ctx.now).sort(byWeek).slice(-2);
  if (!due.length) return [];
  const files = await actualFiles(ctx, due);
  const out = [];
  for (const slate of due) out.push(await loadWeek(ctx, slate, files));
  return out;
}

/** Step 3: every published week past its FINAL time and not yet FINAL (the database re-checks time and pending slots). */
async function finalizeStep(ctx, state) {
  const due = state.slates.filter(s => s.status === 'published' && !s.final && at(s.finalizeAt) <= ctx.now).sort(byWeek);
  const out = [];
  for (const { week } of due) {
    try {
      const result = await ctx.service.rpc('gtl_points_finalize', { p_season: ctx.season, p_week: week });
      if (result?.final === true) { if (result.replayed !== true) ctx.changed = true; out.push({ week, final: true }); }
      else out.push({ week, final: false, reason: FINAL_REASONS.has(result?.reason) ? result.reason : 'unknown' });
    } catch {
      ctx.failures.add('worker_error');
      out.push({ week, final: false, reason: 'refused' });
    }
  }
  return out;
}

/**
 * One run of the three steps, in order, each isolated: a failure is recorded in the summary and the later steps still run.
 * Returns { reason, summary } for gtl_complete_points_jobs: reason null when a step changed something, 'nothing_due' when
 * nothing did, or the worst failure: worker_error (anything unexpected) > load_failed (the loader refused) >
 * source_unavailable (a fetch failed; a failed load is recorded for each due week).
 */
export async function runPointsJobs({ service, sources, now }) {
  const season = fantasySeason(now);
  const ctx = { service, sources, now, season, failures: new Set(), changed: false };
  let gamesTask;
  ctx.games = () => (gamesTask ??= sources.fetchText(NFLVERSE.games(), SOURCE_LIMITS.games).then(file => ({ sha256: file.sha256, list: scheduleGames(file.text, { season }) })));
  const summary = { season, slate: null, actuals: [], finalize: [] };
  let state;
  try {
    state = await service.rpc('gtl_points_jobs_state', { p_season: season });
    if (!Array.isArray(state?.slates)) throw new Error('Invalid jobs state.');
  } catch {
    // Without the stored state nothing is drafted over a slate the worker cannot see.
    return { reason: 'worker_error', summary: { ...summary, slate: { action: 'skipped', reason: 'state_unavailable' } } };
  }
  const errors = [];
  const step = async (name, task, fallback) => {
    try { return await task(); } catch { errors.push(name); ctx.failures.add('worker_error'); return fallback; }
  };
  summary.slate = await step('slate', () => slateStep(ctx, state), { action: 'skipped', reason: 'error' });
  summary.actuals = await step('actuals', () => actualsStep(ctx, state), []);
  summary.finalize = await step('finalize', () => finalizeStep(ctx, state), []);
  if (errors.length) summary.errors = errors;
  const reason = ['worker_error', 'load_failed', 'source_unavailable'].find(r => ctx.failures.has(r)) ?? (ctx.changed ? null : 'nothing_due');
  return { reason, summary };
}

/** One counts-only log line per completed run (Edge function logs): never a name, guess, House value, hash or URL. */
function logRun(result, summary) {
  const actuals = summary?.actuals ?? [];
  console.info(`gtl-points-jobs: ${result.status}${result.reason ? ` (${result.reason})` : ''}; slate ${summary?.slate?.action ?? 'none'}; `
    + `loads ${actuals.filter(a => ['saved', 'skipped'].includes(a.status)).length}, replayed ${actuals.filter(a => a.status === 'replayed').length}, `
    + `failed ${actuals.filter(a => ['failed', 'refused'].includes(a.status)).length}; final ${(summary?.finalize ?? []).filter(f => f.final).length}`);
}

// A machine-only endpoint: the platform JWT check is replaced ONLY here with an expiring one-run capability validated in
// SQL before any source is read or anything is written.
export function createPointsJobsHandler({ service, sources, clock = Date.now, bodyTimeoutMs = 3000 }) {
  return async request => {
    try {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (new URL(request.url).search) return json({ error: 'Invalid Points jobs request.' }, 400);
      const match = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') || '');
      if (!match) return json({ error: 'Unauthorized.' }, 401);
      const { runId } = await readRunBody(request, bodyTimeoutMs);
      const job = await service.rpc('gtl_claim_points_jobs', { p_token: match[1], p_run: runId });
      if (job.replay) return json(safe(job));
      let outcome;
      try { outcome = await runPointsJobs({ service, sources, now: clock() }); } catch { outcome = { reason: 'worker_error', summary: null }; }
      const result = await service.rpc('gtl_complete_points_jobs', { p_run: runId, p_claim: job.claim, p_reason: outcome.reason, p_summary: outcome.summary });
      logRun(result, outcome.summary);
      return json({ ...safe(result), summary: outcome.summary });
    } catch (error) {
      if (error?.code === 'GTL_SCHEDULE_AUTH') return json({ error: 'Unauthorized.' }, 401);
      if (['INPUT', 'GTL_SCHEDULE_RUN'].includes(error?.code)) return json({ error: 'Invalid Points jobs request.' }, 400);
      console.warn('gtl-points-jobs: unavailable');
      return json({ error: 'The scheduled Points jobs service is temporarily unavailable.' }, 503);
    }
  };
}
