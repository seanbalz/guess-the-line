// D-69 step 4, the moments table's "Tracked bet wins" (small; a loss stays quiet): from each fresh ticket summary read
// (useTicketSummary: your own tracked tickets, every week) one candidate per ticket of yours settled as a win. It waits on
// that ticket's own Roomy card (ticketScope), so only the card that draws the ticket plays it, and the My bets tile counts
// it as NEW (SCOPES.bets, which nothing opens). A loss, a push, a void, a pending ticket and another player's ticket
// report nothing. Pure.
import { SCOPES, ticketScope } from '../moments/catalog.js';
import { toMs } from '../format.js';

export const BET_WIN_SOURCE = 'bets:tickets';
export const betWinId = entryId => `betWin:${entryId}`;
// The summary reads every week but the shared seen record keeps only SEEN_CAP ids, so only a recent win is a candidate:
// settled within WIN_WINDOW_MS of the read's server time (summary.now), else of the newest settlement among the viewer's
// own tickets. Never the device clock.
export const WIN_WINDOW_MS = 14 * 86400000;
const settledMs = e => toMs(e.settledAt ?? e.updatedAt);
const titleOf = entry => (entry.kind === 'parlay' && Array.isArray(entry.legs) ? `${entry.legs.length}-leg parlay` : 'Tracked bet');

export function betWinMoments(summary, viewer) {
  const entries = Array.isArray(summary?.entries) ? summary.entries : [];
  if (typeof viewer !== 'string' || !viewer) return [];
  const mine = entries.filter(e => typeof e?.id === 'string' && e.id && e.ownerId === viewer);
  const server = toMs(summary?.now), stamps = mine.filter(e => e.outcome !== 'pending').map(settledMs).filter(ms => ms !== null);
  const reference = server ?? (stamps.length ? Math.max(...stamps) : null);
  if (reference === null) return [];
  return mine.filter(e => e.outcome === 'win' && settledMs(e) !== null && reference - settledMs(e) <= WIN_WINDOW_MS)
    .map(e => ({ id: betWinId(e.id), kind: 'betWin', scopes: [ticketScope(e.id), SCOPES.bets], title: `${titleOf(e)} won`, icon: 'ticket' }));
}
