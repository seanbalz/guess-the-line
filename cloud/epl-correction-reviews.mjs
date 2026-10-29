// Commissioner-only fixed-field read behind cloud/epl.mjs's existing admin guard. No writes or raw roster replies.
import { MANAGER_NAMES } from '../shared/epl-sleeper.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const round = value => Math.round(value * 100) / 100;
const id = value => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Invalid correction source.');
  const text = String(value);
  if (!/^[1-9][0-9]{0,18}$/.test(text) || BigInt(text) > 9223372036854775807n) throw new Error('Invalid correction source.');
  return text;
};

function total(settings, wholeKey, decimalKey) {
  const whole = settings?.[wholeKey], decimal = settings?.[decimalKey] ?? 0;
  const value = finite(whole) && finite(decimal) ? round(whole + decimal / 100) : NaN;
  return Number.isFinite(value) ? value : null;
}
function totals(rosters, ownerId) {
  const own = Array.isArray(rosters) ? rosters.filter(r => record(r) && r.owner_id === ownerId) : [];
  const settings = own.length === 1 && record(own[0].settings) ? own[0].settings : null;
  return { points: total(settings, 'fpts', 'fpts_decimal'), against: total(settings, 'fpts_against', 'fpts_against_decimal') };
}
const source = row => ({
  label: typeof row?.label === 'string' && /^[a-z0-9-]{1,64}$/.test(row.label) ? row.label : null,
  capturedAt: typeof row?.captured_at === 'string' && Number.isFinite(Date.parse(row.captured_at)) ? row.captured_at : null,
  rosterHash: typeof row?.sha256?.rosters === 'string' && /^[a-f0-9]{64}$/.test(row.sha256.rosters) ? row.sha256.rosters : null,
});
const delta = (before, after) => before === null || after === null ? null : round(after - before);

export async function readEplCorrectionReviews({ rows, season }) {
  const audit = await rows('gtl_epl_stat_rechecks', {
    select: 'season,week,checked_at,original_snapshot_id,recheck_snapshot_id', season: `eq.${season}`,
    status: 'eq.needs_review', order: 'week.desc', limit: '38',
  }, 38);
  if (!Array.isArray(audit) || audit.length > 38 || audit.some(row => !record(row) || row.season !== season || !Number.isInteger(row.week) || row.week < 1 || row.week > 37))
    throw new Error('Invalid correction reply.');
  if (!audit.length) return [];
  const ids = [...new Set(audit.flatMap(row => [id(row.original_snapshot_id), id(row.recheck_snapshot_id)]))];
  const weeks = [...new Set(audit.map(row => row.week + 1))];
  const [snapshots, picks] = await Promise.all([
    rows('gtl_epl_snapshots', { select: 'id,label,captured_at,sha256,rosters:payload->rosters', id: `in.(${ids.join(',')})`, limit: String(ids.length) }, ids.length),
    rows('gtl_epl_picks', { select: 'week', season: `eq.${season}`, week: `in.(${weeks.join(',')})`, limit: '304' }, 304),
  ]);
  if (!Array.isArray(snapshots) || snapshots.length > ids.length || !Array.isArray(picks) || picks.length > 304) throw new Error('Invalid correction reply.');
  const byId = new Map(snapshots.map(row => [id(row.id), row]));
  if (byId.size !== snapshots.length || [...byId.keys()].some(key => !ids.includes(key))
    || picks.some(pick => !record(pick) || !weeks.includes(pick.week)) || weeks.some(week => picks.filter(pick => pick.week === week).length > 8))
    throw new Error('Invalid correction reply.');
  return audit.map(row => {
    const original = byId.get(id(row.original_snapshot_id)), corrected = byId.get(id(row.recheck_snapshot_id));
    const changes = Object.entries(MANAGER_NAMES).map(([owner, name]) => {
      const before = totals(original?.rosters, owner), after = totals(corrected?.rosters, owner);
      return { name, before, after, pointsChange: delta(before.points, after.points), againstChange: delta(before.against, after.against) };
    }).filter(change => change.pointsChange !== 0 || change.againstChange !== 0);
    return { week: row.week, checkedAt: Number.isFinite(Date.parse(row.checked_at)) ? row.checked_at : null,
      original: source(original), corrected: source(corrected), changes,
      nextWeek: row.week + 1, nextPickCount: picks.filter(pick => pick.week === row.week + 1).length,
      totalsComplete: changes.every(change => change.pointsChange !== null && change.againstChange !== null) };
  });
}
