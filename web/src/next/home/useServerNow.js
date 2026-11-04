// The server's clock on this screen: the `now` a read carried, advanced by this device's elapsed time since that read
// landed, never the device's own date. `at` is the device time the read landed (the store view's `at`, data/store.js):
// the store refreshes only on focus, every 5 minutes or back online, so a screen that mounts on an older read starts at
// `now` plus the read's age, not at `now`. The age is the device's own elapsed time (a read time ahead of it counts as
// none); the ticks after mount are performance.now (monotonic). Null until the read has a usable `now`. One tick a
// second, until `until` (a server time after which nothing on screen can change, such as the week's last kickoff).
// A read's clock is derived in the render the read arrives in (the state remembers which read its value belongs to), so
// no render ever shows the previous read's value, or null, for a read that has landed. A non-finite `now` is no clock.
import { useEffect, useState } from 'react';

const ageOf = at => (Number.isFinite(at) ? Math.max(0, Date.now() - at) : 0);
const usable = value => Number.isFinite(value);
const keyOf = (serverNow, at) => `${serverNow}|${at}`;

export function useServerNow(serverNow, at, { until } = {}) {
  const key = keyOf(serverNow, at);
  const [state, setState] = useState(() => ({ key, value: usable(serverNow) ? serverNow + ageOf(at) : null }));
  useEffect(() => {
    if (!usable(serverNow)) {
      setState({ key, value: null });
      return undefined;
    }
    const start = performance.now() - ageOf(at);
    const read = () => serverNow + (performance.now() - start);
    const done = value => Number.isFinite(until) && value >= until;
    const first = read();
    setState({ key, value: first });
    if (done(first)) return undefined;
    const timer = setInterval(() => {
      const value = read();
      setState({ key, value });
      if (done(value)) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [serverNow, at, until]);
  if (state.key === key) return state.value;
  return usable(serverNow) ? serverNow + ageOf(at) : null;
}
