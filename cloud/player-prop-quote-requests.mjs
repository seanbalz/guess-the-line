// D-82 Player Props pilot input, operator only (docs/PLAYER_PROPS_READINESS_TASK2_2026-11-10.md, step 0). Builds the
// `quoteRequests` that scripts/research-intake.mjs --collect-quotes spends credits on, from verified sources instead of a
// file the operator writes by hand:
//   - the provider event IDs come from the newest core market snapshot of the week (gtl_market_snapshots), and only for
//     games the snapshot matched, whose team names agree with their app codes, and whose kickoff equals the verified
//     nflverse schedule (the same mapping the offers job checks, cloud/player-prop-jobs.mjs propScheduleGames);
//   - each game's roster receipt comes from the verified nflverse weekly roster and is keyed by GSIS ID, so a retained
//     prop quote carries the stable ID the offers job requires. A player is in the receipt only when he is ACT for one of
//     the two teams as a QB, RB, WR or TE, his repeated rows agree, and no one else on either team shares his name key
//     (the intake matches provider names by that key and must find exactly one row).
// The scope is bounded by the caller: N games × listed catalog stats, default 2 × 3 yardage stats, and the credit math is
// checked against a cap (default 6) before anything is read. This module has no I/O and never calls a provider.
import { PROP_POSITIONS, PROP_STAT_KEYS, validPlayerId, validSeason, validWeek } from '../shared/player-props.mjs';
import { researchNameKey } from '../shared/research-markets.mjs';
import { TEAM_NAMES, appCode } from '../shared/nfl-schedule.mjs';
import { parseFantasyCsv } from '../shared/fantasy-build.mjs';
import { propScheduleGames } from './player-prop-jobs.mjs';

export const PROP_PILOT_DEFAULTS = Object.freeze({ games: 2, stats: Object.freeze(['player_pass_yds', 'player_rush_yds', 'player_reception_yds']), maxCredits: 6 });
/** Research intake's own limits: at most four requests per run, eight markets per request (gtl_begin_research_quotes too). */
export const PROP_INTAKE_LIMITS = Object.freeze({ requests: 4, marketsPerRequest: 8 });
/**
 * Credits per requested market. The intake names three bookmakers (DraftKings, FanDuel, BetMGM), and the provider counts
 * every ten named bookmakers as one region. gtl_begin_research_quotes reserves one credit per requested market, which is
 * also the most the provider may bill a request: the intake treats a reported cost above it as a failure.
 */
export const PROP_CREDIT_REGIONS = 1;
export const PROP_MAX_CREDITS_CAP = PROP_INTAKE_LIMITS.requests * PROP_INTAKE_LIMITS.marketsPerRequest * PROP_CREDIT_REGIONS;
/** A game this close to kickoff is left out: both the reservation and the provider adapter refuse a request at kickoff. */
export const PROP_REQUEST_LEAD_MS = 15 * 60_000;
export const PROP_PILOT_GAME_REASONS = Object.freeze(['game_invalid', 'game_duplicate', 'team_names_mismatch', 'event_unmatched', 'kickoff_invalid',
  'kickoff_too_close', 'schedule_unmapped', 'kickoff_mismatch', 'roster_unavailable', 'not_in_snapshot']);
export const PROP_PILOT_PLAYER_REASONS = Object.freeze(['player_id_invalid', 'roster_conflict', 'roster_inactive', 'position_unsupported', 'name_invalid',
  'name_ambiguous']);

/** A scope or credit refusal. Its message names counts, stat keys and app game IDs only. */
export class PropPilotRefusal extends Error { constructor(message) { super(message); this.name = 'PropPilotRefusal'; } }

const GAME_ID = /^([A-Z]{2,3})-([A-Z]{2,3})$/;
const EVENT_TOKEN = /^[a-zA-Z0-9_-]{1,100}$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const count = (map, key) => { map[key] = (map[key] ?? 0) + 1; };
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/**
 * The credit math for `games` games × `stats` stats, decided before any source is read. One request per game per eight
 * stats; each request costs its market count × PROP_CREDIT_REGIONS. Throws PropPilotRefusal when the total is above
 * `maxCredits` or the intake's request limit; throws on an invalid scope.
 */
