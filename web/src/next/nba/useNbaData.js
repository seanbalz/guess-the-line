import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nbaApi } from './api.js';
import { gradeNbaTicket } from '../../../../shared/nba-grade.mjs';

/** Sent after any NBA ticket save (the Track bet and Confirm result sheets), so every mounted ticket read refreshes. */
export const NBA_SAVED_EVENT = 'gtl:nba-saved';
export const noteNbaSaved = (win = window) => win.dispatchEvent(new Event(NBA_SAVED_EVENT));

/** Every request belongs to one mounted owner and resource key. Abort plus generation blocks late replies. */
export function useNbaData(action, body, { api = nbaApi, poll = false, enabled = true } = {}) {
  const key = JSON.stringify(body), serial = useRef(0), controller = useRef(null), dataRef = useRef(null);
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
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
    dataRef.current = null; setState({ data: null, error: null, loading: enabled });
    if (!enabled) return undefined;
    refresh();
    const timer = poll ? setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 300000) : null;
    // A save elsewhere (a sheet over this screen) reloads the first page of tickets.
    const saved = () => { if (action === 'read') refresh(); };
    window.addEventListener(NBA_SAVED_EVENT, saved);
    return () => { clearInterval(timer); window.removeEventListener(NBA_SAVED_EVENT, saved); ++serial.current; controller.current?.abort(); };
  }, [refresh, poll, enabled, action]);
  // Never render the previous resource while the effect for a changed filter/date is pending.
  const resource = useRef(key); const current = resource.current === key;
  useEffect(() => { resource.current = key; }, [key]);
  return { ...(current ? state : { data: null, loading: true, error: null }), refresh };
}

// Final scores for the "Needs your result" queue. One /nba/games read per distinct ticket date (the server's cache,
// lease and 35 s cooldown decide whether BALLDONTLIE is called), shared by Home and Bets for a minute so switching tabs
// asks again only after that. Game boards are public schedule data, never a player's ticket.
const BOARD_REUSE_MS = 60000;
const MAX_QUEUE_DATES = 7;
const boards = new Map();
function readBoard(api, date, timeZone, now = Date.now()) {
  const key = `${date}|${timeZone}`, hit = boards.get(key);
  if (hit && now - hit.at < BOARD_REUSE_MS) return hit.promise;
  const promise = api('games', { date, timeZone }).catch(error => { boards.delete(key); throw error; });
  boards.set(key, { at: now, promise });
  return promise;
}
export const resetNbaBoards = () => boards.clear();

const LINKED = /^NBA:balldontlie:/;
/** The dates whose boards can grade these pending tickets (linked legs only), newest first and at most seven. */
export function queueDates(tickets, todayDate) {
  const dates = new Set();
  for (const ticket of tickets ?? []) if (ticket.outcome === 'pending' && ticket.eventDate <= todayDate && ticket.legs.some(leg => LINKED.test(leg.gameId))) dates.add(ticket.eventDate);
  return [...dates].sort().reverse().slice(0, MAX_QUEUE_DATES);
}

/** `{ games, suggestions, loading }`: games by id from the needed boards and each pending ticket's suggestion (or null). */
export function useNbaGrades(tickets, { timeZone, todayDate, api = nbaApi }) {
  const dates = useMemo(() => queueDates(tickets, todayDate), [tickets, todayDate]);
  const key = dates.join(',');
  const [state, setState] = useState({ key: '', games: new Map(), loading: false });
  useEffect(() => {
    if (!dates.length) { setState({ key, games: new Map(), loading: false }); return undefined; }
    let live = true;
    setState(old => ({ ...old, loading: true }));
    Promise.allSettled(dates.map(date => readBoard(api, date, timeZone))).then(results => {
      if (!live) return;
      const games = new Map();
      for (const result of results) if (result.status === 'fulfilled') for (const game of result.value?.games ?? []) games.set(game.id, game);
      setState({ key, games, loading: false });
    });
    return () => { live = false; };
    // `key` names the dates.
  }, [key, timeZone, api]);
  const games = state.key === key ? state.games : new Map();
  const suggestions = useMemo(() => new Map((tickets ?? []).map(ticket => [ticket.id, gradeNbaTicket(ticket, games)])), [tickets, games]);
  return { games, suggestions, loading: state.loading || state.key !== key };
}
