// D-82 Player Props jobs, server/operator only (docs/superpowers/specs/2026-11-09-player-props-design.md):
//
//   offers   turns quotes the existing research intake ALREADY retained (gtl_research_quote_fetches) into Player Props
//            offers and three-book median references (gtl_props_record_offer, gtl_props_record_reference), after checking
//            the exact scheduled event and kickoff, the stable player ID and current weekly roster, and the canonical
//            stat. Every candidate is reviewed (gtl_props_record_review), the ineligible ones with their reasons.
//   results  records final-stat receipts (gtl_props_record_result) from the verified nflverse stats_player weekly release
//            (CC BY 4.0). Participation is required before a zero counts, a game must be final, and a stat correction
//            grades again only once a second verified release confirms it. Everything else is an explicit ungraded check
//            (gtl_props_record_check), never an invented zero or loss.
//
// Neither job calls an odds provider, reserves credits, starts a collector or serves a route: no page view reaches this
// module (tests/player-prop-jobs.test.mjs checks the imports). Both no-op when the schema is not applied (PostgREST
// PGRST202 → SCHEMA_MISSING), default to a dry run, and while gtl_prop_capability.live_lock_in is false write only with
// the operator's explicit `recordWhileDark`: the tables they write are service-only and the board shows no offer until the
// mode is enabled, so recording while dark exposes nothing (spec: "Do not expose the mode until ... ready together").
// Summaries carry counts and reason names only: never a player name, line, price, guess or credential.
import { propReferenceFromQuotes } from './player-prop-receipts.mjs';
import { PROP_POSITIONS, propStat, validEventId, validPlayerId, validPropActual, validSeason, validWeek } from '../shared/player-props.mjs';
import { appCode, easternToUtc } from '../shared/nfl-schedule.mjs';
import { parseFantasyCsv } from '../shared/fantasy-build.mjs';
import { linesFor, playedEvidence } from '../shared/points-jobs.mjs';

/** The only RPCs the jobs call. No research reservation, provider or member writer is among them. */
export const PROP_JOB_RPCS = Object.freeze(['gtl_props_jobs_capability', 'gtl_props_jobs_state', 'gtl_props_record_offer', 'gtl_props_record_reference',
  'gtl_props_record_review', 'gtl_props_record_result', 'gtl_props_record_check']);
/** The only table the jobs read directly: retained research quote fetches (read-only, already collected). */
export const PROP_JOB_TABLES = Object.freeze(['gtl_research_quote_fetches']);
/** Retained fetches older than this cannot yield a qualifying reference (cloud/player-prop-receipts.mjs), so they are not read. */
export const PROP_QUOTE_WINDOW_MS = 6 * 3_600_000;
export const PROP_QUOTE_FETCH_LIMIT = 64;
/** A game counts as final only after its schedule score is in and the stats release was updated this long after kickoff. */
export const PROP_FINAL_AFTER_KICKOFF_MS = 3 * 3_600_000;

export const PROP_OFFER_REASONS = Object.freeze(['kicked_off', 'event_unmapped', 'kickoff_mismatch', 'player_id_invalid', 'roster_unverified',
  'roster_team_mismatch', 'roster_inactive', 'position_unsupported', 'offer_identity_changed', 'reference_refused', 'reference_invalid_offer',
  'reference_kicked_off', 'reference_unit_mismatch', 'reference_no_retained_quotes', 'reference_event_mismatch', 'reference_missing_book',
  'reference_book_line_mismatch', 'reference_stale_or_future_quote', 'reference_not_time_aligned', 'reference_books_disagree']);
export const PROP_CHECK_REASONS = Object.freeze(['not_started', 'not_final', 'event_missing', 'stats_not_covering_game', 'duplicate_stat_rows',
  'stat_missing', 'stat_invalid', 'participation_unverified']);

const pad = n => String(n).padStart(2, '0');
const time = value => (typeof value === 'string' ? Date.parse(value) : NaN);
const GAME_ID = /^([A-Z]{2,3})-([A-Z]{2,3})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PLAYER_REF = /^[A-Za-z0-9._:-]{1,40}$/;
const count = (map, key) => { map[key] = (map[key] ?? 0) + 1; };

