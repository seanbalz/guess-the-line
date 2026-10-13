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
export async function runSubmissionWithFreshOdds({ preflight, collect, commit, requestId }) {
  if (typeof commit !== 'function') throw new SubmissionOddsError();
  let refresh = false;
  try {
    const before = checked(await preflight());
    refresh = before.requiresReferences && !before.ready;
  } catch (error) {
    if (refused(error)) throw error;
  }
  if (refresh && typeof collect === 'function' && UUID.test(requestId || '')) {
    try { await collect({ requestId }); }
    catch { /* Cooldown, daily cap, budget guard, busy lease, provider or storage fault: the save still proceeds. */ }
  }
  return commit();
}
