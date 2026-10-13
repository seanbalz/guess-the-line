// Keeps an open trends panel's kickoff wind forecast honest without a reload (D-34): a re-render every
// minute so ages, staleness and the forecast-to-final change follow the clock, and a fresh read when a
// snapshot's age crosses the TTL for its lead, at kickoff, when a game enters the 120 h window, and
// when the tab becomes visible again. No network or auth import, so the vitest suite can drive it with
// fake timers.
import { nextWindRefresh, windClock } from '../../shared/trends-view.mjs';

export const WIND_TICK_MS = 60_000;
const MAX_WAIT_MS = 6 * 60 * 60_000;

/** The effective server time for a loaded result ({ data, receivedAt }), from this device's clock. */
export const windNowFor = (result, nowMs = Date.now()) => (result?.data ? windClock(result.data.asOf, result.receivedAt, nowMs) : null);

/** Starts the timers for one loaded result; returns a stop function. */
export function watchWind({ result, onTick, onRefetch, doc = globalThis.document }) {
  const tick = setInterval(() => onTick(Date.now()), WIND_TICK_MS);
  let refetch = null;
  const now = windNowFor(result);
  const at = now === null ? null : nextWindRefresh(result.data, now);
  if (at !== null) refetch = setTimeout(onRefetch, Math.min(MAX_WAIT_MS, Math.max(WIND_TICK_MS, at - now)));
  const visible = () => { if (doc?.visibilityState === 'visible') onRefetch(); };
  doc?.addEventListener?.('visibilitychange', visible);
  return () => { clearInterval(tick); clearTimeout(refetch); doc?.removeEventListener?.('visibilitychange', visible); };
}
