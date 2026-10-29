// Strict dated EPL standings validation for captured evidence and the guarded M-34 job/resolver path.
// The data record is CC BY-SA 4.0; this validation code retains the repository's code licensing.
import { EPL_CLUB_CODES } from './epl-clubs.mjs';

export const EPL_STANDINGS_CAPTURE_MAX_AGE_MS = 24 * 60 * 60_000;
export const EPL_STANDINGS_DATA_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
export const EPL_STANDINGS_LICENSE = 'https://creativecommons.org/licenses/by-sa/4.0/';
const codes = new Set(EPL_CLUB_CODES);
const fail = reason => ({ status: 'unavailable', reason });
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  ? Date.parse(value) : NaN;
const whole = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;

/** A complete, dated snapshot for an explicit completed round. Never fills missing clubs or renumbers ranks.
 * This validates a service-collected record, not the authenticity of arbitrary client-provided provenance. */
export function eplStandingsPositions(record, { season, completedRound, now } = {}) {
  if (!Number.isInteger(season) || !Number.isInteger(completedRound) || completedRound < 1 || completedRound > 38 || !Number.isFinite(now)) return fail('context_required');
  if (!record || record.season !== season || record.completedRound !== completedRound) return fail('wrong_round');
  const source = record.source;
  const title = `${season}–${String(season + 1).slice(-2)} Premier League`;
  const captured = instant(record.capturedAt), revision = instant(source?.revisionAt);
  const day = typeof record.dataAsOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.dataAsOf) ? Date.parse(`${record.dataAsOf}T00:00:00Z`) : NaN;
  if (!Number.isFinite(captured) || !Number.isFinite(revision) || !Number.isFinite(day)
    || new Date(day).toISOString().slice(0, 10) !== record.dataAsOf || day > captured || revision > captured || captured > now
    || day < Date.UTC(season, 6, 1) || day >= Date.UTC(season + 1, 6, 1)) return fail('invalid_time');
  if (now - captured > EPL_STANDINGS_CAPTURE_MAX_AGE_MS || now - day > EPL_STANDINGS_DATA_MAX_AGE_MS) return fail('stale');
  if (source?.kind !== 'wikimedia-community' || source.official !== false || source.title !== title
    || !Number.isSafeInteger(source.revision) || source.revision < 1
    || source.url !== `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&oldid=${source.revision}`
    || !/^[a-f0-9]{64}$/.test(source.responseSha256 ?? '') || source.normalizer !== 'gtl-epl-wikimedia-v1'
    || record.license?.id !== 'CC-BY-SA-4.0' || record.license.url !== EPL_STANDINGS_LICENSE
    || typeof record.license.attribution !== 'string' || !record.license.attribution.includes('Wikipedia contributors')
    || typeof record.license.changes !== 'string' || !record.license.changes.trim()) return fail('provenance_required');
  const rows = record.rows;
  if (!Array.isArray(rows) || rows.length !== codes.size) return fail('incomplete');
  const seenClubs = new Set(), seenRanks = new Set();
  let goalsFor = 0, goalsAgainst = 0, wins = 0, losses = 0, draws = 0;
  for (const row of rows) {
    if (!row || !codes.has(row.club) || seenClubs.has(row.club) || !Number.isInteger(row.position)
      || row.position < 1 || row.position > codes.size || seenRanks.has(row.position)) return fail('invalid_clubs_or_ranks');
    seenClubs.add(row.club); seenRanks.add(row.position);
    if (row.played !== completedRound || !whole(row.won, 38) || !whole(row.drawn, 38) || !whole(row.lost, 38)
      || row.won + row.drawn + row.lost !== row.played || row.points !== 3 * row.won + row.drawn
      || !whole(row.goalsFor, 1000) || !whole(row.goalsAgainst, 1000) || row.goalDifference !== row.goalsFor - row.goalsAgainst) return fail('inconsistent');
    goalsFor += row.goalsFor; goalsAgainst += row.goalsAgainst; wins += row.won; losses += row.lost; draws += row.drawn;
  }
  if (goalsFor !== goalsAgainst || wins !== losses || draws % 2 !== 0 || record.matches !== codes.size * completedRound / 2) return fail('inconsistent');
  const ranked = [...rows].sort((a, b) => a.position - b.position);
  for (let i = 1; i < ranked.length; i++) {
    const a = ranked[i - 1], b = ranked[i];
    if (b.points > a.points || (b.points === a.points && (b.goalDifference > a.goalDifference
      || (b.goalDifference === a.goalDifference && b.goalsFor > a.goalsFor)))) return fail('inconsistent_order');
    if (b.points === a.points && b.goalDifference === a.goalDifference && b.goalsFor === a.goalsFor) return fail('ambiguous_order');
  }
  return { status: 'ready', positions: Object.fromEntries(ranked.map(row => [row.club, row.position])) };
}
