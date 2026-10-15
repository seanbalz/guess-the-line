// Both apps follow database-reported Guess rules. An explicitly absent RPC keeps the legacy deployment
// compatible; a transient outage or malformed response fails closed instead of reopening final guesses.
import { FEATURE_OFF } from './optional-rpc.mjs';

/** Compatibility only for a deployment with no live-rules RPC; never an outage fallback. */
export const TODAYS_RULES = Object.freeze({ sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' });
export const LATE_WINDOWS = Object.freeze(['deadline', 'kickoff']);
export const REVEAL_TIMES = Object.freeze(['deadline', 'kickoff']);

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The function's answer, checked; only known fields pass. Invalid rules never reopen editing. */
export function parseLiveRules(raw) {
  if (!record(raw) || typeof raw.sentFinal !== 'boolean' || !LATE_WINDOWS.includes(raw.lateWindow)) throw new Error('Invalid live rules.');
  if (raw.revealAt != null && !REVEAL_TIMES.includes(raw.revealAt)) throw new Error('Invalid live rules.');
  const revealAt = raw.lateWindow === 'kickoff' ? 'kickoff' : raw.revealAt ?? 'deadline';
  if (raw.perGameScoring !== undefined && typeof raw.perGameScoring !== 'boolean') throw new Error('Invalid live rules.');
  if (raw.perGameScoring === true && (!raw.sentFinal || raw.lateWindow !== 'kickoff')) throw new Error('Invalid live rules.');
  return { sentFinal: raw.sentFinal, lateWindow: raw.lateWindow, revealAt,
    ...(raw.perGameScoring !== undefined ? { perGameScoring: raw.perGameScoring } : {}) };
}

/** Only an explicitly missing migration uses legacy rules. Outages and malformed answers fail closed. */
export async function readLiveRules(optionalRpc) {
  if (typeof optionalRpc !== 'function') return { ...TODAYS_RULES };
  const result = await optionalRpc('gtl_live_rules', {});
  return result === FEATURE_OFF ? { ...TODAYS_RULES } : parseLiveRules(result);
}
