import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { scoreMode, type ModeResult } from "./week.js";
import type { League, MarketType, SnapshotFile, WeekFile } from "./types.js";

const ROOT = resolve(import.meta.dirname, "..");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

export function loadWeek(season: number, week: number, leagueId: string, dataDir = join(ROOT, "data")) {
  const prefix = `${season}-week-${String(week).padStart(2, "0")}`;
  const weekPath = join(dataDir, "picks", `${prefix}.json`);
  if (!existsSync(weekPath)) throw new Error(`No picks file: ${weekPath}`);
  const weekFile = readJson<WeekFile>(weekPath);
  if (weekFile.schema !== "gtl.week.v1") throw new Error(`${weekPath} predates the gtl.week.v1 schema and cannot be scored by this engine`);
  const league = readJson<League>(join(dataDir, "games", `${leagueId}.json`));
  const snapDir = join(dataDir, "snapshots");
  const snapshots = readdirSync(snapDir)
    .filter((f) => f.startsWith(`${prefix}-`) && f.endsWith(".json"))
    .map((f) => readJson<SnapshotFile>(join(snapDir, f)))
    .filter((s) => s.schema === "gtl.snapshot.v1");
  return { league, weekFile, snapshots };
}

const fmt = (x: number | null) => (x === null ? "—" : String(x));
const LABEL: Record<MarketType, string> = { spread: "GUESS THE SPREAD", total: "GUESS THE TOTAL" };

export function render(r: ModeResult): string {
  const lines = [`${LABEL[r.market_type]} — ${r.state} (max ${r.max_points})`];
  lines.push("Rank  Player              Points  Scored  NotSub  CumErr  Exact  W-L-T");
  for (const s of r.standings) {
    lines.push(
      `${String(s.rank).padEnd(6)}${s.player.padEnd(20)}${String(s.points).padStart(6)}  ${String(s.scored_games).padStart(6)}  ${String(s.not_submitted).padStart(6)}  ${String(s.cumulative_error).padStart(6)}  ${String(s.exact).padStart(5)}  ${s.wins}-${s.losses}-${s.ties}`,
    );
  }
  for (const g of r.games) {
    const b = g.benchmark;
    const bench = b.status === "verified" ? `${b.value} [${b.snapshot_id}${b.stale ? ", STALE" : ""}]` : `UNVERIFIED (${b.reason})`;
    lines.push(`\n${g.matchup} — benchmark ${bench} — closest ${g.closest_status}`);
    for (const p of g.players) {
      lines.push(`  ${p.player.padEnd(20)}${p.status.padEnd(20)}pick ${fmt(p.predicted).padEnd(7)}err ${fmt(p.error).padEnd(6)}pts ${fmt(p.points).padEnd(6)}${p.closest ?? ""}`);
    }
  }
  if (r.rejected_late.length) lines.push(`\n${r.rejected_late.length} revision(s) at/after lock rejected (kept for audit).`);
  return lines.join("\n");
}

function main() {
  const { values } = parseArgs({
    options: {
      season: { type: "string", default: "2026" },
      week: { type: "string" },
      league: { type: "string", default: "sean-troy-luke" },
      "as-of": { type: "string" },
      json: { type: "boolean", default: false },
    },
  });
  if (!values.week) throw new Error("Usage: npm run score -- --week <n> [--season 2026] [--league id] [--as-of ISO] [--json]");
  const asOf = values["as-of"] ?? new Date().toISOString();
  const { league, weekFile, snapshots } = loadWeek(Number(values.season), Number(values.week), values.league!);
  if (weekFile.games.length === 0) {
    console.log(`Week ${weekFile.week}: ${weekFile.status}. No verified slate recorded yet; nothing to score.`);
    return;
  }
  const results = (["spread", "total"] as const).map((m) => scoreMode(league, weekFile, snapshots, m, asOf));
  console.log(values.json ? JSON.stringify({ as_of: asOf, results }, null, 2) : results.map(render).join("\n\n"));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    main();
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