// ---------- verified public inputs (parsed from the nflverse release files) ----------
const GAMES_REQUIRED = ['game_id', 'season', 'game_type', 'week', 'gameday', 'gametime', 'away_team', 'home_team', 'away_score', 'home_score'];
/** The season's regular-season schedule with app team codes, UTC kickoffs and whether a final score is recorded. */
export function propScheduleGames(gamesCsv, { season }) {
  return parseFantasyCsv(`${linesFor(`${gamesCsv}\n`, [`${season}_`])}\n`, GAMES_REQUIRED)
    .filter(row => Number(row.season) === season && row.game_type === 'REG' && validEventId(row.game_id)
      && /^\d{4}-\d{2}-\d{2}$/.test(row.gameday) && /^\d{2}:\d{2}$/.test(row.gametime))
    .map(row => ({ eventId: row.game_id, week: Number(row.week), away: appCode(row.away_team), home: appCode(row.home_team),
      kickoff: easternToUtc(row.gameday, row.gametime), scored: /^\d+$/.test(row.away_score) && /^\d+$/.test(row.home_score) }));
}

const ROSTER_REQUIRED = ['season', 'week', 'game_type', 'gsis_id', 'team', 'position', 'status', 'full_name'];
/**
 * The weekly roster facts for the requested GSIS IDs in one regular-season week: `{ team, position, status, name, pfrId }`,
 * or `{ conflict: true }` when the file lists the player twice with different facts (fail closed).
 */
export function propRosterFacts(rosterCsv, { season, week, playerIds }) {
  const wanted = new Set([...playerIds].filter(validPlayerId));
  const facts = new Map();
  if (!wanted.size) return facts;
  const rows = parseFantasyCsv(`${linesFor(`${rosterCsv}\n`, [...wanted])}\n`, ROSTER_REQUIRED)
    .filter(row => Number(row.season) === season && Number(row.week) === week && row.game_type === 'REG' && wanted.has(row.gsis_id));
  for (const row of rows) {
    const fact = { team: appCode(row.team), position: row.position, status: row.status, name: row.full_name, pfrId: row.pfr_id || null };
    const prior = facts.get(row.gsis_id);
    if (!prior) facts.set(row.gsis_id, fact);
    else if (prior.conflict || ['team', 'position', 'status', 'name'].some(key => prior[key] !== fact[key])) facts.set(row.gsis_id, { conflict: true });
  }
  return facts;
}

const STATS_REQUIRED = ['player_id', 'season', 'week', 'season_type', 'game_id'];
/** One week's regular-season stat rows: by `playerId` (all rows, any position) and the set of game IDs the file covers. */
export function propWeekStats(statsCsv, { season, week }) {
  const rows = parseFantasyCsv(`${linesFor(`${statsCsv}\n`, [`${season}_${pad(week)}_`])}\n`, STATS_REQUIRED)
    .filter(row => Number(row.season) === season && Number(row.week) === week && row.season_type === 'REG');
  const byPlayer = new Map(), games = new Set();
  for (const row of rows) {
    games.add(row.game_id);
    byPlayer.set(row.player_id, [...(byPlayer.get(row.player_id) ?? []), row]);
  }
  return { byPlayer, games };
}

const SNAPS_REQUIRED = ['season', 'game_type', 'week', 'game_id', 'pfr_player_id', 'offense_snaps', 'st_snaps'];
/** Offense plus special-teams snaps by `${game_id}:${pfr_player_id}` for one regular-season week. */
export function propWeekSnaps(snapCsv, { season, week }) {
  const rows = parseFantasyCsv(`${linesFor(`${snapCsv}\n`, [`${season}_${pad(week)}_`])}\n`, SNAPS_REQUIRED)
    .filter(row => Number(row.season) === season && Number(row.week) === week && row.game_type === 'REG');
  const snaps = new Map();
  for (const row of rows) {
    const key = `${row.game_id}:${row.pfr_player_id}`;
    snaps.set(key, (snaps.get(key) ?? 0) + (Number(row.offense_snaps) || 0) + (Number(row.st_snaps) || 0));
  }
  return snaps;
}

// ---------- offers: candidates from retained research quotes ----------
/**
 * The retained quotes the research reader would show: for each (game, market), only the newest finished, error-free
 * fetch counts (a later empty reply invalidates older quotes, as in gtl_read_research_quotes), and only its quotes for
 * that market. Returns each quote with the request ID it came from.
 */