export function propRequestPlan({ games = PROP_PILOT_DEFAULTS.games, stats = PROP_PILOT_DEFAULTS.stats, maxCredits = PROP_PILOT_DEFAULTS.maxCredits } = {}) {
  if (!Number.isSafeInteger(games) || games < 1 || games > PROP_INTAKE_LIMITS.requests) throw new Error(`Choose 1 to ${PROP_INTAKE_LIMITS.requests} games.`);
  if (!Array.isArray(stats) || !stats.length || new Set(stats).size !== stats.length || stats.some(key => !PROP_STAT_KEYS.includes(key)))
    throw new Error(`Choose distinct catalog stats: ${PROP_STAT_KEYS.join(', ')}.`);
  if (!Number.isSafeInteger(maxCredits) || maxCredits < 1 || maxCredits > PROP_MAX_CREDITS_CAP) throw new Error(`Choose --max-credits from 1 to ${PROP_MAX_CREDITS_CAP}.`);
  const marketGroups = chunks([...stats], PROP_INTAKE_LIMITS.marketsPerRequest);
  const requests = games * marketGroups.length, credits = games * stats.length * PROP_CREDIT_REGIONS;
  const formula = `${games} ${games === 1 ? 'game' : 'games'} × ${stats.length} ${stats.length === 1 ? 'stat' : 'stats'} × ${PROP_CREDIT_REGIONS} region = ${credits} credits`;
  if (requests > PROP_INTAKE_LIMITS.requests) throw new PropPilotRefusal(`Refused: ${formula} needs ${requests} requests; research intake allows ${PROP_INTAKE_LIMITS.requests}.`);
  if (credits > maxCredits) throw new PropPilotRefusal(`Refused: ${formula}, above --max-credits ${maxCredits}.`);
  return Object.freeze({ games, stats: Object.freeze([...stats]), marketGroups: Object.freeze(marketGroups.map(group => Object.freeze(group))), requests, credits, maxCredits,
    perGame: marketGroups.map(group => group.length * PROP_CREDIT_REGIONS), formula });
}

const ROSTER_REQUIRED = ['season', 'week', 'game_type', 'gsis_id', 'team', 'position', 'status', 'full_name'];
/**
 * One regular-season week of the nflverse weekly roster, by identity: `{ id, valid, team, position, status, name }`, or
 * `{ id, valid, conflict: true, teams, names }` when the file lists the player twice with different facts. A row without a
 * valid GSIS ID is kept under its own row key so its name still counts when another player's name is checked.
 */
export function propWeekRoster(rosterCsv, { season, week }) {
  const rows = parseFantasyCsv(rosterCsv, ROSTER_REQUIRED, get => Number(get('season')) === season && Number(get('week')) === week && get('game_type') === 'REG'
    ? { gsis_id: get('gsis_id'), team: get('team'), position: get('position'), status: get('status'), full_name: get('full_name') } : null);
  const people = new Map();
  rows.forEach((row, index) => {
    const valid = validPlayerId(row.gsis_id), id = valid ? row.gsis_id : `row:${index}`;
    const fact = { id, valid, team: appCode(row.team), position: row.position, status: row.status, name: row.full_name };
    const prior = people.get(id);
    if (!prior) people.set(id, fact);
    else if (prior.conflict || ['team', 'position', 'status', 'name'].some(key => prior[key] !== fact[key])) {
      const teams = new Set([...(prior.teams ?? [prior.team]), fact.team]), names = new Set([...(prior.names ?? [prior.name]), fact.name]);
      people.set(id, { id, valid, conflict: true, teams: [...teams], names: [...names] });
    }
  });
  return people;
}

/**
 * The roster receipt for one game, in research intake's shape (`{ id, name, team, gameId, current, availableAt }`, keyed
 * by GSIS ID), and the counted reasons for every listed player left out. `availableAt` is the roster release's update time.
 */
