# EPL live draw-no-bet check — October 29, 2026

Owner: Sean Balsiger · Version 1

Sean explicitly approved **“Enable and test DNB check”** in the release chat. Following the verified M-32 apply
(`20261029162422`) and EPL worker v2 deployment from `5c1b775f05a69306f20f911f4b0455c207c65ffc`, the release
owner created only the `dnb-check` schedule and cron entry, enabled it, and dispatched one run through the existing
private capability dispatcher. The five existing jobs were left enabled and unchanged.

## Verified live result

| Field | Evidence |
| --- | --- |
| Project | `onmrgvcehkflfaizvedl` |
| First run | `776bb6ae-6ead-40f0-a1cf-3449d46d3f25` |
| Started / finished | `2026-10-29T16:44:46.937772Z` / `2026-10-29T16:44:48.050096Z` |
| Status / reason | `succeeded` / null |
| Season / matchweek | 2026 / 9 |
| Checked / qualifying fixtures | 3 / 3 |
| Qualifying books | DraftKings, FanDuel and BetMGM on each of the three fixtures |
| Stored availability | `dnbAvailable=true` |
| Production gate evaluation | `dnbGateOpen([actualRun], {season:2026, week:9})` returned true |
| Budget before / after | 407 / 404, unpaused; 3 free-plan credits used |
| Daily cron | `gtl-epl-dnb-check`, `23 11 * * *`, active; schedule row enabled |

The daily schedule is fixed at 11:23 UTC (7:23 AM Eastern before the November daylight-saving change,
6:23 AM Eastern afterward). No Codex reminder or separate scheduler was created. Each worker run checks at most
three upcoming fixtures, requires at least 60 credits and preserves the shared 50-credit reserve.

The stored result contains two-way prices for the same clubs/kickoffs as the scheduled fixtures. Raw book prices
remain in the private run evidence rather than this public record. A passing check opens the source gate for its
own week; later skipped checks do not erase that week's recorded success. Future weeks require their own evidence.

## Preservation and boundaries

Fresh pre-check at 16:44:35 UTC found 407 credits, ten future fixtures and zero DNB schedules, cron entries or runs.
Post-check at 16:45:30 UTC confirmed unchanged sorted-JSONB counts/hashes for managers, picks, pick history,
queues, bonuses, weeks, link audit, aliases and snapshots. All ballot scoring, Weeks 1–7 scoring anchors and
settled Virtual Units hashes also matched. The schedule-table hash changed as expected for the single new job.
No real player guess, pick, queue, account link or historical score was changed.

This records a live source gate and enabled bounded check. Moneyline API routes, regular reference collection,
first-after reference resolution wiring and player screens remain follow-on implementation work. The check does
not place bets or establish player-facing acceptance. M-33 and other migration applies are outside this action.

The off switch is to set only `gtl_epl_jobs_schedule.enabled=false` for `job='dnb-check'`, preserving its row,
run evidence and existing player data. No schema rollback or changes to the other five jobs are needed.
