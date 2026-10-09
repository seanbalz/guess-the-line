// Synthetic fixtures only. Team names are fictional and quotes are invented test
// inputs; nothing here is a real line or a real player's prediction.
import type { League, Quote, SnapshotFile, WeekFile } from "../src/types.js";

export const G1 = "Fixture Away A @ Fixture Home A";
export const G2 = "Fixture Away B @ Fixture Home B";
export const LOCK = "2026-10-15T17:15:00-07:00";

export const league = (roster: string[]): League => ({
  id: "fixture",
  name: "Fixture League",
  roster,
  staff: { commissioner: roster[0]! },
});

export const week = (revisions: WeekFile["revisions"], lockStatus: "verified" | "unverified" = "verified"): WeekFile => ({
  schema: "gtl.week.v1",
  season: 2026,
  week: 99,
  league: "fixture",
  status: "fixture",
  schedule_source: null,
  lock: { kickoff_at: LOCK, status: lockStatus, source: null },
  games: [
    { matchup: G1, kickoff_at: LOCK },
    { matchup: G2, kickoff_at: "2026-10-18T10:00:00-07:00" },
  ],
  revisions,
});

export const quotes = (market: "spread" | "total", values: number[], at: string): Quote[] =>
  values.map((v, i) => ({
    book: `Book ${i + 1}`,
    market_type: market,
    ...(market === "spread" ? { home_spread: v } : { total: v }),
    quoted_at: at,
  }));

export const snapshot = (id: string, capturedAt: string, games: SnapshotFile["games"]): SnapshotFile => ({
  schema: "gtl.snapshot.v1",
  snapshot_id: id,
  season: 2026,
  week: 99,
  captured_at: capturedAt,
  captured_by: "fixture",
  method: "manual",
  games,
});
