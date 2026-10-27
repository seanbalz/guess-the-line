// Home's next action in words (design lane, hierarchy pass): the hero's one headline and the line under it, from the
// same normalized /community/read reply and shared hero (shared/home-view.mjs) the rest of Home reads. Pure: no React,
// storage, network or clock of its own; every count and time comes from the server's reply.
//
// - Picks due: "Lock in 9 games" over "before Thu 5:15 PM PT" (the week's deadline), or with per-game lock-in "Next
//   kickoff Sun 10:00 AM PT", since each game then locks at its own kickoff.
// - The count is the games still to lock in the market with the most left: a per-game market's `openGames` (open and
//   not yet locked by you), a whole-market ballot's games until it is sent or sat out.
// - After the deadline, done, before the week opens and with no week: one plain headline and no count.
// "N games live" is not drawn: the Community read carries no per-game status and there is no approved live source
// (rule of restraint 8), so Home never claims a game is in progress.
import { MODES } from '../../../../shared/guess-board.mjs';
import { HOME_COPY } from '../../../../shared/home-view.mjs';
import { fmtWhen, plural } from '../format.js';

// The week number sits on the line above the headline, so no headline repeats it.
export const HERO_COPY = Object.freeze({
  lockIn: n => `Lock in ${plural(n, 'game')}`,
  before: when => `before ${when}`,
  nextKickoff: when => `Next kickoff ${when}`,
  allIn: HOME_COPY.done,
  locked: HOME_COPY.closed,
  opensSoon: 'Picks open soon',
  dueSoon: 'Due soon',
  streak: n => `${n}-week pick streak`,
});

/** Games still to lock in across the week's markets (the market with the most left), from the server's `due` rows. */
export function gamesToLock(community) {
  const due = Array.isArray(community?.due) ? community.due : [];
  const week = community?.week;
  const games = Array.isArray(week?.games) ? week.games.length : Number(week?.games) || 0;
  const perGame = community?.rules?.perGameScoring === true;
  const left = MODES.map(mode => {
    const row = due.find(d => d?.mode === mode);
    if (!row) return games;
    if (perGame && Number.isInteger(row.locked)) return Number.isInteger(row.openGames) && row.openGames > 0 ? row.openGames : 0;
    if (row.submitted === true || row.satOut === true) return 0;
    return Number(row.games) || games;
  });
  return Math.max(0, ...left);
}

/** `{ title, sub }` for the hero: the one headline and the line under it (null when there is none). */
export function heroHeadline({ hero, community }) {
  const week = hero?.week ?? null;
  if (hero?.state === 'none' || week === null) return { title: HOME_COPY.noWeek, sub: null };
  if (hero.action?.primary) {
    const n = gamesToLock(community);
    if (n === 0) return { title: HERO_COPY.allIn, sub: null };
    const when = hero.countdownTarget ? fmtWhen(hero.countdownTarget) : null;
    return { title: HERO_COPY.lockIn(n), sub: when ? (hero.perGame ? HERO_COPY.nextKickoff(when) : HERO_COPY.before(when)) : null };
  }
  if (hero.state === 'done') return { title: HERO_COPY.allIn, sub: null };
  if (hero.state === 'not_open') return { title: HERO_COPY.opensSoon, sub: null };
  return { title: HERO_COPY.locked, sub: null };
}
