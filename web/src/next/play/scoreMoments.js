// D-69 Your score moments (spec section 4.2): a newly scored Bullseye and a final week are big moments in the score
// scope (Sean's PICK column); a miss stays quiet, so it makes no candidate at all and the seen record stays small. Pure.
// Candidates come only from a fresh history read (scoreReport), never from a request still on its way, and they name
// only your own game, market and points: no line, no guess and nothing of another player (D-31).
import { THRESHOLDS } from '../../../../shared/game-features/catalog.mjs';
import { MODE_LABEL, MODES } from '../../../../shared/guess-board.mjs';
import { show } from '../../communityFormat.js';
import { SCOPES } from '../moments/catalog.js';
import { BADGE_ICONS } from '../features/icons.js';
import { number, ownEntry, scoreRows } from './scoring.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const kickoffAt = game => Date.parse(game?.kickoff ?? '');

/** The engine source for one season's history read: each season seeds silently on this device's first read of it. */
export const scoreSource = data => `score:${Number.isInteger(data?.season) ? data.season : 'latest'}`;

/**
 * True when your week for one market is over: the server clock `now` (ms) is at or after the kickoff of the week's last
 * game, and every game is settled for scoring (scored, or closed because it kicked off without a lock). Scoring happens
 * at lock-in, so a fully scored week can still be unplayed; it is not a final until the last kickoff has passed. Without
 * the server clock a week is never final, and a game with no valid kickoff time never counts as passed. A sit-out, an
 * ineligible ballot, a week with nothing scored, or a locked game still waiting for its line is not final.
 */
export function weekFinal(week, entry, now) {
  if (!Number.isFinite(now) || !entry || entry.eligible === false || entry.status === 'sat_out') return false;
  const rows = scoreRows(week, entry);
  if (!rows.length || !rows.some(row => row.points !== null)) return false;
  const kickoffs = rows.map(row => kickoffAt(row.game));
  if (!kickoffs.every(Number.isFinite) || now < Math.max(...kickoffs)) return false;
  return rows.every(row => row.points !== null || !row.locked);
}

/** Every score moment a history reply holds for `viewer`, with stable ids (the seen record matches them across reads). */
export function scoreMoments(data, viewer) {
  if (!record(data) || typeof viewer !== 'string' || !viewer || !Array.isArray(data.weeks)) return [];
  const now = Date.parse(data.now ?? ''), out = [];
  for (const week of data.weeks) {
    if (!record(week) || !Number.isInteger(week.season) || !Number.isInteger(week.week)) continue;
    for (const mode of MODES) {
      const entry = ownEntry(week, viewer, mode);
      if (!entry || entry.eligible === false) continue;
      const at = `${week.season}:${week.week}:${mode}`, market = MODE_LABEL[mode];
      for (const row of scoreRows(week, entry)) {
        if (row.points !== THRESHOLDS.exactPoints) continue;
        out.push({ id: `score:bullseye:${at}:${row.game.id}`, kind: 'bullseye', scopes: [SCOPES.score], title: 'Bullseye',
          meta: `Week ${week.week} · ${row.game.awayCode} at ${row.game.homeCode} · ${market}`, icon: BADGE_ICONS.bullseye, rarity: 'uncommon' });
      }
      if (weekFinal(week, entry, now)) {
        out.push({ id: `score:weekFinal:${at}`, kind: 'weekFinal', scopes: [SCOPES.score], title: `Week ${week.week} final`,
          meta: `${market} · ${show(number(entry.weekPoints))} points`, icon: BADGE_ICONS.dialed_in, rarity: 'common' });
      }
    }
  }
  return out;
}

/** What one history read reports (rule 1): `{ source, candidates }` from a fresh answer, null while pending or failed. */
export function scoreReport(read) {
  const data = read?.loading || read?.error ? null : read?.data;
  if (!record(data) || typeof data.viewer !== 'string' || !data.viewer) return null;
  return { source: scoreSource(data), candidates: scoreMoments(data, data.viewer) };
}