export function propRosterReceipt(people, { game, availableAt }) {
  const teams = [game.awayCode, game.homeCode], excluded = {};
  const members = [...people.values()].filter(p => (p.conflict ? p.teams : [p.team]).some(team => teams.includes(team)));
  const holders = new Map();
  for (const p of members) for (const name of p.conflict ? p.names : [p.name]) {
    const key = researchNameKey(name);
    if (key) holders.set(key, new Set([...(holders.get(key) ?? []), p.id]));
  }
  const receipt = [];
  for (const p of members) {
    const key = p.conflict ? '' : researchNameKey(p.name);
    const reason = !p.valid ? 'player_id_invalid' : p.conflict ? 'roster_conflict' : p.status !== 'ACT' ? 'roster_inactive'
      : !PROP_POSITIONS.includes(p.position) ? 'position_unsupported' : typeof p.name !== 'string' || !p.name.length || p.name.length > 80 || !key ? 'name_invalid'
        : holders.get(key).size !== 1 ? 'name_ambiguous' : null;
    if (reason) { count(excluded, reason); continue; }
    receipt.push({ id: p.id, name: p.name, team: p.team, gameId: game.id, current: true, availableAt });
  }
  receipt.sort((a, b) => a.team.localeCompare(b.team) || a.id.localeCompare(b.id));
  return { receipt, excluded, complete: teams.every(team => receipt.some(p => p.team === team)) };
}

/** Why one snapshot game cannot be requested, or null. `schedule` is propScheduleGames output for the season. */
function gameReasons(entry, { schedule, week, now }) {
  const [, away, home] = GAME_ID.exec(entry?.gameId ?? '') ?? [];
  if (!away || !TEAM_NAMES[away] || !TEAM_NAMES[home] || away === home) return { reasons: ['game_invalid'] };
  const reasons = [];
  if (entry.away !== TEAM_NAMES[away] || entry.home !== TEAM_NAMES[home]) reasons.push('team_names_mismatch');
  if (entry.matchStatus !== 'matched' || !EVENT_TOKEN.test(entry.providerEventId ?? '')) reasons.push('event_unmatched');
  const kickoff = typeof entry.kickoff === 'string' && ISO.test(entry.kickoff) ? Date.parse(entry.kickoff) : NaN;
  if (!Number.isFinite(kickoff)) reasons.push('kickoff_invalid');
  else if (kickoff - now < PROP_REQUEST_LEAD_MS) reasons.push('kickoff_too_close');
  const scheduled = schedule.filter(g => g.week === week && g.away === away && g.home === home);
  if (scheduled.length !== 1) reasons.push('schedule_unmapped');
  else if (Number.isFinite(kickoff) && Date.parse(scheduled[0].kickoff) !== kickoff) reasons.push('kickoff_mismatch');
  return { reasons, away, home, kickoff };
}

const fileRef = file => ({ name: file.name, sha256: file.sha256, updatedAt: file.updatedAt, license: file.license ?? null });

/**
 * The research-intake input for the pilot and a counts-only summary. `snapshot` is the newest core market snapshot of
 * the week (`{ createdAt, games }`); `schedule` and `rosters` are verified nflverse files from scripts/player-props-sources.mjs.
 * `only` names exact app game IDs (each must be eligible); otherwise the earliest eligible games by kickoff are chosen.
 * The input has no publicationId, so research intake refuses --publish with it: collecting retains quotes, and an empty
 * assessment snapshot must never replace the published one.
 */
