// Play › Badges and awards as nesting layers (D-66, D-69; Sean's P5A): the page's first card, then one layer each for
// your streaks, the week's awards, the season winners and one badge. The address holds the layer (`layer`) and, for a
// badge, its id (`item`), plus "@" and the member's id when it is another member's badge (the League board's week
// badges). Also the words the layers' tiles and rows print. Pure: no React, storage or clock.
import { BADGE_BY_ID, SEASON_FINAL_WEEK, STREAK_BY_ID } from '../../../../shared/game-features/catalog.mjs';
import { DASH, EN_DASH, plural } from '../format.js';

export const FEATURES_LAYERS = Object.freeze(['streaks', 'awards', 'season', 'badge']);

export const FEATURES_COPY = Object.freeze({
  title: 'Badges and awards',
  loading: 'Loading badges and awards…',
  off: 'Badges and awards are coming soon.',
  noRecap: 'Weekly awards post here once every game of the week is final.',
  noBadges: 'No badges yet. Your first one is a guess away.',
  season: `Decided after Week ${SEASON_FINAL_WEEK}.`,
  streaks: 'Your streaks',
  weekly: 'Weekly awards',
  awards: week => `Week ${week} awards`,
  badges: 'Badges',
  earnedOf: (n, of) => `${n} of ${of} earned`,
  seasonTitle: 'Season winners',
  earlier: 'Earlier weeks',
});

// A member id as the router keeps it (shell/router.js allows [\w .:@/+-], at most 100 characters in all).
const MEMBER = /^[\w.:+-]{1,80}$/;
const TOP = Object.freeze({ layer: 'top', badge: null, member: null });

/** The layer Play's view names: `{ layer: 'top' | 'streaks' | 'awards' | 'season' | 'badge', badge, member }`. */
export function featuresLayer(view) {
  const layer = FEATURES_LAYERS.includes(view?.layer) ? view.layer : 'top';
  if (layer === 'top') return TOP;
  if (layer !== 'badge') return { layer, badge: null, member: null };
  const [badge, member = null, ...rest] = typeof view.item === 'string' ? view.item.split('@') : [];
  if (!badge || !Object.hasOwn(BADGE_BY_ID, badge) || rest.length || (member !== null && !MEMBER.test(member))) return TOP;
  return { layer, badge, member };
}

/**
 * The view that opens a layer: `shell.setView('play', featuresView('streaks'))` inside the page, or
 * `shell.go('play', featuresView('badge', { badge, member }))` from another one. Every key is set, so no older layer
 * address stays behind. Pass `member` only for another member's badge.
 */
export function featuresView(layer = null, { badge = null, member = null } = {}) {
  const known = FEATURES_LAYERS.includes(layer) && (layer !== 'badge' || (typeof badge === 'string' && Object.hasOwn(BADGE_BY_ID, badge)));
  const item = known && layer === 'badge' ? (member ? `${badge}@${member}` : badge) : undefined;
  return { section: 'features', layer: known ? layer : undefined, item };
}

const unitOf = (streak, n) => (n === 1 ? streak.unit.replace(/s$/, '') : streak.unit);

/** The "Your streaks" tile: the Pick streak's length, "Pick streak · weeks". */
export function streakTile(streak) {
  const n = streak?.current ?? 0;
  return { big: String(n), sub: `${streak.name} · ${unitOf(streak, n)}`, ariaLabel: `${FEATURES_COPY.streaks}: ${streak.name}, ${n} ${unitOf(streak, n)}` };
}

/** One streak's line in its layer: the rule's first sentence and the best, "Weeks you sent both ballots · Best 6". */
export const streakLine = streak => `${STREAK_BY_ID[streak.id].rule.split('. ')[0].replace(/\.$/, '')} · Best ${streak.best}`;

/** The meter's name: "Pick streak, 4 weeks". */
export const streakMeterLabel = streak => `${streak.name}, ${streak.current} ${unitOf(streak, streak.current)}`;

/** The awards tile: what you won in the newest week, or one plain line before the job has run. */
export function awardsTile(recap) {
  if (!recap) return { label: FEATURES_COPY.weekly, big: DASH, sub: 'Posts once the week is final', tone: 'plain', ariaLabel: 'Weekly awards, posted once the week is final' };
  const won = recap.rows.filter(row => row.you);
  const label = FEATURES_COPY.awards(recap.week);
  if (!won.length) return { label, big: '0', sub: 'See who won', tone: 'plain', ariaLabel: `${label}: you won none, see who won` };
  return { label, big: String(won.length), sub: `You won ${won[0].name}`, tone: 'good', ariaLabel: `${label}: you won ${won.map(row => row.name).join(', ')}` };
}

/** The earlier weeks' range: "Week 6", "Weeks 1–7". */
export function earlierRange(history) {
  const weeks = history.map(w => w.week);
  if (!weeks.length) return '';
  const low = Math.min(...weeks), high = Math.max(...weeks);
  return low === high ? `Week ${low}` : `Weeks ${low}${EN_DASH}${high}`;
}

/** The Season winners row's line: "After Week 18" until decided, then your title or how many won. */
export function seasonLine(season) {
  if (!season?.length) return `After Week ${SEASON_FINAL_WEEK}`;
  const mine = season.find(row => row.you);
  return mine ? `You won ${mine.name}` : plural(season.length, 'winner');
}

/**
 * The Play landing's Badges tile (Sean's P1B): how many badges you have earned, then "New: <name>" while a new badge
 * waits to be seen, else "earned". Before the features read answers (or while the server has no features route) it
 * shows a dash and the old row's words, never a sample number.
 */
export function badgesTile({ model, off = false, newest = null }) {
  if (!model) return off ? { big: DASH, sub: 'Coming soon', tone: 'plain', ariaLabel: 'Badges, coming soon' }
    : { big: DASH, sub: 'Your badges, streaks and awards', tone: 'plain', ariaLabel: 'Badges' };
  const n = model.shelf.earned.length;
  return newest ? { big: String(n), sub: `New: ${newest}`, tone: 'good', ariaLabel: `Badges, ${n} earned, new: ${newest}` }
    : { big: String(n), sub: 'earned', tone: 'plain', ariaLabel: `Badges, ${n} earned` };
}
