// The League board's rank-change moment as a hook (rankMoment.js holds the rules). It compares the rank the board
// shows with the rank this device last saw, remembers the new one, and asks the shell's toast queue (`shell.toast`,
// which draws the kit's Toast one at a time and holds it while a celebration shows) for one toast per change.
import { useEffect, useRef, useState } from 'react';
import { rankKey, rankMoment, readRank, writeRank } from './rankMoment.js';

/**
 * `{ move, fresh }` for the viewer's row: `move` is the places moved at the last change (positive is up, null for none)
 * and `fresh` is true when that change was seen now, so the arrow pops once with the toast and is still afterwards.
 */
export function useRankMoment({ account, league, mode, rank, tied = false, toast }) {
  const [state, setState] = useState({ move: null, fresh: false });
  const say = useRef(toast), fired = useRef(null);
  say.current = toast;
  useEffect(() => {
    const key = rankKey(account, league, mode);
    if (!key) { setState({ move: null, fresh: false }); return; }
    const id = `${key}=${rank}`;
    const result = rankMoment(readRank(key), { rank, tied });
    if (result.write) writeRank(key, result.write);
    if (result.toast) { fired.current = id; say.current?.(result.toast.text, { tone: result.toast.tone }); }
    // Under React's development double effects the second pass finds the rank already written; it keeps the arrow and
    // the pop of the first pass, and never toasts again.
    setState({ move: result.move, fresh: fired.current === id });
  }, [account, league, mode, rank, tied]);
  return state;
}
