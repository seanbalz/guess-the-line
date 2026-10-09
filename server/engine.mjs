import { accuracy, closestResults, consensus, gradeBet, round, validatePrediction, validateBet, winRate, MODES } from './domain.mjs';

const FRESH_MS = 5 * 60_000;
export class SubmissionReferenceError extends Error {
  constructor() {
    super('Fresh market references are unavailable. Your guesses were not submitted. Keep your draft and retry after verified source data is available. This local workspace does not refresh odds automatically.');
    this.name = 'SubmissionReferenceError';
    this.code = 'GTL_SUBMISSION_QUOTES_REQUIRED';
    this.status = 409;
  }
}
const missingReference = (reason = 'No submission-time reference was recorded for this guess.', savedAt = null) => ({
  status: 'unavailable', value: null, source: null, sourceUrl: null, snapshotId: null,
  capturedAt: null, observedAt: null, savedAt, reason,
});
const sourceMetadata = row => typeof row?.source === 'string' && row.source.trim()
  && typeof row.sourceUrl === 'string' && /^https:\/\//.test(row.sourceUrl)
  && Number.isFinite(Date.parse(row.capturedAt)) && Number.isFinite(Date.parse(row.quotedAt))
  && Date.parse(row.quotedAt) <= Date.parse(row.capturedAt);

