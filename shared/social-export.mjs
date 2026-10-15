import { summarizeSocialBets } from './social-bets.mjs';

/** Export the owner's complete, already projected social history, never a raw shared-state snapshot. */
export function socialBetExport(view, ownerId) {
  if (!ownerId || view?.actorId !== ownerId || view.historyScope !== 'all' || !Array.isArray(view.entries) || !Array.isArray(view.games)) {
    throw new Error('The complete shared bet history is unavailable.');
  }
  // Keep a second owner boundary here even though /social/read is called with its player filter.
  const entries = structuredClone(view.entries.filter(entry => entry.ownerId === ownerId));
  for (const entry of entries) {
    if (!Array.isArray(entry.legs) || !Array.isArray(entry.audit) || entry.audit.some(event =>
      [event.before, event.after].some(snapshot => snapshot && (snapshot.ownerId !== ownerId || snapshot.id !== entry.id)))) {
      throw new Error('The complete shared bet history is unavailable.');
    }
  }
  const versions = entries.flatMap(entry => [entry, ...entry.audit.flatMap(event => [event.before, event.after].filter(Boolean))]);
  const games = view.games.filter(game => versions.some(entry => entry.season === game.season && entry.week === game.week && entry.legs.some(leg => leg.gameId === game.id)));
  return { version: 1, scope: 'Own shared bets only', historyScope: 'all', entries, games: structuredClone(games),
    ticketCount: entries.length, selectionCount: entries.reduce((count, entry) => count + entry.legs.length, 0),
    summary: summarizeSocialBets(entries) };
}
