// Weekly accuracy record (D-57): the estimates that were published for a week, graded against that week's nflverse
// actuals with a season-average baseline. A report card for GTL's pace estimates, not a forecast or betting claim.
import { completedWeeks, normalizePlayerStats } from './fantasy-build.mjs';
import { scoreStats, validateFantasySnapshot } from './fantasy-rankings.mjs';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];
const round = value => Math.round(value * 1e6) / 1e6;
const mean = values => values.reduce((total, value) => total + value, 0) / values.length;
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

function averageStats(history) {
  if (history.length < 2) return null;
  const keys = Object.keys(history[0]).filter(key => key !== 'week');
  return Object.fromEntries(keys.map(key => [key, history.some(row => typeof row[key] !== 'number' || !Number.isFinite(row[key])) ? null
    : round(history.reduce((total, row) => total + row[key], 0) / history.length)]));
}

export function buildFantasyReview({ published, file, schedule, stats, statsSource, generatedAt, freezeAt, final }) {
  const { season, week } = published;
  if (!validateFantasySnapshot(published, { now: Date.parse(generatedAt) }).valid) throw new Error('The published snapshot is invalid.');
  if (!completedWeeks({ season, schedule, stats }).has(week)) throw new Error(`Week ${week} statistics are not complete yet.`);
  const actual = new Map();
  for (const row of stats) {
    if (Number(row.season) === season && row.season_type === 'REG' && Number(row.week) === week && POSITIONS.includes(row.position)) actual.set(row.player_id, normalizePlayerStats(row));
  }
  const estimated = new Set(), players = [];
  for (const player of published.players) {
    if (player.weekly?.status !== 'scheduled' || !player.weekly.stats) continue;
    estimated.add(player.id);
    players.push({ id: player.id, name: player.name, team: player.team, position: player.position, estimate: player.weekly.stats,
      actual: actual.get(player.id) ?? null, baseline: averageStats(player.history.filter(row => row.week < week)) });
  }
  return {
    schemaVersion: 1, season, week, generatedAt, status: final ? 'FINAL' : 'PROVISIONAL',
    estimate: { file: file.name, sha256: file.sha256, generatedAt: published.generatedAt, publishedBeforeFreeze: Date.parse(published.generatedAt) < freezeAt },
    actuals: statsSource, players: players.sort((a, b) => a.id.localeCompare(b.id)),
    playedWithoutEstimate: [...actual.keys()].filter(id => !estimated.has(id)).length,
  };
}

export function validateFantasyReview(review) {
  const errors = [], fail = message => errors.push(message);
  if (!isRecord(review)) return { valid: false, errors: ['Review is missing.'] };
  if (review.schemaVersion !== 1) fail('Unsupported review version.');
  if (!Number.isInteger(review.season) || !Number.isInteger(review.week) || review.week < 1 || review.week > 18) fail('Review week is invalid.');
  if (!iso(review.generatedAt)) fail('Review time is invalid.');
  if (!['PROVISIONAL', 'FINAL'].includes(review.status)) fail('Review status is invalid.');
  if (!isRecord(review.estimate) || typeof review.estimate.file !== 'string' || !/^[a-f0-9]{64}$/.test(review.estimate.sha256 ?? '') || typeof review.estimate.publishedBeforeFreeze !== 'boolean') fail('Review estimate source is invalid.');
  if (!isRecord(review.actuals) || typeof review.actuals.url !== 'string') fail('Review actuals source is invalid.');
  if (!Number.isInteger(review.playedWithoutEstimate) || review.playedWithoutEstimate < 0) fail('Review count is invalid.');
  if (!Array.isArray(review.players)) fail('Review players are missing.');
  else for (const player of review.players) {
    if (!isRecord(player) || typeof player.id !== 'string' || typeof player.name !== 'string' || !POSITIONS.includes(player.position) || !isRecord(player.estimate)
      || (player.actual !== null && !isRecord(player.actual)) || (player.baseline !== null && !isRecord(player.baseline))) { fail('Review player is invalid.'); break; }
  }
  return { valid: errors.length === 0, errors };
}

/** Metrics under the selected scoring. Players without a stats row, or without a scoreable stat line, are never scored. */
export function summarizeReview(review, settings = {}) {
  const graded = []; let noStatsRow = 0;
  for (const player of review.players) {
    const options = { ...settings, position: player.position };
    const estimate = scoreStats(player.estimate, options);
    if (estimate === null) continue;
    if (!player.actual) { noStatsRow++; continue; }
    const actual = scoreStats(player.actual, options);
    if (actual === null) continue;
    const baseline = player.baseline ? scoreStats(player.baseline, options) : null;
    graded.push({ id: player.id, name: player.name, team: player.team, position: player.position, estimate, actual, baseline, diff: estimate - actual, miss: Math.abs(estimate - actual) });
  }
  const mae = list => list.length ? mean(list.map(row => row.miss)) : null;
  const baselineMae = list => { const rows = list.filter(row => row.baseline !== null); return rows.length ? mean(rows.map(row => Math.abs(row.baseline - row.actual))) : null; };
  const byPosition = POSITIONS.map(position => { const list = graded.filter(row => row.position === position); return { position, graded: list.length, mae: mae(list), baselineMae: baselineMae(list) }; }).filter(row => row.graded);
  const pick = ({ id, name, team, position, estimate, actual, diff }) => ({ id, name, team, position, estimate, actual, diff });
  return {
    graded: graded.length, mae: mae(graded), baselineMae: baselineMae(graded),
    within5: graded.length ? graded.filter(row => row.miss <= 5).length / graded.length : null,
    beatBaseline: byPosition.filter(row => row.baselineMae !== null && row.mae < row.baselineMae).map(row => row.position),
    byPosition,
    overs: graded.filter(row => row.diff > 0).sort((a, b) => b.diff - a.diff || a.id.localeCompare(b.id)).slice(0, 5).map(pick),
    unders: graded.filter(row => row.diff < 0).sort((a, b) => a.diff - b.diff || a.id.localeCompare(b.id)).slice(0, 5).map(pick),
    noStatsRow, playedWithoutEstimate: review.playedWithoutEstimate,
  };
}
