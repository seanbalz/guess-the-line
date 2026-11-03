const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// October 12, 2026 ruling: quote-refresh limits never refuse a save. The only SubmissionOddsError a player can still
// see is a failed integrity check of the server-selected line at the atomic commit (GTL_SUBMISSION_ODDS_REQUIRED).
const ERRORS = {
  GTL_SUBMISSION_QUOTES_REQUIRED: [409, 'The line for an edited guess could not be verified. Your guesses were not submitted. Keep your draft and try again.'],
  // Internal only: collectSubmissionOdds without a configured provider. The orchestration ignores it.
  GTL_SUBMISSION_REFRESH_UNAVAILABLE: [503, 'Market refresh is not configured.'],
  GTL_SUBMISSION_CHECK_UNAVAILABLE: [503, 'The submission check is temporarily unavailable. Your guesses were not submitted. Keep your draft and retry.'],
};

export class SubmissionOddsError extends Error {
  constructor(code = 'GTL_SUBMISSION_CHECK_UNAVAILABLE') {
    const safeCode = Object.hasOwn(ERRORS, code) ? code : 'GTL_SUBMISSION_CHECK_UNAVAILABLE';
    const [status, message] = ERRORS[safeCode];
    super(message);
    this.name = 'SubmissionOddsError';
    this.status = status;
    this.code = safeCode;
  }
}

function checked(result) {
  if (!result || Array.isArray(result) || typeof result.requiresReferences !== 'boolean' || typeof result.ready !== 'boolean') {
    throw new SubmissionOddsError();
  }
  return { requiresReferences: result.requiresReferences, ready: result.ready };
}

// A refusal the database itself would repeat at commit (deadline, kickoff, revision, membership, invalid or
// incomplete ballot, sat out, not open, retry conflict): a trusted GTL_ code that is not a market-refresh code,
// or a 4xx status from the provider error maps. Anything else from preflight only skips the refresh.
const refused = error => !(error instanceof SubmissionOddsError) && (
  typeof error?.code === 'string' && /^GTL_[A-Z_]+$/.test(error.code) && !/^GTL_(?:SUBMISSION|ODDS)_/.test(error.code)
  || Number.isInteger(error?.status) && error.status >= 400 && error.status < 500);

/**
 * Server-only orchestration; callbacks close over a fixed authenticated request.
 *
 * preflight() is advisory. requiresReferences:false means a draft or a no-op; ready:true means every changed guess
 * already has a stored line observed in the last five minutes, so no refresh is worth spending on. A 4xx refusal
 * (see refused) stops here exactly as the commit would; any other preflight fault only skips the refresh.
 *
 * worthCollecting() is advisory too: false (see selectedBookMissing) skips a collection the newest stored snapshot shows
 * cannot help; a fault reading it keeps the refresh.
 *
 * collect({requestId}) tries one shared collection inside the free limits (lease, cooldown, daily cap, budget guard,
 * measured preflight). Its result never decides the save: a refused, failed or partial collection is ignored.
 *
 * commit() is authoritative. In one database transaction it revalidates access, revision, deadline, kickoff locks
 * and the full ballot, and saves for each changed guess the newest stored line at that instant (any age, with
 * observedAt and ageSeconds) or a pending reference resolved by the first line collected after it. Commit failures
 * deliberately propagate: a transport failure can be ambiguous, so do not claim rollback or re-submit.
 *
 * No sleeps, automatic retries, draft writes, quote injection or reveal here.
 */
export async function runSubmissionWithFreshOdds({ preflight, collect, commit, requestId, worthCollecting }) {
  if (typeof commit !== 'function') throw new SubmissionOddsError();
  let refresh = false;
  try {
    const before = checked(await preflight());
    refresh = before.requiresReferences && !before.ready;
  } catch (error) {
    if (refused(error)) throw error;
  }
  if (refresh && typeof worthCollecting === 'function') {
    try { refresh = await worthCollecting() !== false; } catch { /* An unreadable snapshot keeps the refresh. */ }
  }
  if (refresh && typeof collect === 'function' && UUID.test(requestId || '')) {
    try { await collect({ requestId }); }
    catch { /* Cooldown, daily cap, budget guard, busy lease, provider or storage fault: the save still proceeds. */ }
  }
  return commit();
}

const MARKETS = Object.freeze({ guess_spread: 'spread', guess_total: 'total' });

/**
 * Sean, November 3, 2026: "do not waste credits". A collection costs two credits, and a saved line needs every selected
 * book (gtl_line_from_snapshot). At 18:15 UTC that day the provider's reply had no FanDuel prices for any of the 15 games,
 * so a collection after it would almost surely miss FanDuel too. True when the newest stored snapshot (`games` and
 * `books`, its payload's games and selectedBooks) has a selected book missing from the provider's reply (book_missing) in
 * this mode's market for every game `gameIds` names that has not kicked off; the save then skips the refresh and keeps the
 * newest stored line (D-27). The scheduled runs still collect twice a day, and once one sees the book again saves refresh
 * as before. Anything unreadable, an unknown mode, or a game the snapshot does not hold exactly once gives false.
 */
export function selectedBookMissing(snapshot, { mode, gameIds, now }) {
  const market = MARKETS[mode], books = snapshot?.books, games = snapshot?.games;
  if (!market || !Array.isArray(books) || !books.length || !Array.isArray(games) || !Array.isArray(gameIds)) return false;
  const upcoming = [];
  for (const gameId of gameIds) {
    const entries = games.filter(g => g?.gameId === gameId);
    if (entries.length !== 1) return false;
    const kickoff = Date.parse(entries[0].kickoff);
    if (!Number.isFinite(kickoff)) return false;
    if (kickoff > now) upcoming.push(entries[0]);
  }
  // A backup book standing in (D-74) makes the market whole again: only fewer quotes than books counts as missing.
  return upcoming.length > 0 && upcoming.every(g => {
    const { unavailable, quotes } = g.markets?.[market] ?? {};
    return Array.isArray(unavailable) && unavailable.some(u => books.includes(u?.book) && u?.reason === 'book_missing')
      && !(Array.isArray(quotes) && quotes.length >= books.length);
  });
}
