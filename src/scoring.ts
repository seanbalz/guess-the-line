import type { PickRevision } from "./types.js";

export type Outcome = "W" | "L" | "T";

const round = (x: number): number => Math.round(x * 1e6) / 1e6;

export function parseMatchup(matchup: string): { away: string; home: string } {
  const parts = matchup.split(" @ ");
  if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim()) {
    throw new Error(`Matchup must be "Away @ Home": ${matchup}`);
  }
  return { away: parts[0].trim(), home: parts[1].trim() };
}

export function isHalfPoint(x: number): boolean {
  return Number.isFinite(x) && Number.isInteger(x * 2);
}

/** Normalize a spread prediction to the home-team reference used by benchmarks. */
export function toHomeSpread(rev: Pick<PickRevision, "matchup" | "predicted_home_spread" | "favorite" | "spread">): number {
  if (rev.predicted_home_spread !== undefined) return rev.predicted_home_spread;
  if (rev.favorite === undefined || rev.spread === undefined) {
    throw new Error(`Spread pick needs predicted_home_spread or favorite + spread: ${rev.matchup}`);
  }
  if (rev.spread > 0) throw new Error(`Favorite spread must be 0 or negative: ${rev.matchup} ${rev.spread}`);
  const { away, home } = parseMatchup(rev.matchup);
  if (rev.favorite === home) return rev.spread;
  if (rev.favorite === away) return rev.spread === 0 ? 0 : -rev.spread;
  throw new Error(`Favorite "${rev.favorite}" is not in matchup ${rev.matchup}`);
}

/** 10 points exact; minus 1 per half-point of absolute error; floor 0. Same rule for spreads and totals. */
export function accuracyPoints(predicted: number, benchmark: number): number {
  return round(Math.max(0, 10 - 2 * Math.abs(predicted - benchmark)));
}

export function absError(predicted: number, benchmark: number): number {
  return round(Math.abs(predicted - benchmark));
}

/**
 * Closest-to-line result for one matchup. Smallest error wins; tied smallest errors
 * are ties for those players and losses for everyone farther away.
 */
export function closestPick(errors: Map<string, number>): Map<string, Outcome> {
  const best = Math.min(...errors.values());
  const leaders = [...errors].filter(([, e]) => e === best).map(([p]) => p);
  const result = new Map<string, Outcome>();
  for (const player of errors.keys()) {
    if (!leaders.includes(player)) result.set(player, "L");
    else result.set(player, leaders.length === 1 ? "W" : "T");
  }
  return result;
}
