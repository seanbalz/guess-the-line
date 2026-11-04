// The server's clock on this screen: the `now` a read carried, advanced by this device's elapsed time (performance.now,
// monotonic), never the device's own date. Null until the read has a usable `now`. One tick a second.
import { useEffect, useState } from 'react';

export function useServerNow(serverNow) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(serverNow);
    if (serverNow === null || serverNow === undefined) return undefined;
    const start = performance.now();
    const timer = setInterval(() => setNow(serverNow + (performance.now() - start)), 1000);
    return () => clearInterval(timer);
  }, [serverNow]);
  return now;
}
