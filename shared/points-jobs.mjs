// Guess the Points scheduled-job logic (D-56, P-03): pure and I/O-free (Node and Deno). Turns the Track 1 weekly
// estimate snapshot into a draft slate for gtl_points_publish_slate, and nflverse weekly CSVs into the payload
// gtl_points_load_actuals accepts. Fetching, hashing and RPC calls belong to the worker, not here.
import { normalizePlayerStats, parseFantasyCsv } from './fantasy-build.mjs';
import { gameIdFor } from './fantasy-context.mjs';
import { scoreStats } from './fantasy-rankings.mjs';
import { appCode, easternToUtc, pacificDate, pacificToUtc, weekOpenAt } from './nfl-schedule.mjs';
import { roundTenth } from './points-scoring.mjs';
import { buildPointsSlate } from './points-slate.mjs';

export const POINTS_RULES = Object.freeze({ format: 'ppr', passingTds: 4, version: 'ppr4-v1' });

const RELEASE = 'https://github.com/nflverse/nflverse-data/releases/download';
export const NFLVERSE = Object.freeze({
  stats: season => `${RELEASE}/stats_player/stats_player_week_${season}.csv`,
  snaps: season => `${RELEASE}/snap_counts/snap_counts_${season}.csv`,
  rosters: season => `${RELEASE}/weekly_rosters/roster_weekly_${season}.csv`,
  games: () => `${RELEASE}/schedules/games.csv`,
});

const pad = n => String(n).padStart(2, '0');
const STAT_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
const STATS_REQUIRED = ['player_id', 'position', 'season', 'week', 'season_type', 'game_id', 'team'];
const SNAPS_REQUIRED = ['season', 'game_type', 'week', 'pfr_player_id', 'offense_snaps', 'st_snaps'];
const ROSTER_REQUIRED = ['season', 'week', 'game_type', 'gsis_id', 'pfr_id', 'status'];
const GAMES_REQUIRED = ['game_id', 'season', 'game_type', 'week', 'gameday', 'gametime', 'away_team', 'home_team'];

/** Header plus every line containing any needle: a cheap scan before the full parse (no nflverse cell holds a newline). */
export function linesFor(csvText, needles) {
  const end = csvText.indexOf('\n');
  if (end < 0) throw new Error('The source file has no rows.');
  const kept = [csvText.slice(0, end)];
  for (let start = end + 1; start < csvText.length;) {
    let stop = csvText.indexOf('\n', start);
    if (stop < 0) stop = csvText.length;
    const line = csvText.slice(start, stop);
    if (needles.some(needle => line.includes(needle))) kept.push(line);
    start = stop + 1;
  }
  return kept.join('\n');
}

/** The season's regular-season games with app team codes and UTC kickoffs. A game with no date or time is left out. */
export function scheduleGames(gamesCsv, { season }) {
  return parseFantasyCsv(linesFor(gamesCsv, [`${season}_`]), GAMES_REQUIRED)
    .filter(row => Number(row.season) === season && row.game_type === 'REG' && /^\d{4}-\d{2}-\d{2}$/.test(row.gameday) && /^\d{2}:\d{2}$/.test(row.gametime))
    .map(row => ({ gameId: row.game_id, week: Number(row.week), away: appCode(row.away_team), home: appCode(row.home_team), kickoff: easternToUtc(row.gameday, row.gametime) }));
}

