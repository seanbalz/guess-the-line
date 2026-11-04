// D-69 step 1, Whole week locked (a small moment): the shared Community read reports it wherever Play is open, and the
// line that says "N of N locked" pops on the card that shows it. Moments come only from fresh server reads: the shared
// store changes `community.data` only when a read succeeds, so a request still on its way or a failed refresh reports
// nothing (D-69 section 4.2, rule 1).
import { useEffect } from 'react';
import { useMoments } from '../moments/MomentsProvider.jsx';
import { WEEK_LOCKED_SOURCE, weekLockedMoments } from './landing.js';

/** Reports this account's Whole week locked moments from each fresh Community read. Another account's read never reports. */
export function useWeekLocked(app) {
  const moments = useMoments(), data = app?.community?.data ?? null, viewer = app?.accountId ?? '';
  const report = moments?.report;
  useEffect(() => {
    if (!report || !data || !viewer) return;
    if (typeof data.viewer === 'string' && data.viewer.toLowerCase() !== viewer.toLowerCase()) return;
    report(weekLockedMoments(data), { source: WEEK_LOCKED_SOURCE });
  }, [report, data, viewer]);
}
