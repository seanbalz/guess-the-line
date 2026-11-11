import { useEffect, useMemo, useRef, useState } from 'react';
import { linesApi } from '../../api.js';
import { gapRecord } from '../../../../shared/recommended-bets.mjs';
import { combineGapBoards, loadGapBoards, periodWeeks, publishedGapWeeks, weekKey } from './gapPeriods.js';

const weekLabel = w => `${w.season} Week ${w.week}`;
export function useGapPeriod({ board, season, week, slates = [], accountId, market = 'all', onSignInAgain, periodSelection, onPeriodSelectionChange }) {
  const [localSelection, setLocalSelection] = useState({ period: 'week', range: null });
  const { period, range } = periodSelection ?? localSelection;
  const setSelection = onPeriodSelectionChange ?? setLocalSelection;
  const setPeriod = period => setSelection({ period, range });
  const applyRange = range => setSelection({ period, range });
  const [state, setState] = useState(null), [attempt, setAttempt] = useState(0);
  const auth = useRef(onSignInAgain); auth.current = onSignInAgain;
  const weeksKey = JSON.stringify(publishedGapWeeks(slates));
  const weeks = useMemo(() => JSON.parse(weeksKey), [weeksKey]);
  let selected = [], error = null;
  try { if (period !== 'custom' || range) selected = periodWeeks(weeks, { period, season, week, ...range }); }
  catch (failure) { error = failure.message; }
  const selectedKey = JSON.stringify(selected);
  const key = JSON.stringify([accountId, period, selectedKey, error, range]);
  useEffect(() => {
    if (period === 'week' || error || (period === 'custom' && !range)) return undefined;
    const controller = new AbortController();
    loadGapBoards(JSON.parse(selectedKey), { board, signal: controller.signal,
      read: (scope, signal) => linesApi('read', scope, signal),
    }).then(boards => {
      if (!controller.signal.aborted) setState({ key, source: board, status: 'ready', board: combineGapBoards(boards) });
    }).catch(failure => {
      if (controller.signal.aborted) return;
      if (failure.status === 401 && !failure.uncertain) auth.current?.();
      setState({ key, source: board, status: 'error', error: 'The complete period could not be loaded. Retry to include every selected week.' });
    });
    return () => controller.abort();
  }, [key, selectedKey, board, period, error, range, attempt]);
  const status = error ? 'error' : period === 'week' ? 'ready'
    : period === 'custom' && !range ? 'choose'
    : state?.key !== key || state?.source !== board ? 'loading' : state.status;
  const shownBoard = status === 'ready' ? period === 'week' ? board : state.board : null;
  const record = useMemo(() => gapRecord(shownBoard, { market }), [shownBoard, market]);
  const title = period === 'week' ? `Week ${week}` : period === 'all' ? 'All time'
    : period === 'season' ? `${weeks.at(-1)?.season ?? season} season`
    : selected.length && selected[0].season === selected.at(-1).season
      ? `Weeks ${selected[0].week}–${selected.at(-1).week}` : 'Custom range';
  const coverage = period === 'week' ? `${season} · Selected recommendation week`
    : `${period === 'all' ? 'All retained weeks' : period === 'custom' && selected.length
      ? `${weekLabel(selected[0])} – ${weekLabel(selected.at(-1))}` : 'Selected published weeks'} · ${selected.length} ${selected.length === 1 ? 'week' : 'weeks'}`;
  return { period, setPeriod, range, applyRange, weeks, title, coverage, status, record, board: shownBoard,
    error: error || state?.error, retry: () => { setState(null); setAttempt(n => n + 1); } };
}
