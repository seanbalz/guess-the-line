import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWeek, render } from "../src/cli.js";
import { scoreMode } from "../src/week.js";
import { G1, league, quotes, snapshot, week } from "./fixtures.js";

describe("CLI data loading and report", () => {
  it("loads week, league and only gtl.snapshot.v1 snapshots, and labels state", () => {
    const dir = mkdtempSync(join(tmpdir(), "gtl-"));
    for (const d of ["picks", "games", "snapshots"]) mkdirSync(join(dir, d));
    const w = { ...week([{ player: "Ann", matchup: G1, market_type: "total", predicted_total: 44, submitted_at: "2026-10-15T16:05:00-07:00" }]), week: 6 };
    writeFileSync(join(dir, "picks", "2026-week-06.json"), JSON.stringify(w));
    writeFileSync(join(dir, "games", "fixture.json"), JSON.stringify(league(["Ann", "Ben"])));
    const at = "2026-10-15T16:00:00-07:00";
    writeFileSync(join(dir, "snapshots", "2026-week-06-a.json"), JSON.stringify(snapshot("a", at, [{ matchup: G1, quotes: quotes("total", [44.5, 44.5, 44.5], at) }])));
    writeFileSync(join(dir, "snapshots", "2026-week-06-legacy.json"), JSON.stringify({ week: 6, games: [] }));
    const { league: l, weekFile, snapshots } = loadWeek(2026, 6, "fixture", dir);
    expect(snapshots).toHaveLength(1);
    const out = render(scoreMode(l, weekFile, snapshots, "total", "2026-10-15T16:30:00-07:00"));
    expect(out).toContain("GUESS THE TOTAL — PROVISIONAL (max 20)");
    expect(out).toMatch(/Ben\s+not_submitted/);
    expect(out).toContain("closest pending");
  });

  it("refuses legacy pick files instead of guessing", () => {
    expect(() => loadWeek(2026, 5, "sean-troy-luke")).toThrow(/predates/);
  });
});
