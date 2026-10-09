import { isHalfPoint, parseMatchup, toHomeSpread } from "./scoring.js";
import type { MarketType, PickRevision, WeekFile } from "./types.js";

export interface EffectivePick {
  player: string;
  matchup: string;
  market_type: MarketType;
  /** Home-referenced spread or total, depending on market. */
  value: number;
  submitted_at: string;
  /**
   * D-16: when the current value was first saved. A revision that repeats the
   * same value is a no-op and cannot refresh the scoring reference.
   */
  anchored_at: string;
  revision_count: number;
}

export interface BallotResult {
  picks: EffectivePick[];
  /** Revisions submitted at or after the lock; kept for audit, never scored. */
  rejected_late: PickRevision[];
}

export const pickKey = (player: string, matchup: string, market: MarketType) => `${player}\u0000${matchup}\u0000${market}`;

/** Throw on any revision that cannot be a valid prediction for this week and roster. */
export function validateWeek(week: WeekFile, roster: string[]): void {
  const matchups = new Set(week.games.map((g) => g.matchup));
  week.games.forEach((g) => parseMatchup(g.matchup));
  if (matchups.size !== week.games.length) throw new Error("Duplicate matchup in games");
  for (const r of week.revisions) {
    const where = `${r.player} / ${r.matchup} / ${r.market_type}`;
    if (!roster.includes(r.player)) throw new Error(`Not on roster: ${where}`);
    if (!matchups.has(r.matchup)) throw new Error(`Matchup not on this week's verified slate: ${where}`);
    if (Number.isNaN(Date.parse(r.submitted_at))) throw new Error(`Invalid submitted_at: ${where}`);
    if (r.market_type === "spread") {
      if (r.predicted_total !== undefined) throw new Error(`Spread revision carries a total: ${where}`);
      if (!isHalfPoint(toHomeSpread(r))) throw new Error(`Spread must be in 0.5 increments: ${where}`);
    } else if (r.market_type === "total") {
      const t = r.predicted_total;
      if (t === undefined || !isHalfPoint(t) || t < 0) throw new Error(`Total must be a nonnegative 0.5 increment: ${where}`);
      if (r.predicted_home_spread !== undefined || r.spread !== undefined) throw new Error(`Total revision carries a spread: ${where}`);
    } else {
      throw new Error(`Unknown market_type: ${where}`);
    }
  }
}

/**
 * Unlimited revisions are allowed until the submission deadline (actual TNF kickoff).
 * The latest revision submitted strictly before the deadline is effective; later ones
 * are rejected and kept for audit.
 */
export function effectivePicks(week: WeekFile): BallotResult {
  const lockAt = week.lock.kickoff_at ? Date.parse(week.lock.kickoff_at) : Infinity;
  const byKey = new Map<string, { rev: PickRevision; value: number; anchored_at: string; count: number }>();
  const rejected_late: PickRevision[] = [];
  const ordered = [...week.revisions].sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at));
  for (const rev of ordered) {
    if (Date.parse(rev.submitted_at) >= lockAt) {
      rejected_late.push(rev);
      continue;
    }
    const key = pickKey(rev.player, rev.matchup, rev.market_type);
    const value = rev.market_type === "spread" ? toHomeSpread(rev) : rev.predicted_total!;
    const prev = byKey.get(key);
    const anchored_at = prev && prev.value === value ? prev.anchored_at : rev.submitted_at;
    byKey.set(key, { rev, value, anchored_at, count: (prev?.count ?? 0) + 1 });
  }
  const picks = [...byKey.values()].map(({ rev, value, anchored_at, count }) => ({
    player: rev.player,
    matchup: rev.matchup,
    market_type: rev.market_type,
    value,
    submitted_at: rev.submitted_at,
    anchored_at,
    revision_count: count,
  }));
  return { picks, rejected_late };
}
