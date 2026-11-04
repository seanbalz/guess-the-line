// D-69 step 4: the ticket summary (useTicketSummary, shared with Home's My bets tile) and, from each fresh read of it, the
// tracked wins it shows (betMoments.js) reported to the moments engine. A read on its way or a failed one reports nothing:
// useLeagueRead holds no data until a read succeeds (spec 4.2 rule 1). Bets' landing and My bets call it.
import { useEffect } from 'react';
import { useMoments } from '../moments/MomentsProvider.jsx';
import { useTicketSummary } from './useTicketSummary.js';
import { BET_WIN_SOURCE, betWinMoments } from './betMoments.js';

export function useBetWins(app) {
  const tickets = useTicketSummary(app);
  const report = useMoments()?.report, data = tickets?.data ?? null, viewer = app?.accountId ?? '';
  useEffect(() => {
    if (!report || !data || !viewer) return;
    report(betWinMoments(data, viewer), { source: BET_WIN_SOURCE });
  }, [report, data, viewer]);
  return tickets;
}
