// Fantasy math for the Premier League Sleeper league (Research -> Fantasy). A player's points are Sleeper's raw stat
// counts times the league's position-prefixed scoring_settings (pos_<gk|d|m|f>_<stat>); stats rows also carry
// pre-prefixed copies (pos_f_g) and Sleeper's standard total (pts_std), which are ignored so nothing double counts.
// A starter with no projection row scores null ("No projection") and is left out of totals, never NaN.
// Pure: no I/O, no imports.

const round2 = x => Math.round(x * 100) / 100;
const round3 = x => Math.round(x * 1000) / 1000;
const POSITIONS = new Set(['gk', 'd', 'm', 'f']);
const finite = x => typeof x === 'number' && Number.isFinite(x);

export function playerPoints(stats, pos, scoring) {
  if (!POSITIONS.has(pos) || !stats || !scoring) return 0;
  const prefix = `pos_${pos}_`;
  let total = 0;
  for (const [key, value] of Object.entries(stats)) {
    if (key.startsWith('pos_') || !finite(value)) continue;
    const rule = prefix + key;
    if (!Object.hasOwn(scoring, rule) || !finite(scoring[rule])) continue;
    total += value * scoring[rule];
  }
  return round2(total) || 0;
}

// Sleeper scores a multi-position player at player.position (an F/M player listed as M scores with pos_m_*), so a
// stored `position` wins; otherwise the first fantasy position. TEAM and unknown positions are null.
export function positionOf(player) {
  const raw = player?.position ?? player?.fantasy_positions?.[0];
  const pos = typeof raw === 'string' ? raw.toLowerCase() : null;
  return POSITIONS.has(pos) ? pos : null;
}

export function teamProjection(starters = [], projections = {}, players = {}, scoring = {}) {
  const rows = (starters ?? []).map(playerId => {
    const stats = projections && Object.hasOwn(projections, playerId) ? projections[playerId] : null;
    const player = players && Object.hasOwn(players, playerId) ? players[playerId] : null;
    const pos = positionOf(player);
    return { playerId, points: stats && pos ? playerPoints(stats, pos, scoring ?? {}) : null };
  });
  const total = round2(rows.reduce((sum, r) => sum + (r.points ?? 0), 0));
  return { total, rows };
}

// Abramowitz and Stegun 7.1.26 (max error 1.5e-7).
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - poly * Math.exp(-ax * ax));
}

// P(A outscores B) when each final score is Normal(projection, sigma) independently: the difference has standard
// deviation sigma * sqrt(2). sigma 18 is an estimate (D-67 addendum), not a fitted value. Null for non-numeric input.
export function winChance(projA, projB, sigma = 18) {
  if (!finite(projA) || !finite(projB)) return null;
  const diff = projA - projB;
  if (!finite(sigma) || sigma <= 0) return diff > 0 ? 1 : diff < 0 ? 0 : 0.5;
  const z = diff / (sigma * Math.SQRT2);
  return round3(0.5 * (1 + erf(z / Math.SQRT2)));
}

// Highest weekly score; the earliest entry wins a tie. Null points (missing snapshot weeks) never count.
export function seasonHigh(weeks = []) {
  let best = null;
  for (const w of weeks ?? []) {
    if (!finite(w?.points)) continue;
    if (!best || w.points > best.points) best = { week: w.week, ownerId: w.ownerId, points: w.points };
  }
  return best;
}

// Each owner's highest-scoring player; the first listed wins a tie. Null prototype so ids such as "constructor"
// never resolve through Object.prototype.
export function topScorers(rows = []) {
  const out = Object.create(null);
  for (const r of rows ?? []) {
    if (!finite(r?.points)) continue;
    const key = String(r.ownerId);
    if (!(key in out) || r.points > out[key].points) out[key] = { playerId: r.playerId, points: r.points };
  }
  return out;
}

// Actual minus projected; null when either is missing (a gap week reads as an em dash, never 0 or a big miss).
export function beatProjection(actual, projected) {
  if (!finite(actual) || !finite(projected)) return null;
  return round2(actual - projected) || 0;
}
