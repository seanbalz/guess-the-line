// D-69 "Pick streak grows" (small; the moments table's PICK column): the viewer's Pick streak in a fresh features read
// as one moment. Its id names the season, the streak's length and the season's best, so a longer streak is a new id and
// plays once (the engine never replays an id, and seeds a device's first read); a broken streak (0) is no candidate,
// so a break stays quiet. The streak is the player's own in every league, so the id names no league. Pure.
import { SCOPES } from '../moments/catalog.js';
import { plural } from '../format.js';

/** The Pick streak moment, or null: `{ id, kind: 'streak', scopes: ['features'], title, meta }`; The approved Home has no streak display, so this waits for its Features card. */
export function pickStreakMoment(reply, viewer) {
  if (reply === null || typeof reply !== 'object' || typeof viewer !== 'string' || !viewer || !Number.isInteger(reply.season)) return null;
  const pick = (Array.isArray(reply.streaks) ? reply.streaks : []).find(s => s?.userId === viewer)?.pick;
  const current = pick?.current;
  if (!Number.isInteger(current) || current < 1) return null;
  const best = Number.isInteger(pick.best) && pick.best > current ? pick.best : current;
  return { id: `streak:pick:${reply.season}:${current}:${best}`, kind: 'streak', scopes: [SCOPES.features], title: 'Pick streak', meta: `${plural(current, 'week')} in a row` };
}

/** The streak moments of a features reply (the Pick streak today), reported with its badges and awards. */
export const streakMoments = (reply, viewer) => [pickStreakMoment(reply, viewer)].filter(Boolean);
