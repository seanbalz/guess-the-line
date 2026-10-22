/**
 * Descriptive player evidence from authenticated, roster-scoped normalized history.
 * No writer, reference resolver, scoring adjustment, wager or predictive model lives here.
 * Market arguments accept spread/total or the matching guess_spread/guess_total mode.
 */
export const PLAYER_TREND_WINDOWS = Object.freeze([
  { id: 'last5', label: 'Last 5 games' }, { id: 'last10', label: 'Last 10 games' },
  { id: 'season', label: 'Current season' }, { id: 'years3', label: 'Last 3 seasons' },
  { id: 'years5', label: 'Last 5 seasons' }, { id: 'all', label: 'All available history' }
].map(Object.freeze));
export const PLAYER_TREND_LABELS = Object.freeze({
  spreadBias: 'Home-team strength gap', teamBias: 'Team strength gap', totalBias: 'Total bias',
  marketError: 'Absolute error versus saved reference', realizedError: 'Absolute error versus final result',
  record: "Each guess's implied side at its saved reference",
  againstRecord: "Opposite of each guess's implied side at its saved reference",
  guessedRecord: "Each guess's implied side at its guessed line",
  straightUpRecord: "Each guess's implied team's straight-up result",
  sentiment: 'Permitted GTL guesses',
  referenceNote: "Each guess is compared with its own saved reference; these are not simultaneous market quotes.",
  limitation: 'Descriptive historical evidence, not a prediction or a record of wagers. Small samples can vary.'
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
const mean = values => values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
const sign = value => value > 0 ? 1 : value < 0 ? -1 : 0;
const bases = new Set(['saved', 'commissioner-ruled', 'line-at-guess']);
const canonicalMarket = market => {
  if (market === 'spread' || market === 'guess_spread') return 'spread';
  if (market === 'total' || market === 'guess_total') return 'total';
  throw new RangeError('Unknown player trend market.');
};
const modeFor = market => 'guess_' + market;
const stable = value => {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
};
const compare = (a, b) => a.season - b.season || a.week - b.week
  || String(a.game.kickoff ?? '').localeCompare(String(b.game.kickoff ?? '')) || a.key.localeCompare(b.key);
const identity = (userId, season, week, gameId, market) => JSON.stringify([userId, season, week, gameId, market]);
const sourceTime = reference => reference?.observedAt || reference?.capturedAt || null;
const finalResult = result => result?.status === 'final' && finite(result.home) && finite(result.away);
const opened = (history, week, entry, gameId, market) => entry.userId === history.viewer
  || (week.gate != null ? week.gate[gameId]?.[market] === true : week.revealed?.[modeFor(market)] === true);
const withheld = (entry, pick, gameId) => pick.hidden === true || entry.hiddenGames?.includes(gameId)
  || (entry.picksHidden === true && !entry.hiddenGames?.length);
const validObservation = row => row && typeof row.userId === 'string'
  && Number.isInteger(row.season) && Number.isInteger(row.week) && typeof row.game?.id === 'string'
  && finite(row.guess) && finite(row.points) && finite(row.reference?.value) && bases.has(row.reference.basis);

/** Exact duplicates count once. Any visible conflicting identity fails closed, independent of input order. */
function deduplicate(candidates) {
  const groups = new Map();
  for (const { key, row } of candidates) {
    const fingerprint = row ? stable(row) : null;
    const prior = groups.get(key);
    if (!prior) groups.set(key, { row, fingerprint, conflict: !row });
    else if (!row || prior.fingerprint !== fingerprint) prior.conflict = true;
  }
  return [...groups.values()].filter(g => !g.conflict && g.row).map(g => g.row).sort(compare);
}

/**
 * Returns an array of authorized observations with key,userId,season,week,game,
 * guess,reference,points,result,market. Gate and roster checks precede all
 * candidate collection, deduplication, counts and diagnostics. Hidden records
 * leave no exclusion count. Reader-provided points (including zero) and saved
 * reference provenance pass through unchanged. Own locked pending games count;
 * own drafts and unscored/nearest-snapshot fallbacks never become observations.
 */
export function playerObservations(history = {}, market = 'spread') {
  market = canonicalMarket(market);
  const roster = new Set((history.members || []).map(member => member.id));
  const candidates = [];
  for (const week of history.weeks || []) {
    if (!Number.isInteger(week.season) || !Number.isInteger(week.week)) continue;
    for (const entry of week.entries || []) {
      if (entry.mode !== modeFor(market) || !roster.has(entry.userId)) continue;
      for (const pick of entry.picks || []) {
        if (!opened(history, week, entry, pick.gameId, market) || withheld(entry, pick, pick.gameId)) continue;
        const key = identity(entry.userId, week.season, week.week, pick.gameId, market);
        const games = (week.games || []).filter(game => game.id === pick.gameId);
        for (const game of games) {
          const locked = pick.lockedIn === true || (pick.lockedIn !== false && entry.status === 'submitted');
          const row = { key, userId: entry.userId, season: week.season, week: week.week, game: structuredClone(game),
            guess: pick.guess, reference: structuredClone(pick.reference ?? null), points: pick.points,
            result: structuredClone(week.results?.[game.id] ?? null), market };
          const valid = locked && entry.eligible !== false && !pick.closedAtKickoff && pick.scorable !== false && validObservation(row);
          candidates.push({ key, row: valid ? row : null });
        }
      }
    }
  }
  return deduplicate(candidates);
}

const outcome = (value, tie = 'P') => value > 0 ? 'W' : value < 0 ? 'L' : tie;
const opposite = value => value === 'W' ? 'L' : value === 'L' ? 'W' : value;
function describe(row, market, team) {
  const strengthGap = market === 'total' ? row.guess - row.reference.value
    : (row.reference.value - row.guess) * (team && row.game.awayCode === team ? -1 : 1);
  const homeDirection = sign(row.reference.value - row.guess);
  const directionSign = sign(strengthGap);
  const direction = !directionSign ? 'equal' : market === 'total' ? directionSign > 0 ? 'over' : 'under'
    : team ? directionSign > 0 ? 'for' : 'against' : directionSign > 0 ? 'home' : 'away';
  const finalized = finalResult(row.result);
  let marketResult = null, guessedResult = null, straightUpResult = null;
  let teamMarketResult = null, teamGuessedResult = null, teamStraightUpResult = null, absoluteRealizedError = null;
  if (finalized) {
    const margin = row.result.home - row.result.away, total = row.result.home + row.result.away;
    absoluteRealizedError = Math.abs(market === 'total' ? total - row.guess : margin + row.guess);
    if (market === 'spread') {
      const orientation = team && row.game.awayCode === team ? -1 : 1;
      teamMarketResult = outcome((margin + row.reference.value) * orientation);
      teamGuessedResult = outcome((margin + row.guess) * orientation);
      teamStraightUpResult = outcome(margin * orientation, 'T');
      if (homeDirection) {
        marketResult = outcome((margin + row.reference.value) * homeDirection);
        guessedResult = outcome((margin + row.guess) * homeDirection);
        straightUpResult = outcome(margin * homeDirection, 'T');
      }
    } else if (directionSign) {
      marketResult = outcome((total - row.reference.value) * directionSign);
      guessedResult = outcome((total - row.guess) * directionSign);
    }
  }
  return { ...row, strengthGap, direction, finalized, sourceTime: sourceTime(row.reference),
    absoluteMarketError: Math.abs(row.guess - row.reference.value), absoluteRealizedError,
    marketResult, againstMarketResult: opposite(marketResult), guessedResult, straightUpResult,
    teamMarketResult, teamGuessedResult, teamStraightUpResult };
}

function wilson(W, n) {
  if (!n) return null;
  const z = 1.959963984540054, z2 = z * z, rate = W / n, denominator = 1 + z2 / n;
  const center = (rate + z2 / (2 * n)) / denominator;
  const half = z * Math.sqrt(rate * (1 - rate) / n + z2 / (4 * n * n)) / denominator;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}
function record(games, field) {
  const counts = { W: 0, L: 0, P: 0 };
  for (const g of games) if (g[field] in counts) counts[g[field]]++;
  const decided = counts.W + counts.L;
  return { ...counts, n: decided + counts.P, decided, hitRate: decided ? counts.W / decided : null, wilson95: wilson(counts.W, decided) };
}
function straightUp(games) {
  const counts = { W: 0, L: 0, T: 0 };
  for (const g of games) if (g.straightUpResult in counts) counts[g.straightUpResult]++;
  return { ...counts, n: counts.W + counts.L + counts.T };
}
const bound = game => game ? { season: game.season, week: game.week, gameId: game.game.id, kickoff: game.game.kickoff ?? null } : null;
function summarize(games) {
  return {
    sample: games.length, finalized: games.filter(g => g.finalized).length, pending: games.filter(g => !g.finalized).length,
    competitionWeeks: new Set(games.map(g => g.season + ':' + g.week)).size,
    from: bound(games[0]), to: bound(games.at(-1)),
    directionCounts: { positive: games.filter(g => g.strengthGap > 0).length, equal: games.filter(g => g.strengthGap === 0).length, negative: games.filter(g => g.strengthGap < 0).length },
    metrics: { meanSignedBias: mean(games.map(g => g.strengthGap)),
      meanAbsoluteMarketError: mean(games.map(g => g.absoluteMarketError)),
      meanAbsoluteRealizedError: mean(games.filter(g => finite(g.absoluteRealizedError)).map(g => g.absoluteRealizedError)),
      realizedSample: games.filter(g => finite(g.absoluteRealizedError)).length,
      meanPoints: mean(games.map(g => g.points)), totalPoints: games.length ? games.reduce((sum, g) => sum + g.points, 0) : null },
    record: record(games, 'marketResult'), againstRecord: record(games, 'againstMarketResult'),
    guessedRecord: record(games, 'guessedResult'), straightUpRecord: straightUp(games), games
  };
}
function selectWindow(games, window, season) {
  if (window === 'last5') return games.slice(-5);
  if (window === 'last10') return games.slice(-10);
  if (window === 'season') return games.filter(g => g.season === season);
  if (window === 'years3') return games.filter(g => g.season >= season - 2);
  if (window === 'years5') return games.filter(g => g.season >= season - 4);
  return games;
}

function calloutsFor(games, current, market, team) {
  const teams = team ? [team] : market === 'total' ? [null] : [...new Set(games.flatMap(g => [g.game.homeCode, g.game.awayCode]))].sort();
  return teams.flatMap(teamCode => {
    const hasTeam = g => !teamCode || g.game.homeCode === teamCode || g.game.awayCode === teamCode;
    const oriented = games.filter(hasTeam).map(g => describe(g, market, teamCode));
    const recentKeys = new Set(oriented.slice(-5).map(g => g.key));
    const active = current.filter(hasTeam).map(g => describe(g, market, teamCode));
    const directions = market === 'total' ? ['over', 'under'] : ['for', 'against'];
    return directions.flatMap(direction => {
      // Reorient to a fixed team before selecting a direction. Outcomes still
      // explicitly follow the guess's implied side, including a negative gap.
      const sample = oriented.filter(g => g.finalized && g.direction === direction);
      if (!sample.length) return [];
      const summary = summarize(sample);
      const decided = sample.filter(g => g.marketResult === 'W' || g.marketResult === 'L');
      const competitionWeeks = new Set(decided.map(g => g.season + ':' + g.week)).size;
      const recent = summarize(sample.filter(g => recentKeys.has(g.key)));
      const earlier = summarize(sample.filter(g => !recentKeys.has(g.key)));
      const r = recent.record.hitRate, e = earlier.record.hitRate;
      const conflictingWindows = r !== null && e !== null && (r > 0.5 && e < 0.5 || r < 0.5 && e > 0.5);
      const status = decided.length >= 5 && competitionWeeks >= 3 ? 'recurring' : 'small-sample';
      const subject = market === 'total' ? direction === 'over' ? 'Over' : 'Under' : direction + ' ' + teamCode;
      return [{ team: teamCode, direction, status, sample: summary.sample, competitionWeeks, from: summary.from, to: summary.to,
        record: summary.record, againstRecord: summary.againstRecord, guessedRecord: summary.guessedRecord, games: sample,
        recent, earlier, conflictingWindows, current: active.filter(g => g.direction === direction),
        text: 'Descriptive historical evidence ' + subject + ': ' + summary.record.W + '-' + summary.record.L + '-' + summary.record.P + ' at each saved reference.'
          + (status === 'small-sample' ? ' Small sample.' : '') + (conflictingWindows ? ' Recent and earlier results differ.' : ''),
        limitation: PLAYER_TREND_LABELS.limitation }];
    });
  });
}

/**
 * Pure analysis of playerObservations output. No authorization can be inferred
 * from arbitrary input: callers must provide the currently scoped reader output.
 *
 * windows[id] is a complete summary with its exact games and original week/date
 * bounds. last5/last10 select observations BEFORE directional/outcome filtering.
 * Metrics include eligible pending observations; outcome records require final
 * results and a nonzero gap. n includes pushes; hitRate/Wilson exclude pushes.
 * SU T means tied game; ATS P means push. Overall spread bias means HOME bias.
 *
 * current[] contains only permitted unresolved observations in season/week,
 * independent of the selected historical window. Each retains guess, reference,
 * sourceTime, strengthGap and direction. callouts[].current uses that same
 * contract and only the callout's matching team/direction. Its finalized games,
 * recent and non-overlapping earlier summaries are historical evidence only.
 * Exclusions describe already-permitted selected rows; hidden rows are absent.
 */
export function buildPlayerTrends({ observations = [], playerId, market = 'spread', team = null, window = 'season', season, week } = {}) {
  market = canonicalMarket(market);
  if (!PLAYER_TREND_WINDOWS.some(w => w.id === window)) throw new RangeError('Unknown player trend window.');
  const candidates = observations.filter(row => row?.userId === playerId && canonicalMarket(row.market) === market)
    .map(row => ({ key: identity(row.userId, row.season, row.week, row.game?.id, market), row: validObservation(row) ? row : null }));
  const rows = deduplicate(candidates);
  season ??= rows.length ? Math.max(...rows.map(r => r.season)) : null;
  week ??= rows.filter(r => r.season === season).reduce((max, row) => Math.max(max, row.week), 0);
  const eligible = rows.filter(row => (season == null || row.season < season || row.season === season && row.week <= week)
    && (!team || row.game.homeCode === team || row.game.awayCode === team)).map(row => describe(row, market, team));
  const games = selectWindow(eligible, window, season);
  const current = eligible.filter(g => g.season === season && g.week === week && !g.finalized);
  const summary = summarize(games);
  const weekly = [...new Set(games.map(g => g.season + ':' + g.week))].map(key => {
    const sample = games.filter(g => g.season + ':' + g.week === key);
    return { season: sample[0].season, week: sample[0].week, ...summarize(sample) };
  });
  const windows = Object.fromEntries(PLAYER_TREND_WINDOWS.map(w => [w.id, { id: w.id, label: w.label, ...summarize(selectWindow(eligible, w.id, season)) }]));
  return { playerId, market, team, season, week, window, ...summary, windows, weekly, current,
    labels: { ...PLAYER_TREND_LABELS, bias: market === 'total' ? PLAYER_TREND_LABELS.totalBias : team ? PLAYER_TREND_LABELS.teamBias : PLAYER_TREND_LABELS.spreadBias },
    callouts: calloutsFor(games, current, market, team),
    exclusions: { pendingResults: summary.pending, noDirection: summary.directionCounts.equal },
    limitation: PLAYER_TREND_LABELS.limitation };
}

const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
/**
 * Only open game distributions, including open games with no eligible guesses.
 * Counts above/equal/below compare numeric guess with that player's OWN saved
 * reference. For spread this numeric sign is NOT the team strength gap.
 * No missing/hidden contribution is counted in source-time coverage.
 */
export function buildSentiment({ history = {}, market = 'spread', season = history.season, week } = {}) {
  market = canonicalMarket(market);
  const observations = playerObservations(history, market).filter(o => o.season === season && o.week === week);
  const publicGames = new Map();
  const conflicts = new Set();
  for (const w of history.weeks || []) {
    if (w.season !== season || w.week !== week) continue;
    for (const game of w.games || []) {
      const open = w.gate != null ? w.gate[game.id]?.[market] === true : w.revealed?.[modeFor(market)] === true;
      if (!open && !observations.some(o => o.game.id === game.id)) continue;
      const old = publicGames.get(game.id);
      if (old && stable(old) !== stable(game)) conflicts.add(game.id);
      publicGames.set(game.id, game);
    }
  }
  const games = [...publicGames.values()].filter(g => !conflicts.has(g.id)).sort((a, b) => String(a.kickoff ?? '').localeCompare(String(b.kickoff ?? '')) || a.id.localeCompare(b.id)).map(game => {
    const sample = observations.filter(o => o.game.id === game.id);
    const times = sample.map(o => sourceTime(o.reference)).filter(Boolean).sort();
    return { game: structuredClone(game), count: sample.length, median: median(sample.map(o => o.guess)),
      guesses: sample.map(o => ({ key: o.key, userId: o.userId, guess: o.guess, reference: o.reference, sourceTime: sourceTime(o.reference) })),
      savedReferenceCounts: { above: sample.filter(o => o.guess > o.reference.value).length,
        equal: sample.filter(o => o.guess === o.reference.value).length, below: sample.filter(o => o.guess < o.reference.value).length },
      sourceTimes: { known: times.length, missing: sample.length - times.length, from: times[0] ?? null, to: times.at(-1) ?? null } };
  });
  return { market, season, week, label: PLAYER_TREND_LABELS.sentiment, referenceNote: PLAYER_TREND_LABELS.referenceNote, games };
}