export function buildPropQuoteRequests({ season, week, now, plan, only = null, snapshot, schedule, rosters, newRequestId }) {
  if (!validSeason(season) || !validWeek(week) || !Number.isFinite(now)) throw new Error('Choose a valid season and week.');
  if (!plan || !Array.isArray(plan.marketGroups) || typeof newRequestId !== 'function') throw new Error('A credit plan comes first.');
  if (only !== null && (!Array.isArray(only) || only.length !== plan.games || new Set(only).size !== only.length || only.some(id => !GAME_ID.test(id))))
    throw new Error('Name each pilot game once, as AWAY-HOME.');
  const created = typeof snapshot?.createdAt === 'string' ? Date.parse(snapshot.createdAt) : NaN;
  if (!Number.isFinite(created) || created > now || !Array.isArray(snapshot.games) || !snapshot.games.length || snapshot.games.length > 32)
    throw new Error('The core market snapshot is unavailable or invalid.');
  const availableAt = typeof rosters?.updatedAt === 'string' ? Date.parse(rosters.updatedAt) : NaN;
  if (!Number.isFinite(availableAt) || availableAt > now) throw new Error('The roster release time is unavailable.');
  const scheduleGames = propScheduleGames(schedule.text, { season });
  const people = propWeekRoster(rosters.text, { season, week });
  const excludedGames = {}, excludedPlayers = {}, refused = [], seen = new Set();
  const candidates = [];
  for (const entry of snapshot.games) {
    const id = entry?.gameId;
    if (seen.has(id)) { count(excludedGames, 'game_duplicate'); refused.push([id, ['game_duplicate']]); continue; }
    seen.add(id);
    const checked = gameReasons(entry, { schedule: scheduleGames, week, now });
    if (checked.reasons.length) { for (const reason of checked.reasons) count(excludedGames, reason); refused.push([id, checked.reasons]); continue; }
    candidates.push({ entry, ...checked });
  }
  candidates.sort((a, b) => a.kickoff - b.kickoff || a.entry.gameId.localeCompare(b.entry.gameId));
  const ordered = only ? only.map(id => candidates.find(c => c.entry.gameId === id) ?? id) : candidates;
  const selected = [];
  for (const candidate of ordered) {
    if (selected.length === plan.games) break;
    if (typeof candidate === 'string') {
      const reasons = refused.find(([id]) => id === candidate)?.[1] ?? ['not_in_snapshot'];
      throw new PropPilotRefusal(`Refused: ${candidate} cannot be requested (${reasons.join(', ')}).`);
    }
    const { entry, away, home } = candidate;
    const game = { id: entry.gameId, home: entry.home, away: entry.away, kickoff: new Date(candidate.kickoff).toISOString(), homeCode: home, awayCode: away };
    const roster = propRosterReceipt(people, { game, availableAt: new Date(availableAt).toISOString() });
    if (!roster.complete) {
      if (only) throw new PropPilotRefusal(`Refused: ${game.id} cannot be requested (roster_unavailable).`);
      count(excludedGames, 'roster_unavailable'); continue;
    }
    for (const [reason, n] of Object.entries(roster.excluded)) excludedPlayers[reason] = (excludedPlayers[reason] ?? 0) + n;
    selected.push({ game, eventId: entry.providerEventId, roster: roster.receipt });
  }
  if (!selected.length) throw new PropPilotRefusal('Refused: no game in the core market snapshot can be requested.');
  const quoteRequests = selected.flatMap(({ game, eventId, roster }) => plan.marketGroups.map(markets =>
    ({ requestId: newRequestId(), eventId, markets: [...markets], game: { ...game }, roster: roster.map(p => ({ ...p })) })));
  const perRequest = quoteRequests.map(request => request.markets.length * PROP_CREDIT_REGIONS);
  const credits = perRequest.reduce((sum, n) => sum + n, 0);
  if (credits > plan.maxCredits || quoteRequests.length > PROP_INTAKE_LIMITS.requests) throw new Error('The pilot exceeded its credit plan.');
  const builtAt = new Date(now).toISOString();
  const sources = { schedule: fileRef(schedule), rosters: fileRef(rosters), marketSnapshot: { createdAt: new Date(created).toISOString() } };
  const input = {
    snapshot: { version: 1, season, week, generatedAt: builtAt, candidates: [], quotes: [], sources: [] },
    discovery: [],
    quoteRequests,
    propPilot: { version: 1, builtAt, season, week, stats: [...plan.stats], games: selected.map(s => s.game.id), credits, maxCredits: plan.maxCredits,
      regions: PROP_CREDIT_REGIONS, sources },
  };
  const summary = {
    job: 'prop_quote_requests', season, week, status: selected.length === plan.games ? 'ok' : 'short', games: selected.map(s => s.game.id), stats: [...plan.stats],
    requests: quoteRequests.length,
    credits: { total: credits, max: plan.maxCredits, perRequest, regions: PROP_CREDIT_REGIONS,
      basis: 'one credit per requested market per region; the three named books are one region; reserved before each request and not refunded' },
    rosterPlayers: selected.reduce((sum, s) => sum + s.roster.length, 0), excluded: { games: excludedGames, players: excludedPlayers },
    sources: { schedule: schedule.sha256, rosters: rosters.sha256, rostersUpdatedAt: rosters.updatedAt, marketSnapshotCreatedAt: sources.marketSnapshot.createdAt },
  };
  return { input, summary };
}
