// Public NFL player research only. No Guess picks, bookmaker lines, account state, or network access.
// Projected points rank on their displayed tenth, so equal displayed scores share a competition rank.
// Exact points order tied rows, followed by the stable player ID. Team/search filters never rerank.

export const SCORING_OPTIONS = Object.freeze([
  { value: 'standard', label: 'Standard' }, { value: 'half-ppr', label: 'Half PPR' }, { value: 'ppr', label: 'PPR' },
]);
export const POSITION_OPTIONS = Object.freeze([
  { value: 'ALL', label: 'Overall' }, { value: 'QB', label: 'QB' }, { value: 'RB', label: 'RB' },
  { value: 'WR', label: 'WR' }, { value: 'TE', label: 'TE' }, { value: 'FLEX', label: 'FLEX' },
  { value: 'K', label: 'K' }, { value: 'DST', label: 'D/ST' },
]);
export const SCOPE_OPTIONS = Object.freeze([
  { value: 'weekly', label: 'Weekly' }, { value: 'ros', label: 'Rest of season' },
]);
export const DEFAULT_FILTERS = Object.freeze({
  scope: 'weekly', scoring: 'ppr', passingTds: 4, position: 'ALL', team: 'ALL', search: '', trendsOnly: false,
});

const OFFENSE = Object.freeze([
  ['passingYards', 'Passing yards', 0.04], ['passingTds', 'Passing touchdowns', 4],
  ['interceptions', 'Interceptions thrown', -2], ['rushingYards', 'Rushing yards', 0.1],
  ['rushingTds', 'Rushing touchdowns', 6], ['receptions', 'Receptions', 1],
  ['receivingYards', 'Receiving yards', 0.1], ['receivingTds', 'Receiving touchdowns', 6],
  ['fumblesLost', 'Fumbles lost', -2], ['twoPointConversions', 'Two-point conversions', 2],
  ['specialTeamsTds', 'Return touchdowns', 6],
]);
const KICKER = Object.freeze([
  ['fieldGoals0to39', 'Field goals, 0–39 yards', 3], ['fieldGoals40to49', 'Field goals, 40–49 yards', 4],
  ['fieldGoals50plus', 'Field goals, 50+ yards', 5], ['extraPoints', 'Extra points made', 1],
  ['fieldGoalsMissed', 'Field goals missed', -1], ['extraPointsMissed', 'Extra points missed', -1],
]);
const OFFENSIVE_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const POSITIONS = new Set([...OFFENSIVE_POSITIONS, 'K', 'DST']);
const FLEX = new Set(['RB', 'WR', 'TE']);
const SIGNED_STATS = new Set(['passingYards', 'rushingYards', 'receivingYards']);
const KNOWN_STATS = new Set([...OFFENSE, ...KICKER].map(([key]) => key).concat(['targets', 'carries', 'passingAttempts']));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const tenth = value => Math.round((value + Number.EPSILON) * 10) / 10;
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const receptionPoints = scoring => ({ standard: 0, 'half-ppr': 0.5, ppr: 1 })[scoring];
const validSettings = ({ scoring = 'ppr', passingTds = 4 }) => receptionPoints(scoring) !== undefined && [4, 6].includes(passingTds);

/** Display exactly the same rounded tenth used for shared ranks, including half-tenth boundaries. */
export function formatFantasyNumber(value) {
  if (!finite(value)) return '—';
  const rounded = tenth(value);
  return finite(rounded) ? rounded.toFixed(1) : '—';
}

/** Exact weights for the selected preset; no bonus, yardage threshold, or custom league rule is implied. */
export function scoringRules({ scoring = 'ppr', passingTds = 4 } = {}) {
  if (!validSettings({ scoring, passingTds })) return null;
  return {
    offense: OFFENSE.map(([key, label, points]) => ({ key, label, points: key === 'passingTds' ? passingTds : key === 'receptions' ? receptionPoints(scoring) : points })),
    kicker: KICKER.map(([key, label, points]) => ({ key, label, points })),
    defense: null,
  };
}

