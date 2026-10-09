import { gradeBet } from './domain.mjs';
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN;
const https = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } };

// The documented score endpoint's commence_time is SCHEDULED kickoff. It does
// not establish actual start, final-publication time, postponement or void policy.
// No network call, quota usage, benchmark freeze or automatic settlement occurs.
export function normalizeProviderResults(payload, games, collectedAt, { season, week } = {}) {
  const collected = instant(collectedAt);
  if (!Number.isInteger(season) || season < 2020 || season > 2100 || !Number.isInteger(week) || week < 1 || week > 22
    || !Number.isFinite(collected) || !Array.isArray(payload) || payload.length > 100 || !Array.isArray(games)
    || games.length > 32 || new Set(games.map(game => game.id)).size !== games.length) throw new Error('Invalid result collection.');
  return games.map(game => {
    const matches = payload.filter(row => row?.id === game.providerEventId);
    const unavailable = reason => ({ season, week, gameId: game.id, status: 'unavailable', reason, collectedAt });
    if (!game.providerEventId || matches.length !== 1) return unavailable(matches.length > 1 ? 'ambiguous_event' : 'event_missing');
    const event = matches[0], kickoff = instant(game.kickoff);
    if (event.sport_key !== 'americanfootball_nfl' || event.home_team !== game.home || event.away_team !== game.away
      || !Number.isFinite(kickoff) || instant(event.commence_time) !== kickoff) return unavailable('schedule_or_identity_changed');
    if (event.completed !== true) return { season, week, gameId: game.id, status: 'pending', reason: 'not_reported_complete', collectedAt };
    const observed = instant(event.last_update);
    if (!Number.isFinite(observed) || observed > collected || observed <= kickoff || collected <= kickoff) return unavailable('invalid_source_time');
    if (!Array.isArray(event.scores) || event.scores.length !== 2) return unavailable('missing_scores');
    const get = name => {
      const entries = event.scores.filter(score => score?.name === name);
      return entries.length === 1 && typeof entries[0].score === 'string' && /^\d{1,3}$/.test(entries[0].score)
        && Number(entries[0].score) <= 200 ? Number(entries[0].score) : null;
    };
    const home = get(game.home), away = get(game.away);
    if (home === null || away === null) return unavailable('invalid_scores');
    return { season, week, gameId: game.id, providerEventId: event.id, homeTeam: game.home, awayTeam: game.away, scheduledKickoff: game.kickoff,
      status: 'review_required', reportedStatus: 'final', home, away, source: 'The Odds API',
      sourceURL: 'https://the-odds-api.com/liveapi/guides/v4/#get-scores', observedAt: event.last_update, collectedAt,
      timeBasis: 'provider_last_update', actualKickoff: null, verifiedActualStart: false };
  });
}

// In-memory/local audit ledger for an explicit human-reviewed source receipt.
// An authenticated adapter must supply reviewer identity, persist atomically and
// enforce its authorization before calling this helper. No cloud route exists.
export function recordReviewedResult(ledger = [], candidate, { actorId, requestId, expectedVersion = 0, reason, reviewedAt } = {}) {
  if (!Array.isArray(ledger) || !candidate || candidate.status !== 'review_required' || candidate.reportedStatus !== 'final'
    || !Number.isInteger(candidate.season) || candidate.season < 2020 || candidate.season > 2100 || !Number.isInteger(candidate.week) || candidate.week < 1 || candidate.week > 22
    || typeof candidate.gameId !== 'string' || !candidate.gameId || typeof candidate.providerEventId !== 'string' || !candidate.providerEventId
    || !Number.isInteger(candidate.home) || !Number.isInteger(candidate.away) || Math.min(candidate.home, candidate.away) < 0
    || Math.max(candidate.home, candidate.away) > 200 || !https(candidate.sourceURL) || !candidate.source
    || !Number.isFinite(instant(candidate.observedAt)) || !Number.isFinite(instant(candidate.collectedAt))
    || instant(candidate.observedAt) > instant(candidate.collectedAt) || instant(candidate.collectedAt) > instant(reviewedAt)
    || !Number.isFinite(instant(reviewedAt)) || typeof actorId !== 'string' || !actorId
    || typeof requestId !== 'string' || !requestId || typeof reason !== 'string' || reason.trim().length < 5 || reason.length > 500
    || !Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error('A reviewed final result, source receipt and reviewer are required.');
  const receipt = { season: candidate.season, week: candidate.week, gameId: candidate.gameId, providerEventId: candidate.providerEventId, status: 'final', home: candidate.home, away: candidate.away,
    source: candidate.source, sourceURL: candidate.sourceURL, observedAt: candidate.observedAt, collectedAt: candidate.collectedAt };
  const existing = ledger.find(row => row.requestId === requestId);
  if (existing) {
    if (existing.actorId !== actorId || existing.reason !== reason.trim() || existing.previousVersion !== expectedVersion
      || JSON.stringify(existing.result) !== JSON.stringify(receipt)) throw new Error('Result request ID was already used with different content.');
    return { ledger: structuredClone(ledger), event: structuredClone(existing), replayed: true };
  }
  const prior = ledger.filter(row => row.result?.gameId === candidate.gameId && row.result?.season === candidate.season && row.result?.week === candidate.week).at(-1);
  if ((prior?.version || 0) !== expectedVersion || prior && prior.result.providerEventId !== candidate.providerEventId) throw new Error('Result history changed; review the current version.');
  const event = { requestId, actorId, reason: reason.trim(), reviewedAt, previousVersion: expectedVersion, version: expectedVersion + 1,
    type: prior ? 'reviewed_result_correction' : 'reviewed_final_result', previous: prior?.result || null, result: receipt };
  return { ledger: structuredClone([...ledger, event]), event: structuredClone(event), replayed: false };
}

export function reviewedSettlement(selections, ledger) {
  const latest = new Map();
  const key = value => `${value.season}/${value.week}/${value.gameId}`;
  for (const event of ledger) if (event?.result?.status === 'final') latest.set(key(event.result), event);
  return selections.map(selection => {
    const event = latest.get(key(selection));
    return { selectionId: selection.id, gameId: selection.gameId, outcome: event ? gradeBet(selection, event.result) : null,
      resultVersion: event?.version ?? null, resultRequestId: event?.requestId ?? null };
  });
}
