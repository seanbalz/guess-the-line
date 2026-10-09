import { describe, expect, it } from "vitest";
import { evaluateMarket, median, selectBenchmark } from "../src/benchmark.js";
import { G1, LOCK, quotes, snapshot } from "./fixtures.js";

const T = "2026-10-15T12:00:00-07:00";

describe("consensus gate", () => {
  it("median of even and odd counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("verifies three fresh agreeing books", () => {
    expect(evaluateMarket(quotes("spread", [-3, -3.5, -3], T), undefined, "spread", T)).toMatchObject({ status: "verified", value: -3, reference: "not_recorded" });
  });
  it("requires three books", () => {
    expect(evaluateMarket(quotes("total", [44.5, 45], T), undefined, "total", T).status).toBe("unverified");
  });
  it("requires 85% within ±5 of median", () => {
    expect(evaluateMarket(quotes("spread", [-3, -3, -3, -3, -3, -10], T), undefined, "spread", T).status).toBe("unverified");
  });
  it("excludes quotes older than 6 hours", () => {
    const qs = [...quotes("total", [44, 44], T), ...quotes("total", [44], "2026-10-15T05:00:00-07:00").map((q) => ({ ...q, book: "Old" }))];
    expect(evaluateMarket(qs, undefined, "total", T).status).toBe("unverified");
  });
  it("excludes quotes timestamped after capture", () => {
    expect(evaluateMarket(quotes("total", [44, 44, 44], "2026-10-15T13:00:00-07:00"), undefined, "total", T).status).toBe("unverified");
  });
  it("uses only the latest quote per book", () => {
    const qs = [...quotes("total", [40, 44, 44], "2026-10-15T10:00:00-07:00"), { book: "Book 1", market_type: "total" as const, total: 44, quoted_at: T }];
    expect(evaluateMarket(qs, undefined, "total", T)).toMatchObject({ status: "verified", value: 44 });
  });
  it("fails when a recorded reference consensus differs by more than 1", () => {
    const ref = [{ source: "Reference", market_type: "spread" as const, home_spread: -5, quoted_at: T }];
    expect(evaluateMarket(quotes("spread", [-3, -3, -3], T), ref, "spread", T).status).toBe("unverified");
    ref[0]!.home_spread = -3.5;
    expect(evaluateMarket(quotes("spread", [-3, -3, -3], T), ref, "spread", T)).toMatchObject({ status: "verified", reference: "passed" });
  });
  it("does not infer a total from spreads", () => {
    expect(evaluateMarket(quotes("spread", [-3, -3, -3], T), undefined, "total", T).status).toBe("unverified");
  });
});

describe("benchmark selection and kickoff freeze", () => {
  const pre = snapshot("pre", "2026-10-15T16:00:00-07:00", [{ matchup: G1, quotes: quotes("total", [45, 45, 45], "2026-10-15T16:00:00-07:00") }]);
  const post = snapshot("post", "2026-10-15T18:00:00-07:00", [{ matchup: G1, quotes: quotes("total", [50, 50, 50], "2026-10-15T18:00:00-07:00") }]);
  const broken = snapshot("broken", "2026-10-15T17:00:00-07:00", [{ matchup: G1, quotes: quotes("total", [45], "2026-10-15T17:00:00-07:00") }]);

  it("never uses a post-kickoff snapshot", () => {
    expect(selectBenchmark([pre, post], G1, "total", "2026-10-16T00:00:00Z", LOCK)).toMatchObject({ value: 45, snapshot_id: "pre", stale: false });
  });
  it("falls back to the last valid pre-kickoff snapshot and flags it stale", () => {
    expect(selectBenchmark([pre, broken], G1, "total", "2026-10-16T00:00:00Z", LOCK)).toMatchObject({ value: 45, snapshot_id: "pre", stale: true });
  });
  it("is unverified with no valid snapshot, never zero", () => {
    expect(selectBenchmark([broken], G1, "total", "2026-10-16T00:00:00Z", LOCK)).toMatchObject({ status: "unverified", value: null });
  });
  it("provisional view ignores snapshots captured after as-of", () => {
    expect(selectBenchmark([pre], G1, "total", "2026-10-15T15:00:00-07:00", LOCK).status).toBe("unverified");
  });
  it("flags a benchmark older than 6 hours as stale", () => {
    expect(selectBenchmark([pre], G1, "total", "2026-10-15T23:00:00-07:00", null).stale).toBe(true);
  });
});
