// M-19 / D-64 (proposed): the JavaScript twin of public.gtl_social_auto_grade
// (supabase/migrations/20261028120000_gtl_social_auto_settle.sql). The database is the writer; this module exists so
// the grading rule is unit-tested in node and pinned against the SQL on PGlite (tests/social-auto-settle*.test.mjs).
// It never reads or writes storage.
import { pacificDate, pacificToUtc } from './nfl-schedule.mjs';

/** 00:00 America/Los_Angeles on the day after the Pacific calendar day of `instant` (ms or ISO). */
export function socialSettleEligibleAt(instant) {
  const ms = typeof instant === 'number' ? instant : Date.parse(instant);
  if (!Number.isFinite(ms)) throw new Error('Invalid game time.');
  const next = new Date(Date.parse(`${pacificDate(ms).date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return pacificToUtc(next, '00:00');
}

const MANUAL = reason => ({ status: 'manual', reason });
/**
 * Grade one shared ticket from the game's D-26 ledger rows (`results`: [{ version, status, home, away, observedAt,
 * source, sourceUrl }], any order) as of `now`. Returns the same shape as the SQL: status settle | waiting | manual.
 */
export function gradeSocialEntry(entry, { kickoff, results = [], now = Date.now() } = {}) {
  if (!entry || !Array.isArray(entry.legs) || !entry.legs.length) return MANUAL('invalid');
  if (entry.kind !== 'single' || entry.legs.length !== 1) return MANUAL(entry.kind === 'parlay' ? 'parlay' : 'invalid');
  const [leg] = entry.legs, gameId = leg.gameId;
  if (!['spread', 'total'].includes(leg.market)) return { ...MANUAL(leg.market === 'prop' ? 'prop' : 'market'), gameId };
  if (typeof leg.line !== 'number' || !Number.isFinite(leg.line) || !(leg.market === 'spread' ? ['home', 'away'] : ['over', 'under']).includes(leg.side)) return { ...MANUAL('invalid'), gameId };
  const kick = Date.parse(kickoff);
  if (!Number.isFinite(kick)) return { ...MANUAL('unknown_game'), gameId };
  const ledger = [...results].sort((a, b) => b.version - a.version), latest = ledger[0];
  if (!latest) return { status: 'waiting', reason: 'no_final', gameId };
  if (latest.status === 'postponed') return { status: 'waiting', reason: 'postponed', gameId };
  const ruled = latest.status === 'cancelled' || ledger.some(row => row.status !== 'final');
  const eligibleAt = socialSettleEligibleAt(ruled ? Math.max(kick, Date.parse(latest.observedAt)) : kick);
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  if (nowMs < Date.parse(eligibleAt)) return { status: 'waiting', reason: 'before_day_end', gameId, eligibleAt };
  const units = typeof entry.stakeUnits === 'number' && entry.stakeUnits > 0 ? entry.stakeUnits : null;
  const odds = typeof entry.odds === 'number' && Math.abs(entry.odds) >= 100 ? entry.odds : null;
  let margin = null, outcome = 'void';
  if (latest.status !== 'cancelled') {
    margin = leg.market === 'spread' ? (leg.side === 'home' ? latest.home - latest.away : latest.away - latest.home) + leg.line
      : (latest.home + latest.away - leg.line) * (leg.side === 'over' ? 1 : -1);
    outcome = margin > 0 ? 'win' : margin < 0 ? 'loss' : 'push';
  }
  const multiplier = odds === null ? null : odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  const netUnits = outcome === 'win' ? (units === null || multiplier === null ? null : Math.round(units * multiplier * 10000) / 10000)
    : outcome === 'loss' ? (units === null ? null : -units) : outcome === 'push' ? (units === null ? null : 0) : null;
  return { status: 'settle', outcome, gameId, market: leg.market, resultStatus: latest.status, home: latest.home ?? null, away: latest.away ?? null,
    margin, netUnits, version: latest.version, source: latest.source ?? null, sourceUrl: latest.sourceUrl ?? null, observedAt: latest.observedAt ?? null, eligibleAt };
}
