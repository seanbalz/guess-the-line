// Keeps an open screen's kickoff weather honest without a reload (D-34, D-47): a re-render every minute so ages,
// staleness and the forecast-to-final change follow the clock, and one fresh read at the next point nextWindRefresh
// names (a snapshot falling due on the D-47 schedule: 24 h after it was taken, 12 h and 2 h before kickoff; kickoff; a
// game entering the 120 h window; a retry when the server held off), plus one when the tab becomes visible again. Never
// more often: a wait longer than MAX_WAIT_MS is re-armed without a read, and a device that slept past the point reads
// on its next tick. No network or auth import, so the vitest suite can drive it with fake timers.
import { nextWindRefresh, windClock } from '../../shared/trends-view.mjs';

export const WIND_TICK_MS = 60_000;
const MAX_WAIT_MS = 6 * 60 * 60_000;

/** The effective server time for a loaded result ({ data, receivedAt }), from this device's clock. */
export const windNowFor = (result, nowMs = Date.now()) => (result?.data ? windClock(result.data.asOf, result.receivedAt, nowMs) : null);

/** Starts the timers for one loaded result; returns a stop function. Each result asks for at most one timed read. */
export function watchWind({ result, onTick, onRefetch, doc = globalThis.document }) {
  const start = windNowFor(result);
  const at = start === null ? null : nextWindRefresh(result.data, start);
  let refetch = null, asked = false;
  /** Reads once the server time reaches `at`; otherwise waits for it, at most MAX_WAIT_MS at a time. */
  const check = () => {
    clearTimeout(refetch);
    const now = windNowFor(result);
    if (asked || at === null || now === null) return;
    if (now >= at) { asked = true; onRefetch(); return; }
    refetch = setTimeout(check, Math.min(MAX_WAIT_MS, at - now));
  };
  const tick = setInterval(() => { onTick(Date.now()); check(); }, WIND_TICK_MS);
  check();
  const visible = () => { if (doc?.visibilityState === 'visible') onRefetch(); };
  doc?.addEventListener?.('visibilitychange', visible);
  return () => { asked = true; clearInterval(tick); clearTimeout(refetch); doc?.removeEventListener?.('visibilitychange', visible); };
}
