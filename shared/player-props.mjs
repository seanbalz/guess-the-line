// Player Props (D-82; docs/superpowers/specs/2026-11-09-player-props-design.md). The native-unit prop domain shared by
// gtl-api, the receipts module and the app. It has no I/O, no clock and no provider access.
//
// Rules this module encodes, each from the approved spec:
// - Eleven canonical full-game stat identities. Each keeps its own key and unit. Alternate lines, partial-game periods,
//   binary touchdown prices and unidentified selections are outside this catalog.
// - A selection is the verified scheduled event, a stable player ID and the canonical stat key, with season/week
//   provenance. Names never join quotes or results.
// - Yards are signed (a rushing or receiving loss is a real result); every other stat is a nonnegative count.
// - Accuracy is the absolute miss against the saved lock-in reference, averaged per stat type in that stat's unit.
//   There is no combined prop score, no percentage and no score out of 100. No guesses is unavailable, never zero.
// - The paper record is a separate measure (D-77's 1U at standard minus 110). Missing evidence stays ungraded.
// - D-81's NFL spread/total gap calibration is a game-line calibration. It is deliberately not imported here and is
//   never applied to, or used to normalize, a prop stat (tests/player-props-domain.test.mjs checks the imports).

/** The guessing mode's name everywhere it is switched: the app flag, the gtl-api flag and the feature-off switch. */
export const PLAYER_PROPS_FEATURE = 'player-props';

const stat = (key, family, label, unit, short, signed, guessMin, guessMax, resultColumn) =>
  Object.freeze({ key, family, label, unit, short, signed, guessMin, guessMax, resultColumn });

/** Canonical full-game stats, in display order. `key` is the documented market key; `resultColumn` the raw stat field. */
export const PROP_STATS = Object.freeze([
  stat('player_pass_yds', 'passing', 'Passing yards', 'yards', 'yd', true, -100, 700, 'passing_yards'),
  stat('player_pass_completions', 'passing', 'Completions', 'completions', 'cmp', false, 0, 70, 'completions'),
  stat('player_pass_attempts', 'passing', 'Pass attempts', 'attempts', 'att', false, 0, 90, 'attempts'),
  stat('player_pass_tds', 'passing', 'Passing TDs', 'touchdowns', 'TD', false, 0, 10, 'passing_tds'),
  stat('player_pass_interceptions', 'passing', 'Interceptions thrown', 'interceptions', 'INT', false, 0, 10, 'passing_interceptions'),
  stat('player_rush_yds', 'rushing', 'Rushing yards', 'yards', 'yd', true, -100, 400, 'rushing_yards'),
  stat('player_rush_attempts', 'rushing', 'Rush attempts', 'attempts', 'att', false, 0, 60, 'carries'),
  stat('player_rush_tds', 'rushing', 'Rushing TDs', 'touchdowns', 'TD', false, 0, 10, 'rushing_tds'),
  stat('player_reception_yds', 'receiving', 'Receiving yards', 'yards', 'yd', true, -100, 400, 'receiving_yards'),
  stat('player_receptions', 'receiving', 'Receptions', 'receptions', 'rec', false, 0, 30, 'receptions'),
  stat('player_reception_tds', 'receiving', 'Receiving TDs', 'touchdowns', 'TD', false, 0, 10, 'receiving_tds'),
]);
export const PROP_STAT_KEYS = Object.freeze(PROP_STATS.map(s => s.key));
const BY_KEY = new Map(PROP_STATS.map(s => [s.key, s]));
export const PROP_FAMILIES = Object.freeze(['passing', 'rushing', 'receiving']);
/** Discovery filters only: a position never excludes a valid stat (a running back's receiving yards stay offered). */
export const PROP_POSITIONS = Object.freeze(['QB', 'RB', 'WR', 'TE']);

export const propStat = key => (typeof key === 'string' && BY_KEY.get(key)) || null;

// ---------- identities ----------
export const validSeason = v => Number.isInteger(v) && v >= 2000 && v <= 2200;
export const validWeek = v => Number.isInteger(v) && v >= 1 && v <= 22;
/** The verified scheduled event: the nflverse game ID (`2026_10_DAL_PHI`), the same key the schedule source uses. */
export const PROP_EVENT_ID = /^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/;
/** The stable player ID: the nflverse GSIS ID (`00-0036358`). A display name is never an identity. */
export const PROP_PLAYER_ID = /^00-\d{7}$/;
export const validEventId = v => typeof v === 'string' && PROP_EVENT_ID.test(v);
export const validPlayerId = v => typeof v === 'string' && PROP_PLAYER_ID.test(v);

