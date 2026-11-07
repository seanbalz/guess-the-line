import { socialApi } from '../../api.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { trackedOverview } from '../../trackedBetTerms.js';

/** Owner-filtered actual tickets only; Virtual Units never contribute to these counts. */
export function useTicketSummary(app) {
  const read = useLeagueRead(`${app.accountId}:ticket-summary`, signal => socialApi('read', { allHistory: true, filters: { playerId: app.accountId, origin: 'tracked' } }, app.accountId, signal), error => { if (error.status === 401) app.requestSignIn(); }, { shared: true });
  // Reuse the native owner's projection, including exclusion and complete-return rules.
  // Never trust a response's aggregate or another owner's entries for this landing.
  const model = read.data ? trackedOverview(read.data, { actorId: app.accountId }) : null;
  const entries = model?.entries;
  return { ...read, model, active: entries ? entries.filter(entry => entry.outcome === 'pending').length : null, settled: entries ? entries.filter(entry => entry.outcome !== 'pending').length : null };
}
