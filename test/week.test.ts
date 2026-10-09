import { describe, expect, it } from "vitest";
import { effectivePicks, validateWeek } from "../src/ballot.js";
import { scoreMode } from "../src/week.js";
import { G1, G2, LOCK, league, quotes, snapshot, week } from "./fixtures.js";

const PRE = "2026-10-15T16:00:00-07:00";
const AFTER = "2026-10-16T12:00:00Z";
const trio = league(["Ann", "Ben", "Cal"]);
const snaps = [
  snapshot("s1", PRE, [
    { matchup: G1, quotes: [...quotes("spread", [-3, -3, -3.5], PRE), ...quotes("total", [44.5, 44.5, 44.5], PRE)] },
    { matchup: G2, quotes: [...quotes("spread", [6.5, 7, 7], PRE), ...quotes("total", [41, 41, 41], PRE)] },
  ]),
];
const SAVED = "2026-10-15T16:05:00-07:00";
const rev = (player: string, matchup: string, market: "spread" | "total", value: number, at = SAVED) =>
  market === "spread"
    ? { player, matchup, market_type: market, predicted_home_spread: value, submitted_at: at }
    : { player, matchup, market_type: market, predicted_total: value, submitted_at: at };

describe("ballot revisions and lock", () => {
  it("unlimited revisions before lock; latest counts; late ones rejected", () => {
    const w = week([
      rev("Ann", G1, "total", 40, "2026-10-14T09:00:00-07:00"),
      rev("Ann", G1, "total", 42, "2026-10-15T10:00:00-07:00"),
      rev("Ann", G1, "total", 44, "2026-10-15T17:14:59-07:00"),
      rev("Ann", G1, "total", 60, LOCK),
    ]);
    const b = effectivePicks(w);
    expect(b.picks).toEqual([expect.objectContaining({ value: 44, revision_count: 3 })]);
    expect(b.rejected_late).toHaveLength(1);
  });

  it("acceptance #1: total and spread on the same game are independent", () => {
    const w = week([rev("Ann", G1, "spread", -3), rev("Ann", G1, "total", 44.5), rev("Ann", G1, "spread", -2.5, "2026-10-15T16:10:00-07:00")]);
    const picks = effectivePicks(w).picks;
    expect(picks.find((p) => p.market_type === "total")).toMatchObject({ value: 44.5, revision_count: 1 });
    expect(picks.find((p) => p.market_type === "spread")).toMatchObject({ value: -2.5, revision_count: 2 });
  });

  it("rejects invalid input", () => {
    expect(() => validateWeek(week([rev("Zed", G1, "total", 44)]), trio.roster)).toThrow(/roster/);
    expect(() => validateWeek(week([rev("Ann", "Nope @ Nada", "total", 44)]), trio.roster)).toThrow(/slate/);
    expect(() => validateWeek(week([rev("Ann", G1, "total", 44.3)]), trio.roster)).toThrow(/0.5/);
    expect(() => validateWeek(week([rev("Ann", G1, "total", -1)]), trio.roster)).toThrow(/nonnegative/);
    expect(() => validateWeek(week([rev("Ann", G1, "spread", 2.25)]), trio.roster)).toThrow(/0.5/);
  });
});

