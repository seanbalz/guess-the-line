// Reviewing a recommended bet over Recommended (player feedback, October 28, 2026): the list stays put, a saved ticket
// says so in a toast, and the toast's one action opens that ticket's week in My bets.
export const REVIEW_COPY = Object.freeze({ saved: 'Bet saved to My bets', view: 'View' });

/** The toast for a saved recommended ticket, as `shell.toast(...args)` takes it. `go` is `shell.go` (it asks before leaving a draft). */
export function savedTicketToast(ticket, go) {
  return [REVIEW_COPY.saved, { tone: 'done', actionLabel: REVIEW_COPY.view, action: () => go('bets', { view: 'tracked', season: ticket.season, week: ticket.week, period: null }) }];
}

/**
 * Bets has one dirty flag in the shell but two editors that can hold a draft at once: the open view (Recommended's
 * Virtual Units card) and the recommended-bet review over it. Closing one must not clear the other's guard.
 */
export function draftParts(setDirty) {
  let parts = { view: false, review: false };
  return {
    mark(part, value) { parts = { ...parts, [part]: Boolean(value) }; setDirty('bets', parts.view || parts.review); },
    clear() { parts = { view: false, review: false }; setDirty('bets', false); },
  };
}
