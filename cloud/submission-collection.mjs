import { OddsProviderError } from './odds-provider.mjs';
import { SubmissionOddsError } from './submission-odds.mjs';

const quotaOnly = quota => Object.fromEntries(['remaining', 'used', 'last'].map(key => [key,
  Number.isInteger(quota?.[key]) && quota[key] >= 0 && quota[key] <= 999999999 ? quota[key] : null]));

// This is a member-scoped submission intent, never a commissioner impersonation.
// The SQL begin RPC rechecks the exact intent and holds the shared quota lease.
export async function collectSubmissionOdds({ user, intent, service, provider, requestId, uuid = () => crypto.randomUUID() }) {
  if (!service?.rpc || !provider) throw new SubmissionOddsError('GTL_SUBMISSION_REFRESH_UNAVAILABLE');
  async function run(operation, id) {
    const job = await service.rpc('gtl_begin_submission_odds_collection', {
      p_user: user.id, p_request: id, p_intent: intent, p_operation: operation,
    });
    if (job.replay) return { status: job.status === 'succeeded' ? 'succeeded' : 'failed' };
    let result = null, quota = quotaOnly(null), errorCode = null;
    try {
      const client = typeof provider === 'function' ? provider() : provider;
      result = operation === 'preflight' ? await client.preflight({ games: job.games })
        : await client.collect({ games: job.games, remainingCredits: job.remainingCredits, reserveCredits: job.reserveCredits });
      quota = quotaOnly(result.quota);
    } catch (error) {
      errorCode = error instanceof OddsProviderError ? error.code : 'ODDS_UNAVAILABLE';
      quota = quotaOnly(error instanceof OddsProviderError ? error.quota : null);
    }
    const finished = await service.rpc('gtl_finish_submission_odds_collection', {
      p_user: user.id, p_request: id, p_lease: job.lease, p_payload: result, p_quota: quota, p_error: errorCode,
    });
    return { status: finished?.status === 'succeeded' ? 'succeeded' : 'failed' };
  }
  // The zero-credit event preflight also establishes a measured quota. It uses
  // the same SQL lease; an unavailable preflight never falls through to odds.
  // Only the specific preflight-required error permits this bounded extra step.
  try { return await run('collect', requestId); }
  catch (error) {
    if (error?.code !== 'GTL_ODDS_PREFLIGHT_REQUIRED') throw error;
    const preflight = await run('preflight', uuid());
    if (preflight?.status !== 'succeeded') return preflight;
    return run('collect', requestId);
  }
}
