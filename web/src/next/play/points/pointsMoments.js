// D-69 "Guess the Points exact" (big): a scored slot whose locked guess is its actual. Pure: built only from a fresh
// /points/read reply (PointsBallot.jsx reports usePointsRead's data, never a save still pending), so a moment plays only
// on confirmed data. A miss, a draft, an unlocked or a void slot gives nothing: a loss stays quiet.
import { SCOPES } from '../../moments/catalog.js';
import { BADGE_ICONS } from '../../features/icons.js';
import { SEP } from '../../format.js';
import { isExact, pts } from './pointsModel.js';

/** The moments engine's source for one Points read: the Community's on Play, a group's on its board. */
export const pointsSource = groupId => `points:${groupId ?? 'community'}`;

/** `[{ id, kind: 'pointsExact', scopes: ['points'], title, meta, icon, rarity }]`, one per exact slot of the read's week. */
export function pointsMoments(read) {
  if (read?.status !== 'open' || !Number.isInteger(read.season) || !Number.isInteger(read.week) || !Array.isArray(read.slots)) return [];
  return read.slots.filter(isExact).map(slot => ({
    id: `points-exact:${read.season}:${read.week}:${slot.slot}`, kind: 'pointsExact', scopes: [SCOPES.points],
    title: 'Exact guess', meta: `Week ${read.week}${SEP}${slot.slot}${SEP}${slot.name}${SEP}${pts(slot.actual)} ${slot.actual === 1 ? 'point' : 'points'}`,
    icon: BADGE_ICONS.bullseye, rarity: 'rare',
  }));
}
