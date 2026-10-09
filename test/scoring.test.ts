import { describe, expect, it } from "vitest";
import { accuracyPoints, closestPick, toHomeSpread } from "../src/scoring.js";

describe("accuracy points", () => {
  it.each([
    [44.5, 44.5, 10],
    [45, 44.5, 9],
    [45.5, 44.5, 8],
    [49.5, 44.5, 0],
    [52, 44.5, 0],
    [44, 44.5, 9],
  ])("predicted %d vs market %d = %d (total acceptance #2)", (p, m, pts) => {
    expect(accuracyPoints(p, m)).toBe(pts);
  });

  it("scores fractional consensus continuously and without float noise", () => {
    expect(accuracyPoints(-3.5, -7.3)).toBe(2.4);
    expect(accuracyPoints(-2.5, 1.8)).toBe(1.4);
  });
});

describe("spread normalization to home team", () => {
  const m = "Cincinnati Bengals @ Miami Dolphins";
  it("home favorite keeps sign", () => expect(toHomeSpread({ matchup: m, favorite: "Miami Dolphins", spread: -3 })).toBe(-3));
  it("away favorite flips sign", () => expect(toHomeSpread({ matchup: m, favorite: "Cincinnati Bengals", spread: -7 })).toBe(7));
  it("pick'em is zero", () => expect(toHomeSpread({ matchup: m, favorite: "Cincinnati Bengals", spread: 0 })).toBe(0));
  it("explicit home spread passes through", () => expect(toHomeSpread({ matchup: m, predicted_home_spread: 2.5 })).toBe(2.5));
  it("rejects a team not in the matchup", () => expect(() => toHomeSpread({ matchup: m, favorite: "Dallas Cowboys", spread: -3 })).toThrow());
  it("rejects a positive favorite spread", () => expect(() => toHomeSpread({ matchup: m, favorite: "Miami Dolphins", spread: 3 })).toThrow());
});

describe("closest-pick W-L-T", () => {
  const run = (e: Record<string, number>) => Object.fromEntries(closestPick(new Map(Object.entries(e))));
  it("duel sole winner", () => expect(run({ A: 0.5, B: 1 })).toEqual({ A: "W", B: "L" }));
  it("duel exact tie is a tie for both", () => expect(run({ A: 1, B: 1 })).toEqual({ A: "T", B: "T" }));
  it("triple threat sole winner", () => expect(run({ A: 2, B: 0, C: 3 })).toEqual({ A: "L", B: "W", C: "L" }));
  it("triple threat two tied leaders, third loses", () => expect(run({ A: 1, B: 1, C: 3 })).toEqual({ A: "T", B: "T", C: "L" }));
  it("triple threat all tied", () => expect(run({ A: 0, B: 0, C: 0 })).toEqual({ A: "T", B: "T", C: "T" }));
  it("free-for-all four players", () => expect(run({ A: 4, B: 0.5, C: 0.5, D: 2 })).toEqual({ A: "L", B: "T", C: "T", D: "L" }));
});
