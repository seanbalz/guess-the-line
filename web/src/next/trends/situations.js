import { gameTrends, lookup } from '../../../../shared/trends-view.mjs';
import { TEAM_NAMES } from '../../../../shared/nfl-schedule.mjs';
export function marketRelevant(card, week, market) {
  if (card.locked) return card.gate === market || card.gate === 'both';
  const item = lookup(week, card.id)?.entry;
  return Boolean(item && (market === 'total' ? item.market.startsWith('total') : !item.market.startsWith('total')));
}
export function marketSituationCards(week, view, market) {
  return gameTrends(week, view.id, { access: view.access, saved: view.saved, names: TEAM_NAMES }).all.filter(card => marketRelevant(card, week, market));
}