/** D-24 context: a competition week opens Tuesday 12:00 PM Pacific, the day after the Monday that starts its game week. */
export function pointsOpensAt(firstKickoff) {
  const monday = pacificDate(Date.parse(weekOpenAt(firstKickoff))).date;
  const tuesday = new Date(Date.parse(`${monday}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return pacificToUtc(tuesday, '12:00');
}

const estimateOf = player => {
  const points = scoreStats(player.weekly?.stats, { scoring: POINTS_RULES.format, passingTds: POINTS_RULES.passingTds, position: player.position });
  return Number.isFinite(points) ? roundTenth(points) : null;
};
const REPORTED = new Set(['Out', 'Doubtful', 'Questionable']);

/** Builder input rows from the snapshot; a player whose game is not in the week's schedule is left out. */
export function slatePlayers(snapshot, { season, week, games }) {
  const byTeams = new Map(games.filter(g => g.week === week).map(g => [`${g.away}-${g.home}`, g]));
  const rows = [];
  for (const player of snapshot.players ?? []) {
    const game = byTeams.get(gameIdFor(player));
    if (!game) continue;
    const head = String(player.status ?? '').split(' · ')[0];
    rows.push({ id: player.id, name: player.name, team: player.team, position: player.position, estimate: estimateOf(player),
      rosterStatus: 'ACT', reportStatus: REPORTED.has(head) ? head : '', reserve: false, gameKey: game.gameId, kickoff: player.weekly.kickoff });
  }
  return rows;
}

/** The draft the scheduler stores: { ok: true, slate } or { ok: false, reason } (fail closed). */
export function draftSlate({ snapshot, snapshotFile, snapshotSha256, season, week, games, selectionVersion, now = Date.now() }) {
  if (!snapshot || snapshot.season !== season || snapshot.week !== week || snapshot.statsThroughWeek !== week - 1) return { ok: false, reason: 'stale_snapshot' };
  const weekGames = (games ?? []).filter(g => g.week === week);
  if (!weekGames.length) return { ok: false, reason: 'no_games' };
  const first = Math.min(...weekGames.map(g => Date.parse(g.kickoff)));
  if (now >= first) return { ok: false, reason: 'kicked_off' };
  const built = buildPointsSlate({ season, week, players: slatePlayers(snapshot, { season, week, games }), selectionVersion });
  if (!built.ok) return { ok: false, reason: built.reason };
  const { slate } = built;
  return {
    ok: true,
    slate: {
      opensAt: pointsOpensAt(new Date(first).toISOString()), scoringRules: POINTS_RULES, slots: slate.slots, house: slate.house,
      provenance: { snapshotFile, sha256: snapshotSha256, generatedAt: snapshot.generatedAt, statsThroughWeek: snapshot.statsThroughWeek, selectionVersion: slate.selectionVersion, seed: slate.seed },
    },
  };
}

/**
 * The week's regular-season stats: `rows`, the QB/RB/WR/TE/K rows scored, one per player (a duplicate fails closed), and
 * `playerIds`, every player with a row in the week at any position (the real file also lists FB, CB, LB and others), so
 * "no stats row" can be told apart from "a row at a position that is not scored".
 */
export function weekStats(statsCsv, { season, week }) {
  const all = parseFantasyCsv(linesFor(statsCsv, [`,${season}_${pad(week)}_`]), STATS_REQUIRED)
    .filter(row => Number(row.season) === season && Number(row.week) === week && row.season_type === 'REG');
  const players = new Map();
  for (const row of all) {
    if (!STAT_POSITIONS.has(row.position)) continue;
    if (players.has(row.player_id)) throw new Error(`Duplicate stats row for ${row.player_id}.`);
    const stats = normalizePlayerStats(row);
    const points = scoreStats(stats, { scoring: POINTS_RULES.format, passingTds: POINTS_RULES.passingTds, position: row.position });
    players.set(row.player_id, {
      playerId: row.player_id, name: row.player_display_name || row.player_name, team: appCode(row.team), position: row.position,
      gameKey: row.game_id, stats, points: Number.isFinite(points) ? roundTenth(points) : null,
    });
  }
  return { rows: [...players.values()], playerIds: new Set(all.map(row => row.player_id)) };
}

/** QB/RB/WR/TE/K regular-season rows of the week, one per player (a duplicate fails closed). */
export function weekStatsRows(statsCsv, options) {
  return weekStats(statsCsv, options).rows;
}

/** Offense plus special-teams snaps of the week by pfr_player_id. */
export function weekSnaps(snapCsv, { season, week }) {
  const rows = parseFantasyCsv(linesFor(snapCsv, [`${season}_${pad(week)}_`]), SNAPS_REQUIRED)
    .filter(row => Number(row.season) === season && Number(row.week) === week && row.game_type === 'REG');
  const snaps = new Map();
  for (const row of rows) snaps.set(row.pfr_player_id, (snaps.get(row.pfr_player_id) ?? 0) + (Number(row.offense_snaps) || 0) + (Number(row.st_snaps) || 0));
  return snaps;
}

/** Weekly-roster pfr id and status by gsis id for the requested players. */
export function rosterFacts(rosterCsv, { season, week, playerIds }) {
  const wanted = new Set(playerIds);
  if (!wanted.size) return new Map();
  const rows = parseFantasyCsv(linesFor(rosterCsv, [...wanted]), ROSTER_REQUIRED)
    .filter(row => Number(row.season) === season && Number(row.week) === week && row.game_type === 'REG' && wanted.has(row.gsis_id));
  const facts = new Map();
  for (const row of rows) {
    const prior = facts.get(row.gsis_id);
    // Conflicting duplicate rows for one player-week fail closed: no status, so the slot stays pending.
    if (prior && prior.status !== row.status) facts.set(row.gsis_id, { pfrId: prior.pfrId, status: null });
    else if (!prior) facts.set(row.gsis_id, { pfrId: row.pfr_id || null, status: row.status });
  }
  return facts;
}

/** Whether a slate player played, with the evidence (design step 2 precedence). Unknown stays null so the slot stays pending. */
export function playedEvidence({ hasStats, snapCount, rosterStatus, movedOutOfWeek }) {
  if (hasStats) return { played: true, basis: 'stats' };
  if (movedOutOfWeek) return { played: false, basis: 'postponed' };
  if (rosterStatus === 'INA') return { played: false, basis: 'inactive' };
  if (typeof rosterStatus === 'string' && rosterStatus !== '' && rosterStatus !== 'ACT') return { played: false, basis: 'reserve' };
  if (typeof snapCount === 'number' && snapCount > 0) return { played: true, basis: 'snaps' };
  if (snapCount === 0) return { played: false, basis: 'no_snaps' };
  return { played: null, basis: 'unknown' };
}

const GAME_KEY = /^(\d{4})_(\d{2})_([A-Z]{2,3})_([A-Z]{2,3})$/;

/**
 * Whether the slot's game left week W. nflverse gives a game moved to another week a new game_id (games.csv, 2020: DEN at
 * NE, first set for Week 5, exists only as 2020_06_DEN_NE), so a move is the slot's own id gone from the season's games
 * while a game with the same away and home teams (same orientation: a division rematch is a different game) is in another
 * week and none is in week W. A game absent altogether (cancelled, or unknown) is never a move: fail closed.
 */
function movedOutOfWeek(slot, { season, week, games }) {
  const key = GAME_KEY.exec(slot.gameKey ?? '');
  if (!key || Number(key[1]) !== season || games.some(g => g.gameId === slot.gameKey)) return false;
  const away = appCode(key[3]), home = appCode(key[4]);
  const pair = games.filter(g => g.away === away && g.home === home && String(g.gameId).startsWith(`${season}_`));
  return pair.some(g => g.week !== week) && !pair.some(g => g.week === week);
}

/**
 * The gtl_points_load_actuals payload for the week. `statsRows` and `statsPlayerIds` come from weekStats (the scored rows,
 * and every player id with a row in the week at any position); `games` is the season's scheduleGames list.
 */
export function actualsPayload({ season, week, statsRows, statsPlayerIds, slots, snaps, roster, games, versions, source, coverage }) {
  const pointsFor = value => (typeof value === 'number' && Number.isFinite(value) ? Object.fromEntries(versions.map(v => [v, value])) : {});
  const players = statsRows.map(row => ({
    playerId: row.playerId, name: row.name, team: row.team, position: row.position, gameKey: row.gameKey,
    stats: row.stats, points: pointsFor(row.points), played: true, playedBasis: 'stats',
  }));
  const have = new Set(statsRows.map(row => row.playerId));
  const covered = new Set(statsRows.map(row => row.gameKey));
  let without = 0;
  for (const slot of slots) {
    if (have.has(slot.playerId)) continue;
    without += 1;
    const fact = roster?.get(slot.playerId);
    const snapCount = fact?.pfrId ? snaps?.get(fact.pfrId) : undefined;
    const moved = movedOutOfWeek(slot, { season, week, games: games ?? [] });
    const { played, basis } = playedEvidence({ hasStats: false, snapCount, rosterStatus: fact?.status, movedOutOfWeek: moved });
    // Design step 2: snaps and no stats row at any position means he played and recorded nothing, so he scores 0. That holds
    // only once the stats file covers his game (a scored row carries its id); until then, with a row at a position that is
    // not scored, or without the week's player ids, he stays pending: missing is never 0.
    const zero = played === true && basis === 'snaps' && statsPlayerIds instanceof Set && !statsPlayerIds.has(slot.playerId) && covered.has(slot.gameKey);
    players.push({ playerId: slot.playerId, name: slot.name, team: slot.team, position: slot.position, gameKey: slot.gameKey, stats: {}, points: zero ? pointsFor(0) : {}, played, playedBasis: basis });
  }
  return { season, week, source, coverage: { rows: statsRows.length, rowsWithoutNameOrTeam: statsRows.filter(row => !row.name || !row.team).length, slatePlayersWithoutStats: without, ...coverage }, players };
}
