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
 * True when every game of your week for one market is settled for scoring: each is scored, or can no longer be (it was
 * not locked when it kicked off). A sit-out, an ineligible ballot, a week with nothing scored, or a locked game still
 * waiting for its line is not final. `now` is the server's clock in ms; without it only a fully scored week is final.
 */
export function weekFinal(week, entry, now) {
  if (!entry || entry.eligible === false || entry.status === 'sat_out') return false;
  const rows = scoreRows(week, entry);
  if (!rows.length || !rows.some(row => row.points !== null)) return false;
  return rows.every(row => row.points !== null || (!row.locked && Number.isFinite(now) && now >= kickoffAt(row.game)));
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
