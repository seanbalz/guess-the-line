# Guess the Line — scoring engine guide

Owner: Sean Balsiger · Version 1 · Updated 2026-10-09

This covers the Week 6 scoring engine for **Guess the Spread** and **Guess the Total** (decision D-19). It is a local, commissioner-run tool. It has no login, database, public page, notifications or live odds feed. The two modes are scored completely separately: picks, benchmarks, points (out of 10 × games each) and closest-pick W-L-T never combine.

## Commands

```sh
npm ci                     # install (Node 20+)
npm run typecheck          # TypeScript strict check
npm test                   # Vitest suite
npm run score -- --week 6  # standings for both modes, as of now
npm run score -- --week 6 --as-of 2026-10-15T16:00:00-07:00   # replay a past moment
npm run score -- --week 6 --json                             # machine-readable output
```

The report says **PROVISIONAL** until the as-of time reaches a verified lock (actual TNF kickoff), then **LOCKED**. An em dash (—) means no value, never zero.

## Week file — `data/picks/<season>-week-<NN>.json`

| Field | Meaning |
|---|---|
| `schema` | Always `gtl.week.v1` |
| `league` | League id in `data/games/` (e.g. `sean-troy-luke`) |
| `status` | Free text, e.g. `awaiting_verified_schedule`, `open`, `locked` |
| `schedule_source` | Link to the official schedule used |
| `lock.kickoff_at` | **Actual** TNF kickoff, ISO-8601 with offset. Locks every pick and freezes every benchmark |
| `lock.status` | `verified` only once actual kickoff is confirmed; otherwise the week stays PROVISIONAL |
| `games[]` | `{ "matchup": "Away Team @ Home Team", "kickoff_at": "..." }` from the verified schedule only |
| `revisions[]` | Append-only prediction revisions (below). Never edit or delete a past revision |

Revision, spread (either form):

```json
{ "player": "Troy Jun", "matchup": "Away Team @ Home Team", "market_type": "spread",
  "favorite": "Home Team", "spread": -3.5, "submitted_at": "2026-10-14T19:05:00-07:00", "source": "text to commissioner" }
{ "player": "Troy Jun", "matchup": "Away Team @ Home Team", "market_type": "spread",
  "predicted_home_spread": 2.5, "submitted_at": "2026-10-14T19:05:00-07:00" }
```

Revision, total:

```json
{ "player": "Luke Jun", "matchup": "Away Team @ Home Team", "market_type": "total",
  "predicted_total": 44.5, "submitted_at": "2026-10-14T19:06:00-07:00" }
```

Rules the engine enforces: the player must be on the roster and the matchup on the week's slate. Values use 0.5 increments and totals are nonnegative. A `favorite` must be one of the two teams, with a spread of 0 or less. Any number of revisions is allowed; the latest one strictly before `lock.kickoff_at` counts. Revisions at or after the lock are reported as rejected and are never scored. A missing pick shows `not_submitted`, not zero.

## Snapshot file — `data/snapshots/<season>-week-<NN>-<UTC stamp>.json`

```json
{
  "schema": "gtl.snapshot.v1",
  "snapshot_id": "2026-week-06-20261015T230000Z",
  "season": 2026, "week": 6,
  "captured_at": "2026-10-15T16:00:00-07:00",
  "captured_by": "Sean Balsiger",
  "method": "manual: named-book quotes copied from each book's public page",
  "games": [
    { "matchup": "Away Team @ Home Team",
      "quotes": [
        { "book": "DraftKings", "market_type": "spread", "home_spread": -3.5, "quoted_at": "2026-10-15T15:55:00-07:00", "source_url": "https://..." },
        { "book": "DraftKings", "market_type": "total", "total": 44.5, "quoted_at": "2026-10-15T15:55:00-07:00", "source_url": "https://..." }
      ],
      "reference": [
        { "source": "Action Network consensus", "market_type": "spread", "home_spread": -3.5, "quoted_at": "2026-10-15T15:50:00-07:00" }
      ] }
  ]
}
```

Spreads are always recorded from the **home team's** perspective. Totals are recorded on their own and are never inferred from spreads. `reference` is optional.

## Benchmark gate (per matchup, per market)

1. Keep each book's latest quote that is no newer than `captured_at` and no more than 6 hours older than it.
2. Require at least 3 books.
3. The benchmark is the median of those quotes.
4. At least 85% of books must be within ±5 points of the median.
5. If a `reference` consensus is recorded, it must be within ±1 of the median.
6. Otherwise the market is **unverified** for that snapshot.

The scored benchmark is the latest snapshot captured at or before both the as-of time and the lock that passes the gate. Snapshots captured after kickoff are ignored, so the frozen benchmark cannot be rewritten. The benchmark is flagged **STALE** if a newer snapshot failed the gate, or if it is more than 6 hours old at the as-of time. With no valid snapshot, picks show `awaiting_benchmark`.

## Scoring

- **Accuracy:** `max(0, 10 − 2 × |prediction − benchmark|)` for spreads (home-referenced) and totals alike.
- **Closest pick per matchup:** the smallest error wins. Tied smallest errors are ties, and everyone farther away loses. It is computed only when every roster player has a pick and the benchmark is verified; otherwise it shows `pending`.
- **Weekly rank:** points first, then lower cumulative error, then more exact matches. Players tied on all three share a rank.

## Not covered yet

Opponent-pick and benchmark visibility (the reveal rules) need authenticated views and are not enforced by this commissioner tool. Do not share its output with a player before reveal. Also not built: Betting Challenge, edge board, season totals across weeks, the extension-request workflow, notifications, and any odds provider adapter beyond manual snapshots. Week 5 uses the earlier free-form picks format; it is kept unchanged and is not re-scored by this engine.
