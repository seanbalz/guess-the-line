import { useCallback, useEffect, useRef, useState } from 'react';
import { nbaApi } from './api.js';
/** Every request belongs to one mounted owner and resource key. Abort plus generation blocks late replies. */
export function useNbaData(action, body, { api = nbaApi, poll = false } = {}) {
  const key = JSON.stringify(body), serial = useRef(0), controller = useRef(null), dataRef = useRef(null);
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const refresh = useCallback(async (cursor = null) => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const generation = ++serial.current;
    setState(old => ({ ...old, loading: true, error: null }));
    try {
      const data = await api(action, { ...JSON.parse(key), ...(cursor ? { cursor } : {}) }, { signal: abort.signal });
      if (abort.signal.aborted || generation !== serial.current) return;
      const merged = cursor && dataRef.current ? { ...data, tickets: [...dataRef.current.tickets, ...data.tickets] } : data;
      dataRef.current = merged; setState({ data: merged, loading: false, error: null });
    } catch (error) { if (!abort.signal.aborted && generation === serial.current) setState(old => ({ ...old, loading: false, error })); }
  }, [action, key, api]);
  useEffect(() => {
    dataRef.current = null; setState({ data: null, error: null, loading: true }); refresh();
    const timer = poll ? setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 300000) : null;
    return () => { clearInterval(timer); ++serial.current; controller.current?.abort(); };
  }, [refresh, poll]);
  // Never render the previous resource while the effect for a changed filter/date is pending.
  const resource = useRef(key); const current = resource.current === key;
  useEffect(() => { resource.current = key; }, [key]);
  return { ...(current ? state : { data: null, loading: true, error: null }), refresh };
}
