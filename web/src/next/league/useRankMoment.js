// The League rank moment as a hook (rankMoment.js holds the rules). On each fresh confirmed read of a board it compares
// your rank with the rank this device last saw, remembers the new one and reports the change to the D-69 engine under
// SCOPES.league: it plays where League opens after the launch and shows NEW on the Play landing's League tile meanwhile.
// A drop reports nothing (losses stay quiet). The old toast is gone.
import { useEffect, useState } from 'react';
import { useMoments } from '../moments/MomentsProvider.jsx';
import { rankKey, rankReport, rankSource, readRank, writeRank } from './rankMoment.js';

/** `{ move, id }`: the places moved at the last change (positive is up, null for none) and that change's moment id. */
export function useRankMoment({ account, league, mode, rank, tied = false, read, fresh, market }) {
  const report = useMoments()?.report;
  const [state, setState] = useState({ move: null, id: null });
  useEffect(() => {
    const key = rankKey(account, league, mode);
    const result = key && read ? rankReport({ fresh, stored: readRank(key), rank, tied, league, mode, market }) : null;
    if (!result) return;
    if (result.write) writeRank(key, result.write);
    // Before the engine exists this reports nothing; when it arrives the effect runs again and derives the same moment.
    report?.(result.candidates, { source: rankSource(league, mode) });
    setState({ move: result.move, id: result.candidates[0]?.id ?? null });
  }, [account, league, mode, rank, tied, read, fresh, market, report]);
  return state;
}
