// The live Guess rules (redesign build plan, section 3.4; stage 4). The database is the authority: it will
// report which pick rule is live through `gtl_live_rules()` (created by M-02, updated by M-07), and
// /community/read, /personal, /personal/read and /state carry it as `rules` (the /ballot and /bet replies are
// the /state view, so they carry it too). Both apps' buttons, picksDue() and the new app's banners read it,
// so a deploy never puts a screen ahead of its rule and a rollback switches the screens back. The function
// does not exist yet; until it does, every reply carries today's rules. Screens only describe the rule:
// the SQL writers enforce it whatever a client shows.
import { readOptional } from './optional-rpc.mjs';

/**
 * Today's rules, served while `gtl_live_rules` is missing or cannot be read.
 *
 * - `sentFinal: false`. Today a Spread or Total guess can be changed until the week's deadline, after
 *   submission too (D-16; docs/RULES.md "Drafts and submission"). The future rule is D-39's per-game lock-in,
 *   which amends D-37: each game's Spread or Total guess is final once it is locked in, and locking it in
 *   opens, for that player, that game's line for that market and everyone's guesses for that game and
 *   market. There is no market-level "send"; unlocked guesses stay drafts until that game's kickoff. M-02
 *   (stage 18) enforces it in every writer and makes `gtl_live_rules()` return `sentFinal: true`.
 * - `lateWindow: 'deadline'`. Today a week's picks close at its deadline, the Thursday kickoff (D-24). M-07
 *   (stage 24) returns 'kickoff': each game's pick closes at its own kickoff, and a pick saved after the
 *   deadline carries the Late marker (D-36, D-30).
 */
export const TODAYS_RULES = Object.freeze({ sentFinal: false, lateWindow: 'deadline' });
export const LATE_WINDOWS = Object.freeze(['deadline', 'kickoff']);

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The function's answer, checked; only the known keys pass. Anything else throws, and the reply carries today's rules. */
export function parseLiveRules(raw) {
  if (!record(raw) || typeof raw.sentFinal !== 'boolean' || !LATE_WINDOWS.includes(raw.lateWindow)) throw new Error('Invalid live rules.');
  return { sentFinal: raw.sentFinal, lateWindow: raw.lateWindow };
}

/** Never rejects: `gtl_live_rules()` takes no arguments and holds no player data. */
export async function readLiveRules(optionalRpc) {
  return { ...(await readOptional(optionalRpc, 'gtl_live_rules', {}, { parse: parseLiveRules, fallback: TODAYS_RULES })) };
}
