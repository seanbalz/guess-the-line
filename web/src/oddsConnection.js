// The Odds connection rules both commissioner screens share: the old app's ManualOddsControls and the new app's
// Menu › Commissioner tools › Odds connection (redesign stage 78). Counts only: market values never belong here.

/** A fetch needs a measured quota of at least this many free credits, so the server's 50-credit reserve stays whole. */
export const ODDS_FETCH_MIN_CREDITS = 52;

export const ODDS_FAILURES = Object.freeze({
  ODDS_AUTH: 'The provider did not accept the server connection. Review the saved server key, then check again.',
  ODDS_RATE_LIMIT: 'The provider has temporarily limited requests. Wait before checking again.',
  ODDS_BUDGET: 'The protected free quota does not allow this fetch.',
  ODDS_QUOTA_COST: 'The provider reported an unexpected credit cost. Review the quota before collecting again.',
  ODDS_LEASE_EXPIRED: 'The saved request expired. Check the collection status before starting another fetch.',
});
export const ODDS_FAILED = 'The provider request did not complete. Check the connection before trying again.';
export const ODDS_PENDING = 'This request has not completed. Retry the same action to check its saved status.';
export const ODDS_LOW_QUOTA = `The connection responded, but a measured quota of at least ${ODDS_FETCH_MIN_CREDITS} free credits is required to protect the reserve. Fetching stays disabled.`;

/** A count from the server, or "Unavailable" for anything that is not a whole number of zero or more. */
export const oddsCount = value => Number.isSafeInteger(value) && value >= 0 ? String(value) : 'Unavailable';

/** Whether a succeeded connection check measured enough free credits to allow a fetch. */
export const oddsFetchAllowed = check => Number.isSafeInteger(check?.quota?.remaining) && check.quota.remaining >= ODDS_FETCH_MIN_CREDITS;

/** The summary to keep from an odds/preflight or odds/collect reply: counts and status, never market values. */
export const oddsSummary = (operation, reply) => ({
  operation, status: reply?.status, matchedEvents: reply?.matchedEvents, availableQuotes: reply?.availableQuotes, quota: reply?.quota,
});
