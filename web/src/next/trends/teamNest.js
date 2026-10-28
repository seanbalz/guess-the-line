// D-66 Trends › Teams as nesting cards: the teams in the published week (layer 1), one team's trends (layer 2) and
// one trend (layer 3). Only what shortCard and allTrends already let through reaches a layer: a line trend whose
// market is closed stays a lock, never a number (D-31, D-36).
import { allTrends, lookup, shortCard } from '../../../../shared/trends-view.mjs';
import { TEAM_NAMES } from '../../../../shared/nfl-schedule.mjs';
import { marketRelevant } from './situations.js';

const strongest = (a, b) => a.strength[0] - b.strength[0] || a.strength[1] - b.strength[1] || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** Side A's share of decided games for an open card or row (pushes left out), or null. */
export function trendShare(week, card) {
  if (!card || card.locked) return null;
  if (card.kind === 'card') return typeof card.pct === 'number' ? card.pct / 100 : null;
  const [a = 0, b = 0] = Array.isArray(lookup(week, card.id)?.entry?.split) ? lookup(week, card.id).entry.split : [];
  return a + b ? a / (a + b) : null;
}

const gameOf = (week, id) => week?.games?.find(g => g.id === id) ?? null;

/** The entity ids that belong to one team in a game: its venue rows, its head coach and its starting QB. */
function ownIds(game, code) {
  const { teams = {}, coaches = {}, qbs = {} } = game?.entities ?? {};
  return new Set([teams[code], coaches[code], qbs[code]].flatMap(e => (e ? [e.ats, e.ou, e.su] : [])).filter(Boolean));
}

/**
 * Layer 1: one entry per team playing a published game (`views` from gameSheet), sorted by code. `headline` is the
 * team's record in its venue role for the market (its ATS row for Spread, its over/under row for Total) as a short
 * card, or null when the week file has none.
 */
export function nestTeams(week, views, market) {
  return views.filter(v => v.trendsGame).flatMap(v => {
    const game = gameOf(week, v.id);
    return [[v.away.code, 'road'], [v.home.code, 'home']].map(([code, role]) => {
      const e = game?.entities?.teams?.[code];
      const ref = e ? (market === 'total' ? (e.ou ? { id: e.ou } : null) : (e.ats ? { id: e.ats, team: code } : null)) : null;
      const headline = ref ? shortCard(week, ref, { game, access: v.access, names: TEAM_NAMES }) : null;
      return { code, name: TEAM_NAMES[code] || code, role, view: v, headline, share: trendShare(week, headline) };
    });
  }).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

/**
 * Layer 2: one team's trends in the market, strongest first. Its own venue, coach and QB rows, plus situational and
 * line cards bound to the team; a card the market's gate holds back stays locked. `locks` lists the closed line gates
 * for this market (their records stay hidden).
 */
export function nestTeamTrends(week, team, market) {
  const v = team.view, game = gameOf(week, v.id);
  if (!game) return { cards: [], locks: [] };
  const { groups } = allTrends(week, v.id, { access: v.access, saved: v.saved, names: TEAM_NAMES });
  const own = ownIds(game, team.code), seen = new Set();
  const cards = groups.flatMap(g => g.items)
    // A locked card keeps only its key ("id@TEAM"), so its team comes from there; it is drawn as a lock, never opened.
    .filter(c => (c.locked ? c.key.endsWith(`@${team.code}`) : c.team === team.code || (!c.team && own.has(c.id))) && marketRelevant(c, week, market))
    .filter(c => !seen.has(c.key) && seen.add(c.key))
    .sort(strongest);
  const locks = (groups.find(g => g.key === 'line')?.locks ?? []).filter(gate => gate === market);
  return { cards, locks };
}
