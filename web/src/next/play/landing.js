// D-69 step 1, the Play landing (Sean's P1B, November 3, 2026) as plain data: the first card (the ballot to do next,
// "Week N locked in" once nothing is left to lock, or the latest result when no week is open), the other ballot's tile
// and the Whole week locked moment. Pure: it reads only the shared /community/read reply, through homeHero and
// heroProgress (shared/home-view.mjs) and nextGuess.js, so the landing makes no read of its own. The server's
// `picksDue` and `due` rows decide every state, never the device clock.
import { HOME_COPY, heroProgress, homeHero } from '../../../../shared/home-view.mjs';
import { SCOPES } from '../moments/catalog.js';
import { fmtWhen } from '../format.js';
import { weekLockedId } from './moments.js';
import { nextGuess } from './nextGuess.js';

export const MARKET_NAME = Object.freeze({ spread: 'Guess the Spread', total: 'Guess the Total' });
const MODE = Object.freeze({ spread: 'guess_spread', total: 'guess_total' });
const dueRow = (community, mode) => (Array.isArray(community?.due) ? community.due : []).find(d => d?.mode === mode);

/** 'spread' or 'total', for a mode id or a market. */
export const marketOf = value => (value === 'guess_total' || value === 'total' ? 'total' : 'spread');
export const otherMarket = market => (market === 'total' ? 'spread' : 'total');

/**
 * One market's week: heroProgress's `{ mode, label, done, of, state }` (state 'locked' per game, else 'sent', 'satOut'
 * or 'draft') plus `satOut` from its due row, since a per-game sit-out keeps its locked count. Null without a week.
 */
export function ballotProgress(community, market) {
  const mode = MODE[market];
  const row = heroProgress({ community }).find(r => r.mode === mode);
  return row ? { ...row, satOut: row.state === 'satOut' || dueRow(community, mode)?.satOut === true } : null;
}

/** Every game of the market is locked in. Per-game rules only; a sit-out never is. */
export const allLocked = row => Boolean(row) && row.state === 'locked' && !row.satOut && row.of > 0 && row.done >= row.of;

const counted = row => `${row.done} of ${row.of} ${row.state === 'draft' ? 'picked' : 'locked'}`;

/** "first kickoff Thu 5:15 PM PT" while the week's first game is ahead, else that market's next open kickoff. */
function kickoffWords(community, hero, mode) {
  const next = dueRow(community, mode)?.nextKickoff;
  const target = hero.perGame && typeof next === 'string' ? next : hero.deadline;
  const at = Date.parse(target ?? ''), first = Date.parse(hero.deadline ?? '');
  if (!Number.isFinite(at)) return null;
  return `${Number.isFinite(first) && at <= first ? 'first' : 'next'} kickoff ${fmtWhen(target)}`;
}

/**
 * The first card: `{ kind, week, eyebrow, title, market, progress, line, action, target }`.
 * - 'next': a ballot is open (homeHero's lime action): the ballot nextGuess names, its week counted, its kickoff.
 * - 'done': nothing is left to lock or submit: "Week N locked in" and a review of the first market not sat out.
 * - 'results': no week is open (none, not open yet, closed): the latest result, as "Your week, at a glance" was.
 * `progress` feeds the week meter (null draws none); `target` is where the one lime button goes.
 */
export function playHero(community) {
  const hero = homeHero({ community });
  const week = hero.week;
  if (hero.action.primary) {
    const market = nextGuess(community), row = ballotProgress(community, market);
    const shown = row && row.of > 0 && row.state !== 'sent' ? row : null;
    return { kind: 'next', week, eyebrow: 'Your next move', title: MARKET_NAME[market], market, progress: shown,
      line: [shown ? counted(shown) : null, kickoffWords(community, hero, MODE[market])].filter(Boolean).join(' · '),
      action: 'Make picks', target: { section: 'picks', market } };
  }
  if (hero.state === 'done') {
    const rows = ['spread', 'total'].map(m => ballotProgress(community, m)).filter(Boolean);
    const review = rows.find(r => !r.satOut) ?? null;
    const market = review ? marketOf(review.mode) : 'spread';
    const line = rows.length && rows.every(allLocked) ? `${rows.map(r => r.label).join(' and ')}, all ${rows.reduce((sum, r) => sum + r.of, 0)} locked`
      : rows.map(r => `${r.label} ${r.satOut ? 'sat out' : r.state === 'sent' ? 'sent' : counted(r)}`).join(' · ');
    return { kind: 'done', week, eyebrow: 'This week', title: review ? `Week ${week} locked in` : `Week ${week} sat out`, market,
      progress: review && review.of > 0 ? review : null, line, action: 'Review your guesses', target: { section: 'picks', market } };
  }
  return { kind: 'results', week, eyebrow: 'Your results', title: 'Your week, at a glance', market: nextGuess(community), progress: null,
    line: hero.state === 'none' ? 'No week is open yet. Your past results are still here.'
      : hero.state === 'not_open' ? HOME_COPY.notOpen : 'Review your guesses and their saved scoring lines.',
    action: 'View your results', target: { section: 'score' } };
}

/** The other ballot's tile (P1B): its name, "5 / 14" and one word. With no week or no read, "—", never a made-up zero. */
export function ballotTile(community, market) {
  const name = MARKET_NAME[market], row = community ? ballotProgress(community, market) : null;
  if (!row || !(row.of > 0)) return { label: name, big: '—', sub: 'Open your guesses', tone: 'plain', ariaLabel: `${name}, open your guesses` };
  const big = `${row.done} / ${row.of}`;
  if (row.satOut) return { label: name, big, sub: 'Sat out', tone: 'plain', ariaLabel: `${name}, sat out this week` };
  if (row.state === 'sent') return { label: name, big, sub: 'Submitted', tone: 'good', ariaLabel: `${name}, submitted` };
  if (row.state === 'draft') return { label: name, big, sub: 'picked', tone: 'plain', ariaLabel: `${name}, ${row.done} of ${row.of} picked` };
  const all = allLocked(row);
  return { label: name, big, sub: all ? 'All locked' : 'locked', tone: all ? 'good' : 'plain',
    ariaLabel: all ? `${name}, all ${row.of} locked` : `${name}, ${row.done} of ${row.of} locked` };
}

/** The one source the detector reports under, so a week locked on another device still plays here once. */
export const WEEK_LOCKED_SOURCE = 'community:weekLocked';

/**
 * Whole week locked (D-69 moments table, small): one candidate per market whose week reads N of N locked in this
 * Community read (per-game rules only). A market that closed with a game unlocked, or was sat out, has none: it stays
 * quiet. It plays on the picks card and on the landing (SCOPES.picks, SCOPES.play).
 */
export function weekLockedMoments(community) {
  const week = community?.week;
  if (!Number.isInteger(week?.season) || !Number.isInteger(week?.week)) return [];
  return ['spread', 'total'].map(m => ballotProgress(community, m)).filter(allLocked).map(row => ({
    id: weekLockedId(week.season, week.week, row.mode), kind: 'weekLocked', scopes: [SCOPES.picks, SCOPES.play],
    title: `Week ${week.week} ${row.label} locked`, meta: `${row.of} of ${row.of} locked`, icon: 'lock',
  }));
}
