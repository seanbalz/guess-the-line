import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accuracyPoints, toHomeSpread } from "../src/scoring.js";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url));

describe("Week 5 historical data (acceptance #8)", () => {
  it("spread picks file is byte-for-byte unchanged", () => {
    const sha = createHash("sha256").update(read("data/picks/2026-week-05.json")).digest("hex");
    expect(sha).toBe("a4ee8f13c4b58777767dbd94a022dbc0a721ff6ece90522e4ddf4e25d2d9f1dd");
  });

  it("records no Guess the Total predictions", () => {
    const picks = JSON.parse(read("data/picks/2026-week-05.json").toString()).picks as Record<string, unknown>[];
    expect(picks.some((p) => "predicted_total" in p || p.market_type === "total")).toBe(false);
  });

  it("engine reproduces the recorded 10:03 ET provisional snapshot from the original picks", () => {
    const picks = JSON.parse(read("data/picks/2026-week-05.json").toString()).picks as {
      matchup: string; favorite: string; spread: number; eligible_for_scoring: boolean;
    }[];
    const snap = JSON.parse(read("data/snapshots/2026-week-05-20261008T150212589Z.json").toString()) as {
      total_points: number; games: { matchup: string; predicted_home_spread: number; consensus_home_spread: number; points: number }[];
    };
    let total = 0;
    for (const g of snap.games) {
      const pick = picks.find((p) => p.matchup === g.matchup && p.eligible_for_scoring)!;
      expect(toHomeSpread(pick)).toBe(g.predicted_home_spread);
      expect(accuracyPoints(toHomeSpread(pick), g.consensus_home_spread)).toBe(g.points);
      total += g.points;
    }
    expect(Math.round(total * 10) / 10).toBe(snap.total_points);
  });
});
