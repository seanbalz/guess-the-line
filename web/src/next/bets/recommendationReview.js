// Reviewing a recommended bet over Recommended (player feedback, October 28, 2026): the list stays put, a saved ticket
// says so in a toast, and the toast's one action opens that ticket's week in My bets.
export const REVIEW_COPY = Object.freeze({ saved: 'Bet saved to My bets', view: 'View' });

/** The toast for a saved recommended ticket, as `shell.toast(...args)` takes it. `go` is `shell.go` (it asks before leaving a draft). */
export function savedTicketToast(ticket, go) {
  return [REVIEW_COPY.saved, { tone: 'done', actionLabel: REVIEW_COPY.view, action: () => go('bets', { view: 'tracked', season: ticket.season, week: ticket.week, period: null }) }];
}

/**
 * Bets has one dirty flag in the shell but two editors that can hold a draft at once: the open section (Your gap's
 * card, Your picks' slip, a tracker editor) and the recommended-bet review over it. Closing one must not clear the
 * other's guard. A part may name the places that keep its draft on screen (`keeps(next)`, the shell's setDirty rule):
 * moving there does not ask only when every part holding a draft keeps it.
 */
export function draftParts(setDirty) {
  let parts = { view: false, review: false }, keeps = {};
  const report = () => {
    const held = Object.keys(parts).filter(part => parts[part]);
    if (held.length && held.every(part => keeps[part])) { const k = keeps; setDirty('bets', true, next => held.every(part => k[part](next))); }
    else setDirty('bets', held.length > 0);
  };
  return {
    mark(part, value, keep) { parts = { ...parts, [part]: Boolean(value) }; keeps = { ...keeps, [part]: typeof keep === 'function' ? keep : undefined }; report(); },
    clear() { parts = { view: false, review: false }; keeps = {}; setDirty('bets', false); },
  };
}
