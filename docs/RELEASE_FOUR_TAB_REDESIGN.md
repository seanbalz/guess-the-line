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
The cloud handlers, shared server code and migrations are unchanged from deployed
source `368f5d46cd036d74f9dc5c32cf572dd702d320b2`. The new frontend retains the
existing API v27 contracts, independent market gates, authenticated readers,
explicit ticket saves and old-app recovery path. The app-default switch is unchanged.

No database migration or collector change is part of this release. M-10 and both
D-53 migrations remain pending. Readiness must verify their actual hosted status
and provide a fresh migration-history digest before deployment.

Rollback: restore Pages `dcfb977b-c388-4706-b728-d0c11e356228`, retaining API v27
and all stored records. This is a frontend rollback; it does not delete or revert
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
