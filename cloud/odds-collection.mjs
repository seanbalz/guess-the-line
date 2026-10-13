import { OddsProviderError } from './odds-provider.mjs';
export const ODDS_METHODS = { '/odds/preflight': ['POST'], '/odds/collect': ['POST'] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class OddsCollectionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const SAFE_ERRORS = {
  GTL_ODDS_FORBIDDEN: [403, 'Only the original league commissioner can collect market data.'],
  GTL_ODDS_REQUEST: [400, 'A valid collection request is required.'],
  GTL_ODDS_REQUEST_CONFLICT: [409, 'This request identifier belongs to a different collection.'],
  GTL_ODDS_BUSY: [409, 'Another market collection is running.'],
  GTL_ODDS_COOLDOWN: [429, 'Wait before requesting another manual market collection.'],
  GTL_ODDS_PREFLIGHT_REQUIRED: [409, 'Run the free provider check before collecting market quotes.'],
  GTL_ODDS_BUDGET: [429, 'The protected free quota does not allow this collection.'],
  GTL_ODDS_DAILY_LIMIT: [429, 'The six market collections for today have been used. The count resets at 00:00 UTC.'],
  GTL_ODDS_LEASE: [409, 'The collection lease expired. Check its saved status before retrying.'],
  GTL_SLATE_CONFLICT: [409, 'The saved weekly schedule changed. Review it before collecting market data.'],
};
export const providerCollectionError = message => SAFE_ERRORS[message]
  ? new OddsCollectionError(...SAFE_ERRORS[message]) : new Error('Market collection storage failed.');
const onlyQuota = q => Object.fromEntries(['remaining', 'used', 'last'].map(k => [k, Number.isInteger(q?.[k]) && q[k] >= 0 && q[k] <= 999999999 ? q[k] : null]));
const safeSummary = result => ({
  requestId: result.requestId, operation: result.operation, status: result.status,
  snapshotId: result.snapshotId ?? null, matchedEvents: result.matchedEvents ?? 0, availableQuotes: result.availableQuotes ?? 0,
  quota: onlyQuota(result.quota), officialVerified: false,
  ...(result.errorCode ? { errorCode: result.errorCode } : {}),
});

// Auth and original commissioner membership are checked by the handler, then
// independently by each service-only SQL RPC. Collection returns counts, never lines.
export async function handleOddsCollection({ route, body, user, service, provider }) {
  if (!body || Object.keys(body).some(key => key !== 'requestId') || !UUID.test(body.requestId || '')) throw new OddsCollectionError(400, 'Provide a new collection request identifier.');
  if (!service || !provider) throw new OddsCollectionError(503, 'The server odds provider is not configured yet.');
  const operation = route === '/odds/preflight' ? 'preflight' : 'collect';
  const job = await service.rpc('gtl_begin_odds_collection', { p_user: user.id, p_request: body.requestId, p_operation: operation });
  if (job.replay) return safeSummary(job.diagnostics || job);
  let result = null, quota = onlyQuota(null), errorCode = null;
  try {
    const client = typeof provider === 'function' ? provider() : provider;
    result = operation === 'preflight'
      ? await client.preflight({ games: job.games })
      : await client.collect({ games: job.games, remainingCredits: job.remainingCredits, reserveCredits: job.reserveCredits });
    quota = onlyQuota(result.quota);
  } catch (error) {
    errorCode = error instanceof OddsProviderError ? error.code : 'ODDS_UNAVAILABLE';
    quota = onlyQuota(error instanceof OddsProviderError ? error.quota : null);
  }
  const finished = await service.rpc('gtl_finish_odds_collection', {
    p_user: user.id, p_request: body.requestId, p_lease: job.lease, p_payload: result,
    p_quota: quota, p_error: errorCode,
  });
  return safeSummary(finished);
}