/** Every required stat must be known, including zero-valued events. Missing stats never become zero. */
export function scoreStats(stats, { scoring = 'ppr', passingTds = 4, position = 'QB' } = {}) {
  const rules = scoringRules({ scoring, passingTds });
  if (!stats || typeof stats !== 'object' || !rules || (!OFFENSIVE_POSITIONS.has(position) && position !== 'K')) return null;
  const fields = position === 'K' ? rules.kicker : rules.offense;
  if (fields.some(({ key }) => !finite(stats[key]) || (!SIGNED_STATS.has(key) && stats[key] < 0))) return null;
  const points = fields.reduce((sum, { key, points: weight }) => sum + stats[key] * weight, 0);
  return finite(points) ? points : null;
}

export function normalizeFantasyFilters(filters = {}) {
  return {
    scope: SCOPE_OPTIONS.some(option => option.value === filters.scope) ? filters.scope : DEFAULT_FILTERS.scope,
    scoring: SCORING_OPTIONS.some(option => option.value === filters.scoring) ? filters.scoring : DEFAULT_FILTERS.scoring,
    passingTds: [4, 6].includes(filters.passingTds) ? filters.passingTds : DEFAULT_FILTERS.passingTds,
    position: POSITION_OPTIONS.some(option => option.value === filters.position) ? filters.position : DEFAULT_FILTERS.position,
    team: typeof filters.team === 'string' && filters.team ? filters.team : DEFAULT_FILTERS.team,
    search: typeof filters.search === 'string' ? filters.search.trim().slice(0, 100) : '',
    trendsOnly: filters.trendsOnly === true,
  };
}

const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const validText = value => typeof value === 'string' && value.trim().length > 0;
const safeUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
};

