export const MODES = ['guess_spread', 'guess_total', 'betting_challenge'];
export const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
export function accuracy(pick, benchmark) {
  return Number.isFinite(pick) && Number.isFinite(benchmark) ? round(Math.max(0, 10 - 2 * Math.abs(pick - benchmark))) : null;
}
export function validatePrediction(mode, value) {
  if (!['guess_spread', 'guess_total'].includes(mode) || typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value * 2)) throw new Error('Enter a number in half-point increments.');
  if (mode === 'guess_total' ? value < 0 || value > 200 : Math.abs(value) > 100) throw new Error(mode === 'guess_total' ? 'Combined points must be between 0 and 200.' : 'Spread must be between −100 and +100.');
  return value;
}
export function closestResults(predictions, benchmark) {
  const entries = Object.entries(predictions);
  if (entries.length < 2 || !Number.isFinite(benchmark) || entries.some(([, v]) => !Number.isFinite(v))) return null;
  const errors = entries.map(([, value]) => round(Math.abs(value - benchmark)));
  const min = Math.min(...errors), tied = errors.filter(e => e === min).length > 1;
  return Object.fromEntries(entries.map(([id], i) => [id, errors[i] === min ? (tied ? 'T' : 'W') : 'L']));
}
export function gradeBet(bet, result) {
  if (!bet || !['spread', 'total'].includes(bet.market) || !(bet.market === 'spread' ? ['home', 'away'] : ['over', 'under']).includes(bet.side)
    || !Number.isFinite(bet.line) || !Number.isInteger(bet.line * 2)
    || (bet.market === 'spread' ? Math.abs(bet.line) > 100 : bet.line < 0 || bet.line > 200)
    || !result || result.status !== 'final' || !Number.isInteger(result.home) || !Number.isInteger(result.away) || Math.min(result.home, result.away) < 0) return null;
  const diff = bet.market === 'spread' ? (bet.side === 'home' ? result.home - result.away : result.away - result.home) + bet.line : (result.home + result.away - bet.line) * (bet.side === 'over' ? 1 : -1);
  return diff > 0 ? 'W' : diff < 0 ? 'L' : 'P';
}
export function winRate(record) { return record.W + record.L ? round(record.W / (record.W + record.L) * 100) : null; }
export function validateBet(bet, now, kickoff) {
  if (!Number.isFinite(now) || !Number.isFinite(Date.parse(kickoff))) throw new Error('A verified scheduled kickoff is required.');
  if (!['spread', 'total'].includes(bet.market) || !(bet.market === 'spread' ? ['home', 'away'] : ['over', 'under']).includes(bet.side)) throw new Error('Choose a spread side or an over/under side.');
  validatePrediction(bet.market === 'total' ? 'guess_total' : 'guess_spread', bet.line);
  if (!Number.isInteger(bet.odds) || Math.abs(bet.odds) < 100 || Math.abs(bet.odds) > 10000) throw new Error('Enter American odds, such as −110 or +120.');
  if (typeof bet.source !== 'string' || bet.source.trim().length < 2 || bet.source.length > 120) throw new Error('A named quote source is required.');
  const quote = Date.parse(bet.quotedAt);
  if (!Number.isFinite(quote) || quote > now || now - quote > 6 * 3600_000 || quote >= Date.parse(kickoff)) throw new Error('Use a pre-kickoff quote from the last six hours.');
  if (now >= Date.parse(kickoff)) throw new Error('Selections are closed after scheduled kickoff.');
  return { market: bet.market, side: bet.side, line: bet.line, odds: bet.odds, source: bet.source.trim(), quotedAt: new Date(quote).toISOString() };
}
// Verification is calculated from independent, time-aligned quote evidence, never a client-supplied flag.
export function consensus(quotes, { now, crossCheck, maxAgeMs = 6 * 3600_000, alignmentMs = 15 * 60_000 }) {
  if (!Number.isFinite(now) || !Array.isArray(quotes) || quotes.length < 3 || !Number.isFinite(crossCheck?.value) || crossCheck.source !== 'Action Network') return null;
  if (quotes.some(q => typeof q.book !== 'string' || !q.book.trim() || !Number.isFinite(q.value) || !Number.isFinite(Date.parse(q.quotedAt)))) return null;
  if (new Set(quotes.map(q => q.book.trim().toLowerCase())).size !== quotes.length) return null;
  const times = quotes.map(q => Date.parse(q.quotedAt)), checkTime = Date.parse(crossCheck.quotedAt);
  if (!Number.isFinite(checkTime) || [...times, checkTime].some(t => t > now || now - t > maxAgeMs) || Math.max(...times, checkTime) - Math.min(...times, checkTime) > alignmentMs) return null;
  const sorted = quotes.map(q => q.value).sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  if (sorted.filter(v => Math.abs(v - value) <= 5).length / sorted.length < .85 || Math.abs(crossCheck.value - value) > 1) return null;
  return { value, quotedAt: new Date(Math.max(...times)).toISOString(), oldestQuotedAt: new Date(Math.min(...times)).toISOString() };
}
export function freezeBenchmark(existing, snapshots, actualKickoff, now, gameIds, mode, eligibility) {
  // Official freezing requires an explicit standard-game context. Practice or
  // missing eligibility cannot create or reuse an official benchmark.
  if (eligibility?.practice !== false || !Number.isFinite(now) || !['guess_spread', 'guess_total'].includes(mode)
    || !Array.isArray(gameIds) || !gameIds.length || new Set(gameIds).size !== gameIds.length || gameIds.some(id => typeof id !== 'string' || !id)) return null;
  if (existing) return existing;
  const cutoff = Date.parse(actualKickoff);
  if (!Number.isFinite(cutoff) || now < cutoff) return null;
  const eligible = (Array.isArray(snapshots) ? snapshots : []).filter(s => s?.mode === mode && Date.parse(s.capturedAt) < cutoff && gameIds.every(id => {
    const q = s.games?.[id];
    const verified = q && consensus(q.quotes, { now: cutoff, crossCheck: q.crossCheck, maxAgeMs: 5 * 60_000, alignmentMs: 5 * 60_000 });
    return verified && Date.parse(verified.quotedAt) <= Date.parse(s.capturedAt) && Date.parse(q.crossCheck.quotedAt) <= Date.parse(s.capturedAt) && Date.parse(verified.quotedAt) < cutoff && Date.parse(q.crossCheck.quotedAt) < cutoff;
  })).sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
  return eligible[0] ? structuredClone({ snapshot: eligible[0], frozenAt: new Date(now).toISOString(), actualKickoff }) : null;
}
