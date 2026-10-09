import { effectivePicks, pickKey, validateWeek } from "./ballot.js";
import { selectBenchmark, type Benchmark, type GateOptions, DEFAULT_GATE } from "./benchmark.js";
import { absError, accuracyPoints, closestPick, type Outcome } from "./scoring.js";
import type { League, MarketType, PickRevision, SnapshotFile, WeekFile } from "./types.js";

export type PickStatus = "scored" | "not_submitted" | "awaiting_benchmark";

export interface PlayerGameResult {
  player: string;
  status: PickStatus;
  predicted: number | null;
  error: number | null;
  points: number | null;
  closest: Outcome | null;
}

export interface GameResult {
  matchup: string;
  benchmark: Benchmark;
  /** Closest-pick results exist only once every roster player has a pick and the benchmark is verified. */
  closest_status: "final" | "provisional" | "pending";
  players: PlayerGameResult[];
}

export interface Standing {
  player: string;
  points: number;
  scored_games: number;
  not_submitted: number;
  cumulative_error: number;
  exact: number;
  wins: number;
  losses: number;
  ties: number;
  rank: number;
}

export interface ModeResult {
  market_type: MarketType;
  state: "LOCKED" | "PROVISIONAL";
  max_points: number;
  games: GameResult[];
  standings: Standing[];
  rejected_late: PickRevision[];
}

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 1e6) / 1e6;

/**
 * Score one Guess mode (spread or total) for a week. Spread and total are fully
 * independent: separate picks, benchmarks, points out of 10 × games, and W-L-T.
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
  const lockAt = week.lock.kickoff_at;
  const locked = lockAt !== null && week.lock.status === "verified" && Date.parse(asOf) >= Date.parse(lockAt);
  const ballot = effectivePicks(week);
  const byKey = new Map(ballot.picks.filter((p) => p.market_type === market).map((p) => [pickKey(p.player, p.matchup, market), p]));

  const games: GameResult[] = week.games.map(({ matchup }) => {
    const benchmark = selectBenchmark(snapshots, matchup, market, asOf, lockAt, gate);
    const players: PlayerGameResult[] = league.roster.map((player) => {
      const pick = byKey.get(pickKey(player, matchup, market));
      if (!pick) return { player, status: "not_submitted", predicted: null, error: null, points: null, closest: null };
      if (benchmark.value === null) return { player, status: "awaiting_benchmark", predicted: pick.value, error: null, points: null, closest: null };
      return {
        player,
        status: "scored",
        predicted: pick.value,
        error: absError(pick.value, benchmark.value),
        points: accuracyPoints(pick.value, benchmark.value),
        closest: null,
      };
    });
    const allScored = players.every((p) => p.status === "scored");
    if (allScored) {
      const outcomes = closestPick(new Map(players.map((p) => [p.player, p.error!])));
      players.forEach((p) => (p.closest = outcomes.get(p.player)!));
    }
    return { matchup, benchmark, closest_status: allScored ? (locked ? "final" : "provisional") : "pending", players };
  });

  const standings: Standing[] = league.roster.map((player) => {
    const rows = games.map((g) => g.players.find((p) => p.player === player)!);
    const scored = rows.filter((r) => r.status === "scored");
    return {
      player,
      points: sum(scored.map((r) => r.points!)),
      scored_games: scored.length,
      not_submitted: rows.filter((r) => r.status === "not_submitted").length,
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