/** Invalid public snapshots fail closed; unavailable null stats remain a valid, unranked state. */
export function validateFantasySnapshot(snapshot, { now = Date.now() } = {}) {
  const errors = [];
  const fail = message => errors.push(message);
  if (!isRecord(snapshot)) return { valid: false, errors: ['Snapshot is missing.'] };
  const instant = typeof now === 'string' ? Date.parse(now) : now;
  if (!finite(instant)) fail('Current time is invalid.');
  if (![1, 2].includes(snapshot.schemaVersion)) fail('Unsupported snapshot version.');
  if (snapshot.schemaVersion === 2) {
    if (!Array.isArray(snapshot.rosterFallbackTeams) || snapshot.rosterFallbackTeams.some(team => !validText(team))) fail('Roster fallback list is invalid.');
    if (!isRecord(snapshot.matchups)) fail('Matchups are missing.');
    else for (const [team, games] of Object.entries(snapshot.matchups)) {
      if (!Array.isArray(games)) { fail(`Matchups for ${team} are invalid.`); continue; }
      for (const game of games) {
        if (!isRecord(game) || !Number.isInteger(game.week) || game.week < 1 || game.week >= snapshot.week || !validText(game.opponent) || !isRecord(game.allowed)) { fail(`Matchups for ${team} are invalid.`); continue; }
        for (const position of ['QB', 'RB', 'WR', 'TE']) {
          if (!isRecord(game.allowed[position])) fail(`Matchups for ${team} Week ${game.week} ${position} are missing.`);
          else stats(game.allowed[position], `Matchups ${team} Week ${game.week} ${position}`);
        }
      }
    }
  }
  if (!Number.isInteger(snapshot.season) || snapshot.season < 1900 || snapshot.season > 2200) fail('Season is invalid.');
  if (!Number.isInteger(snapshot.week) || snapshot.week < 1 || snapshot.week > 18) fail('Week is invalid.');
  if (!Number.isInteger(snapshot.statsThroughWeek) || snapshot.statsThroughWeek < 0 || snapshot.statsThroughWeek >= snapshot.week) fail('Stats coverage must precede the selected week.');
  function timestamp(value, path, nullable = false) {
    if (nullable && value == null) return;
    const time = typeof value === 'string' ? Date.parse(value) : NaN;
    if (!finite(time)) fail(`${path} is invalid.`);
    else if (time > instant) fail(`${path} is in the future.`);
  }
  timestamp(snapshot.asOf, 'asOf');
  timestamp(snapshot.generatedAt, 'generatedAt');
  if (Date.parse(snapshot.asOf) > Date.parse(snapshot.generatedAt)) fail('asOf follows generatedAt.');
  if (!isRecord(snapshot.method) || !validText(snapshot.method.name) || !validText(snapshot.method.version) || !validText(snapshot.method.description)) fail('Method is missing.');
  if (!Array.isArray(snapshot.sources) || !snapshot.sources.length) fail('Sources are missing.');
  else for (const [index, source] of snapshot.sources.entries()) {
    if (!isRecord(source)) { fail(`Source ${index} is invalid.`); continue; }
    if (!validText(source.name) || !validText(source.license) || !safeUrl(source.url) || !safeUrl(source.licenseUrl)) fail(`Source ${index} has invalid attribution.`);
    if (typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(source.sha256)) fail(`Source ${index} has no valid checksum.`);
    timestamp(source.retrievedAt, `Source ${index} retrievedAt`);
    timestamp(source.updatedAt, `Source ${index} updatedAt`, true);
  }
  const ids = new Set();
  function stats(value, path) {
    if (value == null) return;
    if (!isRecord(value)) { fail(`${path} is invalid.`); return; }
    for (const [key, number] of Object.entries(value)) if (KNOWN_STATS.has(key) && number !== null) {
      if (!finite(number) || (!SIGNED_STATS.has(key) && number < 0)) fail(`${path}.${key} is invalid.`);
    }
  }
  if (!Array.isArray(snapshot.players)) fail('Players are missing.');
  else for (const [index, player] of snapshot.players.entries()) {
    if (!isRecord(player)) { fail(`Player ${index} is invalid.`); continue; }
    const path = `Player ${index}`;
    if (!validText(player.id) || ids.has(player.id)) fail(`${path} has an invalid or duplicate ID.`);
    ids.add(player.id);
    if (!validText(player.name) || !validText(player.team) || !POSITIONS.has(player.position)) fail(`${path} has invalid identity fields.`);
    if (!Number.isInteger(player.sampleGames) || player.sampleGames < 0 || player.sampleGames > 18) fail(`${path} has an invalid sample size.`);
    if (player.weekly != null) {
      if (!isRecord(player.weekly) || !['scheduled', 'bye', 'unknown'].includes(player.weekly.status)) fail(`${path} weekly status is invalid.`);
      else {
        stats(player.weekly.stats, `${path} weekly stats`);
        if (player.weekly.status === 'scheduled' && (!validText(player.weekly.opponent) || !finite(Date.parse(player.weekly.kickoff)))) fail(`${path} scheduled matchup is incomplete.`);
      }
    }
    if (player.restOfSeason != null) {
      if (!isRecord(player.restOfSeason)) fail(`${path} rest-of-season data is invalid.`);
      else {
        stats(player.restOfSeason.stats, `${path} rest-of-season stats`);
        if (player.restOfSeason.games !== null && (!Number.isInteger(player.restOfSeason.games) || player.restOfSeason.games < 0 || player.restOfSeason.games > 18)) fail(`${path} rest-of-season game count is invalid.`);
      }
    }
    if (!Array.isArray(player.history)) fail(`${path} history is missing.`);
    else {
      const weeks = new Set();
      for (const row of player.history) {
        if (!isRecord(row) || !Number.isInteger(row.week) || row.week < 1 || row.week > 18 || weeks.has(row.week)) fail(`${path} has invalid or repeated history weeks.`);
        else weeks.add(row.week);
        stats(row, `${path} history`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/** A descriptive two-game shift against up to four earlier games; never a claim of predictive significance. */
export function playerTrendHighlights(player, { week, statsThroughWeek = week - 1, scoring = 'ppr', passingTds = 4 } = {}) {
  const history = (player.history || []).filter(row => Number.isInteger(row.week) && row.week < week && row.week <= statsThroughWeek).sort((a, b) => a.week - b.week);
  if (history.length < 4) return [];
  const recentRows = history.slice(-2), baselineRows = history.slice(-6, -2);
  const definitions = [
    { id: 'targets', label: 'Targets', absolute: 2, relative: 0.3, read: row => row.targets },
    { id: 'carries', label: 'Carries', absolute: 4, relative: 0.3, read: row => row.carries },
    { id: 'passing-attempts', label: 'Passing attempts', absolute: 7, relative: 0.2, read: row => row.passingAttempts },
    { id: 'fantasy-points', label: 'Fantasy scoring', absolute: 3, relative: 0.2, read: row => scoreStats(row, { scoring, passingTds, position: player.position }) },
  ];
  const highlights = [];
  for (const definition of definitions) {
    const recentValues = recentRows.map(definition.read), baselineValues = baselineRows.map(definition.read);
    if (![...recentValues, ...baselineValues].every(finite)) continue;
    const recent = mean(recentValues), baseline = mean(baselineValues), delta = recent - baseline;
    if (baseline === 0 || Math.abs(delta) + 1e-9 < definition.absolute || Math.abs(delta) / Math.abs(baseline) + 1e-9 < definition.relative) continue;
    const up = delta > 0;
    if (!recentValues.every(value => up ? value > baseline : value < baseline)) continue;
    highlights.push({
      id: definition.id, label: `${definition.label} ${up ? 'rising' : 'falling'}`, direction: up ? 'up' : 'down',
      detail: `${tenth(recent)} per game in the last 2 appearances vs ${tenth(baseline)} in the previous ${baselineRows.length}. Observed change through Week ${recentRows.at(-1).week}.`,
      recent: tenth(recent), baseline: tenth(baseline), recentGames: recentRows.length, baselineGames: baselineRows.length,
    });
    if (highlights.length === 2) break;
  }
  return highlights;
}

const compare = (a, b) => b.points - a.points || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function ranks(rows) {
  const out = new Map();
  let previous = null, rank = 0;
  for (const [index, row] of rows.entries()) {
    const displayed = tenth(row.points);
    if (displayed !== previous) rank = index + 1;
    out.set(row.id, rank);
    previous = displayed;
  }
  return out;
}

/** total: source players; eligible: rankable players in the selected position before team/search/trend filters. */
export function buildRankings(snapshot, filters = {}, options = {}) {
  const selected = normalizeFantasyFilters(filters), validation = validateFantasySnapshot(snapshot, options);
  if (!validation.valid) return {
    rows: [], total: Array.isArray(snapshot?.players) ? snapshot.players.length : 0, eligible: 0, teams: [],
    summary: { filters: selected, shown: 0 }, error: 'Rankings data could not be verified.', validationErrors: validation.errors,
  };
  const teams = [...new Set(snapshot.players.map(player => player.team))].sort();
  const candidates = [];
  let byes = 0, unavailable = 0;
  for (const player of snapshot.players) {
    const projection = selected.scope === 'ros' ? player.restOfSeason : player.weekly;
    const games = selected.scope === 'ros' ? projection?.games : 1;
    if (selected.scope === 'weekly' && projection?.status === 'bye') { byes += 1; continue; }
    const points = scoreStats(projection?.stats, { ...selected, position: player.position });
    if (!player.sampleGames || points === null || !Number.isInteger(games) || games <= 0 || (selected.scope === 'weekly' && projection?.status !== 'scheduled')) { unavailable += 1; continue; }
    candidates.push({ ...player, points, perGame: points / games, games, trendHighlights: playerTrendHighlights(player, { ...selected, week: snapshot.week, statsThroughWeek: snapshot.statsThroughWeek }) });
  }
  candidates.sort(compare);
  const overall = ranks(candidates), positional = new Map();
  for (const position of POSITIONS) for (const [id, rank] of ranks(candidates.filter(player => player.position === position))) positional.set(id, rank);
  const positioned = candidates.filter(player => selected.position === 'ALL' || (selected.position === 'FLEX' ? FLEX.has(player.position) : player.position === selected.position));
  const selectedRanks = ranks(positioned), search = selected.search.toLocaleLowerCase('en-US');
  const rows = positioned.filter(player =>
    (selected.team === 'ALL' || player.team === selected.team)
    && (!search || `${player.name} ${player.team} ${player.position}`.toLocaleLowerCase('en-US').includes(search))
    && (!selected.trendsOnly || player.trendHighlights.length > 0)
  ).map(player => ({ ...player, rank: selectedRanks.get(player.id), overallRank: overall.get(player.id), positionRank: positional.get(player.id) }));
  return {
    rows, total: snapshot.players.length, eligible: positioned.length, teams,
    summary: {
      filters: selected, shown: rows.length, ranked: candidates.length, byes, unavailable,
      rising: rows.filter(player => player.trendHighlights.some(trend => trend.direction === 'up')).length,
      falling: rows.filter(player => player.trendHighlights.some(trend => trend.direction === 'down')).length,
      asOf: snapshot.asOf, statsThroughWeek: snapshot.statsThroughWeek, method: snapshot.method.name,
      note: selected.position === 'DST' ? 'D/ST rankings are unavailable until defensive scoring data can be verified.' : null,
    },
  };
}