export function latestRetainedQuotes(fetchRows) {
  const ordered = (Array.isArray(fetchRows) ? fetchRows : []).filter(row => row?.status === 'finished' && row.error == null
    && Array.isArray(row.markets) && Array.isArray(row.quote_payload) && UUID.test(row.request_id ?? '') && Number.isFinite(time(row.started_at)))
    .sort((a, b) => time(b.started_at) - time(a.started_at) || String(b.request_id).localeCompare(String(a.request_id)));
  const seen = new Set(), quotes = [];
  for (const row of ordered) {
    for (const market of row.markets) {
      const key = `${row.game_id}|${market}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const quote of row.quote_payload) if (quote?.gameId === row.game_id && quote?.selection?.key === market) quotes.push({ quote, requestId: row.request_id });
    }
  }
  return quotes;
}

/** Player Props candidates: catalog stats only, grouped by research game, retained roster identity and stat. */
export function propCandidates(retained) {
  const groups = new Map();
  let outsideCatalog = 0;
  for (const { quote, requestId } of retained) {
    const sel = quote.selection;
    if (sel?.market !== 'prop') continue;
    if (!propStat(sel.key) || typeof sel.playerId !== 'string' || !PLAYER_REF.test(sel.playerId) || !GAME_ID.test(quote.gameId ?? '')) { outsideCatalog += 1; continue; }
    const key = `${quote.gameId}|${sel.playerId}|${sel.key}`;
    const group = groups.get(key) ?? { gameId: quote.gameId, playerRef: sel.playerId, stat: sel.key, quotes: [], requests: new Set() };
    group.quotes.push(quote); group.requests.add(requestId);
    groups.set(key, group);
  }
  return { candidates: [...groups.values()].map(g => ({ ...g, requests: [...g.requests].sort() })), outsideCatalog };
}

/**
 * Reviews one candidate against the verified schedule and weekly roster and builds its reference from its own retained
 * quotes. Returns `{ eligible, reasons, offer, reference }`; `offer` is the gtl_props_record_offer payload when eligible.
 */
export function reviewPropCandidate(candidate, { season, week, games, roster, now, sourceName }) {
  const reasons = [];
  const [, away, home] = GAME_ID.exec(candidate.gameId) ?? [];
  const matches = games.filter(g => g.week === week && g.away === away && g.home === home);
  const game = matches.length === 1 ? matches[0] : null;
  const kickoffs = new Set(candidate.quotes.map(q => time(q.kickoff)));
  if (!game) reasons.push('event_unmapped');
  else {
    if (kickoffs.size !== 1 || !kickoffs.has(time(game.kickoff))) reasons.push('kickoff_mismatch');
    if (now >= time(game.kickoff)) reasons.push('kicked_off');
  }
  let fact = null;
  if (!validPlayerId(candidate.playerRef)) reasons.push('player_id_invalid');
  else {
    fact = roster.get(candidate.playerRef) ?? null;
    if (!fact || fact.conflict) { reasons.push('roster_unverified'); fact = null; }
    else {
      if (game && ![game.away, game.home].includes(fact.team)) reasons.push('roster_team_mismatch');
      if (fact.status !== 'ACT') reasons.push('roster_inactive');
      if (!PROP_POSITIONS.includes(fact.position)) reasons.push('position_unsupported');
      if (typeof fact.name !== 'string' || fact.name.length < 1 || fact.name.length > 80) reasons.push('roster_unverified');
    }
  }
  let reference = null;
  if (game && validPlayerId(candidate.playerRef) && !reasons.includes('kickoff_mismatch') && !reasons.includes('kicked_off')) {
    reference = propReferenceFromQuotes(candidate.quotes, {
      offer: { stat: candidate.stat, playerId: candidate.playerRef, eventId: game.eventId, kickoff: game.kickoff, away: game.away, home: game.home }, now });
    if (reference.status !== 'qualified') reasons.push(`reference_${reference.reason}`);
  }
  const unique = [...new Set(reasons)].filter(reason => PROP_OFFER_REASONS.includes(reason));
  if (unique.length !== new Set(reasons).size) throw new Error('Unknown offer reason.');
  const eligible = unique.length === 0 && reference?.status === 'qualified' && Boolean(game) && Boolean(fact);
  if (!eligible && !unique.length) throw new Error('An ineligible candidate needs a reason.');
  return Object.freeze({
    eligible, reasons: unique.sort(), eventId: game?.eventId ?? null,
    offer: eligible ? { season, week, eventId: game.eventId, playerId: candidate.playerRef, stat: candidate.stat, playerName: fact.name, team: fact.team,
      position: fact.position, away: game.away, home: game.home, kickoff: new Date(time(game.kickoff)).toISOString(), source: sourceName } : null,
    reference: eligible ? reference : null,
  });
}

// ---------- results: observation and the version decision ----------
/**
 * What the verified files say about one offer's final stat: `{ status, actual, participated, source }` with status one of
 * final, dnp, cancelled or identity_unverified, or `{ status: null, reason, source }` when nothing can be recorded.
 * A missing row is never a zero: a zero counts only with participation (a stats row or snaps) in a game the file covers.
 */
export function observePropResult(offer, { season, week, now, games, stats, snaps, roster, files }) {
  const s = propStat(offer.stat);
  const ungraded = (reason, file = files.stats) => ({ status: null, reason, source: file });
  const game = games.find(g => g.eventId === offer.eventId);
  if (!game) {
    // nflverse gives a game moved to another week a new ID (shared/points-jobs.mjs): a move is the same pairing in another
    // week and none in this one. A game missing altogether is not proof of anything.
    const pair = games.filter(g => g.away === offer.away && g.home === offer.home);
    if (pair.some(g => g.week !== week) && !pair.some(g => g.week === week)) return { status: 'cancelled', actual: null, participated: null, source: files.schedule };
    return ungraded('event_missing', files.schedule);
  }
  if (now < time(game.kickoff)) return ungraded('not_started', files.schedule);
  if (!game.scored || !(time(files.stats.updatedAt) >= time(game.kickoff) + PROP_FINAL_AFTER_KICKOFF_MS)) return ungraded('not_final');
  if (!stats.games.has(offer.eventId)) return ungraded('stats_not_covering_game');
  const rows = stats.byPlayer.get(offer.playerId) ?? [];
  const here = rows.filter(row => row.game_id === offer.eventId);
  if (here.length > 1) return ungraded('duplicate_stat_rows');
  if (here.length === 1) {
    const raw = here[0][s.resultColumn];
    if (raw === undefined || raw === '') return ungraded('stat_missing');
    const actual = /^-?\d+$/.test(raw) ? Number(raw) : NaN;
    if (!validPropActual(s.key, actual)) return ungraded('stat_invalid');
    return { status: 'final', actual: Object.is(actual, -0) ? 0 : actual, participated: true, source: files.stats };
  }
  // A row for this player in another game of the week: the selection's event or identity does not hold.
  if (rows.length) return { status: 'identity_unverified', actual: null, participated: null, source: files.stats };
  const fact = roster.get(offer.playerId);
  const usable = fact && !fact.conflict ? fact : null;
  const snapCount = usable?.pfrId ? snaps.get(`${offer.eventId}:${usable.pfrId}`) : undefined;
  const { played, basis } = playedEvidence({ hasStats: false, snapCount, rosterStatus: usable?.status, movedOutOfWeek: false });
  if (played === true && basis === 'snaps') return { status: 'final', actual: 0, participated: true, source: files.snaps };
  if (played === false) return { status: 'dnp', actual: null, participated: false, source: basis === 'no_snaps' ? files.snaps : files.rosters };
  return ungraded('participation_unverified');
}

const sameRecorded = (latest, obs) => latest.status === obs.status && (latest.actual ?? null) === (obs.actual ?? null);
/**
 * The decision for one observation given the newest recorded version and newest check:
 *   no version yet                → record it
 *   same as the newest version    → unchanged
 *   a correction is pending       → record it only when the previous check observed the same thing from a different
 *                                   verified file (a second release confirms it); otherwise correction_unconfirmed
 *   differs from a recorded state → write correction_pending (ungraded until confirmed)
 * Returns `{ outcome, receipt }`; `receipt` is the gtl_props_record_result payload or null.
 */
export function decidePropResult({ offer, latest, lastCheck, observation }) {
  if (observation.status === null) return { outcome: 'ungraded', receipt: null };
  const base = { eventId: offer.eventId, playerId: offer.playerId, stat: offer.stat, source: observation.source.name.slice(0, 200),
    sourceSha256: observation.source.sha256, observedAt: observation.source.retrievedAt };
  const receipt = status => ({ ...base, status, actual: status === 'final' ? observation.actual : null,
    participated: typeof observation.participated === 'boolean' ? observation.participated : null });
  if (!latest) return { outcome: 'recorded', receipt: receipt(observation.status) };
  if (latest.status === 'correction_pending') {
    const confirmed = lastCheck && lastCheck.observedStatus === observation.status && (lastCheck.observedActual ?? null) === (observation.actual ?? null)
      && typeof lastCheck.sourceSha256 === 'string' && lastCheck.sourceSha256 !== observation.source.sha256;
    return confirmed ? { outcome: 'recorded', receipt: receipt(observation.status) } : { outcome: 'correction_unconfirmed', receipt: null };
  }
  if (sameRecorded(latest, observation)) return { outcome: 'unchanged', receipt: null };
  return { outcome: 'correction_pending', receipt: receipt('correction_pending') };
}

// ---------- the runs ----------
const SOURCE_SPECS = Object.freeze({ stats: 'stats', snaps: 'snaps', rosters: 'rosters', schedule: 'schedule' });
const fileRef = file => ({ name: file.name, sha256: file.sha256 });

async function probe(service) {
  try {
    const capability = await service.rpc('gtl_props_jobs_capability', {});
    if (!capability || capability.jobs !== true || typeof capability.ready !== 'boolean') throw new Error('Invalid capability reply.');
    return { ok: true, ready: capability.ready };
  } catch (error) {
    if (error?.code === 'SCHEMA_MISSING') return { ok: false };
    throw error;
  }
}

/** Decides whether this run may write: write requested, schema present, and live or the operator's explicit dark recording. */
function gate({ write, ready, recordWhileDark }) {
  if (!write) return { writes: false, blocked: null };
  if (!ready && recordWhileDark !== true) return { writes: false, blocked: 'dark' };
  return { writes: true, blocked: null };
}

function checkTarget({ season, week, runId }) {
  if (!validSeason(season) || !validWeek(week)) throw new Error('Choose a valid season and week.');
  if (!UUID.test(runId ?? '')) throw new Error('A run needs a lowercase UUID run ID.');
}

/**
 * The offer job. `service.rpc(name, body)` and `service.rows(table, query)` are the service-role adapter; `sources.read(key)`
 * returns a verified nflverse file `{ name, url, sha256, bytes, updatedAt, retrievedAt, text }` for schedule and rosters.
 * Nothing is read from a provider. Returns a counts-only summary.
 */
export async function runPropOffersJob({ service, sources, season, week, now, runId, write = false, recordWhileDark = false }) {
  checkTarget({ season, week, runId });
  const summary = { job: 'offers', season, week, runId, mode: 'dry_run', status: 'ok', ready: null, blocked: null,
    fetches: 0, candidates: 0, outsideCatalog: 0, eligible: 0, ineligible: 0, reasons: {}, written: { offers: 0, references: 0, reviews: 0 } };
  const schema = await probe(service);
  if (!schema.ok) return { ...summary, status: 'schema_unavailable' };
  summary.ready = schema.ready;
  const { writes, blocked } = gate({ write, ready: schema.ready, recordWhileDark });
  summary.mode = writes ? 'write' : 'dry_run'; summary.blocked = blocked;
  const rows = await service.rows('gtl_research_quote_fetches', {
    select: 'request_id,game_id,markets,status,error,started_at,quote_payload', season: `eq.${season}`, week: `eq.${week}`, status: 'eq.finished',
    error: 'is.null', started_at: `gte.${new Date(now - PROP_QUOTE_WINDOW_MS).toISOString()}`, order: 'started_at.desc,request_id.desc', limit: String(PROP_QUOTE_FETCH_LIMIT) });
  if (!Array.isArray(rows) || rows.length > PROP_QUOTE_FETCH_LIMIT) throw new Error('Invalid retained quote read.');
  summary.fetches = rows.length;
  const { candidates, outsideCatalog } = propCandidates(latestRetainedQuotes(rows));
  summary.outsideCatalog = outsideCatalog; summary.candidates = candidates.length;
  // No candidate, no source read: an empty week costs nothing.
  if (!candidates.length) return summary;
  const [schedule, rosterFile] = [await sources.read(SOURCE_SPECS.schedule), await sources.read(SOURCE_SPECS.rosters)];
  const games = propScheduleGames(schedule.text, { season });
  const roster = propRosterFacts(rosterFile.text, { season, week, playerIds: candidates.map(c => c.playerRef) });
  const sourceName = `nflverse ${rosterFile.name.replace(/^nflverse /, '')} + ${schedule.name.replace(/^nflverse /, '')}; retained research quotes`.slice(0, 120);
  const fileRefs = [fileRef(schedule), fileRef(rosterFile)];
  for (const candidate of candidates) {
    const review = reviewPropCandidate(candidate, { season, week, games, roster, now, sourceName });
    let { eligible, reasons } = review, referenceId = null;
    if (eligible && writes) {
      try { await service.rpc('gtl_props_record_offer', { p_offer: review.offer }); summary.written.offers += 1; }
      catch (error) { if (error?.code !== 'GTL_PROPS_INVALID') throw error; eligible = false; reasons = ['offer_identity_changed']; }
      if (eligible) {
        try {
          const ref = await service.rpc('gtl_props_record_reference', { p_event_id: review.offer.eventId, p_player_id: review.offer.playerId,
            p_stat: review.offer.stat, p_line: review.reference.line, p_books: review.reference.books });
          if (!UUID.test(ref?.id ?? '')) throw new Error('Invalid reference reply.');
          referenceId = ref.id; summary.written.references += 1;
        } catch (error) {
          if (!['GTL_PROPS_REFERENCE_UNAVAILABLE', 'GTL_PROPS_CLOSED'].includes(error?.code)) throw error;
          eligible = false; reasons = ['reference_refused'];
        }
      }
    }
    if (eligible) summary.eligible += 1; else { summary.ineligible += 1; for (const reason of reasons) count(summary.reasons, reason); }
    if (writes) {
      await service.rpc('gtl_props_record_review', { p_review: { runId, season, week, gameId: candidate.gameId, playerRef: candidate.playerRef, stat: candidate.stat,
        eventId: review.eventId, eligible, reasons, referenceId, quoteRequests: candidate.requests.slice(0, 16), sources: fileRefs } });
      summary.written.reviews += 1;
    }
  }
  return summary;
}

/**
 * The result-ingestion job for one week's recorded offers. `sources.read(key)` returns the verified stats, snaps, rosters
 * and schedule files. Offers before kickoff are left alone; nothing is fetched when the week has no offer that kicked off.
 */
export async function runPropResultsJob({ service, sources, season, week, now, runId, write = false, recordWhileDark = false }) {
  checkTarget({ season, week, runId });
  const summary = { job: 'results', season, week, runId, mode: 'dry_run', status: 'ok', ready: null, blocked: null,
    offers: 0, due: 0, outcomes: {}, ungraded: {}, observed: {}, written: { results: 0, checks: 0 } };
  const schema = await probe(service);
  if (!schema.ok) return { ...summary, status: 'schema_unavailable' };
  summary.ready = schema.ready;
  const { writes, blocked } = gate({ write, ready: schema.ready, recordWhileDark });
  summary.mode = writes ? 'write' : 'dry_run'; summary.blocked = blocked;
  const state = await service.rpc('gtl_props_jobs_state', { p_season: season, p_week: week });
  if (!state || state.season !== season || state.week !== week || !Array.isArray(state.offers)) throw new Error('Invalid jobs state.');
  summary.offers = state.offers.length;
  const due = state.offers.filter(o => validEventId(o.eventId) && validPlayerId(o.playerId) && propStat(o.stat) && time(o.kickoff) <= now);
  summary.due = due.length;
  if (!due.length) return summary;
  const files = {};
  for (const key of ['stats', 'snaps', 'rosters', 'schedule']) files[key] = await sources.read(SOURCE_SPECS[key]);
  const inputs = { season, week, now, files, games: propScheduleGames(files.schedule.text, { season }), stats: propWeekStats(files.stats.text, { season, week }),
    snaps: propWeekSnaps(files.snaps.text, { season, week }), roster: propRosterFacts(files.rosters.text, { season, week, playerIds: due.map(o => o.playerId) }) };
  for (const offer of due) {
    const observation = observePropResult(offer, inputs);
    const { outcome, receipt } = decidePropResult({ offer, latest: offer.result ?? null, lastCheck: offer.lastCheck ?? null, observation });
    count(summary.outcomes, outcome);
    if (observation.status === null) count(summary.ungraded, observation.reason); else count(summary.observed, observation.status);
    if (!writes) continue;
    let resultVersion = null;
    if (receipt) {
      const saved = await service.rpc('gtl_props_record_result', { p_result: receipt });
      if (!Number.isSafeInteger(saved?.version)) throw new Error('Invalid result reply.');
      resultVersion = saved.version; summary.written.results += 1;
    }
    await service.rpc('gtl_props_record_check', { p_check: { runId, eventId: offer.eventId, playerId: offer.playerId, stat: offer.stat, outcome,
      observedStatus: observation.status, observedActual: observation.status === 'final' ? observation.actual : null,
      observedParticipated: observation.status === null ? null : observation.participated ?? null, reason: observation.status === null ? observation.reason : null,
      resultVersion, source: observation.source.name.slice(0, 200), sourceSha256: observation.source.sha256, observedAt: observation.source.retrievedAt } });
    summary.written.checks += 1;
  }
  return summary;
}
