// Bets › Your gap's state (D-69 step 4): the account's recommendation read for the published week (or an older one, view
// only), D-77's /lines/read for the paper record, the review card's selections and the one virtual-pick write. It is the
// old VirtualUnits.jsx Recommended view's state, moved, with the server's clock in place of the device's: the read's
// `personal.now`, ticking from when it landed (useServerNow), until the week's last kickoff.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cloudApi, linesApi } from '../../../api.js';
import { buildRecommendations, gapRecord, recommendationList } from '../../../../../shared/recommended-bets.mjs';
import { useServerNow } from '../../home/useServerNow.js';
import { GAP_COPY, closedReason, confirmsChoice, placeBody, staleKeys, trackTicket } from './gapModel.js';

const lastKickoff = data => { const t = (data?.games || []).map(g => Date.parse(g.kickoff)).filter(Number.isFinite); return t.length ? Math.max(...t) : 0; };
const omit = (object, keys) => (keys.length ? Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key))) : object);

export function useGap({ accountId, market, onDirty, onSaved, onSignInAgain, onTrackTicket, confirm = () => true }) {
  const [reply, setReply] = useState(null); // { virtual, personal, info, at }
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [selections, setSelections] = useState({}), [uncertain, setUncertain] = useState(null), [expanded, setExpanded] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(null), [board, setBoard] = useState(null);
  const inflight = useRef(null), generation = useRef(0), shownScope = useRef(null), lastScope = useRef(null), signIn = useRef(onSignInAgain);
  signIn.current = onSignInAgain;
  const data = reply?.virtual ?? null, personal = reply?.personal ?? null, info = reply?.info ?? null;
  const now = useServerNow(personal ? Date.parse(personal.now) : null, reply?.at ?? null, { until: lastKickoff(data) });
  const nowRef = useRef(now); nowRef.current = now;
  const take = useCallback(result => setReply({ virtual: result.virtual, personal: result.personal, at: Date.now(),
    info: { slates: result.slates || [], publishedWeek: result.publishedWeek, current: result.current !== false } }), []);
  const load = useCallback(async signal => {
    inflight.current?.abort();
    const controller = new AbortController(); inflight.current = controller;
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, { once: true });
    try {
      const result = await cloudApi('bets/recommendations', selectedWeek || {}, { signal: controller.signal });
      if (!controller.signal.aborted) take(result);
      return result;
    } catch (failure) {
      // As before: a failed recommendation read shows no older week's card (it could be another week's).
      if (!controller.signal.aborted) { if (failure.status === 401 && !failure.uncertain) signIn.current?.(); setReply(null); }
      throw failure;
    } finally { signal?.removeEventListener('abort', abort); }
  }, [selectedWeek, take]);
  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1;
    setReply(null); setSelections({}); setUncertain(null); setBusy(false); setExpanded(false); setLoading(true); setError('');
    load(controller.signal).catch(failure => { if (failure.name !== 'AbortError' && !controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { generation.current += 1; controller.abort(); inflight.current?.abort(); };
  }, [load, accountId]);
  // A new week or account never shows the last one's selections; the scope also guards a save's late reply.
  const scope = data ? `${accountId || data.playerId}:account:${data.season}:${data.week}` : null;
  shownScope.current = scope;
  useEffect(() => {
    if (!scope) return;
    if (lastScope.current && lastScope.current !== scope) { setSelections({}); setUncertain(null); setNotice(''); }
    lastScope.current = scope; setExpanded(false);
  }, [scope]);
  useEffect(() => { onDirty?.(busy || Boolean(uncertain) || Object.keys(selections).length > 0); }, [busy, uncertain, selections, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  useEffect(() => { if (data) setSelections(current => omit(current, staleKeys(data, current))); }, [data]);
  // D-77: your own lines board for the week on screen, read once per week; a failed read only hides the record.
  const gapWeek = data ? `${data.season}:${data.week}` : null;
  useEffect(() => {
    if (!gapWeek) return undefined;
    const controller = new AbortController(), [season, week] = gapWeek.split(':').map(Number);
    linesApi('read', { season, week }, controller.signal).then(b => { if (!controller.signal.aborted) setBoard({ week: gapWeek, board: b }); },
      () => { if (!controller.signal.aborted) setBoard({ week: gapWeek, board: null }); });
    return () => controller.abort();
  }, [gapWeek, accountId]);
  const historical = info?.current === false || data?.current === false;
  const ranked = useMemo(() => buildRecommendations({ personal, virtual: data, now }), [personal, data, now]);
  // BETS-NEXT-01: the market narrows the whole ranked set before the top three; display only.
  const shown = useMemo(() => recommendationList(ranked.rows, { market, expanded }), [ranked.rows, market, expanded]);
  const gaps = useMemo(() => (board?.week === gapWeek && board.board ? gapRecord(board.board, { market }) : null), [board, gapWeek, market]);
  const picks = useMemo(() => Object.fromEntries((data?.picks || []).map(p => [`${p.gameId}:${p.market}`, p])), [data]);
  const closed = gameId => closedReason(data?.games.find(g => g.id === gameId), nowRef.current, data?.results?.[gameId]);
  const current = key => buildRecommendations({ personal, virtual: data, now: nowRef.current }).rows.find(item => item.key === key);
  function choose(game, mkt, side, units) {
    const offer = game.offers?.[mkt]?.[side];
    if (!offer || closedReason(game, nowRef.current, data?.results?.[game.id])) return;
    const matchup = { id: game.id, home: game.home, away: game.away, homeCode: game.homeCode, awayCode: game.awayCode, kickoff: game.kickoff };
    setSelections(list => ({ ...list, [`${game.id}:${mkt}`]: { gameId: game.id, market: mkt, side, units, offer, game: matchup } }));
  }
  // Units change only the stake: the quote reviewed stays on the selection until a newer one is chosen.
  function changeUnits(key, units) { const s = selections[key]; if (!s || closed(s.gameId)) return; setSelections(list => (list[key] ? { ...list, [key]: { ...list[key], units } } : list)); }
  function remove(key) { setSelections(list => omit(list, [key])); }
  function add(row) {
    if (busy || loading || uncertain || historical || picks[row.key] || selections[row.key]) return;
    const fresh = current(row.key); if (!fresh?.offer) return;
    choose(fresh.game, fresh.market, fresh.side, 1); setNotice(GAP_COPY.added);
  }
  function track(row) {
    if (busy || loading || uncertain || historical || !onTrackTicket) return;
    const fresh = current(row.key); if (!fresh?.offer) return;
    onTrackTicket(trackTicket(fresh, data));
  }
  async function save(key) {
    const choice = selections[key]; if (!choice || busy || uncertain || loading || !data || historical) return;
    if (closed(choice.gameId)) { setNotice(GAP_COPY.closedNotice); return; }
    const gen = generation.current, at = scope, still = () => gen === generation.current && at === shownScope.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await cloudApi('bets/recommendations/place', placeBody(choice, data), { save: true });
      if (!still()) return;
      take(response); remove(key); onSaved?.(); setNotice(GAP_COPY.saved);
    } catch (failure) {
      if (!still()) return;
      setError(failure.message);
      if (failure.status === 401 && !failure.uncertain) signIn.current?.();
      if (failure.uncertain) setUncertain({ key, choice });
    } finally { if (still()) setBusy(false); }
  }
  async function refresh() {
    if (loading || busy) return;
    setLoading(true); setError('');
    let request;
    try {
      const pending = load(); request = inflight.current;
      const latest = await pending;
      if (request !== inflight.current || request.signal.aborted) return;
      if (uncertain) {
        const ok = confirmsChoice(latest.virtual, uncertain.choice);
        if (ok) { remove(uncertain.key); onSaved?.(); }
        setNotice(ok ? GAP_COPY.confirmed : GAP_COPY.recheck); setUncertain(null);
      }
    } catch (failure) { if (!request?.signal.aborted && request === inflight.current) setError(failure.message); }
    finally { if (request === inflight.current && !request?.signal.aborted) setLoading(false); }
  }
  function changeWeek(value) {
    if (busy || loading) return;
    const next = value === 'current' ? null : info?.slates.find(w => `${w.season}:${w.week}` === value);
    if (value !== 'current' && !next) return;
    if ((uncertain || Object.keys(selections).length) && !confirm()) return;
    setNotice(''); setSelectedWeek(next ? { season: next.season, week: next.week } : null);
  }
  return { data, personal, info, now, loading, busy, error, notice, selections, uncertain, expanded, historical, ranked, shown, gaps, picks,
    canTrack: Boolean(onTrackTicket), setExpanded, choose, changeUnits, remove, add, track, save, refresh, changeWeek, selectedWeek };
}