// Check receipts against their recorded save instant, never the current clock.
// A valid saved scoring reference stays valid when the live market later moves.
function savedReference(ballot, game, mode, now) {
  const ref = ballot.scoringReferences?.[game.id];
  if (!ref) return missingReference();
  const safe = Object.fromEntries(['status', 'value', 'source', 'sourceUrl', 'snapshotId', 'capturedAt', 'observedAt', 'savedAt', 'reason']
    .filter(key => Object.hasOwn(ref, key)).map(key => [key, ref[key]]));
  if (ref.status !== 'available') return { ...missingReference(ref.reason, ref.savedAt || null), ...safe, value: null };
  const saved = Date.parse(ref.savedAt), captured = Date.parse(ref.capturedAt), observed = Date.parse(ref.observedAt);
  const submitted = Date.parse(ballot.submittedAt), updated = Date.parse(ballot.updatedAt || ballot.submittedAt);
  let validValue = false;
  try { validatePrediction(mode, ref.value); validValue = true; } catch { /* Invalid evidence is unscored. */ }
  if (!validValue || ![saved, captured, observed, submitted, updated, now].every(Number.isFinite)
    || saved > now || saved < submitted || saved > updated || observed > captured || captured > saved
    || saved - observed > FRESH_MS || saved >= Date.parse(game.kickoff)
    || typeof ref.source !== 'string' || !ref.source.trim() || typeof ref.snapshotId !== 'string' || !ref.snapshotId
    || !/^https:\/\//.test(ref.sourceUrl || '')) return missingReference('The saved scoring reference has incomplete or invalid evidence.', ref.savedAt || null);
  // Persisted book evidence must survive the bounded live snapshot history.
  // Project only this reference's validated fields, never arbitrary receipt data.
  const books = ['draftkings', 'fanduel', 'betmgm'];
  if (Array.isArray(ref.quotes) && ref.quotes.length === 3) {
    const quotes = books.map(book => {
      const matches = ref.quotes.filter(q => q?.book === book);
      if (matches.length !== 1) return null;
      const q = matches[0], observation = Date.parse(q.observedAt), collection = Date.parse(q.collectedAt);
      try { validatePrediction(mode, q.value); } catch { return null; }
      if (!Number.isFinite(observation) || !Number.isFinite(collection) || observation > collection
        || collection !== captured || saved - observation > FRESH_MS) return null;
      return { book, value: q.value, observedAt: new Date(observation).toISOString(), collectedAt: new Date(collection).toISOString() };
    });
    if (quotes.every(Boolean) && quotes.map(q => q.value).sort((a, b) => a - b)[1] === ref.value
      && quotes.every(q => Math.abs(q.value - ref.value) <= 5)
      && Math.min(...quotes.map(q => Date.parse(q.observedAt))) === observed) safe.quotes = quotes;
  }
  return safe;
}

// Local captures require quote evidence. The imported scalar-only historical
// snapshots deliberately cannot qualify, even when their dates look recent.
function captureReference(state, game, mode, now) {
  const savedAt = new Date(now).toISOString();
  const candidates = (state.consensusHistory || []).filter(row => row?.mode === mode && sourceMetadata(row)
    && Date.parse(row.capturedAt) <= now && Date.parse(row.capturedAt) < Date.parse(game.kickoff))
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
  for (const row of candidates) {
    const evidence = row.games?.[game.id];
    if (!evidence || !Array.isArray(evidence.quotes)) continue;
    try { evidence.quotes.forEach(q => validatePrediction(mode, q.value)); validatePrediction(mode, evidence.crossCheck?.value); }
    catch { continue; }
    const reference = consensus(evidence.quotes, { now, crossCheck: evidence.crossCheck, maxAgeMs: FRESH_MS, alignmentMs: FRESH_MS });
    if (!reference || [...evidence.quotes, evidence.crossCheck].some(q => Date.parse(q.quotedAt) > Date.parse(row.capturedAt))) continue;
    const observedAt = new Date(Math.min(...[...evidence.quotes, evidence.crossCheck].map(q => Date.parse(q.quotedAt)))).toISOString();
    return { status: 'available', value: reference.value, source: row.source, sourceUrl: row.sourceUrl,
      snapshotId: row.id, capturedAt: row.capturedAt, observedAt, savedAt };
  }
  return missingReference('No validated consensus within five minutes of this submission or edit.', savedAt);
}

// Persistence and authenticated identity belong to the adapter. This engine only
// operates on an isolated state snapshot and the roster identity supplied to it.
export function createEngine(initialState, { clock = Date.now, uuid = () => globalThis.crypto.randomUUID(), requireFreshReferences = false } = {}) {
  let state = structuredClone(initialState);
  if (state?.version !== 1) throw new Error('Unsupported local data version. Preserve the file before migrating.');

  function player(id) {
    if (!state.league.roster.some(p => p.id === id)) throw new Error('Unknown player.');
  }

  const ballot = (id, mode) => state.ballots[id]?.[mode] || { picks: {}, submittedAt: null };
  // D-23: a final weekly opt-out ("Sit out this week") forfeits that mode's score and
  // satisfies the reveal gate exactly like a submitted ballot. Cloud reads supply
  // state.optOuts from gtl_weekly_optouts; the local workspace stores it in state.
  const satOut = (id, mode) => Array.isArray(state.optOuts?.[id]) && state.optOuts[id].includes(mode);
  function lockReason(id, mode) {
    if (!['guess_spread', 'guess_total'].includes(mode)) return null;
    return clock() >= Date.parse(state.league.deadline) ? 'deadline' : null;
  }

  function view(id, mode = 'guess_spread') {
    player(id);
    const now = clock();
    if (!MODES.includes(mode)) throw new Error('Unknown game mode.');

    const own = ballot(id, mode);
    const revealed = !!own.submittedAt || satOut(id, mode);
    const spreadRevealed = !!ballot(id, 'guess_spread').submittedAt;
    const predictionMode = ['guess_spread', 'guess_total'].includes(mode);
    const marketHistory = predictionMode ? [...(mode === 'guess_spread' ? state.history : []), ...(state.consensusHistory || []).filter(row => row.mode === mode)]
      .filter(sourceMetadata).filter(row => Date.parse(row.capturedAt) <= now).sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)) : [];
    const latest = marketHistory.at(-1);
    const priced = revealed && predictionMode;
    const references = Object.fromEntries(state.league.roster.map(p => [p.id, Object.fromEntries(state.games.map(g => [g.id,
      priced && ballot(p.id, mode).submittedAt ? savedReference(ballot(p.id, mode), g, mode, now) : null,
    ]))]));
    const currentConsensus = game => {
      const row = [...marketHistory].reverse().find(row => Number.isFinite(row.games?.[game.id]?.value));
      if (!row) return missingReference('No recorded consensus is available.');
      return { status: now - Date.parse(row.quotedAt) <= FRESH_MS && now < Date.parse(game.kickoff) ? 'available' : 'stale',
        value: row.games[game.id].value, source: row.source, sourceUrl: row.sourceUrl, snapshotId: row.id,
        capturedAt: row.capturedAt, observedAt: row.quotedAt, savedAt: null, verified: false };
    };
    const statuses = Object.fromEntries(['guess_spread', 'guess_total'].map(m => [m, {
      filled: Object.keys(ballot(id, m).picks).length,
      submittedAt: ballot(id, m).submittedAt,
      satOut: satOut(id, m),
      locked: !!lockReason(id, m),
      lockReason: lockReason(id, m),
    }]));

    const standings = state.league.roster.map(p => {
      const b = ballot(p.id, mode);
      const visible = p.id === id || revealed;
      const values = priced && b.submittedAt && visible
        ? state.games.map(g => accuracy(b.picks[g.id], references[p.id][g.id]?.value))
        : [];
      const all = values.length === state.games.length && values.every(v => v !== null);
      const record = { W: 0, L: 0, T: 0 };
      let compared = 0;
      if (priced && state.league.roster.length >= 2 && state.league.roster.every(p => ballot(p.id, mode).submittedAt)) {
        for (const game of state.games) {
          const errors = Object.fromEntries(state.league.roster.map(p => {
            const pick = ballot(p.id, mode).picks[game.id], reference = references[p.id][game.id]?.value;
            return [p.id, Number.isFinite(pick) && Number.isFinite(reference) ? round(Math.abs(pick - reference)) : null];
          }));
          const outcome = closestResults(errors, 0);
          if (outcome) {
            record[outcome[p.id]]++;
            compared++;
          }
        }
      }
      const betRecord = { W: 0, L: 0, P: 0 };
      for (const bet of Object.values(state.bets[p.id] || {})) {
        const grade = gradeBet(bet, state.results[bet.gameId]);
        if (grade) betRecord[grade]++;
      }
      return {
        ...p,
        filled: Object.keys(b.picks).length,
        submitted: !!b.submittedAt,
        satOut: satOut(p.id, mode),
        points: all ? round(values.reduce((a, b) => a + b, 0)) : null,
        exact: all ? values.filter(v => v === 10).length : null,
        scoredGames: values.filter(v => v !== null).length,
        error: all ? round(state.games.reduce((n, g) => n + Math.abs(b.picks[g.id] - references[p.id][g.id].value), 0)) : null,
        record: compared ? record : null,
        betRecord,
        winRate: winRate(betRecord),
        betCount: Object.keys(state.bets[p.id] || {}).length,
      };
    }).sort((a, b) => mode === 'betting_challenge'
      ? (b.winRate ?? -1) - (a.winRate ?? -1) || b.betRecord.W - a.betRecord.W
      : (b.points ?? -1) - (a.points ?? -1) || (a.error ?? Infinity) - (b.error ?? Infinity) || (b.exact ?? -1) - (a.exact ?? -1));

    return structuredClone({
      now: new Date(now).toISOString(),
      playerId: id,
      mode,
      scoringPolicy: predictionMode ? 'submission-time' : null,
      league: state.league,
      games: state.games.map(g => ({
        ...g,
        prediction: own.picks[g.id] ?? null,
        market: priced ? references[id][g.id]?.value ?? null : null,
        scoringReference: priced ? references[id][g.id] : null,
        currentConsensus: priced ? currentConsensus(g) : null,
        points: priced ? accuracy(own.picks[g.id], references[id][g.id]?.value) : null,
        previousMarket: priced ? marketHistory.at(-2)?.games[g.id]?.value ?? null : null,
        opponents: revealed ? state.league.roster.filter(p => p.id !== id).map(p => ({
          id: p.id,
          name: p.name,
          value: ballot(p.id, mode).submittedAt ? ballot(p.id, mode).picks[g.id] ?? null : null,
          scoringReference: ballot(p.id, mode).submittedAt ? references[p.id][g.id] : null,
          points: ballot(p.id, mode).submittedAt ? accuracy(ballot(p.id, mode).picks[g.id], references[p.id][g.id]?.value) : null,
        })) : [],
        bet: state.bets[id]?.[g.id] ? { ...state.bets[id][g.id], result: gradeBet(state.bets[id][g.id], state.results[g.id]) } : null,
      })),
      statuses,
      submittedAt: own.submittedAt,
      updatedAt: own.updatedAt || null,
      satOut: satOut(id, mode),
      revealed,
      standings,
      history: priced && mode === 'guess_spread' && id === 'sean' ? state.history.map(({ games, ...s }) => s) : [],
      // Publish only market observations after this mode's submission gate.
      // Archived records also contain Sean's original guesses and scores; those
      // private fields must never ride along with a group-visible chart series.
      lineHistory: priced ? marketHistory.filter(s =>
        Number.isFinite(Date.parse(s.quotedAt)) && Number.isFinite(Date.parse(s.capturedAt))
        && typeof s.source === 'string' && /^https:\/\//.test(s.sourceUrl || '')
      ).map(s => ({
        id: s.id,
        capturedAt: s.capturedAt,
        quotedAt: s.quotedAt,
        timeBasis: s.timeBasis === 'publication' ? 'publication' : 'capture',
        source: s.source,
        sourceUrl: s.sourceUrl,
        verified: false,
        status: 'historical',
        games: Object.fromEntries(state.games.filter(g => Number.isFinite(s.games?.[g.id]?.value))
          .map(g => [g.id, { value: s.games[g.id].value }])),
      })) : [],
      snapshot: priced && latest ? {
        id: latest.id,
        source: latest.source,
        sourceUrl: latest.sourceUrl,
        capturedAt: latest.capturedAt,
        quotedAt: latest.quotedAt,
        status: now - Date.parse(latest.quotedAt) > 6 * 3600_000 ? 'stale' : 'historical',
        verified: false,
      } : null,
      score: standings.find(p => p.id === id)?.points ?? null,
      maxPoints: state.games.length * 10,
      archivedCount: state.archivedCount,
      revisionCount: state.audit.filter(a => a.player === id && a.mode === mode).length,
      marketAccess: { spread: spreadRevealed, total: !!ballot(id, 'guess_total').submittedAt },
      locked: !!lockReason(id, mode),
      lockReason: lockReason(id, mode),
      officialEligible: state.league.practice !== true,
      officialStatus: state.league.practice === true ? 'Practice game — no official scores' : 'Scoring uses each guess’s saved submission or edit reference',
      audit: state.audit.filter(a => a.player === id && a.mode === mode).slice(-20).reverse(),
    });
  }

  function saveBallot(id, mode, picks, submit = false) {
    player(id);
    if (!['guess_spread', 'guess_total'].includes(mode)) throw new Error('Unknown prediction game.');
    const before = ballot(id, mode), now = clock();
    if (now >= Date.parse(state.league.deadline)) throw new Error('The prediction deadline has passed. Commissioner adjudication is required.');
    if (satOut(id, mode)) throw new Error('You sat out this week for that market. Its picks are closed.');
    if (!picks || typeof picks !== 'object' || Array.isArray(picks)) throw new Error('Invalid ballot.');
    const valid = Object.fromEntries(Object.entries(picks).map(([key, value]) => {
      if (!state.games.some(g => g.id === key)) throw new Error('Unknown matchup.');
      return [key, validatePrediction(mode, value)];
    }));
    if ((submit || before.submittedAt) && Object.keys(valid).length !== state.games.length) {
      throw new Error(`Complete all ${state.games.length} predictions before submitting.`);
    }
    const next = structuredClone(state);
    const timestamp = new Date(now).toISOString();
    next.ballots[id] ||= {};
    const submitted = !!before.submittedAt || submit;
    const changed = Object.keys(valid).filter(gameId => before.picks[gameId] !== valid[gameId]);
    const scoringReferences = structuredClone(before.scoringReferences || {});
    const captureGames = submitted ? state.games.filter(game => !before.submittedAt || changed.includes(game.id)) : [];
    for (const game of captureGames) scoringReferences[game.id] = captureReference(state, game, mode, now);
    next.ballots[id][mode] = { ...before, picks: valid, submittedAt: before.submittedAt || (submit ? timestamp : null), updatedAt: timestamp,
      ...(submitted ? { scoringPolicy: 'submission-time', scoringReferences } : {}) };
    // Local persistence opts in; cloud prevalidation still defers to its atomic
    // database guard. Validate at the save instant before accepting any state or
    // audit. Drafts and unchanged historical references do not require new odds.
    if (requireFreshReferences && captureGames.some(game => savedReference(next.ballots[id][mode], game, mode, now).status !== 'available')) {
      throw new SubmissionReferenceError();
    }
    next.audit.push({ id: uuid(), player: id, mode, type: before.submittedAt ? 'ballot_edited' : submit ? 'ballot_submitted' : 'ballot_saved', timestamp,
      before: before.picks, after: valid, changedGameIds: changed,
      beforeScoringReferences: structuredClone(before.scoringReferences || {}), afterScoringReferences: structuredClone(scoringReferences) });
    state = next;
    return view(id, mode);
  }

  // Final for the week and mode: no draft or submission may follow, nothing is scored as zero.
  function sitOut(id, mode) {
    player(id);
    if (!['guess_spread', 'guess_total'].includes(mode)) throw new Error('Unknown prediction game.');
    const now = clock();
    if (now >= Date.parse(state.league.deadline)) throw new Error('The prediction deadline has passed. Commissioner adjudication is required.');
    if (ballot(id, mode).submittedAt) throw new Error('This ballot is already submitted. Sitting out is not possible.');
    if (!satOut(id, mode)) {
      const next = structuredClone(state);
      next.optOuts ||= {};
      next.optOuts[id] = [...(next.optOuts[id] || []), mode];
      next.audit.push({ id: uuid(), player: id, mode, type: 'week_sat_out', timestamp: new Date(now).toISOString(), before: ballot(id, mode).picks, after: {} });
      state = next;
    }
    return view(id, mode);
  }

  function saveBet(id, body) {
    player(id);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid selection.');
    const game = state.games.find(g => g.id === body.gameId);
    if (!game) throw new Error('Unknown matchup.');
    if (!['spread', 'total'].includes(body.market)) throw new Error('Choose a spread or total market.');
    if (!ballot(id, body.market === 'total' ? 'guess_total' : 'guess_spread').submittedAt) {
      throw new Error('Submit the matching prediction ballot before viewing or selecting this market.');
    }
    if (state.bets[id]?.[game.id]) throw new Error('One selection per game. The recorded quote is immutable.');
    const value = validateBet(body, clock(), game.kickoff);
    const next = structuredClone(state);
    const timestamp = new Date(clock()).toISOString();
    next.bets[id] ||= {};
    next.bets[id][game.id] = { ...value, id: uuid(), gameId: game.id, selectedAt: timestamp, verification: 'Manually entered; not independently verified' };
    next.audit.push({ id: uuid(), player: id, mode: 'betting_challenge', type: 'selection_recorded', timestamp, after: next.bets[id][game.id] });
    state = next;
    return view(id, 'betting_challenge');
  }

  return {
    view,
    saveBallot,
    sitOut,
    saveBet,
    export(id) {
      player(id);
      return structuredClone({
        exportedAt: new Date(clock()).toISOString(),
        scope: 'Own saved data only',
        league: state.league,
        ballots: state.ballots[id] || {},
        bets: state.bets[id] || {},
        audit: state.audit.filter(a => a.player === id),
      });
    },
    snapshot() { return structuredClone(state); },
  };
}
