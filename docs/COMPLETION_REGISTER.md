# Guess The Line — current completion register

Owner: Sean Balsiger · Evidence reconciled October 19, 2026 (Pacific)

The [sequential platform queue](../planning/PLATFORM_WORK_QUEUE.md) is the current
itemized backlog. Work proceeds one item at a time. Q01 reconciles source, open PRs
and local work; Q01 merged as PR #152; the authorized weekly-results repair takes priority before Q02. The earlier register is
preserved as an [archived snapshot](COMPLETION_REGISTER_ARCHIVE_2026_10_19.md),
not a current deployment ledger. The frozen v62 tracker is unchanged.

## Active priority — weekly and player Trends, October 21

Sean approved week-opening publication, a Trends tab with This Week / Teams / Players, recent and longer history, and player guess-versus-market outcome evidence. Work is isolated on `codex/weekly-player-trends` from `origin/main` at `368f5d4`; other checkouts and unpublished work are preserved. See the [approved design](superpowers/specs/2026-10-21-weekly-player-trends-design.md) and [release record](WEEKLY_PLAYER_TRENDS_RELEASE.md) for implementation and verification state. No migration or hosted deployment is part of this implementation handoff. Private-league player history retains the separately staged D-53 comparison-reader dependency. Implementation and independent review are complete in [PR #166](https://github.com/seanbalz/guess-the-lines-repo/pull/166), integrated with main at `fb86a3e`. The full local check passed 1,552 Node and 235 Vitest tests with zero skips; 43 integrated browser cases and cloud bundle privacy passed. Main then advanced to c6afb02e with the approved four-tab redesign (PR #162). Integration is in progress: the complete Trends destination will live under Research > Trends while preserving its own views and game-detail highlights. Final integration review, CI and task-branch synchronization will be recorded in the PR receipt; merge and hosted release remain separate.

## Verified delivery

- Core per-game locking, immediate personal points, receipts and weekly score
  navigation were activated October 19. M-02, M-03, M-04, M-08, M-05, M-06 and M-07
  were applied individually and verified. Historical scores and all 23 ballots
  were preserved. See the [production release record](CORE_SCORING_PRODUCTION_RELEASE.md).
- Compatible Home/Fantasy Pages and API were retained: Pages `0933a030`, API v25,
  source `8942725746f199270d79fce562ac37cf92d64d69`; collector v4. D-47 weather
  scheduling was already applied. This is not a new frontend deployment claim.
- The scoring release PR #145 merged as `eb4e5e1a7f14a2a863e98ceed9e4744c11603393`
  after all five checks passed on `4736b4f2f6f521bf31c9d068792c5b5ec8a7e4d4`.
  Windows main, Mini shared-sync and Neo main were each verified clean at that
  merge with zero ahead/behind/changed files. This reconciliation will receive
  its own merge and sync evidence.
- PR #151 permanently removed release timing restrictions. Player deadlines,
  migration order, source/CI, fresh evidence, preservation and privacy remain.

## Current work and remaining boundaries

October 21 design review: Sean selected a simpler four-tab application,
**Home / Play / Bets / Research**, with League inside Play and Fantasy inside
Research, and equal emphasis on guessing/competition and actual-bet tracking.
He chose the third visual option, **One thing first**. The
[four-tab design specification](superpowers/specs/2026-10-21-four-tab-simplification-design.md)
records the selected direction, feature destinations and local preview evidence.
Sean approved the specification and explicitly authorized the build. PR #162,
branch `codex/four-tab-design`, implements the four roots, compact summaries,
retained editors and reversible detail routes. League is inside Play and Fantasy
inside Research; account/settings and old-app recovery remain accessible.
The [implementation plan](superpowers/plans/2026-10-21-four-tab-simplification.md)
records the work and verification. Read-only reconciliation of PR #144 and the
Mini's unpublished shell found its Fantasy navigation changes already represented
on main; no Mini files were changed.

Local verification on October 21: `npm run check` passed (1,456 Node tests with
zero skips, 198 Vitest tests, typecheck and production build). The legacy browser
suite passed 41/41, performance 4/4, and critical-path accessibility 7/7. Brand QA
and authenticated cloud-build boundary inspection passed. Focused browser coverage
checks four roots at 320/390 in both themes, exactly one primary root action,
fixed bottom navigation, nested/reloaded Back, restored scroll/focus, historical
week scope, draft cancellation, exact recommendation ticket terms and explicit
saves. The final corrected feature rerun passed 38/38; shell/router/token checks passed
45/45, with 19 shell browser checks plus four focused follow-up checks passing.
The plan records the earlier failures, corrections and verification scope; PR
#162 and the conversation handoff record exact-head CI and branch sync.

Sean subsequently authorized CI fixes, merge and deployment. PR #162 merged as
`c6afb02` and the protected frontend-only release deployed it on October 21 at
23:49 UTC as Pages `46fb8ae6-0df8-478c-8762-9607c2c6fdec`, keeping API v29; see
the [four-tab release record](RELEASE_FOUR_TAB_REDESIGN.md) for CI, readiness,
served-asset and preservation evidence.
No migrations, live account edits or new data integrations are included.
Physical-iPhone/Home Screen acceptance and the separate native iOS
deliverable remain open. This entry does not close Q03/Q04/Q17 wholesale; the
existing sequential queue and preservation of unpublished Mini work still apply.

October 21 situational-trends upgrade: Sean confirmed a weekly and per-matchup
shortlist of up to three consistent trends, emerging patterns under Explore,
recent views that can span prior seasons, NFL spread/total scope prepared for later
markets, and an explicit research lean with supporting/conflicting evidence or
“No clear lean”. His Guess entry predicts sportsbook pricing. Book It With Trent
has a separate original-play section; the other named accounts are trend research
references. Sean approved the [design](superpowers/specs/2026-10-21-trends-research-design.md)
and authorized the [implementation plan](superpowers/plans/2026-10-21-trends-research.md).
The evaluator, authenticated reader, prepared historical snapshot and shared
weekly/matchup UI are implemented in [PR #161](https://github.com/seanbalz/guess-the-lines-repo/pull/161)
and passed independent task reviews. Runtime timing and allocation follow-ups
preserve privacy and freshness boundaries. The [research record](TRENDS_RESEARCH.md)
contains source provenance, replay/null diagnostics, publication instructions,
local browser/build checks and performance limits. The full suite passed
(1,503 Node and 213 Vitest tests; zero skips), with 58 focused tests after the
final schedule-dependency fix. Whole-branch review approved with no outstanding
blocking findings. No migration or deployment is established. The existing
sequential queue and other worktrees remain intact.
Sean's follow-up permits qualifying opposing groups alongside a main lean:
show the opposing case as a yellow alternative, not automatically red/bad or
an automatic No clear lean. Design version 2 preserves the opposition and
reserves No clear lean for insufficient or unresolved competing evidence.
The free nflverse source refreshed October 21 with completed games through
October 19. Sean subsequently said "get it connected". The first reviewed feed
was saved server-side on October 21 at 21:00 UTC and its digest matched the
validated private input. This is a dated manual import, not automatic X ingestion.
PR #161 merged and protected release 39687111092 deployed API v29 and Pages
0dde8b76. The first reviewed Trent feed was verified in the signed-in app;
all preservation hashes matched. Live acceptance found research validation was
reading a different nflverse mirror from offline preparation, so leans were
correctly withheld. The API-only source-alignment fix (PR #169, merge
`f22ee67`) passed exact-commit CI and deployed through protected release
39700103221 as API v30 on October 22 at 00:32 UTC; the frontend stayed at the
four-tab Pages `46fb8ae6` and all preservation hashes matched. Signed-in
confirmation that current leans now appear remains open.
See the [dated release record](RELEASE_2026_10_21_TRENDS_RESEARCH.md).

October 21: Sean authorized a separate private NBA archive and import of the
saved NBA ledger. The [private NBA release card](PRIVATE_NBA_STORAGE.md) records
PR #163's merge, hosted migration `20261021205118` and the verified private import
at 20:51 UTC. Account linkage, app-role denial, original-source preservation and
generated accounting were verified. NFL data and function/grant hashes stayed
unchanged. NBA records do not feed the NFL application or its totals. The evidence
PR body records its final CI, merge and three-machine synchronization receipt.

Sean selected easier actual-bet tracking (Q16) next on October 20, with Virtual
Units separate. Q16 is now deployed: API v27 and Pages `9ef3f651`, from reviewed
source `fd97d07273c5f586772006acea5cbf548ef50aa7`. PR #155 passed all five checks
and merged as `2d81436dc0f3bcbfd9c91b69c9049755eb8b4601`; all three integration
checkouts passed clean sync at that merge. See the
[easier bet tracking release card](EASIER_BET_TRACKING_RELEASE.md) for live asset,
privacy, preservation and acceptance limits. Its evidence PR carries the final
documentation merge/sync result. PR #156 merged as
`fd1facc7af1d1673b99dee0bd2f0228d6f63a0e6`; all three checkouts then synced cleanly.
Q02's fix merged in PR #157 and protected frontend release 39521335125 passed;
that release deployed Pages `ad10f1c1`, retaining API v27. It is superseded by
the October 21 deployment below. See the
[verifier repair record](DEPLOYMENT_VERIFIER_RELEASE.md); its evidence PR records
final merge/sync. Sean reported the Recommended-to-tracked-bets gap on October 21
and supplied a grouped-list design direction. This Q16 follow-up takes priority
before Q03; see the [recommendation tracking release card](RECOMMENDED_TRACKING_RELEASE.md).
PR #159 merged as `368f5d46cd036d74f9dc5c32cf572dd702d320b2` and protected frontend
release 39652280151 verified Pages `dcfb977b`, with API v27 and all data hashes
unchanged. All three integration checkouts passed clean sync at that runtime
commit. Closeout CI/merge and the final documentation sync are pending at this
evidence-submission checkpoint; the closeout PR body will record their results;
Q03 remains the next queued item.
The weekly-results evidence PR #154 passed all five checks, merged as
`eb1fa9330d715140f8e343a24daf51908ace5ba6`, and was verified clean/synced on Windows,
Mini shared-sync and Neo main. Other unpublished Mini worktrees were preserved.

| Work | Current state | Next action |
| --- | --- | --- |
| Q01 backlog reconciliation | PR #152 merged as 97c08b987a26918b74db23138cf0793f70eba6d8; three clean integration checkouts verified at that commit | Complete. Preserve the two dirty Mini worktrees identified in the queue. |
| Scheduled collector | October 20 20:15 UTC cron, worker, collection and Week 7 snapshot succeeded | Verified; see the core scoring release record. No forced provider collection. |
| Q02 deployment verifier | PR #157 merged; protected source, readiness and frontend deploy/verification passed; 95 assets checked at both URLs | Evidence PR merge/sync recorded in its body; physical-phone acceptance remains separate. |
| Q03–Q05 mobile/Bets/recommendations | Requirements and an implementation branch exist | Sequential navigation, filters, then recommendation refinement tasks. |
| Q06–Q08 Bets/comparisons/preferences | Merged readers/settings code; three migrations remain unhosted | Separate dependency-aware release/readback; no generic database push. |
| Q09–Q10 account/notification acceptance | Live components exist; real-world checks remain | Verify actual supported account/device flows and iPhone notification delivery. |
| Q11–Q15 Fantasy | Static rankings/basic details exist; refresh and richer analysis remain | Refresh, profiles/usage, comparisons, matchups and newly requested sourced trade values. |
| Q16 easier actual-bet tracking | PRs #155/#156 merged and three integration checkouts synced; API v27 retained, same source rebuilt as Pages ad10f1c1 by Q02 | October 21 follow-up merged in #159 and deployed as Pages dcfb977b; closeout CI/merge and final documentation sync pending; results will be recorded in its PR body. Physical-phone acceptance remains separate. |
| Q17–Q20 platform completion | Partial; see per-item exit criteria | Remaining destinations, operations, full-week/device acceptance and new-only transition. |
| Simulator/native iOS/other feeds | Separate later scope or decisions | No model validation, native-client or external-connection claim follows from existing planning. |

The current migration registry lists only M-10 Bets reading and D-53 comparisons
and account preferences as unhosted. The recommendation edit writer is on an
open branch, so it is an additional future release, not an omission from main's registry.

October 21 follow-up to Recommended and Bets: Sean approved percentage-based
cross-market gaps with a 3-point minimum for small spreads, plus compact
expandable recommendations, historical trend context and clearer Bets view
labels. [PR #164](https://github.com/seanbalz/guess-the-lines-repo/pull/164)
merged as `8ca21017c8e9ff84db26d17dc29eb39734799796` after all five PR
checks passed. Local verification: `npm test` passed 1,457 Node tests (including
the local PGlite fixture) and 202 React tests, all 12 Recommended browser tests
passed, and typecheck, standard/cloud builds, Week 7 trend reproduction and
brand QA passed. The generated cloud frontend passed the private-state scan;
`npm run check:cloud` could not finish because this isolated worktree lacks
`.env.cloud`. Exact-commit main CI and the protected frontend release passed:
Pages `1e349227` verified all 96 served assets at both URLs, retaining API v28,
hosted migration history, privacy boundaries and unchanged data hashes. See the
[release record](RECOMMENDED_PERCENT_RELEASE.md). Signed-in and physical-phone
acceptance remain separate. The frozen v62 tracker remains unchanged.
A separate redacted Week 7 nflverse snapshot was generated
for current-week context; the Week 6 input remains frozen. See
[the design](superpowers/specs/2026-10-21-recommended-percent-trends-design.md).

October 21 phone formatting pass: Sean's iPhone screenshot showed the Bets
tracker toolbar's **Following** button squeezed into the 44px refresh column,
spilling past the screen edge over the Player select, with refresh stretched
across a row. A sweep of every new-app root, section, Bets view, sheet and menu
(27 screens, Light and Dark, 320 and 390 px; local PGlite fixtures) reproduced it
in all four non-owner Bets views and found no other clipped text, stray icon or
overlapping control. The toolbar now places week + refresh on one row and the
player select and Following toggle on their own rows. A visual pass also fixed the
Pick'em chip's 4px label inset and the score page's button pair, which now shares a
row only when both labels fit on one line. New contracts:
`tests/cloud-browser/next-phone-layout.spec.js` (the sweep, plus the button and
Pick'em checks) and a toolbar test in `next-bets-live.spec.js`; each failed
before its fix and passes after it. The affected browser suites (Bets, scoring,
Play, four-tab, Lines, UI kit, Recommended and the new layout spec) passed 53/53
locally, with token, app-view and brand-document checks. The Bets section switch keeps its deliberate
2 + 1 layout below 520 px. D-55 records Sean's chart and brand direction; the
hybrid chart boards await his approval before any token change. Released
October 22 in Pages `af617cd2`; see the [Trends and Recommended filter
release](RELEASE_2026_10_22_TRENDS_FILTER.md).
A later CI pass on Linux found "Rest of season" spilling out of its Fantasy
segment at 320 px with the wider fallback font; segments now size by their labels
and the layout spec gained a wide-font pass that reproduces it on any host.

October 21 round 3 build (D-55): Sean approved the round 3 boards (R1–R5) and
asked for them in the app with the tokens and guide to match and the fine print
behind info buttons. Trend rows in the game sheet, All trends and research now
open a chart card (headline units, a line you can drag, a by-season view of
stems and a table, at most three tiles) built from the week file's own points and
seasons or the research reply's bins. Fine print moved behind ⓘ buttons and into
Menu › Guidance and sources. Home and Bets follow R3 and R4, and the D-55 tokens,
brand guide section and rule of restraint 10 are recorded. Verification is in
PR #177. Released October 22 at 09:13 UTC as Pages `f092e744` (frontend only;
API v31 unchanged); see the [round 3 release record](RELEASE_2026_10_22_ROUND3.md).
Real-phone acceptance remains open.

October 22 Q03 (UX-NEXT-01): `tests/cloud-browser/next-scroll-navigation.spec.js`
covers 11 pages at 390 × 844 and 320 × 568 in both themes, on local fixtures.
The tab bar stays at the screen's bottom through scrolling and window-height
changes, no ancestor traps the fixed bars, no page scrolls sideways, and each
page's end clears the tab bar. Tab focus landed under the tab bar or top bar on
12 page and size combinations. The fix is root `scroll-padding` in
`web/src/next/shell/shell.css`. A second test proves each check reports the
failure it guards. Merged in PR #181 and released October 22 in the
protected release [39821362374](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39821362374) (API and frontend from `8dccc5c`, with #180 and #182) as Pages `9fb54fe4`; the served
CSS carries both rules. Real-iPhone reproduction and acceptance remain open.

October 22 weekly Trends CPU fix: from API v31 on, every signed-in `/trends/week`
request hit the Edge CPU limit (HTTP 546), and Week 8 has no static fallback.
The server seed now carries the prepared 2025 history state instead of the history
CSV, so each request processes only the current season. Output is byte-identical,
and local cold main-thread CPU fell from about 1.07 s to under 0.21 s in Node and
Deno. Evidence is in the [release record](WEEKLY_PLAYER_TRENDS_RELEASE.md#october-22--hosted-cpu-outage-and-prepared-history-fix-claude-code);
branch `claude/trends-week-cpu`. Merged in PR #182 and released October 22 at 17:19 UTC
as API v32 with Pages `9fb54fe4`; see the
[October 22 follow-up](RELEASE_2026_10_22_TRENDS_FILTER.md#october-22-follow-up-trends-outage-fixed-api-v32).
Signed-in `POST /trends/week` returned 200 in hosted logs after the deploy, with no
CPU errors. Real-phone acceptance and Week 8 publication on Monday, October 26 remain
open.

## Evidence and limits

The queue records all six open PR dispositions, old issue triage and local-work
findings. Superseded scoring approval does not require another implementation
merge. Useful pending code and requirements remain preserved in their branches.
The audit inspected GitHub and Git worktrees on Windows, Mini and Neo; it did not
inspect every cloud sandbox, ignored file, credential or private Status Board.
Two Mini worktrees contain unpublished changes; clean integration checkouts do
not imply that all task work is published.

Sean's phone/visual acceptance and a full live week remain distinct from CI and
read-only production checks. No real test pick, extra provider collection,
production mutation or old-app retirement is performed by this reconciliation.

## Active priority — October 20, 2026

Private-group week rollover and automatic final results supersede the next queue item at Sean's request. Implementation and release evidence: [weekly results release](WEEKLY_RESULTS_RELEASE.md). PR #153 merged; API v26, three ordered migrations and results worker v1 activated. All five groups resolve to Week 7; the first scheduled run recorded 29 finals and settled two existing bets. Historical ballots, Guess scores and saved terms are unchanged. Windows main, Mini shared-sync and Neo main were verified clean at the release merge f9b89664dd15261bec454fa2378fc7f55ff4fcbd. This closeout records hosted evidence; its PR carries the subsequent evidence-merge and sync outcome.
