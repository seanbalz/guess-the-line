// Public summary boundary. Never return raw player rows, opaque imported keys,
// unrevealed targets, quotes, model probabilities or private account content.
import { propStat, PROP_POSITIONS, validPlayerId } from './player-props.mjs';
const DAY = 24 * 60 * 60 * 1000;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const stamp = x => typeof x === 'string' && Number.isFinite(Date.parse(x));
const finite = x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1000000;
const integer = (x, max = 100000) => Number.isSafeInteger(x) && x >= 0 && x <= max;
const text = (x, max) => typeof x === 'string' && x.trim().length > 0 && x.length <= max && !/[\u0000-\u001f\u007f]/.test(x);
const duplicateKeys = (rows, field) => { const counts = new Map(); for (const row of rows) if (object(row)) counts.set(row[field], (counts.get(row[field]) ?? 0) + 1); return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key)); };
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const BASELINE_LIMITS = [
  'Experimental appearance-mean baseline, not injury-, role-, opponent- or market-adjusted.',
  'Retrospective chronological holdouts use current final source data, not archived real-time editions; later revisions may affect errors.',
  'Historical errors and residual ranges do not establish future accuracy, calibrated coverage or betting value.',
  'Missing games are not assumed to be zero.',
];
const MATCHUP_LIMITS = [
  'Raw position stat allowed per covered defense game; not opponent- or pace-adjusted.',
  'Rank 1 allowed the most in this covered sample. This is not a favorable grade, forecast or betting edge.',
  'Missing and conflicting games are excluded, not scored as zero.',
];
function source(raw, season, generatedAt) {
  const urls = {
    stats: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`,
    rosters: `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${season}.csv`,
    schedule: 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv',
  };
  if (!object(raw) || Object.entries(urls).some(([k, url]) => !object(raw[k]) || raw[k].url !== url || !hash(raw[k].sha256)
    || !stamp(raw[k].updatedAt) || !stamp(raw[k].retrievedAt) || Date.parse(raw[k].updatedAt) > Date.parse(raw[k].retrievedAt)
    || Date.parse(raw[k].retrievedAt) > generatedAt || generatedAt - Date.parse(raw[k].retrievedAt) > 3600000 || k === 'schedule' && !hash(raw[k].semanticSha256))) return null;
  return Object.fromEntries(Object.entries(urls).map(([k, url]) => [k, { url, sha256: raw[k].sha256, updatedAt: raw[k].updatedAt, retrievedAt: raw[k].retrievedAt, ...(k === 'schedule' ? { semanticSha256: raw[k].semanticSha256 } : {}) }]));
}
function baseline(raw, asOf) {
  if (!object(raw) || !['available', 'unavailable'].includes(raw.status)
    || raw.method?.id !== 'last-eight-appearances-mean-v1' || raw.method.window !== 8 || raw.method.minimumSample !== 5
    || !integer(raw.sample, 8) || !integer(raw.excluded) || !object(raw.holdout)
    || !integer(raw.holdout.count) || raw.holdout.intervalMinimum !== 20
    || !Array.isArray(raw.trainingGameIds) || raw.trainingGameIds.length !== raw.sample
    || raw.trainingGameIds.some(id => !text(id, 100)) || new Set(raw.trainingGameIds).size !== raw.sample
    || !(raw.lastObservationAt === null || stamp(raw.lastObservationAt) && Date.parse(raw.lastObservationAt) < asOf)) return null;
  const h = raw.holdout;
  if (h.count ? !finite(h.mae) || h.mae < 0 || !finite(h.bias) : h.mae !== null || h.bias !== null) return null;
  if (raw.status === 'available' ? raw.sample < 5 || !finite(raw.projection) || !raw.lastObservationAt || raw.reason !== null
    : raw.projection !== null || !['invalid_scope', 'conflicting_game_observations', 'conflicting_game_times', 'insufficient_history'].includes(raw.reason)) return null;
  let interval = null;
  if (raw.interval !== null) {
    const r = raw.interval;
    if (!object(r) || raw.status !== 'available' || h.count < 20 || r.sample !== h.count
      || !finite(r.lower) || !finite(r.upper) || r.lower > r.upper || r.calibration !== 'not-calibrated'
      || !Array.isArray(r.residualPercentiles) || r.residualPercentiles.length !== 2 || r.residualPercentiles[0] !== 10 || r.residualPercentiles[1] !== 90) return null;
    interval = { lower: r.lower, upper: r.upper, label: 'Empirical historical residual range',
      method: 'nearest-rank signed residual percentiles', residualPercentiles: [10, 90], calibration: 'not-calibrated', sample: h.count };
  }
  return { status: raw.status, reason: raw.reason,
    method: { id: 'last-eight-appearances-mean-v1', label: 'Experimental appearance-mean baseline', window: 8, minimumSample: 5 },
    projection: raw.projection, sample: raw.sample,
    trainingPeriod: raw.trainingPeriod && stamp(raw.trainingPeriod.from) && stamp(raw.trainingPeriod.to)
      && Date.parse(raw.trainingPeriod.from) <= Date.parse(raw.trainingPeriod.to) && Date.parse(raw.trainingPeriod.to) <= Date.parse(raw.lastObservationAt)
      ? { from: raw.trainingPeriod.from, to: raw.trainingPeriod.to } : null,
    trainingGameIds: [...raw.trainingGameIds], lastObservationAt: raw.lastObservationAt,
    holdout: { count: h.count, mae: h.mae, bias: h.bias, intervalMinimum: 20 }, interval, excluded: raw.excluded,
    limitations: [...BASELINE_LIMITS] };
}
function matchup(raw, opponent, position, asOf) {
  if (!object(raw) || raw.defense !== opponent || raw.position !== position || !stamp(raw.asOf) || Date.parse(raw.asOf) > asOf
    || !integer(raw.sampleGames, 22) || !integer(raw.selectedGames, 22) || !integer(raw.missingGames, 22)
    || raw.sampleGames + raw.missingGames !== raw.selectedGames || !integer(raw.playerAppearances, 2000)
    || !integer(raw.rankedDefenses, 32) || !['ranked', 'insufficient-sample'].includes(raw.status) || !object(raw.period)) return null;
  if (raw.sampleGames ? !finite(raw.total) || !finite(raw.meanAllowed) || !stamp(raw.period.from) || !stamp(raw.period.to)
    || Date.parse(raw.period.from) > Date.parse(raw.period.to) || Date.parse(raw.period.to) >= asOf
    || Math.abs(raw.meanAllowed * raw.sampleGames - raw.total) > 1e-7 * Math.max(1, Math.abs(raw.total))
    : raw.total !== null || raw.meanAllowed !== null || raw.period.from !== null || raw.period.to !== null) return null;
  if (raw.status === 'ranked' ? raw.sampleGames < 3 || !Number.isSafeInteger(raw.rank) || raw.rank < 1 || raw.rank > raw.rankedDefenses : raw.rank !== null) return null;
  return { defense: opponent, position, total: raw.total, meanAllowed: raw.meanAllowed, sampleGames: raw.sampleGames,
    playerAppearances: raw.playerAppearances, selectedGames: raw.selectedGames, missingGames: raw.missingGames,
    period: { from: raw.period.from, to: raw.period.to }, asOf: raw.asOf, rank: raw.rank,
    rankedDefenses: raw.rankedDefenses, status: raw.status, limitations: [...MATCHUP_LIMITS] };
}
/** Reconstruct only currently revealed, exact scheduled targets from a fresh public summary. */
export function projectPropResearch(raw, board, now) {
  const empty = { version: 1, status: 'unavailable', generatedAt: null, source: null, games: [] };
  if (!object(raw) || raw.version !== 1 || !stamp(raw.generatedAt) || !Number.isFinite(now)
    || Date.parse(raw.generatedAt) > now || now - Date.parse(raw.generatedAt) >= DAY
    || !Array.isArray(raw.games) || raw.games.length > 32 || !object(board) || !Array.isArray(board.games)
    || !Number.isInteger(board.season) || !Number.isInteger(board.week)) return empty;
  const provenance = source(raw.source, board.season, Date.parse(raw.generatedAt));
  if (!provenance) return empty;
  const games = [], seenGames = duplicateKeys(raw.games, 'gameId');
  for (const r of raw.games) {
    if (!object(r) || !text(r.gameId, 40) || seenGames.has(r.gameId)) continue;
    seenGames.add(r.gameId);
    const g = board.games.find(g => g.id === r.gameId);
    if (!g || g.spread?.visible !== true || g.total?.visible !== true || g.started === true
      || r.week !== board.week || !stamp(r.kickoff) || Date.parse(r.kickoff) !== Date.parse(g.kickoff)
      || Date.parse(r.kickoff) <= now || Date.parse(raw.generatedAt) >= Date.parse(r.kickoff)
      || !Array.isArray(r.players) || r.players.length > 128) continue;
    const players = [], seenPlayers = duplicateKeys(r.players, 'playerId');
    for (const p of r.players) {
      if (!object(p) || !validPlayerId(p.playerId) || seenPlayers.has(p.playerId) || !text(p.playerName, 120)
        || !PROP_POSITIONS.includes(p.position) || ![g.awayCode, g.homeCode].includes(p.team)
        || p.opponent !== (p.team === g.awayCode ? g.homeCode : g.awayCode)
        || !Array.isArray(p.markets) || p.markets.length > 11) continue;
      seenPlayers.add(p.playerId);
      const markets = [], seenMarkets = duplicateKeys(p.markets, 'key');
      for (const m of p.markets) {
        const stat = propStat(m?.key);
        if (!object(m) || !stat || stat.unit !== m.unit || seenMarkets.has(m.key)) continue;
        seenMarkets.add(m.key);
        const b = baseline(m.baseline, Date.parse(raw.generatedAt));
        const season = matchup(m.matchups?.season, p.opponent, p.position, Date.parse(raw.generatedAt));
        const last5 = matchup(m.matchups?.last5, p.opponent, p.position, Date.parse(raw.generatedAt));
        if (!b && !season && !last5) continue;
        markets.push({ key: stat.key, unit: stat.unit, baseline: b, matchups: { season, last5 } });
      }
      if (markets.length) players.push({ playerId: p.playerId, playerName: p.playerName, team: p.team, opponent: p.opponent, position: p.position, markets });
    }
    if (players.length) games.push({ gameId: r.gameId, kickoff: r.kickoff, week: r.week, players });
  }
  return games.length ? { version: 1, status: 'available', generatedAt: raw.generatedAt, source: provenance, games } : empty;
}