describe("week scoring", () => {
  const full = week([
    rev("Ann", G1, "total", 44.5), rev("Ben", G1, "total", 44.5), rev("Cal", G1, "total", 47),
    rev("Ann", G2, "total", 40), rev("Ben", G2, "total", 43), rev("Cal", G2, "total", 41.5),
    rev("Ann", G1, "spread", -3), rev("Ben", G1, "spread", -7), rev("Cal", G1, "spread", -1),
  ]);

  it("acceptance #4/#5: totals out of 10×games with exact-tie W-L-T", () => {
    const r = scoreMode(trio, full, snaps, "total", AFTER);
    expect(r.state).toBe("LOCKED");
    expect(r.max_points).toBe(20);
    const by = Object.fromEntries(r.standings.map((s) => [s.player, s]));
    expect(by.Ann).toMatchObject({ points: 18, wins: 0, losses: 1, ties: 1, exact: 1 });
    expect(by.Ben).toMatchObject({ points: 16, cumulative_error: 2, wins: 0, losses: 1, ties: 1 });
    expect(by.Cal).toMatchObject({ points: 14, cumulative_error: 3, wins: 1, losses: 1, ties: 0 });
    expect(r.games[0]!.closest_status).toBe("final");
  });

  it("spread and total standings never mix", () => {
    const spread = scoreMode(trio, full, snaps, "spread", AFTER);
    expect(spread.standings.find((s) => s.player === "Ann")).toMatchObject({ points: 10, scored_games: 1, not_submitted: 1, wins: 1 });
    expect(spread.games[1]!.closest_status).toBe("pending");
  });

  it("ranks by points, then cumulative error, then exact matches; shares rank on full tie", () => {
    const r = scoreMode(trio, full, snaps, "total", AFTER);
    expect(r.standings.map((s) => [s.player, s.rank])).toEqual([["Ann", 1], ["Ben", 2], ["Cal", 3]]);
    // All on 10 points (floor clipping): Ann err 5 + 1 exact, Cal err 5 + 0 exact, Ben err 10.
    const tied = week([
      rev("Ann", G1, "total", 49.5), rev("Ben", G1, "total", 54.5), rev("Cal", G1, "total", 47),
      rev("Ann", G2, "total", 41), rev("Ben", G2, "total", 41), rev("Cal", G2, "total", 43.5),
    ]);
    const t = scoreMode(trio, tied, snaps, "total", AFTER);
    expect(t.standings.map((s) => [s.player, s.points, s.rank])).toEqual([["Ann", 10, 1], ["Cal", 10, 2], ["Ben", 10, 3]]);
    const same = week(["Ann", "Ben", "Cal"].flatMap((p) => [rev(p, G1, "total", 44), rev(p, G2, "total", 41)]));
    expect(scoreMode(trio, same, snaps, "total", AFTER).standings.map((s) => s.rank)).toEqual([1, 1, 1]);
  });

  it("acceptance #6 (D-16): points anchor to the reference at save; later market moves never rescore", () => {
    const moved = snapshot("s2", "2026-10-15T17:00:00-07:00", [
      { matchup: G1, quotes: quotes("total", [45.5, 45.5, 45.5], "2026-10-15T17:00:00-07:00") },
    ]);
    const before = scoreMode(trio, full, snaps, "total", "2026-10-15T16:30:00-07:00");
    expect(before.state).toBe("PROVISIONAL");
    expect(before.games[0]!.players[0]).toMatchObject({ points: 10, anchored_at: SAVED, reference: { snapshot_id: "s1", value: 44.5 } });
    const after = scoreMode(trio, full, [...snaps, moved], "total", AFTER);
    expect(after.games[0]!.current_consensus).toMatchObject({ value: 45.5, snapshot_id: "s2" });
    expect(after.games[0]!.players[0]).toMatchObject({ points: 10, reference: { snapshot_id: "s1" } });
  });

  it("an edit re-anchors to the newer reference; a same-value save does not", () => {
    const moved = snapshot("s2", "2026-10-15T17:00:00-07:00", [
      { matchup: G1, quotes: quotes("total", [45.5, 45.5, 45.5], "2026-10-15T17:00:00-07:00") },
    ]);
    const w = week([
      rev("Ann", G1, "total", 44.5),
      rev("Ann", G1, "total", 44.5, "2026-10-15T17:05:00-07:00"),
      rev("Ben", G1, "total", 44.5),
      rev("Ben", G1, "total", 45.5, "2026-10-15T17:05:00-07:00"),
    ]);
    const r = scoreMode(league(["Ann", "Ben"]), w, [...snaps, moved], "total", AFTER);
    expect(r.games[0]!.players[0]).toMatchObject({ anchored_at: SAVED, reference: { snapshot_id: "s1" }, points: 10 });
    expect(r.games[0]!.players[1]).toMatchObject({ anchored_at: "2026-10-15T17:05:00-07:00", reference: { snapshot_id: "s2" }, points: 10 });
    expect(r.games[0]!.players.map((p) => p.closest)).toEqual(["T", "T"]);
  });

  it("closest pick compares each player's error against their own reference", () => {
    const moved = snapshot("s2", "2026-10-15T17:00:00-07:00", [
      { matchup: G1, quotes: quotes("total", [48, 48, 48], "2026-10-15T17:00:00-07:00") },
    ]);
    const w = week([rev("Ann", G1, "total", 45.5), rev("Ben", G1, "total", 47, "2026-10-15T17:05:00-07:00")]);
    const r = scoreMode(league(["Ann", "Ben"]), w, [...snaps, moved], "total", AFTER);
    expect(r.games[0]!.players.map((p) => [p.error, p.closest])).toEqual([[1, "T"], [1, "T"]]);
  });

  it("no fresh reference at save leaves the pick unscored, never zero", () => {
    const early = week([rev("Ann", G1, "total", 44.5, "2026-10-14T09:00:00-07:00")]);
    const r = scoreMode(trio, early, snaps, "total", AFTER);
    expect(r.games[0]!.players[0]).toMatchObject({ status: "no_reference", points: null });
    expect(r.standings.find((s) => s.player === "Ann")).toMatchObject({ points: 0, scored_games: 0, no_reference: 1 });
    expect(r.games[0]!.closest_status).toBe("pending");
    const stale = week([rev("Ann", G1, "total", 44.5, "2026-10-15T23:00:00-07:00")], "verified");
    expect(scoreMode(trio, { ...stale, lock: { ...stale.lock, kickoff_at: "2026-10-16T17:15:00-07:00" } }, snaps, "total", "2026-10-17T00:00:00Z").games[0]!.players[0]!.status).toBe("no_reference");
  });

  it("a report as of an earlier time ignores picks saved later", () => {
    const r = scoreMode(trio, full, snaps, "total", "2026-10-15T16:01:00-07:00");
    expect(r.games[0]!.players.every((p) => p.status === "not_submitted")).toBe(true);
  });

  it("unverified lock time keeps the week provisional", () => {
    const r = scoreMode(trio, week(full.revisions, "unverified"), snaps, "total", AFTER);
    expect(r.state).toBe("PROVISIONAL");
  });

  it("works for duel and free-for-all rosters", () => {
    const duel = scoreMode(league(["Ann", "Ben"]), week(full.revisions.filter((r) => r.player !== "Cal")), snaps, "total", AFTER);
    expect(duel.standings.find((s) => s.player === "Ann")).toMatchObject({ wins: 1, ties: 1 });
    const ffa = scoreMode(league(["Ann", "Ben", "Cal", "Dee"]), full, snaps, "total", AFTER);
    expect(ffa.games.every((g) => g.closest_status === "pending")).toBe(true);
    expect(ffa.standings.find((s) => s.player === "Dee")).toMatchObject({ not_submitted: 2, points: 0 });
  });
});