/** One selection's identity; a different stat for the same athlete is a different selection. Null when invalid. */
export function propSelection(value) {
  if (!value || typeof value !== 'object') return null;
  const { season, week, eventId, playerId, stat: key } = value;
  if (!validSeason(season) || !validWeek(week) || !validEventId(eventId) || !validPlayerId(playerId) || !propStat(key)) return null;
  // The event ID names its own season and week; a selection whose provenance disagrees with its event is invalid.
  const [eventSeason, eventWeek] = eventId.split('_').map(Number);
  if (eventSeason !== season || eventWeek !== week) return null;
  return Object.freeze({ season, week, eventId, playerId, stat: key });
}
export const propSelectionKey = selection => {
  const s = propSelection(selection);
  return s ? `${s.season}:${s.week}:${s.eventId}:${s.playerId}:${s.stat}` : null;
};

// ---------- values ----------
const halfStep = v => Number.isFinite(v) && Number.isInteger(v * 2);
/**
 * A guess of the sportsbook line, in the stat's own unit: half-point steps within the stat's range. Yards may be
 * negative; counts may not. Server and client use this same function, so they agree.
 */
export function validPropGuess(key, value) {
  const s = propStat(key);
  if (!s || typeof value !== 'number' || !halfStep(value) || Object.is(value, -0)) return false;
  return value >= s.guessMin && value <= s.guessMax;
}
/** A recorded sportsbook line uses the same unit and range as a guess. */
export const validPropLine = validPropGuess;
/** A final player stat: a whole number; yards signed, counts nonnegative. */
export function validPropActual(key, value) {
  const s = propStat(key);
  if (!s || !Number.isSafeInteger(value) || Object.is(value, -0)) return false;
  return s.signed ? value >= -200 && value <= 1000 : value >= 0 && value <= 200;
}
/** Why a typed guess is refused, in words the entry screen shows; null when it is valid. */
export function propGuessProblem(key, value) {
  const s = propStat(key);
  if (!s) return 'Choose a stat.';
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Enter a number.';
  if (!halfStep(value)) return 'Use whole or half numbers, such as 72.5.';
  if (!s.signed && value < 0) return `${s.label} cannot be negative.`;
  if (value < s.guessMin || value > s.guessMax) return `Enter ${s.label.toLowerCase()} from ${s.guessMin} to ${s.guessMax}.`;
  return null;
}
/** The plus/minus controls: half a unit, clamped to the stat's range. */
export function stepPropGuess(key, value, direction) {
  const s = propStat(key);
  if (!s || ![-1, 1].includes(direction)) return value;
  const base = Number.isFinite(value) ? value : 0;
  const next = Math.min(s.guessMax, Math.max(s.guessMin, Math.round((base + direction * 0.5) * 2) / 2));
  return Object.is(next, -0) ? 0 : next;
}

// ---------- accuracy (saved-reference absolute miss) ----------
/** The absolute miss of one locked guess from its immutable saved reference. Half-point values stay exact. */
export function propMiss(key, guess, savedLine) {
  if (!validPropGuess(key, guess) || !validPropLine(key, savedLine)) return null;
  return Math.abs(guess * 2 - savedLine * 2) / 2;
}

/**
 * Per-stat accuracy. `rows` are your locked guesses: `{ stat, guess, reference: { line } | null, lockedAt }`. A row
 * without a saved reference is pending and does not count. Returns one entry per stat that has records, ordered as
 * PROP_STATS; each keeps its unrounded mean, total and count. There is deliberately no combined total.
 */
export function propAccuracy(rows) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const s = propStat(row?.stat);
    if (!s) continue;
    const entry = groups.get(s.key) ?? { stat: s.key, label: s.label, unit: s.unit, short: s.short, count: 0, halves: 0, pending: 0, misses: [] };
    groups.set(s.key, entry);
    const miss = propMiss(s.key, row.guess, row.reference?.line);
    if (miss === null) { entry.pending += 1; continue; }
    entry.count += 1; entry.halves += miss * 2; entry.misses.push(miss);
  }
  return PROP_STATS.filter(s => groups.has(s.key)).map(s => {
    const { halves, ...entry } = groups.get(s.key);
    const total = halves / 2;
    return Object.freeze({ ...entry, total, mean: entry.count ? total / entry.count : null, misses: Object.freeze(entry.misses) });
  });
}
/** Display only: a mean to one decimal, or the unavailable dash. Stored values are never rounded. */
export const formatPropMean = mean => (Number.isFinite(mean) ? (Math.round(mean * 10) / 10).toFixed(1) : '—');

