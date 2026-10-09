export type MarketType = "spread" | "total";

export const MODES: Record<MarketType, string> = {
  spread: "guess_spread",
  total: "guess_total",
};

export interface League {
  id: string;
  name: string;
  roster: string[];
  staff: { commissioner: string };
}

export interface GameEntry {
  /** "Away Team @ Home Team" */
  matchup: string;
  /** Scheduled kickoff, ISO-8601 with offset. */
  kickoff_at: string | null;
}

/**
 * One commissioner-entered prediction revision. Revisions are append-only;
 * the latest revision submitted before the lock is the effective pick.
 */
export interface PickRevision {
  player: string;
  matchup: string;
  market_type: MarketType;
  /** Signed spread from the home team's perspective (home -3 = home favored by 3). */
  predicted_home_spread?: number;
  /** Alternative spread entry: the team the player favors and its (non-positive) spread. */
  favorite?: string;
  spread?: number;
  predicted_total?: number;
  submitted_at: string;
  source?: string;
  note?: string;
}

export interface WeekFile {
  schema: "gtl.week.v1";
  season: number;
  week: number;
  league: string;
  status: string;
  schedule_source: string | null;
  schedule_notes?: string[];
  /** Submission deadline: actual Thursday Night Football kickoff. Revisions at or after it are rejected. */
  lock: { kickoff_at: string | null; status: "verified" | "unverified"; source: string | null };
  games: GameEntry[];
  revisions: PickRevision[];
}

export interface Quote {
  book: string;
  market_type: MarketType;
  home_spread?: number;
  total?: number;
  quoted_at: string;
  source_url?: string;
}

export interface ReferenceQuote {
  source: string;
  market_type: MarketType;
  home_spread?: number;
  total?: number;
  quoted_at: string;
}

export interface SnapshotFile {
  schema: "gtl.snapshot.v1";
  snapshot_id: string;
  season: number;
  week: number;
  captured_at: string;
  captured_by: string;
  method: string;
  games: { matchup: string; quotes: Quote[]; reference?: ReferenceQuote[] }[];
}
