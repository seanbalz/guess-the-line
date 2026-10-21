# Guess The Line — four-tab redesign release

Owner: Sean Balsiger · October 21, 2026 · Release preparation

Sean authorized: “Check CI, fix anything that fails, then merge and deploy the
four-tab redesign.” [PR #162](https://github.com/seanbalz/guess-the-lines-repo/pull/162)
implements the approved **One thing first** design: Home, Play, Bets and Research.
League is under Play, Fantasy under Research, and existing editors open from
compact landing rows. The [build plan](superpowers/plans/2026-10-21-four-tab-simplification.md)
records implementation, local verification and acceptance limits.

## Release scope and recovery

Target: frontend only, through the protected Shared production release workflow.
Integration with newer main includes PR #164's relative-gap recommendation
ranking, PR #163/#165's separately applied private NBA archive, and PR #161's
trends research. The research API release has its own authorization and
[release card](TRENDS_RESEARCH_RELEASE.md); this frontend release must verify
its actual hosted version and compatibility at readiness. The new frontend retains
the existing API contracts, independent market gates, authenticated readers,
explicit ticket saves and old-app recovery path. The app-default switch is unchanged.

No database migration or collector change is part of this release. M-10 and both
D-53 migrations remain pending. Readiness must verify their actual hosted status
and provide a fresh migration-history digest before deployment.

Initial rollback baseline: Pages `dcfb977b-c388-4706-b728-d0c11e356228`, API v27.
Refresh this baseline if the independently authorized research release advances
production before readiness. Restore the prior Pages deployment while retaining
the current compatible API and all stored records. This does not delete or revert
picks, tickets, receipts, scores or groups. The protected production environment
and source/CI checks remain in force. The prior release's provenance is in the
[recommended tracking release](RECOMMENDED_TRACKING_RELEASE.md).

## CI investigation

The first Typecheck and test and Persona jobs for reviewed head
`5f8c32fba3bd936c767cd40d18e8776054ca8382` failed during installation of the pinned
PGlite test runtime with npm `ECONNRESET`, before test execution. The test job's
retry installed the same dependency successfully and passed typechecking.

The broader local cloud-browser run found an obsolete Fantasy assertion:
the new app's retained Fantasy screen now returns to Research, while the test
still waited for “Back to Home.” The corrected assertion checks the Research
heading, active main tab and restored keyboard focus. The old app still returns
to Home. No product behavior was changed to accommodate the test. The corrected
four-case Fantasy suite passed in 54 seconds, including both apps' filters,
source details, keyboard access and light/dark layouts at 320, 390 and 1280px.
Brand/document QA and the whitespace check also passed.

Two other assertions needed the same navigation update: a legacy `#picks` link
now retains its default `market=spread` address, and Home's authenticated ticket
summary adds one `social/read` request per load. Their tests retain the selected
market check and exact shared-read/no-unexpected-write checks. The corrected
shell/switch browser suite passed all 28 cases, including legacy aliases, dirty
guards, Back/Forward, focus, scroll, reload and old-app recovery.

The full 271-case cloud-browser run finished with 268 passes and only those three
obsolete assertions failing; their corrected affected suites then passed 32/32.
Hosted CI subsequently found one stale architecture allowlist: the retained
Fantasy adapter reuses the existing `fantasyWeekKey` formatter to preserve a
snapshot week in its address. The named-import allowlist now explicitly includes
that helper, while default imports and other old-app shell imports remain
forbidden. The failure was reproduced locally before this correction, and all
12 app-view/boundary tests passed afterward. Brand/document QA also passed.

The final full local check then passed: 1,457 Node tests with zero skips,
198 Vitest tests, typecheck and production build. Hosted Node, Persona, Brand
and Windows checks passed too. Linux cloud-browser CI exposed a real 320px
layout defect: its wider fallback font pushed Research beyond the viewport in
six layout checks. The tab grid now reserves each label's intrinsic width with
small horizontal padding, preserving full labels, 16px text and touch targets.
A new browser regression reproduces wider text metrics on any host; it failed
before the CSS change and passed afterward. Token/navigation tests passed 20/20.
All eight affected layout/accessibility cases then passed locally, covering the
six Linux failure paths plus the wider-text regression and four-tab root flow.
Updated light/dark fixture screenshots were inspected; hosted verification must
pass on the new commit before merge.

While those checks were pending, main advanced through PRs #163 and #164. This
created three merge conflicts and prevented GitHub from starting the next PR
checks. Integration preserves both completion entries, the detail-specific Bets
heading with the newer contextual introduction, and both the All weeks return
regression and the recommendation card's new explicit expansion. Exact integrated
source must pass fresh CI before merge.
The integrated four-tab/recommendation browser run passed 13/13; focused
navigation/ranking Node tests passed 25/25 and landing/recommendation component
tests passed 9/9. Brand QA passed. The relative-gap computation runs in the
frontend against the existing authenticated API responses, so no API deployment
is required for the newer recommendation presentation.

PR #161 subsequently merged to main, followed by integration of the NBA closeout.
The two new conflicts preserve both completion entries and the Lines board's new
weekly-research action alongside the four-tab Trends matchup list. The research
sheet registry merges with the four root screens. The combined source requires
fresh PR and merged-main CI; the independent research API release is reconciled
from fresh hosted evidence before this frontend deployment.
The combined Lines/research/four-tab browser suite passed 12/12, including both
themes at 320px, read-only market boundaries, Back, stale replies, account changes
and quote/kickoff expiry. Component checks passed 32/32, navigation and architecture
checks 19/19, and Brand QA passed. No runtime change beyond conflict reconciliation
was needed for this integration.

The broader 278-case local browser run exposed a timing-dependent legacy-link
assertion: generic `#picks` leaves the market unspecified, then the retained
editor may add its selected default to URL metadata. The test now checks the
canonical destination and selected Spread button directly; explicit market links
still require their market metadata. The corrected legacy-link scenario passed
five consecutive runs. No application behavior changed for this correction.

## Required deployment evidence

Merge and deployment are pending at this preparation checkpoint. The final PR
head must pass every required CI job; the exact merged main SHA must then pass
its own push CI. The PR release card will name that SHA and the reviewed readiness
digest before deploy. Fresh preservation snapshots, function permissions,
schedule evidence, signed-out boundaries, deployment identifiers and served-asset
hashes will be recorded here after the protected workflow finishes.

Automated mobile/browser verification does not establish physical iPhone or
Home Screen acceptance. Those checks and the separate native iOS deliverable
remain open.