// ---------- paper record (D-77 convention, separate from accuracy) ----------
/** D-77: one unit at standard minus 110 returns 10/11 of a unit on a win. Kept local: no game-line module is imported. */
export const PROP_PAPER_WIN_UNITS = 10 / 11;
export const PROP_RESULT_STATES = Object.freeze(['final', 'dnp', 'cancelled', 'correction_pending', 'identity_unverified']);
export const PROP_UNGRADED = Object.freeze({
  no_line: 'No qualifying pre-kickoff line was retained.',
  no_final: 'Waiting for a verified final stat.',
  participation_unverified: 'Participation is not verified, so a missing or zero stat cannot grade.',
  dnp: 'Did not play. Not graded.',
  cancelled: 'The game was cancelled or not completed. Not graded.',
  correction_pending: 'A stat correction is unresolved. Not graded yet.',
  identity_unverified: 'The athlete or event identity is not verified. Not graded.',
});

/**
 * Grades the side the locked guess favored against the last qualifying retained pre-kickoff line, using a verified
 * final stat for that exact event. `{ outcome: 'win' | 'loss' | 'push' | 'even' | 'ungraded', side, reason }`.
 * Missing evidence is never a loss and a missing stat row is never a zero.
 */
export function gradePropPaper({ stat: key, guess, closingLine, result }) {
  const s = propStat(key);
  if (!s || !validPropGuess(key, guess)) return { outcome: 'ungraded', side: null, reason: 'identity_unverified' };
  if (!validPropLine(key, closingLine)) return { outcome: 'ungraded', side: null, reason: 'no_line' };
  if (guess === closingLine) return { outcome: 'even', side: null, reason: null };
  const side = guess > closingLine ? 'over' : 'under';
  if (!result || typeof result !== 'object') return { outcome: 'ungraded', side, reason: 'no_final' };
  if (result.status !== 'final') return { outcome: 'ungraded', side, reason: Object.hasOwn(PROP_UNGRADED, result.status) ? result.status : 'no_final' };
  if (result.participated !== true) return { outcome: 'ungraded', side, reason: 'participation_unverified' };
  if (!validPropActual(key, result.actual)) return { outcome: 'ungraded', side, reason: 'no_final' };
  if (result.actual === closingLine) return { outcome: 'push', side, reason: null };
  const over = result.actual > closingLine;
  return { outcome: (side === 'over') === over ? 'win' : 'loss', side, reason: null };
}

/** A prop gap's 10%+ class uses the absolute reference magnitude; a zero reference has no classification (null). */
export function propGapLarge(guess, line) {
  if (!Number.isFinite(guess) || !Number.isFinite(line) || line === 0) return null;
  return Math.abs(guess - line) / Math.abs(line) >= 0.1;
}

/**
 * The paper record over graded rows `{ stat, guess, closingLine, result }`. `tier: 'large'` keeps only 10%+ gaps
 * (zero-reference gaps have no class and drop out of that filter). The gap-size filter narrows this record only.
 */
export function propPaperRecord(rows, { tier = 'all' } = {}) {
  const record = { wins: 0, losses: 0, pushes: 0, even: 0, ungraded: {}, graded: [], netUnits: 0, winRate: null };
  for (const row of Array.isArray(rows) ? rows : []) {
    const grade = gradePropPaper(row);
    if (grade.outcome === 'even') { record.even += 1; continue; }
    if (tier === 'large' && propGapLarge(row.guess, row.closingLine) !== true) continue;
    if (grade.outcome === 'ungraded') { record.ungraded[grade.reason] = (record.ungraded[grade.reason] ?? 0) + 1; continue; }
    record[grade.outcome === 'win' ? 'wins' : grade.outcome === 'loss' ? 'losses' : 'pushes'] += 1;
    record.graded.push({ ...row, ...grade });
  }
  record.netUnits = record.wins * PROP_PAPER_WIN_UNITS - record.losses;
  const decided = record.wins + record.losses;
  record.winRate = decided ? record.wins / decided : null;
  return record;
}

/** Filters for the personal views: period is applied by the reader; athlete and stat narrow both measures. */
export function filterPropRows(rows, { playerId = 'all', stat: key = 'all' } = {}) {
  return (Array.isArray(rows) ? rows : []).filter(row => (playerId === 'all' || row.playerId === playerId) && (key === 'all' || row.stat === key));
}
