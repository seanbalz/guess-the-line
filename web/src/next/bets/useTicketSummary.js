import { socialApi } from '../../api.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';

/** Owner-filtered actual tickets only; Virtual Units never contribute to these counts. */
export function useTicketSummary(app) {
  const read = useLeagueRead(`${app.accountId}:ticket-summary`, signal => socialApi('read', { allHistory: true, filters: { playerId: app.accountId, origin: 'tracked' } }, app.accountId, signal), error => { if (error.status === 401) app.requestSignIn(); });
  const entries = read.data?.entries;
  return { ...read, active: entries ? entries.filter(entry => entry.outcome === 'pending').length : null, settled: entries ? entries.filter(entry => entry.outcome !== 'pending').length : null };
}
