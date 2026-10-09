import { effectivePicks, pickKey, validateWeek } from "./ballot.js";
import { selectBenchmark, type Benchmark, type GateOptions, DEFAULT_GATE } from "./benchmark.js";
import { absError, accuracyPoints, closestPick, type Outcome } from "./scoring.js";
import type { League, MarketType, PickRevision, SnapshotFile, WeekFile } from "./types.js";

/**
 * not_submitted: no pick before the deadline.
 * no_reference: no fresh verified consensus existed when the pick was saved (D-16/D-17); never a zero.
 */
export type PickStatus = "scored" | "not_submitted" | "no_reference";

export interface PlayerGameResult {
  player: string;
  status: PickStatus;
  predicted: number | null;
  /** When the current value was saved; the scoring reference is anchored here. */
  anchored_at: string | null;
  reference: Benchmark | null;
  error: number | null;
  points: number | null;
  closest: Outcome | null;
}

export interface GameResult {
  matchup: string;
  /** Latest consensus as of the report time. Display only: it never rescores anchored picks. */
  current_consensus: Benchmark;
  /** Closest-pick results exist only once every roster player has a scored pick. */
  closest_status: "final" | "provisional" | "pending";
  players: PlayerGameResult[];
}

export interface Standing {
  player: string;
  points: number;
  scored_games: number;
  not_submitted: number;
  no_reference: number;
  cumulative_error: number;
  exact: number;
  wins: number;
  losses: number;
  ties: number;
  rank: number;
}

export interface ModeResult {
  market_type: MarketType;
  /** LOCKED once the verified submission deadline has passed; picks can no longer change. */
  state: "LOCKED" | "PROVISIONAL";
  max_points: number;
  games: GameResult[];
  standings: Standing[];
  rejected_late: PickRevision[];
}

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 1e6) / 1e6;

/**
 * Score one Guess mode (spread or total) for a week under D-16 submission-time scoring:
 * each pick is scored against the verified consensus that was fresh when its current
 * value was saved. Spread and total are fully independent.
 */
export function scoreMode(
  league: League,
  week: WeekFile,
  snapshots: SnapshotFile[],
  market: MarketType,
  asOf: string,
  gate: GateOptions = DEFAULT_GATE,
): ModeResult {
  validateWeek(week, league.roster);
  const deadline = week.lock.kickoff_at;
  const locked = deadline !== null && week.lock.status === "verified" && Date.parse(asOf) >= Date.parse(deadline);
  const ballot = effectivePicks(week);
  // A report as of an earlier moment only sees picks saved by then.
  const visible = ballot.picks.filter((p) => p.market_type === market && Date.parse(p.submitted_at) <= Date.parse(asOf));
  const byKey = new Map(visible.map((p) => [pickKey(p.player, p.matchup, market), p]));

  const games: GameResult[] = week.games.map(({ matchup }) => {
    const players: PlayerGameResult[] = league.roster.map((player) => {
      const pick = byKey.get(pickKey(player, matchup, market));
      if (!pick) {
        return { player, status: "not_submitted", predicted: null, anchored_at: null, reference: null, error: null, points: null, closest: null };
      }
      const reference = selectBenchmark(snapshots, matchup, market, pick.anchored_at, null, gate);
      const base = { player, predicted: pick.value, anchored_at: pick.anchored_at, reference, closest: null };
      if (reference.value === null || reference.stale) {
        return { ...base, status: "no_reference", error: null, points: null };
      }
      return {
        ...base,
        status: "scored",
        error: absError(pick.value, reference.value),
        points: accuracyPoints(pick.value, reference.value),
      };
    });
    const allScored = players.every((p) => p.status === "scored");
    if (allScored) {
      const outcomes = closestPick(new Map(players.map((p) => [p.player, p.error!])));
      players.forEach((p) => (p.closest = outcomes.get(p.player)!));
    }
    return {
      matchup,
      current_consensus: selectBenchmark(snapshots, matchup, market, asOf, null, gate),
      closest_status: allScored ? (locked ? "final" : "provisional") : "pending",
      players,
    };
  });

  const standings: Standing[] = league.roster.map((player) => {
    const rows = games.map((g) => g.players.find((p) => p.player === player)!);
    const scored = rows.filter((r) => r.status === "scored");
    return {
      player,
      points: sum(scored.map((r) => r.points!)),
      scored_games: scored.length,
      not_submitted: rows.filter((r) => r.status === "not_submitted").length,
      no_reference: rows.filter((r) => r.status === "no_reference").length,
      cumulative_error: sum(scored.map((r) => r.error!)),
      exact: scored.filter((r) => r.error === 0).length,
      wins: rows.filter((r) => r.closest === "W").length,
      losses: rows.filter((r) => r.closest === "L").length,
      ties: rows.filter((r) => r.closest === "T").length,
      rank: 0,
    };
  });
  // Weekly ranking: points, then lower cumulative error, then more exact matches.
  const cmp = (a: Standing, b: Standing) => b.points - a.points || a.cumulative_error - b.cumulative_error || b.exact - a.exact;
  standings.sort(cmp);
  standings.forEach((s, i) => (s.rank = i > 0 && cmp(standings[i - 1]!, s) === 0 ? standings[i - 1]!.rank : i + 1));

  return {
    market_type: market,
    state: locked ? "LOCKED" : "PROVISIONAL",
    max_points: 10 * week.games.length,
    games,
    standings,
    rejected_late: ballot.rejected_late.filter((r) => r.market_type === market),
  };
}
