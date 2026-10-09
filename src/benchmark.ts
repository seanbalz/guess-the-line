import type { MarketType, Quote, ReferenceQuote, SnapshotFile } from "./types.js";

export interface GateOptions {
  minBooks: number;
  /** Quotes must lie within this many points of the median... */
  withinPoints: number;
  /** ...for at least this share of books. */
  minShare: number;
  /** Quotes older than this at capture time are stale and excluded. */
  maxQuoteAgeHours: number;
  /** A reference consensus, when recorded, must sit within this many points of the median. */
  referenceTolerance: number;
}

export const DEFAULT_GATE: GateOptions = {
  minBooks: 3,
  withinPoints: 5,
  minShare: 0.85,
  maxQuoteAgeHours: 6,
  referenceTolerance: 1,
};

export type MarketEvaluation =
  | { status: "verified"; value: number; books: string[]; latest_quote_at: string; reference: "passed" | "not_recorded" }
  | { status: "unverified"; reason: string };

export interface Benchmark {
  status: "verified" | "unverified";
  value: number | null;
  snapshot_id: string | null;
  captured_at: string | null;
  books: string[];
  /** A newer snapshot failed the gate, or the benchmark is older than the stale window. */
  stale: boolean;
  reason?: string;
}

const HOUR = 3_600_000;

function valueOf(q: Quote | ReferenceQuote, market: MarketType): number | undefined {
  return market === "spread" ? q.home_spread : q.total;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Apply the multi-book consensus gate to one market in one snapshot. */
export function evaluateMarket(
  quotes: Quote[],
  reference: ReferenceQuote[] | undefined,
  market: MarketType,
  capturedAt: string,
  gate: GateOptions = DEFAULT_GATE,
): MarketEvaluation {
  const captured = Date.parse(capturedAt);
  const latestByBook = new Map<string, Quote>();
  for (const q of quotes) {
    if (q.market_type !== market || valueOf(q, market) === undefined) continue;
    const at = Date.parse(q.quoted_at);
    if (Number.isNaN(at) || at > captured || captured - at > gate.maxQuoteAgeHours * HOUR) continue;
    const prev = latestByBook.get(q.book);
    if (!prev || Date.parse(prev.quoted_at) < at) latestByBook.set(q.book, q);
  }
  const usable = [...latestByBook.values()];
  if (usable.length < gate.minBooks) {
    return { status: "unverified", reason: `${usable.length} fresh book quote(s); ${gate.minBooks} required` };
  }
  const values = usable.map((q) => valueOf(q, market)!);
  const med = median(values);
  const share = values.filter((v) => Math.abs(v - med) <= gate.withinPoints).length / values.length;
  if (share < gate.minShare) {
    return { status: "unverified", reason: `only ${Math.round(share * 100)}% of books within ±${gate.withinPoints} of median` };
  }
  const refs = (reference ?? []).filter((r) => r.market_type === market && valueOf(r, market) !== undefined);
  for (const r of refs) {
    if (Math.abs(valueOf(r, market)! - med) > gate.referenceTolerance) {
      return { status: "unverified", reason: `${r.source} reference ${valueOf(r, market)} differs from median ${med} by more than ${gate.referenceTolerance}` };
    }
  }
  return {
    status: "verified",
    value: med,
    books: usable.map((q) => q.book).sort(),
    latest_quote_at: usable.map((q) => q.quoted_at).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1)!,
    reference: refs.length ? "passed" : "not_recorded",
  };
}

/**
 * Pick the benchmark for one matchup/market: the latest snapshot captured at or
 * before min(asOf, lock) that passes the gate. Snapshots after the lock are ignored,
 * so the frozen benchmark can never be rewritten.
 */
export function selectBenchmark(
  snapshots: SnapshotFile[],
  matchup: string,
  market: MarketType,
  asOf: string,
  lockAt: string | null,
  gate: GateOptions = DEFAULT_GATE,
): Benchmark {
  const cutoff = Math.min(Date.parse(asOf), lockAt ? Date.parse(lockAt) : Infinity);
  const candidates = snapshots
    .filter((s) => Date.parse(s.captured_at) <= cutoff)
    .sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at));
  let newerFailed = false;
  let lastReason = "no snapshot captured before cutoff";
  for (const snap of candidates) {
    const game = snap.games.find((g) => g.matchup === matchup);
    if (!game) continue;
    const ev = evaluateMarket(game.quotes, game.reference, market, snap.captured_at, gate);
    if (ev.status === "verified") {
      const aged = cutoff - Date.parse(snap.captured_at) > gate.maxQuoteAgeHours * HOUR;
      return {
        status: "verified",
        value: ev.value,
        snapshot_id: snap.snapshot_id,
        captured_at: snap.captured_at,
        books: ev.books,
        stale: newerFailed || aged,
      };
    }
    newerFailed = true;
    lastReason = `${snap.snapshot_id}: ${ev.reason}`;
  }
  return { status: "unverified", value: null, snapshot_id: null, captured_at: null, books: [], stale: false, reason: lastReason };
}
