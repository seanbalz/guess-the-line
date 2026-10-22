# Guess The Line — current build and retirement audit

Owner: Sean Balsiger · Version 1 · October 15, 2026

The working new app has been located and matched to production. The earlier
placeholder finding described the stale task checkout at `e5a45f6`, not the
deployed application. Rebuilding all five tabs is not a retirement prerequisite.
Retirement itself remains open under D-52 and [RETIRE-01–04](../planning/new-app-retirement.md).

## Fresh deployment verification

Read-only checks completed at 20:29–20:31 UTC on October 15 (1:29–1:31 PM Pacific).
The [machine-readable evidence](../planning/audits/app-retirement-source-2026-10-15.json)
contains only public asset/deployment metadata, never account records or picks.

| Check | Result |
|---|---|
| Authenticated Pages deployment listing | Newest of 25 returned production deployments: `ed3fb50b-388b-4330-8767-8bd08adb9255`, branch `main`, source `b883c77` |
| Full Git source | `b883c7742979d133720ed931c520821fdc4a13b5`, the recommendations release already recorded in [its release record](RELEASE_2026_10_15_RECOMMENDATIONS.md) |
| Canonical / immutable HTML | Both HTTP 200 and identical SHA-256 `890d32a7c61394506d466e0bf468e510a702122111a79548ce1615cf21492c99` |
| Entry JavaScript | `assets/index-1OAlhnBS.js`, both HTTP 200, 476,472 bytes; SHA-256 `2f88af928cbe1f45176d3942f0d187fec224f0b1074e4de423902cdb392ef46e` |
| New-app JavaScript | `assets/NextApp-CW6mgob2.js`, both HTTP 200, 147,101 bytes; SHA-256 `d39986196a0f04b4fb1e172679e72de14959a5a7fedb8adbed929e4974c59bb5`; contains Recommended |
| Historical deployment sample | `https://c251e8e1.guess-the-line.pages.dev/`, recorded in the [older release](RELEASE_2026_10_09.md), still serves HTTP 200 with a different legacy index/entry bundle; old hosted entry points remain available |
| Current repository used for follow-up | Isolated `app-retirement-audit` worktree from `origin/main` at `c60ab49`; original dirty checkout and other active worktrees preserved |

Canonical URL: <https://guess-the-line.pages.dev/>. Matched immutable URL:
<https://ed3fb50b.guess-the-line.pages.dev/>. The source association combines fresh
authenticated deployment metadata, matching served assets and the recorded release;
this audit did not rebuild that source. It checked HTML and two JavaScript bundles,
not all 93 assets. No new signed-in walkthrough, database audit, save, migration,
deployment, default switch or deletion was performed. API v24 and historic state
invariants remain **recorded release evidence**, not fresh backend checks here.

## Existing features to retain, not rebuild

The deployed commit's registry maps real components to all five tabs. The newer
reviewed repository retains these workflows:

| Area | Already implemented | Source / boundary |
|---|---|---|
| Home | Weekly status, separate market ranks and navigation to Play | `next/home/Home.jsx` |
| Play | Whole-market guesses, saves/receipts, deadline edits, sit-out and Community draft recovery | `next/play/Play.jsx` reuses `WeekPicks` from `CommunityHome.jsx`; hosted rules still govern |
| Bets | Recommended, explicit Virtual Units card review, tracked slips/corrections/results/following and past-week history | `next/bets/Bets.jsx` reuses `VirtualUnits.jsx` and `SocialBetTracker.jsx` |
| Lines | Schedule, own saved references, records, trends/weather and private game-note editor | `next/lines/LinesBoard.jsx`, `next/lines/GameSheet.jsx`, `next/lines/GameNote.jsx` |
| League | Feed, likes/comments, Community market boards/history and private-group weekly boards | `next/league/LeagueScreen.jsx`, `next/league/LeagueHistory.jsx` |
| Me | Profile-name editor, theme/reduced motion and sign-out | `next/me/MenuSheet.jsx`, `next/me/ProfileSettings.jsx` |

All source paths in this table are under `web/src/`. These are source findings with
the earlier release's walkthrough evidence; they are not a new end-to-end audit.
The [shared-editor contract](ALL_TABS_LIVE_WORKFLOWS.md) is essential: retiring the
old navigation does not authorize deleting shared editors/styles the new app uses.

**Later source reconciliation:** PR #141 merged at `bb4f20a` during this audit.
It adds per-game entry, receipts, weekly scoring and a recovery reader for retained
Community/Solo drafts in `web/src/next/play/PerGamePlay.jsx`. That path requires
the live `perGameReady` capability; its merge is not hosted activation. Keep it
and its account/week/market recovery copies and uncertain-save readback in the
cutover inventory. Group `predictionDraft.js` recovery still needs a new-app
destination. The [implementation checklist](PER_GAME_SCORING_RELEASE.md) records
the separate release gates; the fresh production evidence above stays `b883c77`.

## Remaining retirement work

| Gap | Required next step / acceptance |
|---|---|
| Old-only records | Add accessible destinations for Solo journal/archive, historical forecasts/Favorites, Betting Challenge/group history, Week 5 freeze and detailed revision history; verify every retained category against the inventory |
| Export | Expose the working export capability from the new app; newer main includes complete shared-ticket export work, but backend availability does not establish a new-app destination or deployment |
| Operations | Replace classic-only league creation, invitation issuing/revoking and commissioner tools; new joining/switching already works |
| Drafts | Keep working Community recovery, add group recovery, and verify the merged but gated Solo/per-game recovery path at cutover. Protect memory-only bet/slip edits and uncertain saves before any forced refresh; never silently submit a recovered draft |
| Access removal | Replace default/storage/query switches, menus, error fallbacks, old links and alternate published entries; verify older hosted URLs and stale connected clients |
| Preservation proof | Private recoverable backup, before/after IDs/counts/hashes, new-app readback/export and real-device acceptance are still required; a static-asset match proves none of these |

The six pending redesign migrations and per-game scoring work keep their own
contracts. This audit neither applies them nor treats every future redesign
enhancement as an existing feature that must be rebuilt to preserve old records.

## Related tasks and numbering reconciliation

- The scrolling/footer report and All / Spreads / Totals filter remain open as
  [UX-NEXT-01 and BETS-NEXT-01](../planning/mobile-bets-followups.md). The active
  source is now known. No filter or footer fix was deployed by this audit.
- D-51 in [PR #140](https://github.com/seanbalz/guess-the-lines-repo/pull/140),
  recommendation-refinement branch `3985acb`, was not deployed in the
  fresh production listing. It changes card presentation/ranking and forecast
  options, but does not implement the market filter or scrolling fix. Reconcile
  that work before editing the same recommendation components.
- The stale local retirement note used D-48, already occupied by recommendations.
  It is now D-52; D-51 remains reserved for the refinement work. The original
  scoring note's D-47 was already reconciled to D-50 on main. Preserve those
  decisions and later answers; do not overwrite the current log with stale files.
- The current completion register and build plan are updated with these findings.
  The frozen tracker, private Status Board and external issue #126 were not changed.

Cloudflare documents that older deployment URLs persist independently of the
moving branch alias; this supports the separate hosted-URL retirement check.
See [preview deployment aliases](https://developers.cloudflare.com/pages/configuration/preview-deployments/).
